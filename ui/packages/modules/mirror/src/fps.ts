/** 1s 窗口帧率。暂停时调用方不刷新，本函数只做除法。 */

export function fpsWindow(count: number, elapsedMs: number): number {
  if (!Number.isFinite(count) || count < 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.round((count * 1000) / elapsedMs);
}
