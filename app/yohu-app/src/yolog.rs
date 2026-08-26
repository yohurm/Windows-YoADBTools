//! 应用操作日志入口：tracing（落盘 + 控制台）与内存环同步。

use yohu_domain::{AppLog, LogLevel};

pub fn write(log: &AppLog, level: LogLevel, module: &str, message: &str) {
    match level {
        LogLevel::Info => tracing::info!(module, "{message}"),
        LogLevel::Warn => tracing::warn!(module, "{message}"),
        LogLevel::Error => tracing::error!(module, "{message}"),
    }
    log.push(level, format!("[{module}] {message}"));
}

pub fn parse_level(level: &str) -> LogLevel {
    match level {
        "warn" => LogLevel::Warn,
        "error" => LogLevel::Error,
        _ => LogLevel::Info,
    }
}
