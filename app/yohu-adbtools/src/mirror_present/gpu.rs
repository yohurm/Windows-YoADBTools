//! D3D11：硬解共用设备 + Video Processor（BT.709 full 缩放）；无 VP 时 YUV shader。

#![cfg(windows)]

use std::mem::ManuallyDrop;
use std::time::Instant;

use windows::core::{s, Interface, Result as WinResult};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Direct3D::Fxc::D3DCompile;
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
    D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST, D3D_SRV_DIMENSION_TEXTURE2D,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Multithread, ID3D11PixelShader,
    ID3D11RenderTargetView, ID3D11SamplerState, ID3D11ShaderResourceView, ID3D11Texture2D,
    ID3D11VertexShader, ID3D11VideoContext, ID3D11VideoContext1, ID3D11VideoDevice,
    ID3D11VideoProcessor, ID3D11VideoProcessorEnumerator, D3D11_BIND_DECODER,
    D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_CPU_ACCESS_READ,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_CREATE_DEVICE_FLAG, D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
    D3D11_FILTER_MIN_MAG_MIP_LINEAR, D3D11_FILTER_MIN_MAG_MIP_POINT, D3D11_MAPPED_SUBRESOURCE,
    D3D11_MAP_READ, D3D11_SAMPLER_DESC, D3D11_SDK_VERSION, D3D11_SHADER_RESOURCE_VIEW_DESC,
    D3D11_SHADER_RESOURCE_VIEW_DESC_0, D3D11_TEX2D_SRV, D3D11_TEX2D_VPIV, D3D11_TEX2D_VPOV,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, D3D11_USAGE_STAGING, D3D11_VIDEO_COLOR,
    D3D11_VIDEO_COLOR_0, D3D11_VIDEO_COLOR_RGBA,
    D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE, D3D11_VIDEO_PROCESSOR_CONTENT_DESC,
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC, D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0,
    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC, D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0,
    D3D11_VIDEO_PROCESSOR_STREAM, D3D11_VIDEO_USAGE_PLAYBACK_NORMAL, D3D11_VIEWPORT,
    D3D11_VPIV_DIMENSION_TEXTURE2D, D3D11_VPOV_DIMENSION_TEXTURE2D,
};
use windows::Win32::Graphics::DirectComposition::{
    DCompositionCreateDevice, IDCompositionAnimation, IDCompositionDevice, IDCompositionRectangleClip,
    IDCompositionTarget, IDCompositionVisual,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_ALPHA_MODE_PREMULTIPLIED, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709,
    DXGI_COLOR_SPACE_YCBCR_FULL_G22_LEFT_P709, DXGI_FORMAT, DXGI_FORMAT_B8G8R8A8_UNORM,
    DXGI_FORMAT_NV12, DXGI_FORMAT_R8G8_UNORM, DXGI_FORMAT_R8_UNORM, DXGI_FORMAT_UNKNOWN,
    DXGI_RATIONAL, DXGI_SAMPLE_DESC,
};
use windows::Win32::Graphics::Dxgi::{
    IDXGIAdapter, IDXGIDevice, IDXGIDevice1, IDXGIFactory2, IDXGISwapChain1, DXGI_PRESENT,
    DXGI_SCALING_STRETCH, DXGI_SWAP_CHAIN_DESC1, DXGI_SWAP_CHAIN_FLAG,
    DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL, DXGI_USAGE_RENDER_TARGET_OUTPUT,
};
use windows::Win32::Media::MediaFoundation::{IMFDXGIDeviceManager, MFCreateDXGIDeviceManager};

use super::chrome::{argb_to_rgba, ChromePainter, ChromeSpec};
use super::scale::{Letterbox, SPATIAL_PANEL_MS};

