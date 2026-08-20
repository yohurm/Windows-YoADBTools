/**
 * YoIndicator —— 选中态在项与项之间滑动（动画系统-v6.md 配方 indicator）。
 * 必须作为 track 的子节点；track 由本组件挂 `yohu-indicator-host`。
 * 单选表面用 fill / underline / thumb；多选块（≥2）与「行级」虚拟列表过渡不要用；
 * 虚拟列表单选走 `anchor`（按下标定位，不测未渲染行）。
 */
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";

import { motionDurationMs, type MotionDurationName } from "../tokens/motion";
import {
  EMPTY_INDICATOR,
  indicatorDurationName,
  indicatorReady,
  measureIndicator,
  type IndicatorBox,
  type IndicatorVariant,
} from "./indicator-layout";

export type { IndicatorVariant, IndicatorBox };

export interface YoIndicatorProps {
  /** 选中身份；变化时把滑块从旧盒过渡到新盒。null/undefined 隐藏。 */
  follow: string | null | undefined;
  /** fill=列表实底；underline=Tabs 底边；thumb=分段选择块。 */
  variant?: IndicatorVariant;
  /** 在 track 内查找目标。默认 `.yohu-interactive--selected`。 */
  selector?: string;
  /** 显式几何（虚拟列表 index×行高）。提供则不再测 DOM。 */
  anchor?: () => IndicatorBox | null;
}

const DEFAULT_SELECTOR = ".yohu-interactive--selected";

function indicatorStyle(
  box: IndicatorBox,
  variant: IndicatorVariant,
  durationName: MotionDurationName | undefined,
): JSX.CSSProperties {
  const travel = durationName ? { "--yohu-indicator-dur": `var(--yohu-dur-${durationName})` } : {};
  if (variant === "underline") {
    return {
      width: `${box.width}px`,
      transform: `translate3d(${box.x}px, 0, 0)`,
      ...travel,
    };
  }
  return {
    width: `${box.width}px`,
    height: `${box.height}px`,
    transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
    ...travel,
  };
}

function bindScrollTree(root: HTMLElement, onScroll: () => void): () => void {
  root.addEventListener("scroll", onScroll, { passive: true });
  const nested: Array<() => void> = [];
  for (const child of root.children) {
    if (child instanceof HTMLElement) {
      nested.push(bindScrollTree(child, onScroll));
    }
  }
  return () => {
    root.removeEventListener("scroll", onScroll);
    for (const unbind of nested) unbind();
  };
}

/**
 * 渲染一块跟随选中项的滑块。几何由实测盒或 anchor 决定。
 */
export function YoIndicator(props: YoIndicatorProps): JSX.Element {
  let thumb: HTMLDivElement | undefined;
  const [box, setBox] = createSignal<IndicatorBox>(EMPTY_INDICATOR);
  const [ready, setReady] = createSignal(false);
  const [travel, setTravel] = createSignal<MotionDurationName | undefined>(undefined);
  const [moving, setMoving] = createSignal(false);
  let lastFollow: string | null | undefined;
  let moveGen = 0;

  const stopMoving = (): void => {
    moveGen += 1;
    setMoving(false);
  };

  const armMoving = (durationName: MotionDurationName): void => {
    const gen = ++moveGen;
    setMoving(true);
    const ms = Math.max(motionDurationMs(durationName), motionDurationMs("local"));
    window.setTimeout(() => {
      if (gen === moveGen) {
        setMoving(false);
      }
    }, ms);
  };

  const variant = (): IndicatorVariant => props.variant ?? "fill";
  const selector = (): string => props.selector ?? DEFAULT_SELECTOR;
  const trackOf = (): HTMLElement | undefined => thumb?.parentElement ?? undefined;

  const hide = (): void => {
    setBox(EMPTY_INDICATOR);
    setReady(false);
    setTravel(undefined);
    stopMoving();
    lastFollow = undefined;
  };

  const commit = (next: IndicatorBox): void => {
    if (!indicatorReady(next)) {
      return;
    }
    const prev = box();
    const followNow = props.follow;
    const followChanged = followNow !== lastFollow;
    lastFollow = followNow;
    if (ready() && indicatorReady(prev) && followChanged) {
      const durationName = indicatorDurationName(prev, next);
      setTravel(durationName);
      armMoving(durationName);
    } else if (followChanged) {
      setTravel(undefined);
      stopMoving();
    }
    setBox(next);
    if (!ready()) {
      requestAnimationFrame(() => setReady(true));
    }
  };

  const decorate = (track: HTMLElement | undefined): void => {
    if (!track) return;
    track.classList.add("yohu-indicator-host");
    track.setAttribute("data-indicator-variant", variant());
    if (ready()) {
      track.setAttribute("data-indicator-ready", "");
    } else {
      track.removeAttribute("data-indicator-ready");
    }
  };

  const layout = (): void => {
    const track = trackOf();
    if (!track || props.follow == null) {
      hide();
      return;
    }
    if (props.anchor) {
      const next = props.anchor();
      if (!next) {
        hide();
        return;
      }
      commit(next);
      return;
    }
    const item = track.querySelector<HTMLElement>(selector());
    if (!item) {
      requestAnimationFrame(() => {
        if (props.follow == null || !trackOf()) {
          hide();
          return;
        }
        const again = trackOf()?.querySelector<HTMLElement>(selector());
        if (!again) {
          hide();
          return;
        }
        layout();
      });
      return;
    }
    commit(
      measureIndicator(track.getBoundingClientRect(), item.getBoundingClientRect(), {
        left: track.scrollLeft,
        top: track.scrollTop,
      }),
    );
  };

  createEffect(() => {
    props.follow;
    variant();
    selector();
    props.anchor?.();
    queueMicrotask(layout);
  });

  createEffect(() => {
    ready();
    variant();
    decorate(trackOf());
  });

  createEffect(() => {
    props.follow;
    selector();
    if (props.anchor) return;
    const track = trackOf();
    const item = track?.querySelector<HTMLElement>(selector());
    if (typeof ResizeObserver === "undefined" || !item) return;
    const observer = new ResizeObserver(() => layout());
    observer.observe(item);
    onCleanup(() => observer.disconnect());
  });

  onMount(() => {
    const track = trackOf();
    decorate(track);
    layout();
    if (!track) return;

    const onTransition = (): void => layout();
    const unbindScroll = bindScrollTree(track, layout);
    track.addEventListener("transitionrun", onTransition, true);
    track.addEventListener("transitionend", onTransition, true);

    let trackRo: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      trackRo = new ResizeObserver(() => layout());
      trackRo.observe(track);
    }

    onCleanup(() => {
      unbindScroll();
      track.removeEventListener("transitionrun", onTransition, true);
      track.removeEventListener("transitionend", onTransition, true);
      trackRo?.disconnect();
      stopMoving();
      track.classList.remove("yohu-indicator-host");
      track.removeAttribute("data-indicator-variant");
      track.removeAttribute("data-indicator-ready");
    });
  });

  return (
    <div
      ref={(el) => {
        thumb = el;
      }}
      class="yohu-recipe-indicator"
      classList={{ [`yohu-recipe-indicator--${variant()}`]: true }}
      data-ready={ready() ? "" : undefined}
      data-moving={moving() ? "" : undefined}
      style={indicatorStyle(box(), variant(), travel())}
      aria-hidden="true"
    />
  );
}
