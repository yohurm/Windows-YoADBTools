//! 通用 adb 执行命令（终端自由命令用）。

use tokio_util::sync::CancellationToken;

use crate::commands::err_adb;
use crate::state::AppState;
use yohu_protocol::{AdbExecRequest, ExecOutcome, AppError};

/// `adb.exec`：短命令，返回原始结果（不判定成败，ADR-v6-009）。
pub async fn adb_exec(
    state: &AppState,
    req: AdbExecRequest,
) -> Result<ExecOutcome, AppError> {
    state.require_online(&req.serial)?;
    state
        .client
        .run(
            &req.serial,
            &req.argv,
            req.timeout_ms,
            CancellationToken::new(),
        )
        .await
        .map_err(err_adb)
}
