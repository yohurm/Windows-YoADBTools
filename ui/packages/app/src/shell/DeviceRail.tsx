/**
 * 设备栏（UI设计系统-v6.md §3）：卡片式设备列表。
 * 设备卡片：在线点 + 型号一行 + serial 等宽一行 + 未授权徽章；
 * 选中 = `.yohu-interactive--selected`（全表面同一配方）；空态引导 + 错误明细 + 重试。
 * 键盘：roving tabindex（焦点行 0）+ Enter/Space 选择，role=listbox/option。
 * MultiOptional：单击替换勾选；Ctrl/Meta+click 加减选。高亮 = 解析后的执行目标。
 */

import { Component, For, Show, createSignal } from "solid-js";

import { YoBadge, YoButton, YoCollapse, YoIconButton } from "@yohu/ui";
import type { DeviceInfo } from "@yohu/api";

import type { SelectionMode } from "../registry";
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

export const DeviceRail: Component<{
  moduleId?: string;
  selectionMode?: SelectionMode;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(true);
  const multi = () => props.selectionMode === "multiOptional";

  const targets = (): string[] => {
    if (props.moduleId && props.selectionMode) {
      return deviceStore.selectedSerials(props.moduleId, props.selectionMode);
    }
    return deviceStore.state.focusSerial ? [deviceStore.state.focusSerial] : [];
  };

  const isSelected = (serial: string): boolean => targets().includes(serial);

  const select = (serial: string, event?: MouseEvent | KeyboardEvent): void => {
    deviceStore.selectDevice(serial, {
      moduleId: props.moduleId,
      mode: props.selectionMode,
      additive: multi() && Boolean(event && (event.ctrlKey || event.metaKey)),
    });
  };

  const onItemKeyDown = (serial: string, event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(serial, event);
    }
  };

  return (
    <div class="yohu-device-rail">
      <div class="yohu-device-rail__header">
        <YoIconButton
          icon={expanded() ? "chevron-down" : "chevron-right"}
          title={expanded() ? "折叠设备列表" : "展开设备列表"}
          aria-expanded={expanded()}
          onClick={() => setExpanded((v) => !v)}
        />
        <div class="yohu-device-rail__heading">
          <span class="yohu-device-rail__title">设备</span>
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
      <YoCollapse open={expanded()}>
        <ul
          class="yohu-device-rail__list"
          role="listbox"
          aria-label="设备列表"
          aria-multiselectable={multi() || undefined}
        >
          <For each={deviceStore.state.devices}>
            {(device, index) => {
              const focused = () => deviceStore.state.focusSerial === device.serial;
              return (
                <li
                  class="yohu-device-rail__item yohu-interactive yohu-focus-ring"
                  classList={{
                    "yohu-interactive--selected": isSelected(device.serial),
                  }}
                  role="option"
                  aria-selected={isSelected(device.serial)}
                  tabIndex={focused() || (deviceStore.state.focusSerial === null && index() === 0) ? 0 : -1}
                  title={`${device.model ?? device.serial} · ${device.serial} · ${stateText(device.state)}`}
                  onClick={(event) => select(device.serial, event)}
                  onKeyDown={(event) => onItemKeyDown(device.serial, event)}
                >
                  <span
                    class="yohu-device-rail__dot"
                    classList={{
                      "yohu-device-rail__dot--online": device.state === "online",
                      "yohu-device-rail__dot--off": device.state !== "online",
                    }}
                    aria-hidden="true"
                  />
                  <span class="yohu-device-rail__info">
                    <span class="yohu-device-rail__model">{device.model ?? device.serial}</span>
                    <span class="yohu-device-rail__serial">{device.serial}</span>
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
          <div class="yohu-device-rail__empty">
            <div class="yohu-device-rail__empty-title">无设备</div>
            <Show when={deviceStore.state.lastError}>
              <div class="yohu-device-rail__empty-error" role="status" title={deviceStore.state.lastError}>
                {deviceStore.state.lastError}
              </div>
            </Show>
            <Show when={!deviceStore.state.lastError}>
              <div class="yohu-device-rail__empty-hint">
                请用 USB 连接设备并确认已授权（adb devices 可见）
              </div>
            </Show>
            <YoButton size="sm" variant="secondary" onClick={() => void deviceStore.refresh()}>
              重试扫描
            </YoButton>
          </div>
        </Show>
      </YoCollapse>
    </div>
  );
};
