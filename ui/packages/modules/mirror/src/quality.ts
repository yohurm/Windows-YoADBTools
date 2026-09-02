/** 投屏协议与封顶（与 yohu-domain::mirror 对齐）。 */

import type { MirrorProtocol } from "@yohu/api";

export const EMBED_LONG_EDGE_CAP = 1920;

export interface MirrorEncodeParams {
  maxSize: number;
  videoBitRate: number;
  maxFps: number;
}

export const USB_ENCODE: MirrorEncodeParams = {
  maxSize: 1920,
  videoBitRate: 8_000_000,
  maxFps: 0,
};

export const WIFI_ENCODE: MirrorEncodeParams = {
  maxSize: 1024,
  videoBitRate: 2_000_000,
  maxFps: 30,
};

export function encoderLimits(
  maxSize: number,
  maxFps: number,
): { maxSize: number; maxFps: number; capped: boolean } {
  const size = maxSize === 0 ? EMBED_LONG_EDGE_CAP : maxSize;
  return { maxSize: size, maxFps, capped: size !== maxSize };
}

export function paramsOf(protocol: MirrorProtocol): MirrorEncodeParams {
  return protocol === "wifi" ? WIFI_ENCODE : USB_ENCODE;
}

export function isTcpConnection(connection: string): boolean {
  return connection.startsWith("tcp:");
}

export function startEncode(
  settings: {
    mirror_max_size: number;
    mirror_video_bit_rate: number;
    mirror_max_fps: number;
    mirror_protocol: MirrorProtocol;
  },
  connection: string,
  sessionQualityTouched: boolean,
): MirrorEncodeParams {
  if (isTcpConnection(connection) && !sessionQualityTouched && settings.mirror_protocol !== "wifi") {
    return WIFI_ENCODE;
  }
  return {
    maxSize: settings.mirror_max_size,
    videoBitRate: settings.mirror_video_bit_rate,
    maxFps: settings.mirror_max_fps,
  };
}

export function startForceForward(forceForward: boolean, connection: string): boolean {
  return forceForward || isTcpConnection(connection);
}
