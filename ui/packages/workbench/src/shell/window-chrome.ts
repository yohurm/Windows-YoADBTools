/**
 * Tauri 2 主窗口接线（仅 @yohu/workbench 壳使用）。
 * YoTitleBar 只收回调，测试不依赖本模块。
 */
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";

function currentWindow(): Window | null {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export async function windowMinimize(): Promise<void> {
  await currentWindow()?.minimize();
}

export async function windowToggleMaximize(): Promise<void> {
  await currentWindow()?.toggleMaximize();
}

export async function windowClose(): Promise<void> {
  await currentWindow()?.close();
}

export async function windowIsMaximized(): Promise<boolean> {
  const win = currentWindow();
  if (!win) return false;
  return win.isMaximized();
}

export async function listenWindowResize(onChange: () => void): Promise<() => void> {
  const win = currentWindow();
  if (!win) return () => undefined;
  return win.onResized(() => {
    onChange();
  });
}
