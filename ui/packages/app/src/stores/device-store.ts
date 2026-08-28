/**
 * 设备 store：列表/焦点/每模块勾选/刷新/掉线（全局设备目录与选择会话分离）。
 * 诊断优先：刷新失败时携带错误明细与 adb 使用路径（「cmd 有设备、应用没有」类问题一线定位）。
 */

import { createStore } from "solid-js/store";

import { deviceRefresh, errorText, lookupSelectedDevices, onDevicesChanged, systemInfo, YoLog } from "@yohu/api";
import type { DeviceInfo } from "@yohu/api";

import type { SelectionMode } from "../registry";
import { reconcileFocus, resolveTargetSerials } from "./selection";

export interface DeviceStore {
  devices: DeviceInfo[];
  refreshing: boolean;
  /** 全局焦点 serial（SingleRequired 模块跟随） */
  focusSerial: string | null;
  /** 每模块勾选（仅 MultiOptional 写入；解析时再 ∩ 在线） */
  selectedByModule: Record<string, string[]>;
  statusText: string;
  /** 最近一次失败明细（含 adb 路径诊断） */
  lastError: string;
}

export interface SelectDeviceOpts {
  moduleId?: string;
  mode?: SelectionMode;
  /** Ctrl/Meta：在 MultiOptional 下加减选 */
  additive?: boolean;
}

export function createDeviceStore() {
  const [state, setState] = createStore<DeviceStore>({
    devices: [],
    refreshing: false,
    focusSerial: null,
    selectedByModule: {},
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
      YoLog.info("device", `扫描完成 ${devices.length} 台`, devices.map((d) => d.serial));
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
      YoLog.error("device", `扫描失败 ${detail}${adbHint}`);
      console.error("device.refresh 失败", e);
    } finally {
      setState("refreshing", false);
    }
  }

  function pruneSelections(known: Set<string>): void {
    const prevIds = Object.keys(state.selectedByModule);
    for (const id of prevIds) {
      const kept = (state.selectedByModule[id] ?? []).filter((s) => known.has(s));
      // Solid store 对象路径是 merge：空对象不会删键，必须显式 unset
      setState("selectedByModule", id, kept.length > 0 ? kept : undefined!);
    }
  }

  function applyDevices(devices: DeviceInfo[]): void {
    setState("devices", devices);
    const online = devices.filter((d) => d.state === "online");
    setState("statusText", online.length > 0 ? `在线 ${online.length} 台` : "无在线设备");
    pruneSelections(new Set(devices.map((d) => d.serial)));
    setState("focusSerial", reconcileFocus(state.focusSerial, online.map((d) => d.serial)));
  }

  function setFocus(serial: string | null): void {
    setState("focusSerial", serial);
  }

  /** 设备栏选择：始终更新全局焦点；MultiOptional 才写入模块勾选。 */
  function selectDevice(serial: string, opts?: SelectDeviceOpts): void {
    const previousFocus = state.focusSerial;
    setFocus(serial);
    const moduleId = opts?.moduleId;
    const mode = opts?.mode;
    if (!moduleId || mode !== "multiOptional") return;

    const implicit = state.selectedByModule[moduleId] ?? [];
    // 尚未显式勾选时，Ctrl 加选以原焦点为底（与 resolve 回退焦点一致）
    const current =
      opts?.additive && implicit.length === 0 && previousFocus && previousFocus !== serial
        ? [previousFocus]
        : implicit;
    const next = opts?.additive
      ? current.includes(serial)
        ? current.filter((s) => s !== serial)
        : [...current, serial]
      : [serial];
    setState("selectedByModule", moduleId, next);
  }

  /** 当前模块解析后的执行目标（仅在线；空勾选回退焦点）。 */
  function selectedSerials(moduleId: string, mode: SelectionMode): string[] {
    const online = state.devices.filter((d) => d.state === "online").map((d) => d.serial);
    return resolveTargetSerials(mode, state.focusSerial, state.selectedByModule[moduleId] ?? [], online);
  }

  /** 执行目标在目录中的切片（与 selectedSerials 同序）。 */
  function selectedDevices(moduleId: string, mode: SelectionMode): DeviceInfo[] {
    return lookupSelectedDevices(selectedSerials(moduleId, mode), state.devices);
  }

  // ===== 事件订阅（一次性；store 生命周期 = 应用生命周期） =====
  void onDevicesChanged((e) => {
    setState("lastError", "");
    applyDevices(e.devices);
  });

  return { state, refresh, setFocus, selectDevice, selectedSerials, selectedDevices };
}

export type DeviceStoreApi = ReturnType<typeof createDeviceStore>;
