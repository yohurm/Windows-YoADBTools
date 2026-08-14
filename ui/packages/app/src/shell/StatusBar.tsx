/**
 * 底部状态栏：版本号（左）+ 后台任务 + 设备状态（右）。
 */

import { Component, For, Show } from "solid-js";

import { YStatusBar } from "@yovo/ui";

import { deviceStore, settingsStore, taskStore } from "../stores";

export const StatusBar: Component = () => {
  const activeTasks = () => taskStore.state.tasks.filter((t) => t.active);

  return (
    <YStatusBar
      left={<span>Yovo ADB Tools v0.1.0</span>}
      right={
        <>
          <Show when={activeTasks().length > 0}>
            <span class="yovo-status__tasks">
              任务 <For each={activeTasks()}>{(t) => <span class="yovo-status__task">{t.name}</span>}</For>
            </span>
          </Show>
          <span class="yovo-status__device">设备: {deviceStore.state.statusText}</span>
        </>
      }
    />
  );
};
