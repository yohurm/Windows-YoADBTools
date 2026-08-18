/**
 * 布局常量（不随密度变，UI设计系统-v6.md §2.3）。
 * 壳宽 / 侧栏 / 预览 / 设置页 / 命中区一律走这里，禁止模块再写裸 px。
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
