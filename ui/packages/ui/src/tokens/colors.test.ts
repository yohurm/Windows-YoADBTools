import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Colors, DarkColors, Harmony, LogLevelDark, LogLevelLight } from "./colors";

/**
 * 读取 theme.css 内容。
 * 兼容两种运行方式：在 ui/packages/ui 内独立运行（cwd=包目录），
 * 以及由 ui/ 根 vitest.config.ts 集成运行（cwd=ui）。
 */
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

/** HarmonyOS NEXT 官方浅色语义落地值（色彩.md 全量表） */
const EXPECTED_LIGHT: Record<string, string> = {
  BgBase: "#F1F3F5",
  Surface: "#FFFFFF",
  Surface2: "#E5E5EA",
  Fg: "#000000E5",
  Fg2: "#00000099",
  Fg3: "#00000066",
  Accent: "#0A59F7",
  AccentSoft: "#0A59F733",
  Success: "#64BB5C",
  Warn: "#ED6F21",
  Error: "#E84026",
  Offline: "#00000066",
  SwitchOff: "#00000019",
};

const EXPECTED_DARK: Record<string, string> = {
  BgBase: "#000000",
  Surface: "#202224",
  Accent: "#317AF7",
  AccentSoft: "#317AF733",
  Success: "#5BA854",
  Warn: "#DB6B42",
  Error: "#D94838",
  SwitchOff: "#FFFFFF19",
};

function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-z])([0-9])/g, "$1-$2")
    .toLowerCase();
}

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(input: string): Rgba {
  const hex8 = /^#([0-9a-fA-F]{8})$/.exec(input);
  if (hex8) {
    const raw = hex8[1];
    return {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
      a: Number.parseInt(raw.slice(6, 8), 16) / 255,
    };
  }
  const hex6 = /^#([0-9a-fA-F]{6})$/.exec(input);
  if (hex6) {
    const raw = hex6[1];
    return {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
      a: 1,
    };
  }
  throw new Error(`不支持的色值: ${input}`);
}

function composite(fg: string, bg: string): string {
  const front = parseColor(fg);
  const back = parseColor(bg);
  const r = Math.round(front.r * front.a + back.r * (1 - front.a));
  const g = Math.round(front.g * front.a + back.g * (1 - front.a));
  const b = Math.round(front.b * front.a + back.b * (1 - front.a));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const opaque = parseColor(hex);
  if (opaque.a !== 1) throw new Error(`luminance 需要不透明色: ${hex}`);
  return 0.2126 * srgbToLinear(opaque.r) + 0.7152 * srgbToLinear(opaque.g) + 0.0722 * srgbToLinear(opaque.b);
}

