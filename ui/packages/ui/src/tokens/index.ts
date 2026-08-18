/**
 * @yohu/ui token 入口。
 * 引入 theme.css + states.css；导出 setTheme/getTheme（含 system 偏好）。
 */
import "./theme.css";
import "./states.css";

import type { DensityName } from "./density";

export * from "./colors";
export * from "./typography";
export * from "./spacing";
export * from "./radius";
export * from "./density";
export * from "./layout";
export * from "./elevation";
export * from "./motion";
export * from "./state";
export { emitThemeCss } from "./emit-theme";

/** 解析后的外观（写入 `data-theme`）。 */
export type ThemeName = "light" | "dark";

/** 用户偏好（写入 `data-theme-pref`；system 跟随系统）。 */
export type ThemePreference = ThemeName | "system";

let systemMedia: MediaQueryList | null = null;
let systemListener: ((event: MediaQueryListEvent) => void) | null = null;

function prefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyResolved(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme);
}

function detachSystemListener(): void {
  if (systemMedia && systemListener) {
    systemMedia.removeEventListener("change", systemListener);
  }
  systemMedia = null;
  systemListener = null;
}

function attachSystemListener(): void {
  detachSystemListener();
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }
  systemMedia = window.matchMedia("(prefers-color-scheme: dark)");
  systemListener = (event) => applyResolved(event.matches ? "dark" : "light");
  systemMedia.addEventListener("change", systemListener);
}

/**
 * 切换主题偏好。`system` 解析 `prefers-color-scheme` 并监听变更。
 */
export function setTheme(theme: ThemePreference): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.setAttribute("data-theme-pref", theme);
  if (theme === "system") {
    applyResolved(prefersDark() ? "dark" : "light");
    attachSystemListener();
    return;
  }
  detachSystemListener();
  applyResolved(theme);
}

/**
 * 读取已解析外观；未设置时视为 light。
 */
export function getTheme(): ThemeName {
  if (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark") {
    return "dark";
  }
  return "light";
}

/**
 * 读取用户偏好；未设置时视为 light（测试与未调用 setTheme 的兜底）。
 */
export function getThemePreference(): ThemePreference {
  const pref = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme-pref") : null;
  if (pref === "dark" || pref === "system" || pref === "light") {
    return pref;
  }
  return "light";
}

/** 切换密度（compact/comfortable）。 */
export function setDensity(density: DensityName): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-density", density);
  }
}

/** 读取当前密度；未显式设置时视为 compact。 */
export function getDensity(): DensityName {
  if (typeof document !== "undefined" && document.documentElement.getAttribute("data-density") === "comfortable") {
    return "comfortable";
  }
  return "compact";
}
