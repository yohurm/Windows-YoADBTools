/**
 * 设备 store：列表/焦点/刷新/掉线（全局设备目录与选择会话分离）。
 */

import { createStore } from "solid-js/store";

import { deviceList, deviceRefresh, onDeviceOffline, onDevicesChanged } from "@yovo/api";
import type { DeviceInfo } from "@yovo/api";

export interface DeviceStore {
  devices: DeviceInfo[];
  refreshing: boolean;
  /** 全局焦点 serial（SingleRequired 模块跟随） */
  focusSerial: string | null;
  statusText: string;
}

export function createDeviceStore() {
  const [state, setState] = createStore<DeviceStore>({
    devices: [],
    refreshing: false,
    focusSerial: null,
    statusText: "未扫描",
  });

  async function refresh(): Promise<void> {
    setState("refreshing", true);
    setState("statusText", "扫描中…");
    try {
      const devices = await deviceRefresh();
      applyDevices(devices);
    } catch (e) {
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
