import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoPanel } from "./Panel";

describe("YoPanel", () => {
  it("渲染标题与内容，默认 md 内边距", () => {
    const { container } = render(() => <YoPanel title="面板标题">内容</YoPanel>);
    expect(screen.getByText("面板标题")).toBeTruthy();
    expect(screen.getByText("内容")).toBeTruthy();
    expect(container.querySelector(".yohu-panel--padding-md")).toBeTruthy();
  });

  it("支持自定义 padding", () => {
    const { container } = render(() => <YoPanel padding="lg">内容</YoPanel>);
    expect(container.querySelector(".yohu-panel--padding-lg")).toBeTruthy();
  });
});
