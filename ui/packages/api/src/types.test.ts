/**
 * 契约测试：@yohu/api 的类型/字段名与 core/yohu-protocol 的 serde 输出对齐。
 * fixture 与 Rust 侧 `yohu-protocol` 各类型 serde_json 序列化结果保持一致。
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COMMAND_LIBRARY_SCHEMA_VERSION, DEFAULT_BROWSE_ROOT, SAFETY_ROOTS } from "./identity";
import { APP_SETTINGS_DEFAULT } from "./settings-defaults";
import { EVENT_NAMES, type AppEvent, type EvalResult, type LogDisplayColumns, type LogFilter, type LogLine, type RemoteEntry, type RemoteUpdate, type TransferRequest, type UpdateChannelInfo } from "./types";

describe("wire 契约：与 yohu-protocol serde 输出一致", () => {
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
      uid: "1000",
      level: "I",
      tag: "T",
      msg: "m",
    };
    expect(JSON.parse(JSON.stringify(withUid)).uid).toBe("1000");
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

  it("EvalResult 字段为 snake_case", () => {
    const result: EvalResult = {
      ok: false,
      message: "退出码 1",
      exit_code: 1,
      stdout: "out",
      stderr: "err",
      duration_ms: 12,
    };
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      ok: false,
      message: "退出码 1",
      exit_code: 1,
      stdout: "out",
      stderr: "err",
      duration_ms: 12,
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

  it("captureState 事件含 generation", () => {
    const event: AppEvent = {
      kind: "captureState",
      serial: "s1",
      generation: 3,
      state: "running",
    };
    expect(JSON.parse(JSON.stringify(event))).toEqual({
      kind: "captureState",
      serial: "s1",
      generation: 3,
      state: "running",
    });
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

  it("DragOutRequest 为 serial + remotes", () => {
    const req = { serial: "S", remotes: ["/sdcard/a.txt", "/sdcard/DCIM"] };
    expect(JSON.parse(JSON.stringify(req))).toEqual({
      serial: "S",
      remotes: ["/sdcard/a.txt", "/sdcard/DCIM"],
    });
  });

  it("LogDisplayColumns 字段为 snake_case 布尔开关", () => {
    const cols: LogDisplayColumns = { ts: true, uid: false, pid: true, tid: true, level: true, tag: false };
    expect(JSON.parse(JSON.stringify(cols))).toEqual({
      ts: true,
      uid: false,
      pid: true,
      tid: true,
      level: true,
      tag: false,
    });
  });

  it("settingsChanged 事件携带全量 settings 快照", () => {
    const event: AppEvent = {
      kind: "settingsChanged",
      key: "buffer_capacity",
      settings: {
        adb_path: "",
        data_root: "",
        devices_auto_refresh: 0,
        buffer_capacity: 50,
        clear_device_on_start: true,
        theme: "system",
        density: "comfortable",
        export_default_path: "",
        export_ask_every_time: true,
        export_write_mode: "overwrite",
        log_display_columns: { ts: true, uid: false, pid: true, tid: true, level: true, tag: true },
        update_provider: "gitcode",
        mirror_max_size: 1024,
        mirror_video_bit_rate: 2_000_000,
        mirror_max_fps: 30,
        mirror_force_forward: false,
      },
    };
    expect(JSON.parse(JSON.stringify(event)).settings.buffer_capacity).toBe(50);
  });

  it("SAFETY_ROOTS 与 yohu-protocol::safety_root 对齐", () => {
    expect([...SAFETY_ROOTS]).toEqual(["/sdcard", "/storage"]);
  });

  it("AppIdentity / AppPathCatalog 字段为 snake_case", () => {
    const identity = {
      name: "YohuAdbTools",
      display_name: "Yohu ADB Tools",
      identifier: "com.yohu.adbtools",
      version: "0.1.0",
      description: "设备工具工作台",
      copyright: "© 2026 Yohu",
    };
    expect(JSON.parse(JSON.stringify(identity))).toEqual(identity);
    const paths = {
      local_root: "C:/Local/YohuAdbTools",
      settings_dir: "C:/Local/YohuAdbTools/settings",
      settings_file: "C:/Local/YohuAdbTools/settings/settings.json",
      logs_dir: "C:/Local/YohuAdbTools/logs",
      data_root: "C:/Local/YohuAdbTools/data",
      adb_tools_dir: "C:/Local/YohuAdbTools/data/tools/adb",
      library_file: "C:/Local/YohuAdbTools/data/modules/adb-terminal/config/library.json",
      exports_dir: "C:/Local/YohuAdbTools/data/modules/log-analyzer/exports",
      drag_out_dir: "C:/Local/YohuAdbTools/data/modules/file-manager/drag-out",
    };
    expect(JSON.parse(JSON.stringify(paths))).toEqual(paths);
  });

  it("RemoteUpdate 字段为 snake_case", () => {
    const update: RemoteUpdate = {
      has_new_version: true,
      version: "1.2.0",
      version_code: 12,
      description: "fix",
      download_url: "https://example.com/setup.exe",
      force_update: false,
      md5: "m",
      sha256: "s",
      size_bytes: 100,
    };
    expect(JSON.parse(JSON.stringify(update))).toEqual(update);
  });

  it("UpdateChannelInfo 字段为 snake_case", () => {
    const info: UpdateChannelInfo = {
      provider: "gitcode",
      remote: "yohurm/ReleaseYoADBTools",
      page_url: "https://gitcode.com/yohurm/ReleaseYoADBTools",
    };
    expect(JSON.parse(JSON.stringify(info))).toEqual(info);
  });

  it("APP_SETTINGS_DEFAULT 与 protocol testdata 对齐", () => {
    const fixturePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../core/yohu-protocol/testdata/app_settings_default.json",
    );
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as typeof APP_SETTINGS_DEFAULT;
    expect(APP_SETTINGS_DEFAULT).toEqual(fixture);
    expect(COMMAND_LIBRARY_SCHEMA_VERSION).toBe(2);
    expect(DEFAULT_BROWSE_ROOT).toBe(SAFETY_ROOTS[0]);
  });

  it("TerminalEvalRequest 字段为 snake_case", () => {
    const req = { command_id: "c1", values: ["a"], serials: ["S"] };
    expect(JSON.parse(JSON.stringify(req))).toEqual(req);
  });

  it("事件名不含点号（Tauri 2.9 emit/listen 约束）", () => {
    for (const name of Object.values(EVENT_NAMES)) {
      expect(name).not.toContain(".");
      expect(name).toMatch(/^[-A-Za-z0-9_/:]+$/);
    }
    expect(EVENT_NAMES.mirrorState).toBe("mirror/state");
    expect(EVENT_NAMES.devicesChanged).toBe("devices/changed");
  });
});
