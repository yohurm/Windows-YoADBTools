//! 宿主文件耐久：原子写（tmp + rename）与损坏备份。不解析业务 schema。

use std::path::{Path, PathBuf};

/// 把原始内容备份到 `<file>.corrupt-<unix-ms>`，避免静默覆盖。
pub fn backup_corrupt(file: &Path, text: &str) -> std::io::Result<PathBuf> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let backup = file.with_extension(format!("corrupt-{stamp}"));
    std::fs::write(&backup, text)?;
    Ok(backup)
}

/// 原子写：父目录创建 → 写 `.tmp` → rename 覆盖目标。
pub fn atomic_write(file: &Path, bytes: impl AsRef<[u8]>) -> std::io::Result<()> {
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = file.with_extension("tmp");
    std::fs::write(&tmp, bytes.as_ref())?;
    std::fs::rename(&tmp, file)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "yohu-runtime-persist-{}-{}",
            std::process::id(),
            name
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("data.json")
    }

    #[test]
    fn atomic_write_roundtrip() {
        let file = temp_file("roundtrip");
        atomic_write(&file, b"{\"ok\":true}").unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "{\"ok\":true}");
        let _ = std::fs::remove_dir_all(file.parent().unwrap());
    }

    #[test]
    fn atomic_write_overwrites_existing() {
        let file = temp_file("overwrite");
        atomic_write(&file, b"first").unwrap();
        atomic_write(&file, b"second").unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "second");
        let _ = std::fs::remove_dir_all(file.parent().unwrap());
    }

    #[test]
    fn backup_corrupt_keeps_original_name_prefix() {
        let file = temp_file("corrupt");
        std::fs::write(&file, "bad").unwrap();
        let backup = backup_corrupt(&file, "bad").unwrap();
        assert!(backup
            .file_name()
            .unwrap()
            .to_string_lossy()
            .contains("corrupt-"));
        assert_eq!(std::fs::read_to_string(&backup).unwrap(), "bad");
        let _ = std::fs::remove_dir_all(file.parent().unwrap());
    }
}
