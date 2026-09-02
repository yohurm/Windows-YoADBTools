/**
 * 窗口显示面板（纯函数）。
 *
 * 面板是窗口私有、append-only 的已画出日志。只允许调用方显式 flush
 *（重新开始采集、清空、清设备缓冲）。设备无输出、掉线、停采、进程重绑、
 * 跟滚、镜像落后/被清空，都不得把已有行冲掉。
 *
 * UI 镜像只按 seq 补洞，禁止用镜像整表替换面板。
 */

import type { LogLine } from "@yohu/api";

import {
  collapseStack,
  matchesLine,
  scanSignal,
  type SessionFilter,
  type ViewRow,
} from "./pipeline";

export function lastSeqOf(rows: readonly ViewRow[], fromSeq: number): number {
  const last = rows.at(-1);
  if (last) return last.line.seq;
  return fromSeq < 0 ? -1 : fromSeq - 1;
}

export function trimRows(rows: readonly ViewRow[], cap: number): ViewRow[] {
  const n = Math.max(1, cap);
  return rows.length > n ? rows.slice(rows.length - n) : [...rows];
}

export function countSignals(lines: readonly LogLine[]): number {
  return lines.reduce((acc, l) => acc + (scanSignal(l) ? 1 : 0), 0);
}

export function keepMatching(rows: readonly ViewRow[], filter: SessionFilter): LogLine[] {
  return rows.filter((row) => matchesLine(row.line, filter)).map((row) => row.line);
}

export function appendLines(
  current: readonly ViewRow[],
  lines: readonly LogLine[],
  cap: number,
): ViewRow[] {
  if (lines.length === 0) return trimRows(current, cap);
  return trimRows([...current, ...collapseStack(lines)], cap);
}

export function panelFromLines(
  lines: readonly LogLine[],
  cap: number,
): { visible: ViewRow[]; signalCount: number } {
  return { visible: trimRows(collapseStack(lines), cap), signalCount: countSignals(lines) };
}
