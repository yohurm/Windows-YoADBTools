import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { DeviceInfo } from "./types";
import { deviceDisplayName, lookupSelectedDevices } from "./device";

const testdata = (...segments: string[]): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../../core/yohu-domain/testdata", ...segments);

describe("deviceDisplayName（与 domain testdata/device_display_name.json 同一套向量）", () => {
  const fixture: { serial: string; model: string | null; expect: string }[] = JSON.parse(
    readFileSync(testdata("device_display_name.json"), "utf8"),
  ) as { serial: string; model: string | null; expect: string }[];

  it.each(fixture)("$serial / model=$model", (c) => {
    expect(deviceDisplayName({ serial: c.serial, model: c.model ?? undefined })).toBe(c.expect);
  });
});

describe("lookupSelectedDevices（与 domain testdata/lookup_selected_devices.json 同一套向量）", () => {
  const fixture: { serials: string[]; catalog: DeviceInfo[]; expect: string[] }[] = JSON.parse(
    readFileSync(testdata("lookup_selected_devices.json"), "utf8"),
  ) as { serials: string[]; catalog: DeviceInfo[]; expect: string[] }[];

  it.each(fixture)("serials=$serials", (c) => {
    expect(lookupSelectedDevices(c.serials, c.catalog).map((d) => d.serial)).toEqual(c.expect);
  });
});
