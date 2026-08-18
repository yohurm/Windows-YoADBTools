/**
 * 色彩 token（三层架构，见 docs/architecture/UI设计系统-v6.md §2）：
 *   Primitive（原始板，仅本文件使用）
 * → Semantic（语义板：Colors=浅色 / DarkColors=深色）
 * → Component（级别板 / 交互态，供组件直接消费）
 *
 * 组件与模块样式 100% 引用语义/组件层（CSS 变量 `--yohu-*`），禁止裸色值。
 */

// ===== Primitive 层（原始板：仅 tokens 内部引用） =====

export const Primitive = {
  gray0: "#FFFFFF",
  gray50: "#F5F6F8",
  gray100: "#F0F2F5",
  gray200: "#D9DEE6",
  gray300: "#B7BFCB",
  gray400: "#8A919C",
  gray500: "#565D68",
  gray600: "#1B1D22",
  darkBase: "#17181C",
  darkSurface: "#1F2127",
  darkSurface2: "#262930",
  darkBorder: "#333844",
  darkBorderStrong: "#454B58",
  darkFg: "#E8EAEF",
  darkFg2: "#A6ADBB",
  darkFg3: "#6E7686",
  blue800: "#0740C4",
  blue700: "#094DDB",
  blue600: "#0A59F7",
  blueSoft: "#D9E7FF",
  darkBlue: "#4C8DFF",
  darkBlueHover: "#6AA3FF",
  darkBluePressed: "#8BB4FF",
  darkBlueSoft: "#22365E",
  green: "#2C7A38",
  greenSoft: "#E3F2E4",
  darkGreen: "#64BB5C",
  darkGreenSoft: "#24351F",
  amber: "#A35200",
  amberSoft: "#FCF1DD",
  darkAmber: "#ED6F21",
  darkAmberSoft: "#3A2E1A",
  red: "#CC2B1B",
  redSoft: "#FDEBEA",
  darkRed: "#F06A5A",
  darkRedSoft: "#4A2A28",
  tag: "#8A5A00",
  darkTag: "#C99A3D",
  splitterHover: "#6E7680",
  darkSplitterHover: "#9AA3AD",
  disabled: "#A8A8A8",
  darkDisabled: "#555555",
  levelV: "#6E7686",
  levelD: "#3D6E9E",
  levelI: "#1F7A33",
  levelW: "#9A6A00",
  levelE: "#C22929",
  darkLevelV: "#8A93A6",
  darkLevelD: "#7FA8CE",
  darkLevelI: "#57B96B",
  darkLevelW: "#D9A43C",
  darkLevelE: "#E86A6A",
} as const;

// ===== Semantic 层（浅色主题） =====

export const Colors = {
  BgBase: Primitive.gray50,
  Surface: Primitive.gray0,
  Surface2: Primitive.gray100,
  Fg: Primitive.gray600,
  Fg2: Primitive.gray500,
  Fg3: Primitive.gray400,
  Border: Primitive.gray200,
  BorderStrong: Primitive.gray300,
  Accent: Primitive.blue600,
  AccentSoft: Primitive.blueSoft,
  AccentHover: Primitive.blue700,
  AccentPressed: Primitive.blue800,
  Success: Primitive.green,
  SuccessBg: Primitive.greenSoft,
  Warn: Primitive.amber,
  WarnBg: Primitive.amberSoft,
  Error: Primitive.red,
  SignalBg: Primitive.redSoft,
  Offline: Primitive.gray400,
  FocusRing: "rgba(10,89,247,0.45)",
  Tag: Primitive.tag,
  Splitter: Primitive.gray300,
  SplitterHover: Primitive.splitterHover,
  Disabled: Primitive.disabled,
} as const;

export type SemanticColorName = keyof typeof Colors;

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
  AccentHover: Primitive.darkBlueHover,
  AccentPressed: Primitive.darkBluePressed,
  Success: Primitive.darkGreen,
  SuccessBg: Primitive.darkGreenSoft,
  Warn: Primitive.darkAmber,
  WarnBg: Primitive.darkAmberSoft,
  Error: Primitive.darkRed,
  SignalBg: Primitive.darkRedSoft,
  Offline: Primitive.darkFg3,
  FocusRing: "rgba(76,141,255,0.5)",
  Tag: Primitive.darkTag,
  Splitter: Primitive.darkBorderStrong,
  SplitterHover: Primitive.darkSplitterHover,
  Disabled: Primitive.darkDisabled,
};

export const LogLevelLight = {
  v: Primitive.levelV,
  d: Primitive.levelD,
  i: Primitive.levelI,
  w: Primitive.levelW,
  e: Primitive.levelE,
  f: Primitive.gray0,
  fBg: Primitive.levelE,
} as const;

export const LogLevelDark = {
  v: Primitive.darkLevelV,
  d: Primitive.darkLevelD,
  i: Primitive.darkLevelI,
  w: Primitive.darkLevelW,
  e: Primitive.darkLevelE,
  f: Primitive.gray600,
  fBg: Primitive.darkLevelE,
} as const;
