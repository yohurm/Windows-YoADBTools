/**
 * 日志分析模块（S4）：多会话 Tab / AS 风格过滤栏 / 虚拟化列表 / 进程索引 / 导出。
 */

import { registerModule } from "@yohu/app";

import { LogAnalyzerView } from "./LogAnalyzerView";

registerModule({
  id: "log-analyzer",
  title: "日志分析",
  icon: "log",
  selectionMode: "multiOptional",
  Component: LogAnalyzerView,
});
