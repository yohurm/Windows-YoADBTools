/**
 * 文件模块 store：设备目录浏览 + 传输管理（进度经 transfer.progress 事件回流）。
 */

import { createStore } from "solid-js/store";

import {
  filesCancel,
  filesDelete,
  filesList,
  filesMkdir,
  filesPull,
  filesPush,
  onTransferProgress,
} from "@yovo/api";
import type { RemoteEntry, TransferProgress, TransferState } from "@yovo/api";
import { deviceStore } from "@yovo/app";

/** 路径辅助（纯函数，可单测）。 */
export function joinPath(dir: string, name: string): string {
  if (dir === "/") return `/${name}`;
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

/** 上级目录（根目录返回 null）。 */
export function parentOf(path: string): string | null {
  const trimmed = path.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return null;
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

/** 目录优先 + 名称排序。 */
export function sortEntries(entries: RemoteEntry[]): RemoteEntry[] {
  return [...entries].sort((a, b) => {
    const kindRank = (k: RemoteEntry["kind"]): number => (k === "dir" ? 0 : 1);
    const rankDiff = kindRank(a.kind) - kindRank(b.kind);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name);
  });
}

/** 人类可读大小。 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export interface UiTransfer {
  id: number;
  direction: "push" | "pull";
  name: string;
  bytes: number;
  total?: number;
  state: TransferState;
  message?: string;
}

export function createFileStore() {
  const [entries, setEntries] = createStore<RemoteEntry[]>([]);
  const [transfers, setTransfers] = createStore<UiTransfer[]>([]);
  const [path, setPath] = createStore({ value: "/sdcard" });
  const [loading, setLoading] = createStore({ value: false });

  const focusSerial = (): string | null => deviceStore.state.focusSerial;

  function upsertTransfer(progress: TransferProgress): void {
    const index = transfers.findIndex((t) => t.id === progress.id);
    const patch = {
      bytes: progress.bytes,
      total: progress.total,
      state: progress.state,
      message: progress.message,
    };
    if (index < 0) {
      setTransfers((ts) => [
        ...ts,
        {
          id: progress.id,
          direction: progress.direction,
          name: `${progress.direction === "push" ? "上传" : "下载"} #${progress.id}`,
          ...patch,
        },
      ]);
    } else {
      setTransfers(index, patch);
    }
  }

  async function refresh(): Promise<void> {
    const serial = focusSerial();
    if (!serial) {
      setEntries([]);
      return;
    }
    setLoading("value", true);
    try {
      const list = await filesList(serial, path.value);
      setEntries(sortEntries(list));
    } catch (e) {
      setEntries([]);
      console.error("files.list 失败", e);
    } finally {
      setLoading("value", false);
    }
  }

  async function enterDirectory(name: string): Promise<void> {
    setPath("value", joinPath(path.value, name));
    await refresh();
  }

  async function goUp(): Promise<void> {
    const parent = parentOf(path.value);
    if (parent !== null) {
      setPath("value", parent);
      await refresh();
    }
  }

  async function remove(name: string): Promise<void> {
    const serial = focusSerial();
    if (!serial) return;
    await filesDelete({ serial, path: joinPath(path.value, name) });
    await refresh();
  }

  async function mkdir(name: string): Promise<void> {
    const serial = focusSerial();
    if (!serial) return;
    await filesMkdir({ serial, path: joinPath(path.value, name) });
    await refresh();
  }

  async function push(local: string, remoteName: string): Promise<void> {
    const serial = focusSerial();
    if (!serial) return;
    const id = await filesPush({ serial, direction: "push", local, remote: joinPath(path.value, remoteName) });
    upsertTransfer({ id, direction: "push", bytes: 0, state: "running" });
  }

  async function pull(remoteName: string, local: string): Promise<void> {
    const serial = focusSerial();
    if (!serial) return;
    const id = await filesPull({ serial, direction: "pull", local, remote: joinPath(path.value, remoteName) });
    upsertTransfer({ id, direction: "pull", bytes: 0, state: "running" });
  }

  async function cancel(id: number): Promise<void> {
    await filesCancel(id);
  }

  void onTransferProgress((e) => {
    upsertTransfer({ ...e });
  });

  return {
    entries,
    transfers,
    path,
    loading,
    refresh,
    enterDirectory,
    goUp,
    remove,
    mkdir,
    push,
    pull,
    cancel,
    focusSerial,
  };
}

/** 模块级单例。 */
export const fileStore = createFileStore();
