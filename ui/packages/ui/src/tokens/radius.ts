/**
 * 圆角 token（UI设计系统-v6.md §2.6）。
 * 组件内禁止硬编码圆角，一律引用这里的常量或对应 CSS 变量 `--yohu-radius-*`。
 */
export const Radius = {
  /** 2px（微标 / Fatal 块） */
  TwoXs: 2,
  /** 4px（小控件） */
  Xs: 4,
  /** 8px（按钮 / 输入 / 列表 ripple） */
  Sm: 8,
  /** 16px（卡片 / 面板 / 对话框） */
  Md: 16,
  /** 20px（大卡片） */
  Lg: 20,
  /** 32px（顶层浮层） */
  Xl: 32,
} as const;

/** 正圆与胶囊（非 px 阶梯，CSS 侧用 --yohu-radius-full / --yohu-radius-pill）。 */
export const RadiusShape = {
  Full: "50%",
  Pill: "999px",
} as const;
