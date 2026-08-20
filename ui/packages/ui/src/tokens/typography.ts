/**
 * 排版 token（UI设计系统-v6.md §2.2）。
 * 默认 = HarmonyOS PC 字号表（电脑比手机小 2vp，正文统一 14vp）。
 * 组件内禁止硬编码字号，一律引用 `--yohu-font-*`。
 */
export const FontSizes = {
  /** Caption_M：PC 表为 9vp，UX 必须项抬到 ≥10vp */
  CaptionM: 10,
  /** Caption_L：12vp */
  Caption: 12,
  /** Body_L/M/S 电脑统一 14vp */
  Body: 14,
  /** 强调正文（同 Body，字重走 Medium/Semibold） */
  BodyStrong: 14,
  /** Subtitle_M：14vp Medium */
  SubtitleM: 14,
  /** Subtitle_L：16vp */
  Subtitle: 16,
  /** Title_S：18vp Bold（对话框/一级页标题） */
  PageTitle: 18,
} as const;

/** compact 产线收敛（低于 PC 推荐、不低于 10vp 必须项）。 */
export const FontSizesCompact = {
  CaptionM: 10,
  Caption: 11,
  Body: 12.5,
  BodyStrong: 13.5,
  SubtitleM: 13,
  Subtitle: 15,
  PageTitle: 18,
} as const;

/** 字重阶梯（鸿蒙 Display Light / Title Bold / Subtitle Medium / Body Regular）。 */
export const FontWeights = {
  Light: 300,
  Regular: 400,
  Medium: 500,
  Semibold: 600,
  Bold: 700,
} as const;

/**
 * 行高（无单位倍数）。
 * 数据行 1.4 利于列对齐；正文 1.55 利于中文阅读；铬条/按钮 1.25。
 */
export const FontLeading = {
  Tight: 1.25,
  Ui: 1.55,
  Data: 1.4,
} as const;

export const FontFamilies = {
  /** 界面正文（西文优先 Segoe UI，中文回退雅黑） */
  Sans: '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif',
  /** 等宽（日志 / 终端 / serial / PID / 数字，tabular-nums 列对齐） */
  Mono: '"Cascadia Mono", "Consolas", "Courier New", monospace',
} as const;
