/**
 * 模块导航（UI设计系统-v6.md §3）：来自注册表的模块列表（含 Planned「开发中」徽章）。
 * 激活项 = `.yohu-interactive--selected`（全表面同一配方）；图标走 token。
 * 键盘：roving tabindex（激活项 0）+ Enter/Space 导航 + aria-current。
 */

import { Component, For } from "solid-js";

import { Icon } from "@yohu/ui";

import { modules } from "../registry";

export const NavList: Component<{ activeId: string; onNavigate: (id: string) => void }> = (
  props,
) => {
  const onItemKeyDown = (id: string, event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      props.onNavigate(id);
    }
  };

  return (
    <nav class="yohu-nav" aria-label="模块导航">
      <div class="yohu-nav__caption">模块</div>
      <ul class="yohu-nav__list">
        <For each={[...modules()]}>
          {(mod) => {
            const active = () => mod.id === props.activeId;
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
                  onClick={() => props.onNavigate(mod.id)}
                  onKeyDown={(event) => onItemKeyDown(mod.id, event)}
                >
                  <span class="yohu-nav__icon">
                    <Icon name={mod.icon} size={16} />
                  </span>
                  <span class="yohu-nav__title">{mod.title}</span>
                  {mod.isPlanned && <span class="yohu-nav__planned">开发中</span>}
                </button>
              </li>
            );
          }}
        </For>
      </ul>
    </nav>
  );
};
