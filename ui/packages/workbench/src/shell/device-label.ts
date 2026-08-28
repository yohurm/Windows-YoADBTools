/**
 * 设备选中聚合的页眉文案（@yohu/workbench 专用）。
 * 展示层字符串格式化（「首台名 等 n 台」）属于壳/页面层，不属于消费无关的
 * 契约门面（@yohu/api），故从 device.ts 下放到此处。
 * 单台设备名复用 `@yohu/api` 的 `deviceDisplayName`（与 domain 对齐的契约）。
 */

import { deviceDisplayName, type DeviceInfo } from "@yohu/api";

/** 页眉文案：无选中 → null；一台 → 设备名；多台 →「首台名 等 n 台」。 */
export function selectedDeviceLabel(devices: readonly DeviceInfo[]): string | null {
  if (devices.length === 0) return null;
  const name = deviceDisplayName(devices[0]!);
  return devices.length === 1 ? name : `${name} 等 ${devices.length} 台`;
}
