import { describe, expect, it, vi } from "vitest";

import { logsRowMenu, logsTabMenu } from "./menu";

describe("logsTabMenu", () => {
  it("三项固定：重命名 / 复制会话 / 关闭其他", () => {
    const ctx = { rename: vi.fn(), duplicate: vi.fn(), closeOthers: vi.fn() };
    expect(logsTabMenu.items(ctx).map((item) => item.id)).toEqual(["rename", "duplicate", "close-others"]);
    logsTabMenu.onSelect("duplicate", ctx);
    expect(ctx.duplicate).toHaveBeenCalledTimes(1);
  });
});

describe("logsRowMenu", () => {
  it("无可复制行时禁用；选中后 copy 调 ctx", () => {
    const copy = vi.fn();
    expect(logsRowMenu.items({ canCopy: false, copy })[0]?.disabled).toBe(true);
    logsRowMenu.onSelect("copy", { canCopy: true, copy });
    expect(copy).toHaveBeenCalledTimes(1);
  });
});
