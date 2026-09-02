import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import { appendLines, keepMatching, lastSeqOf, panelFromLines, trimRows } from "./panel";
import { collapseStack, type SessionFilter } from "./pipeline";

const line = (seq: number, over: Partial<LogLine> = {}): LogLine => ({
  seq,
  ts: "01-01 00:00:00.000",
  pid: 100,
  tid: 1,
  level: "I",
  tag: "T",
  msg: "m",
  ...over,
});

const all: SessionFilter = {
  minLevel: null,
  tagContains: "",
  keyword: "",
  scope: { kind: "all" },
  pidSet: [],
};

describe("panel", () => {
  it("lastSeqOf：有行用末 seq，空面板用 fromSeq-1", () => {
    expect(lastSeqOf([], 0)).toBe(-1);
    expect(lastSeqOf([], -1)).toBe(-1);
    expect(lastSeqOf(collapseStack([line(4)]), 0)).toBe(4);
  });

  it("trimRows 只裁尾部容量", () => {
    const rows = collapseStack([line(0), line(1), line(2)]);
    expect(trimRows(rows, 2).map((r) => r.line.seq)).toEqual([1, 2]);
    expect(trimRows(rows, 10)).toHaveLength(3);
  });

  it("keepMatching 从已有面板筛选，不依赖镜像", () => {
    const rows = collapseStack([line(0, { level: "I" }), line(1, { level: "E" })]);
    expect(keepMatching(rows, { ...all, minLevel: "E" }).map((l) => l.seq)).toEqual([1]);
  });

  it("appendLines 在末尾追加并按容量裁剪", () => {
    const current = collapseStack([line(0)]);
    const next = appendLines(current, [line(1), line(2)], 2);
    expect(next.map((r) => r.line.seq)).toEqual([1, 2]);
  });

  it("panelFromLines 折叠并计数信号", () => {
    const { visible, signalCount } = panelFromLines(
      [line(0, { level: "E", tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" })],
      100,
    );
    expect(visible).toHaveLength(1);
    expect(signalCount).toBe(1);
  });
});
