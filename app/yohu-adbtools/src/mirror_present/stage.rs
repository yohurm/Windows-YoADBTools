//! 舞台模型：占用 / 模式 / chrome。与 OS 无关，不进 `MirrorLayout`。
//!
//! 解码是否绑定（`bound`）是管道投影，只在 BindPipe/UnbindPipe 时写入，禁止另开 bool 双轨。

use yohu_protocol::{MirrorLayout, MirrorStageMode, MIRROR_MIN_LAYOUT_PX};

use super::scale::{contain_in_zone, fit_letterbox, Letterbox};

const LIGHT_SURFACE: u32 = 0xFFFFFFFF;
const LIGHT_FG: u32 = 0xE5000000;
const LIGHT_FG2: u32 = 0x99000000;
const DARK_SURFACE: u32 = 0xFF202224;
const DARK_FG: u32 = 0xE5FFFFFF;
const DARK_FG2: u32 = 0x99FFFFFF;

pub struct ChromeSpec<'a> {
    pub mode: MirrorStageMode,
    pub title: &'a str,
    pub description: &'a str,
    pub canvas_argb: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub icon_px: u32,
    pub title_px: u32,
    pub body_px: u32,
    pub spin: f32,
}

/// HWND chrome 一次绘制所需的自有文案（锁外再借成 [`ChromeSpec`]）。
pub struct ChromeDraw {
    pub mode: MirrorStageMode,
    pub title: &'static str,
    pub description: String,
    pub canvas_argb: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub icon_px: u32,
    pub title_px: u32,
    pub body_px: u32,
}

impl ChromeDraw {
    pub fn spec(&self, spin: f32) -> ChromeSpec<'_> {
        ChromeSpec {
            mode: self.mode,
            title: self.title,
            description: &self.description,
            canvas_argb: self.canvas_argb,
            title_argb: self.title_argb,
            body_argb: self.body_argb,
            icon_px: self.icon_px,
            title_px: self.title_px,
            body_px: self.body_px,
            spin,
        }
    }
}

/// 舞台可见性寿命上的状态（HWND 在）；解码寿命只体现在 `bound` / 画面尺寸。
pub struct Stage {
    pub serial: String,
    pub generation: u64,
    visible: bool,
    avail_x: i32,
    avail_y: i32,
    avail_w: u32,
    avail_h: u32,
    dpr: f32,
    fullscreen: bool,
    paused: bool,
    has_device: bool,
    failed: bool,
    error: String,
    dark: bool,
    want_control: bool,
    host_w: u32,
    host_h: u32,
    bound: bool,
    video_w: u32,
    video_h: u32,
    has_frame: bool,
    mode: MirrorStageMode,
    chrome_dirty: bool,
}

impl Stage {
    pub fn new(serial: String) -> Self {
        Self {
            serial,
            generation: 0,
            visible: false,
            avail_x: 0,
            avail_y: 0,
            avail_w: 0,
            avail_h: 0,
            dpr: 1.0,
            fullscreen: false,
            paused: false,
            has_device: false,
            failed: false,
            error: String::new(),
            dark: false,
            want_control: false,
            host_w: 0,
            host_h: 0,
            bound: false,
            video_w: 0,
            video_h: 0,
            has_frame: false,
            mode: MirrorStageMode::Empty,
            chrome_dirty: true,
        }
    }

    pub fn apply_layout(&mut self, layout: &MirrorLayout) {
        if !layout.serial.is_empty() {
            self.serial = layout.serial.clone();
        }
        self.want_control = layout.control;
        self.visible = layout.visible;
        self.avail_x = layout.x;
        self.avail_y = layout.y;
        self.avail_w = layout.width;
        self.avail_h = layout.height;
        self.dpr = layout.dpr;
        self.fullscreen = layout.fullscreen;
        self.paused = layout.paused;
        self.has_device = layout.has_device;
        self.failed = layout.failed;
        self.error = layout.error.clone();
        self.dark = layout.dark;
        self.refresh();
    }

    pub fn bind(&mut self, serial: String, generation: u64) {
        self.serial = serial;
        self.generation = generation;
        self.bound = true;
        self.has_frame = false;
        self.refresh();
    }

    pub fn unbind(&mut self) {
        self.bound = false;
        self.has_frame = false;
        self.generation = 0;
        self.refresh();
    }

    pub fn set_video_size(&mut self, width: u32, height: u32) -> bool {
        if self.video_w == width && self.video_h == height {
            return false;
        }
        self.video_w = width;
        self.video_h = height;
        self.chrome_dirty = true;
        true
    }

    pub fn mark_frame(&mut self) {
        self.has_frame = true;
        self.refresh();
    }

    pub fn set_host_size(&mut self, width: u32, height: u32) -> bool {
        if self.host_w == width && self.host_h == height {
            return false;
        }
        self.host_w = width;
        self.host_h = height;
        self.chrome_dirty = true;
        true
    }

