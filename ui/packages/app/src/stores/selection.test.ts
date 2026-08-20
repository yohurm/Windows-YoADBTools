import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { SelectionMode } from "../registry";
import { reconcileFocus, resolveTargetSerials } from "./selection";

interface Case {
  mode: SelectionMode;
  focus: string | null;
  selected: string[];
  online: string[];
  expect: string[];
}

const fixture: Case[] = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../core/yohu-domain/testdata/resolve_targets.json"),
    "utf8",
  ),
) as Case[];

describe("resolveTargetSerials（与 domain testdata/resolve_targets.json 同一套向量）", () => {
  it.each(fixture)("$mode / focus=$focus", (c) => {
    expect(resolveTargetSerials(c.mode, c.focus, c.selected, c.online)).toEqual(c.expect);
  });
});

interface ReconcileCase {
  focus: string | null;
  online: string[];
  expect: string | null;
}

const reconcileFixture: ReconcileCase[] = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../core/yohu-domain/testdata/reconcile_focus.json"),
    "utf8",
  ),
) as ReconcileCase[];

describe("reconcileFocus（与 domain testdata/reconcile_focus.json 同一套向量）", () => {
  it.each(reconcileFixture)("focus=$focus / online=$online", (c) => {
    expect(reconcileFocus(c.focus, c.online)).toEqual(c.expect);
  });
});
