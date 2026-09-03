/**
 * 壳组件测试（Phase C，UI设计系统-v6.md §3/§4.4）：
 * DeviceRail 卡片语义/键盘选择、NavList 键盘导航、StatusBar 任务明细、
 * SettingsView 生效徽章/浏览/密度切换/toast。
 * @yohu/api 全量 mock（模块 store 单例在 import 期订阅事件）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import type { Component } from "solid-js";

const mocks = vi.hoisted(() => ({
  deviceList: vi.fn(),
  deviceRefresh: vi.fn(),
  deviceStatus: vi.fn(),
  systemInfo: vi.fn(),
  settingsSet: vi.fn(),
  systemOpenPath: vi.fn(),
  dialogOpenFile: vi.fn(),
  dialogOpenDirectory: vi.fn(),
  dialogSaveFile: vi.fn(),
  updateCheck: vi.fn(),
  updateInfo: vi.fn(),
  updateOpen: vi.fn(),
  updateDownload: vi.fn(),
  updateInstall: vi.fn(),
  updateCancel: vi.fn(),
  taskHandler: null as null | ((e: unknown) => void),
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  const noop = (): void => undefined;
  const notConfigured = vi.fn(async () => {
    throw new Error("测试未配置该命令 mock");
  });
  return {
    ...actual,
    deviceList: (...a: unknown[]) => mocks.deviceList(...a),
    deviceRefresh: (...a: unknown[]) => mocks.deviceRefresh(...a),
    deviceStatus: (...a: unknown[]) => mocks.deviceStatus(...a),
    systemInfo: (...a: unknown[]) => mocks.systemInfo(...a),
    settingsSet: (...a: unknown[]) => mocks.settingsSet(...a),
    systemReportError: noop,
    systemOpenPath: (...a: unknown[]) => mocks.systemOpenPath(...a),
    dialogOpenFile: (...a: unknown[]) => mocks.dialogOpenFile(...a),
    dialogOpenDirectory: (...a: unknown[]) => mocks.dialogOpenDirectory(...a),
    dialogSaveFile: (...a: unknown[]) => mocks.dialogSaveFile(...a),
    updateCheck: (...a: unknown[]) => mocks.updateCheck(...a),
    updateInfo: (...a: unknown[]) => mocks.updateInfo(...a),
    updateOpen: (...a: unknown[]) => mocks.updateOpen(...a),
    updateDownload: (...a: unknown[]) => mocks.updateDownload(...a),
    updateInstall: (...a: unknown[]) => mocks.updateInstall(...a),
    updateCancel: (...a: unknown[]) => mocks.updateCancel(...a),
    onUpdateProgress: noop,
    adbExec: notConfigured,
    terminalEval: notConfigured,
    groupRun: notConfigured,
    groupCancel: notConfigured,
    commandlibLoad: notConfigured,
    commandlibSave: notConfigured,
    filesList: notConfigured,
    filesPush: notConfigured,
    filesPull: notConfigured,
    filesCancel: notConfigured,
    filesDelete: notConfigured,
    filesMkdir: notConfigured,
    filesDragOut: notConfigured,
    filesCreate: notConfigured,
    logCaptureStart: notConfigured,
    logCaptureStop: notConfigured,
    logCaptureStatus: notConfigured,
    logClear: notConfigured,
    logClearDevice: notConfigured,
    logReplay: notConfigured,
    logExport: notConfigured,
    logSessionFileOpen: notConfigured,
    logSessionFileAppend: notConfigured,
    logSessionFileClose: notConfigured,
    logSessionFileLatest: notConfigured,
    logSessionFileList: notConfigured,
    logProcessSnapshot: notConfigured,
    onDevicesChanged: noop,
    onDeviceOffline: noop,
    onDeviceStatus: noop,
    onLogBatch: noop,
    onLogOverflow: noop,
    onProcessIndex: noop,
    onCaptureState: noop,
    onTransferProgress: noop,
    onNativeDragDrop: noop,
    onGroupProgress: noop,
    onSettingsChanged: noop,
    onTaskSummary: (h: (e: unknown) => void): void => {
      mocks.taskHandler = h;
    },
    EVENT_NAMES: {
      devicesChanged: "devices/changed",
      deviceOffline: "device/offline",
      logLines: "log/lines",
      logOverflow: "log/overflow",
      processIndex: "log/processIndex",
      captureState: "log/captureState",
      transferProgress: "transfer/progress",
      groupProgress: "group/progress",
      taskSummary: "task/summary",
      settingsChanged: "settings/changed",
    },
  };
});

import { DeviceRail } from "./DeviceRail";
import { NavList } from "./NavList";
import { StatusBar } from "./StatusBar";
import { AppLayout } from "./AppLayout";
import { SettingsView } from "../settings/SettingsView";
import { registerModule } from "../registry";
import { deviceStore, settingsStore, updateStore } from "../stores";
import { APP_IDENTITY, APP_SETTINGS_DEFAULT, ModuleId, type DeviceSession } from "@yohu/api";

/** 探测壳注入的页眉设备名；用于断言切设备不依赖切模块。 */
const SessionProbe: Component<DeviceSession> = (props) => (
  <div data-testid="session-probe">{props.selectedLabel ?? ""}</div>
);

