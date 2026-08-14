import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YCheckbox } from "./Checkbox";

describe("YCheckbox", () => {
  it("渲染标签与未勾选状态", () => {
    render(() => <YCheckbox label="包含子进程" checked={false} />);
    const box = screen.getByRole("checkbox");
    expect(box).toBeTruthy();
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("包含子进程")).toBeTruthy();
  });

  it("点击触发 onChange（取反）", () => {
    const onChange = vi.fn();
    render(() => <YCheckbox label="开关" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("disabled 时不可点击", () => {
    const onChange = vi.fn();
    render(() => <YCheckbox label="禁用" checked={false} disabled onChange={onChange} />);
    expect(screen.getByRole("checkbox").getAttribute("aria-disabled")).toBe("true");
  });
});
