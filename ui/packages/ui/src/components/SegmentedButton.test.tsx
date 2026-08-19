import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoSegmentedButton } from "./SegmentedButton";

const ITEMS = [
  { value: "package", label: "包名" },
  { value: "pid", label: "PID" },
];

describe("YoSegmentedButton", () => {
  it("渲染 radiogroup，默认 tab 白选择块", () => {
    const { container } = render(() => (
      <YoSegmentedButton items={ITEMS} value="package" ariaLabel="划分方式" />
    ));
    expect(screen.getByRole("radiogroup", { name: "划分方式" })).toBeTruthy();
    expect(container.querySelector(".yohu-segmented--tab")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "包名" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "PID" }).getAttribute("aria-checked")).toBe("false");
  });

  it("点击未选项触发 onChange 与 onItemClick", () => {
    const onChange = vi.fn();
    const onItemClick = vi.fn();
    render(() => (
      <YoSegmentedButton items={ITEMS} value="package" onChange={onChange} onItemClick={onItemClick} />
    ));
    fireEvent.click(screen.getByRole("radio", { name: "PID" }));
    expect(onChange).toHaveBeenCalledWith("pid");
    expect(onItemClick).toHaveBeenCalledWith(1);
  });

  it("再次点击当前项只打 onItemClick（对齐鸿蒙 onItemClicked）", () => {
    const onChange = vi.fn();
    const onItemClick = vi.fn();
    render(() => (
      <YoSegmentedButton items={ITEMS} value="package" onChange={onChange} onItemClick={onItemClick} />
    ));
    fireEvent.click(screen.getByRole("radio", { name: "包名" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onItemClick).toHaveBeenCalledWith(0);
  });

  it("方向键循环切换", () => {
    const onChange = vi.fn();
    render(() => <YoSegmentedButton items={ITEMS} value="package" onChange={onChange} ariaLabel="划分" />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("pid");
  });

  it("Home/End 跳到首尾", () => {
    const onChange = vi.fn();
    render(() => (
      <YoSegmentedButton
        items={[...ITEMS, { value: "all", label: "全部" }]}
        value="pid"
        onChange={onChange}
        ariaLabel="划分"
      />
    ));
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "Home" });
    expect(onChange).toHaveBeenCalledWith("package");
    fireEvent.keyDown(group, { key: "End" });
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("图文混合挂 hybrid 高度", () => {
    const { container } = render(() => (
      <YoSegmentedButton
        items={[
          { value: "package", label: "包名", icon: "search" },
          { value: "pid", label: "PID", icon: "log" },
        ]}
        value="package"
      />
    ));
    expect(container.querySelector(".yohu-segmented--hybrid")).toBeTruthy();
  });

  it("capsule 类型挂强调色选择块 class", () => {
    const { container } = render(() => (
      <YoSegmentedButton items={ITEMS} value="package" type="capsule" />
    ));
    expect(container.querySelector(".yohu-segmented--capsule")).toBeTruthy();
  });

  it("disabled 时不触发 onChange", () => {
    const onChange = vi.fn();
    render(() => <YoSegmentedButton items={ITEMS} value="package" disabled onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "PID" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
