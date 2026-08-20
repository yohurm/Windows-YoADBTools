/**
 * 设置面板（UI设计系统-v6.md §4.5）：分组卡片（工具链/日志/外观）。
 * 每项 = 标签靠左、控件靠右 hug；启用类走 YoSwitch（无「启用」二字）。
 * 文件位置项：只读展示框显示绝对路径 + 统一「浏览」；超长折叠中间。
 */

import { Component, For, onMount } from "solid-js";

import { open } from "@tauri-apps/plugin-dialog";

import {
  YoBadge,
  YoButton,
  YoCheckbox,
  YoChrome,
  YoPanel,
  YoSelect,
  YoSwitch,
  YoTextField,
  YoToaster,
  createToaster,
} from "@yohu/ui";
import type { Density, LogDisplayColumns, SettingKey, Theme } from "@yohu/api";

import { settingsStore } from "../stores";
import { effectivePath, splitPathEnds } from "./path-display";
import "./settings.css";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "comfortable", label: "舒适（默认）" },
  { value: "compact", label: "紧凑" },
];

const EXPORT_MODE_OPTIONS = [
  { value: "overwrite", label: "覆盖" },
  { value: "append", label: "续写" },
];

const LOG_COLUMN_OPTIONS: { key: keyof LogDisplayColumns; label: string }[] = [
  { key: "ts", label: "时间" },
  { key: "uid", label: "UID" },
  { key: "pid", label: "PID" },
  { key: "tid", label: "TID" },
  { key: "level", label: "级别" },
  { key: "tag", label: "Tag" },
];

/** 设置页级 toaster（模块生命周期 = 应用生命周期）。 */
const toaster = createToaster();

/** 生效说明徽章。 */
function EffectBadge(props: { text: string }) {
  return <YoBadge text={props.text} tone={props.text === "立即生效" ? "accent" : "neutral"} />;
}

/** 设置项头（label + 生效徽章）。 */
function ItemHead(props: { label: string; effect: string }) {
  return (
    <div class="yohu-settings__item-head">
      <span class="yohu-settings__item-label">{props.label}</span>
      <EffectBadge text={props.effect} />
    </div>
  );
}

