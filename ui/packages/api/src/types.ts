/**
 * @yohu/api — 与 core/yohu-protocol 严格对齐的 wire 类型。
 *
 * 对齐规则：serde 默认 JSON（snake_case 字段；枚举 lowercase；
 * AppEvent 内部 tag `kind`（camelCase））。由 fixture 契约测试守护（types.test.ts）。
 */

// ===== device =====

export type DeviceState = "online" | "unauthorized" | "offline";

export interface DeviceInfo {
  serial: string;
  model?: string;
  state: DeviceState;
  connection: string;
}

// ===== log =====

export interface LogLine {
  seq: number;
  ts: string;
  pid: number;
  tid: number;
  uid?: string;
  level: string;
  tag: string;
  msg: string;
}

export interface LogBatch {
  serial: string;
  from_seq: number;
  lines: LogLine[];
  truncated: boolean;
}

export type CaptureState = "running" | "stopped";

export interface CaptureStart {
  serial: string;
  generation: number;
  adopted: boolean;
}

export interface CaptureStatus {
  serial: string;
  capturing: boolean;
  generation: number;
  last_seq: number;
}

export interface ProcessEntry {
  pid: number;
  name: string;
}

export interface ProcessIndexSnapshot {
  serial: string;
  entries: ProcessEntry[];
  degraded: boolean;
}

export type LogScope =
  | { kind: "all" }
  | { kind: "pid"; pid: number }
  | { kind: "package"; pids: number[] };

export interface LogFilter {
  min_level?: string;
  tag_contains?: string;
  message_contains?: string;
  scope: LogScope;
}

// ===== process =====

export interface ExecOutcome {
  exit_code: number;
  stdout: string;
  stderr: string;
}

// ===== settings =====

export type Theme = "light" | "dark" | "system";

export type Density = "compact" | "comfortable";

export interface AppSettings {
  adb_path: string;
  data_root: string;
  devices_auto_refresh: number;
  buffer_capacity: number;
  clear_device_on_start: boolean;
  theme: Theme;
  density: Density;
  export_default_path: string;
  export_ask_every_time: boolean;
  export_write_mode: "overwrite" | "append";
  log_display_columns: LogDisplayColumns;
}

/** 日志清单元数据列开关；消息列始终显示。 */
export interface LogDisplayColumns {
  ts: boolean;
  uid: boolean;
  pid: boolean;
  tid: boolean;
  level: boolean;
  tag: boolean;
}

export type SettingKey =
  | "adb_path"
  | "data_root"
  | "devices_auto_refresh"
  | "buffer_capacity"
  | "clear_device_on_start"
  | "theme"
  | "density"
  | "export_default_path"
  | "export_ask_every_time"
  | "export_write_mode"
  | "log_display_columns";

/** 壳注入到模块视图的会话（模块不得 import 壳 store）。
 * 设备与设置走同一条链：壳 store 投影 → AppLayout 注入 → 模块 View。
 */
export interface DeviceSession {
  /** 全局焦点（日志新窗口默认设备；与 selectedSerials 可能不同） */
  focusSerial: string | null;
  /** 当前模块解析后的执行目标（仅在线）。模块禁止再扫全部设备。 */
  selectedSerials: string[];
  /** 设备目录快照（与壳设备栏同一源） */
  devices: DeviceInfo[];
  /** 应用设置快照（与设置页同一 settingsStore 投影） */
  settings: AppSettings;
}

// ===== transfer =====

export type Direction = "push" | "pull";
export type TransferState = "running" | "done" | "failed" | "cancelled";

export interface TransferProgress {
  id: number;
  direction: Direction;
  bytes: number;
  total?: number;
  state: TransferState;
  message?: string;
}

export type EntryKind = "dir" | "file" | "symlink" | "other";

export interface RemoteEntry {
  name: string;
  kind: EntryKind;
  size: number;
  permission: string;
  link_target?: string;
  /** 修改时间（ls -la 日期时间列原文） */
  mtime?: string;
}

// ===== commands DTO =====

export interface AdbExecRequest {
  serial: string;
  argv: string[];
  timeout_ms?: number;
}

export interface ReplayRequest {
  serial: string;
  from_seq: number;
  limit: number;
  filter?: LogFilter;
}

export interface ExportRequest {
  serial: string;
  filter?: LogFilter;
  path?: string;
  write_mode?: "overwrite" | "append";
}

export interface ExportResult {
  path: string;
  lines: number;
}

export interface PathOpRequest {
  serial: string;
  path: string;
}

export interface TransferRequest {
  serial: string;
  local: string;
  remote: string;
}

export interface DragOutRequest {
  serial: string;
  remotes: string[];
}

export interface GroupRunRequest {
  group_id: string;
  serials: string[];
}

export interface InputFieldDto {
  placeholder: string;
}

export interface CommandDto {
  id: string;
  name: string;
  template: string;
  inputs: InputFieldDto[];
  failure_regex: string;
  success_regex: string;
  delay_ms: number;
  abort_on_fail: boolean;
}

export interface CommandGroupDto {
  id: string;
  name: string;
  tags: string[];
  commands: CommandDto[];
}

export interface CommandLibraryDto {
  schema_version: number;
  groups: CommandGroupDto[];
}

// ===== events =====

export interface TaskInfo {
  id: number;
  name: string;
  active: boolean;
  /** 悬停明细（状态栏 title 提示） */
  detail?: string;
}

export interface GroupProgress {
  run_id: number;
  serial: string;
  name?: string;
  ok: boolean;
  message?: string;
  /** 单命令用时（毫秒） */
  duration_ms: number;
}

/** core → UI 统一事件负载（kind = AppEvent 内部 tag，camelCase）。 */
export type AppEvent =
  | { kind: "devicesChanged"; devices: DeviceInfo[] }
  | { kind: "deviceOffline"; serial: string }
  | { kind: "logBatch"; batch: LogBatch }
  | { kind: "logOverflow"; serial: string; dropped_batches: number }
  | { kind: "processIndex"; serial: string; entries: ProcessEntry[]; degraded: boolean }
  | { kind: "captureState"; serial: string; generation: number; state: CaptureState }
  | { kind: "transferProgress" } & TransferProgress
  | { kind: "groupProgress" } & GroupProgress
  | { kind: "taskSummary"; tasks: TaskInfo[] }
  | { kind: "settingsChanged"; key: string };

/** 事件名常量（与 yohu-protocol::event_names 一致）。 */
export const EVENT_NAMES = {
  devicesChanged: "devices.changed",
  deviceOffline: "device.offline",
  logLines: "log.lines",
  logOverflow: "log.overflow",
  processIndex: "log.processIndex",
  captureState: "log.captureState",
  transferProgress: "transfer.progress",
  groupProgress: "group.progress",
  taskSummary: "task.summary",
  settingsChanged: "settings.changed",
} as const;

// ===== error =====

export type IpcErrorCode =
  | "invalid_args"
  | "device_offline"
  | "unauthorized"
  | "adb_error"
  | "not_found"
  | "cancelled"
  | "internal";

export interface IpcError {
  code: IpcErrorCode;
  message: string;
}
