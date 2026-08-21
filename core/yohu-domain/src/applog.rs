//! 应用操作日志（ADR-v6-010）：内存环形，不落盘；与设备 logcat 严格分离。

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// 日志级别。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Info,
    Warn,
    Error,
}

impl LogLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Info => "info",
            LogLevel::Warn => "warn",
            LogLevel::Error => "error",
        }
    }
}

/// 一条应用日志。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppLogEntry {
    /// Unix 秒
    pub ts: u64,
    pub level: LogLevel,
    pub text: String,
}

/// 内存环形操作日志。
pub struct AppLog {
    inner: Mutex<VecDeque<AppLogEntry>>,
    capacity: usize,
}

impl AppLog {
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: Mutex::new(VecDeque::with_capacity(capacity)),
            capacity: capacity.max(1),
        }
    }

    pub fn info(&self, text: impl Into<String>) {
        self.push(LogLevel::Info, text);
    }
    pub fn warn(&self, text: impl Into<String>) {
        self.push(LogLevel::Warn, text);
    }
    pub fn error(&self, text: impl Into<String>) {
        self.push(LogLevel::Error, text);
    }

    pub fn push(&self, level: LogLevel, text: impl Into<String>) {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let mut inner = self.inner.lock().expect("applog lock poisoned");
        inner.push_back(AppLogEntry {
            ts,
            level,
            text: text.into(),
        });
        while inner.len() > self.capacity {
            inner.pop_front();
        }
    }

    /// 快照（旧 → 新）。
    pub fn snapshot(&self) -> Vec<AppLogEntry> {
        self.inner
            .lock()
            .expect("applog lock poisoned")
            .iter()
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_evicts_oldest() {
        let log = AppLog::new(3);
        log.info("a");
        log.info("b");
        log.info("c");
        log.warn("d");
        let snap = log.snapshot();
        assert_eq!(snap.len(), 3);
        assert_eq!(snap[0].text, "b");
        assert_eq!(snap[2].text, "d");
    }

    #[test]
    fn levels_kept() {
        let log = AppLog::new(10);
        log.error("e");
        assert_eq!(log.snapshot()[0].level, LogLevel::Error);
    }
}
