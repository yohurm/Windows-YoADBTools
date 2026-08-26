//! 投屏错误。

use yohu_adb::AdbError;

#[derive(Debug, thiserror::Error)]
pub enum MirrorError {
    #[error("投屏已取消")]
    Cancelled,
    #[error("缺少 scrcpy-server（请运行 scripts/setup-scrcpy-server.ps1）: {0}")]
    ServerMissing(String),
    #[error("投屏协议错误: {0}")]
    Protocol(String),
    #[error("设备端 server 失败: {0}")]
    ServerFailed(String),
    #[error("当前会话为只读，无法注入控制")]
    NoControl,
    #[error("设备没有进行中的投屏")]
    NotLive,
    #[error("{0}")]
    Adb(#[from] AdbError),
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
}
