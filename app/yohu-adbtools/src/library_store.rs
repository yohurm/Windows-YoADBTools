//! 命令库落盘：校验由 domain 完成；本层只做原子写与损坏备份。

use std::fs;
use std::path::Path;

use yohu_domain::CommandLibrary;
use yohu_runtime::{atomic_write, backup_corrupt};

/// 加载命令库（缺失或 schema 不匹配 → 备份后写默认库）。
pub fn load_or_default(file: &Path) -> Result<CommandLibrary, String> {
    match fs::read_to_string(file) {
        Ok(text) => match serde_json::from_str::<CommandLibrary>(&text) {
            Ok(lib) if lib.schema_version == CommandLibrary::SCHEMA_VERSION => Ok(lib),
            Ok(_) => {
                tracing::warn!("命令库损坏（schema 不受支持），备份重建");
                backup_corrupt(file, &text).map_err(|e| e.to_string())?;
                write_default(file)
            }
            Err(_) => {
                tracing::warn!("命令库损坏（JSON 解析失败），备份重建");
                backup_corrupt(file, &text).map_err(|e| e.to_string())?;
                write_default(file)
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => write_default(file),
        Err(e) => Err(e.to_string()),
    }
}

/// 全量原子提交。调用方先 `validate`。
pub fn save(file: &Path, library: &CommandLibrary) -> Result<(), String> {
    atomic_write(
        file,
        serde_json::to_string_pretty(library).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

fn write_default(file: &Path) -> Result<CommandLibrary, String> {
    let library = yohu_domain::default_library();
    save(file, &library)?;
    tracing::info!("已写入默认命令库: {}", file.display());
    Ok(library)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("yohu-lib-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join("library.json")
    }

    #[test]
    fn missing_file_writes_default() {
        let file = temp_file("missing");
        let lib = load_or_default(&file).unwrap();
        assert_eq!(lib.schema_version, CommandLibrary::SCHEMA_VERSION);
        assert!(file.exists());
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }

    #[test]
    fn corrupt_json_is_backed_up() {
        let file = temp_file("corrupt");
        fs::write(&file, "{not json").unwrap();
        let lib = load_or_default(&file).unwrap();
        assert_eq!(lib.schema_version, CommandLibrary::SCHEMA_VERSION);
        let parent = file.parent().unwrap();
        let backups: Vec<_> = fs::read_dir(parent)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains("corrupt-"))
            .collect();
        assert!(!backups.is_empty());
        let _ = fs::remove_dir_all(parent);
    }
}
