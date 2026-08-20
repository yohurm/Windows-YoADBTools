/**
 * 传输卡状态合并：纯函数，避免 files.push 返回后把终态写回 running。
 */

import type { TransferState } from "@yohu/api";

export function isTerminalTransfer(state: TransferState): boolean {
  return state !== "running";
}

/**
 * 终态不可被迟到的 running 覆盖。
 * `files.push`/`pull` 在 invoke 返回时传输可能已经结束，事件先到、乐观 running 后到。
 */
export function shouldAcceptProgress(
  current: TransferState | undefined,
  incoming: TransferState,
): boolean {
  return !(current !== undefined && isTerminalTransfer(current) && incoming === "running");
}
