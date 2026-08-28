/**
 * 设置页路径展示：空值回退到 system.info 解析出的绝对路径；超长时拆成「目录头 + 末段」。
 */

/** 已配置值优先，否则用解析出的绝对路径。 */
export function effectivePath(value: string, fallback: string): string {
  const v = value.trim();
  return v.length > 0 ? v : fallback;
}

/** 拆成目录前缀与末段，供展示框在最大宽度内折叠中间。 */
export function splitPathEnds(path: string): { head: string; tail: string } {
  if (!path) return { head: "", tail: "" };
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i < 0) return { head: "", tail: path };
  return { head: path.slice(0, i + 1), tail: path.slice(i + 1) };
}
