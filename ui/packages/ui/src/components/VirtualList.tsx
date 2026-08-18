/**
 * YoVirtualList —— 定高行虚拟列表（自实现虚拟化）。
 *
 * 泛型组件：外层滚动容器占满父高，内部以总高度撑起滚动区，
 * 仅绝对定位渲染可见行（含 overscan 缓冲），底部自动跟随滚动。
 *
 * 选择模式：传入 `selectedKey` + `onSelectRow` 时开启单选——
 * roving tabindex（选中行 0 / 其余 -1 / 未选中时首可视行 0）、
 * ↑/↓/Home/End 移动、Enter/Space 选中、目标行自动滚入视野并聚焦、
 * `role=listbox/option` + `aria-selected`（对齐 UI设计系统-v6.md §5）。
 * 未开启选择模式时行不参与焦点序列，行为与旧版一致（日志列表性能优先）。
 *
 * 注意：`itemHeight` / `overscan` / `rowHeight` 为功能性配置项（非主题 token），
 * 由调用方指定，仅用于定位计算；所有配色/字号/间距仍走 tokens。
 */
import { For, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import "./VirtualList.css";

export interface YoVirtualListProps<T> {
  /** 数据源（响应式访问器） */
  items: Accessor<T[]>;
  /** 行高（px），默认 22 */
  itemHeight?: number;
  /** 可视区外的预渲染行数，默认 10 */
  overscan?: number;
  /** 行 key（用于稳定定位与测试），默认取 index */
  getItemKey?: (item: T, index: number) => string | number;
  /** 行渲染函数 */
  renderRow: (item: T, index: number) => JSX.Element;
  /** 是否自动跟随滚动到底部（响应式访问器） */
  autoScrollToBottom?: Accessor<boolean>;
  /**
   * 贴底状态变化（由实时滚动度量驱动，不是镜像状态）。
   * 离开底部 → false；滚回底部（阈值内）→ true。
   * 程序化滚底不会误报离开。
   */
  onAtBottomChange?: (atBottom: boolean) => void;
  /** 当前选中行 key（提供即开启单选选择模式；null = 未选中） */
  selectedKey?: Accessor<string | number | null>;
  /** 多选 key 集（提供则优先于 selectedKey，listbox 为多选） */
  selectedKeys?: Accessor<ReadonlySet<string | number>>;
  /** 选中变化回调（点击/键盘统一入口；由调用方更新 selectedKey） */
  onSelectRow?: (item: T, key: string | number, event?: MouseEvent | KeyboardEvent) => void;
  /** 行右键（文件管理等） */
  onRowContextMenu?: (item: T, key: string | number, event: MouseEvent) => void;
  /** 选择模式下 listbox 的无障碍名称 */
  ariaLabel?: string;
}

/**
 * 渲染一个定高行虚拟列表。
 */
export function YoVirtualList<T>(props: YoVirtualListProps<T>): JSX.Element {
  const itemHeight = (): number => props.itemHeight ?? 22;
  const overscan = (): number => props.overscan ?? 10;

  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);
  /** 聚焦请求重试计数（目标行尚未渲染时滚动后重跑 effect） */
  const [focusTick, setFocusTick] = createSignal(0);
  let container: HTMLDivElement | undefined;
  /** 键盘导航目标 key（非响应式，防点击误触发聚焦） */
  let pendingFocusKey: string | number | null = null;
  let focusAttempts = 0;
  /** 与 Entangle useFollowTail 一致：程序化滚底不视为手势离开 */
  let isAutoScrolling = false;
  let autoScrollReset = 0;
  /** 默认视为贴底，避免挂载瞬间误报 detach */
  let lastAtBottom = true;
  const STICK_THRESHOLD = 32;

  const measureAtBottom = (): boolean => {
    if (!container) return true;
    return container.scrollHeight - container.clientHeight - container.scrollTop <= STICK_THRESHOLD;
  };

  const emitAtBottom = (): void => {
    if (!props.onAtBottomChange) return;
    const atBottom = measureAtBottom();
    if (atBottom === lastAtBottom) return;
    lastAtBottom = atBottom;
    props.onAtBottomChange(atBottom);
  };

  const snapToBottom = (): void => {
    if (!container) return;
    isAutoScrolling = true;
    container.scrollTop = container.scrollHeight;
    setScrollTop(container.scrollTop);
    if (typeof requestAnimationFrame === "function") {
      if (autoScrollReset !== 0) cancelAnimationFrame(autoScrollReset);
      autoScrollReset = requestAnimationFrame(() => {
        autoScrollReset = 0;
        isAutoScrolling = false;
      });
    } else {
      isAutoScrolling = false;
    }
  };

  const totalHeight = (): number => props.items().length * itemHeight();

  const startIndex = (): number => Math.max(0, Math.floor(scrollTop() / itemHeight()) - overscan());

  const endIndex = (): number => {
    const visibleEnd = Math.ceil((scrollTop() + viewportHeight()) / itemHeight());
    return Math.min(props.items().length, visibleEnd + overscan());
  };

  const keyOf = (item: T, index: number): string | number =>
    props.getItemKey ? props.getItemKey(item, index) : index;

  const selectable = (): boolean =>
    (props.selectedKey !== undefined || props.selectedKeys !== undefined) && props.onSelectRow !== undefined;

  const isMulti = (): boolean => props.selectedKeys !== undefined;

  const visibleRows = (): { index: number; item: T; key: string | number }[] => {
    const items = props.items();
    const start = startIndex();
    const end = endIndex();
    const rows: { index: number; item: T; key: string | number }[] = [];
    for (let i = start; i < end; i++) {
      const item = items[i];
      if (item === undefined) {
        break;
      }
      rows.push({ index: i, item, key: keyOf(item, i) });
    }
    return rows;
  };

  const indexOfKey = (key: string | number): number => {
    const items = props.items();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item === undefined) {
        break;
      }
      if (keyOf(item, i) === key) {
        return i;
      }
    }
    return -1;
  };

  const findRowElement = (key: string | number): HTMLElement | null => {
    if (!container) return null;
    for (const el of container.querySelectorAll<HTMLElement>(".yovo-virtual-list__row")) {
      if (el.dataset.key === String(key)) {
        return el;
      }
    }
    return null;
  };

  const isSelected = (key: string | number): boolean => {
    if (!selectable()) return false;
    if (props.selectedKeys) return props.selectedKeys().has(key);
    return props.selectedKey?.() === key;
  };

  const rowTabIndex = (row: { index: number; key: string | number }): number | undefined => {
    if (!selectable()) return undefined;
    if (isSelected(row.key)) return 0;
    const selected = props.selectedKeys ? props.selectedKeys().size : props.selectedKey?.() ?? null;
    const empty = props.selectedKeys ? props.selectedKeys().size === 0 : selected === null || selected === undefined;
    if (empty) {
      const first = visibleRows()[0];
      if (first && first.key === row.key) return 0;
    }
    return -1;
  };

  const selectAt = (index: number, event?: MouseEvent | KeyboardEvent): void => {
    const item = props.items()[index];
    if (item === undefined || !props.onSelectRow) return;
    props.onSelectRow(item, keyOf(item, index), event);
  };

  const handleRowClick = (index: number, event: MouseEvent): void => {
    if (!selectable()) return;
    pendingFocusKey = null;
    selectAt(index, event);
  };

  const handleRowKeyDown = (index: number, event: KeyboardEvent): void => {
    if (!selectable()) return;
    let target: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        target = index + 1;
        break;
      case "ArrowUp":
        target = index - 1;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = props.items().length - 1;
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        selectAt(index);
        return;
      }
      default:
        return;
    }
    if (target === null) return;
    event.preventDefault();
    const clamped = Math.max(0, Math.min(props.items().length - 1, target));
    if (clamped === index) return;
    const item = props.items()[clamped];
    if (item === undefined) return;
    pendingFocusKey = keyOf(item, clamped);
    focusAttempts = 0;
    selectAt(clamped);
  };

  // 键盘导航后：将新选中行滚入视野并聚焦（行未渲染时先滚动触发渲染再聚焦）。
  createEffect(() => {
    if (!selectable()) return;
    const key = props.selectedKey?.() ?? null;
    void focusTick(); // 依赖：滚动重试
    if (pendingFocusKey === null) return;
    if (key !== pendingFocusKey) {
      pendingFocusKey = null; // 回调未采纳本次选中，放弃聚焦
      return;
    }
    const el = findRowElement(key);
    if (!el) {
      const index = indexOfKey(key);
      if (!container || index < 0 || focusAttempts >= 3) {
        pendingFocusKey = null;
        return;
      }
      focusAttempts += 1;
      const top = Math.max(0, index * itemHeight());
      container.scrollTop = top;
      setScrollTop(top);
      setFocusTick((tick) => tick + 1); // 重渲染后再聚焦
      return;
    }
    el.scrollIntoView({ block: "nearest" });
    el.focus();
    pendingFocusKey = null;
  });

  const handleScroll = (): void => {
    if (!container) return;
    setScrollTop(container.scrollTop);
    setViewportHeight(container.clientHeight);
    if (isAutoScrolling) return;
    emitAtBottom();
  };

  onMount(() => {
    if (container) {
      setViewportHeight(container.clientHeight);
      if (props.autoScrollToBottom?.()) {
        snapToBottom();
      }
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(() => {
          if (container) {
            setViewportHeight(container.clientHeight);
            if (props.autoScrollToBottom?.()) snapToBottom();
          }
        });
        observer.observe(container);
        onCleanup(() => observer.disconnect());
      }
    }
    onCleanup(() => {
      if (autoScrollReset !== 0 && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(autoScrollReset);
      }
    });
  });

  // 数据追加时若处于「跟随底部」模式，自动滚底（Entangle：entryCount 变化才 snap）。
  createEffect(() => {
    const length = props.items().length;
    if (container && props.autoScrollToBottom?.() && length >= 0) {
      snapToBottom();
    }
  });

  return (
    <div
      ref={(el) => (container = el)}
      class="yovo-virtual-list"
      role={selectable() ? "listbox" : undefined}
      aria-label={selectable() ? props.ariaLabel : undefined}
      aria-multiselectable={isMulti() ? true : undefined}
      onScroll={handleScroll}
    >
      <div class="yovo-virtual-list__inner" style={{ height: `${totalHeight()}px` }}>
        <For each={visibleRows()}>
          {(row) => (
            <div
              class="yovo-virtual-list__row"
              classList={{
                "yovo-interactive": selectable(),
                "yovo-interactive--selected": selectable() && isSelected(row.key),
                "yovo-focus-ring--inset": selectable(),
                "yovo-virtual-list__row--selected": isSelected(row.key),
              }}
              style={{
                position: "absolute",
                top: `${row.index * itemHeight()}px`,
                left: "0",
                right: "0",
                height: `${itemHeight()}px`,
              }}
              data-key={row.key}
              role={selectable() ? "option" : undefined}
              aria-selected={selectable() ? isSelected(row.key) : undefined}
              tabIndex={rowTabIndex(row)}
              onClick={(event) => handleRowClick(row.index, event)}
              onContextMenu={(event) => {
                if (!props.onRowContextMenu) return;
                event.preventDefault();
                props.onRowContextMenu(row.item, row.key, event);
              }}
              onKeyDown={(event) => handleRowKeyDown(row.index, event)}
            >
              {props.renderRow(row.item, row.index)}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
