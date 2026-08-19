/**
 * 海拔（浮层阴影）。浅/深各一组，由 emit-theme 写入 theme.css。
 * 电脑弹出框用阴影分层（获焦/失焦），不用大面积遮罩。
 */
export const Elevation = {
  /** HarmonyOS OUTER_DEFAULT_XS：分段选择块 */
  Xs: "0 1px 4px rgba(16, 24, 40, 0.10)",
  Overlay: "0 4px 16px rgba(16, 24, 40, 0.16)",
  Dialog: "0 8px 32px rgba(16, 24, 40, 0.22)",
  DialogUnfocused: "0 2px 8px rgba(16, 24, 40, 0.10)",
} as const;

export const DarkElevation = {
  Xs: "0 1px 4px rgba(0, 0, 0, 0.40)",
  Overlay: "0 4px 16px rgba(0, 0, 0, 0.55)",
  Dialog: "0 8px 32px rgba(0, 0, 0, 0.55)",
  DialogUnfocused: "0 2px 8px rgba(0, 0, 0, 0.35)",
} as const;
