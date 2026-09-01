//! 覆盖安装：等当前进程退出后静默跑 NSIS `/S`，再拉起新主程序。

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use yohu_protocol::{DATA_DIR_NAME, PRODUCT_NAME};
use yohu_runtime::app_data_root;

use crate::download::assert_cached_installer;
use crate::error::UpdateError;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
#[cfg(windows)]
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

const APPLY_PS1: &str = r#"param(
  [Parameter(Mandatory=$true)][int]$WaitPid,
  [Parameter(Mandatory=$true)][string]$Setup,
  [Parameter(Mandatory=$true)][string]$App
)
$ErrorActionPreference = 'Continue'
$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
  $proc = Get-Process -Id $WaitPid -ErrorAction SilentlyContinue
  if (-not $proc) { break }
  Start-Sleep -Seconds 1
}
if (-not (Test-Path -LiteralPath $Setup)) { exit 2 }
$p = Start-Process -FilePath $Setup -ArgumentList '/S' -Wait -PassThru
if ($null -eq $p) { exit 3 }
if ($p.ExitCode -ne 0) { exit $p.ExitCode }
Start-Sleep -Seconds 1
if (Test-Path -LiteralPath $App) {
  Start-Process -FilePath $App
}
exit 0
"#;

/// NSIS per-user 安装后的主程序（`%LOCALAPPDATA%\YohuAdbTools\YohuAdbTools.exe`）。
pub fn installed_exe_path() -> PathBuf {
    app_data_root(DATA_DIR_NAME).join(format!("{PRODUCT_NAME}.exe"))
}

/// 写脱离作业对象的覆盖安装脚本并拉起：等 `app_pid` 退出 → `setup /S` → 启动新主程序。
pub fn spawn_overlay_install(
    installer: &Path,
    app_pid: u32,
    relaunch_exe: &Path,
) -> Result<(), UpdateError> {
    #[cfg(not(windows))]
    {
        let _ = (installer, app_pid, relaunch_exe);
        return Err(UpdateError::NotWindows);
    }
    #[cfg(windows)]
    {
        spawn_overlay_install_windows(installer, app_pid, relaunch_exe)
    }
}

#[cfg(windows)]
fn spawn_overlay_install_windows(
    installer: &Path,
    app_pid: u32,
    relaunch_exe: &Path,
) -> Result<(), UpdateError> {
    let installer = assert_cached_installer(installer)?;
    let cache = crate::download::update_cache_dir();
    std::fs::create_dir_all(&cache).map_err(|e| UpdateError::Io(e.to_string()))?;
    let script = cache.join("apply-update.ps1");
    {
        let mut file =
            std::fs::File::create(&script).map_err(|e| UpdateError::Io(e.to_string()))?;
        file.write_all(APPLY_PS1.as_bytes())
            .map_err(|e| UpdateError::Io(e.to_string()))?;
    }

    let installer_s = path_arg(&installer)?;
    let app_s = path_arg(relaunch_exe)?;
    let script_s = path_arg(&script)?;

    let mut cmd = std::process::Command::new("cmd");
    cmd.args([
        "/C",
        "start",
        "",
        "/MIN",
        "powershell.exe",
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        &script_s,
        "-WaitPid",
        &app_pid.to_string(),
        "-Setup",
        &installer_s,
        "-App",
        &app_s,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB);
    cmd.spawn().map_err(|e| UpdateError::Io(e.to_string()))?;
    Ok(())
}

fn path_arg(path: &Path) -> Result<String, UpdateError> {
    path.to_str()
        .map(str::to_string)
        .ok_or(UpdateError::InvalidInstaller)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installed_exe_is_under_local_app_data_product() {
        let p = installed_exe_path();
        assert!(p.ends_with("YohuAdbTools.exe"));
        assert!(p
            .parent()
            .map(|d| d.ends_with("YohuAdbTools"))
            .unwrap_or(false));
    }

    #[test]
    fn apply_script_waits_then_silent_setup() {
        assert!(APPLY_PS1.contains("Get-Process -Id $WaitPid"));
        assert!(APPLY_PS1.contains("/S"));
        assert!(APPLY_PS1.contains("Start-Process -FilePath $App"));
    }
}
