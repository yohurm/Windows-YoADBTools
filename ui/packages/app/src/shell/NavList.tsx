/**
 * 模块导航：来自注册表的模块列表（含 Planned「开发中」徽章）。
 */

import { Component, For } from "solid-js";

import { Icon, type IconName } from "@yovo/ui";

import { modules } from "../registry";

export const NavList: Component<{ activeId: string; onNavigate: (id: string) => void }> = (
  props,
) => (
  <nav class="yovo-nav">
    <div class="yovo-nav__caption">模块</div>
    <ul class="yovo-nav__list">
      <For each={[...modules()]}>
        {(mod) => (
          <li
            class="yovo-nav__item"
            classList={{ "yovo-nav__item--active": mod.id === props.activeId }}
            onClick={() => props.onNavigate(mod.id)}
          >
            <Icon name={mod.icon as IconName} size={15} />
            <span class="yovo-nav__title">{mod.title}</span>
            {mod.isPlanned && <span class="yovo-nav__planned">开发中</span>}
          </li>
        )}
      </For>
    </ul>
  </nav>
);
