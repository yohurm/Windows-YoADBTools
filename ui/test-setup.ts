/**
 * Vitest 全局 setup：jsdom 无 Tauri 运行时，
 * stub @tauri-apps/api 的 listen/invoke，避免模块级订阅产生未处理拒绝。
 */

import { vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.resolve(undefined),
  Channel: class Channel {
    onmessage: ((message: unknown) => void) | null = null;
  },
}));
