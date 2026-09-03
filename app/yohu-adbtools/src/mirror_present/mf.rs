//! 进程内 Windows Media Foundation：Annex-B → packed NV12。
//!
//! 直播路径禁止 ffmpeg.exe。硬件 MFT 优先，同步软件兜底；异步 MFT 按事件泵。
//! Codec config 不是画面：只作为 IDR 前缀送入，禁止单独 ProcessInput。

#![cfg(windows)]

use std::collections::VecDeque;
use std::mem::ManuallyDrop;
use std::sync::atomic::{AtomicBool, Ordering};

use windows::core::{Interface, GUID};
use windows::Win32::Foundation::E_FAIL;
use windows::Win32::Graphics::Direct3D11::ID3D11Texture2D;
use windows::Win32::Media::MediaFoundation::{
    MFCreateMediaType, MFCreateMemoryBuffer, MFCreateSample, MFTEnumEx, MFStartup, IMF2DBuffer,
    IMFActivate, IMFDXGIBuffer, IMFDXGIDeviceManager, IMFMediaBuffer, IMFMediaEventGenerator,
    IMFMediaType, IMFSample, IMFTransform, MFMediaType_Video, MFNominalRange_0_255,
    MFSampleExtension_CleanPoint, MFSTARTUP_LITE, MFT_CATEGORY_VIDEO_DECODER, MFT_ENUM_FLAG,
    MFT_ENUM_FLAG_ASYNCMFT, MFT_ENUM_FLAG_HARDWARE, MFT_ENUM_FLAG_LOCALMFT, MFT_ENUM_FLAG_SORTANDFILTER,
    MFT_ENUM_FLAG_SYNCMFT, MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, MFT_MESSAGE_NOTIFY_START_OF_STREAM,
    MFT_MESSAGE_SET_D3D_MANAGER, MFT_OUTPUT_DATA_BUFFER, MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES,
    MFT_OUTPUT_STREAM_PROVIDES_SAMPLES, MFT_REGISTER_TYPE_INFO, MFVideoFormat_H264,
    MFVideoFormat_H264_ES, MFVideoFormat_HEVC, MFVideoFormat_HEVC_ES, MFVideoFormat_NV12,
    MFVideoInterlace_Progressive, MFVideoTransferMatrix_BT709, METransformHaveOutput,
    METransformNeedInput, MF_E_NOTACCEPTING, MF_E_TRANSFORM_NEED_MORE_INPUT,
    MF_E_TRANSFORM_STREAM_CHANGE, MF_EVENT_FLAG_NO_WAIT, MF_MT_FRAME_SIZE, MF_MT_INTERLACE_MODE,
    MF_MT_MAJOR_TYPE, MF_MT_SUBTYPE, MF_MT_VIDEO_NOMINAL_RANGE, MF_MT_YUV_MATRIX, MF_SA_D3D11_AWARE,
    MF_SA_D3D_AWARE, MF_TRANSFORM_ASYNC, MF_TRANSFORM_ASYNC_UNLOCK, MF_VERSION,
};
use windows::Win32::System::Com::{CoInitializeEx, CoTaskMemFree, COINIT_MULTITHREADED};

static STARTED: AtomicBool = AtomicBool::new(false);

pub fn ensure_startup() -> Result<(), String> {
    if STARTED.load(Ordering::SeqCst) {
        return Ok(());
    }
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        MFStartup(MF_VERSION, MFSTARTUP_LITE).map_err(|e| e.to_string())?;
    }
    STARTED.store(true, Ordering::SeqCst);
    Ok(())
}

pub fn hevc_available() -> bool {
    if ensure_startup().is_err() {
        return false;
    }
    !enum_activates(true).is_empty()
}

#[cfg(test)]
fn h264_available() -> bool {
    if ensure_startup().is_err() {
        return false;
    }
    !enum_activates(false).is_empty()
}

const PENDING_CAP: usize = 4;

