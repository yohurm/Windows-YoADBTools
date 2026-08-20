/**
 * L3 绑定表：和弦 + when → 动作 id。先匹配先生效（把更具体的写在前面）。
 */

import { matchesChord, type KeyChord } from "./chord";
import type { PanelKeyContext } from "./scope";

export interface KeyBinding<A extends string> extends KeyChord {
  action: A;
  when: (ctx: PanelKeyContext) => boolean;
}

export function matchBindings<A extends string>(
  event: KeyboardEvent,
  ctx: PanelKeyContext,
  bindings: readonly KeyBinding<A>[],
): A | null {
  for (const binding of bindings) {
    if (!matchesChord(event, binding)) continue;
    if (!binding.when(ctx)) continue;
    return binding.action;
  }
  return null;
}
