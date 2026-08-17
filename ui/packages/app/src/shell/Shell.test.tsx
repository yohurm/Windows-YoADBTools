/**
 * 壳组件测试（Phase C，UI设计系统-v6.md §3/§4.4）：
 * DeviceRail 卡片语义/键盘选择、NavList 键盘导航、StatusBar 任务明细、
 * SettingsView 生效徽章/浏览/密度切换/toast。
 * @yovo/api 与 tauri-plugin-dialog 全量 mock（模块 store 单例在 import 期订阅事件）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";

const mocks = vi.hoisted(() => ({
  deviceRefresh: vi.fn(),
  deviceList: vi.fn(),
  systemInfo: vi.fn(),
  settingsSet: vi.fn(),
  dialogOpen: vi.fn(),
  taskHandler: null as null | ((e: unknown) => void),
}));

vi.mock("@yovo/api", () => {
  const noop = (): void => undefined;
  const notConfigured = vi.fn(async () => {
    throw new Error("测试未配置该命令 mock");
  });
  return {
    deviceList: (...a: unknown[]) => mocks.deviceList(...a),
    deviceRefresh: (...a: unknown[]) => mocks.deviceRefresh(...a),
    systemInfo: (...a: unknown[]) => mocks.systemInfo(...a),
    settingsSet: (...a: unknown[]) => mocks.settingsSet(...a),
    systemReportError: noop,
    systemOpenPath: notConfigured,
    settingsGet: notConfigured,
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
    logCaptureStart: notConfigured,
    logCaptureStop: notConfigured,
    logClear: notConfigured,
    logClearDevice: notConfigured,
    logReplay: notConfigured,
    logExport: notConfigured,
    onDevicesChanged: noop,
    onDeviceOffline: noop,
    onLogBatch: noop,
    onLogOverflow: noop,
    onProcessIndex: noop,
    onCaptureState: noop,
    onTransferProgress: noop,
    onGroupProgress: noop,
    onSettingsChanged: noop,
    onTaskSummary: (h: (e: unknown) => void): void => {
      mocks.taskHandler = h;
    },
    EVENT_NAMES: {
      devicesChanged: "devices.changed",
      deviceOffline: "device.offline",
      logLines: "log.lines",
      logOverflow: "log.overflow",
      processIndex: "log.processIndex",
      captureState: "log.captureState",
      transferProgress: "transfer.progress",
      groupProgress: "group.progress",
      taskSummary: "task.summary",
      settingsChanged: "settings.changed",
    },
  };
});

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...a: unknown[]) => mocks.dialogOpen(...a),
  save: vi.fn(async () => null),
}));

import { DeviceRail } from "./DeviceRail";
import { NavList } from "./NavList";
import { StatusBar } from "./StatusBar";
import { SettingsView } from "../settings/SettingsView";
import { registerModule } from "../registry";
import { deviceStore, settingsStore } from "../stores";

// 真实应用在 apps/shell 入口注册；测试注册一份子集（含 Planned 模块）。
registerModule({
  id: "adb-terminal",
  title: "ADB 终端",
  icon: "terminal",
  selectionMode: "multiOptional",
  Component: () => null,
});
registerModule({
  id: "files",
  title: "文件管理",
  icon: "folder",
  selectionMode: "singleRequired",
  Component: () => null,
});
registerModule({
  id: "settings",
  title: "设置",
  icon: "settings",
  selectionMode: "none",
  Component: SettingsView,
});
registerModule({
  id: "mirror",
  title: "投屏",
  icon: "mirror",
  selectionMode: "none",
  isPlanned: true,
  Component: () => null,
});

const DEFAULT_SETTINGS = {
  adb_path: "",
  data_root: "",
  devices_auto_refresh: 0,
  buffer_capacity: 50000,
  display_limit: 2000,
  clear_device_on_start: true,
  theme: "light",
  density: "compact",
  export_default_path: "",
  export_ask_every_time: true,
  export_write_mode: "overwrite",
} as const;

beforeEach(() => {
  mocks.systemInfo.mockResolvedValue({
    version: "0.1.0",
    data_root: "",
    adb_path: "",
    settings: { ...DEFAULT_SETTINGS },
  });
  mocks.settingsSet.mockImplementation(async (key: string, value: unknown) => {
    return { ...DEFAULT_SETTINGS, [key]: value };
  });
  mocks.deviceRefresh.mockResolvedValue([]);
  mocks.deviceList.mockResolvedValue([]);
  mocks.dialogOpen.mockResolvedValue(null);
});

afterEach(() => {
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
    expect(container.querySelector(".yovo-device-rail__list")?.getAttribute("role")).toBe("listbox");
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
    expect(container.querySelector(".yovo-device-rail__empty-error")?.textContent).toContain("adb 未找到");
    expect(screen.getByText("重试扫描")).toBeTruthy();
  });
});

describe("NavList（§3 模块导航）", () => {
  it("激活项 aria-current + roving tabindex；点击/Enter 导航", () => {
    const onNavigate = vi.fn();
    const { container } = render(() => <NavList activeId="adb-terminal" onNavigate={onNavigate} />);
    const active = container.querySelector('[aria-current="page"]');
    expect(active).toBeTruthy();
    expect(active?.getAttribute("tabindex")).toBe("0");
    const settingsItem = Array.from(container.querySelectorAll(".yovo-nav__item")).find((el) =>
      el.textContent?.includes("设置"),
    );
    expect(settingsItem).toBeTruthy();
    fireEvent.click(settingsItem as HTMLElement);
    expect(onNavigate).toHaveBeenCalledWith("settings");
    fireEvent.keyDown(settingsItem as HTMLElement, { key: "Enter" });
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("每个导航项都有独立图标（不因模块复用而消失）", () => {
    const { container } = render(() => <NavList activeId="files" onNavigate={() => undefined} />);
    const items = container.querySelectorAll(".yovo-nav__item");
    expect(items.length).toBeGreaterThanOrEqual(4);
    items.forEach((item) => {
      expect(item.querySelector("svg.yovo-icon")).toBeTruthy();
    });
  });

  it("Planned 模块显示「开发中」徽章", () => {
    render(() => <NavList activeId="adb-terminal" onNavigate={() => undefined} />);
    expect(screen.getByText("开发中")).toBeTruthy();
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
    const task = container.querySelector(".yovo-status__task");
    expect(task?.textContent).toBe("上传: x.apk");
    expect(task?.getAttribute("title")).toBe("C:\\x.apk → /sdcard/x.apk");
  });
});

describe("SettingsView（§4.4 设置分组卡片）", () => {
  it("生效说明徽章齐备（立即/重启/下次采集）", () => {
    render(() => <SettingsView />);
    expect(screen.getAllByText("立即生效").length).toBeGreaterThan(0);
    expect(screen.getAllByText("重启生效").length).toBeGreaterThan(0);
    expect(screen.getAllByText("下次采集生效").length).toBeGreaterThan(0);
  });

  it("日志导出设置项可见（路径/每次询问/覆盖续写）", () => {
    render(() => <SettingsView />);
    expect(screen.getByText("默认导出路径")).toBeTruthy();
    expect(screen.getByText("每次导出询问保存位置")).toBeTruthy();
    expect(screen.getByText("导出写入方式")).toBeTruthy();
  });

  it("浏览按钮：选择 adb.exe 后写入 adb_path 并弹保存 toast", async () => {
    mocks.dialogOpen.mockResolvedValue("C:\\tools\\adb.exe");
    render(() => <SettingsView />);
    fireEvent.click(screen.getByText("浏览"));
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("adb_path", "C:\\tools\\adb.exe");
    });
    await waitFor(() => {
      expect(screen.getByText("已保存（立即生效）")).toBeTruthy();
    });
  });

  it("密度切换：保存到 core 并应用到 documentElement", async () => {
    render(() => <SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "紧凑（默认）" }));
    fireEvent.click(screen.getByText("舒适"));
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("density", "comfortable");
    });
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
    });
  });

  it("保存失败弹错误 toast", async () => {
    mocks.settingsSet.mockRejectedValueOnce("disk full");
    render(() => <SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "浅色" }));
    fireEvent.click(screen.getByText("深色"));
    await waitFor(() => {
      expect(screen.getByText(/保存失败/)).toBeTruthy();
    });
  });
});

describe("settingsStore 外观应用", () => {
  it("加载快照后应用主题与密度到 documentElement", async () => {
    mocks.systemInfo.mockResolvedValue({
      version: "0.1.0",
      data_root: "",
      adb_path: "",
      settings: { ...DEFAULT_SETTINGS, theme: "dark", density: "comfortable" },
    });
    await settingsStore.load();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
  });
});
