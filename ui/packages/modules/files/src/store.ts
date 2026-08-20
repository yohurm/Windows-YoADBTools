/**
 * 文件模块 ViewModel：会话由壳注入；IPC 只走 @yohu/api。
 * 传输卡停留时长消费 @yohu/ui 配方常量（与 dismiss-fade 对齐）。
 * 浏览世代令牌丢弃过期 list；危险路径/空名在 childPath 拦截，core 再强制。
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
} from "@yohu/api";
import type { RemoteEntry, TransferProgress, TransferState } from "@yohu/api";
import { DISMISS_HOLD_DURATION, motionDurationMs } from "@yohu/ui";

import {
  DEFAULT_SORT_DIR,
  FILE_COLUMNS,
  childPath,
  errorText,
  isCancelledError,
  parentWithinSafety,
  sortEntries,
  type SortDir,
  type SortKey,
} from "./model";

export type { SortDir, SortKey } from "./model";
export {
  DEFAULT_SORT_DIR,
  fileCategory,
  fileTypeLabel,
  formatSize,
  joinPath,
  parentOf,
  sortEntries,
  splitPath,
  validateEntryName,
} from "./model";

export interface UiTransfer {
  id: number;
  direction: "push" | "pull";
  name: string;
  bytes: number;
  total?: number;
  state: TransferState;
  message?: string;
  speed?: number;
}

const TERMINAL_KEEP_MS = motionDurationMs(DISMISS_HOLD_DURATION);
const COL_DEFAULT = FILE_COLUMNS.map((col) => col.defaultWidth);
const COL_MIN = FILE_COLUMNS.map((col) => col.minWidth);

export function createFileStore() {
  const [entries, setEntries] = createStore<RemoteEntry[]>([]);
  const [transfers, setTransfers] = createStore<UiTransfer[]>([]);
  const [session, setSession] = createStore({
    serial: null as string | null,
    path: "/sdcard",
    loading: false,
    mutating: false,
    error: "",
  });
  const [sort, setSortState] = createStore<{ key: SortKey; dir: SortDir }>({
    key: "name",
    dir: "asc",
  });
  const [selection, setSelection] = createStore({
    names: [] as string[],
    pivot: null as string | null,
  });
  const [ui, setUi] = createStore({
    previewOpen: false,
    colWidths: [...COL_DEFAULT],
  });

  let listGen = 0;
  const speedBase = new Map<number, { bytes: number; ts: number }>();
  const fadeTimers = new Map<number, number>();

  const serial = (): string | null => session.serial;

  function clearSelection(): void {
    setSelection({ names: [], pivot: null });
  }

  function setError(message: string): void {
    setSession("error", message);
  }

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
    if (progress.state !== "running") {
      speedBase.delete(progress.id);
      const prev = fadeTimers.get(progress.id);
      if (prev !== undefined) window.clearTimeout(prev);
      fadeTimers.set(
        progress.id,
        window.setTimeout(() => {
          fadeTimers.delete(progress.id);
          setTransfers((ts) => ts.filter((t) => t.id !== progress.id));
        }, TERMINAL_KEEP_MS),
      );
    }
  }

  function setTransferName(id: number, name: string): void {
    const index = transfers.findIndex((t) => t.id === id);
    if (index >= 0) setTransfers(index, { name });
  }

  async function refresh(): Promise<void> {
    const current = serial();
    if (!current) {
      setEntries([]);
      return;
    }
    const gen = ++listGen;
    setSession("loading", true);
    try {
      const list = await filesList(current, session.path);
      if (gen !== listGen) return;
      setEntries(sortEntries(list, sort.key, sort.dir));
      setError("");
      const alive = new Set(list.map((e) => e.name));
      setSelection("names", selection.names.filter((n) => alive.has(n)));
    } catch (e) {
      if (gen !== listGen || isCancelledError(e)) return;
      setEntries([]);
      setError(errorText(e));
    } finally {
      if (gen === listGen) setSession("loading", false);
    }
  }

  /** 壳注入焦点。serial 变化时清列表并重扫；同一设备重复绑定仍刷新（模块切回）。 */
  function bindSerial(next: string | null): void {
    const changed = next !== session.serial;
    setSession("serial", next);
    if (!next) {
      listGen += 1;
      setEntries([]);
      setError("");
      clearSelection();
      setSession("loading", false);
      return;
    }
    if (changed) {
      setSession("path", "/sdcard");
      clearSelection();
    }
    void refresh();
  }

  async function navigate(target: string): Promise<void> {
    setSession("path", target || "/");
    clearSelection();
    await refresh();
  }

  async function enterDirectory(name: string): Promise<void> {
    try {
      await navigate(childPath(session.path, name));
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function goUp(): Promise<void> {
    const parent = parentWithinSafety(session.path);
    if (parent !== null) await navigate(parent);
  }

  async function goTo(target: string): Promise<void> {
    await navigate(target.startsWith("/") ? target : `/${target}`);
  }

  async function withSerial(op: (serial: string) => Promise<void>): Promise<void> {
    const current = serial();
    if (!current) {
      setError("未选择设备");
      return;
    }
    setSession("mutating", true);
    try {
      await op(current);
      setError("");
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSession("mutating", false);
    }
  }

  async function removeMany(names: string[]): Promise<void> {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (unique.length === 0) return;
    await withSerial(async (current) => {
      const failures: string[] = [];
      for (const name of unique) {
        try {
          await filesDelete({ serial: current, path: childPath(session.path, name) });
        } catch (e) {
          failures.push(`${name}: ${errorText(e)}`);
        }
      }
      if (failures.length > 0) throw new Error(failures.join("；"));
    });
    clearSelection();
  }

  async function mkdir(name: string): Promise<void> {
    await withSerial(async (current) => {
      await filesMkdir({ serial: current, path: childPath(session.path, name.trim()) });
    });
  }

  async function createFile(name: string): Promise<void> {
    await withSerial(async (current) => {
      await filesCreate({ serial: current, path: childPath(session.path, name.trim()) });
    });
  }

  async function push(local: string, remoteName: string): Promise<void> {
    const current = serial();
    if (!current) {
      setError("未选择设备");
      return;
    }
    try {
      const remote = childPath(session.path, remoteName);
      const id = await filesPush({ serial: current, local, remote });
      setTransferName(id, remoteName);
      upsertTransfer({ id, direction: "push", bytes: 0, state: "running" }, remoteName);
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function pull(remoteName: string, local: string): Promise<void> {
    const current = serial();
    if (!current) {
      setError("未选择设备");
      return;
    }
    try {
      const remote = childPath(session.path, remoteName);
      const id = await filesPull({ serial: current, local, remote });
      setTransferName(id, remoteName);
      upsertTransfer({ id, direction: "pull", bytes: 0, state: "running" }, remoteName);
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function cancel(id: number): Promise<void> {
    try {
      await filesCancel(id);
    } catch (e) {
      setError(errorText(e));
    }
  }

  function setSort(key: SortKey): void {
    const dir: SortDir = sort.key === key ? (sort.dir === "asc" ? "desc" : "asc") : DEFAULT_SORT_DIR[key];
    setSortState({ key, dir });
    setEntries(sortEntries(entries, key, dir));
  }

  function select(name: string, mode: "replace" | "toggle" | "range"): void {
    if (mode === "toggle") {
      const next = new Set(selection.names);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setSelection({ names: [...next], pivot: name });
      return;
    }
    if (mode === "range" && selection.pivot) {
      const from = entries.findIndex((e) => e.name === selection.pivot);
      const to = entries.findIndex((e) => e.name === name);
      if (from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from];
        setSelection("names", entries.slice(a, b + 1).map((e) => e.name));
        return;
      }
    }
    setSelection({ names: [name], pivot: name });
  }

  function resizeCol(index: number, delta: number): void {
    setUi("colWidths", (prev) => {
      const next = [...prev];
      next[index] = Math.max(COL_MIN[index] ?? 48, (next[index] ?? 80) + delta);
      return next;
    });
  }

  function togglePreview(): void {
    setUi("previewOpen", (v) => !v);
  }

  const selectedSet = (): Set<string> => new Set(selection.names);

  const selectedEntries = (): RemoteEntry[] => entries.filter((e) => selection.names.includes(e.name));

  const singleFile = (): RemoteEntry | undefined => {
    const only = selectedEntries()[0];
    return selectedEntries().length === 1 && only?.kind === "file" ? only : undefined;
  };

  void onTransferProgress((e) => {
    upsertTransfer({ ...e });
    if (e.state !== "running" && serial()) void refresh();
  });

  return {
    entries,
    transfers,
    session,
    sort,
    selection,
    ui,
    bindSerial,
    refresh,
    enterDirectory,
    goUp,
    goTo,
    removeMany,
    mkdir,
    createFile,
    push,
    pull,
    cancel,
    setSort,
    select,
    clearSelection,
    resizeCol,
    togglePreview,
    selectedSet,
    selectedEntries,
    singleFile,
    serial,
  };
}

export const fileStore = createFileStore();
