/**
 * 设置 store：启动加载全量快照；set 后回写并应用立即生效语义（由 core 负责）。
 * 外观项（theme/density）在加载与变更后同步到 documentElement（data-theme/data-density）。
 */

import { createStore } from "solid-js/store";

import { settingsSet, systemInfo } from "@yohu/api";
import type { AppSettings, SettingKey } from "@yohu/api";
import { setDensity, setTheme } from "@yohu/ui";

const DEFAULT_SETTINGS: AppSettings = {
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
};

const EMPTY_RESOLVED = {
  adb_path: "",
  data_root: "",
  export_default_path: "",
};

/** 应用外观设置（主题 + 密度）。 */
function applyAppearance(settings: AppSettings): void {
  setTheme(settings.theme);
  setDensity(settings.density);
}

export function createSettingsStore() {
  const [state, setState] = createStore<AppSettings>({ ...DEFAULT_SETTINGS });
  const [resolved, setResolved] = createStore({ ...EMPTY_RESOLVED });

  async function load(): Promise<void> {
    try {
      const info = await systemInfo();
      setState(info.settings);
      setResolved({
        adb_path: info.adb_in_use ?? info.adb_path ?? "",
        data_root: info.data_root ?? "",
        export_default_path: info.exports_dir ?? "",
      });
      applyAppearance(info.settings);
    } catch (e) {
      console.error("system.info 失败", e);
    }
  }

  async function set(key: SettingKey, value: unknown): Promise<void> {
    const updated = await settingsSet(key, value);
    setState(updated);
    applyAppearance(updated);
  }

  return { state, resolved, load, set };
}

export type SettingsStoreApi = ReturnType<typeof createSettingsStore>;
