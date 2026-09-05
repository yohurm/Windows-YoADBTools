//! 投屏启动规划（壳服务）：domain 编码表 + 本机硬解能力 → 会话请求。
//!
//! 不进 `commands/`（IPC 只转发），也不进 `yohu-domain`（domain 不知解码器能力）。

use yohu_domain::{start_encode, start_force_forward};
use yohu_mirror::MirrorSessionRequest;
use yohu_protocol::{AppSettings, MirrorStartRequest};

pub fn plan_start(
    settings: &AppSettings,
    req: MirrorStartRequest,
    decoder_hevc: bool,
) -> MirrorSessionRequest {
    let enc = start_encode(settings, &req.connection, req.session_quality_touched);
    let mut codec = enc.video_codec.to_string();
    if codec.eq_ignore_ascii_case("h265") && !decoder_hevc {
        tracing::warn!(serial = %req.serial, "本机无 HEVC 硬解，改用 H.264");
        codec = "h264".into();
    }
    MirrorSessionRequest {
        serial: req.serial,
        control: req.control,
        force_forward: start_force_forward(settings, &req.connection),
        max_size: enc.max_size,
        video_bit_rate: enc.video_bit_rate,
        max_fps: enc.max_fps,
        video_codec: codec,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::AppSettings;

    #[test]
    fn usb_hevc_falls_back_when_decoder_missing() {
        let settings = AppSettings::default();
        let plan = plan_start(
            &settings,
            MirrorStartRequest {
                serial: "S1".into(),
                control: true,
                connection: "usb".into(),
                session_quality_touched: false,
            },
            false,
        );
        assert_eq!(plan.video_codec, "h264");
        assert_eq!(plan.serial, "S1");
        assert!(plan.control);
    }

    #[test]
    fn usb_keeps_hevc_when_decoder_ok() {
        let settings = AppSettings::default();
        let plan = plan_start(
            &settings,
            MirrorStartRequest {
                serial: "S1".into(),
                control: false,
                connection: "usb".into(),
                session_quality_touched: false,
            },
            true,
        );
        assert_eq!(plan.video_codec, "h265");
    }
}
