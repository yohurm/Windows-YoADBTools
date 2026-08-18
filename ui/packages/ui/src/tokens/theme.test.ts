import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTheme, getThemePreference, setTheme } from "./index";

function mockScheme(dark: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: dark && query.includes("dark"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

describe("主题切换 setTheme / getTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-pref");
    mockScheme(false);
  });

  afterEach(() => {
    setTheme("light");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-pref");
  });

  it("setTheme(dark) 给 documentElement 设置 data-theme", () => {
    setTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme-pref")).toBe("dark");
    expect(getTheme()).toBe("dark");
    expect(getThemePreference()).toBe("dark");
  });

  it("未设置时默认 light", () => {
    expect(getTheme()).toBe("light");
    expect(getThemePreference()).toBe("light");
  });

  it("setTheme(light) 覆盖回 light", () => {
    setTheme("dark");
    setTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(getTheme()).toBe("light");
  });

  it("setTheme(system) 跟随 prefers-color-scheme", () => {
    mockScheme(true);
    setTheme("system");
    expect(getThemePreference()).toBe("system");
    expect(getTheme()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setTheme(system) 浅色系统解析为 light", () => {
    mockScheme(false);
    setTheme("system");
    expect(getThemePreference()).toBe("system");
    expect(getTheme()).toBe("light");
  });
});
