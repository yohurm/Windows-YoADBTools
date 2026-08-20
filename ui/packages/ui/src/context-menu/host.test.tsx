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
});
