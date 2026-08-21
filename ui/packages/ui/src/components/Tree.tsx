/**
 * YoTree —— 泛型树。
 * HarmonyOS 对照：Tree；命令库等层级导航。
 * 受控 API：data / onSelect / expandedKeys / defaultExpandedKeys。
 *
 * 键盘：
 * - ↑/↓ 在可见节点间移动焦点；→ 展开（有子节点时，否则移到下一节点）；← 收起（已展开时，否则移到父节点）
 * - Enter 选中；空格选中（不滚动）
 *
 * ARIA：`role=tree/treeitem` + `aria-expanded` + roving tabindex（仅焦点节点 tabindex=0）。
 * 受控展开（expandedKeys）或默认展开（defaultExpandedKeys）。
 * 子树用 YoCollapse，关闭后仍挂载（aria-hidden），高度 200ms 过渡。
 */
import { For, Show, createMemo, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import { Layout } from "../tokens/layout";
import { YoCollapse } from "../motion/collapse";
import { YoIndicator } from "../motion/indicator";
import { YoBadge } from "./Badge";
import { flattenVisible, parentIndex, treeKeyIntent } from "./tree-model";
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
  /** 尾部胶囊徽章（如命令数） */
  badge?: string;
  /** hover 完整提示（如命令模板） */
  title?: string;
}

export interface YoTreeProps<T = unknown> {
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
export function YoTree<T = unknown>(props: YoTreeProps<T>): JSX.Element {
  const rowHeight = (): number => props.rowHeight ?? 30;
  const controlled = (): boolean => props.expandedKeys !== undefined;

  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set(props.defaultExpandedKeys ?? []));
  const [selected, setSelected] = createSignal<string | null>(null);
  const [focusedKey, setFocusedKey] = createSignal<string | null>(null);

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

  const rows = createMemo(() => flattenVisible(props.data, isExpanded));

  const focusKey = (key: string): void => {
    setFocusedKey(key);
    const el = document.querySelector<HTMLElement>(`[data-tree-key="${key}"]`);
    el?.focus();
  };

  const onTreeKeyDown = (event: KeyboardEvent): void => {
    const visible = rows();
    if (visible.length === 0) return;
    const focused = focusedKey() ?? selected() ?? visible[0]!.node.key;
    const index = visible.findIndex((r) => r.node.key === focused);
    const current = index >= 0 ? visible[index]! : visible[0]!;
    const hasChildren = !!current.node.children && current.node.children.length > 0;
    const intent = treeKeyIntent(
      event.key,
      index,
      visible.length,
      hasChildren,
      isExpanded(current.node.key),
    );
    if (!intent) return;
    event.preventDefault();
    switch (intent.type) {
      case "focus": {
        const next = visible[intent.index];
        if (next) focusKey(next.node.key);
        break;
      }
      case "toggle":
        toggle(current.node.key);
        break;
      case "parent": {
        const parent = parentIndex(visible, index);
        if (parent !== null) focusKey(visible[parent]!.node.key);
        break;
      }
      case "select":
        select(current.node);
        break;
    }
  };

  const renderNodes = (nodes: TreeNode<T>[], depth: number): JSX.Element => (
    <For each={nodes}>
      {(node) => {
        const hasChildren = !!node.children && node.children.length > 0;
        const expandedNow = (): boolean => hasChildren && isExpanded(node.key);
        return (
          <>
            <div
              data-tree-key={node.key}
              class="yohu-tree__row yohu-interactive yohu-focus-ring--inset"
              classList={{
                "yohu-interactive--selected": selected() === node.key,
              }}
              role="treeitem"
              aria-expanded={hasChildren ? expandedNow() : undefined}
              aria-selected={selected() === node.key}
              tabindex={focusedKey() === node.key ? 0 : -1}
              style={{
                height: `${rowHeight()}px`,
                "padding-left": `calc(${depth} * var(--yohu-space-lg))`,
              }}
              onClick={() => {
                select(node);
                setFocusedKey(node.key);
              }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  class="yohu-tree__chevron"
                  aria-label={expandedNow() ? "collapse" : "expand"}
                  tabindex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    select(node);
                    setFocusedKey(node.key);
                    toggle(node.key);
                  }}
                >
                  <span classList={{ "yohu-recipe-tree-chevron": true, "yohu-recipe-tree-chevron--open": expandedNow() }}>
                    <Icon name="chevron-down" size={Layout.IconInline} />
                  </span>
                </button>
              ) : (
                <span class="yohu-tree__chevron yohu-tree__chevron--leaf" />
              )}
              {node.icon ? <Icon name={node.icon} size={16} /> : null}
              <span class="yohu-tree__label" title={node.title}>
                {node.label}
              </span>
              {node.badge ? <YoBadge text={node.badge} /> : null}
            </div>
            <Show when={hasChildren}>
              <YoCollapse open={expandedNow()}>{renderNodes(node.children!, depth + 1)}</YoCollapse>
            </Show>
          </>
        );
      }}
    </For>
  );

  return (
    <div class="yohu-tree" role="tree" aria-label="树" tabindex={0} onKeyDown={onTreeKeyDown}>
      <YoIndicator follow={selected()} variant="fill" />
      {renderNodes(props.data, 0)}
    </div>
  );
}
