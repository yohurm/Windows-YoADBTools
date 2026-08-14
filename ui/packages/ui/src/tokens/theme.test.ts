import { beforeEach, describe, expect, it } from "vitest";
import { getTheme, setTheme } from "./index";

describe("主题切换 setTheme / getTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("setTheme(dark) 给 documentElement 设置 data-theme", () => {
    setTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(getTheme()).toBe("dark");
  });

  it("未设置时默认 light", () => {
    expect(getTheme()).toBe("light");
  });

  it("setTheme(light) 覆盖回 light", () => {
    setTheme("dark");
    setTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(getTheme()).toBe("light");
  });
});
