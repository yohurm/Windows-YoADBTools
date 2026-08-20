/**
 * L4 宿主：捕获 keydown。
 * contains：绑在面板根。host：绑在 window，模块挂载期间本页拥有内容快捷键。
 */

import { matchBindings, type KeyBinding } from "./bindings";
import { panelKeyContext, type PanelScopeOptions } from "./scope";

export interface PanelKeyHost<A extends string> extends PanelScopeOptions {
  bindings: readonly KeyBinding<A>[];
  onAction: (action: A, event: KeyboardEvent) => void;
}

export function attachPanelKeys<A extends string>(root: EventTarget, host: PanelKeyHost<A>): () => void {
  const scopeRoot = root instanceof Element ? root : undefined;
  const onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) return;
    const ctx = panelKeyContext(scopeRoot, event.target, host);
    const action = matchBindings(event, ctx, host.bindings);
    if (action === null) return;
    event.preventDefault();
    event.stopPropagation();
    host.onAction(action, event);
  };
  root.addEventListener("keydown", onKeyDown, true);
  return () => root.removeEventListener("keydown", onKeyDown, true);
}
