import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoFormRow } from "./FormRow";

describe("YoFormRow", () => {
  it("左侧标题信息、右侧控件为两列兄弟，说明不独占下一行", () => {
    const { container } = render(() => (
      <YoFormRow title="主题" description="跟随系统或手动选择" note={<span>立即生效</span>}>
        <button type="button">浅色</button>
      </YoFormRow>
    ));
    const row = container.querySelector(".yohu-form-row");
    const info = row?.querySelector(":scope > .yohu-form-row__info");
    const control = row?.querySelector(":scope > .yohu-form-row__control");
    expect(info).toBeTruthy();
    expect(control).toBeTruthy();
    const heading = info?.querySelector(".yohu-form-row__heading");
    expect(heading?.querySelector(".yohu-form-row__title")?.textContent).toBe("主题");
    expect(heading?.querySelector(".yohu-form-row__note")?.textContent).toBe("立即生效");
    expect(info?.querySelector(".yohu-form-row__description")?.textContent).toBe(
      "跟随系统或手动选择",
    );
    expect(control?.querySelector("button")?.textContent).toBe("浅色");
    expect(heading?.nextElementSibling?.classList.contains("yohu-form-row__description")).toBe(
      true,
    );
    expect(row?.querySelector(":scope > .yohu-form-row__description")).toBeNull();
  });

  it("无副标题、无备注时不渲染空槽", () => {
    const { container } = render(() => <YoFormRow title="版本">0.1.0</YoFormRow>);
    expect(screen.getByText("版本")).toBeTruthy();
    expect(screen.getByText("0.1.0")).toBeTruthy();
    expect(container.querySelector(".yohu-form-row__description")).toBeNull();
    expect(container.querySelector(".yohu-form-row__note")).toBeNull();
  });
});
