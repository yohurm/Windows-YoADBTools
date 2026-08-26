import { describe, expect, it } from "vitest";

import { codecFromSps, isAnnexB, prepareDescription, splitAnnexB, toLengthPrefixed } from "./h264";

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("h264 annex-b / avcC", () => {
  it("识别起始码并切开 NALU", () => {
    const sps = new Uint8Array([0x67, 0x42, 0xc0, 0x1e, 0xaa]);
    const pps = new Uint8Array([0x68, 0xce, 0x38, 0x80]);
    const data = concat([new Uint8Array([0, 0, 0, 1]), sps, new Uint8Array([0, 0, 0, 1]), pps]);
    expect(isAnnexB(data)).toBe(true);
    const nalus = splitAnnexB(data);
    expect(nalus).toHaveLength(2);
    expect([...nalus[0]!]).toEqual([...sps]);
    expect(codecFromSps(sps)).toBe("avc1.42C01E");
  });

  it("Annex-B 配置包产出 avcC", () => {
    const sps = new Uint8Array([0x67, 0x64, 0x00, 0x1f, 0x00]);
    const pps = new Uint8Array([0x68, 0xee, 0x3c, 0x80]);
    const data = concat([new Uint8Array([0, 0, 0, 1]), sps, new Uint8Array([0, 0, 1]), pps]);
    const { description, codec } = prepareDescription(data);
    expect(codec).toBe("avc1.64001F");
    expect(description[0]).toBe(1);
    expect(description[1]).toBe(0x64);
  });

  it("已是 avcC 的配置包原样使用", () => {
    const avcC = new Uint8Array([1, 0x42, 0xc0, 0x1e, 0xff, 0xe0]);
    const { description, codec } = prepareDescription(avcC);
    expect(description).toBe(avcC);
    expect(codec).toBe("avc1.42C01E");
  });

  it("Annex-B 帧转长度前缀", () => {
    const nalu = new Uint8Array([0x65, 1, 2, 3]);
    const data = concat([new Uint8Array([0, 0, 0, 1]), nalu]);
    const avc = toLengthPrefixed(data);
    expect([...avc.slice(0, 4)]).toEqual([0, 0, 0, 4]);
    expect([...avc.slice(4)]).toEqual([...nalu]);
  });
});
