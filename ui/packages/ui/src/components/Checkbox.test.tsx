import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoCheckbox } from "./Checkbox";

describe("YoCheckbox", () => {
  it("渲染标签与未勾选状态", () => {
    render(() => <YoCheckbox label="包含子进程" checked={false} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.getByText("包含子进程")).toBeTruthy();
  });

  it("点击触发 onChange（取反）", () => {
    const onChange = vi.fn();
    render(() => <YoCheckbox label="开关" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("disabled 时不可点击", () => {
    const onChange = vi.fn();
    render(() => <YoCheckbox label="禁用" checked={false} disabled onChange={onChange} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    fireEvent.click(box);
    expect(onChange).not.toHaveBeenCalled();
  });
});
