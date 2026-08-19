/**
 * 间距 token：HarmonyOS 8vp 网格（小件对齐 4vp），常用档对齐 Padding_level。
 * 组件内禁止硬编码间距，一律引用这里的常量或对应 CSS 变量 `--yohu-space-*`。
 */
export const Spacing = {
  /** Padding_level1：2vp 微间隙 */
  TwoXs: 2,
  /** Padding_level2：4vp */
  Xs: 4,
  /** Padding_level4：8vp */
  Sm: 8,
  /** Padding_level6：12vp（卡片间距） */
  Md: 12,
  /** Padding_level8：16vp（有边界控件间距） */
  Lg: 16,
  /** Padding_level12：24vp */
  Xl: 24,
  /** Padding_level16：32vp（平板/设置页边距） */
  TwoXl: 32,
  /** Padding_level20：40vp（PC 屏幕左右边距） */
  ThreeXl: 40,
} as const;

/** 间距基准（4vp 网格；布局规划以 8vp 为准） */
export const SpacingBase = 4;
