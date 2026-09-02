/**
 * WebCodecs H.264 → display×DPR canvas（WebGL2，失败则 2D）。
 * 时间戳用包内 PTS；出帧立即绘制，不跟 rAF 绑死。
 */

import { YoLog } from "@yohu/api";

import { DEFAULT_CODEC, prepareDescription, toLengthPrefixed } from "./h264";
import { isDownscale, nearestNeighborScale, syncBackingStore } from "./paint";
import type { MirrorFrame } from "./packet";

type Accel = "prefer-hardware" | "prefer-software";

const FRAME_NO_OUTPUT_THRESHOLD = 12;

const VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FS_LINEAR = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() { o = texture(u_tex, v_uv); }`;

const FS_BICUBIC = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
in vec2 v_uv;
out vec4 o;
float w0(float a) { return (1.0/6.0)*(a*(a*(-a + 3.0) - 3.0) + 1.0); }
float w1(float a) { return (1.0/6.0)*(a*a*(3.0*a - 6.0) + 4.0); }
float w2(float a) { return (1.0/6.0)*(a*(a*(-3.0*a + 3.0) + 3.0) + 1.0); }
float w3(float a) { return (1.0/6.0)*(a*a*a); }
vec4 cubic(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 coord = uv / texel - 0.5;
  vec2 f = fract(coord);
  vec2 base = (floor(coord) + 0.5) * texel;
  vec4 c0 = texture(tex, base + vec2(-1.0, -1.0) * texel);
  vec4 c1 = texture(tex, base + vec2( 0.0, -1.0) * texel);
  vec4 c2 = texture(tex, base + vec2( 1.0, -1.0) * texel);
  vec4 c3 = texture(tex, base + vec2( 2.0, -1.0) * texel);
  vec4 c4 = texture(tex, base + vec2(-1.0,  0.0) * texel);
  vec4 c5 = texture(tex, base + vec2( 0.0,  0.0) * texel);
  vec4 c6 = texture(tex, base + vec2( 1.0,  0.0) * texel);
  vec4 c7 = texture(tex, base + vec2( 2.0,  0.0) * texel);
  vec4 c8 = texture(tex, base + vec2(-1.0,  1.0) * texel);
  vec4 c9 = texture(tex, base + vec2( 0.0,  1.0) * texel);
  vec4 ca = texture(tex, base + vec2( 1.0,  1.0) * texel);
  vec4 cb = texture(tex, base + vec2( 2.0,  1.0) * texel);
  vec4 cc = texture(tex, base + vec2(-1.0,  2.0) * texel);
  vec4 cd = texture(tex, base + vec2( 0.0,  2.0) * texel);
  vec4 ce = texture(tex, base + vec2( 1.0,  2.0) * texel);
  vec4 cf = texture(tex, base + vec2( 2.0,  2.0) * texel);
  vec4 r0 = c0*w0(f.x) + c1*w1(f.x) + c2*w2(f.x) + c3*w3(f.x);
  vec4 r1 = c4*w0(f.x) + c5*w1(f.x) + c6*w2(f.x) + c7*w3(f.x);
  vec4 r2 = c8*w0(f.x) + c9*w1(f.x) + ca*w2(f.x) + cb*w3(f.x);
  vec4 r3 = cc*w0(f.x) + cd*w1(f.x) + ce*w2(f.x) + cf*w3(f.x);
  return r0*w0(f.y) + r1*w1(f.y) + r2*w2(f.y) + r3*w3(f.y);
}
void main() { o = cubic(u_tex, v_uv, u_texel); }`;

function closeQuiet(decoder: VideoDecoder | null): void {
  if (!decoder) return;
  try {
    if (decoder.state !== "closed") decoder.close();
  } catch {
    /* InvalidStateError */
  }
}

function closeFrame(frame: VideoFrame | null): void {
  if (!frame) return;
  try {
    frame.close();
  } catch {
    /* already closed */
  }
}

