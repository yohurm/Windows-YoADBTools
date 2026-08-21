//! 虚拟文件 OLE 源：FILEDESCRIPTOR + FILECONTENTS，GetData 才 adb pull；仅 Copy。

#![allow(non_snake_case)]

use std::collections::HashMap;
use std::mem::ManuallyDrop;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, Once};

use tokio_util::sync::CancellationToken;
use windows::core::{w, Error, Result as WinResult, HSTRING, PCWSTR};
use windows::Win32::Foundation::{
    GlobalFree, DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS, DV_E_FORMATETC,
    DV_E_LINDEX, DV_E_TYMED, E_FAIL, E_NOTIMPL, HGLOBAL, OLE_E_ADVISENOTSUPPORTED, S_OK,
};
use windows::Win32::Storage::FileSystem::{FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL};
use windows::Win32::System::Com::{
    IAdviseSink, IDataObject, IDataObject_Impl, IEnumFORMATETC, IEnumSTATDATA, IStream,
    DATADIR_GET, DVASPECT_CONTENT, FORMATETC, STGMEDIUM, STGMEDIUM_0, STGM_READ,
    STGM_SHARE_DENY_NONE, TYMED_HGLOBAL, TYMED_ISTREAM,
};
use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT,
};
use windows::Win32::System::Ole::{
    DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, ReleaseStgMedium, DROPEFFECT,
    DROPEFFECT_COPY,
};
use windows::Win32::System::SystemServices::{MK_LBUTTON, MODIFIERKEYS_FLAGS};
use windows::Win32::UI::Shell::{
    IDataObjectAsyncCapability, IDataObjectAsyncCapability_Impl, SHCreateStdEnumFmtEtc,
    SHCreateStreamOnFileEx, FD_ATTRIBUTES, FD_FILESIZE, FD_PROGRESSUI, FD_UNICODE, FILEDESCRIPTORW,
};
use windows_core::{implement, BOOL};

use yohu_files::{TransferSpec, TreeEntry};
use yohu_protocol::{Direction, AppError, ErrorCode};

use super::DragPayload;
use crate::commands::err_code;

fn clip(name: PCWSTR) -> u16 {
    unsafe { RegisterClipboardFormatW(name) as u16 }
}

fn fmt_group() -> u16 {
    clip(w!("FileGroupDescriptorW"))
}

fn fmt_contents() -> u16 {
    clip(w!("FileContents"))
}

fn fmt_drop_effect() -> u16 {
    clip(w!("Preferred DropEffect"))
}

struct Inner {
    items: Vec<TreeEntry>,
    pulled: HashMap<i32, PathBuf>,
    in_operation: bool,
}

#[implement(IDataObject, IDataObjectAsyncCapability)]
struct VirtualFiles {
    inner: Mutex<Inner>,
    payload: DragPayload,
    /// QueryContinueDrag 已确认松开（DROP）。此前拒绝 FileContents，避免 hover 就 pull。
    dropped: Arc<AtomicBool>,
}

impl Drop for VirtualFiles {
    fn drop(&mut self) {
        let dir = self.payload.session_dir.clone();
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
    }
}

#[implement(IDropSource)]
struct CopySource {
    seen_press: Arc<AtomicBool>,
    dropped: Arc<AtomicBool>,
}

impl IDropSource_Impl for CopySource_Impl {
    fn QueryContinueDrag(
        &self,
        fescapepressed: BOOL,
        grfkeystate: MODIFIERKEYS_FLAGS,
    ) -> windows_core::HRESULT {
        if fescapepressed.as_bool() {
            return DRAGDROP_S_CANCEL;
        }
        if (grfkeystate & MK_LBUTTON).0 != 0 {
            self.seen_press.store(true, Ordering::SeqCst);
            return S_OK;
        }
        // DoDragDrop 若在 err_internal/list_tree 之后才启动，此时键可能已松开：必须 CANCEL，不能对当前窗口 DROP。
        if !self.seen_press.load(Ordering::SeqCst) {
            return DRAGDROP_S_CANCEL;
        }
        self.dropped.store(true, Ordering::SeqCst);
        DRAGDROP_S_DROP
    }

    fn GiveFeedback(&self, _dweffect: DROPEFFECT) -> windows_core::HRESULT {
        DRAGDROP_S_USEDEFAULTCURSORS
    }
}

