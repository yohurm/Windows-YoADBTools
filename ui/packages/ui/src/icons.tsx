/**
 * 自绘 inline SVG 图标集（零第三方 UI 依赖）。
 *
 * SolidJS 的 JSX 元素是真实 DOM 节点：静态缓存同一份 JSX 会在多处渲染时
 * **被挪走**（导航点进模块后图标消失）。因此每个 glyph 必须是工厂函数。
 */
import type { JSX } from "solid-js";
import "./icons.css";

/** 图标名（组件库图标集，模块注册表只允许使用这些名字） */
export type IconName =
  | "refresh"
  | "settings"
  | "terminal"
  | "folder"
  | "log"
  | "mirror"
  | "close"
  | "plus"
  | "chevron-down"
  | "chevron-right"
  | "chevron-up"
  | "search"
  | "play"
  | "pause"
  | "clear"
  | "export"
  | "trash"
  | "info"
  | "arrow-up"
  | "arrow-down";

export interface IconProps {
  /** 图标名 */
  name: IconName;
  /** 尺寸（px），默认 16 */
  size?: number;
}

const FILLED: ReadonlySet<IconName> = new Set(["play", "pause"]);

/** 图标路径工厂（描边风格，24×24）。每次调用返回新节点。 */
const ICON_GLYPHS: Record<IconName, () => JSX.Element> = {
  refresh: () => (
    <>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>
  ),
  settings: () => (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  terminal: () => (
    <>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </>
  ),
  folder: () => <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  log: () => (
    <>
      <line x1="21" y1="6" x2="3" y2="6" />
      <line x1="17" y1="10" x2="3" y2="10" />
      <line x1="21" y1="14" x2="3" y2="14" />
      <line x1="17" y1="18" x2="3" y2="18" />
    </>
  ),
  mirror: () => (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  close: () => (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  plus: () => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  "chevron-down": () => <polyline points="6 9 12 15 18 9" />,
  "chevron-right": () => <polyline points="9 18 15 12 9 6" />,
  "chevron-up": () => <polyline points="18 15 12 9 6 15" />,
  search: () => (
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  play: () => <polygon points="5 3 19 12 5 21 5 3" />,
  pause: () => (
    <>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </>
  ),
  clear: () => (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </>
  ),
  export: () => (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  trash: () => (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </>
  ),
  info: () => (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </>
  ),
  "arrow-up": () => (
    <>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </>
  ),
  "arrow-down": () => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </>
  ),
};

/** 图标名清单（注册表/测试用，与 ICON_GLYPHS 对齐）。 */
export const ICON_NAMES = Object.keys(ICON_GLYPHS) as IconName[];

/**
 * 图标组件：按名字渲染自绘 SVG。
 * play/pause 为实心（fill），其余为描边（stroke）；颜色走 currentColor。
 */
export function Icon(props: IconProps): JSX.Element {
  const size = () => props.size ?? 16;
  const filled = () => FILLED.has(props.name);
  return (
    <svg
      class="yohu-icon"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill={filled() ? "currentColor" : "none"}
      stroke={filled() ? "none" : "currentColor"}
      stroke-width={2}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      data-icon={props.name}
    >
      {ICON_GLYPHS[props.name]()}
    </svg>
  );
}
