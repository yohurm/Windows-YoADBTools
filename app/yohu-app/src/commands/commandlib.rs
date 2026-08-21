//! 命令库命令：加载/保存转发。

use crate::commands::{err_internal, err_code};
use crate::state::AppState;
use yohu_domain::CommandLibrary;
use yohu_protocol::{CommandLibraryDto, AppError, ErrorCode};

/// `commandlib.load`：加载命令库（缺失或 schema 不匹配 → 备份后写默认库）。
pub fn commandlib_load(state: &AppState) -> Result<CommandLibraryDto, AppError> {
    let library =
        crate::library_store::load_or_default(&state.paths.library_file()).map_err(err_internal)?;
    *state.library.lock().expect("library lock poisoned") = library.clone();
    Ok(library.to_dto())
}

/// `commandlib.save`：校验 → 全量提交。取消零污染由 UI 深拷贝保证。
pub fn commandlib_save(state: &AppState, dto: CommandLibraryDto) -> Result<(), AppError> {
    let library = CommandLibrary::from_dto(&dto);
    library
        .validate()
        .map_err(|e| err_code(ErrorCode::InvalidArgs, e.to_string()))?;
    crate::library_store::save(&state.paths.library_file(), &library).map_err(err_internal)?;
    *state.library.lock().expect("library lock poisoned") = library;
    Ok(())
}
