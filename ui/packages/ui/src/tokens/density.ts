/**
 * 密度 token（UI设计系统-v6.md §2.3）。
 * compact（默认）与 comfortable 成对覆盖控件高 / 行高。
 * CSS 侧由 `[data-density="comfortable"]` 覆盖对应变量。
 */
export type DensityName = "compact" | "comfortable";

export const Density = {
  Compact: {
    controlHeight: 26,
    controlHeightSm: 24,
    rowHeight: 22,
    rowHeightDevice: 34,
    rowHeightNav: 32,
    rowHeightHeader: 28,
  },
  Comfortable: {
    controlHeight: 32,
    controlHeightSm: 28,
    rowHeight: 26,
    rowHeightDevice: 40,
    rowHeightNav: 36,
    rowHeightHeader: 32,
  },
} as const;
