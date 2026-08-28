/**
 * YoToast / YoToaster —— 轻量消息提示。
 * HarmonyOS 对照：即时反馈 Toast；自动消失 ≤3s（`--yohu-dur-toast`）。
 * 受控 API：createToaster().show；tone = success / error / info。
 */
import { For, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { YoPresence } from "../motion/presence";
import { motionDurationMs } from "../tokens/motion";
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
  /** Presence 开关：false 后播出场再从列表移除 */
  open: boolean;
}

/** createToaster() 的返回值 */
export interface Toaster {
  /** 当前消息列表（响应式访问器） */
  toasts: () => ToastItem[];
  /** 弹出一条消息 */
  show: (text: string, tone?: ToastTone) => void;
  /** 出场结束后移除 */
  dismiss: (id: number) => void;
}

/** 单条 toast 自动消失时长（ms），对齐 `--yohu-dur-toast`。 */
const TOAST_DURATION_MS = motionDurationMs("toast");

/**
 * 创建一个 toaster 实例（每个实例独立维护自己的消息列表）。
 */
export function createToaster(): Toaster {
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);
  let nextId = 1;

  const dismiss = (id: number): void => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const show = (text: string, tone: ToastTone = "info"): void => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, text, tone, open: true }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, open: false } : toast)));
    }, TOAST_DURATION_MS);
  };

  return { toasts, show, dismiss };
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
    <div class="yohu-toast" classList={{ [`yohu-toast--${props.toast.tone}`]: true }} role="status">
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
    <div class="yohu-toaster" role="region" aria-label="通知">
      <For each={props.toaster.toasts()}>
        {(toast) => (
          <YoPresence when={toast.open} recipe="toast" onExitComplete={() => props.toaster.dismiss(toast.id)}>
            <YoToast toast={toast} />
          </YoPresence>
        )}
      </For>
    </div>
  );
}
