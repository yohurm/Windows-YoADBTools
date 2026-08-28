//! OS 应用数据根与打开路径。产品子目录仍由壳用 protocol `dir::*` 拼装。

use std::path::{Path, PathBuf};

/// 本机应用数据根：`<os_app_data>/<product_dir_name>`。
///
/// Windows：`%LOCALAPPDATA%\<name>`。macOS：`~/Library/Application Support/<name>`。
/// 其它 Unix：`$XDG_DATA_HOME/<name>` 或 `~/.local/share/<name>`。
pub fn app_data_root(product_dir_name: &str) -> PathBuf {
    #[cfg(windows)]
    {
        let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(base).join(product_dir_name)
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join(product_dir_name)
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
            if !xdg.trim().is_empty() {
                return PathBuf::from(xdg).join(product_dir_name);
            }
        }
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home)
            .join(".local")
            .join("share")
            .join(product_dir_name)
    }
    #[cfg(not(any(windows, unix)))]
    {
        PathBuf::from(".").join(product_dir_name)
    }
}

/// 用系统文件管理器打开路径：目录进入该处；文件则尽量选中。
pub fn open_path(path: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("explorer");
        if path.is_file() {
            cmd.arg(format!("/select,{}", path.display()));
        } else {
            cmd.arg(path);
        }
        cmd.spawn()?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(path).spawn()?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(path).spawn()?;
        Ok(())
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = path;
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "open_path: unsupported OS",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_data_root_joins_product_name() {
        let p = app_data_root("YohuAdbTools");
        assert!(p.ends_with("YohuAdbTools"));
    }
}
