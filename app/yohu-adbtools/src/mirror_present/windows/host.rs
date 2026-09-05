//! HWND 宿主：GPU + [`Stage`] + 输入。不持有解码管道。
//!
//! 解码寿命在线程局部 [`super::decode::DecodeBind`]；本结构跟窗口可见性走。

#![cfg(windows)]

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::sync::mpsc as tokio_mpsc;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Media::MediaFoundation::IMFDXGIDeviceManager;
use windows::Win32::UI::WindowsAndMessaging::{
    GetClientRect, GetWindowLongPtrW, SetWindowLongPtrW, ShowWindow, GWLP_USERDATA,
    SW_SHOWNOACTIVATE, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_RBUTTONDOWN, WM_RBUTTONUP,
};
use yohu_mirror::MirrorService;
use yohu_protocol::{
    AppEvent, MirrorControlMessage, MirrorLayout, MirrorStageMode, MIRROR_MIN_LAYOUT_PX,
};

use super::follow::GeomHost;
use super::gpu::Gpu;
use super::mf::DecodedPicture;
use crate::mirror_present::scale::map_client_to_video;
use crate::mirror_present::stage::Stage;

const TOUCH_DOWN: u8 = 0;
const TOUCH_UP: u8 = 1;
const TOUCH_MOVE: u8 = 2;

pub struct Host {
    pub stage: Stage,
    gpu: Option<Gpu>,
    pressing: bool,
    painted: u32,
    fps_at: Instant,
    skip_logged: Option<(bool, u32, u32)>,
    present_err_logged: bool,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    geom: Arc<GeomHost>,
}

impl Host {
    pub fn new(
        serial: String,
        gpu: Gpu,
        mirror: Arc<MirrorService>,
        event_tx: tokio_mpsc::Sender<AppEvent>,
        geom: Arc<GeomHost>,
    ) -> Self {
        Self {
            stage: Stage::new(serial),
            gpu: Some(gpu),
            pressing: false,
            painted: 0,
            fps_at: Instant::now(),
            skip_logged: None,
            present_err_logged: false,
            mirror,
            event_tx,
            geom,
        }
    }

    pub fn dxgi_manager(&self) -> Option<IMFDXGIDeviceManager> {
        self.gpu.as_ref().and_then(|g| g.dxgi_manager())
    }

    pub fn apply_layout(&mut self, hwnd: HWND, layout: &MirrorLayout) {
        let prev = self.stage.serial.clone();
        self.stage.apply_layout(layout);
        if self.stage.serial != prev {
            self.geom.unregister(&prev);
            self.geom.register(&self.stage.serial, hwnd.0 as isize);
        }
        tracing::info!(
            serial = %self.stage.serial,
            x = layout.x,
            y = layout.y,
            w = layout.width,
            h = layout.height,
            visible = layout.visible,
            dpr = layout.dpr,
            fullscreen = layout.fullscreen,
            paused = layout.paused,
            bound = self.stage.bound(),
            video_w = self.stage.video_size().0,
            video_h = self.stage.video_size().1,
            "投屏可用区已交给几何宿主"
        );
        self.place_occupancy();
    }

    pub fn bind(&mut self, hwnd: HWND, serial: String, generation: u64) {
        if self.stage.serial != serial {
            self.geom.unregister(&self.stage.serial);
            self.geom.register(&serial, hwnd.0 as isize);
        }
        self.stage.bind(serial, generation);
        self.present_err_logged = false;
        self.painted = 0;
        tracing::info!(
            serial = %self.stage.serial,
            generation,
            "投屏解码管道已绑定"
        );
        self.place_occupancy();
    }

    pub fn unbind(&mut self, target: &str) -> bool {
        if !target.is_empty() && self.stage.serial != target {
            return false;
        }
        let serial = self.stage.serial.clone();
        self.stage.unbind();
        tracing::info!(serial = %serial, "投屏解码管道已解开，舞台改画 chrome");
        self.place_occupancy();
        true
    }

    pub fn adopt_encoded_size(&mut self, width: u32, height: u32) {
        if !self.stage.bound() {
            return;
        }
        if self.stage.set_video_size(width, height) {
            tracing::info!(
                serial = %self.stage.serial,
                width,
                height,
                "投屏在解码前记下编码尺寸"
            );
            self.place_occupancy();
        }
    }