// 真实应用在 apps/shell 入口注册；测试注册一份子集（含 Planned 模块）。
registerModule({
  id: ModuleId.Terminal,
  title: "ADB 终端",
  icon: "terminal",
  selectionMode: "multiOptional",
  Component: SessionProbe,
});
registerModule({
  id: ModuleId.Files,
  title: "文件管理",
  icon: "folder",
  selectionMode: "singleRequired",
  Component: SessionProbe,
});
registerModule({
  id: ModuleId.Settings,
  title: "设置",
  icon: "settings",
  selectionMode: "none",
  kind: "system",
  Component: SettingsView,
});
registerModule({
  id: ModuleId.Mirror,
  title: "投屏",
  icon: "mirror",
  selectionMode: "singleRequired",
  Component: () => null,
  Status: () => <span>12 fps</span>,
});

const DEFAULT_SETTINGS = { ...APP_SETTINGS_DEFAULT, theme: "light" as const };

const RESOLVED_ADB = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data\\tools\\adb\\adb.exe";
const RESOLVED_LOCAL = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools";
const RESOLVED_DATA = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data";
const RESOLVED_EXPORT = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data\\modules\\log-analyzer\\exports";
const RESOLVED_PATHS = {
  local_root: RESOLVED_LOCAL,
  settings_dir: `${RESOLVED_LOCAL}\\settings`,
  settings_file: `${RESOLVED_LOCAL}\\settings\\settings.json`,
  logs_dir: `${RESOLVED_LOCAL}\\logs`,
  data_root: RESOLVED_DATA,
  adb_tools_dir: `${RESOLVED_DATA}\\tools\\adb`,
  library_file: `${RESOLVED_DATA}\\modules\\adb-terminal\\config\\library.json`,
  exports_dir: RESOLVED_EXPORT,
  drag_out_dir: `${RESOLVED_DATA}\\modules\\file-manager\\drag-out`,
};

const DEFAULT_IDENTITY = {
  ...APP_IDENTITY,
  version: "0.1.0",
};

