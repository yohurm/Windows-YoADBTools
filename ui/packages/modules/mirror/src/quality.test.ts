import { describe, expect, it } from "vitest";

import { encoderLimits, paramsOf, startEncode, startForceForward, USB_ENCODE, WIFI_ENCODE } from "./quality";

describe("mirror protocol", () => {
  it("原始长边封顶 1920，不限帧保持 0", () => {
    expect(encoderLimits(0, 0)).toEqual({ maxSize: 1920, maxFps: 0, capped: true });
    expect(encoderLimits(1920, 0)).toEqual({ maxSize: 1920, maxFps: 0, capped: false });
    expect(encoderLimits(1024, 0)).toEqual({ maxSize: 1024, maxFps: 0, capped: false });
  });

  it("协议对应固定编码参数", () => {
    expect(paramsOf("usb")).toEqual(USB_ENCODE);
    expect(paramsOf("wifi")).toEqual(WIFI_ENCODE);
  });

  it("tcp 未改质量时用无线协议参数", () => {
    const settings = {
      mirror_max_size: USB_ENCODE.maxSize,
      mirror_video_bit_rate: USB_ENCODE.videoBitRate,
      mirror_max_fps: USB_ENCODE.maxFps,
      mirror_protocol: "usb" as const,
    };
    expect(startEncode(settings, "usb", false)).toEqual(USB_ENCODE);
    expect(startEncode(settings, "tcp:192.168.1.8:5555", false)).toEqual(WIFI_ENCODE);
    expect(startEncode(settings, "tcp:1.1.1.1:5555", true)).toEqual(USB_ENCODE);
    expect(startForceForward(false, "tcp:1.1.1.1:5555")).toBe(true);
    expect(startForceForward(false, "usb")).toBe(false);
  });
});
