/**
 * YoPresence —— 进场挂载、出场播完再卸载（动画系统-v6.md L2）。
 * DOM：`.yohu-presence[data-state][data-recipe]` + display:contents。
 */
import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { motionDurationMs } from "../tokens/motion";
import { PRESENCE_EXIT_DURATION, type PresenceRecipe } from "./recipes";
import { shouldSkipMotion } from "./reduced";

export type { PresenceRecipe };

export interface YoPresenceProps {
  when: boolean;
  recipe?: PresenceRecipe;
  onExitComplete?: () => void;
  children: JSX.Element;
}

export function YoPresence(props: YoPresenceProps): JSX.Element {
  const [present, setPresent] = createSignal(Boolean(props.when));
  const [state, setState] = createSignal<"open" | "closed">(props.when ? "open" : "closed");
  let host: HTMLDivElement | undefined;
  let exitGen = 0;

  const finishExit = (gen: number): void => {
    if (gen !== exitGen) return;
    if (!present()) return;
    setPresent(false);
    props.onExitComplete?.();
  };

  createEffect(() => {
    const want = props.when;
    if (want) {
      exitGen += 1;
      setPresent(true);
      setState("open");
      return;
    }
    if (!present()) return;
    const gen = ++exitGen;
    setState("closed");
    if (shouldSkipMotion()) {
      finishExit(gen);
      return;
    }
    const recipe = props.recipe ?? "fade";
    const ms = motionDurationMs(PRESENCE_EXIT_DURATION[recipe]) + 50;
    const timer = window.setTimeout(() => finishExit(gen), ms);
    const onEnd = (event: AnimationEvent): void => {
      if (!String(event.animationName).includes("-out")) return;
      window.clearTimeout(timer);
      finishExit(gen);
    };
    host?.addEventListener("animationend", onEnd);
    onCleanup(() => {
      window.clearTimeout(timer);
      host?.removeEventListener("animationend", onEnd);
    });
  });

  return (
    <Show when={present()}>
      <div
        ref={(el) => {
          host = el;
        }}
        class="yohu-presence"
        data-state={state()}
        data-recipe={props.recipe ?? "fade"}
      >
        {props.children}
      </div>
    </Show>
  );
}