    fn refresh(&mut self) {
        self.mode = stage_mode(self.paused, self.bound, self.has_frame);
        self.chrome_dirty = true;
    }

    pub fn mode(&self) -> MirrorStageMode {
        self.mode
    }

    pub fn bound(&self) -> bool {
        self.bound
    }

    pub fn visible(&self) -> bool {
        self.visible
    }

    pub fn has_frame(&self) -> bool {
        self.has_frame
    }

    pub fn video_size(&self) -> (u32, u32) {
        (self.video_w, self.video_h)
    }

    pub fn host_size(&self) -> (u32, u32) {
        (self.host_w, self.host_h)
    }

    pub fn avail(&self) -> (i32, i32, u32, u32) {
        (self.avail_x, self.avail_y, self.avail_w, self.avail_h)
    }

    pub fn corner_radius(&self) -> u32 {
        host_corner_radius(self.fullscreen, self.dpr)
    }

    pub fn presentable(&self) -> bool {
        self.visible && self.host_w >= MIRROR_MIN_LAYOUT_PX && self.host_h >= MIRROR_MIN_LAYOUT_PX
    }

    pub fn shows_chrome(&self) -> bool {
        matches!(
            self.mode,
            MirrorStageMode::Empty | MirrorStageMode::Loading | MirrorStageMode::Paused
        )
    }

    pub fn shows_video(&self) -> bool {
        self.mode == MirrorStageMode::Video
    }

    /// 解码图可画：Loading 首帧也要 Present，之后 `mark_frame` 才进 Video。
    pub fn allows_video_present(&self) -> bool {
        !matches!(self.mode, MirrorStageMode::Empty | MirrorStageMode::Paused)
    }

    pub fn control(&self) -> bool {
        self.want_control && self.mode == MirrorStageMode::Video
    }

    pub fn occupancy(&self) -> (i32, i32, u32, u32) {
        if self.bound && self.video_w > 0 && self.video_h > 0 {
            contain_in_zone(self.host_w, self.host_h, self.video_w, self.video_h)
        } else {
            (0, 0, self.host_w.max(1), self.host_h.max(1))
        }
    }

    pub fn dest(&self) -> Letterbox {
        if self.bound && self.video_w > 0 && self.video_h > 0 {
            let (x, y, w, h) = self.occupancy();
            let inner = fit_letterbox(self.video_w, self.video_h, w, h);
            Letterbox {
                x: x + inner.x,
                y: y + inner.y,
                width: inner.width,
                height: inner.height,
                nearest: inner.nearest,
            }
        } else {
            fit_letterbox(self.video_w, self.video_h, self.host_w, self.host_h)
        }
    }

    pub fn letterbox_argb(&self) -> u32 {
        stage_palette(self.dark).0
    }

    pub fn panel_stroke(&self) -> (f32, u32) {
        if self.fullscreen {
            (0.0, 0)
        } else {
            (stage_stroke_px(self.dpr), stage_border_argb(self.dark))
        }
    }

    fn take_chrome_dirty(&mut self) -> bool {
        let dirty = self.chrome_dirty;
        self.chrome_dirty = false;
        dirty
    }

    pub fn chrome_draw(&mut self) -> Option<ChromeDraw> {
        if !self.presentable() || !self.shows_chrome() {
            return None;
        }
        if self.mode != MirrorStageMode::Loading && !self.take_chrome_dirty() {
            return None;
        }
        let (title, description) = stage_copy(
            self.mode,
            self.has_device,
            self.failed,
            &self.error,
            self.video_w > 0 && self.video_h > 0,
        );
        let (canvas_argb, title_argb, body_argb) = stage_palette(self.dark);
        let (icon_px, title_px, body_px) = stage_type_px(self.dpr);
        Some(ChromeDraw {
            mode: self.mode,
            title,
            description,
            canvas_argb,
            title_argb,
            body_argb,
            icon_px,
            title_px,
            body_px,
        })
    }
}

pub fn stage_mode(paused: bool, bound: bool, has_frame: bool) -> MirrorStageMode {
    if paused && bound && has_frame {
        MirrorStageMode::Paused
    } else if bound && has_frame {
        MirrorStageMode::Video
    } else if bound {
        MirrorStageMode::Loading
    } else {
        MirrorStageMode::Empty
    }
}

pub fn stage_copy(
    mode: MirrorStageMode,
    has_device: bool,
    failed: bool,
    error: &str,
    has_video_size: bool,
) -> (&'static str, String) {
    match mode {
        MirrorStageMode::Video => ("", String::new()),
        MirrorStageMode::Paused => ("已暂停", "画面已隐藏，点击继续".into()),
        MirrorStageMode::Loading => {
            if has_video_size {
                ("等待画面", "设备正在准备编码器，画面到达前请稍候".into())
            } else {
                ("启动中", "正在推送 server 并建立隧道".into())
            }
        }
        MirrorStageMode::Empty => empty_copy(has_device, failed, error),
    }
}

