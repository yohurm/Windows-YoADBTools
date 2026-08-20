import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoToolbar } from "./Toolbar";
import { YoButton } from "./Button";

describe("YoToolbar", () => {
  it("水平排列 children", () => {
    render(() => (
      <YoToolbar>
        <YoButton>刷新</YoButton>
        <YoButton variant="secondary">导出</YoButton>
      </YoToolbar>
    ));
    const toolbar = screen.getByRole("button", { name: "刷新" }).parentElement;
    expect(toolbar?.className).toContain("yohu-toolbar");
    expect(screen.getByRole("button", { name: "导出" })).toBeTruthy();
  });
});
