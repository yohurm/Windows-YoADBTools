/**
 * @yohu/api — 事件订阅封装（自动反序列化为 AppEvent，返回取消订阅函数）。
 */

import { listen, TauriEvent, type UnlistenFn } from "@tauri-apps/api/event";

import { EVENT_NAMES, type AppEvent } from "./types";
import { YoLog } from "./yolog";

/** wry `tauri://drag-*` 载荷：坐标已换算为 CSS 像素，供 `elementFromPoint`。 */
export type NativeDragDropEvent =
  | { type: "enter"; paths: string[]; x: number; y: number }
  | { type: "over"; x: number; y: number }
  | { type: "drop"; paths: string[]; x: number; y: number }
  | { type: "leave" };

interface RawDragPosition {
  x?: number;
  y?: number;
  Physical?: { x: number; y: number };
}

interface RawDragPayload {
  paths?: string[];
  position?: RawDragPosition;
}

function cssPointFromPhysical(position: RawDragPosition | undefined): { x: number; y: number } {
  const point = position?.Physical ?? position;
  const x = typeof point?.x === "number" ? point.x : 0;
  const y = typeof point?.y === "number" ? point.y : 0;
  const scale = typeof window !== "undefined" && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  return { x: x / scale, y: y / scale };
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** 订阅单个事件（按 name 过滤出对应 kind 的负载）。 */
function on<K extends AppEvent["kind"]>(
  name: string,
  kind: K,
  handler: (payload: Extract<AppEvent, { kind: K }>) => void,
): Promise<UnlistenFn> {
  const attach = (): Promise<UnlistenFn> =>
    listen<unknown>(name, (event) => {
      const payload = asRecord(event.payload);
      if (!payload) {
        if (name.startsWith("mirror/")) YoLog.warn("ipc", `空负载 ${name}`);
        return;
      }
      const actual = payload.kind;
      if (actual != null && actual !== kind) {
        YoLog.warn("ipc", `事件 kind 不匹配 ${name}`, { expected: kind, actual });
        return;
      }
      handler({ ...payload, kind } as Extract<AppEvent, { kind: K }>);
    });
  const retry = async (): Promise<UnlistenFn> => {
    for (let i = 0; i < 40; i += 1) {
      try {
        const unlisten = await attach();
        if (name.startsWith("mirror/")) {
          YoLog.info("ipc", `已订阅 ${name}`);
        }
        return unlisten;
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    }
    YoLog.error("ipc", `订阅失败 ${name}`);
    return () => undefined;
  };
  return retry();
}

export const onDevicesChanged = (h: (e: Extract<AppEvent, { kind: "devicesChanged" }>) => void) =>
  on(EVENT_NAMES.devicesChanged, "devicesChanged", h);

export const onDeviceOffline = (h: (e: Extract<AppEvent, { kind: "deviceOffline" }>) => void) =>
  on(EVENT_NAMES.deviceOffline, "deviceOffline", h);

export const onLogBatch = (h: (e: Extract<AppEvent, { kind: "logBatch" }>) => void) =>
  on(EVENT_NAMES.logLines, "logBatch", h);

export const onLogOverflow = (h: (e: Extract<AppEvent, { kind: "logOverflow" }>) => void) =>
  on(EVENT_NAMES.logOverflow, "logOverflow", h);

export const onProcessIndex = (h: (e: Extract<AppEvent, { kind: "processIndex" }>) => void) =>
  on(EVENT_NAMES.processIndex, "processIndex", h);

export const onCaptureState = (h: (e: Extract<AppEvent, { kind: "captureState" }>) => void) =>
  on(EVENT_NAMES.captureState, "captureState", h);

export const onTransferProgress = (h: (e: Extract<AppEvent, { kind: "transferProgress" }>) => void) =>
  on(EVENT_NAMES.transferProgress, "transferProgress", h);

export const onGroupProgress = (h: (e: Extract<AppEvent, { kind: "groupProgress" }>) => void) =>
  on(EVENT_NAMES.groupProgress, "groupProgress", h);

export const onTaskSummary = (h: (e: Extract<AppEvent, { kind: "taskSummary" }>) => void) =>
  on(EVENT_NAMES.taskSummary, "taskSummary", h);

export const onSettingsChanged = (h: (e: Extract<AppEvent, { kind: "settingsChanged" }>) => void) =>
  on(EVENT_NAMES.settingsChanged, "settingsChanged", h);

export const onMirrorState = (h: (e: Extract<AppEvent, { kind: "mirrorState" }>) => void) =>
  on(EVENT_NAMES.mirrorState, "mirrorState", h);

export const onMirrorPacket = (h: (e: Extract<AppEvent, { kind: "mirrorPacket" }>) => void) =>
  on(EVENT_NAMES.mirrorPacket, "mirrorPacket", h);

/** 订阅 wry 窗口级拖放（Explorer `CF_HDROP`）。未挂载文件页时由调用方忽略。 */
export function onNativeDragDrop(handler: (event: NativeDragDropEvent) => void): Promise<UnlistenFn> {
  const attach = async (): Promise<UnlistenFn> => {
    const unlisteners = await Promise.all([
      listen<RawDragPayload>(TauriEvent.DRAG_ENTER, (event) => {
        const { x, y } = cssPointFromPhysical(event.payload?.position);
        handler({ type: "enter", paths: event.payload?.paths ?? [], x, y });
      }),
      listen<RawDragPayload>(TauriEvent.DRAG_OVER, (event) => {
        const { x, y } = cssPointFromPhysical(event.payload?.position);
        handler({ type: "over", x, y });
      }),
      listen<RawDragPayload>(TauriEvent.DRAG_DROP, (event) => {
        const { x, y } = cssPointFromPhysical(event.payload?.position);
        handler({ type: "drop", paths: event.payload?.paths ?? [], x, y });
      }),
      listen(TauriEvent.DRAG_LEAVE, () => handler({ type: "leave" })),
    ]);
    return () => {
      for (const unlisten of unlisteners) unlisten();
    };
  };
  return attach().catch(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    return attach();
  });
}
