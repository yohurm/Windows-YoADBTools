import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";
import { matchBindings, type PanelKeyContext } from "@yohu/ui";

import { copyLogText, formatLogLine, LOGS_KEY_BINDINGS } from "./keys";
import type { ViewRow } from "./pipeline";

function keyEvent(init: Pick<KeyboardEventInit, "key" | "ctrlKey">): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

function line(over: Partial<LogLine> = {}): LogLine {
  return {
    seq: 1,
    ts: "01-01 12:00:00.000",
    pid: 100,
    tid: 200,
    level: "I",
    tag: "Yohu",
    msg: "hello",
    ...over,
  };
}

describe("LOGS_KEY_BINDINGS", () => {
  const ctx = (over: Partial<PanelKeyContext> = {}): PanelKeyContext => ({
    inPanel: true,
    inList: false,
    inEditable: false,
    inDialog: false,
    inShell: false,
    inActionable: false,
    ...over,
  });
  const list = ctx({ inList: true });
  const field = ctx({ inEditable: true });
  const chrome = ctx();
  const button = ctx({ inActionable: true });
  const rail = ctx({ inShell: true });

  it("本页默认操作日志：铬上 Ctrl+A/C/Space；过滤框 Ctrl+F 且放行 Ctrl+A；Space 不抢按钮/侧栏", () => {
    expect(matchBindings(keyEvent({ key: " " }), list, LOGS_KEY_BINDINGS)).toBe("pause");
    expect(matchBindings(keyEvent({ key: " " }), chrome, LOGS_KEY_BINDINGS)).toBe("pause");
    expect(matchBindings(keyEvent({ key: " " }), button, LOGS_KEY_BINDINGS)).toBeNull();
    expect(matchBindings(keyEvent({ key: " " }), rail, LOGS_KEY_BINDINGS)).toBeNull();
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), chrome, LOGS_KEY_BINDINGS)).toBe("select-all");
    expect(matchBindings(keyEvent({ key: "c", ctrlKey: true }), chrome, LOGS_KEY_BINDINGS)).toBe("copy");
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), field, LOGS_KEY_BINDINGS)).toBeNull();
    expect(matchBindings(keyEvent({ key: "f", ctrlKey: true }), field, LOGS_KEY_BINDINGS)).toBe("find");
    expect(matchBindings(keyEvent({ key: "l", ctrlKey: true }), chrome, LOGS_KEY_BINDINGS)).toBe("clear");
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), rail, LOGS_KEY_BINDINGS)).toBe("select-all");
  });
});

describe("copyLogText", () => {
  it("只拼选中行的列对齐文本", () => {
    const rows: ViewRow[] = [{ line: line({ seq: 1, msg: "one" }) }, { line: line({ seq: 2, pid: 101, msg: "two" }) }];
    const keyOf = (row: ViewRow): string => `${row.line.seq}`;
    expect(copyLogText(rows, new Set(["2"]), keyOf)).toBe(formatLogLine(rows[1]!.line));
  });

  it("含 UID 名的行按列对齐，解析失败行原样", () => {
    expect(formatLogLine(line({ uid: "shell", pid: 1705, tid: 1705, level: "W", tag: "binder", msg: "avc" }))).toContain(
      "shell",
    );
    expect(formatLogLine(line({ level: "?", ts: "", pid: 0, msg: "not a logcat line" }))).toBe("not a logcat line");
  });
});
