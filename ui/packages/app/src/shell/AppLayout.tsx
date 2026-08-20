/**
 * 工作台主布局：窗口铬（标题栏）+ 左侧（设备栏 + 模块导航）/ 右侧内容区 / 底部状态栏。
 * 单一 canvas 铺满窗口；标题栏/侧栏/状态栏不刷互打架的实底。
 */

import { type Component, type JSX, Show } from "solid-js";

import { YoBadge, YoTitleBar, YoToolbar } from "@yohu/ui";

import { modules } from "../registry";
import { deviceStore } from "../stores";
import { DeviceRail } from "./DeviceRail";
import { NavList } from "./NavList";
import { StatusBar } from "./StatusBar";

/** 工作台壳（activeModuleId 由 App 持有；窗口三键由 App 接线 Tauri）。 */
export const AppLayout: Component<{
  activeModuleId: () => string;
  onNavigate: (id: string) => void;
  maximized?: boolean;
  onMinimize?: () => void;
  onToggleMaximize?: () => void;
  onClose?: () => void;
}> = (props) => {
  const current = () => modules().find((m) => m.id === props.activeModuleId());

  return (
    <div class="yohu-window">
      <YoTitleBar
        title="Yohu ADB Tools"
        icon="terminal"
        maximized={props.maximized}
        onMinimize={props.onMinimize}
        onToggleMaximize={props.onToggleMaximize}
        onClose={props.onClose}
      />
      <div class="yohu-layout">
        <aside class="yohu-layout__rail">
          <DeviceRail />
          <NavList activeId={props.activeModuleId()} onNavigate={props.onNavigate} />
        </aside>
        <main class="yohu-layout__content">
          <Show when={current()} keyed>
            {(mod) => {
              const C = mod.Component;
              return <C focusSerial={deviceStore.state.focusSerial} />;
            }}
          </Show>
        </main>
        <StatusBar />
      </div>
    </div>
  );
};

/** 模块工具栏（各模块视图自行组织工具栏）。 */
export const ModuleToolbar: Component<{
  title: string;
  badge?: string;
  children?: JSX.Element;
}> = (props) => (
  <YoToolbar>
    <span class="yohu-module-title">{props.title}</span>
    <Show when={props.badge}>
      <YoBadge text={props.badge!} tone="neutral" />
    </Show>
    {props.children}
  </YoToolbar>
);

// 布局样式（token 引用见 @yohu/ui theme.css；此处仅结构性布局）
import "./shell.css";
