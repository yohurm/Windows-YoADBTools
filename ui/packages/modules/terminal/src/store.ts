/**
 * 终端模块 store：命令库状态 + 执行结果流。
 * 填充与多设备并行在 domain（terminal.eval）；此处只展示。
 * 执行目标 serials 由壳按 SelectionMode 注入，禁止再扫全部在线设备。
 */

import { createStore } from "solid-js/store";

import {
  COMMAND_LIBRARY_SCHEMA_VERSION,
  commandlibLoad,
  commandlibSave,
  groupCancel,
  groupRun,
  onGroupProgress,
  terminalEval,
  YoLog,
} from "@yohu/api";
import type { CommandDto, CommandGroupDto, CommandLibraryDto } from "@yohu/api";

/** 命令是否需要占位符填值（与 core 组编排一致；UI 侧仅用于拦截提示，不做填值校验）。 */
export function commandNeedsInput(cmd: CommandDto): boolean {
  return cmd.inputs.length > 0;
}

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
let activeGroupRun: number | null = null;

const nowText = (): string => new Date().toLocaleTimeString("zh-CN", { hour12: false });

export function createTerminalStore() {
  const [library, setLibrary] = createStore<CommandLibraryDto>({
    schema_version: COMMAND_LIBRARY_SCHEMA_VERSION,
    groups: [],
  });
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

  /** 执行单命令：IPC 一次带全部 serials，填充与并行在 core。 */
  async function runCommand(serials: string[], command: CommandDto, values: string[]): Promise<void> {
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
    try {
      YoLog.info("terminal", "执行命令", { command: command.name, serials });
      const rows = await terminalEval({
        command_id: command.id,
        values,
        serials,
      });
      YoLog.info("terminal", "执行完成", { command: command.name, serials, ok: rows.filter((r) => r.ok).length });
      for (const row of rows) {
        push({
          kind: "command",
          serial: row.serial,
          title: command.name,
          ok: row.ok,
          message: row.message,
          stdout: row.stdout,
          durationMs: row.duration_ms,
        });
      }
    } catch (e) {
      YoLog.error("terminal", "执行失败", { command: command.name, error: String(e) });
      push({
        kind: "command",
        serial: "-",
        title: command.name,
        ok: false,
        message: String(e),
        stdout: "",
      });
    }
  }

  /** 执行命令组（进度经 group.progress 事件回流为结果条目）。 */
  async function runGroup(serials: string[], group: CommandGroupDto): Promise<void> {
    const needing = group.commands.find(commandNeedsInput);
    if (needing) {
      push({
        kind: "group",
        serial: "-",
        title: `组: ${group.name}`,
        ok: false,
        message: `命令组含需填值的命令（${needing.name}），请逐条执行`,
        stdout: "",
      });
      return;
    }
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
      activeGroupRun = await groupRun({ group_id: group.id, serials });
    } catch (e) {
      activeGroupRun = null;
      push({ kind: "group", serial: "-", title: `组: ${group.name}`, ok: false, message: String(e), stdout: "" });
    }
  }

  async function cancelGroup(): Promise<void> {
    const runId = activeGroupRun;
    if (runId === null) return;
    try {
      await groupCancel(runId);
    } finally {
      activeGroupRun = null;
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
    cancelGroup,
    clearResults,
  };
}

export type TerminalStoreApi = ReturnType<typeof createTerminalStore>;

export const terminalStore = createTerminalStore();
