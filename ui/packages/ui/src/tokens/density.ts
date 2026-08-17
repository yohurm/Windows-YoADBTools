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