/** 文件位置：只读绝对路径展示框 + 浏览。超长时 head 省略、末段保留。 */
function PathField(props: { label: string; path: string; onBrowse: () => void }) {
  const parts = () => splitPathEnds(props.path);
  return (
    <div class="yohu-settings__item-control yohu-settings__item-control--path">
      <div class="yohu-settings__path" title={props.path || undefined} aria-label={props.label}>
        <span class="yohu-settings__path-head">{parts().head}</span>
        <span class="yohu-settings__path-tail">{parts().tail}</span>
      </div>
      <YoButton variant="secondary" onClick={() => props.onBrowse()}>
        浏览
      </YoButton>
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

  const browseFile = async (
    key: SettingKey,
    title: string,
    okText: string,
    filters: { name: string; extensions: string[] }[],
  ): Promise<void> => {
    const selected = await open({ title, multiple: false, filters });
    if (typeof selected === "string") {
      save(key, selected, okText);
    }
  };

  const browseDir = async (key: SettingKey, title: string, okText: string): Promise<void> => {
    const selected = await open({ title, directory: true, multiple: false });
    if (typeof selected === "string") {
      save(key, selected, okText);
    }
  };

  return (
    <div class="yohu-settings">
      <YoChrome title="设置" />

      <div class="yohu-settings__body">
        <YoPanel title="工具链">
        <div class="yohu-settings__item">
          <ItemHead label="ADB 路径" effect="立即生效" />
          <PathField
            label="ADB 路径"
            path={effectivePath(settingsStore.state.adb_path, settingsStore.resolved.adb_path)}
            onBrowse={() =>
              void browseFile(
                "adb_path",
                "选择 adb.exe",
                "已保存（立即生效）",
                [{ name: "adb 可执行文件", extensions: ["exe"] }],
              )
            }
          />
          <div class="yohu-settings__item-hint">未指定时显示自动解析的绝对路径（用户设置 → 应用旁 → 内置解压）</div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="数据目录" effect="重启生效" />
          <PathField
            label="数据目录"
            path={effectivePath(settingsStore.state.data_root, settingsStore.resolved.data_root)}
            onBrowse={() => void browseDir("data_root", "选择数据目录", "已保存（重启生效）")}
          />
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="设备自动刷新间隔（秒，0 = 关）" effect="重启生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--number">
            <YoTextField
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
      </YoPanel>

      <YoPanel title="日志分析">
        <div class="yohu-settings__item">
          <ItemHead label="缓冲最大行数" effect="窗口立即裁剪，采集环下次启动" />
          <div class="yohu-settings__item-control yohu-settings__item-control--number">
            <YoTextField
              type="number"
              value={String(settingsStore.state.buffer_capacity)}
              ariaLabel="缓冲最大行数"
              onInput={(v) => {
                const n = Number.parseInt(v, 10);
                if (n > 0) {
                  save("buffer_capacity", n, "已保存（窗口立即裁剪，采集环下次启动）");
                }
              }}
            />
          </div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="开始采集前清空设备缓冲（logcat -c）" effect="下次采集生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--switch">
            <YoSwitch
              ariaLabel="开始采集前清空设备缓冲（logcat -c）"
              checked={settingsStore.state.clear_device_on_start}
              onChange={(v) => save("clear_device_on_start", v, "已保存（下次采集生效）")}
            />
          </div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="默认导出路径" effect="立即生效" />
          <PathField
            label="默认导出路径"
            path={effectivePath(
              settingsStore.state.export_default_path,
              settingsStore.resolved.export_default_path,
            )}
            onBrowse={() =>
              void browseDir("export_default_path", "选择日志导出目录", "已保存（立即生效）")
            }
          />
          <div class="yohu-settings__item-hint">关闭「每次询问」时写入该目录下的 logcat-设备号.txt</div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="每次导出询问保存位置" effect="立即生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--switch">
            <YoSwitch
              ariaLabel="每次导出询问保存位置"
              checked={settingsStore.state.export_ask_every_time}
              onChange={(v) => save("export_ask_every_time", v, "已保存（立即生效）")}
            />
          </div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="导出写入方式" effect="立即生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--select">
            <YoSelect
              options={EXPORT_MODE_OPTIONS}
              value={settingsStore.state.export_write_mode}
              onChange={(v) => save("export_write_mode", v, "已保存（立即生效）")}
            />
          </div>
          <div class="yohu-settings__item-hint">覆盖替换目标文件；续写在同一路径末尾追加</div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="日志显示列" effect="立即生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--checks">
            <For each={LOG_COLUMN_OPTIONS}>
              {(opt) => (
                <YoCheckbox
                  label={opt.label}
                  checked={settingsStore.state.log_display_columns[opt.key]}
                  onChange={(v) =>
                    save(
                      "log_display_columns",
                      { ...settingsStore.state.log_display_columns, [opt.key]: v },
                      "已保存（立即生效）",
                    )
                  }
                />
              )}
            </For>
          </div>
          <div class="yohu-settings__item-hint">消息列始终显示。关闭的列不出现在清单表头与行内。</div>
        </div>
      </YoPanel>

      <YoPanel title="外观">
        <div class="yohu-settings__item">
          <ItemHead label="主题" effect="立即生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--select">
            <YoSelect
              options={THEME_OPTIONS}
              value={settingsStore.state.theme}
              onChange={(v) => save("theme", v, "已保存（立即生效）")}
            />
          </div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="密度" effect="立即生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--select">
            <YoSelect
              options={DENSITY_OPTIONS}
              value={settingsStore.state.density}
              onChange={(v) => save("density", v, "已保存（立即生效）")}
            />
          </div>
        </div>
        </YoPanel>
      </div>

      <YoToaster toaster={toaster} />
    </div>
  );
};
