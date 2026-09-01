import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { TransferPanel } from "./TransferPanel";
import { fileStore } from "./store";

describe("TransferPanel", () => {
  it("无任务时 Presence 不挂载进度框", () => {
    render(() => <TransferPanel />);
    expect(document.querySelector(".yohu-files__transfer-bar")).toBeNull();
    expect(document.querySelector(".yohu-collapse")).toBeNull();
  });

  it("toggleTransfers 仍翻转 store", () => {
    const start = fileStore.ui.transfersOpen;
    fileStore.toggleTransfers();
    expect(fileStore.ui.transfersOpen).toBe(!start);
    fileStore.toggleTransfers();
    expect(fileStore.ui.transfersOpen).toBe(start);
  });
});
