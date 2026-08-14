import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YDialog } from "./Dialog";

describe("YDialog", () => {
  it("open 为 false 时不渲染", () => {
    render(() => (
      <YDialog open={false} onClose={() => {}}>
        内容
      </YDialog>
    ));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("open 为 true 时渲染标题与内容", () => {
    render(() => (
      <YDialog open onClose={() => {}} title="确认删除">
        确定要删除吗？
      </YDialog>
    ));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("确认删除")).toBeTruthy();
    expect(screen.getByText("确定要删除吗？")).toBeTruthy();
  });

  it("Esc 键触发 onClose", () => {
    const onClose = vi.fn();
    render(() => (
      <YDialog open onClose={onClose}>
        内容
      </YDialog>
    ));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("未打开时 Esc 不触发 onClose", () => {
    const onClose = vi.fn();
    render(() => (
      <YDialog open={false} onClose={onClose}>
        内容
      </YDialog>
    ));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("点击遮罩不触发 onClose（防误触）", () => {
    const onClose = vi.fn();
    const { container } = render(() => (
      <YDialog open onClose={onClose}>
        内容
      </YDialog>
    ));
    fireEvent.click(container.querySelector(".yovo-dialog__backdrop") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("渲染 footer 按钮区", () => {
    render(() => (
      <YDialog
        open
        onClose={() => {}}
        footer={
          <>
            <button>取消</button>
            <button>确定</button>
          </>
        }
      >
        内容
      </YDialog>
    ));
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "确定" })).toBeTruthy();
  });

  it("默认宽度 560px，自定义宽度生效", () => {
    const { container } = render(() => (
      <YDialog open onClose={() => {}}>
        内容
      </YDialog>
    ));
    expect((container.querySelector(".yovo-dialog__panel") as HTMLElement).style.width).toBe("560px");
  });

  it("open 支持 Accessor 形式（响应式开关）", () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <YDialog open={open} onClose={() => {}}>
        内容
      </YDialog>
    ));
    expect(screen.queryByRole("dialog")).toBeNull();
    setOpen(true);
    expect(screen.getByRole("dialog")).toBeTruthy();
    setOpen(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