/// 硬解输出 DXGI 纹理（零拷贝）；软解仍是 packed NV12。
pub enum DecodedPicture {
    Nv12(Vec<u8>),
    Gpu {
        _sample: IMFSample,
        texture: ID3D11Texture2D,
        subresource: u32,
    },
}

pub struct MfDecoder {
    mft: IMFTransform,
    events: Option<IMFMediaEventGenerator>,
    provides_samples: bool,
    output_size: u32,
    pub width: u32,
    pub height: u32,
    pts: i64,
    need_input: bool,
    pending: VecDeque<(Vec<u8>, bool)>,
    d3d: bool,
    _d3d_manager: Option<IMFDXGIDeviceManager>,
}

impl MfDecoder {
    pub fn open(hevc: bool, width: u32, height: u32) -> Result<Self, String> {
        Self::open_with(hevc, width, height, None)
    }

    pub fn open_with(
        hevc: bool,
        width: u32,
        height: u32,
        d3d: Option<&IMFDXGIDeviceManager>,
    ) -> Result<Self, String> {
        ensure_startup()?;
        let width = width.max(2) & !1;
        let height = height.max(2) & !1;
        let activates = enum_activates(hevc);
        if activates.is_empty() {
            return Err(if hevc {
                "本机没有 HEVC 解码器".into()
            } else {
                "本机没有 H.264 解码器".into()
            });
        }
        let mut last_err = String::from("无法配置解码器");
        for activate in activates {
            match configure(activate, hevc, width, height, d3d) {
                Ok(decoder) => return Ok(decoder),
                Err(e) => last_err = e,
            }
        }
        Err(last_err)
    }

    pub fn is_async(&self) -> bool {
        self.events.is_some()
    }

    pub fn uses_d3d(&self) -> bool {
        self.d3d
    }

    pub fn feed(&mut self, annexb: &[u8], keyframe: bool) -> Result<Option<DecodedPicture>, String> {
        if annexb.is_empty() {
            return self.drain();
        }
        if self.events.is_some() {
            queue_pending(&mut self.pending, annexb, keyframe);
            return self.pump_async();
        }
        self.process_input_sync(annexb, keyframe)?;
        self.drain_sync()
    }

    pub fn drain(&mut self) -> Result<Option<DecodedPicture>, String> {
        if self.events.is_some() {
            self.pump_async()
        } else {
            self.drain_sync()
        }
    }

    fn process_input_sync(&mut self, annexb: &[u8], keyframe: bool) -> Result<(), String> {
        match self.submit_input(annexb, keyframe) {
            Ok(()) => Ok(()),
            Err(e) if e.code() == MF_E_NOTACCEPTING => {
                let _ = self.drain_sync()?;
                self.submit_input(annexb, keyframe)
                    .map_err(|e| format!("ProcessInput: {e}"))
            }
            Err(e) => Err(format!("ProcessInput: {e}")),
        }
    }

    fn submit_input(&mut self, annexb: &[u8], keyframe: bool) -> Result<(), windows::core::Error> {
        let sample = input_sample(annexb, keyframe, self.pts)
            .map_err(|e| windows::core::Error::new(E_FAIL, e))?;
        self.pts = self.pts.saturating_add(333_667);
        unsafe { self.mft.ProcessInput(0, &sample, 0) }
    }

    fn drain_sync(&mut self) -> Result<Option<DecodedPicture>, String> {
        let mut latest = None;
        loop {
            match self.process_output() {
                Ok(Some(pic)) => latest = Some(pic),
                Ok(None) => break,
                Err(e) => return Err(e),
            }
        }
        Ok(latest)
    }

    fn pump_async(&mut self) -> Result<Option<DecodedPicture>, String> {
        let mut latest = None;
        loop {
            let mut got_event = false;
            loop {
                let event = {
                    let Some(events) = self.events.as_ref() else {
                        break;
                    };
                    unsafe { events.GetEvent(MF_EVENT_FLAG_NO_WAIT) }
                };
                let Ok(event) = event else { break };
                got_event = true;
                let ty = unsafe { event.GetType() }.unwrap_or(0);
                if ty == METransformNeedInput.0 as u32 {
                    self.need_input = true;
                } else if ty == METransformHaveOutput.0 as u32 {
                    if let Some(pic) = self.process_output()? {
                        latest = Some(pic);
                    }
                }
            }
            let pending_before = self.pending.len();
            if self.need_input {
                self.flush_pending()?;
            }
            if !got_event && self.pending.len() == pending_before {
                break;
            }
        }
        Ok(latest)
    }

