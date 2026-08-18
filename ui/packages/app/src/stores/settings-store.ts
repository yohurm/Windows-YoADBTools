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
  display_limit: 2000,
  clear_device_on_start: true,
  theme: "system",
  density: "compact",
  export_default_path: "",
  export_ask_every_time: true,
  export_write_mode: "overwrite",
};

/** 应用外观设置（主题 + 密度）。 */
function applyAppearance(settings: AppSettings): void {
  setTheme(settings.theme);
  setDensity(settings.density);
}

export function createSettingsStore() {
  const [state, setState] = createStore<AppSettings>({ ...DEFAULT_SETTINGS });

  async function load(): Promise<void> {
    try {
      const info = await systemInfo();
      setState(info.settings);
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

  return { state, load, set };
}

export type SettingsStoreApi = ReturnType<typeof createSettingsStore>;
