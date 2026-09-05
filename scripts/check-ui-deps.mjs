#!/usr/bin/env node
/**
 * 前端依赖边界（ADR-v6-012 / 架构 §4.3）：
 * 模块只依赖 @yohu/api + @yohu/ui；组合点是 apps/shell。
 * 禁止：模块依赖 @yohu/workbench、模块互引、模块直连 @tauri-apps/*。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const MODULES_DIR = join(ROOT, "ui/packages/modules");
const FORBIDDEN_PKGS = [/^@yohu\/workbench($|\/)/, /^@yohu\/app($|\/)/, /^@yohu\/module-/, /^@tauri-apps\//];
// 覆盖：import ... from、副作用 import、动态 import()、require()；含子路径。
const FORBIDDEN_IMPORT =
  /(?:import\s+(?:[^'"]*?\s+from\s+)?|import\s*\(\s*|require\s*\(\s*)["'](@yohu\/workbench(?:\/[^"']*)?|@yohu\/app(?:\/[^"']*)?|@yohu\/module-[^"']+|@tauri-apps\/[^"']+)["']/;

let failed = false;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

for (const name of readdirSync(MODULES_DIR)) {
  const dir = join(MODULES_DIR, name);
  if (!statSync(dir).isDirectory()) continue;
  const pkgPath = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const dep of Object.keys(deps)) {
    if (FORBIDDEN_PKGS.some((re) => re.test(dep))) {
      console.error(`${pkg.name} package.json 禁止依赖 ${dep}`);
      failed = true;
    }
  }
  const srcDir = join(dir, "src");
  if (!statSync(srcDir).isDirectory()) continue;
  for (const file of walk(srcDir, [])) {
    if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    const match = text.match(FORBIDDEN_IMPORT);
    if (match) {
      console.error(`${relative(ROOT, file)} 禁止 import/require ${match[1]}`);
      failed = true;
    }
  }
}

const TAURI_IMPORT =
  /(?:import\s+(?:[^'"]*?\s+from\s+)?|import\s*\(\s*|require\s*\(\s*)["'](@tauri-apps\/[^"']+)["']/;

function scanNoDirectTauri(dir, pkgJson) {
  if (pkgJson) {
    const pkg = JSON.parse(readFileSync(pkgJson, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const dep of Object.keys(deps)) {
      if (dep.startsWith("@tauri-apps/")) {
        console.error(`${pkg.name} package.json 禁止依赖 ${dep}（经 @yohu/api）`);
        failed = true;
      }
    }
  }
  if (!statSync(dir).isDirectory()) return;
  for (const file of walk(dir, [])) {
    if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    const match = text.match(TAURI_IMPORT);
    if (match) {
      console.error(`${relative(ROOT, file)} 禁止直连 ${match[1]}（经 @yohu/api）`);
      failed = true;
    }
  }
}

scanNoDirectTauri(join(ROOT, "ui/packages/workbench/src"), join(ROOT, "ui/packages/workbench/package.json"));
scanNoDirectTauri(join(ROOT, "ui/apps/shell/src"), join(ROOT, "ui/apps/shell/package.json"));

if (failed) process.exit(1);
console.log("check-ui-deps: ok");
