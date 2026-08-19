/**
 * 布局常量（不随密度变，UI设计系统-v6.md §2.3）。
 * 壳宽 / 侧栏 / 预览 / 设置页 / 命中区一律走这里，禁止模块再写裸 px。
 * 窗口默认/最小、断点、页边距对齐 HarmonyOS 电脑/大屏规范。
 */
export const Layout = {
  ShellNav: 232,
  Sidebar: 280,
  Preview: 240,
  SettingsMax: 920,
  SettingsLabelMin: 160,
  SettingsLabelMax: 240,
  OutputMax: 260,
  CrumbMax: 160,
  CmGroupMin: 168,
  CmGroupMax: 200,
  CmCmdMin: 188,
  CmCmdMax: 228,
  HitSplitter: 6,
  HitNudge: 3,
  IconTiny: 12,
  /** 电脑窗口默认 1200×800vp */
  WindowDefaultW: 1200,
  WindowDefaultH: 800,
  /** 电脑窗口最小 360×240vp */
  WindowMinW: 360,
  WindowMinH: 240,
  /** PC 屏幕左右边距 40vp */
  PageMargin: 40,
  /** 分栏布局触发 ≥600vp */
  BreakpointSplit: 600,
  /** 侧边页签触发 ≥840vp */
  BreakpointSide: 840,
  /** 按钮最大宽 448vp */
  ButtonMax: 448,
  /** 弹出框最大宽 400vp */
  DialogMax: 400,
  /** 电脑菜单默认最小宽 224vp */
  MenuMin: 224,
  /** 侧栏内容距背板（设备/导航同一槽，选中片不再二次内缩） */
  RailInset: 8,
} as const;

/** 描边宽度（结构线 / 强调条）。 */
export const Stroke = {
  Hairline: 1,
  Accent: 2,
  Emphasis: 3,
} as const;

/** 焦点环几何。 */
export const FocusRing = {
  Width: 2,
  Offset: 1,
  OffsetInset: -2,
} as const;
