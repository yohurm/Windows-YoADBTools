//! `adb devices -l` 输出解析。

use yohu_protocol::{DeviceInfo, DeviceState};

/// 解析 `adb devices -l` 输出（跳过表头/空行/守护进程行）。
///
/// 行形如：`R58M1234   device product:... model:Pixel_7 device:... transport_id:1`
pub fn parse_devices_list(output: &str) -> Vec<DeviceInfo> {
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty()
                || line.starts_with("List of devices")
                || line.starts_with("* daemon")
                || line.contains("adb server")
            {
                return None;
            }
            let mut parts = line.split_whitespace();
            let serial = parts.next()?.to_string();
            let state = match parts.next()? {
                "device" => DeviceState::Online,
                "unauthorized" => DeviceState::Unauthorized,
                _ => DeviceState::Offline,
            };
            let mut model = None;
            let mut connection = "usb".to_string();
            for attr in parts {
                if let Some(v) = attr.strip_prefix("model:") {
                    model = Some(v.replace('_', " "));
                } else if let Some(v) = attr.strip_prefix("usb:") {
                    connection = format!("usb:{v}");
                } else if let Some(v) = attr.strip_prefix("tcp:") {
                    connection = format!("tcp:{v}");
                } else if let Some(v) = attr.strip_prefix("transport_id:") {
                    // 无连接方式信息时以 transport 兜底展示
                    if connection == "usb" {
                        connection = format!("t:{v}");
                    }
                }
            }
            Some(DeviceInfo { serial, model, state, connection })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
List of devices attached
R58M1234A       device product:bluejay model:Pixel_7 device:bluejay transport_id:1
emulator-5554   device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emulator64_x86_64 transport_id:2
ZX1G22B9CD      unauthorized usb:1-2 transport_id:3
FAKE1234        offline
";

    #[test]
    fn parses_header_and_rows() {
        let devices = parse_devices_list(SAMPLE);
        assert_eq!(devices.len(), 4);
        assert_eq!(devices[0].serial, "R58M1234A");
        assert_eq!(devices[0].state, DeviceState::Online);
        assert_eq!(devices[0].model.as_deref(), Some("Pixel 7"));
        assert_eq!(devices[1].model.as_deref(), Some("sdk gphone64 x86 64"));
        assert_eq!(devices[2].state, DeviceState::Unauthorized);
        assert_eq!(devices[2].connection, "usb:1-2");
        assert_eq!(devices[3].state, DeviceState::Offline);
    }

    #[test]
    fn ignores_daemon_noise() {
        let devices = parse_devices_list("* daemon not running; starting now at tcp:5037\nList of devices attached\n\n");
        assert!(devices.is_empty());
    }
}
