//! scrcpy 4.1 视频解复用（12 字节 BE 帧头；与官方 `demuxer.c` / `Streamer.java` 对齐）。

use yohu_protocol::scrcpy;

/// 媒体包上限（防异常 size 刷爆内存）。
pub const MAX_PACKET_SIZE: u32 = 10 * 1024 * 1024;

pub const PACKET_FLAG_CONFIG: u64 = 1 << 62;
pub const PACKET_FLAG_KEY_FRAME: u64 = 1 << 61;
pub const PACKET_PTS_MASK: u64 = PACKET_FLAG_KEY_FRAME - 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HeaderKind {
    Session {
        width: u32,
        height: u32,
        client_resized: bool,
    },
    Media {
        config: bool,
        keyframe: bool,
        pts: u64,
        size: u32,
    },
}

/// 解析 12 字节视频帧头。MSB=1 为 session（无 payload）；否则为 media。
pub fn parse_header(header: &[u8; 12]) -> Result<HeaderKind, String> {
    if header[0] & 0x80 != 0 {
        let width = u32::from_be_bytes([header[4], header[5], header[6], header[7]]);
        let height = u32::from_be_bytes([header[8], header[9], header[10], header[11]]);
        if width == 0 || height == 0 {
            return Err(format!("无效 session 尺寸: {width}x{height}"));
        }
        return Ok(HeaderKind::Session {
            width,
            height,
            client_resized: header[3] & 1 != 0,
        });
    }
    let pts_flags = u64::from_be_bytes(header[0..8].try_into().expect("8 bytes"));
    let size = u32::from_be_bytes([header[8], header[9], header[10], header[11]]);
    if size == 0 {
        return Err("媒体包长度为 0".into());
    }
    if size > MAX_PACKET_SIZE {
        return Err(format!("媒体包过大: {size}"));
    }
    let config = pts_flags & PACKET_FLAG_CONFIG != 0;
    let keyframe = pts_flags & PACKET_FLAG_KEY_FRAME != 0;
    let pts = if config {
        0
    } else {
        pts_flags & PACKET_PTS_MASK
    };
    Ok(HeaderKind::Media {
        config,
        keyframe,
        pts,
        size,
    })
}

pub fn codec_name(id: u32) -> Result<&'static str, String> {
    match id {
        scrcpy::CODEC_H264 => Ok("h264"),
        scrcpy::CODEC_H265 => Ok("h265"),
        scrcpy::CODEC_AV1 => Ok("av1"),
        0x0076_7038 => Ok("vp8"),
        0x0076_7039 => Ok("vp9"),
        0 => Err("设备关闭了视频流".into()),
        1 => Err("设备视频配置失败".into()),
        other => Err(format!("不支持的视频编码 0x{other:08x}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_header_be_width_height() {
        let mut h = [0u8; 12];
        h[0] = 0x80;
        h[4..8].copy_from_slice(&1080u32.to_be_bytes());
        h[8..12].copy_from_slice(&1920u32.to_be_bytes());
        match parse_header(&h).unwrap() {
            HeaderKind::Session { width, height, .. } => {
                assert_eq!((width, height), (1080, 1920));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn media_header_config_and_key_flags() {
        let mut h = [0u8; 12];
        let pts_flags = PACKET_FLAG_CONFIG;
        h[0..8].copy_from_slice(&pts_flags.to_be_bytes());
        h[8..12].copy_from_slice(&16u32.to_be_bytes());
        match parse_header(&h).unwrap() {
            HeaderKind::Media {
                config,
                keyframe,
                pts,
                size,
            } => {
                assert!(config);
                assert!(!keyframe);
                assert_eq!(pts, 0);
                assert_eq!(size, 16);
            }
            other => panic!("{other:?}"),
        }

        let mut k = [0u8; 12];
        let flags = 1_000u64 | PACKET_FLAG_KEY_FRAME;
        k[0..8].copy_from_slice(&flags.to_be_bytes());
        k[8..12].copy_from_slice(&4u32.to_be_bytes());
        match parse_header(&k).unwrap() {
            HeaderKind::Media {
                config,
                keyframe,
                pts,
                size,
            } => {
                assert!(!config);
                assert!(keyframe);
                assert_eq!(pts, 1_000);
                assert_eq!(size, 4);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn codec_h264_ascii() {
        assert_eq!(codec_name(scrcpy::CODEC_H264).unwrap(), "h264");
        assert!(codec_name(0).unwrap_err().contains("关闭"));
    }
}
