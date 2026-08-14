//! ADB 层错误。

#[derive(Debug, thiserror::Error)]
pub enum AdbError {
    #[error("ADB 不可用: {0}")]
    ToolUnavailable(String),
    #[error("设备掉线: {0}")]
    DeviceOffline(String),
    #[error("设备未授权")]
    Unauthorized,
    #[error("执行超时")]
    Timeout,
    #[error("任务已取消")]
    Cancelled,
    #[error("执行失败(退出码 {exit_code}): {stderr}")]
    BadExit { exit_code: i32, stderr: String },
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("输出解析失败: {0}")]
    Parse(String),
}

/// 映射到 domain 执行端口错误（依赖倒置：适配层负责翻译）。
impl From<AdbError> for yovo_domain::RunError {
    fn from(e: AdbError) -> Self {
        match e {
            AdbError::DeviceOffline(s) => yovo_domain::RunError::DeviceOffline(s),
            AdbError::Unauthorized => yovo_domain::RunError::Unauthorized,
            AdbError::Timeout => yovo_domain::RunError::Timeout,
            AdbError::Cancelled => yovo_domain::RunError::Cancelled,
            other => yovo_domain::RunError::Adb(other.to_string()),
        }
    }
}
