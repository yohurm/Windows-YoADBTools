/**
 * @yohu/api — IPC/未知错误转可读文案的统一单源。
 * 壳与各模块共用，避免各处重复实现且边界不一致（错误可能是字符串或 {code,message}）。
 */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const rec = e as { message?: unknown };
    if (typeof rec.message === "string" && rec.message.length > 0) return rec.message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
