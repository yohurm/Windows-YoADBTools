import { describe, expect, it } from "vitest";

import * as commands from "./commands";
import { deviceSetNightMode, deviceStatus, mirrorLayout, mirrorScreenshot, mirrorStart } from "./commands";

describe("mirror commands", () => {
  it("导出 layout / screenshot / start（无 Channel、无 status）", () => {
    expect(typeof mirrorStart).toBe("function");
    expect(typeof mirrorLayout).toBe("function");
    expect(typeof mirrorScreenshot).toBe("function");
    expect(mirrorStart.length).toBe(1);
    expect("mirrorStatus" in commands).toBe(false);
  });
});

describe("device status", () => {
  it("导出运行时快照与写深浅色（无 device.nightMode 轮询命令）", () => {
    expect(typeof deviceStatus).toBe("function");
    expect(typeof deviceSetNightMode).toBe("function");
    expect(deviceSetNightMode.length).toBe(2);
    expect("deviceNightMode" in commands).toBe(false);
  });
});

describe("removed dual-source commands", () => {
  it("不导出 settings.get / mirror.status / device.nightMode", () => {
    expect("settingsGet" in commands).toBe(false);
    expect("mirrorStatus" in commands).toBe(false);
    expect("deviceNightMode" in commands).toBe(false);
  });
});
