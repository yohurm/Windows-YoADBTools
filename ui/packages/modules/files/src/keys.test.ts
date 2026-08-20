import { describe, expect, it } from "vitest";

import { matchBindings, type PanelKeyContext } from "@yohu/ui";

import { copyRemotePaths, FILES_KEY_BINDINGS } from "./keys";

function keyEvent(init: Pick<KeyboardEventInit, "key" | "ctrlKey">): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

describe("FILES_KEY_BINDINGS", () => {
  const ctx = (over: Partial<PanelKeyContext> = {}): PanelKeyContext => ({
    inPanel: true,
    inList: false,
    inEditable: false,
    inDialog: false,
    inShell: false,
    inActionable: false,
    ...over,
  });
  const list = ctx({ inList: true });
  const field = ctx({ inEditable: true });
  const chrome = ctx();
  const rail = ctx({ inPanel: false });

  it("列表 Ctrl+A/C、Delete、Enter、Backspace；F5 在面板铬；输入框与侧栏不生效", () => {
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), list, FILES_KEY_BINDINGS)).toBe("select-all");
    expect(matchBindings(keyEvent({ key: "c", ctrlKey: true }), list, FILES_KEY_BINDINGS)).toBe("copy");
    expect(matchBindings(keyEvent({ key: "Delete" }), list, FILES_KEY_BINDINGS)).toBe("delete");
    expect(matchBindings(keyEvent({ key: "Enter" }), list, FILES_KEY_BINDINGS)).toBe("open");
    expect(matchBindings(keyEvent({ key: "Backspace" }), list, FILES_KEY_BINDINGS)).toBe("go-up");
    expect(matchBindings(keyEvent({ key: "F5" }), chrome, FILES_KEY_BINDINGS)).toBe("refresh");
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), field, FILES_KEY_BINDINGS)).toBeNull();
    expect(matchBindings(keyEvent({ key: "Delete" }), field, FILES_KEY_BINDINGS)).toBeNull();
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), rail, FILES_KEY_BINDINGS)).toBeNull();
  });
});

describe("copyRemotePaths", () => {
  it("拼当前目录下的远程绝对路径", () => {
    expect(copyRemotePaths("/sdcard", ["a.txt", "DCIM"])).toBe("/sdcard/a.txt\n/sdcard/DCIM");
  });
});
