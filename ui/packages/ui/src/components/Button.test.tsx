import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YButton } from "./Button";

describe("YButton", () => {
  it("渲染文本并应用默认 primary/md 类", () => {
    render(() => <YButton>保存</YButton>);
    const btn = screen.getByRole("button", { name: "保存" });
    expect(btn.className).toContain("yovo-button--primary");
    expect(btn.className).toContain("yovo-button--md");
  });

  it("应用指定 variant 与 size", () => {
    render(() => (
      <YButton variant="danger" size="sm">
        删除
      </YButton>
    ));
    const btn = screen.getByRole("button", { name: "删除" });
    expect(btn.className).toContain("yovo-button--danger");
    expect(btn.className).toContain("yovo-button--sm");
  });

  it("点击触发 onClick", () => {
    const onClick = vi.fn();
    render(() => (
      <YButton variant="secondary" onClick={onClick}>
        取消
      </YButton>
    ));
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled 状态具有 disabled 属性", () => {
    render(() => <YButton disabled>禁用</YButton>);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("loading 状态显示 spinner 并禁用", () => {
    render(() => <YButton loading>加载中</YButton>);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.querySelector(".yovo-button__spinner")).toBeTruthy();
  });
});
