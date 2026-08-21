/**
 * 树可见行扁平化与键盘意图（L2）。
 */

export type TreeKeyIntent =
  | { type: "focus"; index: number }
  | { type: "toggle" }
  | { type: "parent" }
  | { type: "select" };

export interface TreeWalkNode {
  key: string;
  children?: TreeWalkNode[];
}

export function flattenVisible<T extends TreeWalkNode>(
  data: T[],
  isExpanded: (key: string) => boolean,
): { node: T; depth: number }[] {
  const result: { node: T; depth: number }[] = [];
  const walk = (nodes: T[], depth: number): void => {
    for (const node of nodes) {
      result.push({ node, depth });
      if (node.children && node.children.length > 0 && isExpanded(node.key)) {
        walk(node.children as T[], depth + 1);
      }
    }
  };
  walk(data, 0);
  return result;
}

export function parentIndex(rows: readonly { depth: number }[], index: number): number | null {
  const current = rows[index];
  if (!current) return null;
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i]!.depth < current.depth) return i;
  }
  return null;
}

/** 未识别返回 null。 */
export function treeKeyIntent(
  key: string,
  index: number,
  count: number,
  hasChildren: boolean,
  expanded: boolean,
): TreeKeyIntent | null {
  if (count === 0) return null;
  const clamped = Math.min(Math.max(index, 0), count - 1);
  switch (key) {
    case "ArrowDown":
      return { type: "focus", index: Math.min(clamped + 1, count - 1) };
    case "ArrowUp":
      return { type: "focus", index: Math.max(clamped - 1, 0) };
    case "ArrowRight":
      if (hasChildren && !expanded) return { type: "toggle" };
      return { type: "focus", index: Math.min(clamped + 1, count - 1) };
    case "ArrowLeft":
      if (hasChildren && expanded) return { type: "toggle" };
      return { type: "parent" };
    case "Enter":
    case " ":
      return { type: "select" };
    default:
      return null;
  }
}
