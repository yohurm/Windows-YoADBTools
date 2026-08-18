import { describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoColResizer } from "./ColResizer";

describe("YoColResizer", () => {
  it("渲染可聚焦的列宽拖拽条", () => {
    const onResize = vi.fn();
    const { container } = render(() => <YoColResizer onResize={onResize} label="调节名称列宽" />);
    const handle = container.querySelector(".yovo-col-resizer");
    expect(handle).toBeTruthy();
    expect(handle?.getAttribute("aria-label")).toBe("调节名称列宽");
    expect(handle?.tagName).toBe("BUTTON");
  });
});