    fn flush_pending(&mut self) -> Result<(), String> {
        while self.need_input {
            let Some((data, keyframe)) = self.pending.pop_front() else {
                break;
            };
            match self.submit_input(&data, keyframe) {
                Ok(()) => self.need_input = false,
                Err(e) if e.code() == MF_E_NOTACCEPTING => {
                    self.pending.push_front((data, keyframe));
                    break;
                }
                Err(e) => return Err(format!("ProcessInput: {e}")),
            }
        }
        Ok(())
    }

    fn process_output(&mut self) -> Result<Option<DecodedPicture>, String> {
        loop {
            let sample = if self.provides_samples {
                None
            } else {
                Some(alloc_sample(self.output_size.max(packed_nv12_len(self.width, self.height) as u32))?)
            };
            let mut buffers = [MFT_OUTPUT_DATA_BUFFER {
                dwStreamID: 0,
                pSample: ManuallyDrop::new(sample),
                dwStatus: 0,
                pEvents: ManuallyDrop::new(None),
            }];
            let mut status = 0u32;
            let result = unsafe { self.mft.ProcessOutput(0, &mut buffers, &mut status) };
            let out = unsafe { ManuallyDrop::take(&mut buffers[0].pSample) };
            unsafe { ManuallyDrop::drop(&mut buffers[0].pEvents) };
            match result {
                Ok(()) => {
                    let Some(sample) = out else {
                        return Ok(None);
                    };
                    return take_picture(sample, self.width, self.height, self.d3d).map(Some);
                }
                Err(e) if e.code() == MF_E_TRANSFORM_NEED_MORE_INPUT => return Ok(None),
                Err(e) if e.code() == MF_E_TRANSFORM_STREAM_CHANGE => {
                    renegotiate_nv12(&self.mft, self.width, self.height)?;
                    refresh_output_info(&self.mft, &mut self.provides_samples, &mut self.output_size)?;
                    if let Ok((w, h)) = current_output_size(&self.mft) {
                        self.width = w.max(2) & !1;
                        self.height = h.max(2) & !1;
                    }
                    continue;
                }
                Err(e) => return Err(format!("ProcessOutput: {e}")),
            }
        }
    }
}

fn enum_flags() -> [MFT_ENUM_FLAG; 2] {
    let hw = MFT_ENUM_FLAG(
        MFT_ENUM_FLAG_ASYNCMFT.0
            | MFT_ENUM_FLAG_HARDWARE.0
            | MFT_ENUM_FLAG_SORTANDFILTER.0,
    );
    let sync = MFT_ENUM_FLAG(
        MFT_ENUM_FLAG_SYNCMFT.0 | MFT_ENUM_FLAG_LOCALMFT.0 | MFT_ENUM_FLAG_SORTANDFILTER.0,
    );
    [hw, sync]
}

fn subtypes(hevc: bool) -> [GUID; 2] {
    if hevc {
        [MFVideoFormat_HEVC_ES, MFVideoFormat_HEVC]
    } else {
        [MFVideoFormat_H264_ES, MFVideoFormat_H264]
    }
}

fn enum_activates(hevc: bool) -> Vec<IMFActivate> {
    let mut out = Vec::new();
    for flags in enum_flags() {
        for subtype in subtypes(hevc) {
            collect_activates(flags, subtype, &mut out);
        }
    }
    out
}

