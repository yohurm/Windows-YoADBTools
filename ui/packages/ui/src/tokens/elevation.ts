/**
 * 海拔（浮层阴影）。浅/深各一条，由 emit-theme 写入 theme.css。
 */
export const Elevation = {
  Overlay: "0 4px 16px rgba(16, 24, 40, 0.16)",
} as const;

export const DarkElevation = {
  Overlay: "0 4px 16px rgba(0, 0, 0, 0.55)",
} as const;
