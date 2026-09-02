import { describe, expect, it } from "vitest";

import { encodeMirrorFrame, parseMirrorFrame, type MirrorFrame } from "./packet";

describe("mirror binary frame", () => {
  it("头字段小端往返", () => {
    const src: MirrorFrame = {
      generation: 9,
      width: 1080,
      height: 1920,
      config: true,
      keyframe: true,
      pts: 12_345,
      codec: 0,
      dropped: 7,
      payload: new Uint8Array([1, 2, 3, 4]),
    };
    const decoded = parseMirrorFrame(encodeMirrorFrame(src));
    expect(decoded).not.toBeNull();
    expect(decoded?.generation).toBe(9);
    expect(decoded?.width).toBe(1080);
    expect(decoded?.height).toBe(1920);
    expect(decoded?.config).toBe(true);
    expect(decoded?.keyframe).toBe(true);
    expect(decoded?.pts).toBe(12_345);
    expect(decoded?.dropped).toBe(7);
    expect([...decoded!.payload]).toEqual([1, 2, 3, 4]);
  });

  it("过短或版本不对返回 null", () => {
    expect(parseMirrorFrame(new Uint8Array(8))).toBeNull();
    const bad = encodeMirrorFrame({
      generation: 1,
      width: 1,
      height: 1,
      config: false,
      keyframe: false,
      pts: 0,
      codec: 0,
      dropped: 0,
      payload: new Uint8Array(0),
    });
    bad[0] = 9;
    expect(parseMirrorFrame(bad)).toBeNull();
  });
});
