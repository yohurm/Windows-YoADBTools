//! 在线设备运行时状态：一次 shell 脚本的分段输出。

use super::uimode::{parse_cmd_night, parse_dumpsys_uimode};

pub const MARK_UIMODE: &str = "__YOHU_UIMODE__";
pub const MARK_CMDNIGHT: &str = "__YOHU_CMDNIGHT__";
pub const MARK_BATTERY: &str = "__YOHU_BATTERY__";
pub const MARK_POWER: &str = "__YOHU_POWER__";
pub const MARK_PROPS: &str = "__YOHU_PROPS__";

/// 单次采样脚本（常量，无用户输入）。分段标记供 [`parse_status_bundle`] 切开。
pub const SAMPLE_SCRIPT: &str = concat!(
    "echo __YOHU_UIMODE__; dumpsys uimode; ",
    "echo __YOHU_CMDNIGHT__; cmd uimode night; ",
    "echo __YOHU_BATTERY__; dumpsys battery; ",
    "echo __YOHU_POWER__; dumpsys power | grep mWakefulness; dumpsys display | grep mScreenState; ",
    "echo __YOHU_PROPS__; getprop ro.build.version.sdk; getprop ro.build.version.release; getprop ro.product.brand",
);

/// dumpsys/getprop 解析结果（尚无 serial / generation）。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeviceStatusFields {
    pub night: Option<bool>,
    pub battery_pct: Option<u8>,
    pub charging: Option<bool>,
    pub sdk: Option<u32>,
    pub release: Option<String>,
    pub screen_on: Option<bool>,
    pub brand: Option<String>,
}

/// 按采样标记切开 stdout，缺段或格式漂移则对应字段为 None。
pub fn parse_status_bundle(output: &str) -> DeviceStatusFields {
    let mut uimode = String::new();
    let mut cmdnight = String::new();
    let mut battery = String::new();
    let mut power = String::new();
    let mut props = String::new();
    let mut current: Option<u8> = None;
    for line in output.lines() {
        let marker = line.trim();
        if marker == MARK_UIMODE {
            current = Some(0);
            continue;
        }
        if marker == MARK_CMDNIGHT {
            current = Some(1);
            continue;
        }
        if marker == MARK_BATTERY {
            current = Some(2);
            continue;
        }
        if marker == MARK_POWER {
            current = Some(3);
            continue;
        }
        if marker == MARK_PROPS {
            current = Some(4);
            continue;
        }
        let buf = match current {
            Some(0) => &mut uimode,
            Some(1) => &mut cmdnight,
            Some(2) => &mut battery,
            Some(3) => &mut power,
            Some(4) => &mut props,
            _ => continue,
        };
        buf.push_str(line);
        buf.push('\n');
    }
    let night = parse_dumpsys_uimode(&uimode).or_else(|| parse_cmd_night(&cmdnight));
    let (battery_pct, charging) = parse_battery(&battery);
    let (sdk, release, brand) = parse_props(&props);
    DeviceStatusFields {
        night,
        battery_pct,
        charging,
        sdk,
        release,
        screen_on: parse_screen_on(&power),
        brand,
    }
}

fn parse_battery(output: &str) -> (Option<u8>, Option<bool>) {
    let mut level: Option<u8> = None;
    let mut scale: Option<u32> = None;
    let mut powered = false;
    let mut saw_power_line = false;
    let mut status_charging: Option<bool> = None;
    for line in output.lines() {
        let line = line.trim();
        if let Some(rest) = strip_key(line, "level:") {
            if let Ok(v) = rest.parse::<u32>() {
                level = Some(v.min(100) as u8);
            }
        } else if let Some(rest) = strip_key(line, "scale:") {
            scale = rest.parse().ok();
        } else if let Some(rest) = strip_key(line, "status:") {
            // BatteryManager：2 charging，5 full，其余视为未充。
            status_charging = rest.parse::<i32>().ok().map(|s| s == 2 || s == 5);
        } else if line.to_ascii_lowercase().contains("powered:") {
            saw_power_line = true;
            if line.to_ascii_lowercase().ends_with("true") {
                powered = true;
            }
        }
    }
    let pct = match (level, scale) {
        (Some(l), Some(s)) if s > 0 && s != 100 => {
            Some((((u32::from(l) * 100) / s).min(100)) as u8)
        }
        (Some(l), _) => Some(l),
        _ => None,
    };
    let charging = if saw_power_line {
        Some(powered)
    } else {
        status_charging
    };
    (pct, charging)
}

