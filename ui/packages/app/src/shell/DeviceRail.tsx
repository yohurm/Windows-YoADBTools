/**
 * 设备栏：在线状态点 + 型号/序列号 + 刷新 + 折叠 + 焦点选择。
 */

import { Component, For, Show, createSignal } from "solid-js";

import { YButton, YIconButton } from "@yovo/ui";

import { deviceStore } from "../stores";

export const DeviceRail: Component = () => {
  const [expanded, setExpanded] = createSignal(true);

  return (
    <div class="yovo-device-rail">
      <div class="yovo-device-rail__header">
        <YIconButton
          icon={expanded() ? "chevron-down" : "chevron-right"}
          title={expanded() ? "折叠设备列表" : "展开设备列表"}
          onClick={() => setExpanded((v) => !v)}
        />
        <span class="yovo-device-rail__title">设备</span>
        <YIconButton
          icon="refresh"
          title="刷新设备"
          disabled={deviceStore.state.refreshing}
          onClick={() => void deviceStore.refresh()}
        />
      </div>
      <Show when={expanded()}>
        <ul class="yovo-device-rail__list">
          <For each={deviceStore.state.devices}>
            {(device) => (
              <li
                class="yovo-device-rail__item"
                classList={{ "yovo-device-rail__item--active": deviceStore.state.focusSerial === device.serial }}
                onClick={() => deviceStore.setFocus(device.serial)}
              >
                <span
                  class="yovo-device-rail__dot"
                  classList={{
                    "yovo-device-rail__dot--online": device.state === "online",
                    "yovo-device-rail__dot--off": device.state !== "online",
                  }}
                />
                <span class="yovo-device-rail__info">
                  <span class="yovo-device-rail__model">{device.model ?? device.serial}</span>
                  <span class="yovo-device-rail__serial">{device.serial}</span>
                </span>
                <Show when={device.state === "unauthorized"}>
                  <span class="yovo-device-rail__badge">未授权</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
        <Show when={deviceStore.state.devices.length === 0}>
          <div class="yovo-device-rail__empty">
            <div class="yovo-device-rail__empty-title">无设备</div>
            <Show when={deviceStore.state.lastError}>
              <div class="yovo-device-rail__empty-error" title={deviceStore.state.lastError}>
                {deviceStore.state.lastError}
              </div>
            </Show>
            <Show when={!deviceStore.state.lastError}>
              <div class="yovo-device-rail__empty-hint">
                请用 USB 连接设备并确认已授权（adb devices 可见）
              </div>
            </Show>
            <YButton size="sm" variant="secondary" onClick={() => void deviceStore.refresh()}>
              重试扫描
            </YButton>
          </div>
        </Show>
      </Show>
    </div>
  );
};
