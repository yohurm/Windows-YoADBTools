import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

/**
 * @yovo/ui 组件测试配置。
 * 根 vitest.config.ts（由主代理创建）会 include 各 packages 的测试；
 * 本文件用于在 `ui/packages/ui` 目录内独立运行测试（pnpm test）。
 */
export default defineConfig({
  plugins: [solid()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
  resolve: {
    conditions: ["browser"],
  },
});
