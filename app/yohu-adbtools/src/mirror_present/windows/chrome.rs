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

use crate::mirror_present::stage::argb_to_rgba;
pub use crate::mirror_present::stage::ChromeSpec;

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
        dest: crate::mirror_present::scale::Letterbox,
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
        stroke_frame(&rt, dest, radius, stroke_px, border_argb)?;
        unsafe {
            rt.EndDraw(None, None)?;
        }
        Ok(())
    }
}

fn color(c: u32) -> D2D1_COLOR_F {
    let [r, g, b, a] = argb_to_rgba(c);
    D2D1_COLOR_F { r, g, b, a }
}

fn draw(
    rt: &ID2D1RenderTarget,
    dwrite: &IDWriteFactory,
    size: D2D_SIZE_F,
    spec: &ChromeSpec<'_>,
) -> WinResult<()> {
    let canvas = color(spec.canvas_argb);
    let title_c = color(spec.title_argb);
    let body_c = color(spec.body_argb);
    unsafe {
        rt.Clear(Some(&canvas));
    }
    let w = size.width.max(1.0);
    let h = size.height.max(1.0);
    let icon = spec.icon_px as f32;
    let title_px = spec.title_px as f32;
    let body_px = spec.body_px as f32;
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
    let title = spec.title;
    let desc = spec.description;

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
    dest: crate::mirror_present::scale::Letterbox,
    radius: u32,
    stroke_px: f32,
    border_argb: u32,
) -> WinResult<()> {
    let inset = (stroke_px * 0.5).max(0.5);
    let left = dest.x as f32 + inset;
    let top = dest.y as f32 + inset;
    let right = dest.x as f32 + dest.width as f32 - inset;
    let bottom = dest.y as f32 + dest.height as f32 - inset;
    let stroke_color = color(border_argb);
    let brush = unsafe { rt.CreateSolidColorBrush(&stroke_color, None)? };
    let style = stroke_style(rt)?;
    let rr = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F {
            left,
            top,
            right: right.max(left + 1.0),
            bottom: bottom.max(top + 1.0),
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
