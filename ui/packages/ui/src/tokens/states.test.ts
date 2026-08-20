import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadStatesCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/tokens/states.css"),
    resolve(process.cwd(), "packages/ui/src/tokens/states.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const statesCss = loadStatesCss();

describe("yohu-interactive 叠层契约", () => {
  it("states.css 可读取", () => {
    expect(statesCss.length).toBeGreaterThan(0);
  });

  it("选中片 ::before 使用负 z-index，避免盖住流内文本节点", () => {
    const block = statesCss.match(/\.yohu-interactive::before\s*\{[^}]+\}/);
    expect(block?.[0]).toMatch(/z-index:\s*-1/);
  });

  it("元素子节点抬到选中片之上（> * { z-index: 1 }）", () => {
    const block = statesCss.match(/\.yohu-interactive > \*\s*\{[^}]+\}/);
    expect(block?.[0]).toMatch(/z-index:\s*1/);
  });

  it("选中字色走 --yohu-state-selected-fg，禁止表面另写 accent 字", () => {
    expect(statesCss).toContain("color: var(--yohu-state-selected-fg)");
    expect(statesCss).toContain("background: var(--yohu-state-selected)");
  });

  it("语义色逃生：yohu-badge / yohu-tone 不吃选中字色", () => {
    expect(statesCss).toContain(".yohu-badge");
    expect(statesCss).toContain(".yohu-tone");
  });

  it("连续选中削平邻接圆角", () => {
    expect(statesCss).toContain("yohu-interactive--sel-start");
    expect(statesCss).toContain("yohu-interactive--sel-mid");
    expect(statesCss).toContain("yohu-interactive--sel-end");
    expect(statesCss).toContain("border-end-start-radius: 0");
    expect(statesCss).toContain("border-radius: 0");
    expect(statesCss).toContain("border-start-start-radius: 0");
  });
});
