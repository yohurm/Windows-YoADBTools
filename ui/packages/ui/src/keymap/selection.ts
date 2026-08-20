/**
 * L2 选区代数：listbox 的 replace / toggle / range / all。
 * 只操作 key 序列，不碰 DOM。
 */

export type SelectMode = "replace" | "toggle" | "range";

export function pointerSelectMode(event?: MouseEvent | KeyboardEvent): SelectMode {
  if (event && "shiftKey" in event && event.shiftKey) return "range";
  if (event && ("ctrlKey" in event || "metaKey" in event) && (event.ctrlKey || event.metaKey)) {
    return "toggle";
  }
  return "replace";
}

export function nextKeys(
  ordered: readonly string[],
  current: ReadonlySet<string>,
  pivot: string | null,
  clicked: string,
  mode: SelectMode,
): { keys: Set<string>; pivot: string } {
  if (mode === "toggle") {
    const keys = new Set(current);
    if (keys.has(clicked)) keys.delete(clicked);
    else keys.add(clicked);
    return { keys, pivot: clicked };
  }
  if (mode === "range" && pivot !== null) {
    const from = ordered.indexOf(pivot);
    const to = ordered.indexOf(clicked);
    if (from >= 0 && to >= 0) {
      const [a, b] = from < to ? [from, to] : [to, from];
      return { keys: new Set(ordered.slice(a, b + 1)), pivot };
    }
  }
  return { keys: new Set([clicked]), pivot: clicked };
}

export function allKeys(ordered: readonly string[]): Set<string> {
  return new Set(ordered);
}

/** 连续选中块的圆角位置。solo = 四角；start/middle/end = 邻接边削平。 */
export type SelectJoin = "solo" | "start" | "middle" | "end";

export function adjacentJoin(selected: boolean, prevSelected: boolean, nextSelected: boolean): SelectJoin | null {
  if (!selected) return null;
  if (prevSelected && nextSelected) return "middle";
  if (prevSelected) return "end";
  if (nextSelected) return "start";
  return "solo";
}
