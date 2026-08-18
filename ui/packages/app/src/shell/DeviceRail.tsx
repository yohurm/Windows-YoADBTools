/**
 * 设备栏（UI设计系统-v6.md §3）：卡片式设备列表。
 * 设备卡片：在线点 + 型号一行 + serial 等宽一行 + 未授权徽章；
 * 选中 = `.yovo-interactive--selected`（accent-soft 片）+ stroke-accent 左边条；空态引导 + 错误明细 + 重试。
 * 键盘：roving tabindex（选中行 0）+ Enter/Space 选择，role=listbox/option。
 */

import { Component, For, Show, createSignal } from "solid-js";

import { YoBadge, YoButton, YoIconButton } from "@yovo/ui";
import type { DeviceInfo } from "@yovo/api";

import { deviceStore } from "../stores";

/** 设备状态可读文本（title 提示）。 */
function stateText(state: DeviceInfo["state"]): string {
  switch (state) {
    case "online":
      return "在线";
    case "unauthorized":
      return "未授权";
    case "offline":
      return "离线";
  }
}

export const DeviceRail: Component = () => {
  const [expanded, setExpanded] = createSignal(true);

  const select = (serial: string): void => deviceStore.setFocus(serial);

  const onItemKeyDown = (serial: string, event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(serial);
    }
  };

  return (
    <div class="yovo-device-rail">
      <div class="yovo-device-rail__header">
        <YoIconButton
          icon={expanded() ? "chevron-down" : "chevron-right"}
          title={expanded() ? "折叠设备列表" : "展开设备列表"}
          onClick={() => setExpanded((v) => !v)}
        />
        <div class="yovo-device-rail__heading">
          <span class="yovo-device-rail__title">设备</span>
          <Show when={deviceStore.state.devices.length > 0}>
            <YoBadge text={String(deviceStore.state.devices.length)} tone="neutral" />
          </Show>
        </div>
        <YoIconButton
          icon="refresh"
          title="刷新设备"
          loading={deviceStore.state.refreshing}
          onClick={() => void deviceStore.refresh()}
        />
      </div>
      <Show when={expanded()}>
        <ul class="yovo-device-rail__list" role="listbox" aria-label="设备列表">
          <For each={deviceStore.state.devices}>
            {(device, index) => {
              const active = () => deviceStore.state.focusSerial === device.serial;
              return (
                <li
                  class="yovo-device-rail__item yovo-interactive yovo-focus-ring"
                  classList={{
                    "yovo-device-rail__item--active": active(),
                    "yovo-interactive--selected": active(),
                  }}
                  role="option"
                  aria-selected={active()}
                  tabIndex={active() || (deviceStore.state.focusSerial === null && index() === 0) ? 0 : -1}
                  title={`${device.model ?? device.serial} · ${device.serial} · ${stateText(device.state)}`}
                  onClick={() => select(device.serial)}
                  onKeyDown={(event) => onItemKeyDown(device.serial, event)}
                >
                  <span
                    class="yovo-device-rail__dot"
                    classList={{
                      "yovo-device-rail__dot--online": device.state === "online",
                      "yovo-device-rail__dot--off": device.state !== "online",
                    }}
                    aria-hidden="true"
                  />
                  <span class="yovo-device-rail__info">
                    <span class="yovo-device-rail__model">{device.model ?? device.serial}</span>
                    <span class="yovo-device-rail__serial">{device.serial}</span>
                  </span>
                  <Show when={device.state === "unauthorized"}>
                    <YoBadge text="未授权" tone="warn" />
                  </Show>
                </li>
              );
            }}
          </For>
        </ul>
        <Show when={deviceStore.state.devices.length === 0}>
          <div class="yovo-device-rail__empty">
            <div class="yovo-device-rail__empty-title">无设备</div>
            <Show when={deviceStore.state.lastError}>
              <div class="yovo-device-rail__empty-error" role="status" title={deviceStore.state.lastError}>
                {deviceStore.state.lastError}
              </div>
            </Show>
            <Show when={!deviceStore.state.lastError}>
              <div class="yovo-device-rail__empty-hint">
                请用 USB 连接设备并确认已授权（adb devices 可见）
              </div>
            </Show>
            <YoButton size="sm" variant="secondary" onClick={() => void deviceStore.refresh()}>
              重试扫描
            </YoButton>
          </div>
        </Show>
      </Show>
    </div>
  );
};
