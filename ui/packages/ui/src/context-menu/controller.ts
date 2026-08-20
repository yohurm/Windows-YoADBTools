/**
 * L3 会话：全局同时只开一个菜单（后开覆盖先开）。
 * 与 keymap 一样，页面只提供场景表；开/关/夹紧由本模块负责。
 */

import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";

import { readViewport } from "../components/popover-place";
import { clampContextMenuPoint } from "./place";
import type { ContextMenuRequest, ContextMenuScene, ContextMenuSession } from "./types";

export interface ContextMenuController {
  session: Accessor<ContextMenuSession | null>;
  open: <Ctx, Action extends string>(
    scene: ContextMenuScene<Ctx, Action>,
    request: ContextMenuRequest<Ctx>,
  ) => void;
  close: () => void;
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

  return { session, open, close };
}

/** 壳挂载的默认实例。测试可另 create，避免污染。 */
export const contextMenu = createContextMenuController();

export const openContextMenu: ContextMenuController["open"] = (scene, request) => {
  contextMenu.open(scene, request);
};

export const closeContextMenu = (): void => {
  contextMenu.close();
};
