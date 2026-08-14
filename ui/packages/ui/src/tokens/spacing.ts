/**
 * 间距 token：以 4px 为基准的阶梯。
 * 组件内禁止硬编码间距，一律引用这里的常量或对应 CSS 变量 `--yovo-space-*`。
 */
export const Spacing = {
  /** 4px */
  Xs: 4,
  /** 8px */
  Sm: 8,
  /** 12px */
  Md: 12,
  /** 16px */
  Lg: 16,
  /** 24px */
  Xl: 24,
} as const;

/** 间距基准（4px） */
export const SpacingBase = 4;
