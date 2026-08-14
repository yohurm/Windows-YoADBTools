import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YTabs } from "./Tabs";

const TABS = [
  { id: "a", title: "会话A", dot: { tone: "success" as const } },
  { id: "b", title: "会话B" },
  { id: "c", title: "会话C", dot: { tone: "error" as const } },
];

describe("YTabs", () => {
  it("渲染标签并标记激活项", () => {
    render(() => <YTabs tabs={TABS} activeId="a" />);
    const active = screen.getByRole("tab", { selected: true });
    expect(active.textContent).toContain("会话A");
    expect(screen.getByRole("tab", { name: /会话B/ })).toBeTruthy();
  });

  it("点击触发 onActivate", () => {
    const onActivate = vi.fn();
    render(() => <YTabs tabs={TABS} activeId="a" onActivate={onActivate} />);
    fireEvent.click(screen.getByText("会话B"));
    expect(onActivate).toHaveBeenCalledWith("b");
  });

  it("关闭按钮触发 onClose 且不触发 onActivate", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(() => <YTabs tabs={TABS} activeId="a" onActivate={onActivate} onClose={onClose} />);
    fireEvent.click(screen.getAllByLabelText("close")[0]);
    expect(onClose).toHaveBeenCalledWith("a");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("提供 onNew 时显示 + 按钮并触发 onNew", () => {
    const onNew = vi.fn();
    render(() => <YTabs tabs={TABS} activeId="a" onNew={onNew} />);
    fireEvent.click(screen.getByLabelText("new tab"));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("不提供 onClose/onNew 时不渲染关闭与新建按钮", () => {
    render(() => <YTabs tabs={TABS} activeId="a" />);
    expect(screen.queryByLabelText("close")).toBeNull();
    expect(screen.queryByLabelText("new tab")).toBeNull();
  });
});
