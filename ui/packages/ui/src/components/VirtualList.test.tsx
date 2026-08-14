import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YVirtualList } from "./VirtualList";

function makeItems(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `row-${i}`);
}

describe("YVirtualList", () => {
  it("虚拟化：仅渲染可视区（含 overscan）内的行", () => {
    const items = makeItems(100);
    const { container } = render(() => (
      <YVirtualList items={() => items} itemHeight={22} renderRow={(item) => <span>{item}</span>} />
    ));
    const rows = container.querySelectorAll(".yovo-virtual-list__row");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(100);
    expect(screen.getByText("row-0")).toBeTruthy();
    expect(screen.queryByText("row-50")).toBeNull();
  });

  it("getItemKey 写入 data-key", () => {
    const items = makeItems(20);
    const { container } = render(() => (
      <YVirtualList
        items={() => items}
        itemHeight={22}
        getItemKey={(item) => `key-${item}`}
        renderRow={(item) => <span>{item}</span>}
      />
    ));
    const first = container.querySelector(".yovo-virtual-list__row");
    expect(first?.getAttribute("data-key")).toBe("key-row-0");
  });

  it("autoScrollToBottom 时追加数据自动滚底", async () => {
    const [items, setItems] = createSignal<string[]>(["a"]);
    const { container } = render(() => (
      <YVirtualList
        items={items}
        itemHeight={22}
        autoScrollToBottom={() => true}
        renderRow={(item) => <span>{item}</span>}
      />
    ));
    const list = container.querySelector(".yovo-virtual-list") as HTMLElement;
    Object.defineProperty(list, "scrollHeight", { value: 22000, configurable: true, writable: true });
    setItems(["a", "b", "c"]);
    await Promise.resolve();
    expect(list.scrollTop).toBe(22000);
  });
});
