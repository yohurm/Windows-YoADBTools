/**
 * 设置面板（UI设计系统-v6.md §4.5）：分组卡片（工具链/日志/外观/关于）。
 * 每项走 YoFormRow（左标题信息、右控件，两列垂直居中）；启用类走 YoSwitch（无「启用」二字）。
 * 文件位置项：只读展示框显示绝对路径 + 统一「浏览」；超长折叠中间。
 */

import { Component, For, Show, onMount, type JSX } from "solid-js";

import { APP_ICON_SRC } from "../app-identity";
import {
  DATA_DIR_NAME,
  dialogOpenDirectory,
  dialogOpenFile,
  errorText,
  systemOpenPath,
  type Density,
  type LogDisplayColumns,
  type SettingKey,
  type Theme,
} from "@yohu/api";
import {
  YoBadge,
  YoButton,
  YoCheckbox,
  YoChrome,
  YoDialog,
  YoFormRow,
  YoPanel,
  YoProgressBar,
  YoSelect,
  YoSwitch,
  YoTextField,
  YoToaster,
  createToaster,
} from "@yohu/ui";

import { settingsStore, updateStore } from "../stores";
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const WRITE_MODE_OPTIONS = [
  { value: "overwrite", label: "覆盖（默认）" },
  { value: "append", label: "续写（每次新开文件）" },
];

