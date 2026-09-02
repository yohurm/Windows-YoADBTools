/**
 * 底部状态栏（UI设计系统-v6.md §3）：左版本 · 中留白 · 右「设备 · 任务 · 状态」。
 * 状态槽由已注册模块的 Status 贡献（投屏实测 fps 等）；任务项悬停显示明细。
 */

import { Component, For, Show } from "solid-js";

import { YoStatusBar } from "@yohu/ui";

import { modules } from "../registry";
import { deviceStore, settingsStore, taskStore } from "../stores";

export const StatusBar: Component = () => {
  const activeTasks = () => taskStore.state.tasks.filter((t) => t.active);
  const versionLabel = () => {
    const name = settingsStore.identity.display_name;
    const ver = settingsStore.identity.version;
    return ver ? `${name} v${ver}` : name;
  };
  const statusMods = () => modules().filter((m) => m.Status);

  return (
    <YoStatusBar
      left={<span class="yohu-status__version">{versionLabel()}</span>}
      right={
        <span class="yohu-status__right">
          <span class="yohu-status__device">设备: {deviceStore.state.statusText}</span>
          <Show when={activeTasks().length > 0}>
            <span class="yohu-status__tasks">
              任务:
              <For each={activeTasks()}>
                {(t) => (
                  <span class="yohu-status__task" title={t.detail ?? t.name}>
                    {t.name}
                  </span>
                )}
              </For>
            </span>
          </Show>
          <span class="yohu-status__metrics">
            <For each={statusMods()}>
              {(mod) => {
                const Status = mod.Status!;
                return <Status />;
              }}
            </For>
          </span>
        </span>
      }
    />
  );
};
