import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Colors, DarkColors } from "./colors";

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

/** 规范要求的浅色基准值（必须完全一致） */
const EXPECTED_LIGHT: Record<string, string> = {
  NavBg: "#E9EDF1",
  ContentBg: "#FBFCFD",
  PanelBg: "#FFFFFF",
  PanelBorder: "#C9D2DA",
  ListBg: "#F7F9FA",
  ListBorder: "#D5DBE1",
  TextPrimary: "#1A1A1A",
  TextSecondary: "#5A5A5A",
  TextTertiary: "#8A8A8A",
  Accent: "#0F3C74",
  AccentBg: "#D6E4F7",
  AccentHover: "#0B2D56",
  Success: "#2E7D32",
  SuccessBg: "#E3F2E4",
  Error: "#C62828",
  Warn: "#C77700",
  WarnBg: "#FCF1DD",
  Offline: "#9E9E9E",
  NavHover: "#E8EEF6",
  Tag: "#8A5A00",
  Splitter: "#B9C2CC",
  SplitterHover: "#6E7680",
  Disabled: "#A8A8A8",
  SignalBg: "#FDEBEA",
};

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

describe("tokens/colors 颜色常量", () => {
  it("浅色语义色常量与规范完全一致", () => {
    for (const [name, value] of Object.entries(EXPECTED_LIGHT)) {
      expect((Colors as Record<string, string>)[name], `Colors.${name}`).toBe(value);
    }
    // 不应有超出预期的浅色 key
    expect(Object.keys(Colors).sort()).toEqual(Object.keys(EXPECTED_LIGHT).sort());
  });

  it("深色色板键名与浅色一致（主题语义齐全）", () => {
    expect(Object.keys(DarkColors).sort()).toEqual(Object.keys(Colors).sort());
    // 深色必须覆盖全部语义，且值非空
    for (const [name, value] of Object.entries(DarkColors)) {
      expect(value, `DarkColors.${name}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("theme.css 变量", () => {
  it("定义浅色与深色两个主题块", () => {
    expect(themeCss).toContain(":root");
    expect(themeCss).toContain('[data-theme="dark"]');
  });

  it("浅色变量与 Colors 常量一致（token 单源校验）", () => {
    for (const [name, value] of Object.entries(Colors)) {
      const varName = `--yovo-${kebab(name)}`;
      expect(themeCss, varName).toContain(`${varName}: ${value}`);
    }
  });

  it("深色变量已全部覆盖（每个浅色变量都有深色同名变量）", () => {
    for (const name of Object.keys(Colors)) {
      const varName = `--yovo-${kebab(name)}`;
      // 深色块中应存在同名变量（出现在 [data-theme="dark"] 之后）
      const darkBlock = themeCss.slice(themeCss.indexOf('[data-theme="dark"]'));
      expect(darkBlock, varName).toContain(`${varName}:`);
    }
  });
});
