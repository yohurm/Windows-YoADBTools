/**
 * YoLog — 应用操作日志（ADR-v6-010，与设备 logcat 分离）。
 * 浏览器控制台立即可见；同时 `system.log` 写入 Rust tracing（logs/app-*.log）。
 */

import { invoke } from "@tauri-apps/api/core";

export type YoLogLevel = "info" | "warn" | "error";

function extraText(extra: unknown): string {
  if (extra === undefined) return "";
  if (typeof extra === "string") return ` ${extra}`;
  try {
    return ` ${JSON.stringify(extra)}`;
  } catch {
    return ` ${String(extra)}`;
  }
}

function write(level: YoLogLevel, module: string, message: string, extra?: unknown): void {
  const text = `${message}${extraText(extra)}`;
  const line = `[${module}] ${text}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
  void invoke("system.log", { level, module, message: text }).catch(() => {
    /* 启动早期或非 Tauri 环境：控制台已有一份 */
  });
}

/** 关键路径打点：终端 / 文件 / 日志 / 投屏 / 壳。 */
export const YoLog = {
  info: (module: string, message: string, extra?: unknown) => write("info", module, message, extra),
  warn: (module: string, message: string, extra?: unknown) => write("warn", module, message, extra),
  error: (module: string, message: string, extra?: unknown) => write("error", module, message, extra),
};
