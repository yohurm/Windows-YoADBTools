/**
 * YoFormRow —— 表单/设置行默认排布。
 * 左侧标题信息（标题 / 副标题 / 备注），右侧控件；两列垂直居中。
 * HarmonyOS 对照：列表项「内容左、操作右」，右侧与内容间距 12vp。
 */
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import "./FormRow.css";

export interface YoFormRowProps {
  /** 标题 */
  title: string;
  /** 副标题 / 说明 */
  description?: JSX.Element;
  /** 备注（生效徽章等），跟在标题同一行后面 */
  note?: JSX.Element;
  /** 额外 class */
  class?: string;
  classList?: Record<string, boolean | undefined>;
  /** 右侧设置内容 */
  children: JSX.Element;
}

/**
 * 渲染一行「左信息、右控件」的表单项。页面不要再自写这套 flex。
 */
export function YoFormRow(props: YoFormRowProps): JSX.Element {
  return (
    <div
      class={`yohu-form-row${props.class ? ` ${props.class}` : ""}`}
      classList={props.classList}
    >
      <div class="yohu-form-row__info">
        <div class="yohu-form-row__heading">
          <div class="yohu-form-row__title">{props.title}</div>
          <Show when={props.note}>
            <div class="yohu-form-row__note">{props.note}</div>
          </Show>
        </div>
        <Show when={props.description}>
          <div class="yohu-form-row__description">{props.description}</div>
        </Show>
      </div>
      <div class="yohu-form-row__control">{props.children}</div>
    </div>
  );
}
