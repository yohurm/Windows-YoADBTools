import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoTabs } from "./Tabs";

const TABS = [
  { id: "a", title: "会话A", dot: { tone: "success" as const } },
  { id: "b", title: "会话B" },
  { id: "c", title: "会话C", dot: { tone: "error" as const } },
];

describe("YoTabs", () => {
  it("渲染标签并标记激活项", () => {
    render(() => <YoTabs tabs={TABS} activeId="a" />);
    const active = screen.getByRole("tab", { selected: true });
    expect(active.textContent).toContain("会话A");
    expect(screen.getByRole("tab", { name: /会话B/ })).toBeTruthy();
  });

  it("点击触发 onActivate", () => {
    const onActivate = vi.fn();
    render(() => <YoTabs tabs={TABS} activeId="a" onActivate={onActivate} />);
    fireEvent.click(screen.getByText("会话B"));
    expect(onActivate).toHaveBeenCalledWith("b");
  });

  it("关闭按钮触发 onClose 且不触发 onActivate", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(() => <YoTabs tabs={TABS} activeId="a" onActivate={onActivate} onClose={onClose} />);
    fireEvent.click(screen.getAllByLabelText("关闭页签")[0]);
    expect(onClose).toHaveBeenCalledWith("a");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("提供 onNew 时显示 + 按钮并触发 onNew", () => {
    const onNew = vi.fn();
    render(() => <YoTabs tabs={TABS} activeId="a" onNew={onNew} />);
    fireEvent.click(screen.getByLabelText("新建页签"));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("不提供 onClose/onNew 时不渲染关闭与新建按钮", () => {
    render(() => <YoTabs tabs={TABS} activeId="a" />);
    expect(screen.queryByLabelText("关闭页签")).toBeNull();
    expect(screen.queryByLabelText("新建页签")).toBeNull();
  });

  it("roving tabindex：仅激活 tab 在 Tab 序中（可达性）", () => {
    const { container } = render(() => <YoTabs tabs={TABS} activeId="a" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]!.getAttribute("tabindex")).toBe("0");
    expect(tabs[1]!.getAttribute("tabindex")).toBe("-1");
    expect(tabs[2]!.getAttribute("tabindex")).toBe("-1");
    expect(container.querySelector(".yohu-recipe-indicator--underline")).toBeTruthy();
  });

  it("键盘 →/← 循环切换并激活", () => {
    const [active, setActive] = createSignal("a");
    const { container } = render(() => (
      <YoTabs
        tabs={TABS}
        activeId={active()}
        onActivate={(id) => setActive(id)}
      />
    ));
    const tablist = container.querySelector(".yohu-tabs") as HTMLElement;
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(active()).toBe("b");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(active()).toBe("c");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(active()).toBe("a"); // 循环回首位
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(active()).toBe("c"); // 反向循环
  });

  it("键盘 Home/End 跳转首尾", () => {
    const [active, setActive] = createSignal("b");
    const { container } = render(() => (
      <YoTabs tabs={TABS} activeId={active()} onActivate={setActive} />
    ));
    const tablist = container.querySelector(".yohu-tabs") as HTMLElement;
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(active()).toBe("a");
    fireEvent.keyDown(tablist, { key: "End" });
    expect(active()).toBe("c");
  });

  it("键盘 Delete 关闭当前 tab", () => {
    const onClose = vi.fn();
    const { container } = render(() => <YoTabs tabs={TABS} activeId="b" onClose={onClose} />);
    const tablist = container.querySelector(".yohu-tabs") as HTMLElement;
    fireEvent.keyDown(tablist, { key: "Delete" });
    expect(onClose).toHaveBeenCalledWith("b");
  });
});
