import { describe, expect, it } from "vitest";

import type { RemoteEntry } from "@yovo/api";

import { formatSize, joinPath, parentOf, sortEntries } from "./store";

describe("joinPath", () => {
  it("根目录拼接", () => {
    expect(joinPath("/", "DCIM")).toBe("/DCIM");
  });
  it("普通目录拼接（去尾斜杠）", () => {
    expect(joinPath("/sdcard/", "a")).toBe("/sdcard/a");
    expect(joinPath("/sdcard", "a")).toBe("/sdcard/a");
  });
});

describe("parentOf", () => {
  it("根目录无上级", () => {
    expect(parentOf("/")).toBeNull();
    expect(parentOf("/sdcard")).toBe("/");
  });
  it("多级返回上级", () => {
    expect(parentOf("/sdcard/DCIM/Camera")).toBe("/sdcard/DCIM");
    expect(parentOf("/sdcard/DCIM/")).toBe("/sdcard");
  });
});

describe("sortEntries", () => {
  const e = (name: string, kind: RemoteEntry["kind"]): RemoteEntry => ({
    name,
    kind,
    size: 0,
    permission: "-rw-r--r--",
  });

  it("目录优先 + 名称排序", () => {
    const sorted = sortEntries([e("b.txt", "file"), e("Alarms", "dir"), e("a.txt", "file"), e("DCIM", "dir")]);
    expect(sorted.map((x) => x.name)).toEqual(["Alarms", "DCIM", "a.txt", "b.txt"]);
  });
});

describe("formatSize", () => {
  it("B/KB/MB/GB 阶梯", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatSize(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });
});
