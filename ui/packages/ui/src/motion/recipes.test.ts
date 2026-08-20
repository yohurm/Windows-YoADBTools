import { describe, expect, it } from "vitest";

import { motionDurationMs } from "../tokens/motion";
import { DISMISS_HOLD_DURATION, SWAP_DURATION } from "./recipes";

describe("motion recipes", () => {
  it("swap 与 dismiss 停留走时长 token，禁止散落毫秒", () => {
    expect(SWAP_DURATION).toBe("slow");
    expect(DISMISS_HOLD_DURATION).toBe("toast");
    expect(motionDurationMs(DISMISS_HOLD_DURATION)).toBe(3000);
  });
});
