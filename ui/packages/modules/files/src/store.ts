/**
 * 文件模块 store：设备目录浏览 + 传输管理（进度经 transfer.progress 事件回流）。
 */

import { createStore } from "solid-js/store";

import {
  filesCancel,
  filesCreate,
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

/** 面包屑分段：`/storage/emulated/0` → ["storage","emulated","0"]（根路径为 []）。 */
export function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

/** 文件扩展名分类（§4.3 分类色图标）。 */
export type FileCategory = "apk" | "media" | "doc" | "archive" | "other";

export function fileCategory(name: string): FileCategory {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "apk" || ext === "aab") return "apk";
  if (
    ["png", "jpg", "jpeg", "gif", "webp", "bmp", "mp3", "mp4", "mkv", "avi", "flac", "ogg", "wav", "webm"].includes(ext)
  ) {
    return "media";
  }
  if (["txt", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "md", "json", "xml", "log", "csv"].includes(ext)) {
    return "doc";
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  return "other";
}

/** 类型列文案。 */
export function fileTypeLabel(entry: RemoteEntry): string {
  if (entry.kind === "dir") return "文件夹";
  if (entry.kind === "symlink") return "链接";
  const ext = entry.name.split(".").pop();
  if (ext && ext !== entry.name) return ext.toUpperCase();
  return "文件";
}

export interface UiTransfer {
  id: number;
  direction: "push" | "pull";
  name: string;
  bytes: number;
  total?: number;
  state: TransferState;
  message?: string;
  /** 最近采样速率（bytes/s） */
  speed?: number;
}

/** 终态传输在面板保留时长（ms），配合淡出动画。 */
const TERMINAL_KEEP_MS = 3000;

export function createFileStore() {
  const [entries, setEntries] = createStore<RemoteEntry[]>([]);
  const [transfers, setTransfers] = createStore<UiTransfer[]>([]);
  const [path, setPath] = createStore({ value: "/sdcard" });
  const [loading, setLoading] = createStore({ value: false });

  const focusSerial = (): string | null => deviceStore.state.focusSerial;

  /** 速率采样基准（id → 上次 bytes/时间戳）。 */
  const speedBase = new Map<number, { bytes: number; ts: number }>();

  function upsertTransfer(progress: TransferProgress, name?: string): void {
    const now = Date.now();
    const base = speedBase.get(progress.id);
    const speed =
      base !== undefined && now > base.ts
        ? Math.max(0, Math.round(((progress.bytes - base.bytes) / (now - base.ts)) * 1000))
        : undefined;
    speedBase.set(progress.id, { bytes: progress.bytes, ts: now });
    const patch = {
      bytes: progress.bytes,
      total: progress.total,
      state: progress.state,
      message: progress.message,
      speed,
    };
    const index = transfers.findIndex((t) => t.id === progress.id);
    if (index < 0) {
      setTransfers((ts) => [
        ...ts,
        {
          id: progress.id,
          direction: progress.direction,
          name: name ?? `${progress.direction === "push" ? "上传" : "下载"} #${progress.id}`,
          ...patch,
        },
      ]);
    } else {
      setTransfers(index, name !== undefined ? { ...patch, name } : patch);
    }
    // 终态：3s 后从面板移除（视图侧同步淡出）
    if (progress.state !== "running") {
      speedBase.delete(progress.id);
      window.setTimeout(() => {
        setTransfers((ts) => ts.filter((t) => t.id !== progress.id));
      }, TERMINAL_KEEP_MS);
    }
  }

  /** 传输名回填（invoke 返回 id 后；进度事件可能先到）。 */
  function setTransferName(id: number, name: string): void {
    const index = transfers.findIndex((t) => t.id === id);
    if (index >= 0) setTransfers(index, { name });
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

  /** 面包屑直达（跳转任意上级路径）。 */
  async function goTo(target: string): Promise<void> {
    setPath("value", target);
    await refresh();
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

  async function createFile(name: string): Promise<void> {
    const serial = focusSerial();
    if (!serial) return;
    await filesCreate({ serial, path: joinPath(path.value, name) });
    await refresh();
  }

  async function removeMany(names: string[]): Promise<void> {
    for (const name of names) {
      await remove(name);
    }
  }

  async function push(local: string, remoteName: string): Promise<void> {
    const serial = focusSerial();
    if (!serial) return;
    const id = await filesPush({ serial, direction: "push", local, remote: joinPath(path.value, remoteName) });
    setTransferName(id, remoteName);
    upsertTransfer({ id, direction: "push", bytes: 0, state: "running" }, remoteName);
  }

  async function pull(remoteName: string, local: string): Promise<void> {
    const serial = focusSerial();
    if (!serial) return;
    const id = await filesPull({ serial, direction: "pull", local, remote: joinPath(path.value, remoteName) });
    setTransferName(id, remoteName);
    upsertTransfer({ id, direction: "pull", bytes: 0, state: "running" }, remoteName);
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
    goTo,
    remove,
    mkdir,
    createFile,
    removeMany,
    push,
    pull,
    cancel,
    focusSerial,
  };
}

/** 模块级单例。 */
export const fileStore = createFileStore();
