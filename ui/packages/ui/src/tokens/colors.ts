/**
 * 语义色常量（浅色主题基准值）。
 *
 * 延续旧架构 ThemeTokens 的设计思想：色彩以「语义」命名而非具体色值命名，
 * 组件样式 100% 引用这些语义 token（或对应 CSS 变量 `--yovo-*`），
 * 禁止在组件文件内出现裸色值。
 *
 * 浅色基准值同时注入到 `theme.css` 的 `:root`（`--yovo-*` 变量），
 * 深色覆盖值见 `theme.css` 的 `[data-theme="dark"]` 与 `DarkColors`。
 */
export const Colors = {
  /** 左侧导航背景 */
  NavBg: "#E9EDF1",
  /** 内容区背景 */
  ContentBg: "#FBFCFD",
  /** 面板背景 */
  PanelBg: "#FFFFFF",
  /** 面板边框 */
  PanelBorder: "#C9D2DA",
  /** 列表背景 */
  ListBg: "#F7F9FA",
  /** 列表边框 */
  ListBorder: "#D5DBE1",
  /** 主文字 */
  TextPrimary: "#1A1A1A",
  /** 次级文字 */
  TextSecondary: "#5A5A5A",
  /** 三级文字 */
  TextTertiary: "#8A8A8A",
  /** 强调色 */
  Accent: "#0F3C74",
  /** 强调色背景 */
  AccentBg: "#D6E4F7",
  /** 强调色 hover（加深） */
  AccentHover: "#0B2D56",
  /** 成功 */
  Success: "#2E7D32",
  /** 成功背景 */
  SuccessBg: "#E3F2E4",
  /** 错误 */
  Error: "#C62828",
  /** 警告 */
  Warn: "#C77700",
  /** 警告背景 */
  WarnBg: "#FCF1DD",
  /** 离线 / 置灰 */
  Offline: "#9E9E9E",
  /** 导航 hover */
  NavHover: "#E8EEF6",
  /** 标签 */
  Tag: "#8A5A00",
  /** 分隔条 */
  Splitter: "#B9C2CC",
  /** 分隔条 hover */
  SplitterHover: "#6E7680",
  /** 禁用 */
  Disabled: "#A8A8A8",
  /** 信号背景（也用作错误类徽章的浅色底） */
  SignalBg: "#FDEBEA",
} as const;

/** 语义色名联合类型 */
export type SemanticColorName = keyof typeof Colors;

/**
 * 深色主题语义色覆盖值。
 * 与 `theme.css` 的 `[data-theme="dark"]` 一一对应；键名与 `Colors` 保持一致，
 * 保证两种主题下语义 token 齐全、层级感一致。
 */
export const DarkColors: Record<SemanticColorName, string> = {
  NavBg: "#1F2429",
  ContentBg: "#262B30",
  PanelBg: "#2E343B",
  PanelBorder: "#3A4148",
  ListBg: "#2A3037",
  ListBorder: "#3A4148",
  TextPrimary: "#E6E6E6",
  TextSecondary: "#A6A6A6",
  TextTertiary: "#7A7A7A",
  Accent: "#5B93D6",
  AccentBg: "#2A3B52",
  AccentHover: "#6FA3E8",
  Success: "#6FBF73",
  SuccessBg: "#24351F",
  Error: "#EF6A6A",
  Warn: "#E0A33A",
  WarnBg: "#3A2E1A",
  Offline: "#6E6E6E",
  NavHover: "#343B42",
  Tag: "#C99A3D",
  Splitter: "#3A4148",
  SplitterHover: "#9AA3AD",
  Disabled: "#555555",
  SignalBg: "#4A2A28",
};
