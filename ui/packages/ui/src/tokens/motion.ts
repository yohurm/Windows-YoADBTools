/**
 * 动效 token —— JS 消费侧单一事实源（UI设计系统-v6.md §2.4，HarmonyOS 时长分级）。
 * CSS 组件层通过 var(--yovo-dur-*) / var(--yovo-ease-*) 消费；
 * JS 驱动的过渡/滚动/入场动画通过本模块常量消费。
 * 契约测试（motion.test.ts）强制本模块与 theme.css 完全一致。
 */

/** 时长分级：fast 100ms → normal 160ms → slow 300ms → enter 350ms；loop 系为循环指示器。 */
export const MotionDuration = {
  /** 100ms：hover / 按下反馈 */
  fast: "100ms",
  /** 160ms：面板展开 / 下拉 */
  normal: "160ms",
  /** 300ms：页面级过渡 / 面板进出场 */
  slow: "300ms",
  /** 350ms：大面板入场（Dialog 等） */
  enter: "350ms",
  /** 800ms：循环指示器（spinner） */
  loop: "800ms",
  /** 1.2s：不确定进度条扫动 */
  loopSlow: "1.2s",
} as const;

export type MotionDurationName = keyof typeof MotionDuration;

/** 缓动曲线：standard（默认）/ decel（减速）/ loop（循环指示器）。 */
export const MotionEasing = {
  /** 标准缓动 cubic-bezier(0.4, 0, 0.2, 1)：绝大多数过渡 */
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** 减速缓动 cubic-bezier(0, 0, 0.4, 1)：入场加速后减速 */
  decel: "cubic-bezier(0, 0, 0.4, 1)",
  /** 循环缓动 ease-in-out：不确定指示器扫动 */
  loop: "ease-in-out",
} as const;

export type MotionEasingName = keyof typeof MotionEasing;
