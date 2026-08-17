#!/usr/bin/env node
/**
 * @yovo/ui 组件库纪律检查（ADR-v6-011）：
 * 组件目录（tokens/ 之外）禁止硬编码色值（#hex / rgb( / hsl(）与硬编码字号（font-size: Npx）。
 * 设计 token 单源：所有色值/字号必须来自 tokens（theme.css 或 colors/typography.ts）。
 * 结构值（边框 1px、z-index 等）不受限。
 * 动效纪律（UI设计系统-v6.md §2.4）：transition/animation 时长必须走 var(--yovo-dur-*)。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const UI_SRC = resolve(import.meta.dirname, "../ui");
const TOKEN_DIR = "packages/ui/src/tokens/"; // token 定义处是唯一允许的色值源

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(rgb|hsl)a?\(/;
const FONT_SIZE_RE = /font-size\s*:\s*\d/;
const MOTION_RE = /(?:transition|animation)\s*:[^;]*\b\d+(?:\.\d+)?(?:ms|s)\b/;

/** 递归收集文件。 */
function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(UI_SRC, []);
const violations = [];

for (const file of files) {
  const rel = relative(UI_SRC, file).replaceAll("\\", "/");
  if (rel.startsWith(TOKEN_DIR)) continue;
  if (!/\.(ts|tsx|css)$/.test(rel)) continue;
  if (rel.includes("node_modules") || rel.includes("/dist/")) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const isCss = rel.endsWith(".css");
    if (COLOR_RE.test(line)) {
      violations.push(`${rel}:${i + 1}: 硬编码色值 → ${line.trim()}`);
    }
    if (isCss && FONT_SIZE_RE.test(line)) {
      violations.push(`${rel}:${i + 1}: 硬编码字号 → ${line.trim()}`);
    }
    if (isCss && MOTION_RE.test(line)) {
      violations.push(`${rel}:${i + 1}: 硬编码动效时长 → ${line.trim()}（须用 var(--yovo-dur-*)）`);
    }
  });
}

if (violations.length > 0) {
  console.error(`前端 token 纪律违规 ${violations.length} 处（ADR-v6-011：token 单源）：`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("tokens 纪律检查通过：前端（组件库/壳/模块）零硬编码色值/字号/动效时长");
