/**
 * YoToast / YoToaster —— 轻量消息提示。
 * `createToaster()` 工厂返回 `{ toasts, show }`；每条 toast 自动 2.5s 消失。
 * tone 决定左边框颜色：success=Success、error=Error、info=Accent。
 */
import { For, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import "./Toast.css";

/** 消息色调 */
export type ToastTone = "success" | "error" | "info";

/** 单条消息 */
export interface ToastItem {
  /** 自增 id */
  id: number;
  /** 消息文本 */
  text: string;
  /** 语义色调 */
  tone: ToastTone;
}

/** createToaster() 的返回值 */
export interface Toaster {
  /** 当前消息列表（响应式访问器） */
  toasts: () => ToastItem[];
  /** 弹出一条消息 */
  show: (text: string, tone?: ToastTone) => void;
}

/** 单条 toast 自动消失时长（ms） */
const TOAST_DURATION_MS = 2500;

/**
 * 创建一个 toaster 实例（每个实例独立维护自己的消息列表）。
 */
export function createToaster(): Toaster {
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);
  let nextId = 1;

  const show = (text: string, tone: ToastTone = "info"): void => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  };

  return { toasts, show };
}

export interface YoToastProps {
  /** 单条消息数据 */
  toast: ToastItem;
}

/**
 * 渲染单条 toast。
 */
export function YoToast(props: YoToastProps): JSX.Element {
  return (
    <div class="yovo-toast" classList={{ [`yovo-toast--${props.toast.tone}`]: true }} role="status">
      {props.toast.text}
    </div>
  );
}

export interface YoToasterProps {
  /** toaster 实例 */
  toaster: Toaster;
}

/**
 * 渲染 toaster 消息堆栈（右上角）。
 */
export function YoToaster(props: YoToasterProps): JSX.Element {
  return (
    <div class="yovo-toaster" role="region" aria-label="notifications">
      <For each={props.toaster.toasts()}>{(toast) => <YoToast toast={toast} />}</For>
    </div>
  );
}
