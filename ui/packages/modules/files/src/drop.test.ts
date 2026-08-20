import { describe, expect, it } from "vitest";

import { localBaseName, namesForDrag, resolveDropHit } from "./drop";

function el(tag: string, attrs: Record<string, string> = {}, children: HTMLElement[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) node.appendChild(child);
  return node;
}

function pageTree(): { page: HTMLElement; dirInner: HTMLElement; fileInner: HTMLElement; blank: HTMLElement; crumb: HTMLElement; chrome: HTMLElement; preview: HTMLElement } {
  const dirInner = el("div", { "data-kind": "dir", class: "yohu-files__row" });
  const dirRow = el("div", { "data-key": "DCIM", class: "yohu-virtual-list__row" }, [dirInner]);
  const fileInner = el("div", { "data-kind": "file", class: "yohu-files__row" });
  const fileRow = el("div", { "data-key": "a.txt", class: "yohu-virtual-list__row" }, [fileInner]);
  const blank = el("div", { class: "yohu-empty-state" });
  const crumb = el("button", { class: "yohu-files__crumb" });
  const list = el("div", { class: "yohu-files__table-list" }, [dirRow, fileRow, blank]);
  const explorer = el("div", { "data-drop": "files", class: "yohu-files__explorer" }, [
    el("div", { class: "yohu-files__path" }, [crumb]),
    list,
  ]);
  const chrome = el("div", { "data-drop": "ignore" }, [el("header")]);
  const preview = el("div", { "data-drop": "ignore", class: "yohu-files__preview-slot" }, [
    el("div", { class: "yohu-files__preview" }),
  ]);
  const transfer = el("div", { "data-drop": "ignore" }, [el("div", { class: "yohu-files__transfer" })]);
  const page = el("div", { class: "yohu-files" }, [chrome, explorer, preview, transfer]);
  document.body.appendChild(page);
  return { page, dirInner, fileInner, blank, crumb, chrome, preview };
}

describe("localBaseName", () => {
  it("Windows 文件与目录尾斜杠", () => {
    expect(localBaseName("C:\\Users\\a\\photo.png")).toBe("photo.png");
    expect(localBaseName("C:\\Users\\a\\DCIM\\")).toBe("DCIM");
  });

  it("POSIX 与无分隔符", () => {
    expect(localBaseName("/tmp/foo.txt")).toBe("foo.txt");
    expect(localBaseName("readme.md")).toBe("readme.md");
  });
});

describe("resolveDropHit", () => {
  it("目录行落入该目录；符号链接行同样落入该目录", () => {
    const { page, dirInner, fileInner, blank, crumb } = pageTree();
    expect(resolveDropHit(dirInner, page)).toEqual({ accept: true, dirName: "DCIM" });
    const linkInner = el("div", { "data-kind": "symlink", class: "yohu-files__row" });
    const linkRow = el("div", { "data-key": "linkdir", class: "yohu-virtual-list__row" }, [linkInner]);
    page.querySelector(".yohu-files__table-list")?.appendChild(linkRow);
    expect(resolveDropHit(linkInner, page)).toEqual({ accept: true, dirName: "linkdir" });
    expect(resolveDropHit(fileInner, page)).toEqual({ accept: true, dirName: null });
    expect(resolveDropHit(blank, page)).toEqual({ accept: true, dirName: null });
    expect(resolveDropHit(crumb, page)).toEqual({ accept: true, dirName: null });
    page.remove();
  });

  it("铬、预览、传输、页外拒绝", () => {
    const { page, chrome, preview } = pageTree();
    const outside = el("div", { class: "yohu-logs" });
    document.body.appendChild(outside);
    expect(resolveDropHit(chrome.querySelector("header"), page)).toEqual({ accept: false });
    expect(resolveDropHit(preview.firstElementChild, page)).toEqual({ accept: false });
    expect(resolveDropHit(outside, page)).toEqual({ accept: false });
    expect(resolveDropHit(null, page)).toEqual({ accept: false });
    expect(resolveDropHit(page, null)).toEqual({ accept: false });
    outside.remove();
    page.remove();
  });
});

describe("namesForDrag", () => {
  it("拖已选项带走全部选中；拖未选项只带该项", () => {
    expect(namesForDrag(["a.txt", "b.txt"], "a.txt")).toEqual(["a.txt", "b.txt"]);
    expect(namesForDrag(["a.txt", "b.txt"], "c.txt")).toEqual(["c.txt"]);
    expect(namesForDrag([], "solo.txt")).toEqual(["solo.txt"]);
  });
});
