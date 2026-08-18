//! yohu-logsrv — logcat 采集服务（ADR-v6-006/007 的核心落地）。
//!
//! 高内聚边界：本 crate 只负责「单流采集 + 共享环形缓冲 + 批量推送 + 进程索引 + 导出」。
//! 会话/过滤/可见列表全部在 UI 消费端（不在本 crate）。

pub mod batch;
pub mod capture;
pub mod export;
pub mod index;
pub mod parse;
pub mod ring;

pub use batch::Batcher;
pub use capture::{ingest_raw_lines, CaptureService, LogError};
pub use export::ExportService;
pub use parse::parse_threadtime;
pub use ring::RingBuffer;
