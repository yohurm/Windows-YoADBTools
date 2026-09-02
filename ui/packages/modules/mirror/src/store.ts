/**
 * 投屏模块状态：控制面走 mirror/state，画面走 mirror.start 的二进制 Channel。
 */

import { createStore } from "solid-js/store";
import {
  APP_SETTINGS_DEFAULT,
  createMirrorFrameChannel,
  dialogSaveFile,
  errorText,
  mirrorCloseControl,
  mirrorInject,
  mirrorSavePng,
  mirrorStart,
  mirrorStatus,
  mirrorStop,
  onDeviceOffline,
  onMirrorState,
  onSettingsChanged,
  settingsSet,
  type AppSettings,
  type MirrorControlMessage,
  type MirrorProtocol,
  type MirrorSessionState,
  type SettingKey,
  YoLog,
} from "@yohu/api";

import type { H264CanvasDecoder } from "./decoder";
import { fpsWindow } from "./fps";
import { parseMirrorFrame } from "./packet";
import {
  encoderLimits,
  startEncode,
  startForceForward,
  type MirrorEncodeParams,
} from "./quality";

export { encoderLimits } from "./quality";

/** 等待投屏进入 Live 的超时（ms）。 */
const WAIT_LIVE_TIMEOUT_MS = 20_000;
/** 等待 Live 的轮询间隔（ms）。 */
const WAIT_LIVE_POLL_MS = 300;
const FPS_WINDOW_MS = 1_000;

export type MirrorPhase = "idle" | "starting" | "live" | "failed";

export interface MirrorUiState {
  serial: string | null;
  connection: string;
  phase: MirrorPhase;
  generation: number;
  width: number;
  height: number;
  codec: string;
  control: boolean;
  error: string | null;
  hasFrame: boolean;
  paused: boolean;
  fullscreen: boolean;
  readOnly: boolean;
  maxSize: number;
  videoBitRate: number;
  maxFps: number;
  protocol: MirrorProtocol;
  forceForward: boolean;
  paintedFps: number;
  recvFps: number;
  dropped: number;
}

function phaseOf(state: MirrorSessionState): MirrorPhase {
  if (state === "starting") return "starting";
  if (state === "live") return "live";
  if (state === "failed") return "failed";
  return "idle";
}

function settingsSlice(settings: Pick<
  AppSettings,
  | "mirror_max_size"
  | "mirror_video_bit_rate"
  | "mirror_max_fps"
  | "mirror_protocol"
  | "mirror_force_forward"
>): Pick<
  MirrorUiState,
  "maxSize" | "videoBitRate" | "maxFps" | "protocol" | "forceForward"
> {
  return {
    maxSize: settings.mirror_max_size,
    videoBitRate: settings.mirror_video_bit_rate,
    maxFps: settings.mirror_max_fps,
    protocol: settings.mirror_protocol,
    forceForward: settings.mirror_force_forward,
  };
}