const VS: &str = r#"
struct VSOut { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
VSOut main(uint id : SV_VertexID) {
  VSOut o;
  float2 uv = float2((id << 1) & 2, id & 2);
  o.pos = float4(uv * float2(2, -2) + float2(-1, 1), 0, 1);
  o.uv = uv;
  return o;
}
"#;

const PS: &str = r#"
Texture2D texY : register(t0);
Texture2D texUV : register(t1);
SamplerState samp : register(s0);
float4 main(float4 pos : SV_POSITION, float2 uv : TEXCOORD0) : SV_TARGET {
  float y = texY.Sample(samp, uv).r;
  float2 c = texUV.Sample(samp, uv).rg;
  float u = c.x - 0.5;
  float v = c.y - 0.5;
  float r = y + 1.5748 * v;
  float g = y - 0.1873 * u - 0.4681 * v;
  float b = y + 1.8556 * u;
  return float4(saturate(r), saturate(g), saturate(b), 1);
}
"#;

pub struct Gpu {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    swapchain: IDXGISwapChain1,
    rtv: Option<ID3D11RenderTargetView>,
    vs: ID3D11VertexShader,
    ps: ID3D11PixelShader,
    samp_linear: ID3D11SamplerState,
    samp_point: ID3D11SamplerState,
    tex_y: Option<ID3D11Texture2D>,
    tex_uv: Option<ID3D11Texture2D>,
    srv_y: Option<ID3D11ShaderResourceView>,
    srv_uv: Option<ID3D11ShaderResourceView>,
    video_w: u32,
    video_h: u32,
    buf_w: u32,
    buf_h: u32,
    dxgi_manager: Option<IMFDXGIDeviceManager>,
    video_device: Option<ID3D11VideoDevice>,
    video_ctx: Option<ID3D11VideoContext>,
    video_ctx1: Option<ID3D11VideoContext1>,
    vp_enum: Option<ID3D11VideoProcessorEnumerator>,
    processor: Option<ID3D11VideoProcessor>,
    compose: Option<ID3D11Texture2D>,
    nv12: Option<ID3D11Texture2D>,
    vp_ok: bool,
    last_cpu: Option<Vec<u8>>,
    last_video: Option<(ID3D11Texture2D, u32)>,
    dcomp: DcompTree,
    chrome: Option<ChromePainter>,
    letterbox_argb: u32,
    panel_r: u32,
    panel_stroke: f32,
    panel_border: u32,
    occupancy_dest: Letterbox,
}

/// Flip 交换链不能走 GDI `SetWindowRgn`（DWM 会出黑窗）。圆角与占用盒裁在 DComp visual 上。
struct DcompTree {
    device: IDCompositionDevice,
    _target: IDCompositionTarget,
    _visual: IDCompositionVisual,
    clip: IDCompositionRectangleClip,
    clip_from: (f32, f32, f32, f32),
    clip_to: (f32, f32, f32, f32),
    clip_radius: f32,
    clip_anim_at: Option<Instant>,
}

impl Gpu {
    pub fn new(hwnd: HWND, width: u32, height: u32) -> WinResult<Self> {
        let width = even_px(width);
        let height = even_px(height);
        let (device, context) = create_device()?;
        if let Ok(mt) = device.cast::<ID3D11Multithread>() {
            unsafe {
                let _ = mt.SetMultithreadProtected(true);
            }
        }
        if let Ok(dxgi1) = device.cast::<IDXGIDevice1>() {
            let _ = unsafe { dxgi1.SetMaximumFrameLatency(1) };
        }
        let dxgi_manager = create_dxgi_manager(&device);
        let video_device = device.cast::<ID3D11VideoDevice>().ok();
        let video_ctx = context.cast::<ID3D11VideoContext>().ok();
        let video_ctx1 = context.cast::<ID3D11VideoContext1>().ok();
        if video_device.is_some() && video_ctx.is_some() {
            tracing::info!("投屏 D3D11 Video Processor 可用");
        } else {
            tracing::warn!("本机没有 D3D11 Video Processor，YUV 走 shader");
        }
        let dxgi: IDXGIDevice = device.cast()?;
        let adapter: IDXGIAdapter = unsafe { dxgi.GetAdapter()? };
        let factory: IDXGIFactory2 = unsafe { adapter.GetParent()? };
        let desc = DXGI_SWAP_CHAIN_DESC1 {
            Width: width,
            Height: height,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            Stereo: false.into(),
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
            BufferCount: 2,
            Scaling: DXGI_SCALING_STRETCH,
            SwapEffect: DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL,
            AlphaMode: DXGI_ALPHA_MODE_PREMULTIPLIED,
            Flags: 0,
        };
        let swapchain = unsafe { factory.CreateSwapChainForComposition(&device, &desc, None)? };
        let dcomp = attach_dcomp(&dxgi, hwnd, &swapchain, width, height, 0)?;
        tracing::info!("投屏 HWND DirectComposition flip + 圆角 clip");
        let vs = compile_vs(&device)?;
        let ps = compile_ps(&device)?;
        let samp_linear = sampler(&device, false)?;
        let samp_point = sampler(&device, true)?;
        let mut gpu = Self {
            device,
            context,
            swapchain,
            rtv: None,
            vs,
            ps,
            samp_linear,
            samp_point,
            tex_y: None,
            tex_uv: None,
            srv_y: None,
            srv_uv: None,
            video_w: 0,
            video_h: 0,
            buf_w: width,
            buf_h: height,
            dxgi_manager,
            video_device,
            video_ctx,
            video_ctx1,
            vp_enum: None,
            processor: None,
            compose: None,
            nv12: None,
            vp_ok: true,
            last_cpu: None,
            last_video: None,
            dcomp,
            chrome: None,
            letterbox_argb: 0xFFFFFFFF,
            panel_r: 0,
            panel_stroke: 0.0,
            panel_border: 0,
            occupancy_dest: Letterbox {
                x: 0,
                y: 0,
                width,
                height,
                nearest: false,
            },
        };
        gpu.bind_backbuffer()?;
        Ok(gpu)
    }

    pub fn set_letterbox_argb(&mut self, argb: u32) {
        self.letterbox_argb = argb;
    }

    pub fn set_panel_chrome(&mut self, radius: u32, stroke_px: f32, border_argb: u32) {
        self.panel_r = radius;
        self.panel_stroke = stroke_px;
        self.panel_border = border_argb;
    }

    fn letterbox_rgba(&self) -> [f32; 4] {
        argb_to_rgba(self.letterbox_argb)
    }

    fn letterbox_video_color(&self) -> D3D11_VIDEO_COLOR {
        let [r, g, b, a] = self.letterbox_rgba();
        D3D11_VIDEO_COLOR {
            Anonymous: D3D11_VIDEO_COLOR_0 {
                RGBA: D3D11_VIDEO_COLOR_RGBA {
                    R: r,
                    G: g,
                    B: b,
                    A: a,
                },
            },
        }
    }

    pub fn present_chrome(&mut self, spec: &ChromeSpec<'_>) -> WinResult<()> {
        if self.chrome.is_none() {
            self.chrome = Some(ChromePainter::new()?);
        }
        let Some(painter) = self.chrome.as_ref() else {
            return Err(windows::core::Error::from_win32());
        };
        painter.present(&self.context, &self.swapchain, spec)?;
        self.present_with_hairline(self.occupancy_dest)
    }

