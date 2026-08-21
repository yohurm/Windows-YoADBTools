/**
 * 设置 store：启动加载全量快照；set 后回写并应用立即生效语义（由 core 负责）。
 * 本 store 是设置的唯一 UI 投影；壳经 DeviceSession.settings 注入模块，模块禁止再 settings.get。
 * `system.info` 同时回填身份与路径目录（关于页 / 标题栏 / 状态栏 / 路径展示）。
 * 外观项（theme/density）在加载与变更后同步到 documentElement（data-theme/data-density）。
 */

import { createStore } from "solid-js/store";

import { APP_SETTINGS_DEFAULT, APP_IDENTITY, EMPTY_PATH_CATALOG, settingsSet, systemInfo } from "@yohu/api";
import type { AppIdentity, AppPathCatalog, AppSettings, SettingKey } from "@yohu/api";
import { setDensity, setTheme } from "@yohu/ui";

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
  const [state, setState] = createStore<AppSettings>({ ...APP_SETTINGS_DEFAULT });
  const [resolved, setResolved] = createStore({ ...EMPTY_RESOLVED });
  const [identity, setIdentity] = createStore<AppIdentity>({ ...APP_IDENTITY });
  const [paths, setPaths] = createStore<AppPathCatalog>({ ...EMPTY_PATH_CATALOG });

  async function load(): Promise<void> {
    try {
      const info = await systemInfo();
      setState(info.settings);
      setIdentity(info.identity);
      setPaths(info.paths);
      setResolved({
        adb_path: info.adb_in_use ?? info.adb_path ?? "",
        data_root: info.paths.data_root,
        export_default_path: info.paths.exports_dir,
      });
      applyAppearance(info.settings);
      if (info.identity.display_name) {
        document.title = info.identity.display_name;
      }
    } catch (e) {
      console.error("system.info 失败", e);
    }
  }

  async function set(key: SettingKey, value: unknown): Promise<void> {
    const updated = await settingsSet(key, value);
    setState(updated);
    applyAppearance(updated);
  }

  return { state, resolved, identity, paths, load, set };
}

export type SettingsStoreApi = ReturnType<typeof createSettingsStore>;
