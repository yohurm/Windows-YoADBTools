/**
 * 系统「减少动态效果」与测试环境跳过等待。
 * jsdom 不播放 CSS animation；单测走 skip，真机动效由冒烟覆盖。
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Presence 出场是否立刻卸载（无障碍或 Vitest）。 */
export function shouldSkipMotion(): boolean {
  if (prefersReducedMotion()) {
    return true;
  }
  return import.meta.env.MODE === "test";
}
