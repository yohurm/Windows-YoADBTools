//! 解码会话：FramePipe + MF。与 HWND 寿命分家；本模块不持窗口。

#![cfg(windows)]

use std::sync::Arc;
use std::time::Instant;

use windows::Win32::Media::MediaFoundation::IMFDXGIDeviceManager;
use yohu_mirror::{EncodedFrame, FramePipe};

use super::mf::{DecodedPicture, MfDecoder};

pub struct DecodeBind {
    pub pipe: Arc<FramePipe>,
    pub tick: DecodeTick,
}

impl DecodeBind {
    pub fn new(pipe: Arc<FramePipe>) -> Self {
        Self {
            pipe,
            tick: DecodeTick::new(),
        }
    }

    pub fn pull(&self) -> Vec<EncodedFrame> {
        let mut frames = Vec::new();
        while let Some(frame) = self.pipe.try_recv() {
            frames.push(frame);
        }
        frames
    }
}

pub struct DecodeTick {
    decoder: Option<MfDecoder>,
    failed: bool,
    last_config: Option<Vec<u8>>,
    first_nv12: bool,
    started: Instant,
    fed: u32,
    decoded: u32,
}

impl DecodeTick {
    pub fn new() -> Self {
        Self {
            decoder: None,
            failed: false,
            last_config: None,
            first_nv12: false,
            started: Instant::now(),
            fed: 0,
            decoded: 0,
        }
    }

    pub fn ingest(
        &mut self,
        manager: Option<&IMFDXGIDeviceManager>,
        frames: Vec<EncodedFrame>,
    ) -> Option<(u32, u32, DecodedPicture)> {
        let mut last = None;
        let mut out_w = 0;
        let mut out_h = 0;
        for frame in select_live_frames(&mut self.last_config, frames) {
            if let Some(pic) = self.decode(manager, frame) {
                if let Some(dec) = self.decoder.as_ref() {
                    out_w = dec.width;
                    out_h = dec.height;
                }
                last = Some(pic);
            }
        }
        last.map(|pic| (out_w, out_h, pic))
    }

    pub fn drain(&mut self) -> Option<(u32, u32, DecodedPicture)> {
        let dec = self.decoder.as_mut()?;
        match dec.drain() {
            Ok(Some(pic)) => {
                self.decoded += 1;
                Some((dec.width, dec.height, pic))
            }
            Ok(None) => None,
            Err(e) => {
                tracing::error!(error = %e, "MF drain 失败");
                self.decoder = None;
                self.failed = true;
                None
            }
        }
    }

    pub fn log_beat(&mut self) {
        if self.fed > 0 || self.decoded > 0 {
            tracing::info!(fed = self.fed, decoded = self.decoded, "MF 解码节拍");
        }
        self.fed = 0;
        self.decoded = 0;
    }

    pub fn note_first_nv12(&mut self, width: u32, height: u32, gpu: bool) {
        if self.first_nv12 {
            return;
        }
        self.first_nv12 = true;
        tracing::info!(
            elapsed_ms = self.started.elapsed().as_millis() as u64,
            width,
            height,
            gpu,
            "MF 首帧"
        );
    }

    fn decode(
        &mut self,
        manager: Option<&IMFDXGIDeviceManager>,
        frame: EncodedFrame,
    ) -> Option<DecodedPicture> {
        if self.decoder.as_ref().map(|d| (d.width, d.height)) != Some((frame.width, frame.height)) {
            self.decoder = None;
            self.failed = false;
        }
        if self.decoder.is_none() && !self.failed && frame.width > 0 && frame.height > 0 {
            let hevc = frame.codec == 1;
            match MfDecoder::open_with(hevc, frame.width, frame.height, manager) {
                Ok(dec) => {
                    tracing::info!(
                        hevc,
                        async_mft = dec.is_async(),
                        d3d11 = dec.uses_d3d(),
                        width = frame.width,
                        height = frame.height,
                        elapsed_ms = self.started.elapsed().as_millis() as u64,
                        "MF 解码器已启动"
                    );
                    self.decoder = Some(dec);
                }
                Err(e) => {
                    tracing::error!(
                        error = %e,
                        width = frame.width,
                        height = frame.height,
                        hevc = frame.codec == 1,
                        "MF 解码器启动失败，本会话不再重试"
                    );
                    self.failed = true;
                    return None;
                }
            }
        }
        let dec = self.decoder.as_mut()?;
        let payload = access_unit(self.last_config.as_deref(), &frame.payload, frame.keyframe);
        self.fed += 1;
        match dec.feed(&payload, frame.keyframe) {
            Ok(Some(pic)) => {
                self.decoded += 1;
                Some(pic)
            }
            Ok(None) => None,
            Err(e) => {
                tracing::error!(error = %e, "MF 解码失败，本会话不再重试");
                self.decoder = None;
                self.failed = true;
                None
            }
        }
    }
}

fn select_live_frames(
    last_config: &mut Option<Vec<u8>>,
    frames: Vec<EncodedFrame>,
) -> Vec<EncodedFrame> {
    for frame in &frames {
        if frame.config {
            *last_config = Some(frame.payload.clone());
        }
    }
    frames.into_iter().filter(|f| !f.config).collect()
}

fn access_unit(config: Option<&[u8]>, payload: &[u8], keyframe: bool) -> Vec<u8> {
    if keyframe {
        if let Some(cfg) = config {
            let mut au = Vec::with_capacity(cfg.len() + payload.len());
            au.extend_from_slice(cfg);
            au.extend_from_slice(payload);
            return au;
        }
    }
    payload.to_vec()
}
