import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoTree } from "./Tree";

const DATA = [
  {
    key: "root1",
    label: "根1",
    children: [
      { key: "c1", label: "子1" },
      { key: "c2", label: "子2" },
    ],
  },
  { key: "root2", label: "根2" },
];

describe("YoTree", () => {
  it("默认折叠：仅可见根节点（子节点 aria-hidden）", () => {
    render(() => <YoTree data={DATA} />);
    expect(screen.getByText("根1")).toBeTruthy();
    expect(screen.getByText("根2")).toBeTruthy();
    const child = document.querySelector('[data-tree-key="c1"]');
    expect(child?.closest(".yohu-collapse__inner")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("点击展开箭头显示子节点并选中该目录", () => {
    const onSelect = vi.fn();
    render(() => <YoTree data={DATA} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText("expand"));
    expect(screen.getByText("子1")).toBeTruthy();
    expect(onSelect).toHaveBeenCalledWith("root1", expect.objectContaining({ key: "root1" }));
    fireEvent.click(screen.getByText("子1"));
    expect(onSelect).toHaveBeenCalledWith("c1", expect.objectContaining({ key: "c1" }));
  });

  it("defaultExpandedKeys 默认展开", () => {
    render(() => <YoTree data={DATA} defaultExpandedKeys={["root1"]} />);
    expect(screen.getByText("子1")).toBeTruthy();
    expect(screen.getByText("子2")).toBeTruthy();
  });

  it("受控 expandedKeys 决定展开状态", () => {
    render(() => <YoTree data={DATA} expandedKeys={["root1"]} />);
    expect(screen.getByText("子2")).toBeTruthy();
  });

  it("键盘 → 展开，← 收起", () => {
    render(() => <YoTree data={DATA} />);
    const tree = screen.getByRole("tree");
    // 初始焦点在首个可见节点（root1）
    tree.focus();
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(screen.getByText("子1")).toBeTruthy();
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(document.querySelector('[data-tree-key="c1"]')?.closest(".yohu-collapse__inner")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("键盘 ↓ 移动焦点（roving tabindex），Enter 选中", () => {
    const onSelect = vi.fn();
    render(() => <YoTree data={DATA} defaultExpandedKeys={["root1"]} onSelect={onSelect} />);
    const tree = screen.getByRole("tree");
    tree.focus();
    fireEvent.keyDown(tree, { key: "ArrowDown" }); // root1 → 子1
    expect(document.activeElement?.getAttribute("data-tree-key")).toBe("c1");
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("c1", expect.objectContaining({ key: "c1" }));
  });

  it("点击选中只挂 yohu-interactive--selected，不另写选中色 class 配方", () => {
    render(() => <YoTree data={DATA} />);
    fireEvent.click(screen.getByText("根2"));
    const row = document.querySelector('[data-tree-key="root2"]');
    expect(row?.classList.contains("yohu-interactive--selected")).toBe(true);
    expect(row?.classList.contains("yohu-tree__row--selected")).toBe(false);
    expect(row?.getAttribute("aria-selected")).toBe("true");
  });

  it("键盘 ← 未展开时跳到父节点", () => {
    render(() => <YoTree data={DATA} defaultExpandedKeys={["root1"]} />);
    const tree = screen.getByRole("tree");
    tree.focus();
    fireEvent.keyDown(tree, { key: "ArrowDown" }); // 焦点到子1
    fireEvent.keyDown(tree, { key: "ArrowLeft" }); // 未展开 → 父 root1
    expect(document.activeElement?.getAttribute("data-tree-key")).toBe("root1");
  });
});
