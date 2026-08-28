import { describe, expect, it } from "vitest";

import {
  allKeys,
  adjacentJoin,
  attachPanelKeys,
  eventKey,
  isCommandModifier,
  isEditableTarget,
  isModKey,
  matchBindings,
  matchesChord,
  modPlatform,
  nextKeys,
  panelKeyContext,
  pointerSelectMode,
  whenIdle,
  whenList,
  whenPanel,
  whenPanelOrField,
  type KeyBinding,
  type PanelKeyContext,
} from "./index";

function keyEvent(init: Pick<KeyboardEventInit, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey">): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

describe("chord", () => {
  it("空格与修饰键归一", () => {
    expect(eventKey(keyEvent({ key: " " }))).toBe("space");
    expect(eventKey(keyEvent({ key: "A", ctrlKey: true }))).toBe("a");
    expect(matchesChord(keyEvent({ key: "a", ctrlKey: true }), { key: "a", ctrl: true })).toBe(true);
    expect(matchesChord(keyEvent({ key: "a", ctrlKey: true }), { key: "a" })).toBe(false);
    expect(matchesChord(keyEvent({ key: " " }), { key: "space" })).toBe(true);
  });

  it("命令修饰键平台语义：macOS=Cmd(meta)，其余=Ctrl", () => {
    // Windows/Linux：metaKey(Win 键) 不再是命令修饰键，避免 Win+F 误配 Ctrl+F。
    expect(isCommandModifier("other", keyEvent({ key: "f", ctrlKey: true }))).toBe(true);
    expect(isCommandModifier("other", keyEvent({ key: "f", metaKey: true }))).toBe(false);
    expect(isCommandModifier("other", keyEvent({ key: "f" }))).toBe(false);
    // macOS：Cmd(meta) 作为命令修饰键；字面 Ctrl 不算。
    expect(isCommandModifier("mac", keyEvent({ key: "f", metaKey: true }))).toBe(true);
    expect(isCommandModifier("mac", keyEvent({ key: "f", ctrlKey: true }))).toBe(false);
  });

  it("matchesChord 对 ctrl:true 绑定只认当前平台命令修饰键（Win 键不触发）", () => {
    // 绑定 ctrl:true：在 Windows 上 Ctrl+F 命中，Win+F 不命中。
    const chord = { key: "f", ctrl: true };
    expect(matchesChord(keyEvent({ key: "f", ctrlKey: true }), chord)).toBe(true);
    expect(matchesChord(keyEvent({ key: "f", metaKey: true }), chord)).toBe(false);
  });

  it("isModKey 委托给运行时平台：jsdom(非 macOS) 下 Win 键不算命令修饰键", () => {
    expect(modPlatform()).toBe("other"); // jsdom 环境固定为非 macOS，与应用目标 Windows 一致
    expect(isModKey(keyEvent({ key: "f", ctrlKey: true }))).toBe(true);
    expect(isModKey(keyEvent({ key: "f", metaKey: true }))).toBe(false);
    expect(isModKey(keyEvent({ key: "f" }))).toBe(false);
  });
});

describe("selection", () => {
  it("replace / toggle / range / all / 指针模式", () => {
    const ordered = ["a", "b", "c", "d"];
    expect(nextKeys(ordered, new Set(), null, "b", "replace")).toEqual({ keys: new Set(["b"]), pivot: "b" });
    expect(nextKeys(ordered, new Set(["b"]), "b", "b", "toggle").keys.has("b")).toBe(false);
    expect([...nextKeys(ordered, new Set(["b"]), "b", "d", "range").keys]).toEqual(["b", "c", "d"]);
    expect(allKeys(ordered).size).toBe(4);
    expect(pointerSelectMode(keyEvent({ key: "a", shiftKey: true }))).toBe("range");
    expect(pointerSelectMode(keyEvent({ key: "a", ctrlKey: true }))).toBe("toggle");
    expect(pointerSelectMode()).toBe("replace");
  });

  it("adjacentJoin：连续选中块的起/中/迄", () => {
    expect(adjacentJoin(false, true, true)).toBeNull();
    expect(adjacentJoin(true, false, false)).toBe("solo");
    expect(adjacentJoin(true, false, true)).toBe("start");
    expect(adjacentJoin(true, true, true)).toBe("middle");
    expect(adjacentJoin(true, true, false)).toBe("end");
  });
});

function ctx(over: Partial<PanelKeyContext> = {}): PanelKeyContext {
  return {
    inPanel: true,
    inList: false,
    inEditable: false,
    inDialog: false,
    inShell: false,
    inActionable: false,
    ...over,
  };
}

describe("scope + bindings", () => {
  type Act = "select-all" | "find" | "clear" | "pause";
  const bindings: KeyBinding<Act>[] = [
    { action: "pause", key: "space", when: whenIdle },
    { action: "select-all", key: "a", ctrl: true, when: whenList },
    { action: "find", key: "f", ctrl: true, when: whenPanelOrField },
    { action: "clear", key: "l", ctrl: true, when: whenPanel },
  ];

  it("列表 Ctrl+A；过滤框放行 Ctrl+A 但仍可 Ctrl+F；对话框全挡", () => {
    const list = ctx({ inList: true });
    const field = ctx({ inEditable: true });
    const dialog = ctx({ inDialog: true });
    const rail = ctx({ inPanel: false });
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), list, bindings)).toBe("select-all");
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), field, bindings)).toBeNull();
    expect(matchBindings(keyEvent({ key: "f", ctrlKey: true }), field, bindings)).toBe("find");
    expect(matchBindings(keyEvent({ key: "l", ctrlKey: true }), field, bindings)).toBeNull();
    expect(matchBindings(keyEvent({ key: "w", ctrlKey: true }), dialog, bindings)).toBeNull();
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), rail, bindings)).toBeNull();
  });

  it("whenIdle：空闲区 Space；按钮与侧栏不抢", () => {
    expect(matchBindings(keyEvent({ key: " " }), ctx(), bindings)).toBe("pause");
    expect(matchBindings(keyEvent({ key: " " }), ctx({ inList: true }), bindings)).toBe("pause");
    expect(matchBindings(keyEvent({ key: " " }), ctx({ inActionable: true }), bindings)).toBeNull();
    expect(matchBindings(keyEvent({ key: " " }), ctx({ inShell: true }), bindings)).toBeNull();
    expect(matchBindings(keyEvent({ key: "l", ctrlKey: true }), ctx({ inShell: true }), bindings)).toBe("clear");
  });

  it("panelKeyContext 用页面传入的 listSelector", () => {
    const panel = document.createElement("div");
    const list = document.createElement("div");
    list.className = "yohu-files__table-list";
    const row = document.createElement("div");
    const input = document.createElement("input");
    list.append(row);
    panel.append(list, input);
    document.body.append(panel);
    expect(panelKeyContext(panel, row, { listSelector: ".yohu-files__table-list" }).inList).toBe(true);
    expect(panelKeyContext(panel, input, { listSelector: ".yohu-files__table-list" }).inEditable).toBe(true);
    expect(isEditableTarget(input)).toBe(true);
    expect(panelKeyContext(null, input, { listSelector: ".yohu-logs__list", ownership: "host" }).inPanel).toBe(true);
    expect(panelKeyContext(null, input, { listSelector: ".yohu-logs__list", ownership: "host" }).inList).toBe(false);
    panel.remove();
  });
});