    pub fn sync_host_size(&mut self, hwnd: HWND) {
        let mut rc = RECT::default();
        unsafe {
            if GetClientRect(hwnd, &mut rc).is_err() {
                return;
            }
        }
        let w = (rc.right - rc.left).max(0) as u32;
        let h = (rc.bottom - rc.top).max(0) as u32;
        if !self.stage.set_host_size(w, h) {
            return;
        }
        {
            let Some(gpu) = self.gpu.as_mut() else {
                return;
            };
            if w < MIRROR_MIN_LAYOUT_PX || h < MIRROR_MIN_LAYOUT_PX {
                return;
            }
            if !gpu.matches_host(w, h) {
                if let Err(e) = gpu.resize(w, h) {
                    tracing::error!(error = %e, w, h, "投屏 swapchain resize 失败");
                    return;
                }
            }
        }
        self.clip_occupancy(false);
        if !self.stage.shows_video() {
            return;
        }
        let dest = self.stage.dest();
        let letterbox = self.stage.letterbox_argb();
        if let Some(gpu) = self.gpu.as_mut() {
            gpu.set_letterbox_argb(letterbox);
            if let Err(e) = gpu.replay_last(dest) {
                tracing::debug!(error = %e, "投屏 resize 后重画上一帧失败");
            }
        }
    }

    pub fn screenshot(&mut self, path: &str) -> Result<(), String> {
        let (w, h, bgra) = self
            .gpu
            .as_mut()
            .ok_or_else(|| "尚无画面".to_string())?
            .screenshot_bgra()
            .map_err(|e| e.to_string())?;
        let mut rgba = vec![0u8; bgra.len()];
        for (i, chunk) in bgra.chunks_exact(4).enumerate() {
            rgba[i * 4] = chunk[2];
            rgba[i * 4 + 1] = chunk[1];
            rgba[i * 4 + 2] = chunk[0];
            rgba[i * 4 + 3] = 255;
        }
        let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
        let mut encoder = png::Encoder::new(file, w, h);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(&rgba).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn hit_test(&self, x: i32, y: i32) -> bool {
        let d = self.stage.dest();
        let w = d.width as i32;
        let h = d.height as i32;
        x >= d.x && y >= d.y && x < d.x + w && y < d.y + h
    }

    pub fn handle_pointer(&mut self, msg: u32, x: i32, y: i32) {
        if !self.stage.control() {
            return;
        }
        let (video_w, video_h) = self.stage.video_size();
        let Some((vx, vy)) = map_client_to_video(x, y, self.stage.dest(), video_w, video_h) else {
            return;
        };
        let action = match msg {
            WM_LBUTTONDOWN | WM_RBUTTONDOWN => {
                self.pressing = true;
                TOUCH_DOWN
            }
            WM_MOUSEMOVE => {
                if !self.pressing {
                    return;
                }
                TOUCH_MOVE
            }
            WM_LBUTTONUP | WM_RBUTTONUP => {
                self.pressing = false;
                TOUCH_UP
            }
            _ => return,
        };
        let serial = self.stage.serial.clone();
        let mirror = Arc::clone(&self.mirror);
        let message = MirrorControlMessage::Touch {
            action,
            x: vx,
            y: vy,
            width: video_w as u16,
            height: video_h as u16,
        };
        tauri::async_runtime::spawn(async move {
            let _ = mirror.inject(&serial, message).await;
        });
    }

    fn place_occupancy(&mut self) {
        let (ax, ay, aw, ah) = self.stage.avail();
        self.geom
            .set_occupancy(&self.stage.serial, ax, ay, aw, ah, self.stage.visible());
        let (stroke_px, border) = self.stage.panel_stroke();
        let radius = self.stage.corner_radius();
        if let Some(gpu) = self.gpu.as_mut() {
            gpu.set_panel_chrome(radius, stroke_px, border);
        }
        self.clip_occupancy(true);
    }

    fn clip_occupancy(&mut self, animate: bool) {
        let (w, h) = self.stage.host_size();
        if w < MIRROR_MIN_LAYOUT_PX || h < MIRROR_MIN_LAYOUT_PX {
            return;
        }
        let (cx, cy, cw, ch) = self.stage.occupancy();
        let radius = self.stage.corner_radius();
        let Some(gpu) = self.gpu.as_mut() else {
            return;
        };
        match gpu.set_occupancy_clip(cx, cy, cw, ch, radius, animate) {
            Ok(true) if animate => tracing::info!(
                serial = %self.stage.serial,
                bound = self.stage.bound(),
                mode = ?self.stage.mode(),
                video_w = self.stage.video_size().0,
                video_h = self.stage.video_size().1,
                clip_x = cx,
                clip_y = cy,
                clip_w = cw,
                clip_h = ch,
                "投屏占用盒 DComp clip"
            ),
            Ok(_) => {}
            Err(e) => tracing::warn!(error = %e, "投屏占用 clip 失败"),
        }
    }

    fn gpu_matches_host(&self) -> bool {
        let (w, h) = self.stage.host_size();
        self.gpu.as_ref().is_some_and(|g| g.matches_host(w, h))
    }

    fn prepare_video(
        &mut self,
        width: u32,
        height: u32,
    ) -> Option<(Gpu, crate::mirror_present::scale::Letterbox, u32)> {
        let _ = self.stage.set_video_size(width, height);
        if !self.stage.presentable() {
            let (lw, lh) = self.stage.host_size();
            let key = (self.stage.visible(), lw, lh);
            if self.skip_logged != Some(key) {
                self.skip_logged = Some(key);
                tracing::warn!(
                    serial = %self.stage.serial,
                    visible = self.stage.visible(),
                    layout_w = lw,
                    layout_h = lh,
                    "投屏 Present 跳过：等待有效 layout"
                );
            }
            return None;
        }
        if !self.stage.allows_video_present() || !self.gpu_matches_host() {
            return None;
        }
        self.skip_logged = None;
        let dest = self.stage.dest();
        let letterbox = self.stage.letterbox_argb();
        let gpu = self.gpu.take()?;
        Some((gpu, dest, letterbox))
    }

    fn commit_video(
        &mut self,
        width: u32,
        height: u32,
        presented: bool,
        error: Option<&windows::core::Error>,
    ) -> bool {
        if !presented {
            if !self.present_err_logged {
                self.present_err_logged = true;
                if let Some(e) = error {
                    tracing::warn!(error = %e, width, height, "投屏 Present 失败");
                }
            }
            return false;
        }
        self.present_err_logged = false;
        self.painted += 1;
        let now = Instant::now();
        if !self.stage.has_frame() {
            self.stage.mark_frame();
            self.fps_at = now;
            self.painted = 0;
            tracing::info!(
                serial = %self.stage.serial,
                generation = self.stage.generation,
                width,
                height,
                "投屏首帧已 Present"
            );
            let _ = self.event_tx.try_send(AppEvent::MirrorPainted {
                serial: self.stage.serial.clone(),
                generation: self.stage.generation,
                painted_fps: 1,
            });
        } else if now.duration_since(self.fps_at) >= Duration::from_secs(1) {
            let fps = self.painted;
            self.painted = 0;
            self.fps_at = now;
            let _ = self.event_tx.try_send(AppEvent::MirrorPainted {
                serial: self.stage.serial.clone(),
                generation: self.stage.generation,
                painted_fps: fps,
            });
        }
        self.stage.visible() && self.stage.shows_video()
    }

    fn prepare_chrome(&mut self) -> Option<crate::mirror_present::stage::ChromeDraw> {
        if !self.gpu_matches_host() {
            return None;
        }
        self.stage.chrome_draw()
    }
}

pub fn with_host<R>(hwnd: HWND, f: impl FnOnce(&mut Host) -> R) -> Option<R> {
    unsafe {
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if ptr == 0 {
            return None;
        }
        let mutex = &*(ptr as *const Mutex<Host>);
        let mut guard = mutex.lock().ok()?;
        Some(f(&mut guard))
    }
}

pub fn install(hwnd: HWND, host: Host) {
    let state = Box::new(Mutex::new(host));
    unsafe {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(state) as isize);
    }
}

