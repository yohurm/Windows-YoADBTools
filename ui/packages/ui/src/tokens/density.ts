/**
 * 密度 token（UI设计系统-v6.md §2.3）。
 * compact（默认）：控件高 26 / 行高 22；comfortable：32 / 26。
 * CSS 侧由 `[data-density="comfortable"]` 覆盖 `--yovo-control-height/--yovo-row-height`。
 */
export type DensityName = "compact" | "comfortable";

export const Density = {
  Compact: { controlHeight: 26, rowHeight: 22 },
  Comfortable: { controlHeight: 32, rowHeight: 26 },
} as const;

/** 动效 token（HarmonyOS 时长分级 100/160/300/350ms 与标准缓动曲线）。 */
export const Motion = {
  Fast: 100,
  Normal: 160,
  Slow: 300,
  Enter: 350,
  /** 标准曲线（HarmonyOS） */
  Ease: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** 减速曲线（退出/收起） */
  EaseOut: "cubic-bezier(0, 0, 0.4, 1)",
} as const;
