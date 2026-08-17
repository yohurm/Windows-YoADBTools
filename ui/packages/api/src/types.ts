/**
 * @yovo/api — 与 core/yovo-protocol 严格对齐的 wire 类型。
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

export interface ProcessEntry {
  pid: number;
  name: string;
}

export interface ProcessIndexSnapshot {
  serial: string;
  entries: ProcessEntry[];
  degraded: boolean;
}

export interface LogFilter {
  min_level?: string;
  tag_contains?: string;
  message_contains?: string;
  exact_pid?: number;
  pid_set?: number[];
}

// ===== process =====

export interface ExecOutcome {
  exit_code: number;
  stdout: string;
  stderr: string;
}

// ===== settings =====

export type Theme = "light" | "dark";

export type Density = "compact" | "comfortable";

export interface AppSettings {
  adb_path: string;
  data_root: string;
  devices_auto_refresh: number;
  buffer_capacity: number;
  display_limit: number;
  clear_device_on_start: boolean;
  theme: Theme;
  density: Density;
}

export type SettingKey =
  | "adb_path"
  | "data_root"
  | "devices_auto_refresh"
  | "buffer_capacity"
  | "display_limit"
  | "clear_device_on_start"
  | "theme"
  | "density";

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
  direction: Direction;
  local: string;
  remote: string;
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
}

/** core → UI 统一事件负载（kind = AppEvent 内部 tag，camelCase）。 */
export type AppEvent =
  | { kind: "devicesChanged"; devices: DeviceInfo[] }
  | { kind: "deviceOffline"; serial: string }
  | { kind: "logBatch"; batch: LogBatch }
  | { kind: "logOverflow"; serial: string; dropped_batches: number }
  | { kind: "processIndex"; serial: string; entries: ProcessEntry[]; degraded: boolean }
  | { kind: "captureState"; serial: string; state: CaptureState }
  | { kind: "transferProgress" } & TransferProgress
  | { kind: "groupProgress" } & GroupProgress
  | { kind: "taskSummary"; tasks: TaskInfo[] }
  | { kind: "settingsChanged"; key: string };

/** 事件名常量（与 yovo-protocol::event_names 一致）。 */
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
  | "already_running"
  | "cancelled"
  | "internal";

export interface IpcError {
  code: IpcErrorCode;
  message: string;
}
