import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoToolbar } from "./Toolbar";
import { YoButton } from "./Button";

describe("YoToolbar", () => {
  it("水平排列 children", () => {
    render(() => (
      <YoToolbar>
        <YoButton>刷新</YoButton>
        <YoButton variant="secondary">导出</YoButton>
      </YoToolbar>
    ));
    const toolbar = screen.getByRole("button", { name: "刷新" }).parentElement;
    expect(toolbar?.className).toContain("yohu-toolbar");
    expect(screen.getByRole("button", { name: "导出" })).toBeTruthy();
  });

  it("chrome 变体贴满标题栏（无页内底边距 class）", () => {
    const { container } = render(() => (
      <YoToolbar variant="chrome">
        <YoButton>执行</YoButton>
      </YoToolbar>
    ));
    expect(container.querySelector(".yohu-toolbar--chrome")).toBeTruthy();
  });
});
