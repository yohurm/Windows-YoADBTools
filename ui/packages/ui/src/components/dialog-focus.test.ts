import { describe, expect, it } from "vitest";

import { dialogTabTarget } from "./dialog-focus";

function el(id: string): HTMLElement {
  const node = document.createElement("button");
  node.id = id;
  return node;
}

describe("dialog-focus", () => {
  it("Tab 在首尾循环，中间不拦截", () => {
    const panel = document.createElement("div");
    const a = el("a");
    const b = el("b");
    const c = el("c");
    panel.append(a, b, c);
    const items = [a, b, c];

    expect(dialogTabTarget(items, panel, a, false)).toBeNull();
    expect(dialogTabTarget(items, panel, c, false)).toBe(a);
    expect(dialogTabTarget(items, panel, a, true)).toBe(c);
    expect(dialogTabTarget(items, panel, b, true)).toBeNull();
    expect(dialogTabTarget(items, panel, document.createElement("div"), false)).toBe(a);
  });

  it("无焦点项时不给出目标", () => {
    const panel = document.createElement("div");
    expect(dialogTabTarget([], panel, null, false)).toBeNull();
  });
});
