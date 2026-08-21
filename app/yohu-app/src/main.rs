// 入口：仅转发到 lib。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    yohu_app_lib::run().expect("应用启动失败");
}
