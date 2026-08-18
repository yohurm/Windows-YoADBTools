//! 脚本化假 adb：按脚本文件模拟 `adb` CLI 行为，供 core 集成测试使用。
//!
//! **零共享状态设计**（并行测试安全）：脚本文件 = 本 exe 同目录下同名 `.json`
//! （每个测试把自己的 exe 副本放进独立临时目录 → 天然隔离）。
//!
//! 脚本 JSON：
//! ```json
//! {
//!   "devices": ["R58M1234A device product:x model:Yohu_Phone transport_id:1"],
//!   "logcat_lines": ["01-02 03:04:05.678  1234  5678 I TestTag: hello"],
//!   "logcat_delay_ms": 10,
//!   "logcat_forever": false,
//!   "logcat_exit_code": 0,
//!   "logcat_stderr": "",
//!   "ps": "PID NAME\n1234 com.test.app\n",
//!   "ls": "drwxr-xr-x 2 root root 4096 2026-01-01 12:00 DCIM\n"
//! }
//! ```

use std::io::Write;
use std::time::Duration;

#[derive(serde::Deserialize, Default)]
struct Script {
    #[serde(default)]
    devices: Vec<String>,
    /// devices 分支退出码（默认 0；模拟损坏 adb 时用非 0）
    #[serde(default)]
    devices_exit_code: i32,
    #[serde(default)]
    devices_stderr: String,
    #[serde(default)]
    logcat_lines: Vec<String>,
    #[serde(default = "default_delay")]
    logcat_delay_ms: u64,
    #[serde(default)]
    logcat_forever: bool,
    #[serde(default)]
    logcat_exit_code: i32,
    #[serde(default)]
    logcat_stderr: String,
    #[serde(default)]
    ps: String,
    #[serde(default)]
    ls: String,
}

fn default_delay() -> u64 {
    10
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();

    let exe = std::env::current_exe().expect("无法获取自身路径");
    let script_path = exe.with_extension("json");
    let text = std::fs::read_to_string(&script_path)
        .unwrap_or_else(|_| panic!("脚本文件不存在: {}", script_path.display()));
    let script: Script = serde_json::from_str(&text).expect("脚本 JSON 无效");

    let joined = args.join(" ");
    let stdout = std::io::stdout();
    let mut out = stdout.lock();

    if args.first().map(|s| s.as_str()) == Some("devices") {
        if !script.devices_stderr.is_empty() {
            eprintln!("{}", script.devices_stderr);
        }
        writeln!(out, "List of devices attached").ok();
        for device in &script.devices {
            writeln!(out, "{device}").ok();
        }
        out.flush().ok();
        std::process::exit(script.devices_exit_code);
    }

    if joined.contains("logcat -c") {
        std::process::exit(0);
    }

    if joined.contains("logcat") {
        if !script.logcat_stderr.is_empty() {
            eprintln!("{}", script.logcat_stderr);
        }
        for line in &script.logcat_lines {
            writeln!(out, "{line}").ok();
            out.flush().ok();
            std::thread::sleep(Duration::from_millis(script.logcat_delay_ms));
        }
        if script.logcat_forever {
            loop {
                std::thread::sleep(Duration::from_secs(1));
            }
        }
        std::process::exit(script.logcat_exit_code);
    }

    if joined.contains("shell ps") {
        write!(out, "{}", script.ps).ok();
        out.flush().ok();
        std::process::exit(0);
    }

    if joined.contains("shell ls") {
        write!(out, "{}", script.ls).ok();
        out.flush().ok();
        std::process::exit(0);
    }

    if joined.contains("push") || joined.contains("pull") {
        writeln!(out, "file: 1 file pushed. (123 bytes in 0.001s)").ok();
        out.flush().ok();
        std::process::exit(0);
    }

    // 未知命令：静默成功
    std::process::exit(0);
}
