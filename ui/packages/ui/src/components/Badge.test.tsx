import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YBadge } from "./Badge";

describe("YBadge", () => {
  it("渲染文本与默认 neutral 色调", () => {
    render(() => <YBadge text="默认" />);
    const badge = screen.getByText("默认");
    expect(badge.className).toContain("yovo-badge--neutral");
  });

  it("应用指定色调", () => {
    render(() => <YBadge text="成功" tone="success" />);
    expect(screen.getByText("成功").className).toContain("yovo-badge--success");
  });
});