describe("attachPanelKeys", () => {
  it("命中则 preventDefault 并回调；未命中不拦截", () => {
    const root = document.createElement("div");
    const list = document.createElement("div");
    list.className = "yohu-logs__list";
    const row = document.createElement("div");
    list.append(row);
    root.append(list);
    document.body.append(root);
    const seen: string[] = [];
    const stop = attachPanelKeys(root, {
      listSelector: ".yohu-logs__list",
      bindings: [{ action: "select-all", key: "a", ctrl: true, when: whenList }],
      onAction: (action) => seen.push(action),
    });
    const hit = new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true });
    row.dispatchEvent(hit);
    expect(hit.defaultPrevented).toBe(true);
    expect(seen).toEqual(["select-all"]);
    const miss = new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true });
    row.dispatchEvent(miss);
    expect(miss.defaultPrevented).toBe(false);
    stop();
    root.remove();
  });

  it("host 模式：焦点不在列表也拦截内容键；Space 不抢按钮", () => {
    const seen: string[] = [];
    const stop = attachPanelKeys(window, {
      ownership: "host",
      listSelector: ".yohu-logs__list",
      bindings: [
        { action: "select-all", key: "a", ctrl: true, when: whenPanel },
        { action: "pause", key: "space", when: whenIdle },
      ],
      onAction: (action) => seen.push(action),
    });
    const chrome = document.createElement("div");
    const button = document.createElement("button");
    document.body.append(chrome, button);
    const hit = new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true });
    chrome.dispatchEvent(hit);
    expect(hit.defaultPrevented).toBe(true);
    expect(seen).toEqual(["select-all"]);
    const spaceBtn = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    button.dispatchEvent(spaceBtn);
    expect(spaceBtn.defaultPrevented).toBe(false);
    const spaceIdle = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    chrome.dispatchEvent(spaceIdle);
    expect(spaceIdle.defaultPrevented).toBe(true);
    expect(seen).toEqual(["select-all", "pause"]);
    stop();
    chrome.remove();
    button.remove();
  });
});
