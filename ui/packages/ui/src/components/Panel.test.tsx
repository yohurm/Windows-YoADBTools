import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YPanel } from "./Panel";

describe("YPanel", () => {
  it("渲染标题与内容，默认 md 内边距", () => {
    const { container } = render(() => <YPanel title="面板标题">内容</YPanel>);
    expect(screen.getByText("面板标题")).toBeTruthy();
    expect(screen.getByText("内容")).toBeTruthy();
    expect(container.querySelector(".yovo-panel--padding-md")).toBeTruthy();
  });

  it("支持自定义 padding", () => {
    const { container } = render(() => <YPanel padding="lg">内容</YPanel>);
    expect(container.querySelector(".yovo-panel--padding-lg")).toBeTruthy();
  });
});
