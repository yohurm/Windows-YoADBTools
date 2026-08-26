/**
 * YoLoading —— 区域/页面加载占位。
 * HarmonyOS 对照：Loading；环 + 标题/描述，居中说明。
 * 控件内加载仍走 YoButton / YoIconButton 的 loading，禁止模块自写 spinner。
 */
import type { JSX } from "solid-js";
import "./Loading.css";

export interface YoLoadingProps {
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
  /** 铺满父级（盖住下层内容，如投屏画布） */
  cover?: boolean;
}

/**
 * 渲染一个居中的加载占位。
 */
export function YoLoading(props: YoLoadingProps): JSX.Element {
  return (
    <div
      class="yohu-loading"
      classList={{ "yohu-loading--cover": !!props.cover }}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span class="yohu-loading__spinner" aria-hidden="true" />
      <div class="yohu-loading__title">{props.title}</div>
      {props.description ? <div class="yohu-loading__description">{props.description}</div> : null}
    </div>
  );
}
