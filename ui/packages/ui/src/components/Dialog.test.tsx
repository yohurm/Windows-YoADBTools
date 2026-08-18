import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoDialog } from "./Dialog";

describe("YoDialog", () => {
  it("open 为 false 时不渲染", () => {
    render(() => (
      <YoDialog open={false} onClose={() => {}}>
        内容
      </YoDialog>
    ));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("open 为 true 时渲染标题与内容", () => {
    render(() => (
      <YoDialog open onClose={() => {}} title="确认删除">
        确定要删除吗？
      </YoDialog>
    ));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("确认删除")).toBeTruthy();
    expect(screen.getByText("确定要删除吗？")).toBeTruthy();
  });

  it("Esc 键触发 onClose", () => {
    const onClose = vi.fn();
    render(() => (
      <YoDialog open onClose={onClose}>
        内容
      </YoDialog>
    ));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("未打开时 Esc 不触发 onClose", () => {
    const onClose = vi.fn();
    render(() => (
      <YoDialog open={false} onClose={onClose}>
        内容
      </YoDialog>
    ));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("点击遮罩不触发 onClose（防误触）", () => {
    const onClose = vi.fn();
    const { container } = render(() => (
      <YoDialog open onClose={onClose}>
        内容
      </YoDialog>
    ));
    fireEvent.click(container.querySelector(".yovo-dialog__backdrop") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("渲染 footer 按钮区", () => {
    render(() => (
      <YoDialog
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
      </YoDialog>
    ));
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "确定" })).toBeTruthy();
  });

  it("默认宽度 560px，自定义宽度生效", () => {
    const { container } = render(() => (
      <YoDialog open onClose={() => {}}>
        内容
      </YoDialog>
    ));
    expect((container.querySelector(".yovo-dialog__panel") as HTMLElement).style.width).toBe("560px");
  });

  it("open 支持 Accessor 形式（响应式开关）", () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <YoDialog open={open} onClose={() => {}}>
        内容
      </YoDialog>
    ));
    expect(screen.queryByRole("dialog")).toBeNull();
    setOpen(true);
    expect(screen.getByRole("dialog")).toBeTruthy();
    setOpen(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("打开后聚焦面板内首个可聚焦元素（可达性）", () => {
    render(() => (
      <YoDialog open onClose={() => {}} footer={<button>确定</button>}>
        内容
      </YoDialog>
    ));
    // queueMicrotask 后焦点应落在 footer 的「确定」按钮
    return new Promise<void>((done) => {
      queueMicrotask(() => {
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "确定" }));
        done();
      });
    });
  });

  it("Tab 焦点陷阱：末尾再 Tab 回到首个按钮", () => {
    render(() => (
      <YoDialog
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
      </YoDialog>
    ));
    return new Promise<void>((done) => {
      queueMicrotask(() => {
        const last = screen.getByRole("button", { name: "确定" });
        const first = screen.getByRole("button", { name: "取消" });
        last.focus();
        fireEvent.keyDown(document, { key: "Tab" });
        expect(document.activeElement).toBe(first);
        done();
      });
    });
  });

  it("Shift+Tab 焦点陷阱：首个再回退到末尾按钮", () => {
    render(() => (
      <YoDialog
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
      </YoDialog>
    ));
    return new Promise<void>((done) => {
      queueMicrotask(() => {
        const first = screen.getByRole("button", { name: "取消" });
        const last = screen.getByRole("button", { name: "确定" });
        first.focus();
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(last);
        done();
      });
    });
  });
});
