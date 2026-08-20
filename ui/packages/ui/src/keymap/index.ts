/**
 * 面板快捷键（L1 共享能力）。
 * 页面只提供绑定表与 onAction。host 模式可绑 window，仍走本模块，不要手写第二套监听。
 *
 * L0 target → L1 chord → L2 selection → L3 scope/bindings → L4 attach
 */

export { elementOf, isActionableTarget, isEditableTarget, isInside, isShellTarget } from "./target";
export { eventKey, isModKey, matchesChord } from "./chord";
export type { KeyChord } from "./chord";
export { adjacentJoin, allKeys, nextKeys, pointerSelectMode } from "./selection";
export type { SelectJoin, SelectMode } from "./selection";
export { panelKeyContext, whenIdle, whenList, whenPanel, whenPanelOrField } from "./scope";
export type { PanelKeyContext, PanelKeyOwnership, PanelScopeOptions } from "./scope";
export { matchBindings } from "./bindings";
export type { KeyBinding } from "./bindings";
export { attachPanelKeys } from "./attach";
export type { PanelKeyHost } from "./attach";
