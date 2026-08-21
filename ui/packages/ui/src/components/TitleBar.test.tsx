import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoTitleBar } from "./TitleBar";

describe("YoTitleBar", () => {
  it("渲染标题并带拖动区", () => {
    const { container } = render(() => <YoTitleBar title="Yohu ADB Tools" icon="terminal" />);
    expect(screen.getByText("Yohu ADB Tools")).toBeTruthy();
    expect(container.querySelector("[data-tauri-drag-region]")).toBeTruthy();
    expect(container.querySelector('svg[data-icon="terminal"]')).toBeTruthy();
  });

  it("logoSrc 优先于字形 icon", () => {
    const { container } = render(() => (
      <YoTitleBar title="Yohu ADB Tools" icon="terminal" logoSrc="/app-icon.png" />
    ));
    expect(container.querySelector(".yohu-titlebar__logo")?.getAttribute("src")).toBe("/app-icon.png");
    expect(container.querySelector('svg[data-icon="terminal"]')).toBeNull();
  });

  it("三键顺序为最小化、最大化、关闭", () => {
    render(() => <YoTitleBar title="窗" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["最小化", "最大化", "关闭"]);
  });

  it("最大化时最大化键变为还原", () => {
    render(() => <YoTitleBar title="窗" maximized />);
    expect(screen.getByRole("button", { name: "还原" })).toBeTruthy();
  });

  it("三键回调", () => {
    const onMinimize = vi.fn();
    const onToggleMaximize = vi.fn();
    const onClose = vi.fn();
    render(() => (
      <YoTitleBar
        title="窗"
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
        onClose={onClose}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "最大化" }));
    fireEvent.click(screen.getByRole("button", { name: "最小化" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("三键不参与拖动区", () => {
    const { container } = render(() => <YoTitleBar title="窗" />);
    const captions = container.querySelectorAll(".yohu-titlebar__caption");
    expect(captions.length).toBe(3);
    captions.forEach((btn) => {
      expect(btn.hasAttribute("data-tauri-drag-region")).toBe(false);
    });
  });

  it("双击标题栏切换最大化（点在三键上不触发）", () => {
    const onToggleMaximize = vi.fn();
    const { container } = render(() => <YoTitleBar title="窗" onToggleMaximize={onToggleMaximize} />);
    fireEvent.dblClick(container.querySelector(".yohu-titlebar__title") as HTMLElement);
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
    fireEvent.dblClick(screen.getByRole("button", { name: "最小化" }));
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("侧栏操作与三键同在右侧铬条", () => {
    const { container } = render(() => (
      <YoTitleBar title="窗" actions={<button type="button" aria-label="侧栏" />} />
    ));
    const trailing = container.querySelector(".yohu-titlebar__trailing");
    expect(trailing?.querySelector(".yohu-titlebar__actions")).toBeTruthy();
    expect(trailing?.querySelectorAll(".yohu-titlebar__caption").length).toBe(3);
  });

  it("中区可承载 children（不再挂模块通栏）", () => {
    const { container } = render(() => (
      <YoTitleBar title="窗">
        <span>通栏</span>
      </YoTitleBar>
    ));
    expect(container.querySelector(".yohu-titlebar__center")?.textContent).toContain("通栏");
  });
});