fn collect_activates(flags: MFT_ENUM_FLAG, subtype: GUID, out: &mut Vec<IMFActivate>) {
    let info = MFT_REGISTER_TYPE_INFO {
        guidMajorType: MFMediaType_Video,
        guidSubtype: subtype,
    };
    let mut ptr: *mut Option<IMFActivate> = std::ptr::null_mut();
    let mut count = 0u32;
    let ok = unsafe {
        MFTEnumEx(
            MFT_CATEGORY_VIDEO_DECODER,
            flags,
            Some(std::ptr::from_ref(&info)),
            None,
            &mut ptr,
            &mut count,
        )
    };
    if ok.is_err() || ptr.is_null() || count == 0 {
        if !ptr.is_null() {
            unsafe { CoTaskMemFree(Some(ptr.cast())) };
        }
        return;
    }
    for i in 0..count as usize {
        if let Some(activate) = unsafe { (*ptr.add(i)).take() } {
            out.push(activate);
        }
    }
    unsafe { CoTaskMemFree(Some(ptr.cast())) };
}

fn configure(
    activate: IMFActivate,
    hevc: bool,
    width: u32,
    height: u32,
    d3d: Option<&IMFDXGIDeviceManager>,
) -> Result<MfDecoder, String> {
    let mft: IMFTransform = unsafe { activate.ActivateObject() }.map_err(|e| e.to_string())?;
    let events = unlock_async(&mft)?;
    let d3d_ok = match d3d {
        Some(mgr) => match bind_d3d(&mft, mgr) {
            Ok(()) => true,
            Err(e) => {
                tracing::debug!(error = %e, "MFT 未绑定 D3D11");
                false
            }
        },
        None => false,
    };
    set_input_type(&mft, hevc, width, height)?;
    set_output_nv12(&mft, width, height)?;
    unsafe {
        mft.ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)
            .map_err(|e| e.to_string())?;
        mft.ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)
            .map_err(|e| e.to_string())?;
    }
    let mut provides_samples = false;
    let mut output_size = 0;
    refresh_output_info(&mft, &mut provides_samples, &mut output_size)?;
    let mut decoder = MfDecoder {
        mft,
        events,
        provides_samples,
        output_size,
        width,
        height,
        pts: 0,
        need_input: false,
        pending: VecDeque::with_capacity(PENDING_CAP),
        d3d: d3d_ok,
        _d3d_manager: if d3d_ok {
            d3d.cloned()
        } else {
            None
        },
    };
    if decoder.events.is_some() {
        let _ = decoder.pump_async()?;
    }
    Ok(decoder)
}

fn bind_d3d(mft: &IMFTransform, manager: &IMFDXGIDeviceManager) -> Result<(), String> {
    let attrs = unsafe { mft.GetAttributes() }.map_err(|e| e.to_string())?;
    let d3d11 = unsafe { attrs.GetUINT32(&MF_SA_D3D11_AWARE) }.unwrap_or(0) != 0;
    let d3d9 = unsafe { attrs.GetUINT32(&MF_SA_D3D_AWARE) }.unwrap_or(0) != 0;
    if !d3d11 && !d3d9 {
        return Err("MFT 不支持 D3D".into());
    }
    let raw = windows::core::Interface::as_raw(manager) as usize;
    unsafe {
        mft.ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, raw)
            .map_err(|e| format!("SET_D3D_MANAGER: {e}"))?;
    }
    Ok(())
}

fn queue_pending(pending: &mut VecDeque<(Vec<u8>, bool)>, annexb: &[u8], keyframe: bool) {
    if pending.len() >= PENDING_CAP {
        if let Some(i) = pending.iter().position(|(_, key)| !*key) {
            pending.remove(i);
        } else {
            pending.pop_front();
        }
    }
    pending.push_back((annexb.to_vec(), keyframe));
}

fn unlock_async(mft: &IMFTransform) -> Result<Option<IMFMediaEventGenerator>, String> {
    let Ok(attrs) = (unsafe { mft.GetAttributes() }) else {
        return Ok(None);
    };
    let async_mft = unsafe { attrs.GetUINT32(&MF_TRANSFORM_ASYNC) }.unwrap_or(0) != 0;
    if !async_mft {
        return Ok(None);
    }
    unsafe {
        attrs
            .SetUINT32(&MF_TRANSFORM_ASYNC_UNLOCK, 1)
            .map_err(|e| e.to_string())?;
    }
    mft.cast().map(Some).map_err(|e| e.to_string())
}

