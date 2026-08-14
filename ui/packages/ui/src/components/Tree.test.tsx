import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YTree } from "./Tree";

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

describe("YTree", () => {
  it("默认折叠：仅渲染根节点", () => {
    render(() => <YTree data={DATA} />);
    expect(screen.getByText("根1")).toBeTruthy();
    expect(screen.getByText("根2")).toBeTruthy();
    expect(screen.queryByText("子1")).toBeNull();
  });

  it("点击展开箭头显示子节点，点击节点触发 onSelect", () => {
    const onSelect = vi.fn();
    render(() => <YTree data={DATA} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText("expand"));
    expect(screen.getByText("子1")).toBeTruthy();
    fireEvent.click(screen.getByText("子1"));
    expect(onSelect).toHaveBeenCalledWith("c1", expect.objectContaining({ key: "c1" }));
  });

  it("defaultExpandedKeys 默认展开", () => {
    render(() => <YTree data={DATA} defaultExpandedKeys={["root1"]} />);
    expect(screen.getByText("子1")).toBeTruthy();
    expect(screen.getByText("子2")).toBeTruthy();
  });

  it("受控 expandedKeys 决定展开状态", () => {
    render(() => <YTree data={DATA} expandedKeys={["root1"]} />);
    expect(screen.getByText("子2")).toBeTruthy();
  });
});
