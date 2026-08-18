import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MotionDuration, MotionEasing } from "./motion";

/**
 * 读取 theme.css 内容（与 colors.test.ts 相同策略）：
 * 兼容在 ui/packages/ui 内独立运行（cwd=包目录）与 ui/ 根集成运行（cwd=ui）。
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

/** camelCase 键名 → CSS 变量 kebab-case（loopSlow → loop-slow）。 */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

/** 提取 CSS 变量定义值（仅匹配变量定义行，不匹配 var() 引用）。 */
function cssVarValue(name: string): string | undefined {
  const match = themeCss.match(new RegExp(`${name}:\\s*([^;]+);`));
  return match?.[1]?.trim();
}

describe("动效 token 单一事实源契约", () => {
  it("theme.css 可读取", () => {
    expect(themeCss.length).toBeGreaterThan(0);
  });

  it("时长常量与 theme.css 完全一致", () => {
    for (const [name, value] of Object.entries(MotionDuration)) {
      const varName = `--yohu-dur-${kebab(name)}`;
      const css = cssVarValue(varName);
      expect(css, varName).toBe(value);
    }
  });

  it("缓动常量与 theme.css 完全一致", () => {
    for (const [name, value] of Object.entries(MotionEasing)) {
      const varName = `--yohu-ease-${kebab(name)}`;
      const css = cssVarValue(varName);
      expect(css, varName).toBe(value);
    }
  });

  it("时长分级符合 HarmonyOS 100/160/300/350ms 规范", () => {
    expect(MotionDuration.fast).toBe("100ms");
    expect(MotionDuration.normal).toBe("160ms");
    expect(MotionDuration.slow).toBe("300ms");
    expect(MotionDuration.enter).toBe("350ms");
  });

  it("标准/减速曲线符合 HarmonyOS 规范值", () => {
    expect(MotionEasing.standard).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    expect(MotionEasing.decel).toBe("cubic-bezier(0, 0, 0.4, 1)");
  });
});
