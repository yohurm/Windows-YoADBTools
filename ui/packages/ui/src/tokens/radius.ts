/**
 * 圆角 token（HarmonyOS 阶梯：4/8/16/20/32）。
 * 组件内禁止硬编码圆角，一律引用这里的常量或对应 CSS 变量 `--yovo-radius-*`。
 */
export const Radius = {
  /** 4px（小控件/徽章） */
  Xs: 4,
  /** 8px（按钮/输入框） */
  Sm: 8,
  /** 16px（卡片/面板） */
  Md: 16,
  /** 20px（对话框/大卡片） */
  Lg: 20,
  /** 32px（弹窗/全局容器） */
  Xl: 32,
} as const;
