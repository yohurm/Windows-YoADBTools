/**
 * @yovo/ui token 入口。
 * 引入 theme.css 以注入 `--yovo-*` 变量（浅色 + 深色覆盖），
 * 并导出 setTheme/getTheme 用于切换主题。
 */
import "./theme.css";

import type { DensityName } from "./density";

export * from "./colors";
export * from "./typography";
export * from "./spacing";
export * from "./radius";
export * from "./density";
export * from "./motion";

/** 支持的主题名 */
export type ThemeName = "light" | "dark";

/**
 * 切换主题：给 `document.documentElement` 设置 `data-theme`。
 * 样式层通过 `[data-theme="dark"]` 覆盖变量实现深色。
 */
export function setTheme(theme: ThemeName): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

/**
 * 读取当前主题；未显式设置时视为 light。
 */
export function getTheme(): ThemeName {
  if (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark") {
    return "dark";
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
