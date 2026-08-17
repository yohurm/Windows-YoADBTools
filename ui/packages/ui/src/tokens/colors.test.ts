import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Colors, DarkColors, LogLevelDark, LogLevelLight } from "./colors";

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

/** 规范要求的浅色语义基准值（UI设计系统-v6.md §2.1·HarmonyOS 融合版；必须完全一致） */
const EXPECTED_LIGHT: Record<string, string> = {
  BgBase: "#F5F6F8",
  Surface: "#FFFFFF",
  Surface2: "#F0F2F5",
  Fg: "#1B1D22",
  Fg2: "#565D68",
  Fg3: "#8A919C",
  Border: "#D9DEE6",
  BorderStrong: "#B7BFCB",
  Accent: "#0A59F7",
  AccentSoft: "#D9E7FF",
  Success: "#2C7A38",
  Warn: "#A35200",
  Error: "#CC2B1B",
  Offline: "#8A919C",
};

function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-z])([0-9])/g, "$1-$2")
    .toLowerCase();
}

// ===== WCAG 对比度工具（P5：对比度达标质量门禁） =====

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`非 #RRGGBB: ${hex}`);
  const [, raw] = m;
  const r = srgbToLinear(Number.parseInt(raw.slice(0, 2), 16));
  const g = srgbToLinear(Number.parseInt(raw.slice(2, 4), 16));
  const b = srgbToLinear(Number.parseInt(raw.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("tokens/colors 语义色常量", () => {
  it("浅色语义色常量与规范完全一致", () => {
    for (const [name, value] of Object.entries(EXPECTED_LIGHT)) {
      expect((Colors as Record<string, string>)[name], `Colors.${name}`).toBe(value);
    }
  });

  it("深色色板覆盖全部语义键", () => {
    for (const name of Object.keys(Colors)) {
      expect(DarkColors[name], `DarkColors.${name}`).toBeTruthy();
    }
  });
});

describe("WCAG 对比度门禁（P5）", () => {
  const pairs: Array<[string, string, string]> = [
    // [主题, 前景键, 背景键]
    ["浅色", "Fg", "Surface"],
    ["浅色", "Fg2", "Surface"],
    ["浅色", "Accent", "Surface"],
    ["浅色", "Success", "Surface"],
    ["浅色", "Warn", "Surface"],
    ["浅色", "Error", "Surface"],
    ["深色", "Fg", "Surface"],
    ["深色", "Fg2", "Surface"],
    ["深色", "Accent", "Surface"],
    ["深色", "Success", "Surface"],
    ["深色", "Warn", "Surface"],
    ["深色", "Error", "Surface"],
  ];

  for (const [theme, fgKey, bgKey] of pairs) {
    it(`${theme} ${fgKey}/${bgKey} ≥ 4.5:1`, () => {
      const palette = theme === "浅色" ? Colors : DarkColors;
      const fg = palette[fgKey as keyof typeof Colors] as string;
      const bg = palette[bgKey as keyof typeof Colors] as string;
      expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("次级文本（Fg3）对表面 ≥ 3:1（大字/图标级别）", () => {
    expect(contrast(Colors.Fg3, Colors.Surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(DarkColors.Fg3, DarkColors.Surface)).toBeGreaterThanOrEqual(3);
  });
});

describe("logcat 级别板对比度门禁（P5）", () => {
  const lightSurface = Colors.Surface;
  const darkSurface = DarkColors.Surface;

  const lightLevels: Array<[string, string]> = [
    ["v", LogLevelLight.v],
    ["d", LogLevelLight.d],
    ["i", LogLevelLight.i],
    ["w", LogLevelLight.w],
    ["e", LogLevelLight.e],
  ];
  const darkLevels: Array<[string, string]> = [
    ["v", LogLevelDark.v],
    ["d", LogLevelDark.d],
    ["i", LogLevelDark.i],
    ["w", LogLevelDark.w],
    ["e", LogLevelDark.e],
  ];

  for (const [name, color] of lightLevels) {
    it(`浅色级别 ${name} 对表面 ≥ 4.5:1`, () => {
      expect(contrast(color, lightSurface), color).toBeGreaterThanOrEqual(4.5);
    });
  }
  for (const [name, color] of darkLevels) {
    it(`深色级别 ${name} 对表面 ≥ 4.5:1`, () => {
      expect(contrast(color, darkSurface), color).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("Fatal 反色块前景对底色 ≥ 4.5:1", () => {
    expect(contrast(LogLevelLight.f, LogLevelLight.fBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(LogLevelDark.f, LogLevelDark.fBg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("theme.css 变量", () => {
  it("定义浅色与深色两个主题块", () => {
    expect(themeCss).toContain(":root");
    expect(themeCss).toContain('[data-theme="dark"]');
  });

  it("浅色语义变量与 Colors 常量一致（token 单源校验）", () => {
    for (const [name, value] of Object.entries(EXPECTED_LIGHT)) {
      const varName = `--yovo-${kebab(name)}`;
      expect(themeCss, varName).toContain(`${varName}: ${value}`);
    }
  });

  it("深色语义变量已全部覆盖", () => {
    for (const name of Object.keys(EXPECTED_LIGHT)) {
      const varName = `--yovo-${kebab(name)}`;
      const darkBlock = themeCss.slice(themeCss.indexOf('[data-theme="dark"]'));
      expect(darkBlock, varName).toContain(`${varName}:`);
    }
  });

  it("级别板变量齐备（浅色+深色+反色块）", () => {
    for (const name of ["v", "d", "i", "w", "e", "f", "f-bg"]) {
      expect(themeCss).toContain(`--yovo-level-${name}:`);
    }
  });

  it("密度与动效 token 已定义", () => {
    expect(themeCss).toContain("--yovo-density:");
    expect(themeCss).toContain("--yovo-control-height:");
    expect(themeCss).toContain("--yovo-row-height:");
    expect(themeCss).toContain("--yovo-dur-fast:");
    expect(themeCss).toContain("--yovo-ease:");
  });
});
