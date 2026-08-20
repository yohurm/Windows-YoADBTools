import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoSwitch } from "./Switch";

describe("YoSwitch", () => {
  it("关闭态 aria-checked=false", () => {
    render(() => <YoSwitch ariaLabel="自动刷新" checked={false} />);
    const sw = screen.getByRole("switch", { name: "自动刷新" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.className).not.toContain("yohu-switch--on");
  });

  it("点击取反 onChange", () => {
    const onChange = vi.fn();
    render(() => <YoSwitch ariaLabel="启用" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("开启态带 --on 类", () => {
    render(() => <YoSwitch ariaLabel="启用" checked />);
    expect(screen.getByRole("switch").className).toContain("yohu-switch--on");
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("disabled 不触发 onChange", () => {
    const onChange = vi.fn();
    render(() => <YoSwitch ariaLabel="禁用" checked={false} disabled onChange={onChange} />);
    const sw = screen.getByRole("switch") as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});
