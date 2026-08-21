import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoIndicator } from "./indicator";

function loadMotionCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/tokens/motion.css"),
    resolve(process.cwd(), "packages/ui/src/tokens/motion.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("YoIndicator", () => {
  it("挂配方 class，并把父级标成 indicator-host", () => {
    const { container } = render(() => (
      <div class="track">
        <YoIndicator follow="a" variant="fill" />
        <button class="yohu-interactive yohu-interactive--selected" type="button">
          A
        </button>
      </div>
    ));
    const thumb = container.querySelector(".yohu-recipe-indicator");
    expect(thumb?.classList.contains("yohu-recipe-indicator--fill")).toBe(true);
    expect(thumb?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".track")?.classList.contains("yohu-indicator-host")).toBe(true);
    expect(container.querySelector(".track")?.getAttribute("data-indicator-variant")).toBe("fill");
  });

  it("follow 为空时不标 ready", () => {
    const { container } = render(() => (
      <div class="track">
        <YoIndicator follow={null} variant="underline" />
        <button class="yohu-interactive yohu-interactive--selected" type="button">
          A
        </button>
      </div>
    ));
    expect(container.querySelector(".yohu-recipe-indicator--underline")).toBeTruthy();
    expect(container.querySelector(".track")?.hasAttribute("data-indicator-ready")).toBe(false);
  });

  it("follow 变化仍保持同一滑块节点", () => {
    const [follow, setFollow] = createSignal("a");
    const { container } = render(() => (
      <div class="track">
        <YoIndicator follow={follow()} variant="fill" />
        <button
          class="yohu-interactive"
          classList={{ "yohu-interactive--selected": follow() === "a" }}
          type="button"
        >
          A
        </button>
        <button
          class="yohu-interactive"
          classList={{ "yohu-interactive--selected": follow() === "b" }}
          type="button"
        >
          B
        </button>
      </div>
    ));
    const first = container.querySelector(".yohu-recipe-indicator");
    setFollow("b");
    expect(container.querySelector(".yohu-recipe-indicator")).toBe(first);
  });

  it("fill 宿主裁切横向过冲，避免 overflow:auto 在 Windows 画出横条", () => {
    const css = loadMotionCss();
    expect(css).toMatch(
      /\.yohu-indicator-host\[data-indicator-variant="fill"\]\s*\{[^}]*overflow-x:\s*hidden/,
    );
    expect(css).not.toMatch(
      /\.yohu-indicator-host\[data-indicator-variant="(underline|thumb)"\][^}]*overflow-x:\s*hidden/,
    );
  });
});
