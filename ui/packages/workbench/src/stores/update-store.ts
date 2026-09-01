/**
 * 更新检查 store：检查/下载/覆盖安装。View 只绑信号与对话框。
 */

import { createSignal } from "solid-js";

import {
  onUpdateProgress,
  updateCancel,
  updateCheck,
  updateDownload,
  updateInfo,
  updateInstall,
  updateOpen,
} from "@yohu/api";
import type { RemoteUpdate, UpdateChannelInfo, UpdateProgress } from "@yohu/api";

export type UpdateApplyPhase = "idle" | "downloading" | "ready" | "applying";

function isInstallerUrl(url: string): boolean {
  const path = url.trim().split(/[?#]/, 1)[0] ?? "";
  return /\.exe$/i.test(path);
}

export function createUpdateStore() {
  const [checking, setChecking] = createSignal(false);
  const [pending, setPending] = createSignal<RemoteUpdate | null>(null);
  const [channel, setChannel] = createSignal<UpdateChannelInfo | null>(null);
  const [phase, setPhase] = createSignal<UpdateApplyPhase>("idle");
  const [progress, setProgress] = createSignal<UpdateProgress | null>(null);

  void onUpdateProgress((e) => {
    setProgress({
      version: e.version,
      stage: e.stage,
      received_bytes: e.received_bytes,
      total_bytes: e.total_bytes,
    });
    if (e.stage === "applying") {
      setPhase("applying");
    } else if (e.stage === "ready") {
      setPhase("ready");
    } else if (e.stage === "downloading" || e.stage === "verifying") {
      setPhase("downloading");
    }
  });

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
        setPhase("idle");
        setProgress(null);
      } else {
        setPending(null);
        setPhase("idle");
        setProgress(null);
      }
      return result;
    } catch (e) {
      throw e;
    } finally {
      setChecking(false);
    }
  }

  function canApply(): boolean {
    const update = pending();
    return !!update && isInstallerUrl(update.download_url);
  }

  function percent(): number {
    const p = progress();
    if (!p || p.total_bytes <= 0) return 0;
    return Math.min(100, Math.round((p.received_bytes / p.total_bytes) * 100));
  }

  async function apply(): Promise<void> {
    const update = pending();
    if (!update || !isInstallerUrl(update.download_url)) return;
    setPhase("downloading");
    try {
      const downloaded = await updateDownload({
        url: update.download_url,
        sha256: update.sha256,
        size_bytes: update.size_bytes,
        version: update.version,
      });
      setPhase("applying");
      await updateInstall(downloaded.path);
    } catch (e) {
      setPhase("idle");
      setProgress(null);
      throw e;
    }
  }

  async function openDownload(): Promise<void> {
    const update = pending();
    if (!update) return;
    await updateOpen(update.download_url);
    setPending(null);
    setPhase("idle");
    setProgress(null);
  }

  function dismiss(): void {
    if (phase() === "downloading") {
      void updateCancel();
    }
    if (phase() === "applying") return;
    setPending(null);
    setPhase("idle");
    setProgress(null);
  }

  return {
    checking,
    pending,
    channel,
    phase,
    progress,
    percent,
    canApply,
    refresh,
    check,
    apply,
    openDownload,
    dismiss,
  };
}

export type UpdateStoreApi = ReturnType<typeof createUpdateStore>;
