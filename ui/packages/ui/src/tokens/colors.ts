/**
 * 色彩 token（三层架构，见 docs/architecture/UI设计系统-v6.md §2）：
 *   Primitive（原始板，仅本文件使用）
 * → Semantic（语义板：Colors=浅色 / DarkColors=深色）
 * → Component（级别板 LogLevel* / FocusRing，供组件直接消费）
 *
 * 组件与模块样式 100% 引用语义/组件层（CSS 变量 `--yovo-*`），禁止裸色值。
 * 纪律由 scripts/check-ui-tokens.mjs + 单测共同强制。
 */

// ===== Primitive 层（原始板：仅 tokens 内部引用） =====

export const Primitive = {
  // 中性灰阶
  gray0: "#FFFFFF",
  gray50: "#F5F6F8",
  gray100: "#F0F2F5",
  gray200: "#D9DEE6",
  gray300: "#B7BFCB",
  gray400: "#8A919C",
  gray500: "#565D68",
  gray600: "#1B1D22",
  // 主题底
  darkBase: "#17181C",
  darkSurface: "#1F2127",
  darkSurface2: "#262930",
  darkBorder: "#333844",
  darkBorderStrong: "#454B58",
  darkFg: "#E8EAEF",
  darkFg2: "#A6ADBB",
  darkFg3: "#6E7686",
  // 强调（HarmonyOS 宇宙蓝系）
  blue600: "#0A59F7",
  blueSoft: "#D9E7FF",
  darkBlue: "#4C8DFF",
  darkBlueSoft: "#22365E",
  // 语义色（HarmonyOS 语义色系；浅色取深色变体以达标正文对比度 ≥4.5:1）
  green: "#2C7A38",
  greenSoft: "#E3F2E4",
  darkGreen: "#64BB5C",
  amber: "#A35200",
  amberSoft: "#FCF1DD",
  darkAmber: "#ED6F21",
  red: "#CC2B1B",
  redSoft: "#FDEBEA",
  darkRed: "#F06A5A",
} as const;

// ===== Semantic 层（浅色主题） =====

export const Colors = {
  /** 窗口底色 */
  BgBase: Primitive.gray50,
  /** 面板/卡片表面 */
  Surface: Primitive.gray0,
  /** 次级表面（列表头/输入底） */
  Surface2: Primitive.gray100,
  /** 主文本 */
  Fg: Primitive.gray600,
  /** 次要文本 */
  Fg2: Primitive.gray500,
  /** 弱化文本/占位 */
  Fg3: Primitive.gray400,
  /** 常规边框 */
  Border: Primitive.gray200,
  /** 强调边框/分割 */
  BorderStrong: Primitive.gray300,
  /** 主强调/选中 */
  Accent: Primitive.blue600,
  /** 选中底/高亮底 */
  AccentSoft: Primitive.blueSoft,
  /** 成功/在线/通过 */
  Success: Primitive.green,
  SuccessBg: Primitive.greenSoft,
  /** 警告/执行中 */
  Warn: Primitive.amber,
  WarnBg: Primitive.amberSoft,
  /** 失败/崩溃 */
  Error: Primitive.red,
  /** 信号行底色 */
  SignalBg: Primitive.redSoft,
  /** 离线/禁用 */
  Offline: Primitive.gray400,
  /** 键盘焦点环 */
  FocusRing: "rgba(10,89,247,0.45)",
  // ===== 兼容别名（旧组件/模块迁移前使用，Phase C/D 逐步移除） =====
  NavBg: Primitive.gray100,
  ContentBg: Primitive.gray50,
  PanelBg: Primitive.gray0,
  PanelBorder: Primitive.gray200,
  ListBg: Primitive.gray100,
  ListBorder: Primitive.gray200,
  TextPrimary: Primitive.gray600,
  TextSecondary: Primitive.gray500,
  TextTertiary: Primitive.gray400,
  AccentBg: Primitive.blueSoft,
  AccentHover: "#094DDB",
  NavHover: "#EDF3FF",
  Tag: "#8A5A00",
  Splitter: Primitive.gray300,
  SplitterHover: "#6E7680",
  Disabled: "#A8A8A8",
} as const;

/** 语义色名联合类型 */
export type SemanticColorName = keyof typeof Colors;

// ===== Semantic 层（深色主题） =====

export const DarkColors: Record<SemanticColorName, string> = {
  BgBase: Primitive.darkBase,
  Surface: Primitive.darkSurface,
  Surface2: Primitive.darkSurface2,
  Fg: Primitive.darkFg,
  Fg2: Primitive.darkFg2,
  Fg3: Primitive.darkFg3,
  Border: Primitive.darkBorder,
  BorderStrong: Primitive.darkBorderStrong,
  Accent: Primitive.darkBlue,
  AccentSoft: Primitive.darkBlueSoft,
  Success: Primitive.darkGreen,
  SuccessBg: "#24351F",
  Warn: Primitive.darkAmber,
  WarnBg: "#3A2E1A",
  Error: Primitive.darkRed,
  SignalBg: "#4A2A28",
  Offline: Primitive.darkFg3,
  FocusRing: "rgba(76,141,255,0.5)",
  NavBg: Primitive.darkSurface2,
  ContentBg: Primitive.darkBase,
  PanelBg: Primitive.darkSurface,
  PanelBorder: Primitive.darkBorder,
  ListBg: Primitive.darkSurface2,
  ListBorder: Primitive.darkBorder,
  TextPrimary: Primitive.darkFg,
  TextSecondary: Primitive.darkFg2,
  TextTertiary: Primitive.darkFg3,
  AccentBg: Primitive.darkBlueSoft,
  AccentHover: "#6AA3FF",
  NavHover: "#2A3345",
  Tag: "#C99A3D",
  Splitter: Primitive.darkBorderStrong,
  SplitterHover: "#9AA3AD",
  Disabled: "#555555",
};

// ===== Component 层：logcat 级别板（双主题） =====

export const LogLevelLight = {
  v: "#6E7686",
  d: "#3D6E9E",
  i: "#1F7A33",
  w: "#9A6A00",
  e: "#C22929",
  f: "#FFFFFF",
  /** Fatal 反色块底色 */
  fBg: "#C22929",
} as const;

export const LogLevelDark = {
  v: "#8A93A6",
  d: "#7FA8CE",
  i: "#57B96B",
  w: "#D9A43C",
  e: "#E86A6A",
  f: "#1B1D22",
  fBg: "#E86A6A",
} as const;