function contrast(fg: string, bg: string): number {
  const solidFg = parseColor(fg).a < 1 ? composite(fg, bg) : fg;
  const solidBg = parseColor(bg).a < 1 ? composite(bg, "#FFFFFF") : bg;
  const l1 = luminance(solidFg);
  const l2 = luminance(solidBg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("tokens/colors HarmonyOS 官方色", () => {
  it("浅色语义色与官方 Token 落地值一致", () => {
    for (const [name, value] of Object.entries(EXPECTED_LIGHT)) {
      expect((Colors as Record<string, string>)[name], `Colors.${name}`).toBe(value);
    }
  });

  it("深色品牌/语义色与官方 Token 一致", () => {
    for (const [name, value] of Object.entries(EXPECTED_DARK)) {
      expect(DarkColors[name as keyof typeof DarkColors], `DarkColors.${name}`).toBe(value);
    }
  });

  it("深色色板覆盖全部语义键", () => {
    for (const name of Object.keys(Colors)) {
      expect(DarkColors[name], `DarkColors.${name}`).toBeTruthy();
    }
  });

  it("Harmony primitive 宇宙蓝 / 雪域灰 / 语义三色对齐官方表", () => {
    expect(Harmony.brand.light).toBe("#0A59F7");
    expect(Harmony.brand.dark).toBe("#317AF7");
    expect(Harmony.backgroundSecondary.light).toBe("#F1F3F5");
    expect(Harmony.backgroundPrimary.dark).toBe("#000000");
    expect(Harmony.warning.light).toBe("#E84026");
    expect(Harmony.alert.light).toBe("#ED6F21");
    expect(Harmony.confirm.light).toBe("#64BB5C");
  });
});

describe("HarmonyOS 对比度门禁（§1.6）", () => {
  it("浅色正文 Fg / Surface ≥ 4.5:1", () => {
    expect(contrast(Colors.Fg, Colors.Surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("深色正文 Fg / Surface ≥ 5:1", () => {
    expect(contrast(DarkColors.Fg, DarkColors.Surface)).toBeGreaterThanOrEqual(5);
  });

  it("浅色二级文本 Fg2 / Surface ≥ 4.5:1", () => {
    expect(contrast(Colors.Fg2, Colors.Surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("深色二级文本 Fg2 / Surface ≥ 3:1", () => {
    expect(contrast(DarkColors.Fg2, DarkColors.Surface)).toBeGreaterThanOrEqual(3);
  });

  it("品牌色作正文（Accent / Surface）浅色 ≥ 4.5:1、深色 ≥ 3:1", () => {
    expect(contrast(Colors.Accent, Colors.Surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(DarkColors.Accent, DarkColors.Surface)).toBeGreaterThanOrEqual(3);
  });

  it("品牌/一级警示作填充时 font_on 对比达标；confirm 为中明度绿，只作点/条不承载反色字", () => {
    expect(contrast(Colors.FgOn, Colors.Accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(Colors.FgOn, Colors.Error)).toBeGreaterThanOrEqual(3);
    expect(contrast(DarkColors.FgOn, DarkColors.Accent)).toBeGreaterThanOrEqual(3);
    expect(contrast(DarkColors.FgOn, DarkColors.Error)).toBeGreaterThanOrEqual(3);
  });
});

describe("logcat 级别板（复用官方语义色）", () => {
  it("Fatal 反色块 font_on / warning ≥ 3:1", () => {
    expect(contrast(LogLevelLight.f, LogLevelLight.fBg)).toBeGreaterThanOrEqual(3);
    expect(contrast(LogLevelDark.f, LogLevelDark.fBg)).toBeGreaterThanOrEqual(3);
  });

  it("级别色取自官方 brand/confirm/alert/warning", () => {
    expect(LogLevelLight.d).toBe(Harmony.brand.light);
    expect(LogLevelLight.i).toBe(Harmony.confirm.light);
    expect(LogLevelLight.w).toBe(Harmony.alert.light);
    expect(LogLevelLight.e).toBe(Harmony.warning.light);
    expect(LogLevelDark.d).toBe(Harmony.brand.dark);
    expect(LogLevelDark.e).toBe(Harmony.warning.dark);
  });
});

describe("theme.css 变量", () => {
  it("定义浅色与深色两个主题块", () => {
    expect(themeCss).toContain(":root");
    expect(themeCss).toContain('[data-theme="dark"]');
  });

  it("浅色语义变量与 Colors 常量一致（token 单源校验）", () => {
    for (const [name, value] of Object.entries(EXPECTED_LIGHT)) {
      const varName = `--yohu-${kebab(name)}`;
      expect(themeCss, varName).toContain(`${varName}: ${value}`);
    }
  });

  it("深色宇宙蓝与语义色已覆盖", () => {
    const darkBlock = themeCss.slice(themeCss.indexOf('[data-theme="dark"]'));
    expect(darkBlock).toContain("--yohu-accent: #317AF7");
    expect(darkBlock).toContain("--yohu-bg-base: #000000");
    expect(darkBlock).toContain("--yohu-success: #5BA854");
  });

  it("级别板变量齐备（浅色+深色+反色块）", () => {
    for (const name of ["v", "d", "i", "w", "e", "f", "f-bg"]) {
      expect(themeCss).toContain(`--yohu-level-${name}:`);
    }
  });

  it("密度与动效 token 已定义", () => {
    expect(themeCss).toContain("--yohu-density:");
    expect(themeCss).toContain("--yohu-control-height:");
    expect(themeCss).toContain("--yohu-row-height:");
    expect(themeCss).toContain("--yohu-dur-fast:");
    expect(themeCss).toContain("--yohu-ease-standard:");
  });

  it("PC 布局 token 已排出", () => {
    expect(themeCss).toContain("--yohu-layout-window-default-w: 1200px");
    expect(themeCss).toContain("--yohu-layout-page-margin: 40px");
    expect(themeCss).toContain("--yohu-layout-rail-inset: 8px");
    expect(themeCss).toContain("--yohu-layout-settings-control-max: 360px");
    expect(themeCss).toContain("--yohu-layout-switch-w: 36px");
    expect(themeCss).toContain("--yohu-title-bar-height: 56px");
    expect(themeCss).toContain("--yohu-canvas: var(--yohu-bg-base)");
    expect(themeCss).toContain("color-scheme: light");
    expect(themeCss).toContain("color-scheme: dark");
    expect(themeCss).toContain("--yohu-state-selected: var(--yohu-accent)");
    expect(themeCss).toContain("--yohu-state-selected-fg: var(--yohu-fg-on)");
    expect(themeCss).toContain("--yohu-ripple-inset: 0");
    expect(themeCss).toContain("--yohu-space-3xl: 40px");
  });
});
