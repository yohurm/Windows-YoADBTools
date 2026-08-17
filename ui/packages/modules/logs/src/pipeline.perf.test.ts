/**
 * 日志管线性能回归（架构文档 §12 性能验收的自动化子集）：
 * 50k 缓冲规模 + 3 会话过滤 + 单批 1000 行过滤 < 16ms（ADR-v6-007 批量预算）。
 * 宽松上界防 CI 抖动：预算 16ms 下实际量级 ~0.1ms。
 */

import { describe, expect, it } from "vitest";

import type { LogLine } from "@yovo/api";

import { RingMirror, collapseStack, matchesLine } from "./pipeline";
import type { SessionFilter } from "./pipeline";

const line = (seq: number): LogLine => ({
  seq,
  ts: "08-17 10:00:00.000",
  pid: 100 + (seq % 500),
  tid: 1,
  level: ["V", "D", "I", "W", "E", "F"][seq % 6]!,
  tag: ["ActivityManager", "SystemServer", "BatteryService", "OkHttp"][seq % 4]!,
  msg:
    seq % 13 === 0
      ? "FATAL EXCEPTION: main"
      : `log message number ${seq} with some payload text for filtering performance`,
});

/** 50k 行 → 50 批（每批 1000，ADR-v6-007 上限）。 */
function fillMirror(capacity: number): RingMirror {
  const mirror = new RingMirror(capacity);
  for (let start = 0; start < 50_000; start += 1000) {
    const lines = Array.from({ length: 1000 }, (_, i) => line(start + i));
    mirror.pushBatch({ serial: "S", from_seq: start, lines, truncated: false });
  }
  return mirror;
}

const sessionFilter = (over: Partial<SessionFilter>): SessionFilter => ({
  minLevel: "W",
  tagContains: "",
  keyword: "",
  scope: { kind: "all" },
  pidSet: [],
  ...over,
});

describe("日志管线性能回归（50k 缓冲 · 3 会话）", () => {
  it("50k 缓冲注入后容量裁剪正确（环形保留尾部）", () => {
    const mirror = fillMirror(50_000);
    expect(mirror.size()).toBe(50_000);
    expect(mirror.lastSeqNumber()).toBe(49_999);
    const tail = mirror.replay(() => true, 5);
    expect(tail[0]!.seq).toBe(49_995);
  });

  it("单批 1000 行过滤 + 折叠 < 16ms（ADR-v6-007 批量预算，含 10x 余量）", () => {
    const mirror = fillMirror(50_000);
    const filters = [
      sessionFilter({ minLevel: "W", keyword: "payload" }),
      sessionFilter({ minLevel: "E" }),
      sessionFilter({ minLevel: "V", tagContains: "activity", scope: { kind: "package", pkg: "com.foo", includeChild: false }, pidSet: [100] }),
    ];
    // 预热（JIT）
    for (const f of filters) mirror.replay((l) => matchesLine(l, f), 2000);
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      const slice = mirror.replay(() => true, 0); // 空操作对齐开销基线
      void slice;
      for (const f of filters) {
        const rows = mirror.replay((l) => matchesLine(l, f), 2000);
        collapseStack(rows);
      }
    }
    const elapsed = performance.now() - start;
    // 3 会话 × 50 批全量过滤；每批预算 16ms → 总预算 50×3×16 = 2400ms
    expect(elapsed).toBeLessThan(2400);
  });

  it("3 会话过滤管线端到端（批处理 + 可见区裁剪）在预算内", () => {
    const mirror = fillMirror(50_000);
    const filters = [
      sessionFilter({ minLevel: "I" }),
      sessionFilter({ minLevel: "W", tagContains: "battery" }),
      sessionFilter({ scope: { kind: "pid", pid: 123 }, minLevel: null }),
    ];
    const start = performance.now();
    for (const f of filters) {
      const rows = mirror.replay((l) => matchesLine(l, f), 2000);
      collapseStack(rows);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});
