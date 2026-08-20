import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoChrome } from "./chrome";
import { YoPage } from "./Page";

describe("YoPage", () => {
  it("页壳包住页眉，标题是第一子节点", () => {
    const { container } = render(() => (
      <YoPage class="yohu-mirror">
        <YoChrome title="投屏显示" />
        <div>内容</div>
      </YoPage>
    ));
    const page = container.querySelector(".yohu-page");
    expect(page).toBeTruthy();
    expect(page?.classList.contains("yohu-mirror")).toBe(true);
    expect(page?.querySelector(":scope > .yohu-chrome")).toBeTruthy();
    expect(page?.querySelector(".yohu-chrome__title")?.textContent).toBe("投屏显示");
  });
});