const EXPORT_MODE_OPTIONS = [
  { value: "latest", label: "最新（默认）" },
  { value: "select", label: "选择窗口文件" },
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

/** 生效说明徽章（产品文案，排布由 YoFormRow 承担）。 */
function EffectBadge(props: { text: string }): JSX.Element {
  return <YoBadge text={props.text} tone={props.text === "立即生效" ? "accent" : "neutral"} />;
}

/** 文件位置：只读绝对路径展示框 + 浏览。超长时 head 省略、末段保留。 */
function PathControl(props: { label: string; path: string; onBrowse: () => void }): JSX.Element {
  const parts = () => splitPathEnds(props.path);
  return (
    <>
      <div class="yohu-settings__path" title={props.path || undefined} aria-label={props.label}>
        <span class="yohu-settings__path-head">{parts().head}</span>
        <span class="yohu-settings__path-tail">{parts().tail}</span>
      </div>
      <YoButton variant="secondary" onClick={() => props.onBrowse()}>
        浏览
      </YoButton>
    </>
  );
}

/** 只读路径 + 打开资源管理器。 */
function PathOpenRow(props: { title: string; path: string }): JSX.Element {
  const parts = () => splitPathEnds(props.path);
  return (
    <YoFormRow class="yohu-settings__path-row" title={props.title}>
      <div class="yohu-settings__path" title={props.path || undefined} aria-label={props.title}>
        <span class="yohu-settings__path-head">{parts().head}</span>
        <span class="yohu-settings__path-tail">{parts().tail}</span>
      </div>
      <YoButton
        variant="secondary"
        disabled={!props.path}
        onClick={() => void systemOpenPath(props.path)}
      >
        打开
      </YoButton>
    </YoFormRow>
  );
}

export const SettingsView: Component = () => {
  onMount(() => {
    // 设置由壳根(App)与设置页都可能加载；system.info 幂等、低开销，双调用可接受（已记录）。
    void settingsStore.load().then(() => updateStore.refresh());
  });

  const save = (key: SettingKey, value: unknown, okText: string): void => {
    void settingsStore
      .set(key, value)
      .then(() => toaster.show(okText, "success"))
      .catch((e) => toaster.show(`保存失败: ${String(e)}`, "error"));
  };

  const checkAppUpdate = async (): Promise<void> => {
    try {
      const result = await updateStore.check();
      if (!result.has_new_version) {
        toaster.show("已是最新版本", "success");
      }
    } catch (e) {
      toaster.show(`检查更新失败: ${errorText(e)}`, "error");
    }
  };

  const openDownload = async (): Promise<void> => {
    try {
      await updateStore.openDownload();
    } catch (e) {
      toaster.show(`打开下载失败: ${errorText(e)}`, "error");
    }
  };

  const downloadUpdate = async (): Promise<void> => {
    try {
      await updateStore.download();
    } catch (e) {
      toaster.show(`下载失败: ${errorText(e)}`, "error");
    }
  };

  const installUpdate = async (): Promise<void> => {
    try {
      await updateStore.install();
    } catch (e) {
      toaster.show(`安装失败: ${errorText(e)}`, "error");
    }
  };

  const downloading = (): boolean => updateStore.phase() === "downloading";
  const applying = (): boolean => updateStore.phase() === "applying";
  const foundOpen = (): boolean => {
    const phase = updateStore.phase();
    return updateStore.pending() !== null && (phase === "idle" || phase === "downloading");
  };
  const confirmOpen = (): boolean => {
    const phase = updateStore.phase();
    return updateStore.pending() !== null && (phase === "ready" || phase === "applying");
  };

  const browseFile = async (
    key: SettingKey,
    title: string,
    okText: string,
    filters: { name: string; extensions: string[] }[],
  ): Promise<void> => {
    const selected = await dialogOpenFile({ title, filters });
    if (typeof selected === "string") {
      save(key, selected, okText);
    }
  };

  const browseDir = async (key: SettingKey, title: string, okText: string): Promise<void> => {
    const selected = await dialogOpenDirectory({ title });
    if (typeof selected === "string") {
      save(key, selected, okText);
    }
  };

  return (
    <div class="yohu-settings">
      <YoChrome title="设置" />

      <div class="yohu-settings__body">
        <YoPanel title="工具链">
          <YoFormRow
            class="yohu-settings__path-row"
            title="ADB 路径"
            description="未指定时显示自动解析的绝对路径（用户设置 → 应用旁 → 内置解压）"
            note={<EffectBadge text="立即生效" />}
          >
            <PathControl
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
          </YoFormRow>

          <YoFormRow
            class="yohu-settings__path-row"
            title="数据目录"
            description={`默认 %LOCALAPPDATA%\\${DATA_DIR_NAME}\\data。其下为 tools/adb 与 modules/（adb-terminal / file-manager / log-analyzer）。设置文件与应用日志固定在 LocalAppData，不随本目录迁移。`}
            note={<EffectBadge text="重启生效" />}
          >
            <PathControl
              label="数据目录"
              path={effectivePath(settingsStore.state.data_root, settingsStore.resolved.data_root)}
              onBrowse={() => void browseDir("data_root", "选择数据目录", "已保存（重启生效）")}
            />
          </YoFormRow>

          <YoFormRow title="设备自动刷新间隔（秒，0 = 关）" note={<EffectBadge text="重启生效" />}>
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
          </YoFormRow>
        </YoPanel>

        <YoPanel title="日志分析">
          <YoFormRow
            title="缓冲最大行数"
            note={<EffectBadge text="窗口立即裁剪，采集环下次启动" />}
          >
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
          </YoFormRow>

          <YoFormRow
            title="开始采集前清空设备缓冲（logcat -c）"
            note={<EffectBadge text="下次采集生效" />}
          >
            <YoSwitch
              ariaLabel="开始采集前清空设备缓冲（logcat -c）"
              checked={settingsStore.state.clear_device_on_start}
              onChange={(v) => save("clear_device_on_start", v, "已保存（下次采集生效）")}
            />
          </YoFormRow>

          <YoFormRow
            class="yohu-settings__path-row"
            title="默认导出路径"
            note={<EffectBadge text="立即生效" />}
          >
            <PathControl
              label="默认导出路径"
              path={effectivePath(
                settingsStore.state.export_default_path,
                settingsStore.resolved.export_default_path,
              )}
              onBrowse={() =>
                void browseDir("export_default_path", "选择日志导出目录", "已保存（立即生效）")
              }
            />
          </YoFormRow>

          <YoFormRow
            title="日志写入方式"
            note={<EffectBadge text="立即生效" />}
          >
            <YoSelect
              options={WRITE_MODE_OPTIONS}
              value={settingsStore.state.log_write_mode}
              onChange={(v) => save("log_write_mode", v, "已保存（立即生效）")}
            />
          </YoFormRow>

          <YoFormRow
            title="导出方式"
            note={<EffectBadge text="立即生效" />}
          >
            <YoSelect
              options={EXPORT_MODE_OPTIONS}
              value={settingsStore.state.export_mode}
              onChange={(v) => save("export_mode", v, "已保存（立即生效）")}
            />
          </YoFormRow>

          <YoFormRow
            title="每次导出询问保存位置"
            note={<EffectBadge text="立即生效" />}
          >
            <YoSwitch
              ariaLabel="每次导出询问保存位置"
              checked={settingsStore.state.export_ask_every_time}
              onChange={(v) => save("export_ask_every_time", v, "已保存（立即生效）")}
            />
          </YoFormRow>

          <YoFormRow
            title="日志显示列"
            note={<EffectBadge text="立即生效" />}
          >
            <div class="yohu-settings__checks">
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
          </YoFormRow>
        </YoPanel>

        <YoPanel title="投屏显示">
          <YoFormRow
            title="强制 ADB forward"
            description="协议、长边、码率、帧率在投屏显示页调节。无线调试默认 forward；USB 上 reverse 失败也会回退。需要跳过 reverse 时打开此开关。"
            note={<EffectBadge text="下次启动生效" />}
          >
            <YoSwitch
              ariaLabel="强制 ADB forward（跳过 reverse）"
              checked={settingsStore.state.mirror_force_forward}
              onChange={(v) => save("mirror_force_forward", v, "已保存（下次启动生效）")}
            />
          </YoFormRow>
        </YoPanel>

        <YoPanel title="外观">
          <YoFormRow title="主题" note={<EffectBadge text="立即生效" />}>
            <YoSelect
              options={THEME_OPTIONS}
              value={settingsStore.state.theme}
              onChange={(v) => save("theme", v, "已保存（立即生效）")}
            />
          </YoFormRow>

          <YoFormRow title="密度" note={<EffectBadge text="立即生效" />}>
            <YoSelect
              options={DENSITY_OPTIONS}
              value={settingsStore.state.density}
              onChange={(v) => save("density", v, "已保存（立即生效）")}
            />
          </YoFormRow>
        </YoPanel>

        <YoPanel title="关于">
          <div class="yohu-settings__about">
            <img
              class="yohu-settings__about-icon"
              src={APP_ICON_SRC}
              alt=""
              width={48}
              height={48}
            />
            <div class="yohu-settings__about-copy">
              <div class="yohu-settings__about-name">{settingsStore.identity.display_name}</div>
              <div class="yohu-settings__about-desc">{settingsStore.identity.description}</div>
            </div>
          </div>
          <YoFormRow title="版本">
            <span class="yohu-settings__value">{settingsStore.identity.version}</span>
            <YoButton
              size="sm"
              variant="secondary"
              loading={updateStore.checking()}
              disabled={updateStore.checking()}
              onClick={() => void checkAppUpdate()}
            >
              检查更新
            </YoButton>
          </YoFormRow>
          <YoFormRow title="标识">
            <span class="yohu-settings__value">{settingsStore.identity.identifier}</span>
          </YoFormRow>
          <YoFormRow title="版权">
            <span class="yohu-settings__value">{settingsStore.identity.copyright}</span>
          </YoFormRow>
          <PathOpenRow title="数据根" path={settingsStore.paths.data_root} />
          <PathOpenRow title="设置目录" path={settingsStore.paths.settings_dir} />
          <PathOpenRow title="应用日志" path={settingsStore.paths.logs_dir} />
        </YoPanel>
      </div>

      <YoDialog
        open={foundOpen}
        title="发现新版本"
        onClose={() => updateStore.dismiss()}
        footer={
          <Show
            when={!downloading()}
            fallback={
              <YoButton variant="ghost" onClick={() => updateStore.dismiss()}>
                取消
              </YoButton>
            }
          >
            <YoButton variant="ghost" onClick={() => updateStore.dismiss()}>
              稍后
            </YoButton>
            <YoButton variant="ghost" onClick={() => void openDownload()}>
              浏览器下载
            </YoButton>
            <Show when={updateStore.canApply()}>
              <YoButton onClick={() => void downloadUpdate()}>下载</YoButton>
            </Show>
          </Show>
        }
      >
        <p class="yohu-settings__update-ver">{updateStore.pending()?.version}</p>
        <Show when={(updateStore.pending()?.size_bytes ?? 0) > 0}>
          <p class="yohu-settings__update-meta">{formatBytes(updateStore.pending()?.size_bytes ?? 0)}</p>
        </Show>
        <Show when={updateStore.pending()?.description}>
          <p class="yohu-settings__update-desc">{updateStore.pending()?.description}</p>
        </Show>
        <Show when={downloading()}>
          <div class="yohu-settings__update-progress">
            <YoProgressBar
              value={updateStore.percent()}
              indeterminate={(updateStore.progress()?.total_bytes ?? 0) <= 0}
            />
            <p class="yohu-settings__update-progress-text">
              {updateStore.progress()?.total_bytes
                ? `已下载 ${formatBytes(updateStore.progress()?.received_bytes ?? 0)} / ${formatBytes(updateStore.progress()?.total_bytes ?? 0)}`
                : "正在下载安装包…"}
            </p>
          </div>
        </Show>
      </YoDialog>

      <YoDialog
        open={confirmOpen}
        title="安装更新"
        onClose={() => updateStore.dismiss()}
        footer={
          <>
            <Show when={!applying()}>
              <YoButton variant="ghost" onClick={() => updateStore.dismiss()}>
                取消
              </YoButton>
            </Show>
            <YoButton loading={applying()} disabled={applying()} onClick={() => void installUpdate()}>
              {applying() ? "正在安装…" : "安装并重启"}
            </YoButton>
          </>
        }
      >
        <p class="yohu-settings__update-copy">
          已下载 {updateStore.pending()?.version}。安装将关闭应用并覆盖当前版本，完成后自动启动。
        </p>
        <Show when={applying()}>
          <p class="yohu-settings__update-progress-text">正在覆盖安装，应用即将重启…</p>
        </Show>
      </YoDialog>

      <YoToaster toaster={toaster} />
    </div>
  );
};
