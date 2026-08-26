import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoLoading } from "./Loading";

describe("YoLoading", () => {
  it("渲染标题与描述，并暴露 status 语义", () => {
    render(() => <YoLoading title="启动中" description="正在建立隧道" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("启动中")).toBeTruthy();
    expect(screen.getByText("正在建立隧道")).toBeTruthy();
    expect(status.querySelector(".yohu-loading__spinner")).toBeTruthy();
  });

  it("可选描述；cover 铺满父级", () => {
    const { container } = render(() => <YoLoading title="加载中" cover />);
    expect(screen.getByText("加载中")).toBeTruthy();
    expect(container.querySelector(".yohu-loading--cover")).toBeTruthy();
    expect(container.querySelector(".yohu-loading__description")).toBeNull();
  });
});
