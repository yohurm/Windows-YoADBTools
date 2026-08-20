/**
 * 工作台主布局：窗口铬（应用标题 + 侧栏钮 + 三键）+ 左侧抽屉（设备栏 + 模块导航）
 * / 右侧内容区（模块自带标题区与功能栏）/ 底部状态栏。
 * 单一 canvas 铺满窗口；标题栏/侧栏/状态栏不刷互打架的实底。
 */

import { type Component, Show, createEffect, createSignal } from "solid-js";

import { YoContextMenuHost, YoIconButton, YoPresence, YoTitleBar, closeContextMenu, shouldSkipMotion } from "@yohu/ui";

import { modules, type ModuleDescriptor } from "../registry";
import { deviceStore } from "../stores";
import { DeviceRail } from "./DeviceRail";
import { NavList } from "./NavList";
import { StatusBar } from "./StatusBar";

/** 模块区：PC 层级转场淡入淡出（动画系统-v6.md 配方 module-fade）。 */
const ModuleStage: Component<{
  current: ModuleDescriptor | undefined;
}> = (props) => {
  const [shown, setShown] = createSignal<ModuleDescriptor | undefined>(props.current);
  const [gate, setGate] = createSignal(true);

  createEffect(() => {
    const next = props.current;
    const cur = shown();
    if (next?.id === cur?.id) return;
    if (!cur || shouldSkipMotion()) {
      setShown(next);
      setGate(true);
      return;
    }
    setGate(false);
  });

  return (
    <YoPresence
      when={gate()}
      recipe="fade"
      onExitComplete={() => {
        setShown(props.current);
        setGate(true);
      }}
    >
      <Show when={shown()} keyed>
        {(mod) => {
          const C = mod.Component;
          return (
            <C
              focusSerial={deviceStore.state.focusSerial}
              selectedSerials={deviceStore.selectedSerials(mod.id, mod.selectionMode)}
              devices={deviceStore.state.devices}
            />
          );
        }}
      </Show>
    </YoPresence>
  );
};

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
  const [railOpen, setRailOpen] = createSignal(true);

  createEffect(() => {
    props.activeModuleId();
    closeContextMenu();
  });

  return (
    <div class="yohu-window">
      <YoTitleBar
        title="Yohu ADB Tools"
        icon="terminal"
        maximized={props.maximized}
        onMinimize={props.onMinimize}
        onToggleMaximize={props.onToggleMaximize}
        onClose={props.onClose}
        actions={
          <YoIconButton
            icon="sidebar"
            title={railOpen() ? "收起侧栏" : "展开侧栏"}
            aria-expanded={railOpen()}
            onClick={() => setRailOpen((open) => !open)}
          />
        }
      />
      <div
        class="yohu-layout yohu-recipe-rail"
        classList={{ "yohu-layout--rail-collapsed": !railOpen() }}
      >
        <aside class="yohu-layout__rail" attr:inert={!railOpen() ? true : undefined}>
          <div class="yohu-layout__rail-inner">
            <DeviceRail moduleId={props.activeModuleId()} selectionMode={current()?.selectionMode} />
            <NavList activeId={props.activeModuleId()} onNavigate={props.onNavigate} />
          </div>
        </aside>
        <main class="yohu-layout__content">
          <ModuleStage current={current()} />
        </main>
        <StatusBar />
      </div>
      <YoContextMenuHost />
    </div>
  );
};

// 布局样式（token 引用见 @yohu/ui theme.css；此处仅结构性布局）
import "./shell.css";
