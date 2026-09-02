//! 投屏协议与编码参数（纯函数；无 IO）。

use yohu_protocol::{AppSettings, MirrorProtocol};

/// WebView2 硬解安全长边（约 High@L4.1 / DXVA 1920×1088 保证线）。
pub const EMBED_LONG_EDGE_CAP: u32 = 1920;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MirrorEncodeParams {
    pub max_size: u32,
    pub video_bit_rate: u32,
    pub max_fps: u32,
}

pub const USB_ENCODE: MirrorEncodeParams = MirrorEncodeParams {
    max_size: 1920,
    video_bit_rate: 8_000_000,
    max_fps: 0,
};

pub const WIFI_ENCODE: MirrorEncodeParams = MirrorEncodeParams {
    max_size: 1024,
    video_bit_rate: 2_000_000,
    max_fps: 30,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EncoderLimits {
    pub max_size: u32,
    pub max_fps: u32,
    pub capped: bool,
}

/// UI 质量选项 → 编码器实际参数。「原始」封顶 [`EMBED_LONG_EDGE_CAP`]；不限帧保持 0。
pub fn encoder_limits(max_size: u32, max_fps: u32) -> EncoderLimits {
    let size = if max_size == 0 {
        EMBED_LONG_EDGE_CAP
    } else {
        max_size
    };
    EncoderLimits {
        max_size: size,
        max_fps,
        capped: size != max_size,
    }
}

pub fn params_of(protocol: MirrorProtocol) -> MirrorEncodeParams {
    match protocol {
        MirrorProtocol::Usb => USB_ENCODE,
        MirrorProtocol::Wifi => WIFI_ENCODE,
    }
}

pub fn apply_protocol(settings: &mut AppSettings, protocol: MirrorProtocol) {
    let params = params_of(protocol);
    settings.mirror_max_size = params.max_size;
    settings.mirror_video_bit_rate = params.video_bit_rate;
    settings.mirror_max_fps = params.max_fps;
    settings.mirror_protocol = protocol;
}

pub fn is_tcp_connection(connection: &str) -> bool {
    connection.starts_with("tcp:")
}

/// 本会话 start 用的编码参数。tcp 且未改质量时用无线协议参数，不写回设置。
pub fn start_encode(
    settings: &AppSettings,
    connection: &str,
    session_quality_touched: bool,
) -> MirrorEncodeParams {
    if is_tcp_connection(connection)
        && !session_quality_touched
        && settings.mirror_protocol != MirrorProtocol::Wifi
    {
        return WIFI_ENCODE;
    }
    MirrorEncodeParams {
        max_size: settings.mirror_max_size,
        video_bit_rate: settings.mirror_video_bit_rate,
        max_fps: settings.mirror_max_fps,
    }
}

pub fn start_force_forward(settings: &AppSettings, connection: &str) -> bool {
    settings.mirror_force_forward || is_tcp_connection(connection)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn original_size_caps_at_1920_unlimited_fps_stays_zero() {
        assert_eq!(
            encoder_limits(0, 0),
            EncoderLimits {
                max_size: 1920,
                max_fps: 0,
                capped: true
            }
        );
        assert_eq!(
            encoder_limits(1920, 0),
            EncoderLimits {
                max_size: 1920,
                max_fps: 0,
                capped: false
            }
        );
        assert_eq!(
            encoder_limits(1024, 0),
            EncoderLimits {
                max_size: 1024,
                max_fps: 0,
                capped: false
            }
        );
    }

    #[test]
    fn protocol_params_are_fixed() {
        assert_eq!(params_of(MirrorProtocol::Usb), USB_ENCODE);
        assert_eq!(params_of(MirrorProtocol::Wifi), WIFI_ENCODE);
    }

    #[test]
    fn tcp_uses_wifi_unless_session_touched() {
        let s = AppSettings::default();
        assert_eq!(start_encode(&s, "usb", false), USB_ENCODE);
        assert_eq!(start_encode(&s, "tcp:192.168.1.8:5555", false), WIFI_ENCODE);
        assert_eq!(start_encode(&s, "tcp:1.1.1.1:5555", true), USB_ENCODE);
        assert!(start_force_forward(&s, "tcp:1.1.1.1:5555"));
        assert!(!start_force_forward(&s, "usb"));
    }
}
