/**
 * 投屏模块状态：每设备一路；控制面走 mirror/state，画面走 mirror/packet。
 */

import { createStore } from "solid-js/store";
import {
  APP_SETTINGS_DEFAULT,
  mirrorCloseControl,
  mirrorInject,
  mirrorStart,
  mirrorStatus,
  mirrorStop,
  onDeviceOffline,
  onMirrorPacket,
  onMirrorState,
  onSettingsChanged,
  settingsSet,
  type MirrorControlMessage,
  type MirrorPacket,
  type MirrorSessionState,
  YoLog,
} from "@yohu/api";

import type { H264CanvasDecoder } from "./decoder";

export type MirrorPhase = "idle" | "starting" | "live" | "failed";

/** WebView2 JSON-base64 + WebCodecs 撑不住手机原分辨率无限帧。1024 在本机已验证能持续出画。 */
export const EMBED_LONG_EDGE_CAP = 1024;
export const EMBED_FPS_WHEN_UNCAPPED = 30;

/** 把 UI 质量选项收成编码器实际参数（原始/不限在内嵌路径会封顶）。 */
export function encoderLimits(
  maxSize: number,
  maxFps: number,
): { maxSize: number; maxFps: number; capped: boolean } {
  const size = maxSize === 0 ? EMBED_LONG_EDGE_CAP : maxSize;
  const fps = maxSize === 0 && maxFps === 0 ? EMBED_FPS_WHEN_UNCAPPED : maxFps;
  return { maxSize: size, maxFps: fps, capped: size !== maxSize || fps !== maxFps };
}

export interface MirrorUiState {
  serial: string | null;
  phase: MirrorPhase;
  generation: number;
  width: number;
  height: number;
  codec: string;
  control: boolean;
  error: string | null;
  /** 解码器已画出至少一帧（Live 不等于已出画） */
  hasFrame: boolean;
  paused: boolean;
  fullscreen: boolean;
  readOnly: boolean;
  maxSize: number;
  videoBitRate: number;
  maxFps: number;
  forceForward: boolean;
}

function phaseOf(state: MirrorSessionState): MirrorPhase {
  if (state === "starting") return "starting";
  if (state === "live") return "live";
  if (state === "failed") return "failed";
  return "idle";
}

