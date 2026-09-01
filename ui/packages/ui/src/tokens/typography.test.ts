import { describe, expect, it } from "vitest";
import { FontLeading, FontSizes, FontSizesCompact, FontWeights } from "./typography";

describe("HarmonyOS PC 排版 token", () => {
  it("默认字号对齐电脑表：Caption 12 / Body 14 / Subtitle 16 / Title_S 18", () => {
    expect(FontSizes.Caption).toBe(12);
    expect(FontSizes.Body).toBe(14);
    expect(FontSizes.BodyStrong).toBe(14);
    expect(FontSizes.SubtitleM).toBe(14);
    expect(FontSizes.Subtitle).toBe(16);
    expect(FontSizes.PageTitle).toBe(18);
  });

  it("电脑最小字号必须 ≥10vp（UX 标准）；Caption_M 用 10 而非表内 9", () => {
    expect(FontSizes.CaptionM).toBeGreaterThanOrEqual(10);
    expect(FontSizesCompact.CaptionM).toBeGreaterThanOrEqual(10);
    expect(FontSizesCompact.Body).toBeGreaterThanOrEqual(10);
  });

  it("Title 用 Bold、Subtitle 用 Medium、正文 Regular", () => {
    expect(FontWeights.Light).toBe(300);
    expect(FontWeights.Regular).toBe(400);
    expect(FontWeights.Medium).toBe(500);
    expect(FontWeights.Bold).toBe(700);
  });

  it("行高：铬条/按钮紧凑 1.25 / 正文 1.55 / 数据列 1.4", () => {
    expect(FontLeading.Tight).toBe(1.25);
    expect(FontLeading.Ui).toBe(1.55);
    expect(FontLeading.Data).toBe(1.4);
  });
});
