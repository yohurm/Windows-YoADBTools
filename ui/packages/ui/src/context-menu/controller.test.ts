import { afterEach, describe, expect, it, vi } from "vitest";

import {
  closeContextMenu,
  contextMenu,
  createContextMenuController,
  defineContextMenu,
  openContextMenu,
} from "./controller";

type SampleCtx = { enabled: boolean; run: () => void };

const sample = defineContextMenu<SampleCtx, "go">({
  id: "test.sample",
  items: (ctx) => [{ id: "go", label: "执行", disabled: !ctx.enabled }],
  onSelect: (id, ctx) => {
    if (id === "go" && ctx.enabled) ctx.run();
  },
});

describe("defineContextMenu", () => {
  it("拒绝空 id", () => {
    expect(() => defineContextMenu({ id: "  ", items: () => [], onSelect: () => undefined })).toThrow(/id/);
  });
});

describe("createContextMenuController", () => {
  it("open 写入场景快照；再 open 覆盖；close 清空", () => {
    const menu = createContextMenuController();
    menu.open(sample, { x: 10, y: 20, ctx: { enabled: true, run: () => undefined } });
    expect(menu.session()?.id).toBe("test.sample");
    expect(menu.session()?.items).toEqual([{ id: "go", label: "执行", disabled: false }]);

    const other = defineContextMenu({
      id: "test.other",
      items: () => [{ id: "x", label: "X" }],
      onSelect: () => undefined,
    });
    menu.open(other, { x: 1, y: 1, ctx: {} });
    expect(menu.session()?.id).toBe("test.other");

    menu.close();
    expect(menu.session()).toBeNull();
  });

  it("select 把条目 id 交给场景 onSelect", () => {
    const menu = createContextMenuController();
    const run = vi.fn();
    menu.open(sample, { x: 10, y: 20, ctx: { enabled: true, run } });
    menu.session()?.select("go");
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("默认实例", () => {
  afterEach(() => closeContextMenu());

  it("openContextMenu 写到全局 session", () => {
    openContextMenu(sample, { x: 12, y: 24, ctx: { enabled: false, run: () => undefined } });
    expect(contextMenu.session()?.id).toBe("test.sample");
    expect(contextMenu.session()?.items[0]?.disabled).toBe(true);
  });
});
