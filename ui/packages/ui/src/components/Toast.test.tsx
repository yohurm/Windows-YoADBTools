import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YToaster, YToast, createToaster } from "./Toast";

describe("createToaster + YToaster", () => {
  it("show 后渲染 toast", () => {
    const toaster = createToaster();
    render(() => <YToaster toaster={toaster} />);
    toaster.show("操作成功", "success");
    expect(screen.getByText("操作成功")).toBeTruthy();
  });

  it("tone 决定样式类", () => {
    const toaster = createToaster();
    render(() => <YToaster toaster={toaster} />);
    toaster.show("失败", "error");
    expect(screen.getByText("失败").className).toContain("yovo-toast--error");
  });

  it("show 默认 info 色调", () => {
    const toaster = createToaster();
    render(() => <YToaster toaster={toaster} />);
    toaster.show("提示");
    expect(screen.getByText("提示").className).toContain("yovo-toast--info");
  });

  it("多条消息堆叠渲染", () => {
    const toaster = createToaster();
    render(() => <YToaster toaster={toaster} />);
    toaster.show("第一条");
    toaster.show("第二条");
    expect(screen.getByText("第一条")).toBeTruthy();
    expect(screen.getByText("第二条")).toBeTruthy();
  });

  it("2.5s 后自动消失", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const toaster = createToaster();
      render(() => <YToaster toaster={toaster} />);
      toaster.show("临时消息");
      expect(screen.getByText("临时消息")).toBeTruthy();
      vi.advanceTimersByTime(2500);
      expect(screen.queryByText("临时消息")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("toasts 访问器暴露当前消息", () => {
    const toaster = createToaster();
    expect(toaster.toasts()).toEqual([]);
    toaster.show("一条");
    expect(toaster.toasts()).toHaveLength(1);
    expect(toaster.toasts()[0]).toMatchObject({ text: "一条", tone: "info" });
  });
});

describe("YToast", () => {
  it("渲染单条 toast", () => {
    render(() => <YToast toast={{ id: 1, text: "单条", tone: "success" }} />);
    const el = screen.getByText("单条");
    expect(el.className).toContain("yovo-toast");
    expect(el.className).toContain("yovo-toast--success");
  });
});
