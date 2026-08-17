/**
 * 设置面板（UI设计系统-v6.md §4.4）：分组卡片（工具链/日志/外观）。
 * 每项 = 两列网格（标签+徽章 | 全宽控件）；页面滚动，面板不裁切。
 * 保存成功 toast；路径项旁浏览按钮（tauri-plugin-dialog）。
 */

import { Component, onMount } from "solid-js";

import { open } from "@tauri-apps/plugin-dialog";

import {
  YBadge,
  YButton,
  YCheckbox,
  YPanel,
  YSelect,
  YTextField,
  YToaster,
  createToaster,
} from "@yovo/ui";
import type { Density, SettingKey, Theme } from "@yovo/api";

import { settingsStore } from "../stores";
import "./settings.css";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "compact", label: "紧凑（默认）" },
  { value: "comfortable", label: "舒适" },
];

const EXPORT_MODE_OPTIONS = [
  { value: "overwrite", label: "覆盖" },
  { value: "append", label: "续写" },
];

/** 设置页级 toaster（模块生命周期 = 应用生命周期）。 */
const toaster = createToaster();

/** 生效说明徽章。 */
function EffectBadge(props: { text: string }) {
  return <YBadge text={props.text} tone={props.text === "立即生效" ? "accent" : "neutral"} />;
}

/** 设置项头（label + 生效徽章）。 */
function ItemHead(props: { label: string; effect: string }) {
  return (
    <div class="yovo-settings__item-head">
      <span class="yovo-settings__item-label">{props.label}</span>
      <EffectBadge text={props.effect} />
    </div>
  );
}

