import { describe, expect, it } from "vitest";

import type { LogLine } from "@yovo/api";

import {
  PidBinding,
  RingMirror,
  SessionFilter,
  collapseStack,
  levelRank,
  matchesLine,
  scanSignal,
} from "./pipeline";

const line = (over: Partial<LogLine>): LogLine => ({
  seq: 0,
  ts: "01-01 00:00:00.000",
  pid: 100,
  tid: 1,
  level: "I",
  tag: "T",
  msg: "m",
  ...over,
});

const filter = (over: Partial<SessionFilter>): SessionFilter => ({
  minLevel: null,
  tagContains: "",
  keyword: "",
  scope: { kind: "all" },
  pidSet: [],
  ...over,
});

describe("levelRank", () => {
  it("级别序与未知", () => {
    expect(levelRank("V")).toBeLessThan(levelRank("D"));
    expect(levelRank("W")).toBeLessThan(levelRank("E"));
    expect(levelRank("F")).toBe(5);
    expect(levelRank("?")).toBe(-1);
  });
});

describe("matchesLine", () => {
  it("级别最低含以上", () => {
    const f = filter({ minLevel: "W" });
    expect(matchesLine(line({ level: "W" }), f)).toBe(true);
    expect(matchesLine(line({ level: "E" }), f)).toBe(true);
    expect(matchesLine(line({ level: "I" }), f)).toBe(false);
  });

  it("Tag/关键字包含（忽略大小写）", () => {
    expect(matchesLine(line({ tag: "OkHttp" }), filter({ tagContains: "okhttp" }))).toBe(true);
    expect(matchesLine(line({ msg: "Request Timeout" }), filter({ keyword: "timeout" }))).toBe(true);
    expect(matchesLine(line({ msg: "ok" }), filter({ keyword: "timeout" }))).toBe(false);
  });

  it("Scope=Pid 精确相等", () => {
    const f = filter({ scope: { kind: "pid", pid: 42 } });
    expect(matchesLine(line({ pid: 42 }), f)).toBe(true);
    expect(matchesLine(line({ pid: 43 }), f)).toBe(false);
  });

  it("Scope=Package 用 pidSet", () => {
    const f = filter({ scope: { kind: "package", pkg: "com.foo", includeChild: false }, pidSet: [1, 2] });
    expect(matchesLine(line({ pid: 2 }), f)).toBe(true);
    expect(matchesLine(line({ pid: 3 }), f)).toBe(false);
  });
});

describe("PidBinding 包名重绑（含历史集）", () => {
  const index = [
    { pid: 10, name: "com.foo" },
    { pid: 11, name: "com.foo:remote" },
    { pid: 20, name: "other.app" },
  ];

  it("精确进程名（不含子进程）", () => {
    const b = new PidBinding();
    expect(b.rebind(index, "com.foo", false)).toEqual([10]);
  });

  it("包含子进程前缀匹配", () => {
    const b = new PidBinding();
    expect(b.rebind(index, "com.foo", true)).toEqual([10, 11]);
  });

  it("崩溃重启后保留历史 PID（当前在前，历史在后）", () => {
    const b = new PidBinding();
    b.rebind(index, "com.foo", false);
    b.rebind([{ pid: 99, name: "com.foo" }], "com.foo", false);
    expect(b.pidSet()).toEqual([99, 10]);
    expect(b.currentPids()).toEqual([99]);
  });

  it("历史集上限", () => {
    const b = new PidBinding(3);
    for (let pid = 1; pid <= 10; pid++) {
      b.rebind([{ pid, name: "com.foo" }], "com.foo", false);
    }
    const set = b.pidSet();
    expect(set).toHaveLength(3);
    expect(set[0]).toBe(10); // 当前 PID 恒在最前
    expect(set.slice(1).sort()).toEqual([8, 9]); // 历史仅保留最近 2 个
  });

  it("clear 清空", () => {
    const b = new PidBinding();
    b.rebind(index, "com.foo", true);
    b.clear();
    expect(b.pidSet()).toEqual([]);
  });
});

describe("scanSignal", () => {
  it("崩溃与 ANR", () => {
    expect(scanSignal(line({ tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" }))?.kind).toBe("crash");
    expect(scanSignal(line({ msg: "ANR in com.foo" }))?.kind).toBe("anr");
    expect(scanSignal(line({ msg: "normal" }))).toBeNull();
  });
});

describe("collapseStack", () => {
  it("连续堆栈帧折叠为首帧+计数", () => {
    const lines = [
      line({ msg: "Exception" }),
      line({ msg: "at a()" }),
      line({ msg: "at b()" }),
      line({ msg: "at c()" }),
      line({ msg: "next" }),
      line({ msg: "at d()" }),
    ];
    const rows = collapseStack(lines);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({ collapsedAfter: 2 });
    expect(rows[2]!.line.msg).toBe("next");
  });
});

describe("RingMirror 共享缓冲镜像", () => {
  it("seq 去重与容量环形", () => {
    const m = new RingMirror(3);
    expect(
      m.pushBatch({ serial: "s", from_seq: 0, truncated: false, lines: [line({ seq: 0 }), line({ seq: 1 })] }),
    ).toBe(2);
    // 重复重放去重
    expect(
      m.pushBatch({ serial: "s", from_seq: 1, truncated: false, lines: [line({ seq: 1 }), line({ seq: 2 })] }),
    ).toBe(1);
    expect(m.pushBatch({ serial: "s", from_seq: 0, truncated: false, lines: [line({ seq: 3 }), line({ seq: 4 })] })).toBe(2);
    expect(m.size()).toBe(3);
    expect(m.lastSeqNumber()).toBe(4);
  });

  it("过滤重放取尾部 limit 条", () => {
    const m = new RingMirror(10);
    m.pushBatch({
      serial: "s",
      from_seq: 0,
      truncated: false,
      lines: [0, 1, 2, 3, 4].map((seq) => line({ seq, level: seq % 2 === 0 ? "E" : "I" })),
    });
    const out = m.replay((l) => l.level === "E", 2);
    expect(out.map((l) => l.seq)).toEqual([2, 4]);
  });
});
