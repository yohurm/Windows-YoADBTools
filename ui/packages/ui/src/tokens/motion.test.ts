import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MotionDuration,
  MotionEasing,
  MotionSpec,
  MotionSpring,
  motionDurationMs,
} from "./motion";

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

  it("MotionSpec 成对变量与 duration/easing 名对齐", () => {
    for (const [name, spec] of Object.entries(MotionSpec)) {
      expect(spec.duration in MotionDuration, `${name}.duration`).toBe(true);
      expect(spec.easing in MotionEasing, `${name}.easing`).toBe(true);
      const varName = `--yohu-motion-${kebab(name)}`;
      const expected = `var(--yohu-dur-${kebab(spec.duration)}) var(--yohu-ease-${kebab(spec.easing)})`;
      expect(cssVarValue(varName), varName).toBe(expected);
    }
  });

  it("时长分级符合 HarmonyOS 100/150/160/200/300/350/400ms 规范", () => {
    expect(MotionDuration.fast).toBe("100ms");
    expect(MotionDuration.small).toBe("150ms");
    expect(MotionDuration.normal).toBe("160ms");
    expect(MotionDuration.local).toBe("200ms");
    expect(MotionDuration.slow).toBe("300ms");
    expect(MotionDuration.enter).toBe("350ms");
    expect(MotionDuration.progress).toBe("400ms");
    expect(MotionDuration.toast).toBe("3s");
  });

  it("标准/减速/加速/强调曲线符合规范值", () => {
    expect(MotionEasing.standard).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    expect(MotionEasing.decel).toBe("cubic-bezier(0, 0, 0.4, 1)");
    expect(MotionEasing.accel).toBe("cubic-bezier(0.4, 0, 1, 1)");
    expect(MotionEasing.emphasized).toBe("cubic-bezier(0.2, 0, 0, 1)");
  });

  it("跟手弹簧写入 theme.css，且曲线过冲后回到 1", () => {
    expect(MotionEasing.spring.startsWith("linear(")).toBe(true);
    expect(cssVarValue("--yohu-ease-spring")).toBe(MotionEasing.spring);
    const values = MotionEasing.spring
      .slice("linear(".length, -1)
      .split(",")
      .map((part) => Number.parseFloat(part.trim()));
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBe(1);
    expect(Math.max(...values)).toBeGreaterThan(1);
    expect(MotionSpec.spatialSmall).toEqual({ duration: "small", easing: "spring" });
    expect(MotionSpec.spatialStretch).toEqual({ duration: "local", easing: "springSoft" });
    expect(MotionSpec.spatialLocal).toEqual({ duration: "local", easing: "emphasized" });
  });

  it("软弹簧过冲后回到 1，写入 spring-soft", () => {
    expect(MotionEasing.springSoft.startsWith("linear(")).toBe(true);
    expect(cssVarValue("--yohu-ease-spring-soft")).toBe(MotionEasing.springSoft);
    const values = MotionEasing.springSoft
      .slice("linear(".length, -1)
      .split(",")
      .map((part) => Number.parseFloat(part.trim()));
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBe(1);
    expect(Math.max(...values)).toBeGreaterThan(1);
  });

  it("弹簧常量含鸿蒙原值、snap 位移与 soft 尺寸参数", () => {
    expect(MotionSpring.stiffness).toBe(128);
    expect(MotionSpring.damping).toBe(12);
    expect(MotionSpring.mass).toBe(1);
    expect(MotionSpring.snapStiffness).toBe(711);
    expect(MotionSpring.snapDamping).toBe(40);
    expect(MotionSpring.softStiffness).toBe(531);
    expect(MotionSpring.softDamping).toBe(29);
    expect(themeCss).not.toContain("--yohu-spring-stiffness");
  });

  it("motionDurationMs 解析 ms 与 s", () => {
    expect(motionDurationMs("fast")).toBe(100);
    expect(motionDurationMs("toast")).toBe(3000);
    expect(motionDurationMs("loopSlow")).toBe(1200);
  });
});
