import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@solidjs/testing-library";
import { YoColHeader } from "./ColHeader";

function loadColHeaderCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/components/ColHeader.css"),
    resolve(process.cwd(), "packages/ui/src/components/ColHeader.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const colHeaderCss = loadColHeaderCss();

describe("YoColHeader", () => {
  it("轨道承担 columnheader，内容区与拖拽条是兄弟", () => {
    const onResize = vi.fn();
    const { container } = render(() => (
      <YoColHeader ariaSort="ascending" resizable resizeLabel="调节名称列宽" onResize={onResize}>
        <button type="button">名称</button>
      </YoColHeader>
    ));
    const track = container.querySelector(".yohu-col-header");
    const content = container.querySelector(".yohu-col-header__content");
    const resizer = container.querySelector(".yohu-col-resizer");
    expect(track?.getAttribute("role")).toBe("columnheader");
    expect(track?.getAttribute("aria-sort")).toBe("ascending");
    expect(content?.textContent).toBe("名称");
    expect(resizer?.getAttribute("aria-label")).toBe("调节名称列宽");
    expect(content?.nextElementSibling).toBe(resizer);
  });

  it("不可拖拽时不渲染拖拽条", () => {
    const { container } = render(() => (
      <YoColHeader ariaSort="none">
        <span>日期</span>
      </YoColHeader>
    ));
    expect(container.querySelector(".yohu-col-resizer")).toBeNull();
    expect(container.querySelector(".yohu-col-header")?.getAttribute("aria-sort")).toBe("none");
  });

  it("end 对齐加在轨道 class 上", () => {
    const { container } = render(() => (
      <YoColHeader align="end">
        <button type="button">大小</button>
      </YoColHeader>
    ));
    expect(container.querySelector(".yohu-col-header")?.classList.contains("yohu-col-header--end")).toBe(true);
  });

  it("悬浮片铺满交互宿主，文案边距只写在内容槽", () => {
    expect(colHeaderCss).toContain("--yohu-col-header-overlay-inset: 0");
    expect(colHeaderCss).toContain("--yohu-col-header-overlay-radius: var(--yohu-radius-none)");
    expect(colHeaderCss).toContain("--yohu-col-header-content-pad:");
    expect(colHeaderCss).toContain("--yohu-ripple-inset: var(--yohu-col-header-overlay-inset)");
    expect(colHeaderCss).toMatch(
      /\.yohu-col-header__content\s*>\s*\.yohu-interactive\s*\{[^}]*padding:\s*0/,
    );
    expect(colHeaderCss).toMatch(
      /\.yohu-col-header__label\s*\{[^}]*padding:\s*var\(--yohu-col-header-content-pad\)/,
    );
    expect(colHeaderCss).not.toMatch(
      /\.yohu-col-header__content\s*>\s*\.yohu-interactive\s*\{[^}]*padding:\s*var\(--yohu-col-header-content-pad\)/,
    );
  });
});
