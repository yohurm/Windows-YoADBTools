/**
 * 契约测试：@yovo/api 的类型/字段名与 core/yovo-protocol 的 serde 输出对齐。
 * fixture 与 Rust 侧 `yovo-protocol` 各类型 serde_json 序列化结果保持一致。
 */

import { describe, expect, it } from "vitest";

import type { AppEvent, LogFilter, LogLine, RemoteEntry, TransferRequest } from "./types";

describe("wire 契约：与 yovo-protocol serde 输出一致", () => {
  it("LogLine 字段为 snake_case", () => {
    const line: LogLine = {
      seq: 1,
      ts: "01-02 03:04:05.678",
      pid: 1234,
      tid: 5678,
      level: "I",
      tag: "T",
      msg: "m",
    };
    expect(JSON.parse(JSON.stringify(line))).toEqual({
      seq: 1,
      ts: "01-02 03:04:05.678",
      pid: 1234,
      tid: 5678,
      level: "I",
      tag: "T",
      msg: "m",
    });
  });

  it("LogLine.uid 缺省时不出现在 JSON", () => {
    const withUid: LogLine = {
      seq: 1,
      ts: "01-02 03:04:05.678",
      pid: 1234,
      tid: 5678,
      uid: 1000,
      level: "I",
      tag: "T",
      msg: "m",
    };
    expect(JSON.parse(JSON.stringify(withUid)).uid).toBe(1000);
  });

  it("LogFilter.scope 内部 tag 为 camelCase kind", () => {
    const filter: LogFilter = {
      min_level: "W",
      scope: { kind: "package", pids: [1, 2] },
    };
    expect(JSON.parse(JSON.stringify(filter))).toEqual({
      min_level: "W",
      scope: { kind: "package", pids: [1, 2] },
    });
  });

  it("RemoteEntry 枚举为 lowercase", () => {
    const entry: RemoteEntry = {
      name: "DCIM",
      kind: "dir",
      size: 4096,
      permission: "drwxr-xr-x",
    };
    expect(JSON.stringify(entry)).toContain('"kind":"dir"');
  });

  it("AppEvent 内部 tag 为 camelCase kind", () => {
    const event: AppEvent = {
      kind: "logOverflow",
      serial: "s1",
      dropped_batches: 2,
    };
    expect(JSON.parse(JSON.stringify(event))).toEqual({
      kind: "logOverflow",
      serial: "s1",
      dropped_batches: 2,
    });
  });

  it("processIndex 事件负载与新类型变体平铺一致", () => {
    const event: AppEvent = {
      kind: "processIndex",
      serial: "s1",
      entries: [{ pid: 123, name: "com.foo" }],
      degraded: false,
    };
    expect(JSON.parse(JSON.stringify(event))).toEqual({
      kind: "processIndex",
      serial: "s1",
      entries: [{ pid: 123, name: "com.foo" }],
      degraded: false,
    });
  });

  it("TransferRequest 无 id/direction", () => {
    const req: TransferRequest = { serial: "S", local: "C:/a.bin", remote: "/sdcard/a.bin" };
    expect(JSON.parse(JSON.stringify(req))).toEqual({
      serial: "S",
      local: "C:/a.bin",
      remote: "/sdcard/a.bin",
    });
  });
});
