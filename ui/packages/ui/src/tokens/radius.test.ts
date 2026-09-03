import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Radius, RadiusShape } from "./radius";
import { Spacing } from "./spacing";
import { Density } from "./density";
import { FocusRing, Layout, Stroke } from "./layout";
import { Ripple } from "./state";

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
    expect(cssVarValue("--yohu-radius-none")).toBe(`${Radius.None}px`);
    expect(cssVarValue("--yohu-radius-2xs")).toBe(`${Radius.TwoXs}px`);
    expect(cssVarValue("--yohu-radius-xs")).toBe(`${Radius.Xs}px`);
    expect(cssVarValue("--yohu-radius-sm")).toBe(`${Radius.Sm}px`);
    expect(cssVarValue("--yohu-radius-md")).toBe(`${Radius.Md}px`);
    expect(cssVarValue("--yohu-radius-lg")).toBe(`${Radius.Lg}px`);
    expect(cssVarValue("--yohu-radius-xl")).toBe(`${Radius.Xl}px`);
    expect(cssVarValue("--yohu-radius-full")).toBe(RadiusShape.Full);
    expect(cssVarValue("--yohu-radius-pill")).toBe(RadiusShape.Pill);
  });

  it("间距阶梯含 2xs/2xl/3xl 并与 theme.css 一致", () => {
    expect(cssVarValue("--yohu-space-2xs")).toBe(`${Spacing.TwoXs}px`);
    expect(cssVarValue("--yohu-space-xs")).toBe(`${Spacing.Xs}px`);
    expect(cssVarValue("--yohu-space-2xl")).toBe(`${Spacing.TwoXl}px`);
    expect(cssVarValue("--yohu-space-3xl")).toBe(`${Spacing.ThreeXl}px`);
  });

  it("ripple / 焦点 / 描边默认几何走 token", () => {
    expect(cssVarValue("--yohu-ripple-radius")).toBe(Ripple.Radius);
    expect(cssVarValue("--yohu-ripple-inset")).toBe(Ripple.Inset);
    expect(cssVarValue("--yohu-focus-width")).toBe(`${FocusRing.Width}px`);
    expect(cssVarValue("--yohu-stroke-accent")).toBe(`${Stroke.Accent}px`);
    expect(cssVarValue("--yohu-stroke-emphasis")).toBe(`${Stroke.Emphasis}px`);
  });

  it("密度 comfortable 行高与 theme.css 默认一致", () => {
    expect(cssVarValue("--yohu-control-height")).toBe(`${Density.Comfortable.controlHeight}px`);
    expect(cssVarValue("--yohu-segment-single")).toBe(`${Density.Comfortable.segmentSingle}px`);
    expect(cssVarValue("--yohu-segment-hybrid")).toBe(`${Density.Comfortable.segmentHybrid}px`);
    expect(cssVarValue("--yohu-row-height-device")).toBe(`${Density.Comfortable.rowHeightDevice}px`);
    expect(cssVarValue("--yohu-row-height-nav")).toBe(`${Density.Comfortable.rowHeightNav}px`);
    expect(cssVarValue("--yohu-title-bar-height")).toBe(`${Density.Comfortable.titleBarHeight}px`);
  });

  it("布局常量与 theme.css 一致", () => {
    expect(cssVarValue("--yohu-layout-shell-nav")).toBe(`${Layout.ShellNav}px`);
    expect(cssVarValue("--yohu-layout-preview")).toBe(`${Layout.Preview}px`);
    expect(cssVarValue("--yohu-layout-mirror-ops")).toBe(`${Layout.MirrorOps}px`);
    expect(cssVarValue("--yohu-layout-hit-splitter")).toBe(`${Layout.HitSplitter}px`);
    expect(cssVarValue("--yohu-layout-window-default-w")).toBe(`${Layout.WindowDefaultW}px`);
    expect(cssVarValue("--yohu-layout-window-default-h")).toBe(`${Layout.WindowDefaultH}px`);
    expect(cssVarValue("--yohu-layout-window-min-w")).toBe(`${Layout.WindowMinW}px`);
    expect(cssVarValue("--yohu-layout-window-min-h")).toBe(`${Layout.WindowMinH}px`);
    expect(Layout.WindowMinW).toBe(1024);
    expect(Layout.WindowMinH).toBe(768);
    expect(cssVarValue("--yohu-layout-page-margin")).toBe(`${Layout.PageMargin}px`);
    expect(Layout.PageInset).toBe(Spacing.Md);
    expect(Layout.PageGap).toBe(Spacing.Md);
    expect(cssVarValue("--yohu-layout-page-inset")).toBe(`${Spacing.Md}px`);
    expect(cssVarValue("--yohu-layout-page-gap")).toBe(`${Spacing.Md}px`);
    expect(Layout.ChromePad).toBe(Spacing.Sm);
    expect(cssVarValue("--yohu-layout-chrome-pad")).toBe(`${Spacing.Sm}px`);
    expect(cssVarValue("--yohu-layout-rail-inset")).toBe(`${Layout.RailInset}px`);
    expect(cssVarValue("--yohu-layout-settings-control-max")).toBe(`${Layout.SettingsControlMax}px`);
    expect(cssVarValue("--yohu-layout-switch-w")).toBe(`${Layout.SwitchW}px`);
    expect(cssVarValue("--yohu-layout-gutter")).toBe(`${Layout.Gutter}px`);
    expect(cssVarValue("--yohu-layout-grid-max")).toBe(`${Layout.GridMax}px`);
    expect(cssVarValue("--yohu-layout-titlebar-caption")).toBe(`${Layout.TitlebarCaption}px`);
    expect(cssVarValue("--yohu-layout-titlebar-caption-gap")).toBe(`${Layout.TitlebarCaptionGap}px`);
    expect(cssVarValue("--yohu-layout-titlebar-close-margin")).toBe(`${Layout.TitlebarCloseMargin}px`);
    expect(cssVarValue("--yohu-layout-icon-tiny")).toBe(`${Layout.IconTiny}px`);
    expect(cssVarValue("--yohu-layout-icon-inline")).toBe(`${Layout.IconInline}px`);
    expect(cssVarValue("--yohu-layout-icon-sm")).toBe(`${Layout.IconSm}px`);
  });
});
