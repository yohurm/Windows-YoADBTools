/**
 * 日志模块门面：工作区 + 采集客户端。只依赖 @yohu/api。
 * 焦点由 View 经 bindSerial 注入默认设备；窗口/过滤/可见区在消费端（ADR-v6-006）。
 */

import { createStore } from "solid-js/store";
import { APP_SETTINGS_DEFAULT, type LogWriteMode, type ProcessEntry } from "@yohu/api";

import { createCapture } from "./capture";
import { MirrorBank } from "./pipeline";
import { createWorkspace, type LogSessionState, type LogUiState } from "./workspace";

export type { LogWriteMode };
export type { LogSessionState } from "./workspace";
export { SYSTEM_SESSION_TITLE } from "./workspace";

export function createLogStore() {
  const [state, setState] = createStore<LogUiState>({
    serial: null,
    capturing: false,
    generation: 0,
    generations: {},
    startPending: false,
    startPendingId: null,
    overflowed: false,
    sessions: [] as LogSessionState[],
    activeSessionId: null,
    processEntries: [] as ProcessEntry[],
    indexDegraded: false,
    bufferCapacity: APP_SETTINGS_DEFAULT.buffer_capacity,
  });

  const mirrors = new MirrorBank(APP_SETTINGS_DEFAULT.buffer_capacity);
  const workspace = createWorkspace(state, setState, mirrors);
  const capture = createCapture(state, setState, mirrors, workspace);

  return {
    state,
    mirrors,
    get mirror() {
      return mirrors.of(state.serial ?? "");
    },
    ...workspace,
    ...capture,
  };
}

/** 模块级单例。 */
export const logStore = createLogStore();

export type LogStoreApi = ReturnType<typeof createLogStore>;
