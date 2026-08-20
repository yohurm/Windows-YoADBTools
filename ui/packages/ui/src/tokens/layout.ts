import { Spacing } from "./spacing";

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
  /** 设置页路径类控件上限，避免输入框横向拉满。 */
  SettingsControlMax: 360,
  /** 设置页数字输入宽度。 */
  SettingsNumberW: 96,
  OutputMax: 260,
  CrumbMax: 160,
  CmGroupMin: 168,
  CmGroupMax: 200,
  CmCmdMin: 188,
  CmCmdMax: 228,
  HitSplitter: 6,
  HitNudge: 3,
  IconTiny: 12,
  /** 标题栏应用图标 / 窗口三键（HarmonyOS 小图标 16vp） */
  IconSm: 16,
  /** 电脑窗口默认 1200×800vp */
  WindowDefaultW: 1200,
  WindowDefaultH: 800,
  /** 电脑窗口最小 360×240vp */
  WindowMinW: 360,
  WindowMinH: 240,
  /** PC 屏幕左右边距 40vp（设置页） */
  PageMargin: 40,
  /** 效率型模块页壳内边距；数值单源 Spacing.Md，经 YoPage 消费 */
  PageInset: Spacing.Md,
  /** 页眉与分区、分区间距；与 PageInset 同值 */
  PageGap: Spacing.Md,
  /** 页眉标题行下方到分割线；数值单源 Spacing.Sm，经 YoChrome 消费 */
  ChromePad: Spacing.Sm,
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
  /** HarmonyOS Toggle Switch 默认 {width:36vp, height:20vp} */
  SwitchW: 36,
  SwitchH: 20,
  /** 窗口三键与侧栏钮同一竖条宽（鸿蒙 PC 推荐热区 48vp）。 */
  TitlebarCaption: 48,
  /** 右侧铬条贴合，无圆形底板间距。 */
  TitlebarCaptionGap: 0,
  /** 关闭键贴窗口右缘（电脑去边距）。 */
  TitlebarCloseMargin: 0,
  /** 标题栏渐变模糊下延 32vp（沉浸光感） */
  TitlebarBlur: 32,
  /** 12 列栅格 gutter（≥840vp） */
  Gutter: 16,
  /** 栅格最大使用宽度 2220vp，超出左右留白 */
  GridMax: 2220,
} as const;

/** 数量约束（不是 CSS px，禁止塞进 Layout）。 */
export const LayoutLimits = {
  /** 电脑标题栏右侧图标最多 3 个（含菜单） */
  TitlebarMaxActions: 3,
  /** 三分栏 C 栏工具栏最多 6 个图标 */
  ToolbarMaxIcons: 6,
  /** 侧边栏宽度 ≤ 窗口宽 40% */
  SidebarMaxPercent: 40,
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
