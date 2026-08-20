/**
 * 终端模块 store：命令库状态 + 执行结果流（ADR-v6-009：判定在 core，此处只展示）。
 * 执行目标 serials 由壳按 SelectionMode 注入，禁止再扫全部在线设备。
 */

import { createStore } from "solid-js/store";

import {
  commandlibLoad,
  commandlibSave,
  groupRun,
  onGroupProgress,
  terminalEval,
} from "@yohu/api";
import type { CommandDto, CommandGroupDto, CommandLibraryDto } from "@yohu/api";

/** 一条执行结果（命令或组内命令）。 */
export interface ResultEntry {
  id: number;
  kind: "command" | "group";
  serial: string;
  title: string;
  ok: boolean;
  message: string;
  stdout: string;
  time: string;
  /** 执行用时（毫秒；无则显示 —） */
  durationMs?: number;
}

let nextId = 1;

const nowText = (): string => new Date().toLocaleTimeString("zh-CN", { hour12: false });

/** 占位符填充（纯函数，可单测）：`{0}{1}` 按序替换。 */
export function fillPlaceholders(template: string, values: string[]): string {
  let out = template;
  values.forEach((value, index) => {
    out = out.split(`{${index}}`).join(value);
  });
  return out;
}

export function createTerminalStore() {
  const [library, setLibrary] = createStore<CommandLibraryDto>({ schema_version: 2, groups: [] });
  const [results, setResults] = createStore<ResultEntry[]>([]);

  function push(entry: Omit<ResultEntry, "id" | "time">): void {
    setResults((r) => [...r, { ...entry, id: nextId++, time: nowText() }]);
  }

  async function load(): Promise<void> {
    setLibrary(await commandlibLoad());
  }

  /** 全量提交（校验在 core；取消零污染由编辑方深拷贝保证）。 */
  async function save(dto: CommandLibraryDto): Promise<void> {
    await commandlibSave(dto);
    setLibrary(dto);
  }

  /** 执行单命令：对注入的目标 serials 并行（每设备一条结果）。 */
  async function runCommand(serials: string[], command: CommandDto, values: string[]): Promise<void> {
    const filled: CommandDto = { ...command, template: fillPlaceholders(command.template, values) };
    if (serials.length === 0) {
      push({
        kind: "command",
        serial: "-",
        title: command.name,
        ok: false,
        message: "未选择在线设备",
        stdout: "",
      });
      return;
    }
    await Promise.all(
      serials.map(async (serial) => {
        try {
          const r = await terminalEval(serial, filled);
          push({
            kind: "command",
            serial,
            title: command.name,
            ok: r.ok,
            message: r.message,
            stdout: r.stdout,
            durationMs: r.duration_ms,
          });
        } catch (e) {
          push({ kind: "command", serial, title: command.name, ok: false, message: String(e), stdout: "" });
        }
      }),
    );
  }

  /** 执行命令组（进度经 group.progress 事件回流为结果条目）。 */
  async function runGroup(serials: string[], group: CommandGroupDto): Promise<void> {
    if (serials.length === 0) {
      push({
        kind: "group",
        serial: "-",
        title: `组: ${group.name}`,
        ok: false,
        message: "未选择在线设备",
        stdout: "",
      });
      return;
    }
    try {
      await groupRun({ group_id: group.id, serials });
    } catch (e) {
      push({ kind: "group", serial: "-", title: `组: ${group.name}`, ok: false, message: String(e), stdout: "" });
    }
  }

  void onGroupProgress((e) => {
    push({
      kind: "group",
      serial: e.serial,
      title: e.name ?? "组内命令",
      ok: e.ok,
      message: e.ok ? "" : (e.message ?? ""),
      stdout: e.message ?? "",
      durationMs: e.duration_ms,
    });
  });

  /** 清屏：只清 UI 结果面板（不落盘、不影响命令库）。 */
  function clearResults(): void {
    setResults([]);
  }

  return {
    library,
    results,
    load,
    save,
    runCommand,
    runGroup,
    clearResults,
  };
}

/** 模块级单例（与壳 store 同生命周期）。 */
export const terminalStore = createTerminalStore();
