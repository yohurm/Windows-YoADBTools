//! 设备深浅色：`cmd uimode night` 与 `dumpsys uimode`。
//!
//! 操作栏要的是**当前界面**（解析后），不是 auto 偏好。优先 `mCurUiMode` 的 night 位。

/// Configuration.UI_MODE_NIGHT_MASK
const UI_MODE_NIGHT_MASK: u32 = 0x30;
/// Configuration.UI_MODE_NIGHT_YES
const UI_MODE_NIGHT_YES: u32 = 0x20;

/// 从 `cmd uimode night` 输出读偏好。`auto` / `custom_*` 无法确定当前界面，返回 `None`。
pub fn parse_cmd_night(output: &str) -> Option<bool> {
    for line in output.lines() {
        let line = line.trim();
        let value = line
            .split_once(':')
            .filter(|(k, _)| k.trim().eq_ignore_ascii_case("night mode"))
            .map(|(_, v)| v.trim())
            .unwrap_or(line);
        if let Some(night) = classify_night_token(value) {
            return Some(night);
        }
        if is_auto_token(value) {
            return None;
        }
    }
    None
}

/// 从 `dumpsys uimode` 读当前界面是否深色。
pub fn parse_dumpsys_uimode(output: &str) -> Option<bool> {
    let mut cur: Option<u32> = None;
    let mut pref: Option<i32> = None;
    let mut computed: Option<bool> = None;
    for line in output.lines() {
        for token in line.split_whitespace() {
            if let Some(rest) = token.strip_prefix("mCurUiMode=") {
                cur = parse_int_token(rest);
            } else if let Some(rest) = token.strip_prefix("mNightMode=") {
                pref = parse_int_token(rest).map(|v| v as i32);
            } else if let Some(rest) = token.strip_prefix("mComputedNightMode=") {
                computed = parse_bool_token(rest);
            }
        }
    }
    if let Some(mode) = cur {
        let night_bits = mode & UI_MODE_NIGHT_MASK;
        if night_bits == UI_MODE_NIGHT_YES {
            return Some(true);
        }
        if night_bits != 0 {
            return Some(false);
        }
    }
    match pref {
        Some(2) => return Some(true),
        Some(1) => return Some(false),
        Some(0) => return computed,
        _ => {}
    }
    computed
}

fn classify_night_token(value: &str) -> Option<bool> {
    let v = value.trim().to_ascii_lowercase();
    match v.as_str() {
        "yes" | "night" | "true" => Some(true),
        "no" | "notnight" | "false" => Some(false),
        _ => None,
    }
}

fn is_auto_token(value: &str) -> bool {
    let v = value.trim().to_ascii_lowercase();
    v == "auto" || v.starts_with("custom")
}

fn parse_int_token(raw: &str) -> Option<u32> {
    let raw = raw.trim().trim_end_matches(',');
    if let Some(hex) = raw.strip_prefix("0x").or_else(|| raw.strip_prefix("0X")) {
        return u32::from_str_radix(hex, 16).ok();
    }
    raw.parse().ok()
}

fn parse_bool_token(raw: &str) -> Option<bool> {
    match raw.trim().trim_end_matches(',').to_ascii_lowercase().as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cmd_yes_no_auto() {
        assert_eq!(parse_cmd_night("Night mode: yes\n"), Some(true));
        assert_eq!(parse_cmd_night("Night mode: no\n"), Some(false));
        assert_eq!(parse_cmd_night("Night mode: auto\n"), None);
        assert_eq!(parse_cmd_night("Night mode: custom_schedule\n"), None);
    }

    #[test]
    fn dumpsys_cur_ui_mode_night_bit() {
        let dump = "\
Current UI Mode Service state:
  mNightMode=0 mComputedNightMode=false
  mCurUiMode=0x21 mUiModeLocked=false
";
        assert_eq!(parse_dumpsys_uimode(dump), Some(true));
        let day = dump.replace("0x21", "0x11");
        assert_eq!(parse_dumpsys_uimode(&day), Some(false));
    }

    #[test]
    fn dumpsys_pref_yes_without_cur() {
        let dump = "mNightMode=2 mComputedNightMode=false\n";
        assert_eq!(parse_dumpsys_uimode(dump), Some(true));
    }

    #[test]
    fn dumpsys_auto_uses_computed() {
        let dump = "mNightMode=0 mComputedNightMode=true\n";
        assert_eq!(parse_dumpsys_uimode(dump), Some(true));
    }
}