export function createMirrorStore() {
  const [state, setState] = createStore<MirrorUiState>({
    serial: null,
    connection: "usb",
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
    protocol: APP_SETTINGS_DEFAULT.mirror_protocol,
    forceForward: APP_SETTINGS_DEFAULT.mirror_force_forward,
    paintedFps: 0,
    recvFps: 0,
    dropped: 0,
  });

  let decoder: H264CanvasDecoder | null = null;
  let gate: Promise<void> = Promise.resolve();
  let packetCount = 0;
  let sessionQualityTouched = false;
  let paintedWindow = 0;
  let recvWindow = 0;
  let lastDropped = 0;
  const unlistens: Promise<() => void>[] = [];
  const fpsTimer = window.setInterval(() => {
    if (state.paused) return;
    if (state.phase !== "live" || !state.hasFrame) {
      paintedWindow = 0;
      recvWindow = 0;
      return;
    }
    setState({
      paintedFps: fpsWindow(paintedWindow, FPS_WINDOW_MS),
      recvFps: fpsWindow(recvWindow, FPS_WINDOW_MS),
      dropped: lastDropped,
    });
    paintedWindow = 0;
    recvWindow = 0;
  }, FPS_WINDOW_MS);

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
      decoder.onPainted = () => {
        paintedWindow += 1;
        setState("hasFrame", true);
      };
    }
  }

  function applySettings(
    settings: Pick<
      AppSettings,
      | "mirror_max_size"
      | "mirror_video_bit_rate"
      | "mirror_max_fps"
      | "mirror_protocol"
      | "mirror_force_forward"
    >,
  ): void {
    setState(settingsSlice(settings));
  }

  function bindConnection(connection: string): void {
    setState("connection", connection || "usb");
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
    sessionQualityTouched = false;
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
      paintedFps: 0,
      recvFps: 0,
      dropped: 0,
    });
  }

  function encodeForStart(): MirrorEncodeParams {
    return startEncode(
      {
        mirror_max_size: state.maxSize,
        mirror_video_bit_rate: state.videoBitRate,
        mirror_max_fps: state.maxFps,
        mirror_protocol: state.protocol,
      },
      state.connection,
      sessionQualityTouched,
    );
  }

  async function start(): Promise<void> {
    const serial = state.serial;
    if (!serial) return;
    await runExclusive(async () => {
      decoder?.reset();
      setState({ phase: "starting", error: null, hasFrame: false, paintedFps: 0, recvFps: 0, dropped: 0 });
      packetCount = 0;
      paintedWindow = 0;
      recvWindow = 0;
      lastDropped = 0;
      const encode = encodeForStart();
      const limits = encoderLimits(encode.maxSize, encode.maxFps);
      const forceForward = startForceForward(state.forceForward, state.connection);
      YoLog.info("mirror", "开始", {
        serial,
        connection: state.connection,
        maxSize: encode.maxSize,
        videoBitRate: encode.videoBitRate,
        maxFps: encode.maxFps,
        encoderMaxSize: limits.maxSize,
        encoderMaxFps: limits.maxFps,
        control: !state.readOnly,
        forceForward,
      });
      if (limits.capped) {
        YoLog.info("mirror", "原始分辨率对内嵌硬解过重，编码器已封顶 1920", {
          requested: { maxSize: encode.maxSize, maxFps: encode.maxFps },
          encoder: { maxSize: limits.maxSize, maxFps: limits.maxFps },
        });
      }
      try {
        const request = {
          serial,
          max_size: limits.maxSize,
          video_bit_rate: encode.videoBitRate,
          max_fps: limits.maxFps,
          control: !state.readOnly,
          force_forward: forceForward,
          video_codec: "h264",
        };
        const channel = createMirrorFrameChannel((bytes) => onBytes(bytes));
        let result = await mirrorStart(request, channel);
        if (result.adopted) {
          YoLog.info("mirror", "adopt 后解码器无配置，重启会话", {
            serial,
            generation: result.generation,
          });
          await mirrorStop(serial);
          decoder?.reset();
          const retry = createMirrorFrameChannel((bytes) => onBytes(bytes));
          result = await mirrorStart(request, retry);
        }
        setState({ generation: result.generation });
        YoLog.info("mirror", "start 返回", result);
        void waitUntilLive(serial, result.generation);
      } catch (e) {
        const error = errorText(e);
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
      setState({
        phase: "idle",
        error: null,
        hasFrame: false,
        paused: false,
        fullscreen: false,
        paintedFps: 0,
        recvFps: 0,
        dropped: 0,
      });
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
    key: Extract<
      SettingKey,
      | "mirror_max_size"
      | "mirror_video_bit_rate"
      | "mirror_max_fps"
      | "mirror_protocol"
      | "mirror_force_forward"
    >,
    value: number | boolean | MirrorProtocol,
  ): Promise<void> {
    sessionQualityTouched = true;
    try {
      const updated = await settingsSet(key, value as never);
      applySettings(updated);
    } catch (e) {
      YoLog.error("mirror", "质量写入失败", { key, error: String(e) });
    }
  }

  async function saveScreenshot(pngBase64: string): Promise<void> {
    const path = await dialogSaveFile({
      title: "保存截图",
      defaultPath: "mirror.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (!path) return;
    await mirrorSavePng({ path, data_b64: pngBase64 });
  }

  async function waitUntilLive(serial: string, generation: number): Promise<void> {
    const deadline = Date.now() + WAIT_LIVE_TIMEOUT_MS;
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
      await new Promise((resolve) => window.setTimeout(resolve, WAIT_LIVE_POLL_MS));
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

  function onBytes(bytes: Uint8Array): void {
    const packet = parseMirrorFrame(bytes);
    if (!packet) return;
    recvWindow += 1;
    lastDropped = packet.dropped;
    if (packet.width && packet.height) {
      setState({ width: packet.width, height: packet.height, codec: "h264" });
    }
    packetCount += 1;
    if (packetCount === 1 || packet.config || (packet.keyframe && packetCount <= 3)) {
      YoLog.info("mirror", "收到编码包", {
        n: packetCount,
        config: packet.config,
        keyframe: packet.keyframe,
        width: packet.width,
        height: packet.height,
        dropped: packet.dropped,
        bytes: packet.payload.byteLength,
      });
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
        setState({ paused: false, fullscreen: false, hasFrame: false, paintedFps: 0, recvFps: 0, dropped: 0 });
      }
    }),
  );
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
        paintedFps: 0,
        recvFps: 0,
        dropped: 0,
      });
    }),
  );
  unlistens.push(
    onSettingsChanged((e) => {
      if (
        e.key === "mirror_max_size" ||
        e.key === "mirror_video_bit_rate" ||
        e.key === "mirror_max_fps" ||
        e.key === "mirror_protocol" ||
        e.key === "mirror_force_forward"
      ) {
        applySettings(e.settings);
      }
    }),
  );

  const hot = (import.meta as { hot?: { dispose: (cb: () => void) => void } }).hot;
  hot?.dispose(() => {
    window.clearInterval(fpsTimer);
    for (const p of unlistens) void p.then((unlisten) => unlisten());
  });

  return {
    state,
    bindDecoder,
    bindSerial,
    bindConnection,
    applySettings,
    start,
    stop,
    inject,
    setReadOnly,
    persistQuality,
    saveScreenshot,
    setPaused: (paused: boolean) => {
      setState("paused", paused);
      if (decoder) decoder.paused = paused;
    },
    setFullscreen: (fullscreen: boolean) => setState("fullscreen", fullscreen),
  };
}

export const mirrorStore = createMirrorStore();
export type MirrorStoreApi = ReturnType<typeof createMirrorStore>;
