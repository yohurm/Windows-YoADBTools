import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoProgressBar } from "./ProgressBar";

describe("YoProgressBar", () => {
  it("确定态：宽度按 value 比例渲染", () => {
    const { container } = render(() => <YoProgressBar value={50} />);
    const bar = container.querySelector(".yohu-progress__bar") as HTMLElement;
    expect(bar.style.width).toBe("50%");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
  });

  it("value 夹取到 0-100", () => {
    const { container } = render(() => <YoProgressBar value={150} />);
    expect((container.querySelector(".yohu-progress__bar") as HTMLElement).style.width).toBe("100%");
  });

  it("不定态应用 indeterminate 类", () => {
    const { container } = render(() => <YoProgressBar indeterminate />);
    expect(container.querySelector(".yohu-progress--indeterminate")).toBeTruthy();
  });
});
