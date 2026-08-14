/**
 * YVirtualList —— 定高行虚拟列表（自实现虚拟化）。
 *
 * 泛型组件：外层滚动容器占满父高，内部以总高度撑起滚动区，
 * 仅绝对定位渲染可见行（含 overscan 缓冲），底部自动跟随滚动。
 *
 * 注意：`itemHeight` / `overscan` / `rowHeight` 为功能性配置项（非主题 token），
 * 由调用方指定，仅用于定位计算；所有配色/字号/间距仍走 tokens。
 */
import { For, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import "./VirtualList.css";

export interface YVirtualListProps<T> {
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
}

/**
 * 渲染一个定高行虚拟列表。
 */
export function YVirtualList<T>(props: YVirtualListProps<T>): JSX.Element {
  const itemHeight = (): number => props.itemHeight ?? 22;
  const overscan = (): number => props.overscan ?? 10;

  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);
  let container: HTMLDivElement | undefined;

  const totalHeight = (): number => props.items().length * itemHeight();

  const startIndex = (): number => Math.max(0, Math.floor(scrollTop() / itemHeight()) - overscan());

  const endIndex = (): number => {
    const visibleEnd = Math.ceil((scrollTop() + viewportHeight()) / itemHeight());
    return Math.min(props.items().length, visibleEnd + overscan());
  };

  const keyOf = (item: T, index: number): string | number =>
    props.getItemKey ? props.getItemKey(item, index) : index;

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

  const handleScroll = (): void => {
    if (container) {
      setScrollTop(container.scrollTop);
      setViewportHeight(container.clientHeight);
    }
  };

  onMount(() => {
    if (container) {
      setViewportHeight(container.clientHeight);
      if (props.autoScrollToBottom?.()) {
        container.scrollTop = container.scrollHeight;
      }
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(() => {
          if (container) setViewportHeight(container.clientHeight);
        });
        observer.observe(container);
        onCleanup(() => observer.disconnect());
      }
    }
  });

  // 数据追加时若处于「跟随底部」模式，自动滚底。
  createEffect(() => {
    const length = props.items().length;
    if (container && props.autoScrollToBottom?.()) {
      container.scrollTop = container.scrollHeight;
    }
  });

  return (
    <div ref={(el) => (container = el)} class="yovo-virtual-list" onScroll={handleScroll}>
      <div class="yovo-virtual-list__inner" style={{ height: `${totalHeight()}px` }}>
        <For each={visibleRows()}>
          {(row) => (
            <div
              class="yovo-virtual-list__row"
              style={{
                position: "absolute",
                top: `${row.index * itemHeight()}px`,
                left: "0",
                right: "0",
                height: `${itemHeight()}px`,
              }}
              data-key={row.key}
            >
              {props.renderRow(row.item, row.index)}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
