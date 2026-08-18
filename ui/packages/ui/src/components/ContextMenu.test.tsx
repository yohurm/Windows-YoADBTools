import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoContextMenu } from "./ContextMenu";

describe("YoContextMenu", () => {
  it("打开时渲染条目，点击触发 onSelect 并关闭", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(() => (
      <YoContextMenu
        open
        x={10}
        y={20}
        items={[{ id: "new-dir", label: "新建目录" }]}
        onSelect={onSelect}
        onClose={onClose}
      />
    ));
    fireEvent.click(screen.getByRole("menuitem", { name: "新建目录" }));
    expect(onSelect).toHaveBeenCalledWith("new-dir");
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc 关闭", () => {
    const onClose = vi.fn();
    render(() => (
      <YoContextMenu open x={0} y={0} items={[{ id: "a", label: "A" }]} onSelect={() => undefined} onClose={onClose} />
    ));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
