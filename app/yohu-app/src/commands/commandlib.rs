//! 命令库命令：加载/保存（校验 + 原子写 + 损坏备份）。

use std::fs;

use tauri::State;

use crate::commands::{ipc, ipc_code};
use crate::state::AppState;
use yohu_domain::CommandLibrary;
use yohu_protocol::{CommandLibraryDto, IpcError, IpcErrorCode};

/// `commandlib.load`：加载命令库（缺失或 schema 不匹配 → 备份后写默认库）。
#[tauri::command(rename = "commandlib.load")]
pub fn commandlib_load(state: State<'_, AppState>) -> Result<CommandLibraryDto, IpcError> {
    let file = state.paths.library_file();

    let library = match fs::read_to_string(&file) {
        Ok(text) => match serde_json::from_str::<CommandLibrary>(&text) {
            Ok(lib) if lib.schema_version == CommandLibrary::SCHEMA_VERSION => lib,
            Ok(_) => {
                backup_corrupt(&file, &text, "schema 不受支持")?;
                write_default(&file)?
            }
            Err(_) => {
                backup_corrupt(&file, &text, "JSON 解析失败")?;
                write_default(&file)?
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => write_default(&file)?,
        Err(e) => return Err(ipc(e)),
    };

    *state.library.lock().expect("library lock poisoned") = library.clone();
    Ok(library.to_dto())
}

/// 写入默认命令库（原子写）。
fn write_default(file: &std::path::Path) -> Result<CommandLibrary, IpcError> {
    let library = yohu_domain::default_library();
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(ipc)?;
    }
    let text = serde_json::to_string_pretty(&library).map_err(ipc)?;
    let tmp = file.with_extension("tmp");
    fs::write(&tmp, &text).map_err(ipc)?;
    fs::rename(&tmp, file).map_err(ipc)?;
    tracing::info!("已写入默认命令库: {}", file.display());
    Ok(library)
}

/// `commandlib.save`：校验 → 全量提交（原子写）。取消零污染由 UI 深拷贝保证。
#[tauri::command(rename = "commandlib.save")]
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
