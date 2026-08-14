import { describe, expect, it } from "vitest";

import { fillPlaceholders } from "./store";

describe("fillPlaceholders", () => {
  it("按索引替换", () => {
    expect(fillPlaceholders("ping -c 3 {0}", ["8.8.8.8"])).toBe("ping -c 3 8.8.8.8");
  });

  it("多个占位符顺序替换", () => {
    expect(fillPlaceholders("{0} {1} {0}", ["a", "b"])).toBe("a b a");
  });

  it("无占位符原样返回", () => {
    expect(fillPlaceholders("getprop ro.build.version", [])).toBe("getprop ro.build.version");
  });
});
