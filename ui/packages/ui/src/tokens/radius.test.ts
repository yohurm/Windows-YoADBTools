import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Radius, RadiusShape } from "./radius";
import { Spacing } from "./spacing";
import { Density } from "./density";
import { FocusRing, Layout, Stroke } from "./layout";

function loadThemeCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/tokens/theme.css"),
    resolve(process.cwd(), "packages/ui/src/tokens/theme.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const themeCss = loadThemeCss();

function cssVarValue(name: string): string | undefined {
  const match = themeCss.match(new RegExp(`${name}:\\s*([^;]+);`));
  return match?.[1]?.trim();
}

describe("圆角 / 间距 / 布局 token 契约", () => {
  it("theme.css 可读取", () => {
    expect(themeCss.length).toBeGreaterThan(0);
  });

  it("半径阶梯与 theme.css 一致", () => {
    expect(cssVarValue("--yovo-radius-2xs")).toBe(`${Radius.TwoXs}px`);
    expect(cssVarValue("--yovo-radius-xs")).toBe(`${Radius.Xs}px`);
    expect(cssVarValue("--yovo-radius-sm")).toBe(`${Radius.Sm}px`);
    expect(cssVarValue("--yovo-radius-md")).toBe(`${Radius.Md}px`);
    expect(cssVarValue("--yovo-radius-lg")).toBe(`${Radius.Lg}px`);
    expect(cssVarValue("--yovo-radius-xl")).toBe(`${Radius.Xl}px`);
    expect(cssVarValue("--yovo-radius-full")).toBe(RadiusShape.Full);
    expect(cssVarValue("--yovo-radius-pill")).toBe(RadiusShape.Pill);
  });

  it("间距阶梯含 2xs 并与 theme.css 一致", () => {
    expect(cssVarValue("--yovo-space-2xs")).toBe(`${Spacing.TwoXs}px`);
    expect(cssVarValue("--yovo-space-xs")).toBe(`${Spacing.Xs}px`);
  });

  it("ripple / 焦点 / 描边默认几何走 token", () => {
    expect(cssVarValue("--yovo-ripple-radius")).toBe("var(--yovo-radius-sm)");
    expect(cssVarValue("--yovo-ripple-inset")).toBe("var(--yovo-space-xs)");
    expect(cssVarValue("--yovo-focus-width")).toBe(`${FocusRing.Width}px`);
    expect(cssVarValue("--yovo-stroke-accent")).toBe(`${Stroke.Accent}px`);
    expect(cssVarValue("--yovo-stroke-emphasis")).toBe(`${Stroke.Emphasis}px`);
  });

  it("密度 compact 行高与 theme.css 默认一致", () => {
    expect(cssVarValue("--yovo-control-height")).toBe(`${Density.Compact.controlHeight}px`);
    expect(cssVarValue("--yovo-row-height-device")).toBe(`${Density.Compact.rowHeightDevice}px`);
    expect(cssVarValue("--yovo-row-height-nav")).toBe(`${Density.Compact.rowHeightNav}px`);
  });

  it("布局常量与 theme.css 一致", () => {
    expect(cssVarValue("--yovo-layout-shell-nav")).toBe(`${Layout.ShellNav}px`);
    expect(cssVarValue("--yovo-layout-preview")).toBe(`${Layout.Preview}px`);
    expect(cssVarValue("--yovo-layout-hit-splitter")).toBe(`${Layout.HitSplitter}px`);
  });
});
