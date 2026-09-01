/**
 * 逐窗口实时日志文件（ADR-v6-021 as-built）：open / append / close。
 * 过滤仍在 UI 消费端；本文件只把已过滤行交给 IPC，不判定采集世代。
 */

import { logSessionFileAppend, logSessionFileClose, logSessionFileOpen } from "@yohu/api";
import type { LogLine, LogWriteMode } from "@yohu/api";

import type { LogSessionState } from "./workspace";

export type SessionFilesApi = {
  open: (session: LogSessionState, serial: string, mode?: LogWriteMode) => Promise<void>;
  close: (serial: string | null, windowId: number) => void;
  closeDevice: (device: string, sessions: readonly LogSessionState[]) => void;
  has: (windowId: number) => boolean;
  append: (serial: string, windowId: number, lines: readonly LogLine[]) => void;
};

export function createSessionFiles(): SessionFilesApi {
  /** 窗口 id → 已打开的实时日志文件路径（core 侧文件键 window_id=session.id） */
  const windowFiles = new Map<number, string>();

  async function open(session: LogSessionState, serial: string, mode?: LogWriteMode): Promise<void> {
    if (windowFiles.has(session.id)) return;
    try {
      const info = await logSessionFileOpen({
        serial,
        window_id: session.id,
        name: session.title || `窗口${session.id}`,
        mode: mode ?? "overwrite",
      });
      windowFiles.set(session.id, info.path);
    } catch (e) {
      console.error("log.sessionFileOpen 失败", e);
    }
  }

  function close(serial: string | null, windowId: number): void {
    if (!windowFiles.has(windowId)) return;
    windowFiles.delete(windowId);
    if (!serial) return;
    void logSessionFileClose({ serial, window_id: windowId }).catch((e) =>
      console.error("log.sessionFileClose 失败", e),
    );
  }

  function closeDevice(device: string, sessions: readonly LogSessionState[]): void {
    sessions.forEach((s) => {
      if (s.serial === device) close(device, s.id);
    });
  }

  function has(windowId: number): boolean {
    return windowFiles.has(windowId);
  }

  function append(serial: string, windowId: number, lines: readonly LogLine[]): void {
    if (!windowFiles.has(windowId) || lines.length === 0) return;
    void logSessionFileAppend({ serial, window_id: windowId, lines: [...lines] }).catch((e) =>
      console.error("log.sessionFileAppend 失败", e),
    );
  }

  return { open, close, closeDevice, has, append };
}
