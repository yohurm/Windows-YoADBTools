//! 命令库命令：加载/保存转发。

use tauri::State;

use crate::commands::{ipc, ipc_code};
use crate::state::AppState;
use yohu_domain::CommandLibrary;
use yohu_protocol::{CommandLibraryDto, IpcError, IpcErrorCode};

/// `commandlib.load`：加载命令库（缺失或 schema 不匹配 → 备份后写默认库）。
#[tauri::command(rename = "commandlib.load")]
pub fn commandlib_load(state: State<'_, AppState>) -> Result<CommandLibraryDto, IpcError> {
    let library =
        crate::library_store::load_or_default(&state.paths.library_file()).map_err(ipc)?;
    *state.library.lock().expect("library lock poisoned") = library.clone();
    Ok(library.to_dto())
}

/// `commandlib.save`：校验 → 全量提交。取消零污染由 UI 深拷贝保证。
#[tauri::command(rename = "commandlib.save")]
pub fn commandlib_save(state: State<'_, AppState>, dto: CommandLibraryDto) -> Result<(), IpcError> {
    let library = CommandLibrary::from_dto(&dto);
    library
        .validate()
        .map_err(|e| ipc_code(IpcErrorCode::InvalidArgs, e.to_string()))?;
    crate::library_store::save(&state.paths.library_file(), &library).map_err(ipc)?;
    *state.library.lock().expect("library lock poisoned") = library;
    Ok(())
}
