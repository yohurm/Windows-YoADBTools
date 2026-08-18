import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoSelect } from "./Select";

const OPTIONS = [
  { value: "a", label: "选项A" },
  { value: "b", label: "选项B" },
  { value: "c", label: "选项C" },
];

describe("YoSelect", () => {
  it("点击展开并选择选项（onChange + 关闭）", () => {
    const onChange = vi.fn();
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /请选择/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.click(screen.getByText("选项B"));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("显示当前选中值", () => {
    render(() => <YoSelect options={OPTIONS} value="c" />);
    expect(screen.getByText("选项C")).toBeTruthy();
  });

  it("Esc 关闭下拉", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("点击外部关闭下拉", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("键盘：Enter 展开，↓ 移动活动项，Enter 提交", () => {
    const onChange = vi.fn();
    render(() => <YoSelect options={OPTIONS} value="a" placeholder="请选择" onChange={onChange} />);
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    // 初始活动项 = 当前选中 a；↓ 到 b
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe("yohu-option-b");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("键盘：闭合态 ↓ 直接展开；Esc 关闭并回焦触发钮", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("键盘：Home/End 跳到首尾活动项", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "End" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe("yohu-option-c");
    fireEvent.keyDown(trigger, { key: "Home" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe("yohu-option-a");
  });
});
