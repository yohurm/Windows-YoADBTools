/**
 * 设置默认快照（与 yohu-protocol AppSettings::default 对齐）。
 * 运行时仍以 system.info 为准；本对象只作首屏兜底，由 testdata 契约锁死。
 */

import type { AppSettings } from "./types";

export const APP_SETTINGS_DEFAULT: AppSettings = {
  adb_path: "",
  data_root: "",
  devices_auto_refresh: 0,
  buffer_capacity: 10000,
  clear_device_on_start: true,
  theme: "system",
  density: "comfortable",
  export_default_path: "",
  export_ask_every_time: true,
  export_write_mode: "overwrite",
  log_display_columns: {
    ts: true,
    uid: true,
    pid: true,
    tid: true,
    level: true,
    tag: true,
  },
  update_provider: "gitcode",
};
