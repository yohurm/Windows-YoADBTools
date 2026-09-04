//! 舞台 chrome：空态 / 加载 / 暂停画在同一 HWND 上，不把像素交还给 WebView。
//!
//! 文案、色值、字号由壳按 mode + 设备/失败标志推导，不进 `MirrorLayout`。

#![cfg(windows)]

use windows::core::Result as WinResult;
use windows::Win32::Graphics::Direct2D::Common::{
    D2D1_ALPHA_MODE_PREMULTIPLIED, D2D1_COLOR_F, D2D1_PIXEL_FORMAT, D2D_RECT_F, D2D_SIZE_F,
};
use windows::Win32::Graphics::Direct2D::{
    D2D1CreateFactory, ID2D1Factory, ID2D1RenderTarget, D2D1_CAP_STYLE_ROUND,
    D2D1_DASH_STYLE_SOLID, D2D1_ELLIPSE, D2D1_FACTORY_TYPE_SINGLE_THREADED,
    D2D1_FEATURE_LEVEL_DEFAULT, D2D1_LINE_JOIN_ROUND, D2D1_RENDER_TARGET_PROPERTIES,
    D2D1_RENDER_TARGET_TYPE_DEFAULT, D2D1_RENDER_TARGET_USAGE_NONE, D2D1_ROUNDED_RECT,
    D2D1_STROKE_STYLE_PROPERTIES,
};
use windows::Win32::Graphics::Direct3D11::ID3D11DeviceContext;
use windows::Win32::Graphics::DirectWrite::{
    DWriteCreateFactory, IDWriteFactory, IDWriteTextFormat, DWRITE_FACTORY_TYPE_SHARED,
    DWRITE_FONT_STRETCH_NORMAL, DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_WEIGHT_MEDIUM,
    DWRITE_FONT_WEIGHT_NORMAL, DWRITE_MEASURING_MODE_NATURAL, DWRITE_PARAGRAPH_ALIGNMENT_NEAR,
    DWRITE_TEXT_ALIGNMENT_CENTER,
};
use windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_UNKNOWN;
use windows::Win32::Graphics::Dxgi::{IDXGISurface, IDXGISwapChain1};
use windows_numerics::Vector2;
use yohu_protocol::MirrorStageMode;

const FALLBACK_SURFACE: u32 = 0xFFFFFFFF;
const FALLBACK_TITLE: u32 = 0xE5000000;
const FALLBACK_BODY: u32 = 0x99000000;

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

