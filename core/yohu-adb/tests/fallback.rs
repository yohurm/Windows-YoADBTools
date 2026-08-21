//! 自愈式设备扫描集成测试（「cmd 有设备、应用没有」类问题的回归防线）。
//!
//! 覆盖：adb.path 指向损坏/失效 adb → 自动回退到资源目录候选 → 扫描成功；
//! 全候选失败 → 错误信息含明细。使用 fake-adb（零共享状态：拷贝 exe + 同名 json）。

use std::path::PathBuf;

use tokio_util::sync::CancellationToken;

use yohu_adb::{AdbClient, ToolResolver};

fn fake_adb_src() -> PathBuf {
    let mut p = std::env::current_exe().expect("测试进程路径");
    p.pop(); // deps/
    p.pop(); // debug/ | release/
    let plain = p.join("fake-adb.exe");
    if plain.is_file() {
        return plain;
    }
    panic!("先执行 cargo build --workspace（fake-adb 明文 bin）");
}

/// 建立隔离 fake adb（exe 副本 + 同名 json 脚本），返回 exe 路径。
fn isolated_fake_adb(script: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "yohu-fallback-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    std::fs::create_dir_all(&dir).expect("创建临时目录失败");
    let exe = dir.join("fake-adb.exe");
    std::fs::copy(fake_adb_src(), &exe).expect("拷贝 fake-adb 失败");
    std::fs::write(exe.with_extension("json"), script).expect("写脚本失败");
    exe
}

#[tokio::test]
async fn fallback_from_broken_user_adb_to_resource() {
    // 用户设置指向「损坏」的 adb（devices 退出码 1 + 报错）
    let broken = isolated_fake_adb(
        r#"{ "devices_exit_code": 1, "devices_stderr": "adb: failed to connect to daemon" }"#,
    );
    // 资源目录放一个「健康」的 adb
    let healthy = isolated_fake_adb(
        r#"{ "devices": ["R58M1234A device product:x model:Yohu_Phone transport_id:1"] }"#,
    );
    let resource_dir = healthy.parent().expect("资源目录").to_path_buf();
    let data_dir = std::env::temp_dir().join(format!(
        "yohu-fallback-data2-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));

    let tool = ToolResolver::new(Some(broken), resource_dir, data_dir);
    let client = AdbClient::new(tool, 4);

    let (devices, used) = client
        .devices_resilient(CancellationToken::new())
        .await
        .expect("自愈扫描应成功");
    assert_eq!(devices.len(), 1, "回退候选应扫到设备");
    assert_eq!(devices[0].serial, "R58M1234A");
    assert_eq!(used, healthy, "应使用资源目录中的健康 adb");
}

#[tokio::test]
async fn fallback_skips_missing_user_path() {
    // 资源目录候选必须命名为 adb.exe（ToolResolver 的约定）
    let dir = std::env::temp_dir().join(format!(
        "yohu-fallback-res-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    std::fs::create_dir_all(&dir).expect("创建临时目录失败");
    let healthy = dir.join("adb.exe");
    std::fs::copy(fake_adb_src(), &healthy).expect("拷贝 fake-adb 失败");
    std::fs::write(
        healthy.with_extension("json"),
        r#"{ "devices": ["R58M1234A device product:x model:Yohu_Phone transport_id:1"] }"#,
    )
    .expect("写脚本失败");

    // 用户路径不存在 → 直接回退
    let data_dir = std::env::temp_dir().join(format!(
        "yohu-fallback-data3-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    let tool = ToolResolver::new(
        Some(PathBuf::from("Z:\\不存在的目录\\adb.exe")),
        dir,
        data_dir,
    );
    let client = AdbClient::new(tool, 4);
    let (devices, used) = client
        .devices_resilient(CancellationToken::new())
        .await
        .expect("自愈扫描应成功");
    assert_eq!(devices.len(), 1);
    assert_eq!(used, healthy);
}

#[tokio::test]
async fn all_candidates_fail_yields_detailed_error() {
    // 每个测试独立的 data 目录，避免候选互相污染
    let data_dir = std::env::temp_dir().join(format!(
        "yohu-fallback-data-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    let resource_dir = data_dir.join("res");
    let broken =
        isolated_fake_adb(r#"{ "devices_exit_code": 1, "devices_stderr": "adb: no daemon" }"#);
    let tool = ToolResolver::new(Some(broken), resource_dir, data_dir.join("tools"));
    let client = AdbClient::new(tool, 4);
    let err = client
        .devices_resilient(CancellationToken::new())
        .await
        .expect_err("全部失败应报错");
    let text = err.to_string();
    assert!(
        text.contains("全部 adb 候选扫描失败"),
        "错误应含候选明细: {text}"
    );
    assert!(text.contains("no daemon"), "错误应含根因: {text}");
}