    pub fn dxgi_manager(&self) -> Option<IMFDXGIDeviceManager> {
        self.dxgi_manager.clone()
    }

    fn bind_backbuffer(&mut self) -> WinResult<()> {
        let tex: ID3D11Texture2D = unsafe { self.swapchain.GetBuffer(0)? };
        let mut rtv = None;
        unsafe {
            self.device
                .CreateRenderTargetView(&tex, None, Some(&mut rtv))?;
        }
        self.rtv = Some(rtv.ok_or_else(windows::core::Error::from_win32)?);
        Ok(())
    }

    pub fn even_host(width: u32, height: u32) -> (u32, u32) {
        (even_px(width.max(1)), even_px(height.max(1)))
    }

    pub fn matches_host(&self, width: u32, height: u32) -> bool {
        let (w, h) = Self::even_host(width, height);
        w == self.buf_w && h == self.buf_h
    }

    pub fn resize(&mut self, width: u32, height: u32) -> WinResult<()> {
        let width = even_px(width);
        let height = even_px(height);
        if width == self.buf_w && height == self.buf_h {
            return Ok(());
        }
        unsafe {
            self.context.OMSetRenderTargets(None, None);
        }
        self.rtv = None;
        self.compose = None;
        // Video Processor 跟输入尺寸走。avail 变化才会走到这里；不要拆 enumerator。
        unsafe {
            self.swapchain.ResizeBuffers(
                0,
                width,
                height,
                DXGI_FORMAT_UNKNOWN,
                DXGI_SWAP_CHAIN_FLAG(0),
            )?;
        }
        self.buf_w = width;
        self.buf_h = height;
        self.bind_backbuffer()?;
        Ok(())
    }

    /// 占用卡片 = DComp rectangle clip。HWND / 交换链保持 avail 尺寸。
    /// `animate` 时由 composition 线程按 spatial-panel 时长跑；目标未变则不 `Commit` 新动画
    ///（再次 SetLeft(animation) 会替换正在跑的 clip，见 IDCompositionRectangleClip）。
    pub fn set_occupancy_clip(
        &mut self,
        x: i32,
        y: i32,
        w: u32,
        h: u32,
        radius: u32,
        animate: bool,
    ) -> WinResult<bool> {
        self.occupancy_dest = Letterbox {
            x,
            y,
            width: w.max(1),
            height: h.max(1),
            nearest: false,
        };
        let left = x.max(0) as f32;
        let top = y.max(0) as f32;
        let right = left + w.max(1) as f32;
        let bottom = top + h.max(1) as f32;
        apply_occupancy_clip(
            &mut self.dcomp,
            left,
            top,
            right,
            bottom,
            radius,
            animate,
        )
    }

    pub fn present_cpu_nv12(
        &mut self,
        width: u32,
        height: u32,
        nv12: &[u8],
        dest: Letterbox,
    ) -> WinResult<()> {
        if self.vp_ok && self.blit_cpu_vp(width, height, nv12, dest).is_ok() {
            self.last_cpu = Some(nv12.to_vec());
            self.last_video = None;
            return self.present_with_hairline(dest);
        }
        if self.vp_ok {
            self.vp_ok = false;
            tracing::warn!("Video Processor 出画失败，改 YUV shader");
        }
        self.upload_planes(width, height, nv12)?;
        self.draw_shader(dest)?;
        self.last_cpu = Some(nv12.to_vec());
        self.last_video = None;
        self.present_with_hairline(dest)
    }

    pub fn present_gpu_nv12(
        &mut self,
        texture: &ID3D11Texture2D,
        subresource: u32,
        dest: Letterbox,
    ) -> WinResult<()> {
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe {
            texture.GetDesc(&mut desc);
        }
        if desc.Width != self.video_w || desc.Height != self.video_h {
            self.video_w = even_px(desc.Width);
            self.video_h = even_px(desc.Height);
            self.vp_enum = None;
            self.processor = None;
        }
        if self.vp_ok {
            match self.blit_texture_vp(texture, subresource, dest) {
                Ok(()) => {
                    self.last_cpu = None;
                    self.last_video = Some((texture.clone(), subresource));
                    return self.present_with_hairline(dest);
                }
                Err(e) => {
                    tracing::debug!(error = %e, "Video Processor 本帧失败，改 staging+shader");
                }
            }
        }
        let nv12 = destage_nv12(
            &self.device,
            &self.context,
            texture,
            subresource,
            self.video_w,
            self.video_h,
        )?;
        self.upload_planes(self.video_w, self.video_h, &nv12)?;
        self.draw_shader(dest)?;
        self.last_cpu = Some(nv12);
        self.last_video = None;
        self.present_with_hairline(dest)
    }

    /// ResizeBuffers 之后立刻把上一帧按新 letterbox 画回去。
    /// 禁止让 DXGI_SCALING_STRETCH 把旧回缓冲拉扁冒充占用过渡。
    pub fn replay_last(&mut self, dest: Letterbox) -> WinResult<bool> {
        if let Some((texture, subresource)) = self.last_video.clone() {
            self.present_gpu_nv12(&texture, subresource, dest)?;
            return Ok(true);
        }
        let Some(nv12) = self.last_cpu.clone() else {
            return Ok(false);
        };
        let width = self.video_w;
        let height = self.video_h;
        if width == 0 || height == 0 {
            return Ok(false);
        }
        self.present_cpu_nv12(width, height, &nv12, dest)?;
        Ok(true)
    }

