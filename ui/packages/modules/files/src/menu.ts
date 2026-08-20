/**
 * 文件页右键场景表。动作经 ctx 注入，本文件不碰 fileStore。
 */

import { defineContextMenu } from "@yohu/ui";

export type FilesListMenuAction = "new-file" | "new-dir" | "download" | "copy" | "delete";

export interface FilesListMenuCtx {
  canDownload: boolean;
  canDelete: boolean;
  canCopy: boolean;
  newFile: () => void;
  newDir: () => void;
  download: () => void;
  copy: () => void;
  remove: () => void;
}

export const filesListMenu = defineContextMenu<FilesListMenuCtx, FilesListMenuAction>({
  id: "files.list",
  items: (ctx) => [
    { id: "new-file", label: "新建文件" },
    { id: "new-dir", label: "新建目录" },
    { id: "download", label: "下载", disabled: !ctx.canDownload },
    { id: "copy", label: "复制路径", disabled: !ctx.canCopy },
    { id: "delete", label: "删除", danger: true, disabled: !ctx.canDelete },
  ],
  onSelect: (id, ctx) => {
    switch (id) {
      case "new-file":
        ctx.newFile();
        return;
      case "new-dir":
        ctx.newDir();
        return;
      case "download":
        ctx.download();
        return;
      case "copy":
        ctx.copy();
        return;
      case "delete":
        ctx.remove();
        return;
      default: {
        const _gone: never = id;
        return _gone;
      }
    }
  },
});
