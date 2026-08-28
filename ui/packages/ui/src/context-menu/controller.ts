/**
 * L3 会话：全局同时只开一个菜单（后开覆盖先开）。
 * 与 keymap 一样，页面只提供场景表；开/关/夹紧由本模块负责。
 */

import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";

import { readViewport } from "../components/popover-place";
import { clampContextMenuPoint, clampToRect } from "./place";
import type { ContextMenuRequest, ContextMenuScene, ContextMenuSession } from "./types";

export interface ContextMenuController {
  session: Accessor<ContextMenuSession | null>;
  open: <Ctx, Action extends string>(
    scene: ContextMenuScene<Ctx, Action>,
    request: ContextMenuRequest<Ctx>,
  ) => void;
  close: () => void;
  /** 菜单挂载后按实测尺寸二次夹紧；id 不匹配或已关闭则忽略。 */
  refine: (id: string, size: { width: number; height: number }) => void;
}

export function defineContextMenu<Ctx, Action extends string>(
  scene: ContextMenuScene<Ctx, Action>,
): ContextMenuScene<Ctx, Action> {
  if (scene.id.trim().length === 0) {
    throw new Error("context menu scene id required");
  }
  return scene;
}

export function createContextMenuController(): ContextMenuController {
  const [session, setSession] = createSignal<ContextMenuSession | null>(null);

  const close = (): void => {
    setSession(null);
  };

  const refine = (id: string, size: { width: number; height: number }): void => {
    const s = session();
    if (!s || s.id !== id) return;
    const point = clampToRect(s.x, s.y, size, readViewport());
    // 位置确变才重建会话，避免无谓重渲染
    if (point.x === s.x && point.y === s.y) return;
    setSession({ ...s, x: point.x, y: point.y });
  };

  const open = <Ctx, Action extends string>(
    scene: ContextMenuScene<Ctx, Action>,
    request: ContextMenuRequest<Ctx>,
  ): void => {
    const items = [...scene.items(request.ctx)];
    const point = clampContextMenuPoint(request.x, request.y, items.length, readViewport());
    const ctx = request.ctx;
    setSession({
      id: scene.id,
      x: point.x,
      y: point.y,
      items,
      select: (id) => scene.onSelect(id as Action, ctx),
    });
  };

  return { session, open, close, refine };
}

/**
 * 壳挂载的默认实例。测试可另 create，避免污染。
 *
 * @internal 壳体专用：仅被 `openContextMenu` / `closeContextMenu` 薄转发与 `YoContextMenuHost`
 * 内部读取；页面/模块不应依赖可变单例本体，换取实例直接用工厂 `createContextMenuController`。
 */
export const contextMenu = createContextMenuController();

export const openContextMenu: ContextMenuController["open"] = (scene, request) => {
  contextMenu.open(scene, request);
};

export const closeContextMenu = (): void => {
  contextMenu.close();
};
