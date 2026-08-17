import { describe, expect, it } from "vitest";

import type { RemoteEntry } from "@yovo/api";

import { fileCategory, fileTypeLabel, formatSize, joinPath, parentOf, sortEntries, splitPath } from "./store";

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

describe("splitPath（面包屑分段）", () => {
  it("多级路径分段", () => {
    expect(splitPath("/storage/emulated/0")).toEqual(["storage", "emulated", "0"]);
  });
  it("根路径为空段", () => {
    expect(splitPath("/")).toEqual([]);
    expect(splitPath("")).toEqual([]);
  });
  it("尾部斜杠不产生空段", () => {
    expect(splitPath("/sdcard/DCIM/")).toEqual(["sdcard", "DCIM"]);
  });
});

describe("fileCategory（扩展名分类色）", () => {
  it("APK/AAB", () => {
    expect(fileCategory("app.apk")).toBe("apk");
    expect(fileCategory("bundle.AAB")).toBe("apk");
  });
  it("媒体", () => {
    expect(fileCategory("photo.PNG")).toBe("media");
    expect(fileCategory("movie.mp4")).toBe("media");
    expect(fileCategory("song.flac")).toBe("media");
  });
  it("文档", () => {
    expect(fileCategory("report.pdf")).toBe("doc");
    expect(fileCategory("data.json")).toBe("doc");
    expect(fileCategory("sys.log")).toBe("doc");
  });
  it("归档与其他", () => {
    expect(fileCategory("pack.zip")).toBe("archive");
    expect(fileCategory("unknown.xyz")).toBe("other");
    expect(fileCategory("noext")).toBe("other");
  });
});

describe("fileTypeLabel（类型列）", () => {
  it("目录/链接/扩展名/无扩展名", () => {
    const base = { size: 0, permission: "-rw-r--r--" };
    expect(fileTypeLabel({ ...base, name: "DCIM", kind: "dir" })).toBe("文件夹");
    expect(fileTypeLabel({ ...base, name: "link", kind: "symlink" })).toBe("链接");
    expect(fileTypeLabel({ ...base, name: "a.apk", kind: "file" })).toBe("APK");
    expect(fileTypeLabel({ ...base, name: "README", kind: "file" })).toBe("文件");
  });
});