class GlPainter {
  private gl: WebGL2RenderingContext | null = null;
  private tex: WebGLTexture | null = null;
  private linear: WebGLProgram | null = null;
  private bicubic: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  attach(canvas: HTMLCanvasElement): boolean {
    this.lose();
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: true,
    });
    if (!gl) return false;
    const linear = compile(gl, VS, FS_LINEAR);
    const bicubic = compile(gl, VS, FS_BICUBIC);
    if (!linear) {
      return false;
    }
    const buf = gl.createBuffer();
    const vao = gl.createVertexArray();
    const tex = gl.createTexture();
    if (!buf || !vao || !tex) return false;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.gl = gl;
    this.tex = tex;
    this.linear = linear;
    this.bicubic = bicubic;
    this.vao = vao;
    return true;
  }

  lose(): void {
    this.gl = null;
    this.tex = null;
    this.linear = null;
    this.bicubic = null;
    this.vao = null;
  }

  draw(frame: VideoFrame, canvas: HTMLCanvasElement): boolean {
    const gl = this.gl;
    const tex = this.tex;
    const vao = this.vao;
    if (!gl || !tex || !vao) return false;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const videoW = frame.displayWidth;
    const videoH = frame.displayHeight;
    const nearest = nearestNeighborScale(cssW, cssH, videoW, videoH);
    const down = isDownscale(cssW, cssH, videoW, videoH);
    const prog = down && this.bicubic ? this.bicubic : this.linear;
    if (!prog) return false;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const filter = nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame as unknown as TexImageSource);
    const texel = gl.getUniformLocation(prog, "u_texel");
    if (texel) gl.uniform2f(texel, 1 / Math.max(1, videoW), 1 / Math.max(1, videoH));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
}

function compile(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return null;
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  return prog;
}