fn empty_copy(has_device: bool, failed: bool, error: &str) -> (&'static str, String) {
    if !has_device {
        ("未选择设备", "在左侧设备栏选择一台在线设备".into())
    } else if !error.is_empty() {
        let title = if failed { "启动失败" } else { "已停止" };
        (title, error.to_string())
    } else {
        ("未开始", "点击开始将画面嵌在此面板内".into())
    }
}

pub fn stage_palette(dark: bool) -> (u32, u32, u32) {
    if dark {
        (DARK_SURFACE, DARK_FG, DARK_FG2)
    } else {
        (LIGHT_SURFACE, LIGHT_FG, LIGHT_FG2)
    }
}

/// YoPanel `--yohu-border`：浅 `#00000033` / 深 `#FFFFFF33`。
pub fn stage_border_argb(dark: bool) -> u32 {
    if dark {
        0x33FFFFFF
    } else {
        0x33000000
    }
}

pub fn stage_stroke_px(dpr: f32) -> f32 {
    let d = if dpr > 0.0 { dpr } else { 1.0 };
    d.max(1.0)
}

pub fn argb_to_rgba(c: u32) -> [f32; 4] {
    [
        ((c >> 16) & 0xFF) as f32 / 255.0,
        ((c >> 8) & 0xFF) as f32 / 255.0,
        (c & 0xFF) as f32 / 255.0,
        ((c >> 24) & 0xFF) as f32 / 255.0,
    ]
}

pub fn stage_type_px(dpr: f32) -> (u32, u32, u32) {
    let d = if dpr > 0.0 { dpr } else { 1.0 };
    let px = |n: f32| (n * d).round().max(1.0) as u32;
    (px(40.0), px(16.0), px(14.0))
}

pub fn host_corner_radius(fullscreen: bool, dpr: f32) -> u32 {
    if fullscreen {
        0
    } else {
        let d = if dpr > 0.0 { dpr } else { 1.0 };
        (16.0 * d).round().max(0.0) as u32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layout() -> MirrorLayout {
        MirrorLayout {
            serial: "S1".into(),
            x: 10,
            y: 20,
            width: 900,
            height: 950,
            visible: true,
            dpr: 1.0,
            fullscreen: false,
            paused: false,
            control: true,
            has_device: true,
            failed: false,
            error: String::new(),
            dark: true,
        }
    }

    #[test]
    fn chrome_fill_uses_panel_surface_not_canvas() {
        let (light, _, _) = stage_palette(false);
        let (dark, _, _) = stage_palette(true);
        assert_eq!(light, 0xFFFFFFFF);
        assert_eq!(dark, 0xFF202224);
    }

    #[test]
    fn unbound_occupancy_fills_host() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        s.set_host_size(900, 950);
        assert!(!s.bound());
        assert_eq!(s.mode(), MirrorStageMode::Empty);
        assert!(s.shows_chrome());
        assert!(!s.control());
        assert_eq!(s.occupancy(), (0, 0, 900, 950));
        assert_eq!(s.letterbox_argb(), 0xFF202224);
    }

    #[test]
    fn bind_without_frame_is_loading() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        s.bind("S1".into(), 3);
        assert_eq!(s.mode(), MirrorStageMode::Loading);
        assert_eq!(s.generation, 3);
        assert!(!s.control());
    }

    #[test]
    fn bound_video_contain_and_control() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        s.set_host_size(900, 950);
        s.bind("S1".into(), 1);
        assert!(s.set_video_size(1088, 2400));
        s.mark_frame();
        assert_eq!(s.mode(), MirrorStageMode::Video);
        assert!(s.shows_video());
        assert!(s.control());
        let (x, _y, w, h) = s.occupancy();
        assert_eq!(h, 950);
        assert!(w < 900);
        assert!(x > 0);
    }

    #[test]
    fn pause_hides_video_and_control() {
        let mut s = Stage::new("S1".into());
        let mut l = layout();
        l.paused = true;
        s.apply_layout(&l);
        s.bind("S1".into(), 1);
        s.set_video_size(1088, 2400);
        s.mark_frame();
        assert_eq!(s.mode(), MirrorStageMode::Paused);
        assert!(s.shows_chrome());
        assert!(!s.control());
    }

    #[test]
    fn loading_allows_first_picture_then_video() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        s.bind("S1".into(), 1);
        assert!(s.allows_video_present());
        assert!(!s.shows_video());
        s.set_video_size(1088, 2400);
        s.mark_frame();
        assert!(s.shows_video());
        assert!(s.allows_video_present());
    }

    #[test]
    fn unbind_returns_empty_keeps_video_size() {
        let mut s = Stage::new("S1".into());
        s.bind("S1".into(), 1);
        s.set_video_size(1088, 2400);
        s.mark_frame();
        s.unbind();
        assert_eq!(s.mode(), MirrorStageMode::Empty);
        assert!(!s.bound());
        assert_eq!(s.video_size(), (1088, 2400));
    }
}
