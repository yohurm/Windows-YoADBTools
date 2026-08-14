import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YSelect } from "./Select";

const OPTIONS = [
  { value: "a", label: "选项A" },
  { value: "b", label: "选项B" },
  { value: "c", label: "选项C" },
];

describe("YSelect", () => {
  it("点击展开并选择选项（onChange + 关闭）", () => {
    const onChange = vi.fn();
    render(() => <YSelect options={OPTIONS} placeholder="请选择" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /请选择/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.click(screen.getByText("选项B"));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("显示当前选中值", () => {
    render(() => <YSelect options={OPTIONS} value="c" />);
    expect(screen.getByText("选项C")).toBeTruthy();
  });

  it("Esc 关闭下拉", () => {
    render(() => <YSelect options={OPTIONS} placeholder="请选择" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("点击外部关闭下拉", () => {
    render(() => <YSelect options={OPTIONS} placeholder="请选择" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