    fn blit_cpu_vp(
        &mut self,
        width: u32,
        height: u32,
        nv12: &[u8],
        dest: Letterbox,
    ) -> WinResult<()> {
        self.ensure_nv12(width, height)?;
        let y_size = self.video_w as usize * self.video_h as usize;
        let need = y_size + y_size / 2;
        if nv12.len() < need {
            return Err(windows::core::Error::from_win32());
        }
        let Some(tex) = self.nv12.as_ref() else {
            return Err(windows::core::Error::from_win32());
        };
        unsafe {
            self.context.UpdateSubresource(
                tex,
                0,
                None,
                nv12.as_ptr() as *const _,
                self.video_w,
                0,
            );
        }
        let owned = tex.clone();
        self.blit_texture_vp(&owned, 0, dest)
    }

    fn blit_texture_vp(
        &mut self,
        texture: &ID3D11Texture2D,
        subresource: u32,
        dest: Letterbox,
    ) -> WinResult<()> {
        self.ensure_processor()?;
        let compose = self.ensure_compose()?;
        let video_device = self
            .video_device
            .clone()
            .ok_or_else(windows::core::Error::from_win32)?;
        let video_ctx = self
            .video_ctx
            .clone()
            .ok_or_else(windows::core::Error::from_win32)?;
        let enumerator = self
            .vp_enum
            .clone()
            .ok_or_else(windows::core::Error::from_win32)?;
        let processor = self
            .processor
            .clone()
            .ok_or_else(windows::core::Error::from_win32)?;
        let input_desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
            FourCC: 0,
            ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 {
                Texture2D: D3D11_TEX2D_VPIV {
                    MipSlice: 0,
                    ArraySlice: subresource,
                },
            },
        };
        let mut input = None;
        unsafe {
            video_device.CreateVideoProcessorInputView(
                texture,
                &enumerator,
                &input_desc,
                Some(&mut input),
            )?;
        }
        let input = input.ok_or_else(windows::core::Error::from_win32)?;
        let output_desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
            ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 {
                Texture2D: D3D11_TEX2D_VPOV { MipSlice: 0 },
            },
        };
        let mut output = None;
        unsafe {
            video_device.CreateVideoProcessorOutputView(
                &compose,
                &enumerator,
                &output_desc,
                Some(&mut output),
            )?;
        }
        let output = output.ok_or_else(windows::core::Error::from_win32)?;
        let src = RECT {
            left: 0,
            top: 0,
            right: self.video_w as i32,
            bottom: self.video_h as i32,
        };
        let dst = dest_rect(dest, self.buf_w, self.buf_h);
        let target = RECT {
            left: 0,
            top: 0,
            right: self.buf_w as i32,
            bottom: self.buf_h as i32,
        };
        let letterbox = self.letterbox_video_color();
        unsafe {
            video_ctx.VideoProcessorSetOutputTargetRect(&processor, true, Some(&target));
            video_ctx.VideoProcessorSetOutputBackgroundColor(&processor, false, &letterbox);
            video_ctx.VideoProcessorSetStreamFrameFormat(
                &processor,
                0,
                D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
            );
            video_ctx.VideoProcessorSetStreamAutoProcessingMode(&processor, 0, false);
            video_ctx.VideoProcessorSetStreamSourceRect(&processor, 0, true, Some(&src));
            video_ctx.VideoProcessorSetStreamDestRect(&processor, 0, true, Some(&dst));
        }
        if let Some(ctx1) = self.video_ctx1.as_ref() {
            unsafe {
                ctx1.VideoProcessorSetStreamColorSpace1(
                    &processor,
                    0,
                    DXGI_COLOR_SPACE_YCBCR_FULL_G22_LEFT_P709,
                );
                ctx1.VideoProcessorSetOutputColorSpace1(
                    &processor,
                    DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709,
                );
            }
        }
        let mut stream = D3D11_VIDEO_PROCESSOR_STREAM {
            Enable: true.into(),
            OutputIndex: 0,
            InputFrameOrField: 0,
            pInputSurface: ManuallyDrop::new(Some(input)),
            ..Default::default()
        };
        let blt = unsafe {
            video_ctx.VideoProcessorBlt(&processor, &output, 0, std::slice::from_ref(&stream))
        };
        unsafe {
            ManuallyDrop::drop(&mut stream.pInputSurface);
        }
        blt?;
        let back: ID3D11Texture2D = unsafe { self.swapchain.GetBuffer(0)? };
        unsafe {
            self.context.CopyResource(&back, &compose);
        }
        Ok(())
    }

    fn ensure_processor(&mut self) -> WinResult<()> {
        if self.processor.is_some() && self.vp_enum.is_some() {
            return Ok(());
        }
        let Some(video_device) = self.video_device.as_ref() else {
            return Err(windows::core::Error::from_win32());
        };
        let desc = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
            InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
            InputFrameRate: DXGI_RATIONAL {
                Numerator: 60,
                Denominator: 1,
            },
            InputWidth: self.video_w.max(2),
            InputHeight: self.video_h.max(2),
            OutputFrameRate: DXGI_RATIONAL {
                Numerator: 60,
                Denominator: 1,
            },
            // 输出矩形每帧用 SetOutputTargetRect 收口到当前 HWND。枚举器给足上限，
            // 避免占用过渡时跟 compose 一起重建。
            OutputWidth: 4096,
            OutputHeight: 4096,
            Usage: D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
        };
        let enumerator = unsafe { video_device.CreateVideoProcessorEnumerator(&desc)? };
        let processor = unsafe { video_device.CreateVideoProcessor(&enumerator, 0)? };
        self.vp_enum = Some(enumerator);
        self.processor = Some(processor);
        Ok(())
    }

    fn ensure_compose(&mut self) -> WinResult<ID3D11Texture2D> {
        if let Some(tex) = self.compose.as_ref() {
            return Ok(tex.clone());
        }
        let desc = D3D11_TEXTURE2D_DESC {
            Width: self.buf_w.max(1),
            Height: self.buf_h.max(1),
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let tex = create_texture(&self.device, &desc)?;
        self.compose = Some(tex.clone());
        Ok(tex)
    }

    fn ensure_nv12(&mut self, width: u32, height: u32) -> WinResult<()> {
        let width = width.max(2) & !1;
        let height = height.max(2) & !1;
        if self.video_w == width && self.video_h == height && self.nv12.is_some() {
            return Ok(());
        }
        self.vp_enum = None;
        self.processor = None;
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_NV12,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_DECODER.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        self.nv12 = match create_texture(&self.device, &desc) {
            Ok(tex) => Some(tex),
            Err(_) => {
                let mut desc = desc;
                desc.BindFlags = D3D11_BIND_SHADER_RESOURCE.0 as u32;
                Some(create_texture(&self.device, &desc)?)
            }
        };
        self.video_w = width;
        self.video_h = height;
        Ok(())
    }

    fn ensure_video_textures(&mut self, width: u32, height: u32) -> WinResult<()> {
        let width = width.max(2) & !1;
        let height = height.max(2) & !1;
        if self.video_w == width && self.video_h == height && self.tex_y.is_some() {
            return Ok(());
        }
        let (tex_y, srv_y) = create_plane(&self.device, width, height, DXGI_FORMAT_R8_UNORM)?;
        let (tex_uv, srv_uv) =
            create_plane(&self.device, width / 2, height / 2, DXGI_FORMAT_R8G8_UNORM)?;
        self.tex_y = Some(tex_y);
        self.tex_uv = Some(tex_uv);
        self.srv_y = Some(srv_y);
        self.srv_uv = Some(srv_uv);
        self.video_w = width;
        self.video_h = height;
        Ok(())
    }

    fn upload_planes(&mut self, width: u32, height: u32, nv12: &[u8]) -> WinResult<()> {
        self.ensure_video_textures(width, height)?;
        let y_size = self.video_w as usize * self.video_h as usize;
        let need = y_size + y_size / 2;
        if nv12.len() < need {
            tracing::warn!(
                len = nv12.len(),
                need,
                width = self.video_w,
                height = self.video_h,
                "NV12 长度不足，跳过上传"
            );
            return Ok(());
        }
        let Some(tex_y) = self.tex_y.as_ref() else {
            return Ok(());
        };
        let Some(tex_uv) = self.tex_uv.as_ref() else {
            return Ok(());
        };
        unsafe {
            self.context.UpdateSubresource(
                tex_y,
                0,
                None,
                nv12.as_ptr() as *const _,
                self.video_w,
                0,
            );
            self.context.UpdateSubresource(
                tex_uv,
                0,
                None,
                nv12[y_size..].as_ptr() as *const _,
                self.video_w,
                0,
            );
        }
        Ok(())
    }

    fn draw_shader(&self, dest: Letterbox) -> WinResult<()> {
        let Some(rtv) = self.rtv.as_ref() else {
            return Err(windows::core::Error::from_win32());
        };
        let Some(srv_y) = self.srv_y.as_ref() else {
            return Ok(());
        };
        let Some(srv_uv) = self.srv_uv.as_ref() else {
            return Ok(());
        };
        let letterbox = self.letterbox_rgba();
        unsafe {
            self.context.ClearRenderTargetView(rtv, &letterbox);
            self.context
                .OMSetRenderTargets(Some(&[Some(rtv.clone())]), None);
            let vp = D3D11_VIEWPORT {
                TopLeftX: dest.x as f32,
                TopLeftY: dest.y as f32,
                Width: dest.width.max(1) as f32,
                Height: dest.height.max(1) as f32,
                MinDepth: 0.0,
                MaxDepth: 1.0,
            };
            self.context.RSSetViewports(Some(&[vp]));
            self.context.VSSetShader(&self.vs, None);
            self.context.PSSetShader(&self.ps, None);
            self.context
                .PSSetShaderResources(0, Some(&[Some(srv_y.clone()), Some(srv_uv.clone())]));
            let samp = if dest.nearest {
                &self.samp_point
            } else {
                &self.samp_linear
            };
            self.context.PSSetSamplers(0, Some(&[Some(samp.clone())]));
            self.context
                .IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            self.context.Draw(3, 0);
        }
        Ok(())
    }

    fn present_with_hairline(&mut self, dest: Letterbox) -> WinResult<()> {
        // clip 动画期间边由 DWM 裁；CPU 描边会和 composition 时钟抢边。
        if self.panel_stroke > 0.0 && self.panel_border != 0 && !clip_animating(&self.dcomp) {
            if self.chrome.is_none() {
                self.chrome = Some(ChromePainter::new()?);
            }
            if let Some(painter) = self.chrome.as_ref() {
                painter.stroke(
                    &self.context,
                    &self.swapchain,
                    dest,
                    self.panel_r,
                    self.panel_stroke,
                    self.panel_border,
                )?;
            }
        }
        self.present()
    }

    fn present(&self) -> WinResult<()> {
        // 树未改时只 Present；clip/resize 已在 apply_clip / rebind 里 Commit。
        unsafe { self.swapchain.Present(0, DXGI_PRESENT(0)).ok() }
    }

    pub fn screenshot_bgra(&mut self) -> WinResult<(u32, u32, Vec<u8>)> {
        let width = self.video_w;
        let height = self.video_h;
        if width == 0 || height == 0 {
            return Err(windows::core::Error::from_win32());
        }
        let nv12 = if let Some(cpu) = self.last_cpu.as_ref() {
            cpu.clone()
        } else {
            let Some((texture, subresource)) = self.last_video.clone() else {
                return Err(windows::core::Error::from_win32());
            };
            destage_nv12(
                &self.device,
                &self.context,
                &texture,
                subresource,
                width,
                height,
            )?
        };
        Ok((width, height, nv12_to_bgra(width, height, &nv12)))
    }
}

