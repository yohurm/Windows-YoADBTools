/**
 * 电脑通栏插槽：模块工具栏传送到 YoTitleBar 中区（HarmonyOS 窗口框架：
 * 工具栏与标题栏结合，减少顶部层级）。
 *
 * 无 Provider 时（单测/独立渲染）children 留在原地。
 */
import { Show, createContext, createSignal, onCleanup, useContext, type Accessor, type JSX, type Setter } from "solid-js";
import { Portal } from "solid-js/web";

interface ChromeContextValue {
  target: Accessor<HTMLElement | undefined>;
  setTarget: Setter<HTMLElement | undefined>;
}

const ChromeContext = createContext<ChromeContextValue>();

/**
 * 壳根：包住标题栏与模块主视图。
 */
export function YoChromeRoot(props: { children: JSX.Element }): JSX.Element {
  const [target, setTarget] = createSignal<HTMLElement | undefined>();
  return <ChromeContext.Provider value={{ target, setTarget }}>{props.children}</ChromeContext.Provider>;
}

/**
 * 标题栏中区挂载点（由 YoTitleBar 使用）。
 */
export function YoChromeMount(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const ctx = useContext(ChromeContext);
  onCleanup(() => ctx?.setTarget(undefined));
  return (
    <div class={props.class} ref={(el) => ctx?.setTarget(el)}>
      {props.children}
    </div>
  );
}

/**
 * 把 children 传送到标题栏中区；无挂载点则原地渲染。
 */
export function YoChrome(props: { children: JSX.Element }): JSX.Element {
  const ctx = useContext(ChromeContext);
  const target = () => ctx?.target();
  return (
    <Show when={target()} fallback={ctx ? null : props.children}>
      {(el) => <Portal mount={el()}>{props.children}</Portal>}
    </Show>
  );
}
