/**
 * @yohu/ui 组件库入口。
 * 导出全部 token、图标与公开组件（Yo* 标注）。
 */

// —— tokens ——
// 公开面只表达契约：`MotionDuration` / `MotionEasing` / `MotionSpec`（动效配方名）、`motionDurationMs`（外部模块消费）。
// `MotionSpring` / `springCssEasing` 是采样实现（把欠阻尼弹簧采成 `linear()`），只被 motion 模块内部消费，
// 不进入对外导出面；消费弹簧请用 `MotionEasing.spring` / `MotionEasing.springSoft`。
export {
  Colors,
  DarkColors,
  FontSizes,
  FontSizesCompact,
  FontLeading,
  FontWeights,
  FontFamilies,
  Spacing,
  SpacingBase,
  Radius,
  RadiusShape,
  Layout,
  LayoutLimits,
  Stroke,
  FocusRing,
  Elevation,
  DarkElevation,
  Density,
  MotionDuration,
  MotionEasing,
  MotionSpec,
  motionDurationMs,
  StateFill,
  setTheme,
  getTheme,
  getThemePreference,
  setDensity,
  getDensity,
} from "./tokens";
export type {
  SemanticColorName,
  ThemeName,
  ThemePreference,
  DensityName,
  MotionDurationName,
  MotionEasingName,
  MotionSpecName,
} from "./tokens";

// —— icons ——
export { Icon, ICON_NAMES } from "./icons";
export type { IconName, IconProps } from "./icons";
export { YoFileIcon } from "./file-icons";
export type { YoFileIconProps } from "./file-icons";
export { fileGlyphFor } from "./file-glyph";
export type { FileGlyph, FileIconKind } from "./file-glyph";

// —— 基础 ——
export { YoButton } from "./components/Button";
export type { YoButtonProps, YoButtonVariant, YoButtonSize } from "./components/Button";

export { YoSegmentedButton } from "./components/SegmentedButton";
export type {
  YoSegmentedButtonProps,
  YoSegmentedButtonSize,
  YoSegmentedItem,
  YoSegmentedType,
} from "./components/SegmentedButton";
export { YO_SEGMENTED_MAX_ITEMS } from "./components/segmented-model";

export { YoIconButton } from "./components/IconButton";
export type { YoIconButtonProps } from "./components/IconButton";

export { YoTextField } from "./components/TextField";
export type { YoTextFieldProps } from "./components/TextField";

export { YoSelect } from "./components/Select";
export type { YoSelectProps, YoSelectOption } from "./components/Select";

export { YoCheckbox } from "./components/Checkbox";
export type { YoCheckboxProps } from "./components/Checkbox";

export { YoSwitch } from "./components/Switch";
export type { YoSwitchProps } from "./components/Switch";

export { YoBadge } from "./components/Badge";
export type { YoBadgeProps, YoBadgeTone } from "./components/Badge";

export { YoProgressBar } from "./components/ProgressBar";
export type { YoProgressBarProps } from "./components/ProgressBar";

// —— 导航 ——
export { YoToolbar } from "./components/Toolbar";
export type { YoToolbarProps } from "./components/Toolbar";

export { YoTabs } from "./components/Tabs";
export type { YoTabsProps, YoTabItem, YoTabDot, YoTabDotTone } from "./components/Tabs";

export { YoTree } from "./components/Tree";
export type { YoTreeProps, TreeNode } from "./components/Tree";

export { YoVirtualList } from "./components/VirtualList";
export type { YoVirtualListProps } from "./components/VirtualList";

export { YoColResizer } from "./components/ColResizer";
export type { YoColResizerProps } from "./components/ColResizer";

export { YoColHeader } from "./components/ColHeader";
export type { YoColHeaderProps, YoColHeaderAlign, YoColHeaderSort } from "./components/ColHeader";

export { YoPanel } from "./components/Panel";
export type { YoPanelProps, YoPanelPadding, YoPanelVariant } from "./components/Panel";

export { YoPage } from "./components/Page";
export type { YoPageProps } from "./components/Page";

// —— 键盘作用域（L1；页面提供绑定表） ——
export {
  adjacentJoin,
  allKeys,
  attachPanelKeys,
  eventKey,
  isActionableTarget,
  isCommandModifier,
  isEditableTarget,
  isInside,
  isModKey,
  matchBindings,
  matchesChord,
  modPlatform,
  nextKeys,
  panelKeyContext,
  pointerSelectMode,
  whenIdle,
  whenList,
  whenPanel,
  whenPanelOrField,
} from "./keymap";
export type {
  KeyBinding,
  KeyChord,
  ModifierPlatform,
  PanelKeyContext,
  PanelKeyHost,
  PanelKeyOwnership,
  PanelScopeOptions,
  SelectJoin,
  SelectMode,
} from "./keymap";

// —— 反馈 ——
export { YoEmptyState } from "./components/EmptyState";
export type { YoEmptyStateProps } from "./components/EmptyState";

export { YoLoading } from "./components/Loading";
export type { YoLoadingProps } from "./components/Loading";

export { YoDialog } from "./components/Dialog";
export type { YoDialogProps } from "./components/Dialog";

// —— 右键菜单（L1；页面提供场景表，壳挂唯一 Host；YoContextMenu 仅 Host 内部使用） ——
// 注意：默认单例 `contextMenu` 只被 YoContextMenuHost 内部读取；公开导出可变全局本体没有意义，
// 故不从此处导出。页面/模块统一走 `openContextMenu` / `closeContextMenu` 薄转发；
// 需要独立实例时用工厂 `createContextMenuController`。
export {
  YoContextMenuHost,
  closeContextMenu,
  createContextMenuController,
  defineContextMenu,
  openContextMenu,
} from "./context-menu";
export type {
  ContextMenuController,
  ContextMenuRequest,
  ContextMenuScene,
  ContextMenuSession,
  YoContextMenuHostProps,
  YoMenuItem,
} from "./context-menu";

export { YoToast, YoToaster, createToaster } from "./components/Toast";
export type { ToastItem, ToastTone, Toaster, YoToastProps, YoToasterProps } from "./components/Toast";

export {
  YoPresence,
  YoCollapse,
  YoSwap,
  YoIndicator,
  prefersReducedMotion,
  shouldSkipMotion,
  PRESENCE_EXIT_DURATION,
  SWAP_DURATION,
  INDICATOR_DURATION,
  DISMISS_HOLD_DURATION,
} from "./motion";
export type {
  YoPresenceProps,
  YoCollapseProps,
  YoSwapProps,
  YoIndicatorProps,
  IndicatorVariant,
  PresenceRecipe,
} from "./motion";

// —— 窗口铬 ——
export { YoChrome } from "./components/chrome";
export type { YoChromeProps } from "./components/chrome";
export { YoTitleBar } from "./components/TitleBar";
export type { YoTitleBarProps } from "./components/TitleBar";

export { YoStatusBar } from "./components/StatusBar";
export type { YoStatusBarProps } from "./components/StatusBar";
