/**
 * 模块注册表（ADR-v6-012）：静态组合，无插件热加载。
 * 模块间零 import（depcheck 强制）；模块只依赖 @yohu/api + @yohu/ui。
 */

import type { Component } from "solid-js";

import type { DeviceSession } from "@yohu/api";
import type { IconName } from "@yohu/ui";

/** 模块对设备的选择模式（与 core yohu-domain::SelectionMode 一致）。 */
export type SelectionMode = "none" | "singleRequired" | "multiOptional";

export interface ModuleDescriptor {
  /** 模块 id（与数据目录 modules/<id> 一致） */
  id: string;
  title: string;
  icon: IconName;
  selectionMode: SelectionMode;
  /** 占位模块：仅贡献导航 + 「开发中」页 */
  isPlanned?: boolean;
  /** 主视图组件（壳注入 DeviceSession，模块不读壳 store） */
  Component: Component<DeviceSession>;
}

const registry: ModuleDescriptor[] = [];

/** 注册模块（各模块包在入口调用）。 */
export function registerModule(descriptor: ModuleDescriptor): void {
  if (registry.some((m) => m.id === descriptor.id)) {
    throw new Error(`模块重复注册: ${descriptor.id}`);
  }
  registry.push(descriptor);
}

/** 全部已注册模块（按注册顺序）。 */
export function modules(): readonly ModuleDescriptor[] {
  return registry;
}
