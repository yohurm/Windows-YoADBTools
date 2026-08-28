/**
 * 文本节点解析（L1 共享 helper）。
 *
 * Button 的文案槽与 YoSwap 的「是否纯文案」判定都只关心：
 * 节点能否解析成一个裸文本串。为统一口径，二者共用本函数：
 * 裸 string / number 直接转字符串；单元素数组（如 JSX children 分包）递归解包一层；
 * 复合节点返回 null（交给调用方原样渲染）。
 */

export function resolveText(node: unknown): string | null {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node) && node.length === 1) {
    return resolveText(node[0]);
  }
  return null;
}
