/**
 * 文件管理模块（S3）：设备文件浏览 / push-pull 传输 / 删除 / 新建目录。
 */

import { registerModule } from "@yohu/app";

import { FileView } from "./FileView";

registerModule({
  id: "file-manager",
  title: "文件管理",
  icon: "folder",
  selectionMode: "singleRequired",
  Component: FileView,
});
