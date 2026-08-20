/**
 * theme.css 唯一生成器：全部变量从 TS token 排出。
 * 契约测试强制磁盘上的 theme.css 与本函数输出逐字节一致。
 */
import { Colors, DarkColors, LogLevelDark, LogLevelLight } from "./colors";
import { Density } from "./density";
import { DarkElevation, Elevation } from "./elevation";
import { FocusRing, Layout, Stroke } from "./layout";
import { MotionDuration, MotionEasing, MotionSpec } from "./motion";
import { Radius, RadiusShape } from "./radius";
import { Spacing } from "./spacing";
import { DarkStateFill, Ripple, StateFill } from "./state";
import { FontFamilies, FontLeading, FontSizes, FontSizesCompact, FontWeights } from "./typography";

function kebab(name: string): string {
  if (name === "TwoXs") return "2xs";
  if (name === "TwoXl") return "2xl";
  if (name === "ThreeXl") return "3xl";
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-z])([0-9])/g, "$1-$2")
    .toLowerCase();
}

function lines(entries: ReadonlyArray<readonly string[]>, indent = "  "): string {
  return entries.map(([name, value]) => `${indent}${name}: ${value};`).join("\n");
}

/** Splitter 在 CSS 中保持 border-strong 别名，深浅随语义板走。 */
const SEMANTIC_SKIP = new Set(["Splitter"]);

function semanticVars(palette: Record<string, string>): Array<[string, string]> {
  return Object.entries(palette)
    .filter(([name]) => !SEMANTIC_SKIP.has(name))
    .map(([name, value]) => [`--yohu-${kebab(name)}`, value]);
}

function levelVars(board: { v: string; d: string; i: string; w: string; e: string; f: string; fBg: string }): Array<[string, string]> {
  return [
    ["--yohu-level-v", board.v],
    ["--yohu-level-d", board.d],
    ["--yohu-level-i", board.i],
    ["--yohu-level-w", board.w],
    ["--yohu-level-e", board.e],
    ["--yohu-level-f", board.f],
    ["--yohu-level-f-bg", board.fBg],
  ];
}

function densityVars(pack: Record<string, number>): Array<[string, string]> {
  return Object.entries(pack).map(([name, value]) => [`--yohu-${kebab(name)}`, `${value}px`]);
}

function fontSizeVars(sizes: Record<string, number>): Array<[string, string]> {
  return Object.entries(sizes).map(([name, value]) => [`--yohu-font-${kebab(name)}`, `${value}px`]);
}

function leadingVars(leads: Record<string, number>): Array<[string, string]> {
  return Object.entries(leads).map(([name, value]) => [`--yohu-font-leading-${kebab(name)}`, String(value)]);
}