fn even_px(n: u32) -> u32 {
    n.max(2) & !1
}

fn dest_rect(dest: Letterbox, buf_w: u32, buf_h: u32) -> RECT {
    let x = dest.x.max(0) as u32 & !1;
    let y = dest.y.max(0) as u32 & !1;
    let mut w = even_px(dest.width);
    let mut h = even_px(dest.height);
    if x + w > buf_w {
        w = even_px(buf_w.saturating_sub(x));
    }
    if y + h > buf_h {
        h = even_px(buf_h.saturating_sub(y));
    }
    RECT {
        left: x as i32,
        top: y as i32,
        right: (x + w) as i32,
        bottom: (y + h) as i32,
    }
}

fn attach_dcomp(
    dxgi: &IDXGIDevice,
    hwnd: HWND,
    swapchain: &IDXGISwapChain1,
    width: u32,
    height: u32,
    radius: u32,
) -> WinResult<DcompTree> {
    let device: IDCompositionDevice = unsafe { DCompositionCreateDevice(dxgi)? };
    let target = unsafe { device.CreateTargetForHwnd(hwnd, true)? };
    let visual = unsafe { device.CreateVisual()? };
    let clip = unsafe { device.CreateRectangleClip()? };
    unsafe {
        visual.SetContent(swapchain)?;
        visual.SetClip(&clip)?;
        target.SetRoot(&visual)?;
    }
    let mut tree = DcompTree {
        device,
        _target: target,
        _visual: visual,
        clip,
        clip_from: (-1.0, -1.0, -1.0, -1.0),
        clip_to: (-1.0, -1.0, -1.0, -1.0),
        clip_radius: -1.0,
        clip_anim_at: None,
    };
    apply_occupancy_clip(
        &mut tree,
        0.0,
        0.0,
        width.max(1) as f32,
        height.max(1) as f32,
        radius,
        false,
    )?;
    Ok(tree)
}

