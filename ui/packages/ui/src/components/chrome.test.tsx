import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoChrome, YoChromeMount, YoChromeRoot } from "./chrome";

describe("YoChrome", () => {
  it("无根时原地渲染", () => {
    render(() => (
      <YoChrome>
        <span>工具</span>
      </YoChrome>
    ));
    expect(screen.getByText("工具")).toBeTruthy();
  });

  it("有根时传送到挂载点", () => {
    const { container } = render(() => (
      <YoChromeRoot>
        <div data-testid="chrome">
          <YoChromeMount class="mount" />
        </div>
        <div data-testid="body">
          <YoChrome>
            <span>通栏</span>
          </YoChrome>
        </div>
      </YoChromeRoot>
    ));
    const mount = container.querySelector(".mount");
    expect(mount?.textContent).toContain("通栏");
    expect(container.querySelector('[data-testid="body"]')?.textContent).not.toContain("通栏");
  });
});
