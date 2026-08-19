/**
 * @yohu/ui 组件库入口。
 * 导出全部 token、图标与组件（第一期交付清单）。
 */

// —— tokens ——
export {
  Colors,
  DarkColors,
  FontSizes,
  FontWeights,
  FontFamilies,
  Spacing,
  SpacingBase,
  Radius,
  RadiusShape,
  Layout,
  Stroke,
  FocusRing,
  Elevation,
  DarkElevation,
  Density,
  MotionDuration,
  MotionEasing,
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
} from "./tokens";

// —— icons ——
export { Icon, ICON_NAMES } from "./icons";
export type { IconName, IconProps } from "./icons";
export { YoFileIcon, fileGlyphFor } from "./file-icons";
export type { YoFileIconProps, FileGlyph, FileIconKind } from "./file-icons";

// —— 组件 ——
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

export { YoBadge } from "./components/Badge";
export type { YoBadgeProps, YoBadgeTone } from "./components/Badge";

export { YoToolbar } from "./components/Toolbar";
export type { YoToolbarProps } from "./components/Toolbar";

export { YoPanel } from "./components/Panel";
export type { YoPanelProps, YoPanelPadding } from "./components/Panel";

export { YoStatusBar } from "./components/StatusBar";
export type { YoStatusBarProps } from "./components/StatusBar";

export { YoProgressBar } from "./components/ProgressBar";
export type { YoProgressBarProps } from "./components/ProgressBar";

export { YoEmptyState } from "./components/EmptyState";
export type { YoEmptyStateProps } from "./components/EmptyState";

export { YoTabs } from "./components/Tabs";
export type { YoTabsProps, YoTabItem, YoTabDot, YoTabDotTone } from "./components/Tabs";

export { YoVirtualList } from "./components/VirtualList";
export type { YoVirtualListProps } from "./components/VirtualList";

export { YoTree } from "./components/Tree";
export type { YoTreeProps, TreeNode } from "./components/Tree";

export { YoColResizer } from "./components/ColResizer";
export type { YoColResizerProps } from "./components/ColResizer";

export { YoDialog } from "./components/Dialog";
export type { YoDialogProps } from "./components/Dialog";

export { YoContextMenu } from "./components/ContextMenu";
export type { YoContextMenuProps, YoMenuItem } from "./components/ContextMenu";

export { YoToast, YoToaster, createToaster } from "./components/Toast";
export type { ToastItem, ToastTone, Toaster, YoToastProps, YoToasterProps } from "./components/Toast";
