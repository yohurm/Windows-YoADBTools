import { describe, expect, it } from "vitest";

import { effectivePath, splitPathEnds } from "./path-display";

describe("effectivePath", () => {
  it("已配置值优先于解析回退", () => {
    expect(effectivePath("C:\\tools\\adb.exe", "C:\\auto\\adb.exe")).toBe("C:\\tools\\adb.exe");
  });

  it("空值与空白回退到绝对路径", () => {
    expect(effectivePath("", "C:\\Users\\me\\YohuAdbTools\\data")).toBe(
      "C:\\Users\\me\\YohuAdbTools\\data",
    );
    expect(effectivePath("   ", "D:\\data")).toBe("D:\\data");
  });
});

describe("splitPathEnds", () => {
  it("Windows 路径保留末段，目录进 head", () => {
    expect(
      splitPathEnds("C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data\\tools\\adb\\adb.exe"),
    ).toEqual({
      head: "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data\\tools\\adb\\",
      tail: "adb.exe",
    });
  });

  it("目录路径末段为最后一级", () => {
    expect(splitPathEnds("C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data")).toEqual({
      head: "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\",
      tail: "data",
    });
  });

  it("无分隔符整段作为 tail", () => {
    expect(splitPathEnds("adb.exe")).toEqual({ head: "", tail: "adb.exe" });
  });

  it("空路径", () => {
    expect(splitPathEnds("")).toEqual({ head: "", tail: "" });
  });
});
