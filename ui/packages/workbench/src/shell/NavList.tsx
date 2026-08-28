/**
 * 模块导航（UI设计系统-v6.md §3）：来自注册表的模块列表（含 Planned「开发中」徽章）。
 * 激活项 = `.yohu-interactive--selected`（全表面同一配方）；图标走 token。
 * 键盘：roving tabindex（激活项 0）+ Enter/Space 导航 + aria-current。
 * 设置是壳内建页（kind=system）：钉在侧栏底部，与模块用横线隔开。
 */

import { Component, For, Show } from "solid-js";

import { Icon, YoIndicator } from "@yohu/ui";

import { systemModules, workspaceModules, type ModuleDescriptor } from "../registry";

const NavItem: Component<{
  mod: ModuleDescriptor;
  activeId: string;
  onNavigate: (id: string) => void;
}> = (props) => {
  const active = () => props.mod.id === props.activeId;
  const onItemKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      props.onNavigate(props.mod.id);
    }
  };

  return (
    <li>
      <button
        type="button"
        class="yohu-nav__item yohu-interactive yohu-focus-ring--inset"
        classList={{
          "yohu-interactive--selected": active(),
        }}
        tabIndex={active() ? 0 : -1}
        aria-current={active() ? "page" : undefined}
        onClick={() => props.onNavigate(props.mod.id)}
        onKeyDown={onItemKeyDown}
      >
        <span class="yohu-nav__icon">
          <Icon name={props.mod.icon} size={16} />
        </span>
        <span class="yohu-nav__title">{props.mod.title}</span>
        {props.mod.isPlanned && <span class="yohu-nav__planned">开发中</span>}
      </button>
    </li>
  );
};

export const NavList: Component<{ activeId: string; onNavigate: (id: string) => void }> = (
  props,
) => {
  return (
    <nav class="yohu-nav" aria-label="侧栏导航">
      <YoIndicator follow={props.activeId} variant="fill" />
      <div class="yohu-nav__modules">
        <div class="yohu-nav__caption">模块</div>
        <ul class="yohu-nav__list">
          <For each={[...workspaceModules()]}>
            {(mod) => (
              <NavItem mod={mod} activeId={props.activeId} onNavigate={props.onNavigate} />
            )}
          </For>
        </ul>
      </div>
      <Show when={systemModules().length > 0}>
        <div class="yohu-nav__footer">
          <hr class="yohu-nav__rule" />
          <ul class="yohu-nav__list" aria-label="系统">
            <For each={[...systemModules()]}>
              {(mod) => (
                <NavItem mod={mod} activeId={props.activeId} onNavigate={props.onNavigate} />
              )}
            </For>
          </ul>
        </div>
      </Show>
    </nav>
  );
};
