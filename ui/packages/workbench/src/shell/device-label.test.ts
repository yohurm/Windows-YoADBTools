/**
 * selectedDeviceLabel 单元测试（页面/壳层的页眉文案格式化）。
 * 该展示层逻辑从 @yohu/api 下放到壳层（见 device-label.ts）。
 */

import { describe, expect, it } from "vitest";
import type { DeviceInfo } from "@yohu/api";

import { selectedDeviceLabel } from "./device-label";

describe("selectedDeviceLabel", () => {
  const moto = { serial: "A1", model: "Moto X", state: "online" as const, connection: "usb" };
  const pixel = { serial: "B2", model: "Pixel 8", state: "online" as const, connection: "usb" };

  it("无选中为 null", () => {
    expect(selectedDeviceLabel([] as DeviceInfo[])).toBeNull();
  });

  it("一台用设备名", () => {
    expect(selectedDeviceLabel([moto])).toBe("Moto X");
  });

  it("多台用首台名加台数", () => {
    expect(selectedDeviceLabel([moto, pixel])).toBe("Moto X 等 2 台");
  });
});