impl VirtualFiles {
    fn query_format(fmt: &FORMATETC) -> windows_core::HRESULT {
        if fmt.dwAspect != DVASPECT_CONTENT.0 {
            return DV_E_FORMATETC;
        }
        if fmt.cfFormat == fmt_group() {
            return if (fmt.tymed & TYMED_HGLOBAL.0 as u32) != 0 {
                S_OK
            } else {
                DV_E_TYMED
            };
        }
        if fmt.cfFormat == fmt_contents() {
            return if (fmt.tymed & TYMED_ISTREAM.0 as u32) != 0 {
                S_OK
            } else {
                DV_E_TYMED
            };
        }
        if fmt.cfFormat == fmt_drop_effect() {
            return if (fmt.tymed & TYMED_HGLOBAL.0 as u32) != 0 {
                S_OK
            } else {
                DV_E_TYMED
            };
        }
        DV_E_FORMATETC
    }

    fn descriptor_medium(&self) -> WinResult<STGMEDIUM> {
        let inner = self.inner.lock().expect("dnd lock");
        let n = inner.items.len();
        let desc_size = std::mem::size_of::<FILEDESCRIPTORW>();
        let bytes = 4 + n * desc_size;
        unsafe {
            let handle = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes)?;
            let ptr = GlobalLock(handle) as *mut u8;
            if ptr.is_null() {
                let _ = GlobalFree(Some(handle));
                return Err(Error::from_hresult(E_FAIL));
            }
            (ptr as *mut u32).write(n as u32);
            for (i, item) in inner.items.iter().enumerate() {
                let dest = ptr.add(4 + i * desc_size) as *mut FILEDESCRIPTORW;
                dest.write(file_descriptor(item));
            }
            let _ = GlobalUnlock(handle);
            Ok(hglobal_medium(handle))
        }
    }

    fn drop_effect_medium() -> WinResult<STGMEDIUM> {
        let effect: u32 = DROPEFFECT_COPY.0;
        unsafe {
            let handle = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, 4)?;
            let ptr = GlobalLock(handle) as *mut u32;
            if ptr.is_null() {
                let _ = GlobalFree(Some(handle));
                return Err(Error::from_hresult(E_FAIL));
            }
            ptr.write(effect);
            let _ = GlobalUnlock(handle);
            Ok(hglobal_medium(handle))
        }
    }

    fn contents_medium(&self, lindex: i32) -> WinResult<STGMEDIUM> {
        let in_op = self.inner.lock().expect("dnd lock").in_operation;
        let dropped = self.dropped.load(Ordering::SeqCst);
        if !in_op && !dropped {
            return Err(Error::from_hresult(DV_E_FORMATETC));
        }
        let path = self.ensure_pulled(lindex)?;
        unsafe {
            let stream: IStream = SHCreateStreamOnFileEx(
                &HSTRING::from(path.to_string_lossy().as_ref()),
                (STGM_READ | STGM_SHARE_DENY_NONE).0,
                0,
                false,
                None,
            )?;
            Ok(STGMEDIUM {
                tymed: TYMED_ISTREAM.0 as u32,
                u: STGMEDIUM_0 {
                    pstm: ManuallyDrop::new(Some(stream)),
                },
                pUnkForRelease: ManuallyDrop::new(None),
            })
        }
    }

    fn ensure_pulled(&self, lindex: i32) -> WinResult<PathBuf> {
        {
            let inner = self.inner.lock().expect("dnd lock");
            if lindex < 0 || lindex as usize >= inner.items.len() {
                return Err(Error::from_hresult(DV_E_LINDEX));
            }
            if inner.items[lindex as usize].is_dir {
                return Err(Error::from_hresult(DV_E_LINDEX));
            }
            if let Some(path) = inner.pulled.get(&lindex) {
                return Ok(path.clone());
            }
        }
        let item = {
            let inner = self.inner.lock().expect("dnd lock");
            inner.items[lindex as usize].clone()
        };
        let local = self
            .payload
            .session_dir
            .join(item.relative.replace('\\', std::path::MAIN_SEPARATOR_STR));
        if let Some(parent) = local.parent() {
            std::fs::create_dir_all(parent).map_err(|e| Error::new(E_FAIL, e.to_string()))?;
        }
        let id = self.payload.transfer_next.fetch_add(1, Ordering::Relaxed) + 1;
        let cancel = CancellationToken::new();
        self.payload
            .transfer_cancels
            .lock()
            .expect("transfer lock")
            .insert(id, cancel.clone());
        let task_id = self.payload.tasks.register(
            format!("拖出: {}", item.relative),
            format!("{} → {}", item.remote, local.display()),
        );
        let spec = TransferSpec {
            id,
            serial: self.payload.serial.clone(),
            direction: Direction::Pull,
            local: local.to_string_lossy().into_owned(),
            remote: item.remote.clone(),
        };
        let run = self.payload.rt.block_on(self.payload.transfers.run(
            spec,
            cancel,
            self.payload.event_tx.clone(),
        ));
        self.payload
            .transfer_cancels
            .lock()
            .expect("transfer lock")
            .remove(&id);
        self.payload.tasks.finish(task_id);
        run.map_err(|e| Error::new(E_FAIL, e.to_string()))?;
        self.inner
            .lock()
            .expect("dnd lock")
            .pulled
            .insert(lindex, local.clone());
        Ok(local)
    }
}

