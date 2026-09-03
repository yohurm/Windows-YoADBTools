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

export type MirrorProtocol = "usb" | "wifi";

/** 日志写入方式（实时逐窗口日志文件）。 */
export type LogWriteMode = "overwrite" | "append";
/** 手动导出行为。 */
export type ExportMode = "latest" | "select";

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
  export_mode: ExportMode;
  log_write_mode: LogWriteMode;
  log_display_columns: LogDisplayColumns;
  mirror_max_size: number;
  mirror_video_bit_rate: number;
  mirror_max_fps: number;
  mirror_protocol: MirrorProtocol;
  mirror_force_forward: boolean;
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
  | "export_mode"
  | "log_write_mode"
  | "log_display_columns"
  | "mirror_max_size"
  | "mirror_video_bit_rate"
  | "mirror_max_fps"
  | "mirror_protocol"
  | "mirror_force_forward";

/** `settings.get` 单键值类型：按键映射到 `AppSettings` 对应字段类型。
 * `SettingKey` 成员与 `AppSettings` 字段一一同名，故索引映射即精确值类型。
 * 例：`SettingValue<"theme"> = Theme`、`SettingValue<"buffer_capacity"> = number`。
 */
export type SettingValue<K extends SettingKey> = AppSettings[K];

/** 应用身份（`system.info.identity`；常量见 `identity.ts`）。 */
export interface AppIdentity {
  name: string;
  display_name: string;
  identifier: string;
  version: string;
  description: string;
  copyright: string;
}

/** 解析后的绝对路径目录（`system.info.paths`）。 */
export interface AppPathCatalog {
  local_root: string;
  settings_dir: string;
  settings_file: string;
  logs_dir: string;
  data_root: string;
  adb_tools_dir: string;
  library_file: string;
  exports_dir: string;
  session_logs_dir: string;
  drag_out_dir: string;
}

/** `system.info`：关于 / 诊断。 */
export interface SystemInfo {
  identity: AppIdentity;
  paths: AppPathCatalog;
  adb_path: string;
  adb_in_use?: string;
  settings: AppSettings;
}

/** 壳注入到模块视图的会话（模块不得 import 壳 store）。
 * 设备与设置走同一条链：壳 store 投影 → AppLayout 注入 → 模块 View。
 */
export interface DeviceSession {
  /** 全局焦点（日志新窗口默认设备；与 selectedSerials 可能不同） */
  focusSerial: string | null;
  /** 当前模块解析后的执行目标（仅在线）。模块禁止再扫全部设备。 */
  selectedSerials: string[];
  /** 执行目标在目录中的切片（与 selectedSerials 同序）。页眉 / 选择器只读此切片。 */
  selectedDevices: DeviceInfo[];
  /** 页眉展示名（壳从 selectedDevices 计算）；无选中为 null。模块禁止自拼 serial。 */
  selectedLabel: string | null;
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

export interface SessionFileRequest {
  serial: string;
  window_id: number;
  /** 窗口名（会话标题，如包名/PID/System；统一数据源） */
  name: string;
  mode: LogWriteMode;
}

export interface SessionFileInfo {
  path: string;
  name: string;
  lines: number;
}

export interface SessionFileAppendRequest {
  serial: string;
  window_id: number;
  lines: LogLine[];
}

export interface SessionFileCloseRequest {
  serial: string;
  window_id: number;
}

export interface SessionLogFile {
  path: string;
  serial: string;
  window_id: number;
  /** 窗口名（会话标题；统一数据源） */
  name: string;
  lines: number;
  modified: string;
}

export interface ExportRequest {
  /** 要合并的源日志文件路径（来自 `sessionFileList` / 当前窗口最新文件） */
  sources: string[];
  path?: string;
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

/** `terminal.eval`：按命令库 id 填充并多设备并行。 */
export interface TerminalEvalRequest {
  command_id: string;
  values: string[];
  serials: string[];
}

/** 单台设备的 `terminal.eval` 结果。 */
export interface SerialEvalResult {
  serial: string;
  ok: boolean;
  message: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

/** `terminal.eval` 单台判定字段（不含 serial）。 */
export interface EvalResult {
  ok: boolean;
  message: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  /** 执行用时（毫秒） */
  duration_ms: number;
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

/** `update.check` 响应。 */
export interface RemoteUpdate {
  has_new_version: boolean;
  version: string;
  version_code: number;
  description: string;
  download_url: string;
  force_update: boolean;
  md5: string;
  sha256: string;
  size_bytes: number;
}

/** `update.download` 请求。 */
export interface UpdateDownloadRequest {
  url: string;
  sha256: string;
  size_bytes: number;
  version: string;
}

/** `update.download` 响应。 */
export interface UpdateDownloadResult {
  path: string;
  size_bytes: number;
}

/** `update/progress` 阶段。 */
export type UpdateStage = "downloading" | "verifying" | "ready" | "applying";

/** `update/progress` 负载。 */
export interface UpdateProgress {
  version: string;
  stage: UpdateStage;
  received_bytes: number;
  total_bytes: number;
}

/** `update.info` 响应（不含密钥）。 */
export interface UpdateChannelInfo {
  remote: string;
  page_url: string;
}

// ===== mirror =====

export type MirrorSessionState = "starting" | "live" | "stopped" | "failed";

export interface MirrorStart {
  serial: string;
  generation: number;
  adopted: boolean;
}

export interface MirrorStartRequest {
  serial: string;
  control: boolean;
  connection: string;
  session_quality_touched: boolean;
}

export type MirrorControlMessage =
  | { kind: "touch"; action: number; x: number; y: number; width: number; height: number }
  | { kind: "key"; keycode: number; down: boolean }
  | { kind: "display_power"; on: boolean }
  | { kind: "back_or_screen_on" }
  | { kind: "expand_notification" }
  | { kind: "expand_settings" }
  | { kind: "collapse_panels" }
  | { kind: "rotate_device" };

export interface MirrorInjectRequest {
  serial: string;
  message: MirrorControlMessage;
}

/** 面板在屏幕上的物理像素矩形（`mirror.layout`）。 */
export interface MirrorLayout {
  serial: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  control: boolean;
}

/** 壳内截图落盘（`mirror.screenshot`）。 */
export interface MirrorScreenshotRequest {
  serial: string;
  path: string;
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
  | ({ kind: "processIndex" } & ProcessIndexSnapshot)
  | { kind: "captureState"; serial: string; generation: number; state: CaptureState }
  | { kind: "transferProgress" } & TransferProgress
  | { kind: "groupProgress" } & GroupProgress
  | { kind: "taskSummary"; tasks: TaskInfo[] }
  | { kind: "settingsChanged"; key: string; settings: AppSettings }
  | {
      kind: "mirrorState";
      serial: string;
      generation: number;
      state: MirrorSessionState;
      width: number;
      height: number;
      codec: string;
      control: boolean;
      error?: string;
    }
  | { kind: "mirrorPainted"; serial: string; generation: number; painted_fps: number }
  | { kind: "updateProgress" } & UpdateProgress;

/** 事件名常量（与 yohu-protocol::event_names 一致）。 */
export const EVENT_NAMES = {
  devicesChanged: "devices/changed",
  deviceOffline: "device/offline",
  logLines: "log/lines",
  logOverflow: "log/overflow",
  processIndex: "log/processIndex",
  captureState: "log/captureState",
  transferProgress: "transfer/progress",
  groupProgress: "group/progress",
  taskSummary: "task/summary",
  settingsChanged: "settings/changed",
  mirrorState: "mirror/state",
  mirrorPainted: "mirror/painted",
  updateProgress: "update/progress",
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