export function createMirrorStore() {
  const [state, setState] = createStore<MirrorUiState>({
    serial: null,
    phase: "idle",
    generation: 0,
    width: 0,
    height: 0,
    codec: "",
    control: false,
    error: null,
    hasFrame: false,
    paused: false,
    fullscreen: false,
    readOnly: true,
    maxSize: APP_SETTINGS_DEFAULT.mirror_max_size,
    videoBitRate: APP_SETTINGS_DEFAULT.mirror_video_bit_rate,
    maxFps: APP_SETTINGS_DEFAULT.mirror_max_fps,
    forceForward: APP_SETTINGS_DEFAULT.mirror_force_forward,
  });

  let decoder: H264CanvasDecoder | null = null;
  let gate: Promise<void> = Promise.resolve();
  let packetCount = 0;
  let mismatchLogged = false;
  const unlistens: Promise<() => void>[] = [];

  function runExclusive(fn: () => Promise<void>): Promise<void> {
    const run = gate.then(fn, fn);
    gate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function bindDecoder(next: H264CanvasDecoder | null): void {
    if (decoder) decoder.onPainted = null;
    decoder = next;
    if (decoder) {
      decoder.onPainted = () => setState("hasFrame", true);
    }
  }

  function applySettings(settings: {
    mirror_max_size: number;
    mirror_video_bit_rate: number;
    mirror_max_fps: number;
    mirror_force_forward: boolean;
  }): void {
    setState({
      maxSize: settings.mirror_max_size,
      videoBitRate: settings.mirror_video_bit_rate,
      maxFps: settings.mirror_max_fps,
      forceForward: settings.mirror_force_forward,
    });
  }

  async function bindSerial(next: string | null): Promise<void> {
    const prev = state.serial;
    if (prev === next) return;
    if (
      next === null &&
      prev &&
      (state.phase === "live" || state.phase === "starting")
    ) {
      YoLog.warn("mirror", "忽略空 serial 绑定（会话进行中）", { serial: prev, phase: state.phase });
      return;
    }
    if (prev && (state.phase === "live" || state.phase === "starting")) {
      await runExclusive(async () => {
        await mirrorStop(prev);
      });
    }
    decoder?.reset();
    setState({
      serial: next,
      phase: "idle",
      generation: 0,
      width: 0,
      height: 0,
      codec: "",
      control: false,
      error: null,
      hasFrame: false,
      paused: false,
      fullscreen: false,
    });
  }

  async function start(): Promise<void> {
    const serial = state.serial;
    if (!serial) return;
    await runExclusive(async () => {
      decoder?.reset();
      setState({ phase: "starting", error: null, hasFrame: false });
      packetCount = 0;
      mismatchLogged = false;
      const limits = encoderLimits(state.maxSize, state.maxFps);
      YoLog.info("mirror", "开始", {
        serial,
        maxSize: state.maxSize,
        videoBitRate: state.videoBitRate,
        maxFps: state.maxFps,
        encoderMaxSize: limits.maxSize,
        encoderMaxFps: limits.maxFps,
        control: !state.readOnly,
        forceForward: state.forceForward,
      });
      if (limits.capped) {
        YoLog.info("mirror", "原始/不限对内嵌解码过重，编码器已封顶", {
          requested: { maxSize: state.maxSize, maxFps: state.maxFps },
          encoder: { maxSize: limits.maxSize, maxFps: limits.maxFps },
        });
      }
      try {
        const request = {
          serial,
          max_size: limits.maxSize,
          video_bit_rate: state.videoBitRate,
          max_fps: limits.maxFps,
          control: !state.readOnly,
          force_forward: state.forceForward,
        };
        let result = await mirrorStart(request);
        if (result.adopted) {
          // start() 已 reset 解码器；Live 流的 SPS/IDR 不会重发，adopt 只会吃到 P 帧。
          YoLog.info("mirror", "adopt 后解码器无配置，重启会话", {
            serial,
            generation: result.generation,
          });
          await mirrorStop(serial);
          decoder?.reset();
          result = await mirrorStart(request);
        }
        setState({ generation: result.generation });
        YoLog.info("mirror", "start 返回", result);
        void waitUntilLive(serial, result.generation);
      } catch (e) {
        const error =
          e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : String(e);
        YoLog.error("mirror", "start 失败", error);
        setState({
          phase: "failed",
          error,
          hasFrame: false,
        });
      }
    });
  }

  async function stop(): Promise<void> {
    const serial = state.serial;
    if (!serial) return;
    await runExclusive(async () => {
      YoLog.info("mirror", "停止", serial);
      await mirrorStop(serial);
      decoder?.reset();
      setState({ phase: "idle", error: null, hasFrame: false, paused: false, fullscreen: false });
    });
  }

  async function inject(message: MirrorControlMessage): Promise<void> {
    const serial = state.serial;
    if (!serial || state.phase !== "live" || state.readOnly) return;
    await mirrorInject({ serial, message });
  }

  async function setReadOnly(next: boolean): Promise<void> {
    setState("readOnly", next);
    if (state.phase !== "live" && state.phase !== "starting") return;
    const serial = state.serial;
    if (!serial) return;
    if (next) {
      try {
        await mirrorCloseControl(serial);
        setState("control", false);
      } catch {
        await stop();
        setState("readOnly", true);
        await start();
      }
      return;
    }
    await stop();
    setState("readOnly", false);
    await start();
  }

  async function persistQuality(
    key: "mirror_max_size" | "mirror_video_bit_rate" | "mirror_max_fps" | "mirror_force_forward",
    value: number | boolean,
  ): Promise<void> {
    try {
      const updated = await settingsSet(key, value);
      applySettings(updated);
    } catch (e) {
      YoLog.error("mirror", "质量写入失败", { key, error: String(e) });
    }
  }

  async function waitUntilLive(serial: string, generation: number): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (state.serial !== serial) return;
      if (state.phase === "live" || state.phase === "failed" || state.phase === "idle") return;
      try {
        const status = await mirrorStatus(serial);
        if (status.generation === generation && status.width > 0) {
          YoLog.info("mirror", "status 轮询到 Live", status);
          setState({
            phase: "live",
            width: status.width,
            height: status.height,
            codec: status.codec,
            control: status.control,
            generation: status.generation,
          });
          return;
        }
        if (status.error) {
          YoLog.error("mirror", "status 轮询到失败", status.error);
          setState({ phase: "failed", error: status.error });
          return;
        }
      } catch (e) {
        YoLog.warn("mirror", "status 轮询失败", String(e));
      }
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    }
    if (state.phase === "starting" && state.serial === serial) {
      YoLog.error("mirror", "等待 Live 超时，停止卡住会话");
      try {
        await mirrorStop(serial);
      } catch (e) {
        YoLog.warn("mirror", "超时停止失败", String(e));
      }
      decoder?.reset();
      setState({
        phase: "failed",
        error: "投屏启动超时",
        hasFrame: false,
      });
    }
  }

  function onPacket(packet: MirrorPacket): void {
    if (packet.serial !== state.serial) {
      if (!state.serial) return;
      if (!mismatchLogged) {
        mismatchLogged = true;
        YoLog.warn("mirror", "丢弃包：serial 不符", { packet: packet.serial, ui: state.serial });
      }
      return;
    }
    if (packet.generation !== state.generation && state.generation !== 0) return;
    packetCount += 1;
    if (packetCount === 1 || packet.config || packet.keyframe && packetCount <= 3) {
      YoLog.info("mirror", "收到编码包", {
        n: packetCount,
        config: packet.config,
        keyframe: packet.keyframe,
        width: packet.width,
        height: packet.height,
        codec: packet.codec,
        bytes: packet.data_b64.length,
      });
    }
    if (packet.width && packet.height) {
      setState({ width: packet.width, height: packet.height, codec: packet.codec });
    }
    decoder?.feed(packet);
  }

  unlistens.push(
    onMirrorState((e) => {
      if (e.serial !== state.serial) return;
      YoLog.info("mirror", "状态", {
        serial: e.serial,
        state: e.state,
        generation: e.generation,
        width: e.width,
        height: e.height,
        codec: e.codec,
        error: e.error,
      });
      setState({
        generation: e.generation,
        phase: phaseOf(e.state),
        width: e.width,
        height: e.height,
        codec: e.codec,
        control: e.control,
        error: e.error ?? null,
      });
      if (e.state === "stopped") {
        decoder?.reset();
        setState({ paused: false, fullscreen: false, hasFrame: false });
      }
    }),
  );
  unlistens.push(onMirrorPacket((e) => onPacket(e)));
  unlistens.push(
    onDeviceOffline((e) => {
      if (e.serial !== state.serial) return;
      decoder?.reset();
      setState({
        phase: "idle",
        error: "设备已掉线",
        hasFrame: false,
        paused: false,
        fullscreen: false,
        control: false,
      });
    }),
  );
  unlistens.push(
    onSettingsChanged((e) => {
      if (
        e.key === "mirror_max_size" ||
        e.key === "mirror_video_bit_rate" ||
        e.key === "mirror_max_fps" ||
        e.key === "mirror_force_forward"
      ) {
        applySettings(e.settings);
      }
    }),
  );

  const hot = (import.meta as { hot?: { dispose: (cb: () => void) => void } }).hot;
  hot?.dispose(() => {
    for (const p of unlistens) void p.then((unlisten) => unlisten());
  });

  return {
    state,
    bindDecoder,
    bindSerial,
    applySettings,
    start,
    stop,
    inject,
    setReadOnly,
    persistQuality,
    setPaused: (paused: boolean) => {
      setState("paused", paused);
      if (decoder) decoder.paused = paused;
    },
    setFullscreen: (fullscreen: boolean) => setState("fullscreen", fullscreen),
  };
}

export const mirrorStore = createMirrorStore();
export type MirrorStoreApi = ReturnType<typeof createMirrorStore>;
