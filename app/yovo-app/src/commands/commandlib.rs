//! 命令库命令：加载/保存（校验 + 原子写 + 损坏备份）。

use std::fs;

use tauri::State;

use crate::commands::{ipc, ipc_code};
use crate::state::AppState;
use yovo_domain::CommandLibrary;
use yovo_protocol::{CommandLibraryDto, IpcError, IpcErrorCode};

/// `commandlib.load`：加载命令库（缺失→默认空库；损坏→备份并重建；v5 数据一次性迁移）。
#[tauri::command]
pub fn commandlib_load(state: State<'_, AppState>) -> Result<CommandLibraryDto, IpcError> {
    let file = state.paths.library_file();

    // v5 → v6 一次性迁移：旧版路径 `DataRoot/modules/adb-terminal/config/library.json` 不存在旧格式差异时仅指同一路径。
    // 首次加载若文件不存在且存在同目录旧扩展名备份则跳过（旧版已下线，无需再迁）。

    let library = match fs::read_to_string(&file) {
        Ok(text) => match serde_json::from_str::<CommandLibrary>(&text) {
            Ok(lib) if lib.schema_version == CommandLibrary::SCHEMA_VERSION => lib,
            Ok(lib) if lib.schema_version < CommandLibrary::SCHEMA_VERSION => {
                // schema 升级：本版本仅支持 v2；低版本结构不同→按损坏处理（备份重建）
                backup_corrupt(&file, &text, "schema 版本过低")?;
                CommandLibrary::empty()
            }
            Ok(_) | Err(_) => {
                backup_corrupt(&file, &text, "JSON 解析失败")?;
                CommandLibrary::empty()
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => CommandLibrary::empty(),
        Err(e) => return Err(ipc(e)),
    };

    *state.library.lock().expect("library lock poisoned") = library.clone();
    Ok(library.to_dto())
}

/// `commandlib.save`：校验 → 全量提交（原子写）。取消零污染由 UI 深拷贝保证。
#[tauri::command]
pub fn commandlib_save(state: State<'_, AppState>, dto: CommandLibraryDto) -> Result<(), IpcError> {
    let library = CommandLibrary::from_dto(&dto);
    library.validate().map_err(|e| ipc_code(IpcErrorCode::InvalidArgs, e.to_string()))?;

    let file = state.paths.library_file();
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(ipc)?;
    }
    let text = serde_json::to_string_pretty(&library).map_err(ipc)?;
    let tmp = file.with_extension("tmp");
    fs::write(&tmp, &text).map_err(ipc)?;
    fs::rename(&tmp, &file).map_err(ipc)?;

    *state.library.lock().expect("library lock poisoned") = library;
    Ok(())
}

fn backup_corrupt(file: &std::path::Path, text: &str, reason: &str) -> Result<(), IpcError> {
    tracing::warn!("命令库损坏（{reason}），备份重建");
    let backup = file.with_extension(format!("corrupt-{}", timestamp_stamp()));
    fs::write(&backup, text).map_err(ipc)?;
    Ok(())
}

fn timestamp_stamp() -> String {
    time::OffsetDateTime::now_local()
        .map(|t| t.format(&time::format_description::well_known::Rfc3339).unwrap_or_default())
        .unwrap_or_default()
        .replace(':', "-")
}
