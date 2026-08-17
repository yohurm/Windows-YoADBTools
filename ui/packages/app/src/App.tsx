/**
 * 应用组合根：模块注册（静态组合）→ 布局渲染 → 启动任务。
 */

import { Component, createSignal, onMount } from "solid-js";

import { systemReportError } from "@yovo/api";
import { setDensity, setTheme } from "@yovo/ui";

import { registerModule } from "./registry";
import { AppLayout } from "./shell/AppLayout";
import { deviceStore, settingsStore } from "./stores";

// ===== 模块静态组合在 apps/shell 入口完成（shell → modules → app 单向依赖，无环） =====

// 设置页作为壳内建模块
import { SettingsView } from "./settings/SettingsView";

registerModule({
  id: "settings",
  title: "设置",
  icon: "settings",
  selectionMode: "none",
  Component: SettingsView,
});

export const App: Component = () => {
  const [activeModuleId, setActiveModuleId] = createSignal("adb-terminal");

  onMount(() => {
    // 外观跟随设置（加载前先用当前快照兜底）
    setTheme(settingsStore.state.theme);
    setDensity(settingsStore.state.density);
    void settingsStore.load().then(() => {
      setTheme(settingsStore.state.theme);
      setDensity(settingsStore.state.density);
    });
    void deviceStore.refresh();

    // 前端全局错误上报（应用操作日志，与设备日志分离）
    window.addEventListener("error", (e) => {
      void systemReportError(`JS: ${e.message}`);
    });
  });

  return <AppLayout activeModuleId={activeModuleId} onNavigate={setActiveModuleId} />;
};