fn clip_close(a: (f32, f32, f32, f32), b: (f32, f32, f32, f32)) -> bool {
    (a.0 - b.0).abs() < 0.5
        && (a.1 - b.1).abs() < 0.5
        && (a.2 - b.2).abs() < 0.5
        && (a.3 - b.3).abs() < 0.5
}

/// 与 `AddCubic` 的 3t²−2t³ 同式，打断时才能采样到 composition 正在跑的值。
fn clip_smoothstep(u: f32) -> f32 {
    let s = u.clamp(0.0, 1.0);
    s * s * (3.0 - 2.0 * s)
}

fn clip_progress(tree: &DcompTree) -> Option<f32> {
    let at = tree.clip_anim_at?;
    let u = (at.elapsed().as_secs_f32() / (SPATIAL_PANEL_MS as f32 / 1000.0)).clamp(0.0, 1.0);
    Some(u)
}

fn clip_animating(tree: &DcompTree) -> bool {
    clip_progress(tree).is_some_and(|u| u < 1.0)
}

fn clip_now(tree: &DcompTree) -> (f32, f32, f32, f32) {
    let Some(u) = clip_progress(tree) else {
        return tree.clip_to;
    };
    if u >= 1.0 {
        return tree.clip_to;
    }
    let e = clip_smoothstep(u);
    let (fl, ft, fr, fb) = tree.clip_from;
    let (tl, tt, tr, tb) = tree.clip_to;
    (
        fl + (tl - fl) * e,
        ft + (tt - ft) * e,
        fr + (tr - fr) * e,
        fb + (tb - fb) * e,
    )
}

fn animate_scalar(
    device: &IDCompositionDevice,
    from: f32,
    to: f32,
) -> WinResult<IDCompositionAnimation> {
    let dur = SPATIAL_PANEL_MS as f32 / 1000.0;
    let delta = to - from;
    let t2 = dur * dur;
    let t3 = t2 * dur;
    let anim = unsafe { device.CreateAnimation()? };
    unsafe {
        // x(t) = a t³ + b t² + c t + d，t 为秒。零端点斜率 = smoothstep。
        anim.AddCubic(0.0, from, 0.0, 3.0 * delta / t2, -2.0 * delta / t3)?;
        anim.End(dur as f64, to)?;
    }
    Ok(anim)
}

fn apply_clip_radius(clip: &IDCompositionRectangleClip, r: f32) -> WinResult<()> {
    unsafe {
        clip.SetTopLeftRadiusX2(r)?;
        clip.SetTopLeftRadiusY2(r)?;
        clip.SetTopRightRadiusX2(r)?;
        clip.SetTopRightRadiusY2(r)?;
        clip.SetBottomLeftRadiusX2(r)?;
        clip.SetBottomLeftRadiusY2(r)?;
        clip.SetBottomRightRadiusX2(r)?;
        clip.SetBottomRightRadiusY2(r)?;
    }
    Ok(())
}

