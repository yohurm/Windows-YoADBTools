//! 崩溃处理：panic hook 写 `logs/panic-<ts>.log`（应用日志与设备日志分离，ADR-v6-010）。

use std::path::PathBuf;

/// 安装全局 panic hook。
pub fn install(logs_dir: PathBuf) {
    std::panic::set_hook(Box::new(move |info| {
        let message = format!("{info}");
        tracing::error!("PANIC: {message}");
        let _ = std::fs::create_dir_all(&logs_dir);
        let stamp = time::OffsetDateTime::now_local()
            .map(|t| {
                t.format(&time::format_description::well_known::Rfc3339)
                    .unwrap_or_default()
            })
            .unwrap_or_default()
            .replace(':', "-");
        let file = logs_dir.join(format!("panic-{stamp}.log"));
        let _ = std::fs::write(&file, &message);
    }));
}
