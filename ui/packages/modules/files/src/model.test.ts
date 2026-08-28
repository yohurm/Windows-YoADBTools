/**
 * files/model.ts 路径安全镜像：validateEntryName 与 core SafetyRoot::validate_entry_name
 * 共用同一套 testdata/entry_name.json 向量（布尔有效性），防止语义漂移。
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateEntryName } from "./model";

describe("validateEntryName（与 domain testdata/entry_name.json 同一套向量）", () => {
  const testdata = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../../core/yohu-domain/testdata/entry_name.json",
  );
  const fixture: { name: string; valid: boolean }[] = JSON.parse(readFileSync(testdata, "utf8")) as {
    name: string;
    valid: boolean;
  }[];

  it.each(fixture)("name=$name -> valid=$valid", (c) => {
    expect(validateEntryName(c.name) === null).toBe(c.valid);
  });
});
