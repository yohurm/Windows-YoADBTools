/**
 * 设置 store：启动加载全量快照；set 后回写并应用立即生效语义（由 core 负责）。
 * 本 store 是设置的唯一 UI 投影；壳经 DeviceSession.settings 注入模块，模块禁止再 settings.get。
 * `system.info` 同时回填身份与路径目录（关于页 / 标题栏 / 状态栏 / 路径展示）。
 * 外观项（theme/density）在加载与变更后同步到 documentElement（data-theme/data-density）。
 */

import { createStore } from "solid-js/store";

import {
  APP_SETTINGS_DEFAULT,
  APP_IDENTITY,
  EMPTY_PATH_CATALOG,
  onSettingsChanged,
  settingsSet,
  systemInfo,
  YoLog,
} from "@yohu/api";
import type { AppIdentity, AppPathCatalog, AppSettings, SettingKey, SettingValue } from "@yohu/api";
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
      YoLog.error("settings", "加载失败", String(e));
      console.error("system.info 失败", e);
    }
  }

  async function set(key: SettingKey, value: unknown): Promise<void> {
    try {
      // 本 store 是设置页的通用分发器（key/value 在 UI 侧本身松散），
      // 类型精确性收敛在 @yohu/api 的 settingsSet<K>(key, SettingValue<K>)。在此显式断言。
      const updated = await settingsSet(key, value as SettingValue<SettingKey>);
      setState(updated);
      applyAppearance(updated);
      YoLog.info("settings", "已保存", { key, value });
    } catch (e) {
      YoLog.error("settings", "保存失败", { key, error: String(e) });
      throw e;
    }
  }

  // 模块也可 settings.set（IPC）；壳投影必须跟 settings.changed，禁止出现双份真相。
  void onSettingsChanged((e) => {
    setState(e.settings);
    applyAppearance(e.settings);
  });

  return { state, resolved, identity, paths, load, set };
}

export type SettingsStoreApi = ReturnType<typeof createSettingsStore>;