fn apply_occupancy_clip(
    tree: &mut DcompTree,
    left: f32,
    top: f32,
    right: f32,
    bottom: f32,
    radius: u32,
    animate: bool,
) -> WinResult<bool> {
    let to = (left, top, right, bottom);
    let r = radius as f32;
    let radius_changed = (tree.clip_radius - r).abs() >= 0.5;
    if clip_close(to, tree.clip_to) {
        if clip_animating(tree) {
            if radius_changed {
                apply_clip_radius(&tree.clip, r)?;
                tree.clip_radius = r;
                unsafe {
                    tree.device.Commit()?;
                }
            }
            return Ok(false);
        }
        if !radius_changed {
            return Ok(false);
        }
        apply_clip_radius(&tree.clip, r)?;
        tree.clip_radius = r;
        unsafe {
            tree.device.Commit()?;
        }
        return Ok(false);
    }

    let from = clip_now(tree);
    apply_clip_radius(&tree.clip, r)?;
    tree.clip_radius = r;
    unsafe {
        if animate && !clip_close(from, to) {
            let left_a = animate_scalar(&tree.device, from.0, to.0)?;
            let top_a = animate_scalar(&tree.device, from.1, to.1)?;
            let right_a = animate_scalar(&tree.device, from.2, to.2)?;
            let bottom_a = animate_scalar(&tree.device, from.3, to.3)?;
            tree.clip.SetLeft(&left_a)?;
            tree.clip.SetTop(&top_a)?;
            tree.clip.SetRight(&right_a)?;
            tree.clip.SetBottom(&bottom_a)?;
            tree.clip_from = from;
            tree.clip_to = to;
            tree.clip_anim_at = Some(Instant::now());
            tracing::info!(
                left = to.0,
                top = to.1,
                right = to.2,
                bottom = to.3,
                "占用盒 DComp clip spatial-panel"
            );
        } else {
            tree.clip.SetLeft2(left)?;
            tree.clip.SetTop2(top)?;
            tree.clip.SetRight2(right)?;
            tree.clip.SetBottom2(bottom)?;
            tree.clip_from = to;
            tree.clip_to = to;
            tree.clip_anim_at = None;
        }
        tree.device.Commit()?;
    }
    Ok(true)
}

fn destage_nv12(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    texture: &ID3D11Texture2D,
    subresource: u32,
    width: u32,
    height: u32,
) -> WinResult<Vec<u8>> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: width.max(2) & !1,
        Height: height.max(2) & !1,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_NV12,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };
    let staging = create_texture(device, &desc)?;
    unsafe {
        context.CopySubresourceRegion(&staging, 0, 0, 0, 0, texture, subresource, None);
    }
    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe {
        context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
    }
    let packed = pack_nv12_mapped(&mapped, desc.Width, desc.Height);
    unsafe {
        context.Unmap(&staging, 0);
    }
    Ok(packed)
}

fn pack_nv12_mapped(mapped: &D3D11_MAPPED_SUBRESOURCE, width: u32, height: u32) -> Vec<u8> {
    let w = width as usize;
    let h = height as usize;
    let pitch = mapped.RowPitch as usize;
    let src = mapped.pData as *const u8;
    let mut out = vec![0u8; w * h * 3 / 2];
    for y in 0..h {
        let row = unsafe { std::slice::from_raw_parts(src.add(y * pitch), w) };
        out[y * w..(y + 1) * w].copy_from_slice(row);
    }
    let uv = w * h;
    for y in 0..h / 2 {
        let row = unsafe { std::slice::from_raw_parts(src.add((h + y) * pitch), w) };
        let o = uv + y * w;
        out[o..o + w].copy_from_slice(row);
    }
    out
}

fn nv12_to_bgra(width: u32, height: u32, nv12: &[u8]) -> Vec<u8> {
    let w = width as usize;
    let h = height as usize;
    let y_size = w * h;
    let mut out = vec![0u8; y_size * 4];
    if nv12.len() < y_size + y_size / 2 {
        return out;
    }
    for y in 0..h {
        for x in 0..w {
            let luma = nv12[y * w + x] as f32 / 255.0;
            let uv_i = y_size + (y / 2) * w + (x & !1);
            let u = nv12[uv_i] as f32 / 255.0 - 0.5;
            let v = nv12[uv_i + 1] as f32 / 255.0 - 0.5;
            let r = (luma + 1.5748 * v).clamp(0.0, 1.0);
            let g = (luma - 0.1873 * u - 0.4681 * v).clamp(0.0, 1.0);
            let b = (luma + 1.8556 * u).clamp(0.0, 1.0);
            let i = (y * w + x) * 4;
            out[i] = (b * 255.0) as u8;
            out[i + 1] = (g * 255.0) as u8;
            out[i + 2] = (r * 255.0) as u8;
            out[i + 3] = 255;
        }
    }
    out
}

fn create_device() -> WinResult<(ID3D11Device, ID3D11DeviceContext)> {
    let video = D3D11_CREATE_DEVICE_FLAG(
        D3D11_CREATE_DEVICE_BGRA_SUPPORT.0 | D3D11_CREATE_DEVICE_VIDEO_SUPPORT.0,
    );
    match create_device_with(video) {
        Ok(pair) => Ok(pair),
        Err(_) => create_device_with(D3D11_CREATE_DEVICE_BGRA_SUPPORT),
    }
}

