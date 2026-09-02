import { describe, expect, it } from "vitest";

import { asUint8Array } from "./commands";

describe("asUint8Array", () => {
  it("接受 Uint8Array 与 number[]", () => {
    const raw = new Uint8Array([1, 2, 3]);
    expect(asUint8Array(raw)).toEqual(raw);
    expect(asUint8Array([9, 8])).toEqual(new Uint8Array([9, 8]));
  });

  it("拒绝其它形态", () => {
    expect(asUint8Array("Zg==")).toBeNull();
    expect(asUint8Array({ data: [1] })).toBeNull();
    expect(asUint8Array(null)).toBeNull();
  });
});
