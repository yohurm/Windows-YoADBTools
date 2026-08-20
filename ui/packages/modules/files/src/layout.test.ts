import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function loadFilesCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/files.css"),
    resolve(process.cwd(), "packages/modules/files/src/files.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const filesCss = loadFilesCss();

describe("文件表头布局契约", () => {
  it("清单行不承担左右 padding，避免把首列悬浮片推离左缘", () => {
    expect(filesCss).toMatch(/\.yohu-files__cols\s*\{[^}]*padding:\s*0/);
    expect(filesCss).not.toMatch(/\.yohu-files__cols\s*\{[^}]*padding:[^;}]*space-/);
  });

  it("首列文案缩进走 content-pad，排序钮宿主 padding 为 0", () => {
    expect(filesCss).toContain(
      "--yohu-col-header-content-pad: 0 var(--yohu-space-sm) 0 var(--yohu-space-md)",
    );
    expect(filesCss).toMatch(/\.yohu-files__sort\s*\{[^}]*padding:\s*0/);
    expect(filesCss).toContain("padding-left: var(--yohu-space-md)");
  });

  it("拖入高亮走 accent token", () => {
    expect(filesCss).toContain(".yohu-files__explorer--drop");
    expect(filesCss).toContain(".yohu-files__row--drop");
    expect(filesCss).toContain("var(--yohu-accent-soft)");
    expect(filesCss).toContain("var(--yohu-accent)");
    expect(filesCss).toContain("var(--yohu-stroke-accent)");
  });
});
