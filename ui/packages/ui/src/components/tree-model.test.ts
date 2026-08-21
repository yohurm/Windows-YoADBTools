import { describe, expect, it } from "vitest";

import { flattenVisible, parentIndex, treeKeyIntent } from "./tree-model";

const TREE = [
  {
    key: "g",
    children: [{ key: "a" }, { key: "b", children: [{ key: "b1" }] }],
  },
  { key: "c" },
];

describe("tree-model", () => {
  it("只扁平化已展开子树", () => {
    const collapsed = flattenVisible(TREE, () => false).map((r) => r.node.key);
    expect(collapsed).toEqual(["g", "c"]);
    const openG = flattenVisible(TREE, (key) => key === "g").map((r) => `${r.node.key}:${r.depth}`);
    expect(openG).toEqual(["g:0", "a:1", "b:1", "c:0"]);
  });

  it("parentIndex 找到更浅一层", () => {
    const rows = flattenVisible(TREE, (key) => key === "g" || key === "b");
    const b1 = rows.findIndex((r) => r.node.key === "b1");
    expect(parentIndex(rows, b1)).toBe(rows.findIndex((r) => r.node.key === "b"));
    expect(parentIndex(rows, 0)).toBeNull();
  });

  it("键盘：展开/收起/选中", () => {
    expect(treeKeyIntent("ArrowRight", 0, 3, true, false)).toEqual({ type: "toggle" });
    expect(treeKeyIntent("ArrowRight", 0, 3, true, true)).toEqual({ type: "focus", index: 1 });
    expect(treeKeyIntent("ArrowLeft", 0, 3, true, true)).toEqual({ type: "toggle" });
    expect(treeKeyIntent("ArrowLeft", 1, 3, false, false)).toEqual({ type: "parent" });
    expect(treeKeyIntent("Enter", 1, 3, false, false)).toEqual({ type: "select" });
    expect(treeKeyIntent("ArrowDown", 2, 3, false, false)).toEqual({ type: "focus", index: 2 });
  });
});
