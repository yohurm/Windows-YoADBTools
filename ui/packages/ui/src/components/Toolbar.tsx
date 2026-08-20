/**
 * YoToolbar —— 模块工具栏。
 * HarmonyOS 对照：标题栏中区 / Toolbar；水平排列，间距 Spacing.Sm。
 * 受控 API：children / variant。
 */
import type { JSX } from "solid-js";
import "./Toolbar.css";

/** page = 对话框/页内栏；chrome = 并入窗口标题栏中区。 */
export type YoToolbarVariant = "page" | "chrome";

export interface YoToolbarProps {
  children: JSX.Element;
  /** 默认 page（页内有底边距）；chrome 贴满标题栏高度。 */
  variant?: YoToolbarVariant;
}

/**
 * 渲染一个水平排列、间距 8 的工具栏容器。
 */
export function YoToolbar(props: YoToolbarProps): JSX.Element {
  return (
    <div
      class="yohu-toolbar"
      classList={{ "yohu-toolbar--chrome": props.variant === "chrome" }}
    >
      {props.children}
    </div>
  );
}
