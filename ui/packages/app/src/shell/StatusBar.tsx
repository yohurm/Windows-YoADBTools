/**
 * 底部状态栏（UI设计系统-v6.md §3）：左版本 · 中留白 · 右「设备 · 任务」。
 * 任务项悬停显示明细（title = TaskInfo.detail，core 侧登记）。
 */

import { Component, For, Show } from "solid-js";

import { YStatusBar } from "@yovo/ui";

import { deviceStore, taskStore } from "../stores";

export const StatusBar: Component = () => {
  const activeTasks = () => taskStore.state.tasks.filter((t) => t.active);

  return (
    <YStatusBar
      left={<span class="yovo-status__version">Yovo ADB Tools v0.1.0</span>}
      right={
        <span class="yovo-status__right">
          <span class="yovo-status__device">设备: {deviceStore.state.statusText}</span>
          <Show when={activeTasks().length > 0}>
            <span class="yovo-status__tasks">
              任务:
              <For each={activeTasks()}>
                {(t) => (
                  <span class="yovo-status__task" title={t.detail ?? t.name}>
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
