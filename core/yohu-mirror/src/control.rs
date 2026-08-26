//! 控制消息序列化（scrcpy 4.1 `ControlMessageReader`：Java DataInputStream = 大端）。

use yohu_protocol::MirrorControlMessage;

const TYPE_INJECT_KEYCODE: u8 = 0;
const TYPE_INJECT_TOUCH: u8 = 2;
const TYPE_BACK_OR_SCREEN_ON: u8 = 4;
const TYPE_EXPAND_NOTIFICATION: u8 = 5;
const TYPE_EXPAND_SETTINGS: u8 = 6;
const TYPE_COLLAPSE_PANELS: u8 = 7;
const TYPE_SET_DISPLAY_POWER: u8 = 10;
const TYPE_ROTATE_DEVICE: u8 = 11;

/// Android `MotionEvent.BUTTON_PRIMARY`
pub const BUTTON_PRIMARY: i32 = 1;
/// scrcpy 鼠标指针 id（`-1` 的 i64 位型）。
pub const POINTER_ID_MOUSE: i64 = -1;
/// `MotionEvent.ACTION_DOWN/UP/MOVE`
pub const ACTION_DOWN: u8 = 0;
pub const ACTION_UP: u8 = 1;
pub const ACTION_MOVE: u8 = 2;

/// 把语义控制消息编成 server 可读的字节。
pub fn encode(message: &MirrorControlMessage) -> Vec<u8> {
    match message {
        MirrorControlMessage::Touch {
            action,
            x,
            y,
            width,
            height,
        } => encode_touch(*action, *x, *y, *width, *height),
        MirrorControlMessage::Key { keycode, down } => {
            encode_key(if *down { ACTION_DOWN } else { ACTION_UP }, *keycode)
        }
        MirrorControlMessage::DisplayPower { on } => {
            vec![TYPE_SET_DISPLAY_POWER, u8::from(*on)]
        }
        MirrorControlMessage::BackOrScreenOn => {
            // 单击：DOWN + UP（server 按 action 处理亮屏/返回）
            let mut bytes = encode_back_or_screen_on(ACTION_DOWN);
            bytes.extend_from_slice(&encode_back_or_screen_on(ACTION_UP));
            bytes
        }
        MirrorControlMessage::ExpandNotification => vec![TYPE_EXPAND_NOTIFICATION],
        MirrorControlMessage::ExpandSettings => vec![TYPE_EXPAND_SETTINGS],
        MirrorControlMessage::CollapsePanels => vec![TYPE_COLLAPSE_PANELS],
        MirrorControlMessage::RotateDevice => vec![TYPE_ROTATE_DEVICE],
    }
}

fn encode_key(action: u8, keycode: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(1 + 1 + 12);
    out.push(TYPE_INJECT_KEYCODE);
    out.push(action);
    out.extend_from_slice(&(keycode as i32).to_be_bytes());
    out.extend_from_slice(&0i32.to_be_bytes()); // repeat
    out.extend_from_slice(&0i32.to_be_bytes()); // metaState
    out
}

fn encode_touch(action: u8, x: u32, y: u32, width: u16, height: u16) -> Vec<u8> {
    let pressure: u16 = if action == ACTION_UP { 0 } else { 0xFFFF };
    let (action_button, buttons) = if action == ACTION_UP {
        (0i32, 0i32)
    } else {
        (BUTTON_PRIMARY, BUTTON_PRIMARY)
    };
    let mut out = Vec::with_capacity(32);
    out.push(TYPE_INJECT_TOUCH);
    out.push(action);
    out.extend_from_slice(&POINTER_ID_MOUSE.to_be_bytes());
    out.extend_from_slice(&(x as i32).to_be_bytes());
    out.extend_from_slice(&(y as i32).to_be_bytes());
    out.extend_from_slice(&width.to_be_bytes());
    out.extend_from_slice(&height.to_be_bytes());
    out.extend_from_slice(&pressure.to_be_bytes());
    out.extend_from_slice(&action_button.to_be_bytes());
    out.extend_from_slice(&buttons.to_be_bytes());
    out
}

fn encode_back_or_screen_on(action: u8) -> Vec<u8> {
    vec![TYPE_BACK_OR_SCREEN_ON, action]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_power_on_is_type_10_true() {
        let bytes = encode(&MirrorControlMessage::DisplayPower { on: true });
        assert_eq!(bytes, vec![10, 1]);
    }

    #[test]
    fn key_down_home_be() {
        let bytes = encode(&MirrorControlMessage::Key {
            keycode: 3,
            down: true,
        });
        assert_eq!(bytes[0], 0);
        assert_eq!(bytes[1], 0);
        assert_eq!(&bytes[2..6], &3i32.to_be_bytes());
        assert_eq!(bytes.len(), 14);
    }

    #[test]
    fn touch_down_layout() {
        let bytes = encode(&MirrorControlMessage::Touch {
            action: ACTION_DOWN,
            x: 10,
            y: 20,
            width: 1080,
            height: 1920,
        });
        assert_eq!(bytes[0], 2);
        assert_eq!(bytes[1], 0);
        assert_eq!(&bytes[2..10], &POINTER_ID_MOUSE.to_be_bytes());
        assert_eq!(&bytes[10..14], &10i32.to_be_bytes());
        assert_eq!(&bytes[14..18], &20i32.to_be_bytes());
        assert_eq!(&bytes[18..20], &1080u16.to_be_bytes());
        assert_eq!(&bytes[20..22], &1920u16.to_be_bytes());
        assert_eq!(&bytes[22..24], &0xFFFFu16.to_be_bytes());
    }

    #[test]
    fn empty_commands_are_single_byte() {
        assert_eq!(
            encode(&MirrorControlMessage::ExpandNotification),
            vec![5]
        );
        assert_eq!(encode(&MirrorControlMessage::RotateDevice), vec![11]);
    }
}
