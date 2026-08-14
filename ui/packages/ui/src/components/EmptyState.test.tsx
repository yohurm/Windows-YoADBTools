import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YEmptyState } from "./EmptyState";

describe("YEmptyState", () => {
  it("渲染标题与描述", () => {
    render(() => <YEmptyState title="暂无日志" description="请选择设备开始采集" />);
    expect(screen.getByText("暂无日志")).toBeTruthy();
    expect(screen.getByText("请选择设备开始采集")).toBeTruthy();
  });

  it("可选图标", () => {
    const { container } = render(() => <YEmptyState icon="log" title="空" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