pub fn stage_mode(paused: bool, session: bool, has_frame: bool) -> MirrorStageMode {
    if paused && session && has_frame {
        MirrorStageMode::Paused
    } else if session && has_frame {
        MirrorStageMode::Video
    } else if session {
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
    let v = if c == 0 { FALLBACK_SURFACE } else { c };
    [
        ((v >> 16) & 0xFF) as f32 / 255.0,
        ((v >> 8) & 0xFF) as f32 / 255.0,
        (v & 0xFF) as f32 / 255.0,
        ((v >> 24) & 0xFF) as f32 / 255.0,
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

pub struct ChromePainter {
    d2d: ID2D1Factory,
    dwrite: IDWriteFactory,
}

impl ChromePainter {
    pub fn new() -> WinResult<Self> {
        let d2d: ID2D1Factory =
            unsafe { D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, None)? };
        let dwrite: IDWriteFactory = unsafe { DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED)? };
        Ok(Self { d2d, dwrite })
    }

    pub fn present(
        &self,
        context: &ID3D11DeviceContext,
        swapchain: &IDXGISwapChain1,
        spec: &ChromeSpec<'_>,
    ) -> WinResult<()> {
        unsafe {
            context.OMSetRenderTargets(None, None);
            context.Flush();
        }
        let surface: IDXGISurface = unsafe { swapchain.GetBuffer(0)? };
        let props = D2D1_RENDER_TARGET_PROPERTIES {
            r#type: D2D1_RENDER_TARGET_TYPE_DEFAULT,
            pixelFormat: D2D1_PIXEL_FORMAT {
                format: DXGI_FORMAT_UNKNOWN,
                alphaMode: D2D1_ALPHA_MODE_PREMULTIPLIED,
            },
            dpiX: 0.0,
            dpiY: 0.0,
            usage: D2D1_RENDER_TARGET_USAGE_NONE,
            minLevel: D2D1_FEATURE_LEVEL_DEFAULT,
        };
        let rt = unsafe { self.d2d.CreateDxgiSurfaceRenderTarget(&surface, &props)? };
        unsafe {
            rt.BeginDraw();
        }
        let size = unsafe { rt.GetSize() };
        draw(&rt, &self.dwrite, size, spec)?;
        unsafe {
            rt.EndDraw(None, None)?;
        }
        Ok(())
    }

    /// 占用卡片描边。画在已有回缓冲上，不清屏。
    pub fn stroke(
        &self,
        context: &ID3D11DeviceContext,
        swapchain: &IDXGISwapChain1,
        radius: u32,
        stroke_px: f32,
        border_argb: u32,
    ) -> WinResult<()> {
        if stroke_px <= 0.0 || border_argb == 0 {
            return Ok(());
        }
        unsafe {
            context.OMSetRenderTargets(None, None);
            context.Flush();
        }
        let surface: IDXGISurface = unsafe { swapchain.GetBuffer(0)? };
        let props = D2D1_RENDER_TARGET_PROPERTIES {
            r#type: D2D1_RENDER_TARGET_TYPE_DEFAULT,
            pixelFormat: D2D1_PIXEL_FORMAT {
                format: DXGI_FORMAT_UNKNOWN,
                alphaMode: D2D1_ALPHA_MODE_PREMULTIPLIED,
            },
            dpiX: 0.0,
            dpiY: 0.0,
            usage: D2D1_RENDER_TARGET_USAGE_NONE,
            minLevel: D2D1_FEATURE_LEVEL_DEFAULT,
        };
        let rt = unsafe { self.d2d.CreateDxgiSurfaceRenderTarget(&surface, &props)? };
        unsafe {
            rt.BeginDraw();
        }
        let size = unsafe { rt.GetSize() };
        stroke_frame(&rt, size, radius, stroke_px, border_argb)?;
        unsafe {
            rt.EndDraw(None, None)?;
        }
        Ok(())
    }
}

fn argb(c: u32, fallback: u32) -> D2D1_COLOR_F {
    let v = if c == 0 { fallback } else { c };
    D2D1_COLOR_F {
        r: ((v >> 16) & 0xFF) as f32 / 255.0,
        g: ((v >> 8) & 0xFF) as f32 / 255.0,
        b: (v & 0xFF) as f32 / 255.0,
        a: ((v >> 24) & 0xFF) as f32 / 255.0,
    }
}

fn draw(
    rt: &ID2D1RenderTarget,
    dwrite: &IDWriteFactory,
    size: D2D_SIZE_F,
    spec: &ChromeSpec<'_>,
) -> WinResult<()> {
    let canvas = argb(spec.canvas_argb, FALLBACK_SURFACE);
    let title_c = argb(spec.title_argb, FALLBACK_TITLE);
    let body_c = argb(spec.body_argb, FALLBACK_BODY);
    unsafe {
        rt.Clear(Some(&canvas));
    }
    let w = size.width.max(1.0);
    let h = size.height.max(1.0);
    let icon = spec.icon_px.max(40) as f32;
    let title_px = spec.title_px.max(16) as f32;
    let body_px = spec.body_px.max(14) as f32;
    let gap = (title_px * 0.75).max(8.0);
    let block = icon + gap + title_px + gap * 0.5 + body_px;
    let mut y = ((h - block) * 0.5).max(0.0);
    let cx = w * 0.5;

    match spec.mode {
        MirrorStageMode::Loading => draw_spinner(
            rt,
            cx,
            y + icon * 0.5,
            icon * 0.42,
            spec.spin,
            &title_c,
            &body_c,
        )?,
        _ => draw_mirror_icon(rt, cx, y, icon, &body_c)?,
    }
    y += icon + gap;

    let title_fmt = text_format(dwrite, title_px, true)?;
    let body_fmt = text_format(dwrite, body_px, false)?;
    let title_brush = unsafe { rt.CreateSolidColorBrush(&title_c, None)? };
    let body_brush = unsafe { rt.CreateSolidColorBrush(&body_c, None)? };
    let title = if spec.title.is_empty() {
        match spec.mode {
            MirrorStageMode::Loading => "启动中",
            MirrorStageMode::Paused => "已暂停",
            _ => "未开始",
        }
    } else {
        spec.title
    };
    let desc = if spec.description.is_empty() {
        match spec.mode {
            MirrorStageMode::Loading => "正在推送 server 并建立隧道",
            MirrorStageMode::Paused => "画面已隐藏，点击继续",
            _ => "点击开始将画面嵌在此面板内",
        }
    } else {
        spec.description
    };

    let title_rect = D2D_RECT_F {
        left: 16.0,
        top: y,
        right: (w - 16.0).max(17.0),
        bottom: y + title_px * 1.4,
    };
    draw_text(rt, title, &title_fmt, &title_rect, &title_brush)?;
    y = title_rect.bottom + gap * 0.35;
    let desc_rect = D2D_RECT_F {
        left: 24.0,
        top: y,
        right: (w - 24.0).max(25.0),
        bottom: y + body_px * 2.6,
    };
    draw_text(rt, desc, &body_fmt, &desc_rect, &body_brush)?;
    Ok(())
}

fn stroke_frame(
    rt: &ID2D1RenderTarget,
    size: D2D_SIZE_F,
    radius: u32,
    stroke_px: f32,
    border_argb: u32,
) -> WinResult<()> {
    let w = size.width.max(1.0);
    let h = size.height.max(1.0);
    let inset = (stroke_px * 0.5).max(0.5);
    let color = argb(border_argb, 0x33000000);
    let brush = unsafe { rt.CreateSolidColorBrush(&color, None)? };
    let style = stroke_style(rt)?;
    let rr = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F {
            left: inset,
            top: inset,
            right: (w - inset).max(inset + 1.0),
            bottom: (h - inset).max(inset + 1.0),
        },
        radiusX: radius as f32,
        radiusY: radius as f32,
    };
    unsafe {
        rt.DrawRoundedRectangle(&rr, &brush, stroke_px, Some(&style));
    }
    Ok(())
}