pub fn uninstall(hwnd: HWND) -> Option<String> {
    unsafe {
        let ptr = SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
        if ptr == 0 {
            return None;
        }
        let boxed = Box::from_raw(ptr as *mut Mutex<Host>);
        let host = boxed.into_inner().unwrap_or_else(|p| p.into_inner());
        Some(host.stage.serial)
    }
}

pub fn present_picture(hwnd: HWND, width: u32, height: u32, picture: DecodedPicture) {
    let prepared = with_host(hwnd, |h| h.prepare_video(width, height)).flatten();
    let Some((mut gpu, dest, letterbox)) = prepared else {
        return;
    };
    gpu.set_letterbox_argb(letterbox);
    let drawn = match &picture {
        DecodedPicture::Nv12(nv12) => gpu.present_cpu_nv12(width, height, nv12, dest),
        DecodedPicture::Gpu {
            texture,
            subresource,
            ..
        } => gpu.present_gpu_nv12(texture, *subresource, dest),
    };
    let presented = drawn.is_ok();
    let mut show = false;
    with_host(hwnd, |h| {
        h.gpu = Some(gpu);
        show = h.commit_video(width, height, presented, drawn.as_ref().err());
    });
    if show {
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
    }
}

pub fn present_chrome(hwnd: HWND, spin: f32) {
    let Some(draw) = with_host(hwnd, |h| h.prepare_chrome()).flatten() else {
        return;
    };
    let spec = draw.spec(spin);
    let ok = with_host(hwnd, |h| match h.gpu.as_mut() {
        Some(gpu) => {
            if let Err(e) = gpu.present_chrome(&spec) {
                tracing::warn!(error = %e, "投屏 chrome Present 失败");
                false
            } else {
                true
            }
        }
        None => false,
    })
    .unwrap_or(false);
    if ok {
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
    }
}

pub fn loading(hwnd: HWND) -> bool {
    with_host(hwnd, |h| h.stage.mode() == MirrorStageMode::Loading).unwrap_or(false)
}
