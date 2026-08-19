/**
 * 密度 token（UI设计系统-v6.md §2.3）。
 * 默认 comfortable = HarmonyOS PC 尺度；compact 为产线收敛。
 * CSS 侧由 `[data-density="compact"]` 覆盖对应变量。
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
    /** V1 分段最小高 28vp */
    segmentSingle: 28,
    segmentHybrid: 44,
  },
  Comfortable: {
    controlHeight: 32,
    controlHeightSm: 28,
    rowHeight: 26,
    rowHeightDevice: 40,
    rowHeightNav: 36,
    rowHeightHeader: 32,
    /** V2 singleline_background_height / doubleline_background_height */
    segmentSingle: 40,
    segmentHybrid: 56,
  },
} as const;
