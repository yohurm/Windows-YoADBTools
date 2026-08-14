//! 输出解析器（纯函数，独立可测）。
//!
//! 高内聚：每个解析器只认一种输出格式；宽容解析——格式漂移降级为 None/跳过，不 panic。

pub mod devices;
pub mod ls;
pub mod ps;
