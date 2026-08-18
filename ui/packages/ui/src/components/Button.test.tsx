import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoButton } from "./Button";

describe("YoButton", () => {
  it("渲染文本并应用默认 primary/md 类", () => {
    render(() => <YoButton>保存</YoButton>);
    const btn = screen.getByRole("button", { name: "保存" });
    expect(btn.className).toContain("yohu-button--primary");
    expect(btn.className).toContain("yohu-button--md");
  });

  it("应用指定 variant 与 size", () => {
    render(() => (
      <YoButton variant="danger" size="sm">
        删除
      </YoButton>
    ));
    const btn = screen.getByRole("button", { name: "删除" });
    expect(btn.className).toContain("yohu-button--danger");
    expect(btn.className).toContain("yohu-button--sm");
  });

  it("点击触发 onClick", () => {
    const onClick = vi.fn();
    render(() => (
      <YoButton variant="secondary" onClick={onClick}>
        取消
      </YoButton>
    ));
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled 状态具有 disabled 属性", () => {
    render(() => <YoButton disabled>禁用</YoButton>);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("loading 状态显示 spinner 并禁用", () => {
    render(() => <YoButton loading>加载中</YoButton>);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.querySelector(".yohu-button__spinner")).toBeTruthy();
  });
});
