/**
 * 设置 store：启动加载全量快照；set 后回写并应用立即生效语义（由 core 负责）。
 */

import { createStore } from "solid-js/store";

import { settingsSet, systemInfo } from "@yovo/api";
import type { AppSettings, SettingKey } from "@yovo/api";

const DEFAULT_SETTINGS: AppSettings = {
  adb_path: "",
  data_root: "",
  devices_auto_refresh: 0,
  buffer_capacity: 50000,
  display_limit: 2000,
  clear_device_on_start: true,
  theme: "light",
};

export function createSettingsStore() {
  const [state, setState] = createStore<AppSettings>({ ...DEFAULT_SETTINGS });

  async function load(): Promise<void> {
    try {
      const info = await systemInfo();
      setState(info.settings);
    } catch (e) {
      console.error("system.info 失败", e);
    }
  }

  async function set(key: SettingKey, value: unknown): Promise<void> {
    const updated = await settingsSet(key, value);
    setState(updated);
  }

  return { state, load, set };
}

export type SettingsStoreApi = ReturnType<typeof createSettingsStore>;
