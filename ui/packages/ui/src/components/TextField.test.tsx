import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YTextField } from "./TextField";

describe("YTextField", () => {
  it("渲染标签与输入框", () => {
    render(() => <YTextField label="名称" placeholder="请输入" />);
    const input = screen.getByLabelText("名称") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute("placeholder")).toBe("请输入");
  });

  it("change 事件也触发 onInput（UIA SetValue）", () => {
    const onInput = vi.fn();
    render(() => <YTextField label="关键字" value="" onInput={onInput} />);
    fireEvent.change(screen.getByLabelText("关键字"), { target: { value: "uia" } });
    expect(onInput).toHaveBeenCalledWith("uia", expect.anything());
  });

  it("clearable 且有值时显示清除按钮，点击清空", () => {
    const onInput = vi.fn();
    const [value, setValue] = createSignal("abc");
    render(() => (
      <YTextField
        label="搜索"
        value={value()}
        clearable
        onInput={(v, e) => {
          setValue(v);
          onInput(v, e);
        }}
      />
    ));
    const clear = screen.getByRole("button", { name: "clear" });
    expect(clear).toBeTruthy();
    fireEvent.click(clear);
    expect(onInput).toHaveBeenCalledWith("", expect.anything());
  });

  it("disabled 时禁用输入框", () => {
    render(() => <YTextField label="只读" value="x" disabled />);
    expect((screen.getByLabelText("只读") as HTMLInputElement).disabled).toBe(true);
  });

  it("无 label 时使用 ariaLabel 作为无障碍名称", () => {
    render(() => <YTextField ariaLabel="新目录名" placeholder="新目录名" />);
    expect(screen.getByLabelText("新目录名")).toBeTruthy();
  });
});
