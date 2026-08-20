import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoSwap } from "./swap";

describe("YoSwap", () => {
  it("keys 变化后面名跟着变（测试环境跳过换牌等待）", () => {
    const [label, setLabel] = createSignal("预览");
    render(() => <YoSwap keys={label()}>{label()}</YoSwap>);
    expect(screen.getByText("预览")).toBeTruthy();
    setLabel("收起预览");
    expect(screen.getByText("收起预览")).toBeTruthy();
    expect(screen.queryByText("预览")).toBeNull();
    expect(document.querySelector(".yohu-swap")?.getAttribute("data-resizing")).toBeNull();
  });
});
