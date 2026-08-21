/**
 * 应用身份常量（与 core/yohu-protocol/src/identity.rs 对齐）。
 * 展示名 / 目录名 / 模块 id 禁止在壳或模块再写一份。
 * 版本号以 `system.info.identity.version`（CARGO_PKG_VERSION）为准；此处 version 留空作首屏兜底。
 */

import type { AppIdentity, AppPathCatalog } from "./types";

export const PRODUCT_NAME = "YohuAdbTools";
export const DISPLAY_NAME = "Yohu ADB Tools";
export const IDENTIFIER = "com.yohu.adbtools";
export const DESCRIPTION = "设备工具工作台";
export const COPYRIGHT = "© 2026 Yohu";
export const DATA_DIR_NAME = PRODUCT_NAME;

/** 设备路径安全根（与 yohu-protocol::safety_root 对齐；core SafetyRoot 强制校验）。 */
export const SAFETY_ROOTS = ["/sdcard", "/storage"] as const;

/** 标题栏 / 关于页 / favicon 共用的应用图标（与 `app/yohu-app/icons/icon.png` 同源）。 */
export const APP_ICON_SRC = "/app-icon.png";

/** 模块 id（与 ModuleDescriptor.id、data_root/modules/<id> 一致）。 */
export const ModuleId = {
  Terminal: "adb-terminal",
  Files: "file-manager",
  Logs: "log-analyzer",
  Mirror: "screen-mirror",
  Settings: "settings",
} as const;

export type ModuleId = (typeof ModuleId)[keyof typeof ModuleId];

/** 首屏兜底身份（version 等 system.info 回填）。 */
export const APP_IDENTITY: AppIdentity = {
  name: PRODUCT_NAME,
  display_name: DISPLAY_NAME,
  identifier: IDENTIFIER,
  version: "",
  description: DESCRIPTION,
  copyright: COPYRIGHT,
};

export const EMPTY_PATH_CATALOG: AppPathCatalog = {
  local_root: "",
  settings_dir: "",
  settings_file: "",
  logs_dir: "",
  data_root: "",
  adb_tools_dir: "",
  library_file: "",
  exports_dir: "",
  drag_out_dir: "",
};
