#!/usr/bin/env node
/**
 * @yohu/ui 组件库纪律检查（ADR-v6-011）：
 * 组件目录（tokens/ 之外）禁止硬编码色值（#hex / rgb( / hsl(）与硬编码字号（font-size: Npx）。
 * 设计 token 单源：所有色值/字号必须来自 tokens（theme.css 或 colors/typography.ts）。
 * 结构值（边框 1px、z-index 等）不受限。
 * 动效纪律（UI设计系统-v6.md §2.4 / 动画系统-v6.md L5）：
 * transition/animation 时长必须走 var(--yohu-dur-*)；模块禁止 animation 声明与私有 @keyframes。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const UI_SRC = resolve(import.meta.dirname, "../ui");
const TOKEN_DIR = "packages/ui/src/tokens/"; // token 定义处是唯一允许的色值源

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(rgb|hsl)a?\(/;
const FONT_SIZE_RE = /font-size\s*:\s*\d/;
const MOTION_RE = /(?:transition|animation)\s*:[^;]*\b\d+(?:\.\d+)?(?:ms|s)\b/;
/** 圆角声明必须是 var(--yohu-radius-*)。 */
const RADIUS_DECL_RE = /border-radius\s*:\s*([^;]+)/;
/** 关键帧只允许 tokens/motion.css（动画系统-v6.md L5）。 */
const KEYFRAMES_RE = /@keyframes\s+/;
const KEYFRAMES_ALLOW = new Set(["packages/ui/src/tokens/motion.css"]);
/** 已废弃的兼容别名与旧选中底（改走 --yohu-state-*）。 */
const DEPRECATED_ALIAS_RE =
  /--yohu-(nav-bg|content-bg|panel-bg|panel-border|list-bg|list-border|text-primary|text-secondary|text-tertiary|accent-bg|nav-hover)\b/;
/** 旧品牌命名空间不得残留。 */
const LEGACY_BRAND_RE = /--yovo-|\.yovo-|@yovo\//;

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
  if (!/\.(ts|tsx|css)$/.test(rel)) continue;
  if (rel.includes("node_modules") || rel.includes("/dist/")) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const inTokens = rel.startsWith(TOKEN_DIR);
  const isCss = rel.endsWith(".css");
  lines.forEach((line, i) => {
    if (LEGACY_BRAND_RE.test(line)) {
      violations.push(`${rel}:${i + 1}: 残留 Yovo 命名空间 → ${line.trim()}（须为 yohu-* / @yohu/*）`);
    }
    if (inTokens) return;
    if (COLOR_RE.test(line)) {
      if (!rel.endsWith("file-icons.tsx")) {
        violations.push(`${rel}:${i + 1}: 硬编码色值 → ${line.trim()}`);
      }
    }
    if (isCss && FONT_SIZE_RE.test(line)) {
      violations.push(`${rel}:${i + 1}: 硬编码字号 → ${line.trim()}`);
    }
    if (isCss && MOTION_RE.test(line)) {
      violations.push(`${rel}:${i + 1}: 硬编码动效时长 → ${line.trim()}（须用 var(--yohu-dur-*)）`);
    }
    if (isCss && KEYFRAMES_RE.test(line) && !KEYFRAMES_ALLOW.has(rel) && !inTokens) {
      violations.push(`${rel}:${i + 1}: 禁止私有 @keyframes → ${line.trim()}（须写入 tokens/motion.css）`);
    }
    if (
      isCss &&
      rel.startsWith("packages/modules/") &&
      /\banimation\s*:/.test(line) &&
      !/^\s*\/\*/.test(line)
    ) {
      violations.push(`${rel}:${i + 1}: 模块禁止 animation 声明 → ${line.trim()}（须挂 @yohu/ui 配方 class）`);
    }
    if (isCss && DEPRECATED_ALIAS_RE.test(line)) {
      violations.push(`${rel}:${i + 1}: 引用废弃兼容别名 → ${line.trim()}（迁移到 Semantic / --yohu-state-*）`);
    }
    if (isCss && !/^\s*\/\*/.test(line)) {
      const radius = RADIUS_DECL_RE.exec(line);
      if (radius && !/^var\(--yohu-radius-/.test(radius[1].trim()) && radius[1].trim() !== "inherit") {
        violations.push(`${rel}:${i + 1}: 硬编码圆角 → ${line.trim()}（须用 var(--yohu-radius-*)）`);
      }
    }
  });
  if (isCss && rel.startsWith("packages/modules/") && rel !== "packages/ui/src/components/page.css") {
    const pageBlocks = readFileSync(file, "utf8").split("}");
    for (const block of pageBlocks) {
      if (
        /display\s*:\s*flex/.test(block) &&
        /flex-direction\s*:\s*column/.test(block) &&
        /height\s*:\s*100%/.test(block) &&
        /padding\s*:\s*var\(--yohu-(?:space-md|layout-page-inset)\)/.test(block)
      ) {
        violations.push(`${rel}: 效率型页壳散落 → 须用 YoPage（禁止模块自写 height + page inset）`);
      }
    }
  }
  if (isCss && !inTokens && rel !== "packages/ui/src/components/Panel.css") {
    const blocks = readFileSync(file, "utf8").split("}");
    for (const block of blocks) {
      if (
        /background(?:-color)?\s*:\s*var\(--yohu-surface\)/.test(block) &&
        /border-radius\s*:\s*var\(--yohu-radius-md\)/.test(block)
      ) {
        violations.push(`${rel}: 画布卡片铬散落 → 须用 YoPanel（禁止自写 surface + radius-md）`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`前端 token 纪律违规 ${violations.length} 处（ADR-v6-011：token 单源）：`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("tokens 纪律检查通过：前端（组件库/壳/模块）零硬编码色值/字号/动效时长/圆角");