fn create_device_with(
    flags: D3D11_CREATE_DEVICE_FLAG,
) -> WinResult<(ID3D11Device, ID3D11DeviceContext)> {
    let mut device = None;
    let mut context = None;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            Default::default(),
            flags,
            Some(&[D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0]),
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;
    }
    Ok((
        device.ok_or_else(windows::core::Error::from_win32)?,
        context.ok_or_else(windows::core::Error::from_win32)?,
    ))
}

fn create_dxgi_manager(device: &ID3D11Device) -> Option<IMFDXGIDeviceManager> {
    let mut token = 0u32;
    let mut manager = None;
    unsafe { MFCreateDXGIDeviceManager(&mut token, &mut manager) }.ok()?;
    let manager = manager?;
    let unknown: windows::core::IUnknown = device.cast().ok()?;
    unsafe { manager.ResetDevice(&unknown, token) }.ok()?;
    Some(manager)
}

fn compile_vs(device: &ID3D11Device) -> WinResult<ID3D11VertexShader> {
    let blob = compile(VS, "vs_5_0")?;
    let mut vs = None;
    unsafe {
        device.CreateVertexShader(blob_bytes(&blob), None, Some(&mut vs))?;
    }
    vs.ok_or_else(windows::core::Error::from_win32)
}

fn compile_ps(device: &ID3D11Device) -> WinResult<ID3D11PixelShader> {
    let blob = compile(PS, "ps_5_0")?;
    let mut ps = None;
    unsafe {
        device.CreatePixelShader(blob_bytes(&blob), None, Some(&mut ps))?;
    }
    ps.ok_or_else(windows::core::Error::from_win32)
}

fn compile(src: &str, target: &str) -> WinResult<windows::Win32::Graphics::Direct3D::ID3DBlob> {
    let mut blob = None;
    let mut err = None;
    let hr = unsafe {
        D3DCompile(
            src.as_ptr() as *const _,
            src.len(),
            windows::core::PCSTR::null(),
            None,
            None,
            s!("main"),
            if target == "vs_5_0" {
                s!("vs_5_0")
            } else {
                s!("ps_5_0")
            },
            0,
            0,
            &mut blob,
            Some(&mut err),
        )
    };
    if hr.is_err() {
        if let Some(err) = err {
            let msg = unsafe {
                std::slice::from_raw_parts(err.GetBufferPointer() as *const u8, err.GetBufferSize())
            };
            tracing::error!("HLSL: {}", String::from_utf8_lossy(msg));
        }
        hr?;
    }
    blob.ok_or_else(windows::core::Error::from_win32)
}

fn blob_bytes(blob: &windows::Win32::Graphics::Direct3D::ID3DBlob) -> &[u8] {
    unsafe {
        std::slice::from_raw_parts(blob.GetBufferPointer() as *const u8, blob.GetBufferSize())
    }
}

fn sampler(device: &ID3D11Device, point: bool) -> WinResult<ID3D11SamplerState> {
    let desc = D3D11_SAMPLER_DESC {
        Filter: if point {
            D3D11_FILTER_MIN_MAG_MIP_POINT
        } else {
            D3D11_FILTER_MIN_MAG_MIP_LINEAR
        },
        AddressU: windows::Win32::Graphics::Direct3D11::D3D11_TEXTURE_ADDRESS_CLAMP,
        AddressV: windows::Win32::Graphics::Direct3D11::D3D11_TEXTURE_ADDRESS_CLAMP,
        AddressW: windows::Win32::Graphics::Direct3D11::D3D11_TEXTURE_ADDRESS_CLAMP,
        MipLODBias: 0.0,
        MaxAnisotropy: 1,
        ComparisonFunc: windows::Win32::Graphics::Direct3D11::D3D11_COMPARISON_NEVER,
        BorderColor: [0.0; 4],
        MinLOD: 0.0,
        MaxLOD: f32::MAX,
    };
    let mut samp = None;
    unsafe {
        device.CreateSamplerState(&desc, Some(&mut samp))?;
    }
    samp.ok_or_else(windows::core::Error::from_win32)
}

fn create_texture(
    device: &ID3D11Device,
    desc: &D3D11_TEXTURE2D_DESC,
) -> WinResult<ID3D11Texture2D> {
    let mut tex = None;
    unsafe {
        device.CreateTexture2D(desc, None, Some(&mut tex))?;
    }
    tex.ok_or_else(windows::core::Error::from_win32)
}

fn create_plane(
    device: &ID3D11Device,
    width: u32,
    height: u32,
    format: DXGI_FORMAT,
) -> WinResult<(ID3D11Texture2D, ID3D11ShaderResourceView)> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: width.max(1),
        Height: height.max(1),
        MipLevels: 1,
        ArraySize: 1,
        Format: format,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
        CPUAccessFlags: 0,
        MiscFlags: 0,
    };
    let tex = create_texture(device, &desc)?;
    let srv_desc = D3D11_SHADER_RESOURCE_VIEW_DESC {
        Format: format,
        ViewDimension: D3D_SRV_DIMENSION_TEXTURE2D,
        Anonymous: D3D11_SHADER_RESOURCE_VIEW_DESC_0 {
            Texture2D: D3D11_TEX2D_SRV {
                MostDetailedMip: 0,
                MipLevels: 1,
            },
        },
    };
    let mut srv = None;
    unsafe {
        device.CreateShaderResourceView(&tex, Some(&srv_desc), Some(&mut srv))?;
    }
    Ok((tex, srv.ok_or_else(windows::core::Error::from_win32)?))
}