beforeEach(() => {
  mocks.systemInfo.mockResolvedValue({
    identity: { ...DEFAULT_IDENTITY },
    paths: { ...RESOLVED_PATHS },
    adb_path: RESOLVED_ADB,
    adb_in_use: RESOLVED_ADB,
    settings: { ...DEFAULT_SETTINGS },
  });
  mocks.settingsSet.mockImplementation(async (key: string, value: unknown) => {
    return { ...DEFAULT_SETTINGS, [key]: value };
  });
  mocks.deviceList.mockResolvedValue([]);
  mocks.deviceRefresh.mockResolvedValue([]);
  mocks.deviceStatus.mockResolvedValue([]);
  mocks.dialogOpenFile.mockResolvedValue(null);
  mocks.dialogOpenDirectory.mockResolvedValue(null);
  mocks.dialogSaveFile.mockResolvedValue(null);
  mocks.systemOpenPath.mockResolvedValue(undefined);
  mocks.updateInfo.mockResolvedValue({
    remote: "yohurm/Windows-YoADBTools",
    page_url: "https://github.com/yohurm/Windows-YoADBTools",
  });
  mocks.updateCheck.mockResolvedValue({
    has_new_version: false,
    version: "0.1.0",
    version_code: 0,
    description: "",
    download_url: "",
    force_update: false,
    md5: "",
    sha256: "",
    size_bytes: 0,
  });
  mocks.updateOpen.mockResolvedValue(undefined);
  mocks.updateDownload.mockResolvedValue({ path: "C:\\Temp\\YohuAdbTools-update\\setup.exe", size_bytes: 10 });
  mocks.updateInstall.mockResolvedValue(undefined);
  mocks.updateCancel.mockResolvedValue(undefined);
});

afterEach(() => {
  updateStore.dismiss();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-density");
});

