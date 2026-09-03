//! 投屏模块 wire 类型（官方 scrcpy-server 4.1 协议；客户端自写；呈现见 ADR-v6-024）。

use serde::{Deserialize, Serialize};

/// 启动结果（对标 [`crate::CaptureStart`]：adopt = 已有 Live 会话）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MirrorStart {
    pub serial: String,
    pub generation: u64,
    pub adopted: bool,
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

/// `mirror.start` 请求。编码参数由壳用 `yohu-domain::start_encode` 展开，UI 不传质量数字。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MirrorStartRequest {
    pub serial: String,
    pub control: bool,
    pub connection: String,
    pub session_quality_touched: bool,
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

/// `mirror.inject` 的设备目标。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MirrorInjectRequest {
    pub serial: String,
    pub message: MirrorControlMessage,
}

/// 可用区相对主窗客户区的物理像素矩形（`mirror.layout`）。HWND 是 WS_CHILD，壳按 insets contain。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MirrorLayout {
    pub serial: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub visible: bool,
    pub control: bool,
    /// HWND 圆角直径用的物理像素半径；0 表示直角（全屏或隐藏）。
    #[serde(default)]
    pub corner_radius: u32,
}

/// 壳内截图落盘。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MirrorScreenshotRequest {
    pub serial: String,
    pub path: String,
}

impl Default for MirrorStartRequest {
    fn default() -> Self {
        Self {
            serial: String::new(),
            control: false,
            connection: "usb".into(),
            session_quality_touched: false,
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

    #[test]
    fn start_request_is_slim() {
        let req = MirrorStartRequest {
            serial: "S1".into(),
            control: true,
            connection: "tcp:192.168.1.8:5555".into(),
            session_quality_touched: false,
        };
        assert_eq!(
            serde_json::to_value(&req).unwrap(),
            serde_json::json!({
                "serial": "S1",
                "control": true,
                "connection": "tcp:192.168.1.8:5555",
                "session_quality_touched": false
            })
        );
    }

    #[test]
    fn layout_includes_corner_radius() {
        let layout = MirrorLayout {
            serial: "S1".into(),
            x: 10,
            y: 20,
            width: 300,
            height: 600,
            visible: true,
            control: true,
            corner_radius: 24,
        };
        assert_eq!(
            serde_json::to_value(&layout).unwrap(),
            serde_json::json!({
                "serial": "S1",
                "x": 10,
                "y": 20,
                "width": 300,
                "height": 600,
                "visible": true,
                "control": true,
                "corner_radius": 24
            })
        );
    }
}
