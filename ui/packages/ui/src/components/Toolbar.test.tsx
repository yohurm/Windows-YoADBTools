import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YToolbar } from "./Toolbar";
import { YButton } from "./Button";

describe("YToolbar", () => {
  it("水平排列 children", () => {
    render(() => (
      <YToolbar>
        <YButton>刷新</YButton>
        <YButton variant="secondary">导出</YButton>
      </YToolbar>
    ));
    const toolbar = screen.getByRole("button", { name: "刷新" }).parentElement;
    expect(toolbar?.className).toContain("yovo-toolbar");
    expect(screen.getByRole("button", { name: "导出" })).toBeTruthy();
  });
});
