/**
 * 窗口扇出：设备批次 → 该 serial 上每个订阅窗口的过滤 / 可见区 / 会话文件。
 * 不碰采集启停与世代；镜像按设备分桶，窗口只读自己的 serial。
 */

import type { SetStoreFunction } from "solid-js/store";
import type { LogBatch } from "@yohu/api";

import { collapseStack, matchesLine, scanSignal, toSessionFilter, type MirrorBank } from "./pipeline";
import type { SessionFilesApi } from "./session-files";
import type { LogUiState } from "./workspace";

export type IngestApi = {
  onBatch: (batch: LogBatch) => void;
};

export function createIngest(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  mirrors: MirrorBank,
  files: SessionFilesApi,
): IngestApi {
  const sessionIndex = (id: number): number => state.sessions.findIndex((s) => s.id === id);
  const bufferCapacity = (): number => state.bufferCapacity;

  function onBatch(batch: LogBatch): void {
    mirrors.of(batch.serial).pushBatch(batch);

    state.sessions.forEach((session) => {
      if (session.serial !== batch.serial) return;
      if (!session.capturing || session.fromSeq < 0) return;
      const filter = toSessionFilter(session);
      const matched = batch.lines.filter((line) => line.seq >= session.fromSeq && matchesLine(line, filter));
      if (matched.length === 0) return;
      const idx = sessionIndex(session.id);
      if (idx < 0) return;

      files.append(batch.serial, session.id, matched);

      if (session.paused) return;
      const signals = matched.reduce((acc, l) => acc + (scanSignal(l) ? 1 : 0), 0);
      if (!session.following) {
        setState("sessions", idx, {
          pendingCount: session.pendingCount + matched.length,
          signalCount: session.signalCount + signals,
        });
        return;
      }
      const cap = bufferCapacity();
      const current = state.sessions[idx]!.visible;
      const merged = [...current, ...collapseStack(matched)];
      const trimmed = merged.length > cap ? merged.slice(merged.length - cap) : merged;
      setState("sessions", idx, {
        visible: trimmed,
        signalCount: session.signalCount + signals,
      });
    });
  }

  return { onBatch };
}