describe("DeviceRail（§3 设备卡片）", () => {
  it("卡片渲染型号/串号/未授权徽章；在线首台自动获焦（listbox 语义）", async () => {
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
      { serial: "B2", state: "unauthorized", connection: "usb" },
    ]);
    await deviceStore.refresh();
    const { container } = render(() => <DeviceRail />);
    expect(screen.getByText("Moto X")).toBeTruthy();
    expect(screen.getByText("A1")).toBeTruthy();
    expect(screen.getByText("未授权")).toBeTruthy();
    const items = container.querySelectorAll('[role="option"]');
    expect(items.length).toBe(2);
    expect(items[0]?.getAttribute("aria-selected")).toBe("true");
    expect(items[0]?.getAttribute("tabindex")).toBe("0");
    expect(items[1]?.getAttribute("tabindex")).toBe("-1");
    expect(container.querySelector(".yohu-device-rail__list")?.getAttribute("role")).toBe("listbox");
    expect(container.querySelector(".yohu-device-rail__scroller")).toBeTruthy();
    expect(items[0]?.classList.contains("yohu-interactive--selected")).toBe(true);
    expect(items[0]?.classList.contains("yohu-device-rail__item--active")).toBe(false);
  });

  it("点击与 Enter 键切换焦点设备（roving tabindex 跟随）", async () => {
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
      { serial: "B2", model: "Moto Y", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    const { container } = render(() => <DeviceRail />);
    const items = Array.from(container.querySelectorAll('[role="option"]'));
    fireEvent.click(items[1] as HTMLElement);
    await Promise.resolve();
    expect(deviceStore.state.focusSerial).toBe("B2");
    expect(items[1]?.getAttribute("aria-selected")).toBe("true");
    expect(items[1]?.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(items[0] as HTMLElement, { key: "Enter" });
    await Promise.resolve();
    expect(deviceStore.state.focusSerial).toBe("A1");
  });

  it("空态：错误明细与重试按钮（诊断文案直接可见）", async () => {
    mocks.deviceRefresh.mockResolvedValueOnce([]); // 先清空单例 store 残留
    await deviceStore.refresh();
    mocks.deviceRefresh.mockRejectedValue("adb 未找到");
    await deviceStore.refresh();
    const { container } = render(() => <DeviceRail />);
    expect(screen.getByText("无设备")).toBeTruthy();
    expect(container.querySelector(".yohu-device-rail__empty-error")?.textContent).toContain("adb 未找到");
    expect(screen.getByText("重试扫描")).toBeTruthy();
  });

  it("扫描空列表即无设备，不保留上次在线", async () => {
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    expect(deviceStore.state.statusText).toBe("在线 1 台");
    mocks.deviceRefresh.mockResolvedValue([]);
    await deviceStore.refresh();
    expect(deviceStore.state.devices).toHaveLength(0);
    expect(deviceStore.state.statusText).toBe("无在线设备");
    expect(deviceStore.state.focusSerial).toBeNull();
    const { container } = render(() => <DeviceRail />);
    expect(screen.getByText("无设备")).toBeTruthy();
    expect(container.querySelectorAll('[role="option"]').length).toBe(0);
  });

  it("两台在线时执行目标仅为焦点，不广播全部在线设备", async () => {
    mocks.deviceRefresh.mockResolvedValue([]);
    await deviceStore.refresh();
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
      { serial: "B2", model: "Moto Y", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    const { container } = render(() => (
      <DeviceRail moduleId={ModuleId.Terminal} selectionMode="multiOptional" />
    ));
    expect(deviceStore.state.focusSerial).toBe("A1");
    expect(deviceStore.selectedSerials(ModuleId.Terminal, "multiOptional")).toEqual(["A1"]);
    expect(deviceStore.selectedDevices(ModuleId.Terminal, "multiOptional").map((d) => d.model)).toEqual([
      "Moto X",
    ]);
    expect(container.querySelector(".yohu-device-rail__list")?.getAttribute("aria-multiselectable")).toBe(
      "true",
    );
    const items = Array.from(container.querySelectorAll('[role="option"]'));
    fireEvent.click(items[1] as HTMLElement);
    await Promise.resolve();
    expect(deviceStore.state.focusSerial).toBe("B2");
    expect(deviceStore.selectedSerials(ModuleId.Terminal, "multiOptional")).toEqual(["B2"]);
    expect(items[0]?.getAttribute("aria-selected")).toBe("false");
    expect(items[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("Ctrl+click 在 MultiOptional 下累加选择", async () => {
    mocks.deviceRefresh.mockResolvedValue([]);
    await deviceStore.refresh();
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
      { serial: "B2", model: "Moto Y", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    const { container } = render(() => (
      <DeviceRail moduleId={ModuleId.Terminal} selectionMode="multiOptional" />
    ));
    const items = Array.from(container.querySelectorAll('[role="option"]'));
    fireEvent.click(items[0] as HTMLElement);
    fireEvent.click(items[1] as HTMLElement, { ctrlKey: true });
    await Promise.resolve();
    expect(deviceStore.selectedSerials(ModuleId.Terminal, "multiOptional")).toEqual(["A1", "B2"]);
    expect(deviceStore.selectedDevices(ModuleId.Terminal, "multiOptional").map((d) => d.model)).toEqual([
      "Moto X",
      "Moto Y",
    ]);
    expect(items[0]?.getAttribute("aria-selected")).toBe("true");
    expect(items[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("列表宿主裁切滑块、滚动在 scroller，禁止 overflow:auto 双轴", () => {
    const candidates = [
      resolve(process.cwd(), "src/shell/shell.css"),
      resolve(process.cwd(), "packages/workbench/src/shell/shell.css"),
    ];
    const css =
      candidates.map((path) => (existsSync(path) ? readFileSync(path, "utf-8") : "")).find(Boolean) ?? "";
    const decls = (block: string): string =>
      (css.match(new RegExp(`^\\.${block}\\s*\\{([^}]*)\\}`, "m"))?.[1] ?? "").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
    expect(decls("yohu-device-rail__list")).toMatch(/overflow:\s*hidden/);
    expect(decls("yohu-device-rail__list")).not.toMatch(/overflow:\s*auto/);
    expect(decls("yohu-device-rail__scroller")).toMatch(/overflow-x:\s*hidden/);
    expect(decls("yohu-device-rail__scroller")).toMatch(/overflow-y:\s*auto/);
  });
});

describe("NavList（§3 模块导航）", () => {
  it("激活项 aria-current + roving tabindex；点击/Enter 导航", () => {
    const onNavigate = vi.fn();
    const { container } = render(() => <NavList activeId={ModuleId.Terminal} onNavigate={onNavigate} />);
    const active = container.querySelector('[aria-current="page"]');
    expect(active).toBeTruthy();
    expect(active?.classList.contains("yohu-interactive--selected")).toBe(true);
    expect(active?.classList.contains("yohu-nav__item--active")).toBe(false);
    expect(active?.getAttribute("tabindex")).toBe("0");
    const settingsItem = Array.from(container.querySelectorAll(".yohu-nav__item")).find((el) =>
      el.textContent?.includes("设置"),
    );
    expect(settingsItem).toBeTruthy();
    fireEvent.click(settingsItem as HTMLElement);
    expect(onNavigate).toHaveBeenCalledWith(ModuleId.Settings);
    fireEvent.keyDown(settingsItem as HTMLElement, { key: "Enter" });
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("每个导航项都有独立图标（不因模块复用而消失）", () => {
    const { container } = render(() => <NavList activeId={ModuleId.Files} onNavigate={() => undefined} />);
    const items = container.querySelectorAll(".yohu-nav__item");
    expect(items.length).toBeGreaterThanOrEqual(4);
    items.forEach((item) => {
      expect(item.querySelector("svg.yohu-icon")).toBeTruthy();
    });
  });

  it("投屏模块不再显示「开发中」徽章", () => {
    render(() => <NavList activeId={ModuleId.Mirror} onNavigate={() => undefined} />);
    expect(screen.queryByText("开发中")).toBeNull();
    expect(screen.getByText("投屏")).toBeTruthy();
  });

  it("设置钉在侧栏底部，与模块用横线隔开", () => {
    const { container } = render(() => (
      <NavList activeId={ModuleId.Terminal} onNavigate={() => undefined} />
    ));
    const moduleTitles = Array.from(
      container.querySelectorAll(".yohu-nav__modules .yohu-nav__item"),
    ).map((el) => el.textContent ?? "");
    expect(moduleTitles.some((t) => t.includes("设置"))).toBe(false);
    expect(moduleTitles.some((t) => t.includes("ADB 终端"))).toBe(true);

    const footerItems = container.querySelectorAll(".yohu-nav__footer .yohu-nav__item");
    expect(footerItems).toHaveLength(1);
    expect(footerItems[0]?.textContent).toContain("设置");
    expect(container.querySelector(".yohu-nav__rule")).toBeTruthy();

    const allItems = container.querySelectorAll(".yohu-nav__item");
    expect(allItems[allItems.length - 1]?.textContent).toContain("设置");
  });
});

describe("StatusBar（§3 状态栏）", () => {
  it("任务项悬停明细（title = TaskInfo.detail）", async () => {
    expect(mocks.taskHandler).not.toBeNull();
    mocks.taskHandler?.({
      tasks: [
        { id: 1, name: "上传: x.apk", active: true, detail: "C:\\x.apk → /sdcard/x.apk" },
      ],
    });
    await Promise.resolve();
    const { container } = render(() => <StatusBar />);
    const task = container.querySelector(".yohu-status__task");
    expect(task?.textContent).toBe("上传: x.apk");
    expect(task?.getAttribute("title")).toBe("C:\\x.apk → /sdcard/x.apk");
  });

  it("版本文案来自 system.info 身份", async () => {
    mocks.systemInfo.mockResolvedValue({
      identity: { ...DEFAULT_IDENTITY, version: "9.9.9" },
      paths: { ...RESOLVED_PATHS },
      adb_path: RESOLVED_ADB,
      settings: { ...DEFAULT_SETTINGS },
    });
    await settingsStore.load();
    render(() => <StatusBar />);
    expect(screen.getByText("Yohu ADB Tools v9.9.9")).toBeTruthy();
    expect(screen.getByText("12 fps")).toBeTruthy();
    mocks.systemInfo.mockResolvedValue({
      identity: { ...DEFAULT_IDENTITY },
      paths: { ...RESOLVED_PATHS },
      adb_path: RESOLVED_ADB,
      settings: { ...DEFAULT_SETTINGS },
    });
    await settingsStore.load();
  });
});

describe("SettingsView（§4.4 设置分组卡片）", () => {
  it("生效说明徽章齐备（立即/重启/下次采集）", () => {
    render(() => <SettingsView />);
    expect(screen.getAllByText("立即生效").length).toBeGreaterThan(0);
    expect(screen.getAllByText("重启生效").length).toBeGreaterThan(0);
    expect(screen.getAllByText("下次采集生效").length).toBeGreaterThan(0);
  });

  it("日志导出设置项可见（路径/导出方式/日志写入方式）", () => {
    render(() => <SettingsView />);
    expect(screen.getByText("默认导出路径")).toBeTruthy();
    expect(screen.getByText("导出方式")).toBeTruthy();
    expect(screen.getByText("日志写入方式")).toBeTruthy();
  });

  it("日志显示列复选框可见且默认全开", () => {
    render(() => <SettingsView />);
    expect(screen.getByText("日志显示列")).toBeTruthy();
    for (const name of ["时间", "UID", "PID", "TID", "级别", "Tag"]) {
      expect((screen.getByRole("checkbox", { name }) as HTMLInputElement).checked).toBe(true);
    }
  });

  it("日志显示列走 YoFormRow：说明在左侧信息栈，复选在右侧控件槽", () => {
    const { container } = render(() => <SettingsView />);
    const title = [...container.querySelectorAll(".yohu-form-row__title")].find(
      (el) => el.textContent === "日志显示列",
    );
    const row = title?.closest(".yohu-form-row");
    const info = row?.querySelector(":scope > .yohu-form-row__info");
    const control = row?.querySelector(":scope > .yohu-form-row__control");
    expect(info).toBeTruthy();
    expect(info?.querySelector(".yohu-form-row__description")).toBeTruthy();
    expect(info?.querySelector(".yohu-form-row__note")).toBeTruthy();
    expect(control).toBeTruthy();
    expect(control?.querySelector(".yohu-settings__checks")).toBeTruthy();
    expect(row?.querySelector(":scope > .yohu-form-row__description")).toBeNull();
  });

  it("关闭 UID 列立即写入 log_display_columns", async () => {
    render(() => <SettingsView />);
    fireEvent.click(screen.getByRole("checkbox", { name: "UID" }));
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith(
        "log_display_columns",
        expect.objectContaining({ uid: false, ts: true, pid: true, tag: true }),
      );
    });
  });

  it("浏览按钮：选择 adb.exe 后写入 adb_path 并弹保存 toast", async () => {
    mocks.dialogOpenFile.mockResolvedValue("C:\\tools\\adb.exe");
    render(() => <SettingsView />);
    fireEvent.click(screen.getAllByText("浏览")[0] as HTMLElement);
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("adb_path", "C:\\tools\\adb.exe");
    });
    await waitFor(() => {
      expect(screen.getByText("已保存（立即生效）")).toBeTruthy();
    });
  });

  it("三项文件位置统一：绝对路径展示框 + 浏览；数据目录走选文件夹", async () => {
    const { container } = render(() => <SettingsView />);
    await waitFor(() => {
      expect(container.querySelector(".yohu-settings__path")?.getAttribute("title")).toBe(
        RESOLVED_ADB,
      );
    });
    const boxes = container.querySelectorAll(".yohu-settings__path");
    expect(boxes).toHaveLength(6);
    expect(boxes[0]?.querySelector(".yohu-settings__path-tail")?.textContent).toBe("adb.exe");
    expect(boxes[1]?.getAttribute("title")).toBe(RESOLVED_DATA);
    expect(boxes[2]?.getAttribute("title")).toBe(RESOLVED_EXPORT);
    expect(boxes[3]?.getAttribute("title")).toBe(RESOLVED_DATA);
    expect(boxes[4]?.getAttribute("title")).toBe(RESOLVED_PATHS.settings_dir);
    expect(boxes[5]?.getAttribute("title")).toBe(RESOLVED_PATHS.logs_dir);
    expect(screen.getAllByText("浏览")).toHaveLength(3);
    expect(screen.getAllByText("打开")).toHaveLength(3);

    mocks.dialogOpenDirectory.mockResolvedValue("D:\\YohuData");
    fireEvent.click(screen.getAllByText("浏览")[1] as HTMLElement);
    await waitFor(() => {
      expect(mocks.dialogOpenDirectory).toHaveBeenCalledWith(
        expect.objectContaining({ title: "选择数据目录" }),
      );
      expect(mocks.settingsSet).toHaveBeenCalledWith("data_root", "D:\\YohuData");
    });
  });

  it("密度切换：保存到 core 并应用到 documentElement", async () => {
    render(() => <SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "舒适（默认）" }));
    fireEvent.click(screen.getByText("紧凑"));
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("density", "compact");
    });
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    });
  });

  it("保存失败弹错误 toast", async () => {
    mocks.settingsSet.mockRejectedValueOnce("disk full");
    render(() => <SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: /浅色|跟随系统|深色/ }));
    fireEvent.click(screen.getByText("深色"));
    await waitFor(() => {
      expect(screen.getByText(/保存失败/)).toBeTruthy();
    });
  });

  it("启用项为 YoSwitch，无「启用」字样", () => {
    render(() => <SettingsView />);
    expect(screen.getByRole("switch", { name: "开始采集前清空设备缓冲（logcat -c）" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "强制 ADB forward（跳过 reverse）" })).toBeTruthy();
    expect(screen.queryByText("启用")).toBeNull();
  });

  it("页眉与分组卡片分列：标题不进滚动容器", () => {
    const { container } = render(() => <SettingsView />);
    const root = container.querySelector(".yohu-settings");
    const chrome = root?.querySelector(":scope > .yohu-chrome");
    const body = root?.querySelector(":scope > .yohu-settings__body");
    expect(chrome).toBeTruthy();
    expect(body).toBeTruthy();
    expect(body?.querySelector(".yohu-panel")).toBeTruthy();
    expect(body?.contains(chrome as Node)).toBe(false);
  });

  it("关于面板展示身份与路径，打开走 system.openPath", async () => {
    render(() => <SettingsView />);
    await waitFor(() => {
      expect(screen.getByText("0.1.0")).toBeTruthy();
    });
    expect(screen.getByText("com.yohu.adbtools")).toBeTruthy();
    expect(screen.getByText("数据根")).toBeTruthy();
    expect(screen.getByText("设置目录")).toBeTruthy();
    expect(screen.getByText("应用日志")).toBeTruthy();
    const openButtons = screen.getAllByRole("button", { name: "打开" });
    expect(openButtons.length).toBe(3);
    fireEvent.click(openButtons[2] as HTMLButtonElement);
    await waitFor(() => {
      expect(mocks.systemOpenPath).toHaveBeenCalledWith(RESOLVED_PATHS.logs_dir);
    });
  });

  it("关于面板可检查更新；已最新提示；有新版本则下载后确认安装", async () => {
    render(() => <SettingsView />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "检查更新" })).toBeTruthy();
    });
    expect(screen.queryByRole("heading", { name: "更新" })).toBeNull();
    const about = screen.getByRole("heading", { name: "关于" }).closest(".yohu-panel");
    expect(about?.textContent).toContain("检查更新");
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }) as HTMLButtonElement);
    await waitFor(() => {
      expect(mocks.updateCheck).toHaveBeenCalled();
      expect(screen.getByText("已是最新版本")).toBeTruthy();
    });

    mocks.updateCheck.mockResolvedValueOnce({
      has_new_version: true,
      version: "1.2.0",
      version_code: 12,
      description: "修复若干问题",
      download_url: "https://example.com/setup.exe",
      force_update: false,
      md5: "",
      sha256: "",
      size_bytes: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }) as HTMLButtonElement);
    await waitFor(() => {
      expect(screen.getByText("发现新版本")).toBeTruthy();
      expect(screen.getByText("1.2.0")).toBeTruthy();
      expect(screen.getByText("修复若干问题")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "下载" }) as HTMLButtonElement);
    await waitFor(() => {
      expect(mocks.updateDownload).toHaveBeenCalledWith({
        url: "https://example.com/setup.exe",
        sha256: "",
        size_bytes: 0,
        version: "1.2.0",
      });
      expect(mocks.updateInstall).not.toHaveBeenCalled();
      expect(screen.getByText("安装更新")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "安装并重启" }) as HTMLButtonElement);
    await waitFor(() => {
      expect(mocks.updateInstall).toHaveBeenCalledWith("C:\\Temp\\YohuAdbTools-update\\setup.exe");
    });
  });
});

