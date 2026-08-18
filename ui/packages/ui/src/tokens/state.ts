/**
 * 交互态填充（UI设计系统-v6.md §2.7）。
 * 由 accent 派生，禁止表面另写选中底。
 */
export const StateFill = {
  Hover: "color-mix(in srgb, var(--yovo-accent) 10%, transparent)",
  Pressed: "color-mix(in srgb, var(--yovo-accent) 16%, transparent)",
  Selected: "var(--yovo-accent-soft)",
} as const;
