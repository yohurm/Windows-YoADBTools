import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YStatusBar } from "./StatusBar";

describe("YStatusBar", () => {
  it("渲染左右两个插槽", () => {
    render(() => <YStatusBar left={<span>左侧</span>} right={<span>右侧</span>} />);
    expect(screen.getByText("左侧")).toBeTruthy();
    expect(screen.getByText("右侧")).toBeTruthy();
    expect(screen.getByText("左侧").closest("footer")?.className).toContain("yovo-status-bar");
  });
});