fn parse_screen_on(output: &str) -> Option<bool> {
    for line in output.lines() {
        if let Some(rest) = line.split("mWakefulness=").nth(1) {
            let token = rest
                .split(|c: char| c.is_whitespace() || c == ',')
                .next()
                .unwrap_or("")
                .trim();
            return Some(token.eq_ignore_ascii_case("Awake") || token.eq_ignore_ascii_case("Dreaming"));
        }
        if line.contains("Display Power") {
            if let Some(rest) = line.split("state=").nth(1) {
                let token = rest.split_whitespace().next().unwrap_or("").trim();
                return Some(token.eq_ignore_ascii_case("ON"));
            }
        }
        if let Some(rest) = line.split("mScreenState=").nth(1) {
            let token = rest
                .split(|c: char| c.is_whitespace() || c == ',')
                .next()
                .unwrap_or("")
                .trim();
            return Some(token.eq_ignore_ascii_case("ON"));
        }
    }
    None
}

fn parse_props(output: &str) -> (Option<u32>, Option<String>, Option<String>) {
    let mut lines = output.lines().map(str::trim).filter(|l| !l.is_empty());
    let sdk = lines.next().and_then(|l| l.parse().ok());
    let release = nonempty(lines.next());
    let brand = nonempty(lines.next());
    (sdk, release, brand)
}

fn nonempty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn strip_key<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let line = line.trim();
    if line.len() >= key.len() && line[..key.len()].eq_ignore_ascii_case(key) {
        Some(line[key.len()..].trim())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BUNDLE: &str = "\
__YOHU_UIMODE__
Current UI Mode Service state:
  mNightMode=0 mComputedNightMode=false
  mCurUiMode=0x21 mUiModeLocked=false
__YOHU_CMDNIGHT__
Night mode: auto
__YOHU_BATTERY__
  AC powered: false
  USB powered: true
  Wireless powered: false
  status: 2
  level: 87
  scale: 100
__YOHU_POWER__
  mWakefulness=Awake
  mScreenState=ON
__YOHU_PROPS__
34
15
motorola
";

    #[test]
    fn bundle_parses_night_battery_screen_props() {
        let fields = parse_status_bundle(BUNDLE);
        assert_eq!(fields.night, Some(true));
        assert_eq!(fields.battery_pct, Some(87));
        assert_eq!(fields.charging, Some(true));
        assert_eq!(fields.screen_on, Some(true));
        assert_eq!(fields.sdk, Some(34));
        assert_eq!(fields.release.as_deref(), Some("15"));
        assert_eq!(fields.brand.as_deref(), Some("motorola"));
    }

    #[test]
    fn cmd_night_fallback_when_dumpsys_missing() {
        let out = "\
__YOHU_UIMODE__
__YOHU_CMDNIGHT__
Night mode: no
__YOHU_BATTERY__
__YOHU_POWER__
  mWakefulness=Asleep
__YOHU_PROPS__
";
        let fields = parse_status_bundle(out);
        assert_eq!(fields.night, Some(false));
        assert_eq!(fields.screen_on, Some(false));
        assert_eq!(fields.battery_pct, None);
    }

    #[test]
    fn battery_scale_not_100() {
        let out = "\
__YOHU_BATTERY__
level: 50
scale: 200
USB powered: false
AC powered: false
";
        let (pct, charging) = parse_battery(out);
        assert_eq!(pct, Some(25));
        assert_eq!(charging, Some(false));
    }

    #[test]
    fn screen_state_on_display() {
        assert_eq!(parse_screen_on("  mScreenState=ON\n"), Some(true));
        assert_eq!(parse_screen_on("Display Power: state=OFF\n"), Some(false));
    }

    #[test]
    fn noise_without_markers_is_empty() {
        let fields = parse_status_bundle("random dumpsys junk\nlevel: 10\n");
        assert_eq!(fields, DeviceStatusFields::default());
    }
}
