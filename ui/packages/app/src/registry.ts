/**
 * 模块注册表（ADR-v6-012）：静态组合，无插件热加载。
 * 模块间零 import（depcheck 强制）；模块只依赖 @yohu/api + @yohu/ui。
 */

import type { Component } from "solid-js";

import type { DeviceSession } from "@yohu/api";
import type { IconName } from "@yohu/ui";

/** 模块对设备的选择模式（与 core yohu-domain::SelectionMode 一致；目标解析见 resolveTargetSerials）。
 *  none：不消费设备。singleRequired：轨单击；执行目标=在线焦点。
 *  multiOptional：轨可加选；执行目标=勾选∩在线，空则回退焦点（仅终端并行）。
 *  日志多窗口绑设备走会话模型，轨用 singleRequired。
 */
export type SelectionMode = "none" | "singleRequired" | "multiOptional";

/** 导航分区：workspace=模块列表；system=侧栏底栏（设置，与模块横线隔开）。 */
export type ModuleKind = "workspace" | "system";

export interface ModuleDescriptor {
  /** 模块 id（与数据目录 modules/<id> 一致） */
  id: string;
  title: string;
  icon: IconName;
  selectionMode: SelectionMode;
  /** 导航分区；缺省 workspace */
  kind?: ModuleKind;
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

function kindOf(mod: ModuleDescriptor): ModuleKind {
  return mod.kind ?? "workspace";
}

/** 侧栏「模块」区：效率型/占位模块。 */
export function workspaceModules(): readonly ModuleDescriptor[] {
  return registry.filter((m) => kindOf(m) === "workspace");
}

/** 侧栏底栏：壳内建页（设置）。 */
export function systemModules(): readonly ModuleDescriptor[] {
  return registry.filter((m) => kindOf(m) === "system");
}