export class H264CanvasDecoder {
  private decoder: VideoDecoder | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private gl: GlPainter | null = null;
  private description: Uint8Array | null = null;
  private codec = DEFAULT_CODEC;
  private generation = -1;
  private accel: Accel = "prefer-hardware";
  private lastWidth = 0;
  private lastHeight = 0;
  private pending = 0;
  private frames = 0;
  private loggedFrame = false;
  private fallbackLogged = false;
  private needKeyframe = true;
  private configureSeq = 0;
  private lastFrame: VideoFrame | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private dprMedia: MediaQueryList | null = null;
  private dprHandler: (() => void) | null = null;
  paused = false;
  lastError: string | null = null;
  onPainted: (() => void) | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.detachObservers();
    this.canvas = canvas;
    this.gl = new GlPainter();
    if (!this.gl.attach(canvas)) {
      this.gl = null;
      this.ctx2d = canvas.getContext("2d", { alpha: false });
    } else {
      this.ctx2d = null;
    }
    this.resizeObserver = new ResizeObserver(() => this.repaint());
    this.resizeObserver.observe(canvas);
    this.bindDpr();
    this.syncSize();
  }

  reset(): void {
    closeQuiet(this.decoder);
    this.decoder = null;
    this.description = null;
    this.generation = -1;
    this.accel = "prefer-hardware";
    this.lastWidth = 0;
    this.lastHeight = 0;
    this.pending = 0;
    this.frames = 0;
    this.loggedFrame = false;
    this.fallbackLogged = false;
    this.needKeyframe = true;
    this.lastError = null;
    this.configureSeq += 1;
    closeFrame(this.lastFrame);
    this.lastFrame = null;
  }

  dispose(): void {
    this.reset();
    this.detachObservers();
    this.gl?.lose();
    this.gl = null;
    this.ctx2d = null;
    this.canvas = null;
  }

  feed(packet: MirrorFrame): void {
    if (this.paused) return;
    if (typeof VideoDecoder === "undefined") {
      this.lastError = "当前 WebView2 不支持 WebCodecs";
      YoLog.error("mirror", this.lastError);
      return;
    }
    if (packet.codec !== 0) {
      this.lastError = `仅支持 H.264（收到 codec=${packet.codec}）`;
      YoLog.error("mirror", this.lastError);
      return;
    }
    if (packet.generation !== this.generation) {
      const gen = packet.generation;
      this.reset();
      this.generation = gen;
    }
    if (packet.config) {
      const prepared = prepareDescription(packet.payload);
      this.description = prepared.description;
      this.codec = prepared.codec;
      void this.reconfigure(packet.width, packet.height);
      return;
    }
    if (!this.decoder || this.decoder.state !== "configured") {
      if (!this.description && !packet.keyframe) return;
      void this.reconfigure(packet.width, packet.height);
    }
    if (!this.decoder || this.decoder.state !== "configured") return;
    if (this.needKeyframe && !packet.keyframe) return;
    if (packet.keyframe) this.needKeyframe = false;
    try {
      this.decoder.decode(
        new EncodedVideoChunk({
          type: packet.keyframe ? "key" : "delta",
          timestamp: packet.pts,
          data: toLengthPrefixed(packet.payload),
        }),
      );
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
    const frame = this.lastFrame;
    if (!frame) return null;
    const off = document.createElement("canvas");
    off.width = frame.displayWidth;
    off.height = frame.displayHeight;
    const ctx = off.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(frame, 0, 0);
    const url = off.toDataURL("image/png");
    const comma = url.indexOf(",");
    return comma >= 0 ? url.slice(comma + 1) : null;
  }

  private bindDpr(): void {
    if (typeof window.matchMedia !== "function") return;
    if (this.dprMedia && this.dprHandler) {
      this.dprMedia.removeEventListener("change", this.dprHandler);
    }
    const dpr = window.devicePixelRatio || 1;
    this.dprMedia = window.matchMedia(`(resolution: ${dpr}dppx)`);
    this.dprHandler = () => {
      this.bindDpr();
      this.repaint();
    };
    this.dprMedia.addEventListener("change", this.dprHandler);
  }

  private detachObservers(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.dprMedia && this.dprHandler) {
      this.dprMedia.removeEventListener("change", this.dprHandler);
    }
    this.dprMedia = null;
    this.dprHandler = null;
  }

  private syncSize(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    syncBackingStore(canvas, dpr);
  }

  private repaint(): void {
    this.syncSize();
    if (this.lastFrame) this.paint(this.lastFrame);
  }

  private paint(frame: VideoFrame): void {
    const canvas = this.canvas;
    if (!canvas) return;
    this.syncSize();
    if (this.gl?.draw(frame, canvas)) return;
    const ctx = this.ctx2d ?? canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    this.ctx2d = ctx;
    const nearest = nearestNeighborScale(
      canvas.clientWidth,
      canvas.clientHeight,
      frame.displayWidth,
      frame.displayHeight,
    );
    ctx.imageSmoothingEnabled = !nearest;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  }

  private fallbackOrWarn(width: number, height: number): void {
    if (this.frames > 0) return;
    if (this.accel !== "prefer-software") {
      YoLog.warn("mirror", "硬解无输出，改软件解码", { codec: this.codec, width, height });
      this.accel = "prefer-software";
      this.pending = 0;
      void this.reconfigure(width, height);
      return;
    }
    if (!this.fallbackLogged) {
      this.fallbackLogged = true;
      YoLog.error("mirror", "软件解码仍无输出", { codec: this.codec, width, height });
    }
  }

  private async reconfigure(width: number, height: number): Promise<void> {
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
    const seq = ++this.configureSeq;
    this.lastWidth = width;
    this.lastHeight = height;
    this.syncSize();
    closeQuiet(this.decoder);
    this.needKeyframe = true;
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
      const support = await VideoDecoder.isConfigSupported(config);
      if (seq !== this.configureSeq) return;
      if (!support.supported && this.accel !== "prefer-software") {
        this.accel = "prefer-software";
        config.hardwareAcceleration = this.accel;
      }
    } catch {
      /* configure 仍会尝试 */
    }
    if (seq !== this.configureSeq) return;
    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.frames += 1;
        this.pending = 0;
        closeFrame(this.lastFrame);
        this.lastFrame = frame;
        this.paint(frame);
        this.onPainted?.();
        if (!this.loggedFrame) {
          this.loggedFrame = true;
          YoLog.info("mirror", "首帧已绘制", {
            width: frame.displayWidth,
            height: frame.displayHeight,
            accel: this.accel,
            codec: this.codec,
          });
        }
      },
      error: (e) => {
        this.lastError = e.message;
        YoLog.error("mirror", "VideoDecoder", { message: e.message, accel: this.accel });
        if (this.accel !== "prefer-software") {
          this.accel = "prefer-software";
          this.pending = 0;
          void this.reconfigure(this.lastWidth, this.lastHeight);
        }
      },
    });
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
        void this.reconfigure(width, height);
      }
    }
  }
}
