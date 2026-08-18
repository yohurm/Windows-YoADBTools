/**
 * 设备 store：列表/焦点/刷新/掉线（全局设备目录与选择会话分离）。
 * 诊断优先：刷新失败时携带错误明细与 adb 使用路径（「cmd 有设备、应用没有」类问题一线定位）。
 */

import { createStore } from "solid-js/store";

import { deviceList, deviceRefresh, onDeviceOffline, onDevicesChanged, systemInfo } from "@yohu/api";
import type { DeviceInfo } from "@yohu/api";

export interface DeviceStore {
  devices: DeviceInfo[];
  refreshing: boolean;
  /** 全局焦点 serial（SingleRequired 模块跟随） */
  focusSerial: string | null;
  statusText: string;
  /** 最近一次失败明细（含 adb 路径诊断） */
  lastError: string;
}

/** IPC 错误转为可读信息（Tauri 错误可能是字符串或 {message} 结构）。 */
function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return JSON.stringify(e);
}

export function createDeviceStore() {
  const [state, setState] = createStore<DeviceStore>({
    devices: [],
    refreshing: false,
    focusSerial: null,
    statusText: "未扫描",
    lastError: "",
  });

  async function refresh(): Promise<void> {
    setState("refreshing", true);
    setState("statusText", "扫描中…");
    try {
      const devices = await deviceRefresh();
      setState("lastError", "");
      applyDevices(devices);
    } catch (e) {
      const detail = errorText(e);
      // 诊断信息：实际使用的 adb 路径（自愈式扫描在 core 侧记录）
      let adbHint = "";
      try {
        const info = await systemInfo();
        const used = info.adb_in_use ?? info.adb_path ?? "";
        adbHint = used ? `；adb: ${used}` : "；adb 未解析";
      } catch {
        adbHint = "";
      }
      setState("lastError", `${detail}${adbHint}`);
      setState("statusText", "设备扫描失败");
      console.error("device.refresh 失败", e);
    } finally {
      setState("refreshing", false);
    }
  }

  function applyDevices(devices: DeviceInfo[]): void {
    setState("devices", devices);
    const online = devices.filter((d) => d.state === "online");
    setState("statusText", online.length > 0 ? `在线 ${online.length} 台` : "无在线设备");
    // 焦点收敛：当前焦点不在线 → 自动选第一台在线
    const focus = state.focusSerial;
    const focusAlive = focus !== null && online.some((d) => d.serial === focus);
    if (!focusAlive) {
      setState("focusSerial", online[0]?.serial ?? null);
    }
  }

  function setFocus(serial: string | null): void {
    setState("focusSerial", serial);
  }

  // ===== 事件订阅（一次性；store 生命周期 = 应用生命周期） =====
  void onDevicesChanged((e) => {
    setState("lastError", "");
    applyDevices(e.devices);
  });
  void onDeviceOffline((e) => {
    if (state.focusSerial === e.serial) {
      setState("focusSerial", null);
    }
  });

  return { state, refresh, setFocus };
}

export type DeviceStoreApi = ReturnType<typeof createDeviceStore>;

/** 启动时取一次缓存快照（refresh 之前的兜底展示）。 */
export async function loadInitialDevices(): Promise<void> {
  try {
    await deviceList();
  } catch (e) {
    console.warn("device.list 失败", e);
  }
}