fn set_input_type(mft: &IMFTransform, hevc: bool, width: u32, height: u32) -> Result<(), String> {
    for subtype in subtypes(hevc) {
        if let Ok(ty) = make_video_type(subtype, width, height) {
            if unsafe { mft.SetInputType(0, &ty, 0) }.is_ok() {
                return Ok(());
            }
        }
    }
    for i in 0..32u32 {
        let Ok(ty) = (unsafe { mft.GetInputAvailableType(0, i) }) else {
            break;
        };
        let Ok(sub) = (unsafe { ty.GetGUID(&MF_MT_SUBTYPE) }) else {
            continue;
        };
        if subtypes(hevc).contains(&sub) {
            apply_frame_size(&ty, width, height)?;
            if unsafe { mft.SetInputType(0, &ty, 0) }.is_ok() {
                return Ok(());
            }
        }
    }
    Err("解码器不接受 Annex-B 输入".into())
}

fn set_output_nv12(mft: &IMFTransform, width: u32, height: u32) -> Result<(), String> {
    if let Ok(ty) = make_video_type(MFVideoFormat_NV12, width, height) {
        if unsafe { mft.SetOutputType(0, &ty, 0) }.is_ok() {
            return Ok(());
        }
    }
    renegotiate_nv12(mft, width, height)
}

fn renegotiate_nv12(mft: &IMFTransform, width: u32, height: u32) -> Result<(), String> {
    for i in 0..32u32 {
        let Ok(ty) = (unsafe { mft.GetOutputAvailableType(0, i) }) else {
            break;
        };
        let Ok(sub) = (unsafe { ty.GetGUID(&MF_MT_SUBTYPE) }) else {
            continue;
        };
        if sub != MFVideoFormat_NV12 {
            continue;
        }
        apply_frame_size(&ty, width, height)?;
        unsafe {
            mft.SetOutputType(0, &ty, 0)
                .map_err(|e| format!("SetOutputType NV12: {e}"))?;
        }
        return Ok(());
    }
    Err("解码器不输出 NV12".into())
}

fn refresh_output_info(
    mft: &IMFTransform,
    provides: &mut bool,
    size: &mut u32,
) -> Result<(), String> {
    let info = unsafe { mft.GetOutputStreamInfo(0) }.map_err(|e| e.to_string())?;
    *provides = info.dwFlags & MFT_OUTPUT_STREAM_PROVIDES_SAMPLES.0 as u32 != 0
        || info.dwFlags & MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES.0 as u32 != 0;
    *size = info.cbSize;
    Ok(())
}

fn make_video_type(subtype: GUID, width: u32, height: u32) -> Result<IMFMediaType, String> {
    let ty = unsafe { MFCreateMediaType() }.map_err(|e| e.to_string())?;
    unsafe {
        ty.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)
            .map_err(|e| e.to_string())?;
        ty.SetGUID(&MF_MT_SUBTYPE, &subtype)
            .map_err(|e| e.to_string())?;
        ty.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)
            .map_err(|e| e.to_string())?;
        ty.SetUINT32(&MF_MT_VIDEO_NOMINAL_RANGE, MFNominalRange_0_255.0 as u32)
            .map_err(|e| e.to_string())?;
        ty.SetUINT32(&MF_MT_YUV_MATRIX, MFVideoTransferMatrix_BT709.0 as u32)
            .map_err(|e| e.to_string())?;
    }
    apply_frame_size(&ty, width, height)?;
    Ok(ty)
}

