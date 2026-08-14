/**
 * 设置面板：仅必要项（工具链 + 日志运行参数 + 主题）。
 * 生效语义由 core 负责（adb.path 立即；data.root 重启）。
 */

import { Component, createSignal, onMount } from "solid-js";

import { YCheckbox, YPanel, YSelect, YTextField } from "@yovo/ui";

import { settingsStore } from "../stores";

const THEME_OPTIONS = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

export const SettingsView: Component = () => {
  const [saved, setSaved] = createSignal("");

  onMount(() => {
    void settingsStore.load();
  });

  const flash = (text: string) => {
    setSaved(text);
    window.setTimeout(() => setSaved(""), 2000);
  };

  return (
    <div class="yovo-settings">
      <h1 class="yovo-settings__title">设置</h1>

      <YPanel title="工具链">
        <YTextField
          label="ADB 路径（留空 = 自动解析，立即生效）"
          value={settingsStore.state.adb_path}
          placeholder="%LOCALAPPDATA%\YovoAdbTools\data\tools\adb\adb.exe"
          clearable
          onInput={(v) => void settingsStore.set("adb_path", v).then(() => flash("已保存"))}
        />
        <YTextField
          label="数据目录（重启生效）"
          value={settingsStore.state.data_root}
          placeholder="留空 = 默认 %LOCALAPPDATA%\YovoAdbTools\data"
          clearable
          onInput={(v) => void settingsStore.set("data_root", v).then(() => flash("已保存（重启生效）"))}
        />
        <YTextField
          label="设备自动刷新间隔（秒，0 = 关）"
          type="number"
          value={String(settingsStore.state.devices_auto_refresh)}
          onInput={(v) => {
            const n = Number.parseInt(v, 10);
            if (!Number.isNaN(n) && n >= 0) {
              void settingsStore.set("devices_auto_refresh", n).then(() => flash("已保存（重启生效）"));
            }
          }}
        />
      </YPanel>

      <YPanel title="日志分析">
        <YTextField
          label="环形缓冲行数（下次采集生效）"
          type="number"
          value={String(settingsStore.state.buffer_capacity)}
          onInput={(v) => {
            const n = Number.parseInt(v, 10);
            if (n > 0) {
              void settingsStore.set("buffer_capacity", n).then(() => flash("已保存"));
            }
          }}
        />
        <YTextField
          label="每会话可见行上限"
          type="number"
          value={String(settingsStore.state.display_limit)}
          onInput={(v) => {
            const n = Number.parseInt(v, 10);
            if (n > 0) {
              void settingsStore.set("display_limit", n).then(() => flash("已保存"));
            }
          }}
        />
        <YCheckbox
          label="开始采集前清空设备缓冲（logcat -c）"
          checked={settingsStore.state.clear_device_on_start}
          onChange={(v) => void settingsStore.set("clear_device_on_start", v).then(() => flash("已保存"))}
        />
      </YPanel>

      <YPanel title="外观">
        <div class="yovo-settings__field-label">主题</div>
        <YSelect
          options={THEME_OPTIONS}
          value={settingsStore.state.theme}
          onChange={(v) => void settingsStore.set("theme", v).then(() => flash("已保存"))}
        />
      </YPanel>

      <div class="yovo-settings__saved">{saved()}</div>
    </div>
  );
};
