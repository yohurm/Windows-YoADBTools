/**
 * 工作台主布局：左侧（设备栏 + 模块导航）/ 右侧内容区 / 底部状态栏。
 */

import { type Component, type JSX, Show } from "solid-js";

import { YBadge, YToolbar } from "@yovo/ui";

import { modules } from "../registry";
import { deviceStore } from "../stores";
import { DeviceRail } from "./DeviceRail";
import { NavList } from "./NavList";
import { StatusBar } from "./StatusBar";

/** 工作台壳（activeModuleId 由 App 持有）。 */
export const AppLayout: Component<{
  activeModuleId: () => string;
  onNavigate: (id: string) => void;
}> = (props) => {
  const current = () => modules().find((m) => m.id === props.activeModuleId());

  return (
    <div class="yovo-layout">
      <aside class="yovo-layout__rail">
        <DeviceRail />
        <NavList activeId={props.activeModuleId()} onNavigate={props.onNavigate} />
      </aside>
      <main class="yovo-layout__content">
        <Show when={current()} keyed>
          {(mod) => {
            const C = mod.Component;
            return <C focusSerial={deviceStore.state.focusSerial} />;
          }}
        </Show>
      </main>
      <StatusBar />
    </div>
  );
};

/** 模块工具栏（各模块视图自行组织工具栏）。 */
export const ModuleToolbar: Component<{
  title: string;
  badge?: string;
  children?: JSX.Element;
}> = (props) => (
  <YToolbar>
    <span class="yovo-module-title">{props.title}</span>
    <Show when={props.badge}>
      <YBadge text={props.badge!} tone="neutral" />
    </Show>
    {props.children}
  </YToolbar>
);

// 布局样式（token 引用见 @yovo/ui theme.css；此处仅结构性布局）
import "./shell.css";
