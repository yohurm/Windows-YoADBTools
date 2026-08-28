/**
 * 视口读取（L1 共享能力）。
 *
 * 定位类浮层（右键菜单、Select 下拉、按钮弹出等）都需要把触发点夹紧到可见视口内。
 * 统一走 `window.visualViewport`，避免 `innerHeight` 把不可见区计入。
 * 本模块是 `context-menu` 与 `components/popover-place` 共用的单源，禁止再各写一份。
 */

/** 读取用于定位的视口（优先 visualViewport，避免 innerHeight 含不可见区）。 */
export function readViewport(): { width: number; height: number } {
  const vv = window.visualViewport;
  if (vv && vv.width > 0 && vv.height > 0) {
    return { width: vv.width, height: vv.height };
  }
  const doc = document.documentElement;
  return {
    width: doc.clientWidth || window.innerWidth || 0,
    height: doc.clientHeight || window.innerHeight || 0,
  };
}
