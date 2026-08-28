/**
 * 设置面板（UI设计系统-v6.md §4.5）：分组卡片（工具链/日志/外观/关于）。
 * 每项 = 标签靠左、控件靠右 hug；启用类走 YoSwitch（无「启用」二字）。
 * 文件位置项：只读展示框显示绝对路径 + 统一「浏览」；超长折叠中间。
 */

import { Component, For, onMount } from "solid-js";

import {
  APP_ICON_SRC,
  DATA_DIR_NAME,
  dialogOpenDirectory,
  dialogOpenFile,
  errorText,
  systemOpenPath,
  type Density,
  type LogDisplayColumns,
  type SettingKey,
  type Theme,
  type UpdateProvider,
} from "@yohu/api";
import {
  YoBadge,
  YoButton,
  YoCheckbox,
  YoChrome,
  YoDialog,
  YoPanel,
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

const UPDATE_PROVIDER_OPTIONS: { value: UpdateProvider; label: string }[] = [
  { value: "gitcode", label: "GitCode（默认）" },
  { value: "github", label: "GitHub" },
  { value: "pgyer", label: "蒲公英" },
];

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

/** 只读路径 + 打开资源管理器。 */
function PathOpenField(props: { label: string; path: string }) {
  const parts = () => splitPathEnds(props.path);
  return (
    <div class="yohu-settings__item">
      <span class="yohu-settings__item-label">{props.label}</span>
      <div class="yohu-settings__item-control yohu-settings__item-control--path">
        <div class="yohu-settings__path" title={props.path || undefined} aria-label={props.label}>
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
      </div>
    </div>
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
          <div class="yohu-settings__item-hint">
            默认 %LOCALAPPDATA%\{DATA_DIR_NAME}\data。其下为 tools/adb 与 modules/（adb-terminal /
            file-manager / log-analyzer）。设置文件与应用日志固定在 LocalAppData，不随本目录迁移。
          </div>
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
          <div class="yohu-settings__item-hint">手动导出的合并文件写入该目录；留空 = 应用导出目录</div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="日志写入方式" effect="立即生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--select">
            <YoSelect
              options={WRITE_MODE_OPTIONS}
              value={settingsStore.state.log_write_mode}
              onChange={(v) => save("log_write_mode", v, "已保存（立即生效）")}
            />
          </div>
          <div class="yohu-settings__item-hint">覆盖 = 每窗口固定文件、下次采集截断；续写 = 每次任务新开文件保留旧文件</div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="导出方式" effect="立即生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--select">
            <YoSelect
              options={EXPORT_MODE_OPTIONS}
              value={settingsStore.state.export_mode}
              onChange={(v) => save("export_mode", v, "已保存（立即生效）")}
            />
          </div>
          <div class="yohu-settings__item-hint">最新 = 直接导出当前窗口日志文件；选择 = 弹窗多选窗口日志文件再导出</div>
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
          <div class="yohu-settings__item-hint">开启则每次导出弹保存对话框；关闭则直接写入默认导出路径</div>
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

      <YoPanel title="投屏显示">
        <div class="yohu-settings__item">
          <ItemHead label="长边上限（像素，0 = 原始）" effect="下次启动生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--number">
            <YoTextField
              type="number"
              value={String(settingsStore.state.mirror_max_size)}
              ariaLabel="投屏长边上限"
              onInput={(v) => {
                const n = Number.parseInt(v, 10);
                if (!Number.isNaN(n) && n >= 0) {
                  save("mirror_max_size", n, "已保存（下次启动生效）");
                }
              }}
            />
          </div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="视频码率（bps）" effect="下次启动生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--number">
            <YoTextField
              type="number"
              value={String(settingsStore.state.mirror_video_bit_rate)}
              ariaLabel="投屏视频码率"
              onInput={(v) => {
                const n = Number.parseInt(v, 10);
                if (n > 0) {
                  save("mirror_video_bit_rate", n, "已保存（下次启动生效）");
                }
              }}
            />
          </div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="帧率上限（0 = 不限制）" effect="下次启动生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--number">
            <YoTextField
              type="number"
              value={String(settingsStore.state.mirror_max_fps)}
              ariaLabel="投屏帧率上限"
              onInput={(v) => {
                const n = Number.parseInt(v, 10);
                if (!Number.isNaN(n) && n >= 0) {
                  save("mirror_max_fps", n, "已保存（下次启动生效）");
                }
              }}
            />
          </div>
        </div>

        <div class="yohu-settings__item">
          <ItemHead label="强制 ADB forward（跳过 reverse）" effect="下次启动生效" />
          <div class="yohu-settings__item-control yohu-settings__item-control--switch">
            <YoSwitch
              ariaLabel="强制 ADB forward（跳过 reverse）"
              checked={settingsStore.state.mirror_force_forward}
              onChange={(v) => save("mirror_force_forward", v, "已保存（下次启动生效）")}
            />
          </div>
          <div class="yohu-settings__item-hint">部分无线调试环境 reverse 不可用时再打开。默认只读投屏，控制在页眉开关。</div>
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

        <YoPanel title="更新">
          <div class="yohu-settings__item">
            <ItemHead label="更新源" effect="立即生效" />
            <div class="yohu-settings__item-control yohu-settings__item-control--select">
              <YoSelect
                options={UPDATE_PROVIDER_OPTIONS}
                value={settingsStore.state.update_provider}
                onChange={(v) => {
                  void settingsStore
                    .set("update_provider", v)
                    .then(() => updateStore.refresh())
                    .then(() => toaster.show("已保存（立即生效）", "success"))
                    .catch((e) => toaster.show(`保存失败: ${String(e)}`, "error"));
                }}
              />
            </div>
            <div class="yohu-settings__item-hint">
              {settingsStore.state.update_provider === "pgyer"
                ? "蒲公英需在设置目录的 update.json 填写 api_key / app_key"
                : `当前仓库 ${updateStore.channel()?.remote || "—"}`}
            </div>
          </div>
          <div class="yohu-settings__item">
            <ItemHead label="检查更新" effect="立即生效" />
            <div class="yohu-settings__item-control">
              <YoButton
                variant="secondary"
                disabled={updateStore.checking()}
                onClick={() => void checkAppUpdate()}
              >
                {updateStore.checking() ? "检查中…" : "检查更新"}
              </YoButton>
            </div>
            <div class="yohu-settings__item-hint">
              默认从 GitCode 仓库 yohurm/ReleaseYoADBTools 拉取 Windows x64 安装包
            </div>
          </div>
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
              <div class="yohu-settings__item-hint">{settingsStore.identity.description}</div>
            </div>
          </div>
          <div class="yohu-settings__item">
            <span class="yohu-settings__item-label">版本</span>
            <span class="yohu-settings__item-value">{settingsStore.identity.version}</span>
          </div>
          <div class="yohu-settings__item">
            <span class="yohu-settings__item-label">标识</span>
            <span class="yohu-settings__item-value">{settingsStore.identity.identifier}</span>
          </div>
          <div class="yohu-settings__item">
            <span class="yohu-settings__item-label">版权</span>
            <span class="yohu-settings__item-value">{settingsStore.identity.copyright}</span>
          </div>
          <PathOpenField label="数据根" path={settingsStore.paths.data_root} />
          <PathOpenField label="设置目录" path={settingsStore.paths.settings_dir} />
          <PathOpenField label="应用日志" path={settingsStore.paths.logs_dir} />
        </YoPanel>
      </div>

      <YoDialog
        open={() => updateStore.pending() !== null}
        title="发现新版本"
        onClose={() => updateStore.dismiss()}
        footer={
          <>
            <YoButton variant="ghost" onClick={() => updateStore.dismiss()}>
              稍后
            </YoButton>
            <YoButton onClick={() => void openDownload()}>前往下载</YoButton>
          </>
        }
      >
        <p class="yohu-settings__update-ver">{updateStore.pending()?.version}</p>
        <p class="yohu-settings__update-desc">{updateStore.pending()?.description || "有新版本可用。"}</p>
      </YoDialog>

      <YoToaster toaster={toaster} />
    </div>
  );
};