export const SettingsView: Component = () => {
  onMount(() => {
    void settingsStore.load();
  });

  const save = (key: SettingKey, value: unknown, okText: string): void => {
    void settingsStore
      .set(key, value)
      .then(() => toaster.show(okText, "success"))
      .catch((e) => toaster.show(`保存失败: ${String(e)}`, "error"));
  };

  const browseAdb = async (): Promise<void> => {
    const selected = await open({
      title: "选择 adb.exe",
      multiple: false,
      filters: [{ name: "adb 可执行文件", extensions: ["exe"] }],
    });
    if (typeof selected === "string") {
      save("adb_path", selected, "已保存（立即生效）");
    }
  };

  const browseExportDir = async (): Promise<void> => {
    const selected = await open({
      title: "选择日志导出目录",
      directory: true,
      multiple: false,
    });
    if (typeof selected === "string") {
      save("export_default_path", selected, "已保存（立即生效）");
    }
  };

  return (
    <div class="yovo-settings">
      <h1 class="yovo-settings__title">设置</h1>

      <YPanel title="工具链">
        <div class="yovo-settings__item">
          <ItemHead label="ADB 路径" effect="立即生效" />
          <div class="yovo-settings__item-control">
            <YTextField
              value={settingsStore.state.adb_path}
              placeholder="%LOCALAPPDATA%\YovoAdbTools\data\tools\adb\adb.exe"
              ariaLabel="ADB 路径"
              clearable
              onInput={(v) => save("adb_path", v, "已保存（立即生效）")}
            />
            <YButton variant="secondary" onClick={() => void browseAdb()}>
              浏览
            </YButton>
          </div>
          <div class="yovo-settings__item-hint">留空 = 自动解析（用户设置 → 应用旁 → 内置解压）</div>
        </div>

        <div class="yovo-settings__item">
          <ItemHead label="数据目录" effect="重启生效" />
          <div class="yovo-settings__item-control">
            <YTextField
              value={settingsStore.state.data_root}
              placeholder="留空 = 默认 %LOCALAPPDATA%\YovoAdbTools\data"
              ariaLabel="数据目录"
              clearable
              onInput={(v) => save("data_root", v, "已保存（重启生效）")}
            />
          </div>
        </div>

        <div class="yovo-settings__item">
          <ItemHead label="设备自动刷新间隔（秒，0 = 关）" effect="重启生效" />
          <div class="yovo-settings__item-control">
            <YTextField
              type="number"
              value={String(settingsStore.state.devices_auto_refresh)}
              ariaLabel="设备自动刷新间隔"
              onInput={(v) => {
                const n = Number.parseInt(v, 10);
                if (!Number.isNaN(n) && n >= 0) {
                  save("devices_auto_refresh", n, "已保存（重启生效）");
                }
              }}
            />
          </div>
        </div>
      </YPanel>

      <YPanel title="日志分析">
        <div class="yovo-settings__item">
          <ItemHead label="环形缓冲行数" effect="下次采集生效" />
          <div class="yovo-settings__item-control">
            <YTextField
              type="number"
              value={String(settingsStore.state.buffer_capacity)}
              ariaLabel="环形缓冲行数"
              onInput={(v) => {
                const n = Number.parseInt(v, 10);
                if (n > 0) {
                  save("buffer_capacity", n, "已保存（下次采集生效）");
                }
              }}
            />
          </div>
        </div>

        <div class="yovo-settings__item">
          <ItemHead label="每会话可见行上限" effect="立即生效" />
          <div class="yovo-settings__item-control">
            <YTextField
              type="number"
              value={String(settingsStore.state.display_limit)}
              ariaLabel="每会话可见行上限"
              onInput={(v) => {
                const n = Number.parseInt(v, 10);
                if (n > 0) {
                  save("display_limit", n, "已保存（立即生效）");
                }
              }}
            />
          </div>
        </div>

        <div class="yovo-settings__item">
          <ItemHead label="开始采集前清空设备缓冲（logcat -c）" effect="下次采集生效" />
          <div class="yovo-settings__item-control">
            <YCheckbox
              label="启用"
              checked={settingsStore.state.clear_device_on_start}
              onChange={(v) => save("clear_device_on_start", v, "已保存（下次采集生效）")}
            />
          </div>
        </div>

        <div class="yovo-settings__item">
          <ItemHead label="默认导出路径" effect="立即生效" />
          <div class="yovo-settings__item-control">
            <YTextField
              value={settingsStore.state.export_default_path}
              placeholder="留空 = 应用 exports 目录"
              ariaLabel="默认导出路径"
              clearable
              onInput={(v) => save("export_default_path", v, "已保存（立即生效）")}
            />
            <YButton variant="secondary" onClick={() => void browseExportDir()}>
              选择文件夹
            </YButton>
          </div>
          <div class="yovo-settings__item-hint">关闭「每次询问」时写入该目录下的 logcat-设备号.txt</div>
        </div>

        <div class="yovo-settings__item">
          <ItemHead label="每次导出询问保存位置" effect="立即生效" />
          <div class="yovo-settings__item-control">
            <YCheckbox
              label="启用"
              checked={settingsStore.state.export_ask_every_time}
              onChange={(v) => save("export_ask_every_time", v, "已保存（立即生效）")}
            />
          </div>
        </div>

        <div class="yovo-settings__item">
          <ItemHead label="导出写入方式" effect="立即生效" />
          <div class="yovo-settings__item-control">
            <YSelect
              options={EXPORT_MODE_OPTIONS}
              value={settingsStore.state.export_write_mode}
              onChange={(v) => save("export_write_mode", v, "已保存（立即生效）")}
            />
          </div>
          <div class="yovo-settings__item-hint">覆盖替换目标文件；续写在同一路径末尾追加</div>
        </div>
      </YPanel>

      <YPanel title="外观">
        <div class="yovo-settings__item">
          <ItemHead label="主题" effect="立即生效" />
          <div class="yovo-settings__item-control">
            <YSelect
              options={THEME_OPTIONS}
              value={settingsStore.state.theme}
              onChange={(v) => save("theme", v, "已保存（立即生效）")}
            />
          </div>
        </div>

        <div class="yovo-settings__item">
          <ItemHead label="密度" effect="立即生效" />
          <div class="yovo-settings__item-control">
            <YSelect
              options={DENSITY_OPTIONS}
              value={settingsStore.state.density}
              onChange={(v) => save("density", v, "已保存（立即生效）")}
            />
          </div>
        </div>
      </YPanel>

      <YToaster toaster={toaster} />
    </div>
  );
};
