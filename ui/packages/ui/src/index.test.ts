import { describe, expect, it } from "vitest";
import * as ui from "./index";

/** 公开 Yo* 组件清单（与 index.ts 分组导出对齐）。 */
const YO_PUBLIC = [
  "YoFileIcon",
  // 基础
  "YoButton",
  "YoSegmentedButton",
  "YoIconButton",
  "YoTextField",
  "YoSelect",
  "YoCheckbox",
  "YoSwitch",
  "YoBadge",
  "YoProgressBar",
  // 导航
  "YoToolbar",
  "YoTabs",
  "YoTree",
  "YoVirtualList",
  "YoColResizer",
  "YoColHeader",
  "YoPanel",
  "YoPage",
  // 反馈
  "YoEmptyState",
  "YoDialog",
  "YoContextMenuHost",
  "YoToast",
  "YoToaster",
  "YoPresence",
  "YoCollapse",
  "YoSwap",
  "YoIndicator",
  // 窗口铬
  "YoChrome",
  "YoTitleBar",
  "YoStatusBar",
] as const;

describe("@yohu/ui 公开组件清单", () => {
  it("分组导出的 Yo* 均为函数", () => {
    for (const name of YO_PUBLIC) {
      expect(typeof (ui as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("含 YoSwitch 与 YoTitleBar", () => {
    expect(ui.YoSwitch).toBeTypeOf("function");
    expect(ui.YoTitleBar).toBeTypeOf("function");
  });
});