fn apply_frame_size(ty: &IMFMediaType, width: u32, height: u32) -> Result<(), String> {
    let packed = ((width as u64) << 32) | height as u64;
    unsafe {
        ty.SetUINT64(&MF_MT_FRAME_SIZE, packed)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn input_sample(bytes: &[u8], keyframe: bool, pts: i64) -> Result<IMFSample, String> {
    let buffer = unsafe { MFCreateMemoryBuffer(bytes.len() as u32) }.map_err(|e| e.to_string())?;
    unsafe {
        let mut ptr = std::ptr::null_mut();
        buffer
            .Lock(&mut ptr, None, None)
            .map_err(|e| e.to_string())?;
        if !ptr.is_null() {
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
        }
        let _ = buffer.Unlock();
        buffer
            .SetCurrentLength(bytes.len() as u32)
            .map_err(|e| e.to_string())?;
    }
    let sample = unsafe { MFCreateSample() }.map_err(|e| e.to_string())?;
    unsafe {
        sample.AddBuffer(&buffer).map_err(|e| e.to_string())?;
        sample.SetSampleTime(pts).map_err(|e| e.to_string())?;
        if keyframe {
            sample
                .SetUINT32(&MFSampleExtension_CleanPoint, 1)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(sample)
}

fn alloc_sample(size: u32) -> Result<IMFSample, String> {
    let buffer = unsafe { MFCreateMemoryBuffer(size.max(1)) }.map_err(|e| e.to_string())?;
    let sample = unsafe { MFCreateSample() }.map_err(|e| e.to_string())?;
    unsafe {
        sample.AddBuffer(&buffer).map_err(|e| e.to_string())?;
    }
    Ok(sample)
}

fn packed_nv12_len(width: u32, height: u32) -> usize {
    width as usize * height as usize * 3 / 2
}

fn current_output_size(mft: &IMFTransform) -> Result<(u32, u32), String> {
    let ty = unsafe { mft.GetOutputCurrentType(0) }.map_err(|e| e.to_string())?;
    let packed = unsafe { ty.GetUINT64(&MF_MT_FRAME_SIZE) }.map_err(|e| e.to_string())?;
    let width = (packed >> 32) as u32;
    let height = packed as u32;
    if width == 0 || height == 0 {
        return Err("输出帧尺寸为 0".into());
    }
    Ok((width, height))
}

fn take_picture(
    sample: IMFSample,
    width: u32,
    height: u32,
    d3d: bool,
) -> Result<DecodedPicture, String> {
    if d3d {
        if let Ok(pic) = gpu_picture(sample.clone()) {
            return Ok(pic);
        }
    }
    copy_nv12(&sample, width, height).map(DecodedPicture::Nv12)
}

fn gpu_picture(sample: IMFSample) -> Result<DecodedPicture, String> {
    let buffer = unsafe { sample.GetBufferByIndex(0) }.map_err(|e| e.to_string())?;
    let dxgi: IMFDXGIBuffer = buffer.cast().map_err(|e| e.to_string())?;
    let mut raw = std::ptr::null_mut();
    unsafe {
        dxgi.GetResource(&ID3D11Texture2D::IID, &mut raw)
            .map_err(|e| e.to_string())?;
    }
    if raw.is_null() {
        return Err("空 DXGI 纹理".into());
    }
    let texture = unsafe { ID3D11Texture2D::from_raw(raw) };
    let subresource = unsafe { dxgi.GetSubresourceIndex() }.unwrap_or(0);
    Ok(DecodedPicture::Gpu {
        _sample: sample,
        texture,
        subresource,
    })
}

fn copy_nv12(sample: &IMFSample, width: u32, height: u32) -> Result<Vec<u8>, String> {
    let buffer = unsafe { sample.ConvertToContiguousBuffer() }.map_err(|e| e.to_string())?;
    if let Ok(two_d) = buffer.cast::<IMF2DBuffer>() {
        if let Ok(packed) = copy_nv12_2d(&two_d, width, height) {
            return Ok(packed);
        }
    }
    copy_nv12_1d(&buffer, width, height)
}

fn copy_nv12_2d(buf: &IMF2DBuffer, width: u32, height: u32) -> Result<Vec<u8>, String> {
    let mut scan0 = std::ptr::null_mut();
    let mut pitch = 0i32;
    unsafe {
        buf.Lock2D(&mut scan0, &mut pitch)
            .map_err(|e| e.to_string())?;
    }
    let result = pack_nv12_from_planes(scan0, pitch, width, height);
    unsafe {
        let _ = buf.Unlock2D();
    }
    result
}

fn copy_nv12_1d(buf: &IMFMediaBuffer, width: u32, height: u32) -> Result<Vec<u8>, String> {
    let mut ptr = std::ptr::null_mut();
    let mut len = 0u32;
    unsafe {
        buf.Lock(&mut ptr, None, Some(&mut len))
            .map_err(|e| e.to_string())?;
    }
    let packed = packed_nv12_len(width, height);
    let result = if ptr.is_null() {
        Err("空 NV12 缓冲".into())
    } else if len as usize == packed {
        Ok(unsafe { std::slice::from_raw_parts(ptr, packed) }.to_vec())
    } else if len as usize > packed
        && height > 0
        && ((len as usize) * 2).is_multiple_of(height as usize * 3)
    {
        let pitch = ((len as usize) * 2 / (height as usize * 3)) as i32;
        pack_nv12_from_planes(ptr, pitch, width, height)
    } else {
        Err(format!("NV12 长度不足 {} < {packed}", len))
    };
    unsafe {
        let _ = buf.Unlock();
    }
    result
}

fn pack_nv12_from_planes(
    scan0: *mut u8,
    pitch: i32,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    if scan0.is_null() || pitch == 0 {
        return Err("NV12 Lock2D 无效".into());
    }
    let width = width as usize;
    let height = height as usize;
    let abs_pitch = pitch.unsigned_abs() as usize;
    if abs_pitch < width {
        return Err(format!("NV12 stride {abs_pitch} < width {width}"));
    }
    let mut dest = vec![0u8; width * height * 3 / 2];
    unsafe {
        for y in 0..height {
            let src = if pitch > 0 {
                scan0.add(y * abs_pitch)
            } else {
                scan0.sub(y * abs_pitch)
            };
            let dst = dest.as_mut_ptr().add(y * width);
            std::ptr::copy_nonoverlapping(src, dst, width);
        }
        let uv0 = if pitch > 0 {
            scan0.add(height * abs_pitch)
        } else {
            scan0.sub(height * abs_pitch)
        };
        let uv_dst = dest.as_mut_ptr().add(width * height);
        for y in 0..height / 2 {
            let src = if pitch > 0 {
                uv0.add(y * abs_pitch)
            } else {
                uv0.sub(y * abs_pitch)
            };
            let dst = uv_dst.add(y * width);
            std::ptr::copy_nonoverlapping(src, dst, width);
        }
    }
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn h264_mft_exists_on_this_machine() {
        assert!(
            h264_available(),
            "Windows 应提供 H.264 Media Foundation 解码器"
        );
    }

    #[test]
    fn packs_nv12_with_padded_stride() {
        let width = 8u32;
        let height = 4u32;
        let pitch = 16i32;
        let mut src = vec![0u8; pitch as usize * height as usize * 3 / 2];
        for y in 0..height as usize {
            for x in 0..width as usize {
                src[y * pitch as usize + x] = (y * 10 + x) as u8;
            }
        }
        let uv0 = pitch as usize * height as usize;
        for y in 0..height as usize / 2 {
            for x in 0..width as usize {
                src[uv0 + y * pitch as usize + x] = 128;
            }
        }
        let packed = pack_nv12_from_planes(src.as_mut_ptr(), pitch, width, height).unwrap();
        assert_eq!(packed.len(), 8 * 4 * 3 / 2);
        assert_eq!(&packed[0..8], &[0, 1, 2, 3, 4, 5, 6, 7]);
        assert_eq!(&packed[8..16], &[10, 11, 12, 13, 14, 15, 16, 17]);
        assert!(packed[32..].iter().all(|&b| b == 128));
    }
}
