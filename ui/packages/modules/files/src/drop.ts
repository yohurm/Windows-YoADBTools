/**
 * 拖入命中：窗口级 wry 事件落到文件页 DOM 后，决定远端目录。
 * 纯函数，零 IPC。忽略区（铬/预览/传输/对话框）由 data-drop="ignore" 标注。
 */

export type DropHit = { accept: false } | { accept: true; dirName: string | null };

const REJECT: DropHit = { accept: false };

/** Windows / POSIX 本机路径取末段；目录尾部分隔符去掉。 */
export function localBaseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  if (!trimmed) return "";
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

/**
 * `target` 是 `elementFromPoint` 结果；`root` 是文件页根（未挂载则拒绝）。
 * 目录/符号链接行 → 该目录名；文件行 / 列表空白 / 面包屑 → 当前文件夹（dirName null）。
 */
export function resolveDropHit(target: EventTarget | null, root: Element | null): DropHit {
  if (!(target instanceof Element) || !root) return REJECT;
  if (!root.contains(target)) return REJECT;
  if (target.closest("[data-drop='ignore']")) return REJECT;

  const folderRow = target.closest("[data-kind='dir'], [data-kind='symlink']");
  if (folderRow && root.contains(folderRow)) {
    const keyHost = folderRow.closest("[data-key]");
    const name = keyHost?.getAttribute("data-key") ?? folderRow.getAttribute("data-key");
    if (name) return { accept: true, dirName: name };
  }

  if (target.closest("[data-drop='files']")) return { accept: true, dirName: null };
  return REJECT;
}

/** 从已选行拖：拖已选项则带走全部选中；拖未选项则只带这一项。 */
export function namesForDrag(selected: readonly string[], dragName: string): string[] {
  if (selected.includes(dragName)) return [...selected];
  return [dragName];
}
