/**
 * YoSwap —— 沿轴展开/收缩（动画系统-v6.md 配方 swap，与侧栏/预览栏同一套）。
 * 内层锁在目标文案固有宽；槽位 width 过渡；overflow 裁切。默认贴 inline-end（往左收）。
 */
import { children, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { resolveText } from "../dom/text";
import { motionDurationMs } from "../tokens/motion";
import { shouldSkipMotion } from "./reduced";
import { PRESENCE_EXIT_SAFETY_MS, SWAP_DURATION } from "./recipes";

export interface YoSwapProps {
  /** 身份；变化时按方向展开或收缩 */
  keys: string;
  children: JSX.Element;
  /** 裁切锚点。end = 贴右往左收（预览栏/窗口右缘）。默认 end。 */
  anchor?: "start" | "end";
}

/** 瞬时探针测固有宽，不挂进可达树（避免按钮文案出现两份）。 */
function measureWidth(host: HTMLElement, text: string): number {
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none";
  probe.textContent = text;
  host.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

/**
 * 按 keys 把槽宽从旧文案插到新文案：变长先换字再拉开，变短先裁再换字。
 */
export function YoSwap(props: YoSwapProps): JSX.Element {
  const resolved = children(() => props.children);
  const [view, setView] = createSignal<JSX.Element | null>(null);
  const [clipW, setClipW] = createSignal<number | undefined>(undefined);
  const [resizing, setResizing] = createSignal(false);
  const visible = createMemo(() => view() ?? resolved());

  let host: HTMLSpanElement | undefined;
  let clip: HTMLSpanElement | undefined;
  let currentKey = "";
  let gen = 0;
  let pending: JSX.Element | undefined;

  createEffect(() => {
    const nextKey = props.keys;
    const incoming = resolved();
    if (nextKey === currentKey) {
      return;
    }
    const prevKey = currentKey;
    currentKey = nextKey;

    const incomingText = resolveText(incoming);
    const hostEl = host;
    const clipEl = clip;
    const skip = !prevKey || shouldSkipMotion() || !hostEl || !clipEl || incomingText === null;
    if (skip) {
      pending = undefined;
      setView(() => incoming);
      setClipW(undefined);
      setResizing(false);
      return;
    }

    const fromW = clipEl.getBoundingClientRect().width;
    const toW = measureWidth(hostEl, incomingText);
    if (Math.abs(toW - fromW) < 0.5) {
      pending = undefined;
      setView(() => incoming);
      setClipW(undefined);
      setResizing(false);
      return;
    }

    const shrinking = toW < fromW;
    pending = shrinking ? incoming : undefined;
    setResizing(false);
    setClipW(fromW);
    if (!shrinking) {
      setView(() => incoming);
    }

    const thisGen = ++gen;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (thisGen !== gen) {
          return;
        }
        setResizing(true);
        setClipW(toW);
      });
    });

    const finish = (): void => {
      if (thisGen !== gen) {
        return;
      }
      if (pending !== undefined) {
        const node = pending;
        pending = undefined;
        setView(() => node);
      }
      setResizing(false);
    };

    const timer = window.setTimeout(finish, motionDurationMs(SWAP_DURATION) + PRESENCE_EXIT_SAFETY_MS);
    const onEnd = (event: TransitionEvent): void => {
      if (event.propertyName !== "width" || event.target !== clipEl) {
        return;
      }
      window.clearTimeout(timer);
      finish();
    };
    clipEl.addEventListener("transitionend", onEnd);
    onCleanup(() => {
      gen += 1;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
      clipEl.removeEventListener("transitionend", onEnd);
    });
  });

  return (
    <span
      ref={(el) => (host = el)}
      class="yohu-swap"
      data-anchor={props.anchor ?? "end"}
      data-resizing={resizing() ? "true" : undefined}
    >
      <span
        ref={(el) => (clip = el)}
        class="yohu-swap__clip"
        style={{ width: clipW() === undefined ? undefined : `${clipW()}px` }}
      >
        <span class="yohu-swap__inner">{visible()}</span>
      </span>
    </span>
  );
}
