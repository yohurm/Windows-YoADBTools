import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOG_DISPLAY_COLUMNS,
  logColTemplate,
  visibleLogColumns,
} from "./layout";

function loadLogsCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/logs.css"),
    resolve(process.cwd(), "packages/modules/logs/src/logs.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const logsCss = loadLogsCss();

describe("日志表头布局契约", () => {
  it("表头钉在虚拟列表外，不随行滚动", () => {
    expect(logsCss).toMatch(/\.yohu-logs__list\s*\{[^}]*display:\s*flex/);
    expect(logsCss).toMatch(/\.yohu-logs__cols--head\s*\{[^}]*flex-shrink:\s*0/);
    expect(logsCss).toContain("var(--yohu-row-height-header)");
    expect(logsCss).toMatch(/\.yohu-logs__list-body\s*\{[^}]*overflow:\s*hidden/);
  });

  it("列轨道不在 CSS 写死七列，由显示列内联写入", () => {
    expect(logsCss).not.toMatch(/\.yohu-logs__cols\s*\{[^}]*grid-template-columns:\s*18ch/);
    expect(logsCss).not.toMatch(/\.yohu-logs__row\s*\{[^}]*grid-template-columns:/);
  });
});

describe("日志显示列", () => {
  it("默认全开含消息列", () => {
    expect(logColTemplate(DEFAULT_LOG_DISPLAY_COLUMNS)).toBe(
      "18ch 10ch 6ch 6ch 4ch 24ch minmax(0, 1fr)",
    );
    expect(visibleLogColumns(DEFAULT_LOG_DISPLAY_COLUMNS).map((c) => c.key)).toEqual([
      "ts",
      "uid",
      "pid",
      "tid",
      "level",
      "tag",
      "msg",
    ]);
  });

  it("关闭元数据列后消息仍在，轨道只留可见列", () => {
    const display = { ...DEFAULT_LOG_DISPLAY_COLUMNS, ts: false, uid: false, tag: false };
    expect(visibleLogColumns(display).map((c) => c.key)).toEqual(["pid", "tid", "level", "msg"]);
    expect(logColTemplate(display)).toBe("6ch 6ch 4ch minmax(0, 1fr)");
  });

  it("全部元数据关闭只剩消息", () => {
    const display = { ts: false, uid: false, pid: false, tid: false, level: false, tag: false };
    expect(logColTemplate(display)).toBe("minmax(0, 1fr)");
  });
});
