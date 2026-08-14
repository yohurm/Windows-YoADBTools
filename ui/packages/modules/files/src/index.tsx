/**
 * 文件管理模块（S1 骨架占位；S3 交付浏览/传输全功能）。
 */

import { registerModule } from "@yovo/app";
import { YEmptyState } from "@yovo/ui";

registerModule({
  id: "file-manager",
  title: "文件管理",
  icon: "folder",
  selectionMode: "singleRequired",
  Component: () => (
    <YEmptyState
      icon="folder"
      title="文件管理"
      description="S3 阶段交付：设备文件浏览 / push/pull 传输 / 删除 / 新建目录"
    />
  ),
});
