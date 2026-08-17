/**
 * 终端模块 store：命令库状态 + 执行结果流（ADR-v6-009：判定在 core，此处只展示）。
 */

import { createStore } from "solid-js/store";

import {
  commandlibLoad,
  commandlibSave,
  groupRun,
  onGroupProgress,
  terminalEval,
} from "@yovo/api";
import type { CommandDto, CommandGroupDto, CommandLibraryDto } from "@yovo/api";
import { deviceStore } from "@yovo/app";

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

  const onlineSerials = (): string[] =>
    deviceStore.state.devices.filter((d) => d.state === "online").map((d) => d.serial);

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

  /** 执行单命令：多设备并行（每设备一条结果）。 */
  async function runCommand(command: CommandDto, values: string[]): Promise<void> {
    const filled: CommandDto = { ...command, template: fillPlaceholders(command.template, values) };
    const serials = onlineSerials();
    if (serials.length === 0) {
      push({ kind: "command", serial: "-", title: command.name, ok: false, message: "无在线设备", stdout: "" });
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
  async function runGroup(group: CommandGroupDto): Promise<void> {
    const serials = onlineSerials();
    if (serials.length === 0) {
      push({ kind: "group", serial: "-", title: `组: ${group.name}`, ok: false, message: "无在线设备", stdout: "" });
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
      message: e.message ?? "",
      stdout: "",
      durationMs: e.duration_ms,
    });
  });

  return {
    library,
    results,
    load,
    save,
    runCommand,
    runGroup,
    onlineCount: onlineSerials,
  };
}

/** 模块级单例（与壳 store 同生命周期）。 */
export const terminalStore = createTerminalStore();
