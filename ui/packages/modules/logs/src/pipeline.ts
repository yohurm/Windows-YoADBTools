/**
 * 日志过滤管线（纯函数，ADR-v6-006 消费端过滤）：
 * 级别含以上 / Tag·关键字包含 / Scope（All|Package|Pid）/ 包名 PID 重绑（历史集）
 * + 信号扫描（崩溃/ANR）+ 堆叠折叠（显示层）。
 */

import type { LogBatch, LogFilter, LogLine, ProcessEntry } from "@yovo/api";

// ===== 级别 =====

export const LEVELS = ["V", "D", "I", "W", "E", "F"] as const;

/** 级别序：V<D<I<W<E<F；未知返回 -1（恒不匹配「含以上」） */
export function levelRank(level: string): number {
  const idx = (LEVELS as readonly string[]).indexOf(level.toUpperCase());
  return idx;
}

// ===== 会话作用域 =====

export type SessionScope =
  | { kind: "all" }
  | { kind: "package"; pkg: string; includeChild: boolean }
  | { kind: "pid"; pid: number };

/** 会话过滤条件（级别含以上；Tag/关键字包含忽略大小写；PID 精确）。 */
export interface SessionFilter {
  minLevel: string | null;
  tagContains: string;
  keyword: string;
  scope: SessionScope;
  /** Package 作用域的 PID 集合（含历史重绑） */
  pidSet: number[];
}

/** 单行匹配（与 core yovo-protocol::LogFilter 语义一致：空 package pids = 无命中）。 */
export function matchesLine(line: LogLine, f: SessionFilter): boolean {
  if (f.minLevel !== null && levelRank(line.level) < levelRank(f.minLevel)) {
    return false;
  }
  if (f.tagContains && !line.tag.toLowerCase().includes(f.tagContains.toLowerCase())) {
    return false;
  }
  if (f.keyword && !line.msg.toLowerCase().includes(f.keyword.toLowerCase())) {
    return false;
  }
  switch (f.scope.kind) {
    case "all":
      break;
    case "pid":
      if (line.pid !== f.scope.pid) return false;
      break;
    case "package":
      if (!f.pidSet.includes(line.pid)) return false;
      break;
  }
  return true;
}

// ===== 包名 PID 重绑（含历史集，ADR-v6-006/008 语义） =====

export const HISTORY_PID_CAP = 8;

/** 包名会话的 PID 绑定（纯数据；历史集上限默认 8）。 */
export interface PidBinding {
  current: number[];
  history: number[];
}

export function emptyBinding(): PidBinding {
  return { current: [], history: [] };
}

export function copyBinding(binding: PidBinding): PidBinding {
  return { current: [...binding.current], history: [...binding.history] };
}

/** 用进程索引重绑；current ∪ history，历史只保留最近 cap 个。 */
export function rebindPids(
  prev: PidBinding,
  index: readonly ProcessEntry[],
  pkg: string,
  includeChild: boolean,
  historyCap: number = HISTORY_PID_CAP,
): PidBinding {
  const current = index
    .filter((e) => (includeChild ? e.name === pkg || e.name.startsWith(`${pkg}:`) : e.name === pkg))
    .map((e) => e.pid);
  let history = [...prev.history];
  for (const pid of current) {
    if (!history.includes(pid)) history.push(pid);
  }
  if (history.length > historyCap) {
    history = history.slice(history.length - historyCap);
  }
  return { current, history };
}

export function pidSetOf(binding: PidBinding): number[] {
  return [...new Set([...binding.current, ...binding.history])];
}

export function toSessionFilter(input: {
  minLevel: string | null;
  tagContains: string;
  keyword: string;
  scope: SessionScope;
  binding: PidBinding;
}): SessionFilter {
  return {
    minLevel: input.minLevel,
    tagContains: input.tagContains,
    keyword: input.keyword,
    scope: input.scope,
    pidSet: pidSetOf(input.binding),
  };
}

