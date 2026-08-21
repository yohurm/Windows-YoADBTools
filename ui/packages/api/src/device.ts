/**
 * 设备展示名与选中切片（与 yohu-domain `device_display_name` / `lookup_selected_devices` 对齐）。
 * 页眉 / 设备栏 / 选择器禁止再写 `model ?? serial`。
 */

import type { DeviceInfo } from "./types";

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

/** 页眉文案：无选中 → null；一台 → 设备名；多台 →「首台名 等 n 台」。 */
export function selectedDeviceLabel(devices: readonly DeviceInfo[]): string | null {
  if (devices.length === 0) return null;
  const name = deviceDisplayName(devices[0]!);
  return devices.length === 1 ? name : `${name} 等 ${devices.length} 台`;
}
