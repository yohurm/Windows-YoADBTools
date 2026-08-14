/**
 * 日志过滤管线（纯函数，ADR-v6-006 消费端过滤）：
 * 级别含以上 / Tag·关键字包含 / Scope（All|Package|Pid）/ 包名 PID 重绑（历史集）
 * + 信号扫描（崩溃/ANR）+ 堆叠折叠（显示层）。
 */

import type { LogBatch, LogLine, ProcessEntry } from "@yovo/api";

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

/** 单行匹配（与 core yovo-protocol::LogFilter 语义一致）。 */
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

export class PidBinding {
  private current: number[] = [];
  private history: number[] = [];

  constructor(private readonly historyCap: number = HISTORY_PID_CAP) {}

  /** 用进程索引重绑；返回新的 pidSet（current ∪ history）。 */
  rebind(index: readonly ProcessEntry[], pkg: string, includeChild: boolean): number[] {
    this.current = index
      .filter((e) =>
        includeChild ? e.name === pkg || e.name.startsWith(`${pkg}:`) : e.name === pkg,
      )
      .map((e) => e.pid);
    for (const pid of this.current) {
      if (!this.history.includes(pid)) this.history.push(pid);
    }
    if (this.history.length > this.historyCap) {
      this.history = this.history.slice(this.history.length - this.historyCap);
    }
    return this.pidSet();
  }

  pidSet(): number[] {
    return [...new Set([...this.current, ...this.history])];
  }

  /** 当前绑定的 PID（无历史）。 */
  currentPids(): number[] {
    return [...this.current];
  }

  clear(): void {
    this.current = [];
    this.history = [];
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
}

/** 连续 `at xxx` 堆栈帧折叠为首帧 + 计数。 */
export function collapseStack(lines: readonly LogLine[]): ViewRow[] {
  const rows: ViewRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.msg.startsWith("at ")) {
      let j = i + 1;
      while (j < lines.length && lines[j]!.msg.startsWith("at ")) {
        j++;
      }
      const count = j - i - 1;
      rows.push(count > 0 ? { line, collapsedAfter: count } : { line });
      i = j;
    } else {
      rows.push({ line });
      i++;
    }
  }
  return rows;
}

// ===== 设备共享缓冲镜像（seq 去重 + 容量环形） =====

export class RingMirror {
  private buf: LogLine[] = [];
  private lastSeq = -1;

  constructor(private readonly capacity: number) {}

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
  }

  size(): number {
    return this.buf.length;
  }

  lastSeqNumber(): number {
    return this.lastSeq;
  }
}
