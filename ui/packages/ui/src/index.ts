/**
 * @yovo/ui 组件库入口。
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
  MotionDuration,
  MotionEasing,
  setTheme,
  getTheme,
  setDensity,
  getDensity,
} from "./tokens";
export type {
  SemanticColorName,
  ThemeName,
  DensityName,
  MotionDurationName,
  MotionEasingName,
} from "./tokens";

// —— icons ——
export { Icon, ICON_NAMES } from "./icons";
export type { IconName, IconProps } from "./icons";
export { YFileIcon, fileGlyphFor } from "./file-icons";
export type { YFileIconProps, FileGlyph, FileIconKind } from "./file-icons";

// —— 组件 ——
export { YButton } from "./components/Button";
export type { YButtonProps, YButtonVariant, YButtonSize } from "./components/Button";

export { YIconButton } from "./components/IconButton";
export type { YIconButtonProps } from "./components/IconButton";

export { YTextField } from "./components/TextField";
export type { YTextFieldProps } from "./components/TextField";

export { YSelect } from "./components/Select";
export type { YSelectProps, YSelectOption } from "./components/Select";

export { YCheckbox } from "./components/Checkbox";
export type { YCheckboxProps } from "./components/Checkbox";

export { YBadge } from "./components/Badge";
export type { YBadgeProps, YBadgeTone } from "./components/Badge";

export { YToolbar } from "./components/Toolbar";
export type { YToolbarProps } from "./components/Toolbar";

export { YPanel } from "./components/Panel";
export type { YPanelProps, YPanelPadding } from "./components/Panel";

export { YStatusBar } from "./components/StatusBar";
export type { YStatusBarProps } from "./components/StatusBar";

export { YProgressBar } from "./components/ProgressBar";
export type { YProgressBarProps } from "./components/ProgressBar";

export { YEmptyState } from "./components/EmptyState";
export type { YEmptyStateProps } from "./components/EmptyState";

export { YTabs } from "./components/Tabs";
export type { YTabsProps, YTabItem, YTabDot, YTabDotTone } from "./components/Tabs";

export { YVirtualList } from "./components/VirtualList";
export type { YVirtualListProps } from "./components/VirtualList";

export { YTree } from "./components/Tree";
export type { YTreeProps, TreeNode } from "./components/Tree";

export { YColResizer } from "./components/ColResizer";
export type { YColResizerProps } from "./components/ColResizer";

export { YDialog } from "./components/Dialog";
export type { YDialogProps } from "./components/Dialog";

export { YContextMenu } from "./components/ContextMenu";
export type { YContextMenuProps, YMenuItem } from "./components/ContextMenu";

export { YToast, YToaster, createToaster } from "./components/Toast";
export type { ToastItem, ToastTone, Toaster, YToastProps, YToasterProps } from "./components/Toast";
