import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import { createContextMenuController, defineContextMenu } from "./controller";
import { YoContextMenuHost } from "./host";

describe("YoContextMenuHost", () => {
  it("打开后点击条目触发场景 onSelect 并关闭", () => {
    const run = vi.fn();
    const controller = createContextMenuController();
    const scene = defineContextMenu({
      id: "test.host",
      items: () => [{ id: "copy", label: "复制" }],
      onSelect: (id, ctx: { run: () => void }) => {
        if (id === "copy") ctx.run();
      },
    });
    render(() => <YoContextMenuHost controller={controller} />);
    controller.open(scene, { x: 16, y: 24, ctx: { run } });
    fireEvent.click(screen.getByRole("menuitem", { name: "复制" }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(controller.session()).toBeNull();
  });

  it("挂载后按实测尺寸二次夹紧并更新落点（refine）", async () => {
    const vvDesc = Object.getOwnPropertyDescriptor(window, "visualViewport");
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { width: 800, height: 600 },
    });

    const controller = createContextMenuController();
    const scene = defineContextMenu({
      id: "test.refine",
      items: () => [{ id: "copy", label: "复制" }],
      onSelect: () => undefined,
    });
    render(() => <YoContextMenuHost controller={controller} />);

    // 打开时按估算（宽 224）夹紧 → x=576, y=560；实测宽 600 后才应回收到 200/300。
    controller.open(scene, { x: 2000, y: 2000, ctx: {} });

    // 菜单已 Portal 到 body；挂载后让测量读到真实尺寸。
    const el = document.querySelector<HTMLElement>(".yohu-context-menu")!;
    expect(el).toBeTruthy();
    Object.defineProperty(el, "offsetWidth", { configurable: true, value: 600 });
    Object.defineProperty(el, "offsetHeight", { configurable: true, value: 300 });

    // 等测量回调整并 refine 更新 session。
    await Promise.resolve();

    const s = controller.session();
    expect(s).toBeTruthy();
    expect(s!.x).toBe(200); // 800 - 600
    expect(s!.y).toBe(300); // 600 - 300

    if (vvDesc === undefined) {
      // @ts-expect-error jsdom 默认无 visualViewport，删除恢复原状
      delete window.visualViewport;
    } else {
      Object.defineProperty(window, "visualViewport", vvDesc);
    }
  });
});
