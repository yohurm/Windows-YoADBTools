/**
 * 日志模块门面：工作区 + 采集客户端。只依赖 @yohu/api。
 * 设备焦点由 View 经 bindSerial 注入；会话/过滤/可见区在消费端（ADR-v6-006）。
 */

import { createStore } from "solid-js/store";
import type { ProcessEntry } from "@yohu/api";

import { createCapture } from "./capture";
import { RingMirror } from "./pipeline";
import { createWorkspace, type LogSessionState, type LogUiState } from "./workspace";

export type { ExportWriteMode } from "./capture";
export type { LogSessionState } from "./workspace";

export function createLogStore() {
  const [state, setState] = createStore<LogUiState>({
    serial: null,
    capturing: false,
    overflowed: false,
    sessions: [] as LogSessionState[],
    activeSessionId: null,
    processEntries: [] as ProcessEntry[],
    indexDegraded: false,
    bufferCapacity: 10_000,
  });

  const mirror = new RingMirror(10_000);
  const workspace = createWorkspace(state, setState, mirror);
  const capture = createCapture(state, setState, mirror, workspace);

  return {
    state,
    mirror,
    ...workspace,
    ...capture,
  };
}

/** 模块级单例。 */
export const logStore = createLogStore();

export type LogStoreApi = ReturnType<typeof createLogStore>;
