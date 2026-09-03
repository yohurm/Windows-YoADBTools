/**
 * 设备展示名与选中切片（与 yohu-domain `device_display_name` / `lookup_selected_devices` 对齐）。
 * 页眉 / 设备栏 / 选择器禁止再写 `model ?? serial`。
 */

import type { DeviceInfo, DeviceStatus } from "./types";

/** 人读设备名：型号去空白后非空则用之，否则 serial。 */
export function deviceDisplayName(device: Pick<DeviceInfo, "serial" | "model">): string {
  const name = device.model?.trim();
  return name ? name : device.serial;
}

/** 按 serials 顺序从目录取出设备（缺条跳过，保序）。 */
export function lookupSelectedDevices(
  serials: readonly string[],
  catalog: readonly DeviceInfo[],
): DeviceInfo[] {
  const out: DeviceInfo[] = [];
  for (const serial of serials) {
    const device = catalog.find((d) => d.serial === serial);
    if (device) out.push(device);
  }
  return out;
}

/** 设备栏次行：Android 版本与电量。无数据时为空串。 */
export function formatDeviceStatusMeta(status: DeviceStatus | undefined): string {
  if (!status) return "";
  const parts: string[] = [];
  const release = status.release?.trim();
  if (release) parts.push(`Android ${release}`);
  else if (status.sdk != null) parts.push(`API ${status.sdk}`);
  if (status.battery_pct != null) {
    parts.push(status.charging ? `${status.battery_pct}% 充电` : `${status.battery_pct}%`);
  }
  return parts.join(" · ");
}

/** 设备卡片 title 附加：次行 + 深浅色/亮屏/品牌。 */
export function formatDeviceStatusHint(status: DeviceStatus | undefined): string {
  if (!status) return "";
  const parts: string[] = [];
  const meta = formatDeviceStatusMeta(status);
  if (meta) parts.push(meta);
  if (status.night === true) parts.push("深色");
  else if (status.night === false) parts.push("浅色");
  if (status.screen_on === false) parts.push("息屏");
  else if (status.screen_on === true) parts.push("亮屏");
  const brand = status.brand?.trim();
  if (brand) parts.push(brand);
  return parts.join(" · ");
}

