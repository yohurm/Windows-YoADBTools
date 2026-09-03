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
    const svgs = container.querySelectorAll("svg.yohu-icon");
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

  it("play/pause 与鸿蒙符号为实心，描边图标 fill 为 none", () => {
    const { container } = render(() => (
      <>
        <Icon name="play" />
        <Icon name="folder" />
        <Icon name="nav-back" />
      </>
    ));
    const play = container.querySelector('svg[data-icon="play"]');
    const folder = container.querySelector('svg[data-icon="folder"]');
    const back = container.querySelector('svg[data-icon="nav-back"]');
    expect(play?.getAttribute("fill")).toBe("currentColor");
    expect(folder?.getAttribute("fill")).toBe("none");
    expect(folder?.getAttribute("stroke")).toBe("currentColor");
    expect(back?.getAttribute("fill")).toBe("currentColor");
    expect(back?.getAttribute("stroke")).toBe("none");
    expect(back?.getAttribute("viewBox")).toBe("0 0 1024 1024");
    expect(back?.getAttribute("fill-rule")).toBe("evenodd");
  });

  it("设备操作栏用三键导航与控制中心语义，不用眼睛/房屋/回车箭头", () => {
    const { container } = render(() => (
      <>
        <Icon name="nav-back" />
        <Icon name="nav-home" />
        <Icon name="nav-recent" />
        <Icon name="display-off" />
        <Icon name="volume-down" />
      </>
    ));
    const d = (name: string) => container.querySelector(`svg[data-icon="${name}"] path`)?.getAttribute("d") ?? "";
    expect(d("nav-back")).toContain("M605.098");
    expect(d("nav-home")).toContain("M512 896");
    expect(d("nav-recent")).toContain("M192 192");
    expect(d("display-off")).toContain("M456.176");
    expect(d("volume-down")).toContain("M647.497");
    expect(d("display-off")).not.toContain("463.384");
  });

  it("含窗口三键图标", () => {
    expect(ICON_NAMES).toEqual(expect.arrayContaining(["window-max", "window-min", "window-restore"]));
    expect(ICON_NAMES).toEqual(
      expect.arrayContaining([
        "nav-back",
        "nav-home",
        "nav-recent",
        "nav-power",
        "volume-up",
        "display-on",
        "brightness-down",
        "brightness-up",
      ]),
    );
  });
});
