/**
 * YoPage —— 效率型模块页壳（UI设计系统-v6.md §3）。
 * 内边距 / 间距走 --yohu-layout-page-inset / page-gap（Spacing.Md 单源）。
 * 设置页不用本组件（走 page-margin）。
 */
import type { JSX } from "solid-js";
import "./page.css";

export interface YoPageProps {
  /** BEM 根（yohu-terminal / yohu-files / yohu-logs）；页垫仍走 .yohu-page */
  class?: string;
  children: JSX.Element;
}

/** 效率型模块根节点：页眉 + 分区同一套页垫，标题左缘对齐。 */
export function YoPage(props: YoPageProps): JSX.Element {
  return <div class={`yohu-page${props.class ? ` ${props.class}` : ""}`}>{props.children}</div>;
}
