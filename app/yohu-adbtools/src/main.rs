// 入口：仅转发到 lib（Tauri 惯例）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    yohu_adbtools_lib::run().expect("应用启动失败");
}