describe("AppLayout 窗口铬", () => {
  it("渲染标题栏且三键为最小化、最大化、关闭", () => {
    render(() => <AppLayout activeModuleId={() => ModuleId.Terminal} onNavigate={() => undefined} />);
    expect(screen.getByText("Yohu ADB Tools")).toBeTruthy();
    const bar = document.querySelector(".yohu-titlebar");
    const buttons = bar?.querySelectorAll(".yohu-titlebar__caption") ?? [];
    expect([...buttons].map((b) => b.getAttribute("aria-label"))).toEqual(["最小化", "最大化", "关闭"]);
    expect(document.querySelector(".yohu-window")).toBeTruthy();
    expect(document.querySelector(".yohu-titlebar__center")).toBeTruthy();
  });

  it("模块标题与功能栏在右侧内容区，不进窗口标题栏", () => {
    render(() => <AppLayout activeModuleId={() => ModuleId.Settings} onNavigate={() => undefined} />);
    const titlebar = document.querySelector(".yohu-titlebar");
    expect(titlebar?.textContent).not.toContain("设置");
    expect(document.querySelector(".yohu-layout__content .yohu-chrome__title")?.textContent).toContain("设置");
  });

  it("侧栏可收起为抽屉", () => {
    render(() => <AppLayout activeModuleId={() => ModuleId.Terminal} onNavigate={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));
    expect(document.querySelector(".yohu-layout--rail-collapsed")).toBeTruthy();
    expect(document.querySelector(".yohu-recipe-rail")).toBeTruthy();
    expect(document.querySelector(".yohu-layout__rail-inner")).toBeTruthy();
    expect(Boolean((document.querySelector(".yohu-layout__rail") as HTMLElement | null)?.inert)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }));
    expect(document.querySelector(".yohu-layout--rail-collapsed")).toBeNull();
    expect(Boolean((document.querySelector(".yohu-layout__rail") as HTMLElement | null)?.inert)).toBe(false);
  });

  it("切换设备后内容区选中设备名立即更新，不依赖切模块", async () => {
    mocks.deviceRefresh.mockResolvedValue([]);
    await deviceStore.refresh();
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
      { serial: "B2", model: "Moto Y", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    render(() => <AppLayout activeModuleId={() => ModuleId.Files} onNavigate={() => undefined} />);
    expect(screen.getByTestId("session-probe").textContent).toBe("Moto X");
    const items = Array.from(document.querySelectorAll('[role="option"]'));
    fireEvent.click(items[1] as HTMLElement);
    expect(screen.getByTestId("session-probe").textContent).toBe("Moto Y");
  });
});

describe("settingsStore 外观应用", () => {
  it("加载快照后应用主题与密度到 documentElement", async () => {
    mocks.systemInfo.mockResolvedValue({
      identity: { ...DEFAULT_IDENTITY },
      paths: { ...RESOLVED_PATHS },
      adb_path: "",
      settings: { ...DEFAULT_SETTINGS, theme: "dark", density: "comfortable" },
    });
    await settingsStore.load();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
  });
});
