/**
 * 文件管理模块（S3）：设备文件浏览 / push-pull 传输 / 删除 / 新建目录。
 * 只导出 descriptor；注册由 apps/shell 完成（模块不依赖 @yohu/workbench）。
 */

import { ModuleId } from "@yohu/api";

import { FileView } from "./FileView";

export const descriptor = {
  id: ModuleId.Files,
  title: "文件管理",
  icon: "folder" as const,
  selectionMode: "singleRequired" as const,
  Component: FileView,
};
