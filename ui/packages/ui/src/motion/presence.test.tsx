import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoPresence } from "./presence";
import { YoCollapse } from "./collapse";

describe("YoPresence", () => {
  it("when=true 渲染子节点并带 data-state=open", () => {
    render(() => (
      <YoPresence when recipe="dialog">
        <div role="dialog">面板</div>
      </YoPresence>
    ));
    expect(screen.getByRole("dialog")).toBeTruthy();
    const host = document.querySelector(".yohu-presence");
    expect(host?.getAttribute("data-state")).toBe("open");
    expect(host?.getAttribute("data-recipe")).toBe("dialog");
  });

  it("when=false 在测试环境立刻卸载（skip motion）", () => {
    const [open, setOpen] = createSignal(true);
    const onExitComplete = vi.fn();
    render(() => (
      <YoPresence when={open()} recipe="fade" onExitComplete={onExitComplete}>
        <div>内容</div>
      </YoPresence>
    ));
    expect(screen.getByText("内容")).toBeTruthy();
    setOpen(false);
    expect(screen.queryByText("内容")).toBeNull();
    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });
});

describe("YoCollapse", () => {
  it("data-open 跟随 open，子节点始终挂载", () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <YoCollapse open={open()}>
        <div>折叠内容</div>
      </YoCollapse>
    ));
    const root = document.querySelector(".yohu-collapse");
    expect(root?.getAttribute("data-open")).toBe("false");
    expect(root?.querySelector(".yohu-collapse__inner")?.getAttribute("aria-hidden")).toBe("true");
    setOpen(true);
    expect(root?.getAttribute("data-open")).toBe("true");
    expect(root?.querySelector(".yohu-collapse__inner")?.getAttribute("aria-hidden")).toBeNull();
    expect(screen.getByText("折叠内容")).toBeTruthy();
  });

  it("recipe=panel 写入 data-recipe", () => {
    render(() => (
      <YoCollapse open recipe="panel">
        <div>面板</div>
      </YoCollapse>
    ));
    expect(document.querySelector(".yohu-collapse")?.getAttribute("data-recipe")).toBe("panel");
  });
});
