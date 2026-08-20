/**
 * L3 面板作用域：inPanel / inList / inEditable / inDialog / inShell / inActionable。
 *
 * ownership:
 * - contains：焦点必须在传入根内（文件页）
 * - host：监听挂着即视为本页（日志页默认操作日志内容；切走模块即卸监听）
 */

import { elementOf, isActionableTarget, isEditableTarget, isInside, isShellTarget } from "./target";

export interface PanelKeyContext {
  inPanel: boolean;
  inList: boolean;
  inEditable: boolean;
  inDialog: boolean;
  inShell: boolean;
  inActionable: boolean;
}

export type PanelKeyOwnership = "contains" | "host";

export interface PanelScopeOptions {
  listSelector: string;
  dialogSelector?: string;
  shellSelector?: string;
  /** 默认 contains */
  ownership?: PanelKeyOwnership;
}

const DEFAULT_DIALOG = ".yohu-dialog";

export function panelKeyContext(
  root: Element | null | undefined,
  target: EventTarget | null,
  options: PanelScopeOptions,
): PanelKeyContext {
  const el = elementOf(target);
  const inPanel = options.ownership === "host" ? true : isInside(root, target);
  const dialogSelector = options.dialogSelector ?? DEFAULT_DIALOG;
  return {
    inPanel,
    inList: inPanel && el !== null && el.closest(options.listSelector) !== null,
    inEditable: isEditableTarget(target),
    inDialog: el !== null && el.closest(dialogSelector) !== null,
    inShell: isShellTarget(target, options.shellSelector),
    inActionable: isActionableTarget(target),
  };
}

export function whenList(ctx: PanelKeyContext): boolean {
  return ctx.inPanel && ctx.inList && !ctx.inEditable && !ctx.inDialog;
}

/** 本页默认：对内容操作。输入框与对话框除外。 */
export function whenPanel(ctx: PanelKeyContext): boolean {
  return ctx.inPanel && !ctx.inEditable && !ctx.inDialog;
}

/** Space 等会激活控件的键：侧栏/按钮/页签自己消化。 */
export function whenIdle(ctx: PanelKeyContext): boolean {
  return whenPanel(ctx) && !ctx.inShell && !ctx.inActionable;
}

/** 过滤框里仍要生效的面板命令（如 Ctrl+F）。 */
export function whenPanelOrField(ctx: PanelKeyContext): boolean {
  return ctx.inPanel && !ctx.inDialog;
}