fn hglobal_medium(handle: HGLOBAL) -> STGMEDIUM {
    STGMEDIUM {
        tymed: TYMED_HGLOBAL.0 as u32,
        u: STGMEDIUM_0 { hGlobal: handle },
        pUnkForRelease: ManuallyDrop::new(None),
    }
}

fn file_descriptor(item: &TreeEntry) -> FILEDESCRIPTORW {
    let mut fd = FILEDESCRIPTORW {
        dwFlags: (FD_ATTRIBUTES.0 | FD_FILESIZE.0 | FD_PROGRESSUI.0 | FD_UNICODE.0) as u32,
        dwFileAttributes: if item.is_dir {
            FILE_ATTRIBUTE_DIRECTORY.0
        } else {
            FILE_ATTRIBUTE_NORMAL.0
        },
        nFileSizeLow: (item.size & 0xFFFF_FFFF) as u32,
        nFileSizeHigh: (item.size >> 32) as u32,
        ..Default::default()
    };
    let mut name = [0u16; 260];
    for (dst, src) in name.iter_mut().zip(item.relative.encode_utf16()) {
        *dst = src;
    }
    unsafe {
        std::ptr::copy_nonoverlapping(
            name.as_ptr(),
            std::ptr::addr_of_mut!(fd.cFileName).cast(),
            260,
        );
    }
    fd
}

impl IDataObject_Impl for VirtualFiles_Impl {
    fn GetData(&self, pformatetcin: *const FORMATETC) -> WinResult<STGMEDIUM> {
        let fmt =
            unsafe { pformatetcin.as_ref() }.ok_or_else(|| Error::from_hresult(DV_E_FORMATETC))?;
        if VirtualFiles::query_format(fmt) != S_OK {
            return Err(Error::from_hresult(DV_E_FORMATETC));
        }
        if fmt.cfFormat == fmt_group() {
            return self.descriptor_medium();
        }
        if fmt.cfFormat == fmt_drop_effect() {
            return VirtualFiles::drop_effect_medium();
        }
        if fmt.cfFormat == fmt_contents() {
            return self.contents_medium(fmt.lindex);
        }
        Err(Error::from_hresult(DV_E_FORMATETC))
    }

    fn GetDataHere(
        &self,
        _pformatetc: *const FORMATETC,
        _pmedium: *mut STGMEDIUM,
    ) -> WinResult<()> {
        Err(Error::from_hresult(E_NOTIMPL))
    }

    fn QueryGetData(&self, pformatetc: *const FORMATETC) -> windows_core::HRESULT {
        match unsafe { pformatetc.as_ref() } {
            Some(fmt) => VirtualFiles::query_format(fmt),
            None => DV_E_FORMATETC,
        }
    }

    fn GetCanonicalFormatEtc(
        &self,
        _pformatectin: *const FORMATETC,
        pformatetcout: *mut FORMATETC,
    ) -> windows_core::HRESULT {
        if !pformatetcout.is_null() {
            unsafe { (*pformatetcout).ptd = std::ptr::null_mut() };
        }
        E_NOTIMPL
    }

    fn SetData(
        &self,
        _pformatetc: *const FORMATETC,
        pmedium: *const STGMEDIUM,
        frelease: BOOL,
    ) -> WinResult<()> {
        if frelease.as_bool() && !pmedium.is_null() {
            unsafe { ReleaseStgMedium(pmedium as *mut STGMEDIUM) };
        }
        Ok(())
    }

