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

  async function refresh(): Promise<void> {
    try {
      setChannel(await updateInfo());
    } catch {
      setChannel(null);
    }
  }

  async function check(): Promise<RemoteUpdate> {
    setChecking(true);
    try {
      const result = await updateCheck();
      if (result.has_new_version) {
        setPending(result);
      } else {
        setPending(null);
      }
      return result;
    } catch (e) {
      // 错误由调用方（SettingsView）直接 catch 展示；此处不保留未消费的 error 信号。
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
    refresh,
    check,
    openDownload,
    dismiss,
  };
}

export type UpdateStoreApi = ReturnType<typeof createUpdateStore>;
