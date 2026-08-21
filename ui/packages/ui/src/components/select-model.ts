/**
 * 下拉选择领域模型（L2）。
 * 视图只消费这些纯函数，禁止在 TSX 里再写一套选中 / 键盘索引算法。
 */

export interface YoSelectOption {
  /** 选项值 */
  value: string;
  /** 选项显示文本 */
  label: string;
}

/** 空字符串 value（如级别「全部」）不能生成 `yohu-option-` 这种残缺 id。 */
export const optionDomId = (value: string): string => `yohu-option-${value === "" ? "empty" : value}`;

export function findOption(
  options: readonly YoSelectOption[],
  value: string | null | undefined,
): YoSelectOption | undefined {
  return options.find((option) => option.value === value);
}

export function selectedIndex(
  options: readonly YoSelectOption[],
  value: string | null | undefined,
): number {
  return options.findIndex((option) => option.value === value);
}

export function stepIndex(count: number, current: number, delta: number): number {
  if (count === 0) return -1;
  const from = current >= 0 ? current : 0;
  return (from + delta + count) % count;
}

export function edgeIndex(count: number, edge: "start" | "end"): number {
  if (count === 0) return -1;
  return edge === "start" ? 0 : count - 1;
}

export type SelectKeyIntent =
  | { type: "step"; delta: number }
  | { type: "edge"; edge: "start" | "end" }
  | { type: "commit" }
  | { type: "toggle" }
  | { type: "tabCommit" };

/** 触发钮键盘意图；未识别返回 null（视图不 preventDefault）。 */
export function selectKeyIntent(key: string, isOpen: boolean): SelectKeyIntent | null {
  switch (key) {
    case "ArrowDown":
      return { type: "step", delta: 1 };
    case "ArrowUp":
      return { type: "step", delta: -1 };
    case "Home":
      return isOpen ? { type: "edge", edge: "start" } : null;
    case "End":
      return isOpen ? { type: "edge", edge: "end" } : null;
    case "Enter":
    case " ":
      return isOpen ? { type: "commit" } : { type: "toggle" };
    case "Tab":
      return isOpen ? { type: "tabCommit" } : null;
    default:
      return null;
  }
}
