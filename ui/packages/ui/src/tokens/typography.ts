/**
 * 排版 token：字号阶梯、字重、字体栈（UI设计系统-v6.md §2.2）。
 * 组件内禁止硬编码字号，一律引用这里的常量或对应 CSS 变量 `--yovo-font-*`。
 */
export const FontSizes = {
  /** 说明性小字 */
  Caption: 11,
  /** 正文 */
  Body: 12.5,
  /** 强调正文 */
  BodyStrong: 13.5,
  /** 小标题 */
  Subtitle: 15,
  /** 页面标题 */
  PageTitle: 18,
} as const;

/** 字重阶梯 */
export const FontWeights = {
  /** 常规 */
  Regular: 400,
  /** 半粗 */
  Semibold: 600,
} as const;

/** comfortable 字号：compact 各 +1（§2.2）。 */
export const FontSizesComfortable = {
  Caption: FontSizes.Caption + 1,
  Body: FontSizes.Body + 1,
  BodyStrong: FontSizes.BodyStrong + 1,
  Subtitle: FontSizes.Subtitle + 1,
  PageTitle: FontSizes.PageTitle + 1,
} as const;

export const FontFamilies = {
  /** 界面正文（西文优先 Segoe UI，中文回退雅黑） */
  Sans: '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif',
  /** 等宽（日志 / 终端 / serial / PID / 数字，tabular-nums 列对齐） */
  Mono: '"Cascadia Mono", "Consolas", "Courier New", monospace',
} as const;
