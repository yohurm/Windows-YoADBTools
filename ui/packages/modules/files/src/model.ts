/**
 * 文件模块纯领域函数（ViewModel 之外，零 IPC / 零壳依赖）。
 */

import type { RemoteEntry } from "@yohu/api";
import { SAFETY_ROOTS } from "@yohu/api";

export { SAFETY_ROOTS };

export function joinPath(dir: string, name: string): string {
  if (dir === "/") return `/${name}`;
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

export function parentOf(path: string): string | null {
  const trimmed = path.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return null;
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

/** 与 domain SafetyRoot::default 一致；上级停在根上，不逃到 `/`。 */
export function parentWithinSafety(path: string, roots: readonly string[] = SAFETY_ROOTS): string | null {
  const parent = parentOf(path);
  if (parent === null || parent === "/") return null;
  if (roots.some((root) => parent === root || parent.startsWith(`${root}/`))) return parent;
  return null;
}

export function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

/** 空 / `.` / `..` / 分隔符 → 错误文案；合法返回 null。 */
export function validateEntryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "名称不能为空";
  if (trimmed === "." || trimmed === "..") return "名称非法";
  if (/[/\\]/.test(trimmed) || trimmed.includes("\0")) return "名称不能包含路径分隔符";
  return null;
}

export function childPath(dir: string, name: string): string {
  const err = validateEntryName(name);
  if (err) throw new Error(err);
  return joinPath(dir, name);
}

export type SortKey = "name" | "type" | "size" | "mtime";
export type SortDir = "asc" | "desc";
export type FileColAlign = "start" | "end";

/** 列规格（Files ColumnsViewModel / Explorer Details）：名称定宽截断，日期吃剩余。 */
export interface FileColumnSpec {
  key: SortKey;
  header: string;
  sortTitle: string;
  resizeLabel: string;
  defaultWidth: number;
  minWidth: number;
  flex: boolean;
  align: FileColAlign;
}

export const FILE_COLUMNS: readonly FileColumnSpec[] = [
  {
    key: "name",
    header: "名称",
    sortTitle: "按名称排序",
    resizeLabel: "调节名称列宽",
    defaultWidth: 240,
    minWidth: 140,
    flex: false,
    align: "start",
  },
  {
    key: "type",
    header: "类型",
    sortTitle: "按类型排序",
    resizeLabel: "调节类型列宽",
    defaultWidth: 72,
    minWidth: 56,
    flex: false,
    align: "start",
  },
  {
    key: "size",
    header: "大小",
    sortTitle: "按大小排序",
    resizeLabel: "调节大小列宽",
    defaultWidth: 80,
    minWidth: 64,
    flex: false,
    align: "end",
  },
  {
    key: "mtime",
    header: "日期",
    sortTitle: "按日期排序",
    resizeLabel: "调节日期列宽",
    defaultWidth: 108,
    minWidth: 88,
    flex: true,
    align: "start",
  },
];

export function fileColTemplate(widths: readonly number[]): string {
  return FILE_COLUMNS.map((col, index) => {
    const width = widths[index] ?? col.defaultWidth;
    return col.flex ? `minmax(${Math.max(width, col.minWidth)}px, 1fr)` : `${width}px`;
  }).join(" ");
}

export const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  type: "asc",
  size: "desc",
  mtime: "desc",
};

export function sortEntries(
  entries: RemoteEntry[],
  key: SortKey = "name",
  dir: SortDir = "asc",
): RemoteEntry[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    const kindRank = (k: RemoteEntry["kind"]): number => (k === "dir" ? 0 : 1);
    const rankDiff = kindRank(a.kind) - kindRank(b.kind);
    if (rankDiff !== 0) return rankDiff;
    const cmp = compareByKey(a, b, key);
    return cmp === 0 ? a.name.localeCompare(b.name, "en", { sensitivity: "base" }) : cmp * sign;
  });
}

function compareByKey(a: RemoteEntry, b: RemoteEntry, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    case "type":
      return fileTypeLabel(a).localeCompare(fileTypeLabel(b), "en", { sensitivity: "base" });
    case "size":
      return a.size - b.size;
    case "mtime": {
      const am = a.mtime ?? "";
      const bm = b.mtime ?? "";
      if (am === bm) return 0;
      if (am === "") return 1;
      if (bm === "") return -1;
      return am < bm ? -1 : 1;
    }
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

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

export function fileTypeLabel(entry: RemoteEntry): string {
  if (entry.kind === "dir") return "目录";
  if (entry.kind === "symlink") return "链接";
  const ext = entry.name.split(".").pop();
  if (ext && ext !== entry.name) return ext.toUpperCase();
  return "文件";
}

/** `2024-01-11 23:11` → `01-11 23:11`；无法解析则原样返回。 */
export function formatMtime(mtime?: string): string {
  if (!mtime) return "";
  const match = mtime.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return mtime;
  return `${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
}

export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const rec = e as { message?: unknown; code?: unknown };
    if (typeof rec.message === "string" && rec.message.length > 0) return rec.message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export function isCancelledError(e: unknown): boolean {
  const text = errorText(e).toLowerCase();
  return text.includes("cancel") || text.includes("取消");
}

export function isNotFoundError(e: unknown): boolean {
  if (e && typeof e === "object") {
    const rec = e as { code?: unknown };
    if (rec.code === "not_found") return true;
  }
  const text = errorText(e);
  return text.includes("不存在") || text.toLowerCase().includes("not found");
}