/** 导出/回补用的 wire 过滤：空 package pids = 无命中。 */
export function toWireFilter(input: {
  minLevel: string | null;
  tagContains: string;
  keyword: string;
  scope: SessionScope;
  binding: PidBinding;
}): LogFilter {
  const min_level = input.minLevel ?? undefined;
  const tag_contains = input.tagContains || undefined;
  const message_contains = input.keyword || undefined;
  switch (input.scope.kind) {
    case "all":
      return { min_level, tag_contains, message_contains, scope: { kind: "all" } };
    case "pid":
      return { min_level, tag_contains, message_contains, scope: { kind: "pid", pid: input.scope.pid } };
    case "package":
      return {
        min_level,
        tag_contains,
        message_contains,
        scope: { kind: "package", pids: pidSetOf(input.binding) },
      };
  }
}

// ===== 信号扫描（批内增量，纯函数） =====

export type SignalKind = "crash" | "anr";

export interface SignalHit {
  pid: number;
  kind: SignalKind;
}

const CRASH_RE = /FATAL EXCEPTION|AndroidRuntime|has died/i;
const ANR_RE = /ANR in|not responding|am_anr/i;

export function scanSignal(line: LogLine): SignalHit | null {
  const text = `${line.tag}: ${line.msg}`;
  if (CRASH_RE.test(text)) return { pid: line.pid, kind: "crash" };
  if (ANR_RE.test(text)) return { pid: line.pid, kind: "anr" };
  return null;
}

// ===== 堆叠折叠（显示层，纯函数） =====

export interface ViewRow {
  line: LogLine;
  /** 其后被折叠的连续堆栈帧数（>0 时折叠显示） */
  collapsedAfter?: number;
  /** 该行命中的信号（崩溃/ANR → 行级底色 + Error 左条） */
  signal?: SignalKind;
}

/** 连续 `at xxx` 堆栈帧折叠为首帧 + 计数；逐行标记信号。 */
export function collapseStack(lines: readonly LogLine[]): ViewRow[] {
  const rows: ViewRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const signal = scanSignal(line)?.kind;
    if (line.msg.startsWith("at ")) {
      let j = i + 1;
      while (j < lines.length && lines[j]!.msg.startsWith("at ")) {
        j++;
      }
      const count = j - i - 1;
      rows.push(count > 0 ? { line, collapsedAfter: count, signal } : { line, signal });
      i = j;
    } else {
      rows.push({ line, signal });
      i++;
    }
  }
  return rows;
}

// ===== 设备共享缓冲镜像（seq 去重 + 容量环形） =====

export class RingMirror {
  private buf: LogLine[] = [];
  private lastSeq = -1;

  constructor(private capacity: number) {}

  /** 合并一个批次（按 seq 去重，容忍乱序重放）。 */
  pushBatch(batch: LogBatch): number {
    let added = 0;
    for (const line of batch.lines) {
      if (line.seq <= this.lastSeq) continue;
      this.lastSeq = line.seq;
      this.buf.push(line);
      added++;
    }
    if (this.buf.length > this.capacity) {
      this.buf.splice(0, this.buf.length - this.capacity);
    }
    return added;
  }

  /** 过滤重放（会话重建/过滤变更）。 */
  replay(filter: (line: LogLine) => boolean, limit: number): LogLine[] {
    const out: LogLine[] = [];
    for (let i = this.buf.length - 1; i >= 0 && out.length < limit; i--) {
      const line = this.buf[i]!;
      if (filter(line)) out.push(line);
    }
    return out.reverse();
  }

  clear(): void {
    this.buf = [];
    this.lastSeq = -1;
  }

  size(): number {
    return this.buf.length;
  }

  lastSeqNumber(): number {
    return this.lastSeq;
  }

  setCapacity(capacity: number): void {
    this.capacity = Math.max(1, capacity);
    if (this.buf.length > this.capacity) {
      this.buf.splice(0, this.buf.length - this.capacity);
    }
  }
}
