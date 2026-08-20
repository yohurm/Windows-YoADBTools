import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoChrome } from "./chrome";

describe("YoChrome", () => {
  it("在原地渲染标题区与功能栏，不传送", () => {
    const { container } = render(() => (
      <div data-testid="body">
        <YoChrome title="ADB 命令终端" leading={<span>A1</span>}>
          <button type="button">执行</button>
        </YoChrome>
      </div>
    ));
    expect(container.querySelector(".yohu-chrome__title")?.textContent).toContain("ADB 命令终端");
    expect(container.querySelector(".yohu-chrome__title")?.textContent).toContain("A1");
    expect(container.querySelector(".yohu-chrome__bar")?.textContent).toContain("执行");
    expect(screen.getByTestId("body").querySelector(".yohu-chrome")).toBeTruthy();
  });

  it("无操作时只显示标题区", () => {
    const { container } = render(() => <YoChrome title="设置" />);
    expect(container.querySelector(".yohu-chrome__title")?.textContent).toBe("设置");
    expect(container.querySelector(".yohu-chrome__bar")).toBeNull();
  });
});
