//! 构建期封装官方 adb 三件套（ADR-slint-008）。
//!
//! - 校验仓库 `tools/` 已由 `scripts/setup-adb.ps1` 放入官方 platform-tools；
//! - 复制到当前 profile 的 `tools/`（与开发仓库布局一致），
//!   使 `cargo build` / `cargo run` 也能解析内置 adb。

use std::path::{Path, PathBuf};

const ADB_FILES: [&str; 3] = ["adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll"];

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let tools = manifest.join("..").join("..").join("tools");
    let tools = std::fs::canonicalize(&tools).unwrap_or(tools);

    for name in ADB_FILES {
        let src = tools.join(name);
        println!("cargo:rerun-if-changed={}", src.display());
        if !src.is_file() {
            panic!(
                "缺少官方 sidecar {name}（{}）。请先运行 scripts/setup-adb.ps1",
                src.display()
            );
        }
    }

    if let Some(profile_dir) = profile_output_dir() {
        let dest_dir = profile_dir.join(yohu_protocol::dir::TOOLS);
        let _ = std::fs::create_dir_all(&dest_dir);
        for name in ADB_FILES {
            let src = tools.join(name);
            let dst = dest_dir.join(name);
            if let Err(e) = std::fs::copy(&src, &dst) {
                println!(
                    "cargo:warning=复制 sidecar {name} 到 {} 失败: {e}",
                    dest_dir.display()
                );
            }
            // 旧布局曾平铺到 exe 旁；避免和 tools/ 双份抢解析。
            let _ = std::fs::remove_file(profile_dir.join(name));
        }
    }
}

/// `OUT_DIR` = `target/<profile>/build/<crate>-<hash>/out` → `<profile>` 目录。
fn profile_output_dir() -> Option<PathBuf> {
    let out = PathBuf::from(std::env::var("OUT_DIR").ok()?);
    out.ancestors().nth(3).map(Path::to_path_buf)
}
