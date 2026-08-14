import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// Tauri dev 约定：固定端口 1420（tauri.conf.json devUrl 对齐）
export default defineConfig({
  plugins: [solid()],
  server: {
    port: 1420,
    strictPort: true,
    host: false,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
  },
});
