/**
 * L1 和弦：把 KeyboardEvent 收成可比较的 { key, ctrl, shift, alt }。
 *
 * `ctrl` 字段语义 = 命令修饰键（command modifier），而非字面的 Ctrl 键：
 * - macOS：命令修饰键是 Cmd（KeyboardEvent.metaKey）。
 * - 其余平台（Windows/Linux）：命令修饰键是 Ctrl（KeyboardEvent.ctrlKey）。
 * 不能写成 `ctrlKey || metaKey`——在 Windows 上 `metaKey` 对应的是 **Win 键**，
 * 那样会把 Win+F 误判成针对 `ctrl: true` 绑定的 Ctrl+F（详见 isModKey）。
 */

export interface KeyChord {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/** 命令修饰键的平台归属：macOS 用 Cmd(meta)，其余用 Ctrl。 */
export type ModifierPlatform = "mac" | "other";

/** 依运行时环境判定命令修饰键所属平台（桌面浏览器 / WebView2）。 */
export function modPlatform(): ModifierPlatform {
  if (typeof navigator === "undefined") return "other";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  if (nav.userAgentData?.platform === "macOS") return "mac";
  return /Macintosh|Mac OS X/i.test(navigator.userAgent) ? "mac" : "other";
}

/** 平台在模块加载时定格一次；桌面 WebView2 不会运行时切换 OS。 */
const PLATFORM: ModifierPlatform = modPlatform();

export function eventKey(event: KeyboardEvent): string {
  if (event.key === " " || event.code === "Space") return "space";
  return event.key.toLowerCase();
}

/**
 * 命令修饰键是否按下。平台语义见文件头。
 * - macOS：Cmd（event.metaKey）。
 * - 其余（Windows 桌面 WebView2）：Ctrl（event.ctrlKey）。
 * 保留 metaKey 的“命令”含义仅限 macOS，Windows 上不再把 Win 键当作命令修饰键。
 */
export function isModKey(event: KeyboardEvent): boolean {
  return isCommandModifier(PLATFORM, event);
}

/** 给定平台时的命令修饰键判定（纯函数，便于跨平台单测与注入）。 */
export function isCommandModifier(platform: ModifierPlatform, event: KeyboardEvent): boolean {
  return platform === "mac" ? event.metaKey : event.ctrlKey;
}

export function matchesChord(event: KeyboardEvent, chord: KeyChord): boolean {
  if (eventKey(event) !== chord.key) return false;
  if (Boolean(chord.ctrl) !== isModKey(event)) return false;
  if (Boolean(chord.shift) !== event.shiftKey) return false;
  if (Boolean(chord.alt) !== event.altKey) return false;
  return true;
}
