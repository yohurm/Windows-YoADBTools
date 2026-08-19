/**
 * 交互态填充与选中片几何（UI设计系统-v6.md §2.7）。
 * 唯一配方：hover/pressed 中性叠色；选中 = interactive_active（品牌实底 + 反白）。
 * 禁止表面另写选中底或选中字色。
 */

export const StateFill = {
  Hover: "#0000000C",
  Pressed: "#00000019",
  Selected: "var(--yohu-accent)",
  SelectedFg: "var(--yohu-fg-on)",
} as const;

export const DarkStateFill = {
  Hover: "#FFFFFF0C",
  Pressed: "#FFFFFF19",
  Selected: "var(--yohu-accent)",
  SelectedFg: "var(--yohu-fg-on)",
} as const;

/**
 * 选中片几何。铺满行盒；距背板由容器 padding 承担，禁止行内再缩。
 */
export const Ripple = {
  Radius: "var(--yohu-radius-sm)",
  Inset: "0",
} as const;
