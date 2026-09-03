/**
 * 投屏模块状态：控制面走 mirror/state；出画以 mirror/painted 为准；画面在壳 HWND。
 */

import { createStore } from "solid-js/store";
import {
  APP_SETTINGS_DEFAULT,
  dialogSaveFile,
  errorText,
  mirrorCloseControl,
  mirrorInject,
  mirrorLayout,
  mirrorScreenshot,
  mirrorStart,
  mirrorStop,
  onDeviceOffline,
  onMirrorPainted,
  onMirrorState,
  onSettingsChanged,
  settingsSet,
  type AppSettings,
  type MirrorControlMessage,
  type MirrorLayout,
  type MirrorProtocol,
  type MirrorSessionState,
  type SettingKey,
  YoLog,
} from "@yohu/api";

/** 等待投屏进入 Live 的超时（ms）。 */
const WAIT_LIVE_TIMEOUT_MS = 20_000;

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
  });

  let gate: Promise<void> = Promise.resolve();
  let sessionQualityTouched = false;
  let startWatchId: number | undefined;
  const unlistens: Promise<() => void>[] = [];

  function runExclusive(fn: () => Promise<void>): Promise<void> {
    const run = gate.then(fn, fn);
    gate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function clearStartWatch(): void {
    if (startWatchId !== undefined) {
      window.clearTimeout(startWatchId);
      startWatchId = undefined;
    }
  }

  function armStartWatch(serial: string, generation: number): void {
    clearStartWatch();
    startWatchId = window.setTimeout(() => {
      startWatchId = undefined;
      void runExclusive(async () => {
        if (state.phase !== "starting" || state.serial !== serial || state.generation !== generation) {
          return;
        }
        YoLog.error("mirror", "等待 Live 超时，停止卡住会话");
        try {
          await hideSurface(serial);
          await mirrorStop(serial);
        } catch (e) {
          YoLog.warn("mirror", "超时停止失败", String(e));
        }
        if (state.phase === "starting" && state.serial === serial && state.generation === generation) {
          setState({
            phase: "failed",
            error: "投屏启动超时",
            hasFrame: false,
          });
        }
      });
    }, WAIT_LIVE_TIMEOUT_MS);
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
        clearStartWatch();
        await hideSurface(prev);
        await mirrorStop(prev);
      });
    }
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
    });
  }

  async function hideSurface(serial: string): Promise<void> {
    await mirrorLayout({
      serial,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      visible: false,
      control: false,
    });
  }

  async function start(): Promise<void> {
    const serial = state.serial;
    if (!serial) return;
    await runExclusive(async () => {
      setState({ phase: "starting", error: null, hasFrame: false, paintedFps: 0 });
      YoLog.info("mirror", "开始", {
        serial,
        connection: state.connection,
        control: !state.readOnly,
        sessionQualityTouched,
      });
      try {
        const result = await mirrorStart({
          serial,
          control: !state.readOnly,
          connection: state.connection,
          session_quality_touched: sessionQualityTouched,
        });
        setState({ generation: result.generation });
        YoLog.info("mirror", "start 返回", result);
        armStartWatch(serial, result.generation);
      } catch (e) {
        clearStartWatch();
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
      clearStartWatch();
      await hideSurface(serial);
      await mirrorStop(serial);
      setState({
        phase: "idle",
        error: null,
        hasFrame: false,
        paused: false,
        fullscreen: false,
        paintedFps: 0,
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

  async function saveScreenshot(): Promise<void> {
    const serial = state.serial;
    if (!serial) return;
    const path = await dialogSaveFile({
      title: "保存截图",
      defaultPath: "mirror.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (!path) return;
    await mirrorScreenshot({ serial, path });
  }

  async function syncLayout(rect: Omit<MirrorLayout, "serial" | "control" | "visible"> & { visible?: boolean }): Promise<void> {
    const serial = state.serial;
    if (!serial) return;
    if (state.phase !== "live" && state.phase !== "starting") return;
    await mirrorLayout({
      serial,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      visible: rect.visible ?? (!state.paused && state.phase === "live"),
      control: !state.readOnly && state.control,
    });
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
      if (e.state !== "starting") {
        clearStartWatch();
      }
      setState({
        generation: e.generation,
        phase: phaseOf(e.state),
        width: e.width,
        height: e.height,
        codec: e.codec,
        control: e.control,
        error: e.error ?? null,
      });
      if (e.state === "stopped" || e.state === "failed") {
        setState({ paused: false, fullscreen: false, hasFrame: false, paintedFps: 0 });
      }
    }),
  );
  unlistens.push(
    onMirrorPainted((e) => {
      if (e.serial !== state.serial) return;
      if (e.generation && e.generation !== state.generation) return;
      if (!state.hasFrame) {
        YoLog.info("mirror", "首帧已绘制", {
          serial: e.serial,
          generation: e.generation,
          painted_fps: e.painted_fps,
        });
      }
      setState({
        hasFrame: true,
        paintedFps: e.painted_fps,
      });
    }),
  );
  unlistens.push(
    onDeviceOffline((e) => {
      if (e.serial !== state.serial) return;
      clearStartWatch();
      setState({
        phase: "idle",
        error: "设备已掉线",
        hasFrame: false,
        paused: false,
        fullscreen: false,
        control: false,
        paintedFps: 0,
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
    clearStartWatch();
    for (const p of unlistens) void p.then((unlisten) => unlisten());
  });

  return {
    state,
    bindSerial,
    bindConnection,
    applySettings,
    start,
    stop,
    inject,
    setReadOnly,
    persistQuality,
    saveScreenshot,
    syncLayout,
    setPaused: (paused: boolean) => setState("paused", paused),
    setFullscreen: (fullscreen: boolean) => setState("fullscreen", fullscreen),
  };
}

export const mirrorStore = createMirrorStore();
export type MirrorStoreApi = ReturnType<typeof createMirrorStore>;
