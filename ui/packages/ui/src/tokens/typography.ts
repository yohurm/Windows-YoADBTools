/**
 * 排版 token（UI设计系统-v6.md §2.2）。
 * 默认 = HarmonyOS PC 字号表；compact 为产线收敛覆盖。
 * 组件内禁止硬编码字号，一律引用 `--yohu-font-*`。
 */
export const FontSizes = {
  /** Caption_L：12vp */
  Caption: 12,
  /** Body_L/M/S 电脑统一 14vp */
  Body: 14,
  /** 强调正文（同 Body，字重走 Medium/Semibold） */
  BodyStrong: 14,
  /** Subtitle_L：16vp */
  Subtitle: 16,
  /** Title_S：18vp */
  PageTitle: 18,
} as const;

/** compact 产线收敛（低于 PC 推荐、不低于 10vp 必须项）。 */
export const FontSizesCompact = {
  Caption: 11,
  Body: 12.5,
  BodyStrong: 13.5,
  Subtitle: 15,
  PageTitle: 18,
} as const;

/** 字重阶梯（鸿蒙 Title Bold / Subtitle Medium）。 */
export const FontWeights = {
  Regular: 400,
  Medium: 500,
  Semibold: 600,
  Bold: 700,
} as const;

export const FontFamilies = {
  /** 界面正文（西文优先 Segoe UI，中文回退雅黑） */
  Sans: '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif',
  /** 等宽（日志 / 终端 / serial / PID / 数字，tabular-nums 列对齐） */
  Mono: '"Cascadia Mono", "Consolas", "Courier New", monospace',
} as const;
