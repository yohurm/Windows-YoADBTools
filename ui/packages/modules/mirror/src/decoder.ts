/**
 * WebCodecs H.264 解码到 canvas。core 只给编码包。
 *
 * WebView2 对 High@L5.1（原始 1220×2712）硬解经常 configure 成功却永不输出，
 * 默认 prefer-hardware（1024 档已验证）；硬解无帧则回退软件。
 */

import { YoLog, type MirrorPacket } from "@yohu/api";

import { prepareDescription, toLengthPrefixed } from "./h264";

type Accel = "prefer-hardware" | "prefer-software";

/** 30fps 每帧时长（µs）。 */
const FRAME_DURATION_US = 33_333;
/** 连续拒帧数达到该值仍未出画面，判定硬解失效回退软件（配合下方阈值）。 */
const FRAME_NO_OUTPUT_THRESHOLD = 12;

function decodeB64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function closeQuiet(decoder: VideoDecoder | null): void {
  if (!decoder) return;
  try {
    if (decoder.state !== "closed") decoder.close();
  } catch {
    /* InvalidStateError：已被 error 回调关掉 */
  }
}

export class H264CanvasDecoder {
  private decoder: VideoDecoder | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private description: Uint8Array | null = null;
  private codec = "avc1.42C01E";
  private generation = -1;
  private accel: Accel = "prefer-hardware";
  private lastWidth = 0;
  private lastHeight = 0;
  private nextTs = 0;
  private pending = 0;
  private frames = 0;
  private loggedFrame = false;
  private fallbackLogged = false;
  /** configure/flush 之后必须等关键帧，否则 WebCodecs 抛 DataError 刷屏。 */
  private needKeyframe = true;
  paused = false;
  lastError: string | null = null;
  /** 首帧绘制后回调（store 用来收起 YoLoading） */
  onPainted: (() => void) | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  reset(): void {
    closeQuiet(this.decoder);
    this.decoder = null;
    this.description = null;
    this.generation = -1;
    this.accel = "prefer-hardware";
    this.lastWidth = 0;
    this.lastHeight = 0;
    this.nextTs = 0;
    this.pending = 0;
    this.frames = 0;
    this.loggedFrame = false;
    this.fallbackLogged = false;
    this.needKeyframe = true;
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
    if (!this.decoder || this.decoder.state !== "configured") {
      if (!this.description && !packet.keyframe) return;
      this.reconfigure(packet.width, packet.height);
    }
    if (!this.decoder || this.decoder.state !== "configured") return;
    if (this.needKeyframe && !packet.keyframe) return;
    if (packet.keyframe) this.needKeyframe = false;
    try {
      this.decoder.decode(
        new EncodedVideoChunk({
          type: packet.keyframe ? "key" : "delta",
          timestamp: this.nextTs,
          data: toLengthPrefixed(data),
        }),
      );
      this.nextTs += FRAME_DURATION_US;
      this.pending += 1;
      if (this.frames === 0 && this.pending === FRAME_NO_OUTPUT_THRESHOLD) {
        this.fallbackOrWarn(packet.width, packet.height);
      }
    } catch (e) {
      this.lastError = String(e);
      YoLog.error("mirror", "decode 抛错", this.lastError);
      this.fallbackOrWarn(packet.width, packet.height);
    }
  }

  snapshotPng(): string | null {
    const canvas = this.canvas;
    if (!canvas || canvas.width < 1 || canvas.height < 1) return null;
    const url = canvas.toDataURL("image/png");
    const comma = url.indexOf(",");
    return comma >= 0 ? url.slice(comma + 1) : null;
  }

  private fallbackOrWarn(width: number, height: number): void {
    if (this.frames > 0) return;
    if (this.accel !== "prefer-software") {
      YoLog.warn("mirror", "硬解无输出，改软件解码", { codec: this.codec, width, height });
      this.accel = "prefer-software";
      this.pending = 0;
      this.reconfigure(width, height);
      return;
    }
    if (!this.fallbackLogged) {
      this.fallbackLogged = true;
      YoLog.error("mirror", "软件解码仍无输出", { codec: this.codec, width, height });
    }
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
    this.lastWidth = width;
    this.lastHeight = height;
    if (width > 0 && this.canvas.width !== width) this.canvas.width = width;
    if (height > 0 && this.canvas.height !== height) this.canvas.height = height;
    closeQuiet(this.decoder);
    this.needKeyframe = true;
    const canvas = this.canvas;
    const ctx = this.ctx;
    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.frames += 1;
        this.pending = 0;
        if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
        if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;
        ctx?.drawImage(frame, 0, 0);
        frame.close();
        if (!this.loggedFrame) {
          this.loggedFrame = true;
          YoLog.info("mirror", "首帧已绘制", {
            width: canvas.width,
            height: canvas.height,
            accel: this.accel,
            codec: this.codec,
          });
          this.onPainted?.();
        }
      },
      error: (e) => {
        this.lastError = e.message;
        YoLog.error("mirror", "VideoDecoder", { message: e.message, accel: this.accel });
        if (this.accel !== "prefer-software") {
          this.accel = "prefer-software";
          this.pending = 0;
          this.reconfigure(this.lastWidth, this.lastHeight);
        }
      },
    });
    const config: VideoDecoderConfig = {
      codec: this.codec,
      optimizeForLatency: true,
      hardwareAcceleration: this.accel,
    };
    if (this.description) {
      const copy = this.description;
      config.description = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
    } else if (width > 0 && height > 0) {
      config.codedWidth = width;
      config.codedHeight = height;
    }
    try {
      this.decoder.configure(config);
      YoLog.info("mirror", "VideoDecoder.configure 已调用", {
        codec: this.codec,
        width,
        height,
        accel: this.accel,
      });
    } catch (e) {
      this.lastError = String(e);
      YoLog.error("mirror", "VideoDecoder.configure 失败", { error: this.lastError, accel: this.accel });
      if (this.accel !== "prefer-software") {
        this.accel = "prefer-software";
        this.reconfigure(width, height);
      }
    }
  }
}
