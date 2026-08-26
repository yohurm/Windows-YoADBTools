import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@solidjs/testing-library";
import { YoChrome } from "./chrome";

function loadChromeCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/components/chrome.css"),
    resolve(process.cwd(), "packages/ui/src/components/chrome.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("YoChrome", () => {
  it("在原地渲染标题区与功能栏，不传送", () => {
    const { container } = render(() => (
      <div data-testid="body">
        <YoChrome title="ADB 命令终端" leading={<span>A1</span>}>
          <button type="button">执行</button>
        </YoChrome>
      </div>
    ));
    expect(container.querySelector(".yohu-chrome__title")?.textContent).toContain("ADB 命令终端");
    expect(container.querySelector(".yohu-chrome__title")?.textContent).toContain("A1");
    expect(container.querySelector(".yohu-chrome__bar")?.textContent).toContain("执行");
    expect(screen.getByTestId("body").querySelector(".yohu-chrome")).toBeTruthy();
  });

  it("deviceLabel 在标题后渲染为中性徽章", () => {
    const { container } = render(() => <YoChrome title="文件管理" deviceLabel="Moto X" />);
    expect(container.querySelector(".yohu-module-title")?.textContent).toBe("文件管理");
    expect(container.querySelector(".yohu-chrome__device")?.textContent).toBe("Moto X");
  });

  it("无 deviceLabel 时不渲染设备徽章", () => {
    const { container } = render(() => <YoChrome title="设置" />);
    expect(container.querySelector(".yohu-chrome__device")).toBeNull();
  });

  it("无操作时只显示标题区", () => {
    const { container } = render(() => <YoChrome title="投屏显示" />);
    expect(container.querySelector(".yohu-chrome__title")?.textContent).toBe("投屏显示");
    expect(container.querySelector(".yohu-chrome__bar")).toBeNull();
  });

  it("标题行占位走 control-height，底垫走 chrome-pad（外壳不加 min-height）", () => {
    const css = loadChromeCss();
    expect(css.length).toBeGreaterThan(0);
    expect(css).toMatch(
      /\.yohu-chrome__title\s*\{[^}]*min-height:\s*var\(--yohu-control-height\)/,
    );
    expect(css).toMatch(/padding-bottom:\s*var\(--yohu-layout-chrome-pad\)/);
    const chromeBlock = css.match(/\.yohu-chrome\s*\{[^}]+\}/)?.[0] ?? "";
    expect(chromeBlock).not.toMatch(/min-height/);
  });

  it("extra 落在次行，不进主行功能栏", () => {
    const { container } = render(() => (
      <YoChrome title="投屏显示" extra={<span>质量</span>}>
        <button type="button">开始</button>
      </YoChrome>
    ));
    expect(container.querySelector(".yohu-chrome__bar")?.textContent).toContain("开始");
    expect(container.querySelector(".yohu-chrome__bar")?.textContent).not.toContain("质量");
    expect(container.querySelector(".yohu-chrome__extra")?.textContent).toContain("质量");
  });
});
