/**
 * 排版 token：字号阶梯、字重、字体栈。
 * 组件内禁止硬编码字号，一律引用这里的常量或对应 CSS 变量 `--yovo-font-*`。
 */
export const FontSizes = {
  /** 说明性小字 */
  Caption: 11,
  /** 正文 */
  Body: 13,
  /** 强调正文 */
  BodyStrong: 14,
  /** 小标题 */
  Subtitle: 17,
  /** 页面标题 */
  PageTitle: 20,
} as const;

/** 字重阶梯 */
export const FontWeights = {
  /** 常规 */
  Regular: 400,
  /** 半粗 */
  Semibold: 600,
} as const;

/** 字体栈 */
export const FontFamilies = {
  /** 中文正文：微软雅黑 */
  Sans: '"Microsoft YaHei", "Microsoft YaHei UI", "PingFang SC", "Segoe UI", sans-serif',
  /** 等宽：Consolas（日志 / 终端 / 数字） */
  Mono: '"Consolas", "Cascadia Code", "Courier New", monospace',
} as const;
