/**
 * 右键菜单（L1 共享能力）。
 * 页面只提供场景表（defineContextMenu）与 open 时的 ctx。
 * 壳挂载唯一 YoContextMenuHost；禁止模块再渲染 YoContextMenu。
 *
 * L0 呈现 → L1 条目 → L2 场景 → L3 会话 → L4 宿主
 */

export type {
  ContextMenuRequest,
  ContextMenuScene,
  ContextMenuSession,
  YoMenuItem,
} from "./types";
export { clampContextMenuPoint, clampToRect, estimateContextMenuHeight } from "./place";
export {
  closeContextMenu,
  createContextMenuController,
  defineContextMenu,
  openContextMenu,
} from "./controller";
export type { ContextMenuController } from "./controller";
export { YoContextMenuHost } from "./host";
export type { YoContextMenuHostProps } from "./host";
