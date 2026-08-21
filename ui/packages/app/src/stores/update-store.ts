/**
 * 更新检查 store：检查/频道/待安装版本。View 只绑信号与对话框。
 */

import { createSignal } from "solid-js";

import { updateCheck, updateInfo, updateOpen } from "@yohu/api";
import type { RemoteUpdate, UpdateChannelInfo } from "@yohu/api";

export function createUpdateStore() {
  const [checking, setChecking] = createSignal(false);
  const [pending, setPending] = createSignal<RemoteUpdate | null>(null);
  const [channel, setChannel] = createSignal<UpdateChannelInfo | null>(null);
  const [error, setError] = createSignal("");

  async function refresh(): Promise<void> {
    try {
      setChannel(await updateInfo());
    } catch {
      setChannel(null);
    }
  }

  async function check(): Promise<RemoteUpdate> {
    setChecking(true);
    setError("");
    try {
      const result = await updateCheck();
      if (result.has_new_version) {
        setPending(result);
      } else {
        setPending(null);
      }
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      throw e;
    } finally {
      setChecking(false);
    }
  }

  async function openDownload(): Promise<void> {
    const update = pending();
    if (!update) return;
    await updateOpen(update.download_url);
    setPending(null);
  }

  function dismiss(): void {
    setPending(null);
  }

  return {
    checking,
    pending,
    channel,
    error,
    refresh,
    check,
    openDownload,
    dismiss,
  };
}

export type UpdateStoreApi = ReturnType<typeof createUpdateStore>;
