/**
 * YTree —— 泛型树。
 * 缩进层级 + 展开箭头（chevron）；expandedKeys 受控或 defaultExpandedKeys 默认展开；
 * 固定行高（默认 30）。
 */
import { For, createMemo, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import "./Tree.css";

export interface TreeNode<T = unknown> {
  /** 节点唯一 key */
  key: string;
  /** 显示标签 */
  label: string;
  /** 可选图标 */
  icon?: IconName;
  /** 子节点 */
  children?: TreeNode<T>[];
  /** 业务数据 */
  data?: T;
}

export interface YTreeProps<T = unknown> {
  /** 树数据 */
  data: TreeNode<T>[];
  /** 受控展开 key（提供时为受控模式） */
  expandedKeys?: string[] | Set<string>;
  /** 默认展开 key（非受控模式） */
  defaultExpandedKeys?: string[];
  /** 选中回调 */
  onSelect?: (key: string, node: TreeNode<T>) => void;
  /** 行高（px），默认 30 */
  rowHeight?: number;
}

/**
 * 渲染一棵可展开/选中的树。
 */
export function YTree<T = unknown>(props: YTreeProps<T>): JSX.Element {
  const rowHeight = (): number => props.rowHeight ?? 30;
  const controlled = (): boolean => props.expandedKeys !== undefined;

  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set(props.defaultExpandedKeys ?? []));
  const [selected, setSelected] = createSignal<string | null>(null);

  const isExpanded = (key: string): boolean => {
    const ek = props.expandedKeys;
    if (ek === undefined) {
      return expanded().has(key);
    }
    return ek instanceof Set ? ek.has(key) : ek.includes(key);
  };

  const toggle = (key: string): void => {
    if (controlled()) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const select = (node: TreeNode<T>): void => {
    setSelected(node.key);
    props.onSelect?.(node.key, node);
  };

  /** 扁平化可见节点（展开的子树被纳入），按层级记录深度 */
  const rows = createMemo(() => {
    const result: { node: TreeNode<T>; depth: number }[] = [];
    const walk = (nodes: TreeNode<T>[], depth: number): void => {
      for (const node of nodes) {
        result.push({ node, depth });
        if (node.children && node.children.length > 0 && isExpanded(node.key)) {
          walk(node.children, depth + 1);
        }
      }
    };
    walk(props.data, 0);
    return result;
  });

  return (
    <div class="yovo-tree" role="tree">
      <For each={rows()}>
        {({ node, depth }) => {
          const hasChildren = !!node.children && node.children.length > 0;
          const expandedNow = hasChildren && isExpanded(node.key);
          return (
            <div
              class="yovo-tree__row"
              classList={{ "yovo-tree__row--selected": selected() === node.key }}
              role="treeitem"
              aria-expanded={hasChildren ? expandedNow : undefined}
              style={{
                height: `${rowHeight()}px`,
                "padding-left": `calc(${depth} * var(--yovo-space-lg))`,
              }}
              onClick={() => select(node)}
            >
              {hasChildren ? (
                <button
                  type="button"
                  class="yovo-tree__chevron"
                  aria-label={expandedNow ? "collapse" : "expand"}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(node.key);
                  }}
                >
                  <Icon name={expandedNow ? "chevron-down" : "chevron-right"} size={14} />
                </button>
              ) : (
                <span class="yovo-tree__chevron yovo-tree__chevron--leaf" />
              )}
              {node.icon ? <Icon name={node.icon} size={16} /> : null}
              <span class="yovo-tree__label">{node.label}</span>
            </div>
          );
        }}
      </For>
    </div>
  );
}