fn text_format(dwrite: &IDWriteFactory, size: f32, medium: bool) -> WinResult<IDWriteTextFormat> {
    let weight = if medium {
        DWRITE_FONT_WEIGHT_MEDIUM
    } else {
        DWRITE_FONT_WEIGHT_NORMAL
    };
    let fmt = unsafe {
        dwrite.CreateTextFormat(
            windows::core::w!("Segoe UI"),
            None,
            weight,
            DWRITE_FONT_STYLE_NORMAL,
            DWRITE_FONT_STRETCH_NORMAL,
            size,
            windows::core::w!("zh-cn"),
        )?
    };
    unsafe {
        fmt.SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER)?;
        fmt.SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_NEAR)?;
    }
    Ok(fmt)
}

fn draw_text(
    rt: &ID2D1RenderTarget,
    text: &str,
    format: &IDWriteTextFormat,
    rect: &D2D_RECT_F,
    brush: &windows::Win32::Graphics::Direct2D::ID2D1SolidColorBrush,
) -> WinResult<()> {
    let wide: Vec<u16> = text.encode_utf16().collect();
    unsafe {
        rt.DrawText(
            &wide,
            format,
            rect,
            brush,
            windows::Win32::Graphics::Direct2D::D2D1_DRAW_TEXT_OPTIONS_NONE,
            DWRITE_MEASURING_MODE_NATURAL,
        );
    }
    Ok(())
}

fn draw_mirror_icon(
    rt: &ID2D1RenderTarget,
    cx: f32,
    top: f32,
    size: f32,
    color: &D2D1_COLOR_F,
) -> WinResult<()> {
    let brush = unsafe { rt.CreateSolidColorBrush(color, None)? };
    let stroke = (size / 12.0).clamp(1.5, 3.0);
    let s = size / 24.0;
    let ox = cx - size * 0.5;
    let oy = top;
    let style = stroke_style(rt)?;
    let back = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F {
            left: ox + 2.0 * s,
            top: oy + 2.0 * s,
            right: ox + 13.0 * s,
            bottom: oy + 15.0 * s,
        },
        radiusX: 2.0 * s,
        radiusY: 2.0 * s,
    };
    let front = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F {
            left: ox + 9.0 * s,
            top: oy + 9.0 * s,
            right: ox + 22.0 * s,
            bottom: oy + 22.0 * s,
        },
        radiusX: 2.0 * s,
        radiusY: 2.0 * s,
    };
    unsafe {
        rt.DrawRoundedRectangle(&back, &brush, stroke, Some(&style));
        rt.DrawRoundedRectangle(&front, &brush, stroke, Some(&style));
    }
    Ok(())
}

fn draw_spinner(
    rt: &ID2D1RenderTarget,
    cx: f32,
    cy: f32,
    radius: f32,
    spin: f32,
    accent: &D2D1_COLOR_F,
    track: &D2D1_COLOR_F,
) -> WinResult<()> {
    let track_brush = unsafe { rt.CreateSolidColorBrush(track, None)? };
    let accent_brush = unsafe { rt.CreateSolidColorBrush(accent, None)? };
    let style = stroke_style(rt)?;
    let stroke = (radius / 6.0).clamp(2.0, 4.0);
    let ellipse = D2D1_ELLIPSE {
        point: Vector2 { X: cx, Y: cy },
        radiusX: radius,
        radiusY: radius,
    };
    unsafe {
        rt.DrawEllipse(&ellipse, &track_brush, stroke, Some(&style));
    }
    let head = D2D1_ELLIPSE {
        point: Vector2 {
            X: cx + radius * spin.cos(),
            Y: cy + radius * spin.sin(),
        },
        radiusX: stroke * 1.1,
        radiusY: stroke * 1.1,
    };
    unsafe {
        rt.FillEllipse(&head, &accent_brush);
    }
    Ok(())
}

fn stroke_style(
    rt: &ID2D1RenderTarget,
) -> WinResult<windows::Win32::Graphics::Direct2D::ID2D1StrokeStyle> {
    let factory = unsafe { rt.GetFactory()? };
    let props = D2D1_STROKE_STYLE_PROPERTIES {
        startCap: D2D1_CAP_STYLE_ROUND,
        endCap: D2D1_CAP_STYLE_ROUND,
        dashCap: D2D1_CAP_STYLE_ROUND,
        lineJoin: D2D1_LINE_JOIN_ROUND,
        miterLimit: 10.0,
        dashStyle: D2D1_DASH_STYLE_SOLID,
        dashOffset: 0.0,
    };
    unsafe { factory.CreateStrokeStyle(&props, None) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chrome_fill_uses_panel_surface_not_canvas() {
        let (light, _, _) = stage_palette(false);
        let (dark, _, _) = stage_palette(true);
        assert_eq!(light, 0xFFFFFFFF);
        assert_eq!(dark, 0xFF202224);
    }
}