    fn EnumFormatEtc(&self, dwdirection: u32) -> WinResult<IEnumFORMATETC> {
        if dwdirection != DATADIR_GET.0 as u32 {
            return Err(Error::from_hresult(E_NOTIMPL));
        }
        let formats = [
            FORMATETC {
                cfFormat: fmt_drop_effect(),
                ptd: std::ptr::null_mut(),
                dwAspect: DVASPECT_CONTENT.0,
                lindex: -1,
                tymed: TYMED_HGLOBAL.0 as u32,
            },
            FORMATETC {
                cfFormat: fmt_group(),
                ptd: std::ptr::null_mut(),
                dwAspect: DVASPECT_CONTENT.0,
                lindex: -1,
                tymed: TYMED_HGLOBAL.0 as u32,
            },
            FORMATETC {
                cfFormat: fmt_contents(),
                ptd: std::ptr::null_mut(),
                dwAspect: DVASPECT_CONTENT.0,
                lindex: -1,
                tymed: TYMED_ISTREAM.0 as u32,
            },
        ];
        unsafe { SHCreateStdEnumFmtEtc(&formats) }
    }

    fn DAdvise(
        &self,
        _pformatetc: *const FORMATETC,
        _advf: u32,
        _padvsink: windows::core::Ref<'_, IAdviseSink>,
    ) -> WinResult<u32> {
        Err(Error::from_hresult(OLE_E_ADVISENOTSUPPORTED))
    }

    fn DUnadvise(&self, _dwconnection: u32) -> WinResult<()> {
        Err(Error::from_hresult(OLE_E_ADVISENOTSUPPORTED))
    }

    fn EnumDAdvise(&self) -> WinResult<IEnumSTATDATA> {
        Err(Error::from_hresult(OLE_E_ADVISENOTSUPPORTED))
    }
}

impl IDataObjectAsyncCapability_Impl for VirtualFiles_Impl {
    fn SetAsyncMode(&self, _fdoopasync: BOOL) -> WinResult<()> {
        Ok(())
    }

    fn GetAsyncMode(&self) -> WinResult<BOOL> {
        Ok(BOOL::from(true))
    }

    fn StartOperation(
        &self,
        _pbcreserved: windows::core::Ref<'_, windows::Win32::System::Com::IBindCtx>,
    ) -> WinResult<()> {
        self.inner.lock().expect("dnd lock").in_operation = true;
        Ok(())
    }

    fn InOperation(&self) -> WinResult<BOOL> {
        Ok(BOOL::from(
            self.inner.lock().expect("dnd lock").in_operation,
        ))
    }

    fn EndOperation(
        &self,
        _hresult: windows_core::HRESULT,
        _pbcreserved: windows::core::Ref<'_, windows::Win32::System::Com::IBindCtx>,
        _dweffects: u32,
    ) -> WinResult<()> {
        let mut inner = self.inner.lock().expect("dnd lock");
        inner.in_operation = false;
        Ok(())
    }
}

pub(super) fn do_drag_drop(payload: DragPayload) -> Result<(), AppError> {
    static OLE_INIT: Once = Once::new();
    OLE_INIT.call_once(|| {
        let _ = unsafe { OleInitialize(None) };
    });
    let items = payload.items.clone();
    let dropped = Arc::new(AtomicBool::new(false));
    let seen_press = Arc::new(AtomicBool::new(false));
    let data_obj = VirtualFiles {
        inner: Mutex::new(Inner {
            items,
            pulled: HashMap::new(),
            in_operation: false,
        }),
        payload,
        dropped: Arc::clone(&dropped),
    };
    let data: IDataObject = data_obj.into();
    let source: IDropSource = CopySource {
        seen_press,
        dropped,
    }
    .into();
    let mut effect = DROPEFFECT::default();
    let hr = unsafe { DoDragDrop(&data, &source, DROPEFFECT_COPY, &mut effect) };
    if hr == DRAGDROP_S_DROP || hr == DRAGDROP_S_CANCEL || hr == S_OK {
        Ok(())
    } else {
        Err(err_code(
            ErrorCode::Internal,
            format!("DoDragDrop 失败: {hr:?}"),
        ))
    }
}
