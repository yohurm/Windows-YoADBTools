/**
 * @yohu/api — 类型化 invoke 命令封装（与 core/yohu-app/src/commands/* 一一对应）。
 *
 * 命令名是架构文档的点分名（`device.refresh`）。必须用 `cargo tauri build` 打包：
 * Rust 侧 `#[tauri::command(rename = "device.refresh")]` 只在 tauri-cli 生产构建中生效；
 * 裸 `cargo build --release` 仍注册函数名，不能用来验收桌面 IPC。
 */

import { invoke } from "@tauri-apps/api/core";

import type {
  AdbExecRequest,
  AppSettings,
  CaptureStart,
  CaptureStatus,
  CommandLibraryDto,
  DeviceInfo,
  ExecOutcome,
  ExportRequest,
  ExportResult,
  GroupRunRequest,
  LogBatch,
  PathOpRequest,
  ProcessEntry,
  ReplayRequest,
  RemoteEntry,
  SerialEvalResult,
  SettingKey,
  SystemInfo,
  TerminalEvalRequest,
  TransferRequest,
  DragOutRequest,
  RemoteUpdate,
  UpdateChannelInfo,
} from "./types";

// ===== device =====

export const deviceRefresh = () => invoke<DeviceInfo[]>("device.refresh");

// ===== adb =====

export const adbExec = (req: AdbExecRequest) => invoke<ExecOutcome>("adb.exec", { req });

// ===== terminal =====

export const terminalEval = (req: TerminalEvalRequest) =>
  invoke<SerialEvalResult[]>("terminal.eval", { req });

export const groupRun = (req: GroupRunRequest) => invoke<number>("group.run", { req });

export const groupCancel = (runId: number) => invoke<void>("group.cancel", { runId });

// ===== command library =====

export const commandlibLoad = () => invoke<CommandLibraryDto>("commandlib.load");

export const commandlibSave = (dto: CommandLibraryDto) =>
  invoke<void>("commandlib.save", { dto });

// ===== files =====

export const filesList = (serial: string, path: string) =>
  invoke<RemoteEntry[]>("files.list", { serial, path });

export const filesPush = (req: TransferRequest) => invoke<number>("files.push", { req });

export const filesPull = (req: TransferRequest) => invoke<number>("files.pull", { req });

export const filesCancel = (id: number) => invoke<void>("files.cancel", { id });

export const filesDelete = (req: PathOpRequest) => invoke<void>("files.delete", { req });

export const filesMkdir = (req: PathOpRequest) => invoke<void>("files.mkdir", { req });

export const filesCreate = (req: PathOpRequest) => invoke<void>("files.create", { req });

export const filesDragOut = (req: DragOutRequest) => invoke<void>("files.dragOut", { req });

// ===== log =====

export const logCaptureStart = (serial: string) =>
  invoke<CaptureStart>("log.capture.start", { serial });

export const logCaptureStop = (serial: string) =>
  invoke<void>("log.capture.stop", { serial });

export const logCaptureStatus = (serial: string) =>
  invoke<CaptureStatus>("log.capture.status", { serial });

export const logClear = (serial: string) => invoke<void>("log.clear", { serial });

export const logClearDevice = (serial: string) =>
  invoke<void>("log.clearDevice", { serial });

export const logReplay = (req: ReplayRequest) => invoke<LogBatch>("log.replay", { req });

export const logExport = (req: ExportRequest) => invoke<ExportResult>("log.export", { req });

export const logProcessSnapshot = (serial: string) =>
  invoke<ProcessEntry[]>("log.processSnapshot", { serial });

// ===== settings =====

export const settingsGet = (key: SettingKey) => invoke<unknown>("settings.get", { key });

/** 返回全量快照。壳 settingsStore.set 回写后经 DeviceSession.settings 注入模块。 */
export const settingsSet = (key: SettingKey, value: unknown) =>
  invoke<AppSettings>("settings.set", { key, value });

// ===== system =====

export const systemInfo = () => invoke<SystemInfo>("system.info");

export const systemOpenPath = (path: string) => invoke<void>("system.openPath", { path });

export const systemReportError = (message: string) =>
  invoke<void>("system.reportError", { message });

// ===== update =====

export const updateCheck = () => invoke<RemoteUpdate>("update.check");

export const updateInfo = () => invoke<UpdateChannelInfo>("update.info");

export const updateOpen = (url: string) => invoke<void>("update.open", { url });
