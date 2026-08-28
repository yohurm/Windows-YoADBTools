/**
 * 底部状态栏（UI设计系统-v6.md §3）：左版本 · 中留白 · 右「设备 · 任务」。
 * 任务项悬停显示明细（title = TaskInfo.detail，core 侧登记）。
 */

import { Component, For, Show } from "solid-js";

import { YoStatusBar } from "@yohu/ui";

import { deviceStore, settingsStore, taskStore } from "../stores";

export const StatusBar: Component = () => {
  const activeTasks = () => taskStore.state.tasks.filter((t) => t.active);
  const versionLabel = () => {
    const name = settingsStore.identity.display_name;
    const ver = settingsStore.identity.version;
    return ver ? `${name} v${ver}` : name;
  };

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
        </span>
      }
    />
  );
};
