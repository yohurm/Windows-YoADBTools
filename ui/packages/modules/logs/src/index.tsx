/**
 * 日志分析模块（S4）：多会话 Tab / AS 风格过滤栏 / 虚拟化列表 / 进程索引 / 导出。
 * 只导出 descriptor；注册由 apps/shell 完成（模块不依赖 @yohu/app）。
 */

import { ModuleId } from "@yohu/api";

import { LogAnalyzerView } from "./LogAnalyzerView";

export const descriptor = {
  id: ModuleId.Logs,
  title: "日志分析",
  icon: "log" as const,
  selectionMode: "singleRequired" as const,
  Component: LogAnalyzerView,
};
