import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoDialog } from "./Dialog";
import { YoSelect } from "./Select";

const OPTIONS = [
  { value: "a", label: "选项A" },
  { value: "b", label: "选项B" },
  { value: "c", label: "选项C" },
];

describe("YoSelect", () => {
  it("点击展开并选择选项（onChange + 关闭）", () => {
    const onChange = vi.fn();
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /请选择/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.click(screen.getByText("选项B"));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("显示当前选中值", () => {
    render(() => <YoSelect options={OPTIONS} value="c" />);
    expect(screen.getByText("选项C")).toBeTruthy();
  });

  it("Esc 关闭下拉", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("点击外部关闭下拉", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("键盘：Enter 展开，↓ 移动活动项，Enter 提交", () => {
    const onChange = vi.fn();
    render(() => <YoSelect options={OPTIONS} value="a" placeholder="请选择" onChange={onChange} />);
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    // 初始活动项 = 当前选中 a；↓ 到 b
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe("yohu-option-b");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("键盘：闭合态 ↓ 直接展开；Esc 关闭并回焦触发钮", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("展开后选中项标签可见且带 selected 态（含空字符串 value）", () => {
    const levels = [
      { value: "", label: "全部" },
      { value: "V", label: "V" },
      { value: "E", label: "E" },
    ];
    render(() => <YoSelect options={levels} value="" />);
    fireEvent.click(screen.getByRole("button", { name: /全部/ }));
    const selected = screen.getByRole("option", { name: "全部" });
    expect(selected.textContent).toBe("全部");
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expect(selected.classList.contains("yohu-interactive--selected")).toBe(true);
    expect(selected.classList.contains("yohu-select__option--selected")).toBe(false);
    expect(selected.querySelector(".yohu-select__option-label")?.textContent).toBe("全部");
    expect(screen.getByRole("button").getAttribute("aria-activedescendant")).toBe("yohu-option-empty");
  });

  it("菜单 Portal 到 body，定位写在独立 layer 上", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    fireEvent.click(screen.getByRole("button"));
    const listbox = screen.getByRole("listbox");
    const layer = listbox.parentElement;
    expect(listbox.closest(".yohu-select")).toBeNull();
    expect(layer?.classList.contains("yohu-select__layer")).toBe(true);
    expect(layer?.getAttribute("data-placement")).toMatch(/^(top|bottom)$/);
    expect(layer?.getAttribute("data-placed")).toBe("true");
    expect(layer?.style.position).toBe("fixed");
    expect(layer?.style.width).toBe("");
    expect(layer?.style.minWidth).not.toBe("");
    expect(layer?.hasAttribute("data-overflow-y")).toBe(false);
  });

  it("触发钮贴视口底时向上展开，不往下撑", () => {
    const viewport = {
      width: 800,
      height: 600,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 600);
    vi.stubGlobal("innerWidth", 800);
    try {
      render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
      const trigger = screen.getByRole("button");
      vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
        x: 100,
        y: 560,
        top: 560,
        left: 100,
        bottom: 592,
        right: 220,
        width: 120,
        height: 32,
        toJSON: () => ({}),
      } as DOMRect);
      fireEvent.click(trigger);
      const listbox = screen.getByRole("listbox");
      const layer = listbox.parentElement;
      expect(listbox.getAttribute("data-placement")).toBe("top");
      expect(layer?.style.top).toBe("auto");
      expect(Number.parseFloat(layer?.style.bottom ?? "")).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("非空 value 的选中项同样标签可见且带 selected 态", () => {
    render(() => <YoSelect options={OPTIONS} value="c" />);
    fireEvent.click(screen.getByRole("button", { name: /选项C/ }));
    const selected = screen.getByRole("option", { name: "选项C" });
    expect(selected.textContent).toBe("选项C");
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expect(selected.classList.contains("yohu-interactive--selected")).toBe(true);
  });

  it("键盘：Home/End 跳到首尾活动项", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "End" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe("yohu-option-c");
    fireEvent.keyDown(trigger, { key: "Home" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe("yohu-option-a");
  });

  it("展开时 Esc 只关下拉，不关闭外层 Dialog", () => {
    const onClose = vi.fn();
    render(() => (
      <YoDialog open title="弹窗" onClose={onClose}>
        <YoSelect options={OPTIONS} placeholder="请选择" />
      </YoDialog>
    ));
    fireEvent.click(screen.getByRole("button", { name: /请选择/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("逐层退出：菜单关闭后下一次 Esc 才关闭外层 Dialog", () => {
    const onClose = vi.fn();
    render(() => (
      <YoDialog open title="弹窗" onClose={onClose}>
        <YoSelect options={OPTIONS} placeholder="请选择" />
      </YoDialog>
    ));
    // 第 1 次 Esc：只关最内浮层（Select），Dialog 保持打开
    fireEvent.click(screen.getByRole("button", { name: /请选择/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    // 第 2 次 Esc：现在 Select 已关，事件到达 Dialog，逐层退出
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("键盘：展开态 Tab 提交活动选项并关闭，不依赖浏览器默认迁移", () => {
    const onChange = vi.fn();
    render(() => (
      <YoSelect options={OPTIONS} value="a" placeholder="请选择" onChange={onChange} />
    ));
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe("yohu-option-b");
    fireEvent.keyDown(trigger, { key: "Tab" });
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("触发钮可访问名是选中文案，不是空盒子", () => {
    render(() => (
      <YoSelect
        options={[{ value: "s", label: "Nori Family Hub · 5c62" }]}
        value="s"
      />
    ));
    const trigger = screen.getByRole("button", { name: "Nori Family Hub · 5c62" });
    expect(trigger.querySelector(".yohu-select__value")?.textContent).toBe("Nori Family Hub · 5c62");
    expect(trigger.classList.contains("yohu-select__trigger")).toBe(true);
  });

  it("block 拉满父级", () => {
    const { container } = render(() => <YoSelect block options={OPTIONS} value="a" />);
    expect(container.querySelector(".yohu-select")?.classList.contains("yohu-select--block")).toBe(true);
  });
});

describe("YoSelect 触发布局契约", () => {
  it("min-width 写在触发钮，不写在根上，避免短文案按钮偏左", () => {
    const candidates = [
      resolve(process.cwd(), "src/components/Select.css"),
      resolve(process.cwd(), "packages/ui/src/components/Select.css"),
    ];
    const css = candidates.map((p) => (existsSync(p) ? readFileSync(p, "utf-8") : "")).find(Boolean) ?? "";
    expect(css.length).toBeGreaterThan(0);
    const root = css.match(/^\.yohu-select\s*\{([^}]*)\}/m)?.[1] ?? "";
    const trigger = css.match(/^\.yohu-select__trigger\s*\{([^}]*)\}/m)?.[1] ?? "";
    expect(root).not.toMatch(/min-width/);
    expect(trigger).toMatch(/min-width:\s*calc\(var\(--yohu-space-xl\) \* 5\)/);
    const value = css.match(/^\.yohu-select__value\s*\{([^}]*)\}/m)?.[1] ?? "";
    expect(value).toMatch(/flex:\s*1 1 auto/);
  });
});
