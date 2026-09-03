import { describe, expect, it } from "vitest";

import { mirrorLayout, mirrorScreenshot, mirrorStart } from "./commands";

describe("mirror commands", () => {
  it("导出 layout / screenshot / start（无 Channel）", () => {
    expect(typeof mirrorStart).toBe("function");
    expect(typeof mirrorLayout).toBe("function");
    expect(typeof mirrorScreenshot).toBe("function");
    expect(mirrorStart.length).toBe(1);
  });
});
