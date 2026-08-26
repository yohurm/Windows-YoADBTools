//! 投屏模块 wire 类型（官方 scrcpy-server 4.1 协议；客户端自写）。

use serde::{Deserialize, Serialize};

/// 启动结果（对标 [`crate::CaptureStart`]：adopt = 已有 Live 会话）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MirrorStart {
    pub serial: String,
    pub generation: u64,
    pub adopted: bool,
}

/// 会话快照。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MirrorStatus {
    pub serial: String,
    pub mirroring: bool,
    pub generation: u64,
    pub width: u32,
    pub height: u32,
    pub codec: String,
    pub control: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 控制面状态（`send().await` 必达）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MirrorSessionState {
    Starting,
    Live,
    Stopped,
    Failed,
}

/// `mirror.start` 请求。质量字段来自设置快照或页眉覆盖。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MirrorStartRequest {
    pub serial: String,
    /// 0 = 设备原始长边
    pub max_size: u32,
    pub video_bit_rate: u32,
    /// 0 = 不限制
    pub max_fps: u32,
    pub control: bool,
    pub force_forward: bool,
}

/// 编码包（data 为标准 Base64；禁止把原始字节走 JSON 数组）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MirrorPacket {
    pub serial: String,
    pub generation: u64,
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub config: bool,
    pub keyframe: bool,
    pub pts: u64,
    pub data_b64: String,
}

/// 控制注入（UI 只发语义，序列化在 core）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MirrorControlMessage {
    Touch {
        action: u8,
        x: u32,
        y: u32,
        width: u16,
        height: u16,
    },
    Key {
        keycode: u32,
        down: bool,
    },
    DisplayPower {
        on: bool,
    },
    BackOrScreenOn,
    ExpandNotification,
    ExpandSettings,
    CollapsePanels,
    RotateDevice,
}

/// `mirror.inject` / `mirror.savePng` 的设备目标。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MirrorInjectRequest {
    pub serial: String,
    pub message: MirrorControlMessage,
}

/// 画布截图落盘（bytes 已是 PNG）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MirrorSavePngRequest {
    pub path: String,
    pub data_b64: String,
}

impl Default for MirrorStartRequest {
    fn default() -> Self {
        Self {
            serial: String::new(),
            max_size: crate::default_mirror_max_size(),
            video_bit_rate: crate::default_mirror_video_bit_rate(),
            max_fps: crate::default_mirror_max_fps(),
            control: false,
            force_forward: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn control_message_internally_tagged() {
        let msg = MirrorControlMessage::DisplayPower { on: true };
        let v = serde_json::to_value(&msg).expect("json");
        assert_eq!(v["kind"], "display_power");
        assert_eq!(v["on"], true);
    }

    #[test]
    fn session_state_lowercase() {
        assert_eq!(
            serde_json::to_value(MirrorSessionState::Live).unwrap(),
            serde_json::json!("live")
        );
    }
}
