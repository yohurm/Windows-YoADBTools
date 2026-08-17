import { For } from "solid-js";
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { ICON_NAMES, Icon, type IconName } from "./icons";

describe("Icon", () => {
  it("同一图标可同时出现多份（工厂函数，不共享 DOM）", () => {
    const { container } = render(() => (
      <>
        <Icon name="folder" />
        <Icon name="folder" />
        <Icon name="folder" />
      </>
    ));
    const svgs = container.querySelectorAll("svg.yovo-icon");
    expect(svgs).toHaveLength(3);
    svgs.forEach((svg) => {
      expect(svg.getAttribute("data-icon")).toBe("folder");
      expect(svg.childElementCount).toBeGreaterThan(0);
    });
  });

  it("清单内每个名字都能渲染", () => {
    const names: IconName[] = [...ICON_NAMES];
    expect(names.length).toBeGreaterThan(10);
    const { container } = render(() => (
      <For each={ICON_NAMES}>{(name: IconName) => <Icon name={name} />}</For>
    ));
    expect(container.querySelectorAll("svg[data-icon]")).toHaveLength(names.length);
  });

  it("play/pause 为实心，其余为描边", () => {
    const { container } = render(() => (
      <>
        <Icon name="play" />
        <Icon name="folder" />
      </>
    ));
    const play = container.querySelector('svg[data-icon="play"]');
    const folder = container.querySelector('svg[data-icon="folder"]');
    expect(play?.getAttribute("fill")).toBe("currentColor");
    expect(folder?.getAttribute("fill")).toBe("none");
    expect(folder?.getAttribute("stroke")).toBe("currentColor");
  });
});
