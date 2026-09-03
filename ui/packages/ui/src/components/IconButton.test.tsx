import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoIconButton } from "./IconButton";

describe("YoIconButton", () => {
  it("渲染图标与悬浮提示", () => {
    const { container } = render(() => <YoIconButton icon="refresh" title="刷新" />);
    const btn = screen.getByRole("button", { name: "刷新" });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("title")).toBe("刷新");
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("点击触发 onClick", () => {
    const onClick = vi.fn();
    render(() => <YoIconButton icon="settings" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled 时禁用", () => {
    render(() => <YoIconButton icon="play" disabled />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("loading 时旋转并禁用", () => {
    const { container } = render(() => <YoIconButton icon="refresh" title="刷新" loading />);
    const btn = screen.getByRole("button", { name: "刷新" });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".yohu-icon-button--loading")).toBeTruthy();
  });

  it("pressed 时带 aria-pressed", () => {
    render(() => <YoIconButton icon="nav-home" title="Home" pressed />);
    const btn = screen.getByRole("button", { name: "Home" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.className).toContain("yohu-icon-button--pressed");
  });
});
