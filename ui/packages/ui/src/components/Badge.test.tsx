import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoBadge } from "./Badge";

describe("YoBadge", () => {
  it("渲染文本与默认 neutral 色调", () => {
    render(() => <YoBadge text="默认" />);
    const badge = screen.getByText("默认");
    expect(badge.className).toContain("yohu-badge--neutral");
  });

  it("应用指定色调", () => {
    render(() => <YoBadge text="成功" tone="success" />);
    expect(screen.getByText("成功").className).toContain("yohu-badge--success");
  });

  it("文本同时作为 aria-label（UIA 可发现）", () => {
    render(() => <YoBadge text="通过" tone="success" />);
    expect(screen.getByLabelText("通过")).toBeTruthy();
  });
});
