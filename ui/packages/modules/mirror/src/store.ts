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

export interface MirrorUiState {
  serial: string | null;
  phase: MirrorPhase;
  generation: number;
  width: number;
  height: number;
  codec: string;
  control: boolean;
  error: string | null;
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

  function runExclusive(fn: () => Promise<void>): Promise<void> {
    const run = gate.then(fn, fn);
    gate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function bindDecoder(next: H264CanvasDecoder | null): void {
    decoder = next;
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
      paused: false,
      fullscreen: false,
    });
  }

  async function start(): Promise<void> {
    const serial = state.serial;
    if (!serial) return;
    await runExclusive(async () => {
      setState({ phase: "starting", error: null });
      packetCount = 0;
      YoLog.info("mirror", "开始", {
        serial,
        maxSize: state.maxSize,
        videoBitRate: state.videoBitRate,
        maxFps: state.maxFps,
        control: !state.readOnly,
        forceForward: state.forceForward,
      });
      try {
        const result = await mirrorStart({
          serial,
          max_size: state.maxSize,
          video_bit_rate: state.videoBitRate,
          max_fps: state.maxFps,
          control: !state.readOnly,
          force_forward: state.forceForward,
        });
        setState({ generation: result.generation });
        YoLog.info("mirror", "start 返回", result);
        if (result.adopted) {
          const status = await mirrorStatus(serial);
          setState({
            phase: "live",
            width: status.width,
            height: status.height,
            codec: status.codec,
            control: status.control,
            generation: status.generation || result.generation,
          });
        } else void waitUntilLive(serial, result.generation);
      } catch (e) {
        const error =
          e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : String(e);
        YoLog.error("mirror", "start 失败", error);
        setState({
          phase: "failed",
          error,
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
      setState({ phase: "idle", error: null, paused: false, fullscreen: false });
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

  let packetCount = 0;

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
      YoLog.error("mirror", "等待 Live 超时（事件可能未送达）");
    }
  }

  function onPacket(packet: MirrorPacket): void {
    if (packet.serial !== state.serial) {
      if (packetCount === 0) {
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

  void onMirrorState((e) => {
    YoLog.info("mirror", "状态", {
      serial: e.serial,
      uiSerial: state.serial,
      state: e.state,
      generation: e.generation,
      width: e.width,
      height: e.height,
      codec: e.codec,
      error: e.error,
    });
    if (e.serial !== state.serial) return;
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
      setState({ paused: false, fullscreen: false });
    }
  });
  void onMirrorPacket((e) => onPacket(e));
  void onDeviceOffline((e) => {
    if (e.serial !== state.serial) return;
    decoder?.reset();
    setState({
      phase: "idle",
      error: "设备已掉线",
      paused: false,
      fullscreen: false,
      control: false,
    });
  });
  void onSettingsChanged((e) => {
    if (
      e.key === "mirror_max_size" ||
      e.key === "mirror_video_bit_rate" ||
      e.key === "mirror_max_fps" ||
      e.key === "mirror_force_forward"
    ) {
      applySettings(e.settings);
    }
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