/** 排出完整 theme.css 文本（含页脚结构规则）。 */
export function emitThemeCss(): string {
  const space: Array<[string, string]> = (Object.entries(Spacing) as Array<[string, number]>).map(
    ([name, value]) => [`--yohu-space-${kebab(name)}`, `${value}px`],
  );
  const radiusPx: Array<[string, string]> = (Object.entries(Radius) as Array<[string, number]>).map(
    ([name, value]) => [`--yohu-radius-${kebab(name)}`, `${value}px`],
  );
  const layout: Array<[string, string]> = (Object.entries(Layout) as Array<[string, number]>).map(
    ([name, value]) => [`--yohu-layout-${kebab(name)}`, `${value}px`],
  );
  const durs: Array<[string, string]> = Object.entries(MotionDuration).map(([name, value]) => [
    `--yohu-dur-${kebab(name)}`,
    value,
  ]);
  const eases: Array<[string, string]> = Object.entries(MotionEasing).map(([name, value]) => [
    `--yohu-ease-${kebab(name)}`,
    value,
  ]);
  const specs: Array<[string, string]> = Object.entries(MotionSpec).map(([name, spec]) => [
    `--yohu-motion-${kebab(name)}`,
    `var(--yohu-dur-${kebab(spec.duration)}) var(--yohu-ease-${kebab(spec.easing)})`,
  ]);

  const root: Array<[string, string]> = [
    ["color-scheme", "light"],
    ...semanticVars(Colors),
    ["--yohu-shadow-xs", Elevation.Xs],
    ["--yohu-shadow-overlay", Elevation.Overlay],
    ["--yohu-shadow-dialog", Elevation.Dialog],
    ["--yohu-shadow-dialog-unfocused", Elevation.DialogUnfocused],
    ...levelVars(LogLevelLight),
    ["--yohu-canvas", "var(--yohu-bg-base)"],
    ["--yohu-splitter", "var(--yohu-border-strong)"],
    ["--yohu-state-hover", StateFill.Hover],
    ["--yohu-state-pressed", StateFill.Pressed],
    ["--yohu-state-selected", StateFill.Selected],
    ["--yohu-state-selected-fg", StateFill.SelectedFg],
    ...fontSizeVars(FontSizes),
    ...leadingVars(FontLeading),
    ["--yohu-font-sans", FontFamilies.Sans],
    ["--yohu-font-mono", FontFamilies.Mono],
    ["--yohu-font-weight-light", String(FontWeights.Light)],
    ["--yohu-font-weight-regular", String(FontWeights.Regular)],
    ["--yohu-font-weight-medium", String(FontWeights.Medium)],
    ["--yohu-font-weight-semibold", String(FontWeights.Semibold)],
    ["--yohu-font-weight-bold", String(FontWeights.Bold)],
    ...space,
    ...radiusPx,
    ["--yohu-radius-full", RadiusShape.Full],
    ["--yohu-radius-pill", RadiusShape.Pill],
    ["--yohu-ripple-radius", Ripple.Radius],
    ["--yohu-ripple-inset", Ripple.Inset],
    ["--yohu-focus-width", `${FocusRing.Width}px`],
    ["--yohu-focus-offset", `${FocusRing.Offset}px`],
    ["--yohu-focus-offset-inset", `${FocusRing.OffsetInset}px`],
    ["--yohu-stroke-hairline", `${Stroke.Hairline}px`],
    ["--yohu-stroke-accent", `${Stroke.Accent}px`],
    ["--yohu-stroke-emphasis", `${Stroke.Emphasis}px`],
    ["--yohu-density", "comfortable"],
    ...densityVars(Density.Comfortable),
    ...layout,
    ...durs,
    ...eases,
    ...specs,
  ];

  const dark: Array<[string, string]> = [
    ["color-scheme", "dark"],
    ...semanticVars(DarkColors),
    ["--yohu-shadow-xs", DarkElevation.Xs],
    ["--yohu-shadow-overlay", DarkElevation.Overlay],
    ["--yohu-shadow-dialog", DarkElevation.Dialog],
    ["--yohu-shadow-dialog-unfocused", DarkElevation.DialogUnfocused],
    ...levelVars(LogLevelDark),
    ["--yohu-canvas", "var(--yohu-bg-base)"],
    ["--yohu-state-hover", DarkStateFill.Hover],
    ["--yohu-state-pressed", DarkStateFill.Pressed],
    ["--yohu-state-selected", DarkStateFill.Selected],
    ["--yohu-state-selected-fg", DarkStateFill.SelectedFg],
  ];

  const compact: Array<[string, string]> = [
    ...densityVars(Density.Compact),
    ...fontSizeVars(FontSizesCompact),
  ];

  return `/* AUTO-GENERATED by tokens/emit-theme.ts — 勿手改；改 TS token 后跑契约测试。 */
:root {
${lines(root)}
}

[data-theme="dark"] {
${lines(dark)}
}

[data-density="compact"] {
${lines(compact)}
}

html,
body,
#root {
  height: 100%;
  margin: 0;
  overflow: hidden;
  background-color: var(--yohu-canvas);
  font-family: var(--yohu-font-sans);
  font-size: var(--yohu-font-body);
  font-weight: var(--yohu-font-weight-regular);
  line-height: var(--yohu-font-leading-ui);
  line-break: strict;
  color: var(--yohu-fg);
}

.yohu-type-title {
  font-size: var(--yohu-font-page-title);
  font-weight: var(--yohu-font-weight-bold);
  line-height: var(--yohu-font-leading-tight);
}

.yohu-type-subtitle {
  font-size: var(--yohu-font-subtitle);
  font-weight: var(--yohu-font-weight-medium);
  line-height: var(--yohu-font-leading-tight);
}

.yohu-type-body {
  font-size: var(--yohu-font-body);
  font-weight: var(--yohu-font-weight-regular);
  line-height: var(--yohu-font-leading-ui);
}

.yohu-type-caption {
  font-size: var(--yohu-font-caption);
  font-weight: var(--yohu-font-weight-medium);
  line-height: var(--yohu-font-leading-tight);
}

.yohu-type-data {
  font-family: var(--yohu-font-mono);
  font-variant-numeric: tabular-nums;
  line-height: var(--yohu-font-leading-data);
}
`;
}
