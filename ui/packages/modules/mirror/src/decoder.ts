/**
 * WebCodecs H.264 解码到 canvas。core 只给编码包。
 */

import { YoLog, type MirrorPacket } from "@yohu/api";

import { prepareDescription, toLengthPrefixed } from "./h264";

function decodeB64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export class H264CanvasDecoder {
  private decoder: VideoDecoder | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private description: Uint8Array | null = null;
  private codec = "avc1.42C01E";
  private generation = -1;
  paused = false;
  lastError: string | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  reset(): void {
    this.decoder?.close();
    this.decoder = null;
    this.description = null;
    this.generation = -1;
    this.lastError = null;
  }

  feed(packet: MirrorPacket): void {
    if (this.paused) return;
    if (typeof VideoDecoder === "undefined") {
      this.lastError = "当前 WebView2 不支持 WebCodecs";
      YoLog.error("mirror", this.lastError);
      return;
    }
    if (packet.codec !== "h264") {
      this.lastError = `仅支持 H.264（收到 ${packet.codec}）`;
      YoLog.error("mirror", this.lastError);
      return;
    }
    const data = decodeB64(packet.data_b64);
    if (packet.generation !== this.generation) {
      this.reset();
      this.generation = packet.generation;
    }
    if (packet.config) {
      const prepared = prepareDescription(data);
      this.description = prepared.description;
      this.codec = prepared.codec;
      this.reconfigure(packet.width, packet.height);
      return;
    }
    if (!this.decoder) {
      this.reconfigure(packet.width, packet.height);
    }
    if (!this.decoder || this.decoder.state !== "configured") return;
    try {
      this.decoder.decode(
        new EncodedVideoChunk({
          type: packet.keyframe || packet.config ? "key" : "delta",
          timestamp: Number(packet.pts),
          data: toLengthPrefixed(data),
        }),
      );
    } catch (e) {
      this.lastError = String(e);
      YoLog.error("mirror", "decode 抛错", this.lastError);
    }
  }

  snapshotPng(): string | null {
    const canvas = this.canvas;
    if (!canvas || canvas.width < 1 || canvas.height < 1) return null;
    const url = canvas.toDataURL("image/png");
    const comma = url.indexOf(",");
    return comma >= 0 ? url.slice(comma + 1) : null;
  }

  private reconfigure(width: number, height: number): void {
    if (typeof VideoDecoder === "undefined") {
      this.lastError = "当前 WebView2 不支持 WebCodecs";
      YoLog.error("mirror", this.lastError);
      return;
    }
    if (!this.canvas) {
      this.lastError = "画布未挂载，无法配置解码器";
      YoLog.warn("mirror", this.lastError);
      return;
    }
    this.decoder?.close();
    const canvas = this.canvas;
    const ctx = this.ctx;
    this.decoder = new VideoDecoder({
      output: (frame) => {
        if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
        if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;
        ctx?.drawImage(frame, 0, 0);
        frame.close();
      },
      error: (e) => {
        this.lastError = e.message;
        YoLog.error("mirror", "VideoDecoder", e.message);
      },
    });
    const config: VideoDecoderConfig = {
      codec: this.codec,
      codedWidth: width || undefined,
      codedHeight: height || undefined,
      optimizeForLatency: true,
      hardwareAcceleration: "prefer-hardware",
    };
    if (this.description) {
      const copy = this.description;
      config.description = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
    }
    try {
      this.decoder.configure(config);
      YoLog.info("mirror", "VideoDecoder 已配置", { codec: this.codec, width, height });
    } catch (e) {
      this.lastError = String(e);
      YoLog.error("mirror", "VideoDecoder.configure 失败", this.lastError);
    }
  }
}
