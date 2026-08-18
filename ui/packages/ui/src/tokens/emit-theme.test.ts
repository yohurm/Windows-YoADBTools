import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emitThemeCss } from "./emit-theme";

function loadThemeCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/tokens/theme.css"),
    resolve(process.cwd(), "packages/ui/src/tokens/theme.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("theme.css 由 TS token 生成", () => {
  it("磁盘 theme.css 与 emitThemeCss() 一致", () => {
    const onDisk = loadThemeCss().replace(/\r\n/g, "\n");
    expect(onDisk).toBe(emitThemeCss());
  });
});
