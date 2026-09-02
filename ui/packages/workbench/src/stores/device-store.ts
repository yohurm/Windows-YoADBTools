/**
 * 设备 store：UI 投影最近一次目录快照（焦点/每模块勾选是选择会话，不是第二份目录）。
 * 写目录只经 `device.refresh`（adb 扫描）；读目录经 `device.list` 与 `devices/changed`。
 */

import { createStore } from "solid-js/store";

import {
  deviceList,
  deviceRefresh,
  errorText,
  lookupSelectedDevices,
  onDevicesChanged,
  systemInfo,
  YoLog,
} from "@yohu/api";
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

  function onlineSerials(devices: readonly DeviceInfo[]): string[] {
    return devices.filter((d) => d.state === "online").map((d) => d.serial);
  }

  function applyDevices(devices: DeviceInfo[]): void {
    setState("devices", devices);
    const online = onlineSerials(devices);
    setState("statusText", online.length > 0 ? `在线 ${online.length} 台` : "无在线设备");
    pruneSelections(new Set(devices.map((d) => d.serial)));
    setState("focusSerial", reconcileFocus(state.focusSerial, online));
  }

  /** 读 core 目录快照，不跑 adb。启动预热可能已经扫过。 */
  async function load(): Promise<void> {
    try {
      const devices = await deviceList();
      setState("lastError", "");
      applyDevices(devices);
    } catch (e) {
      const detail = errorText(e);
      setState("lastError", detail);
      YoLog.error("device", `读取目录失败 ${detail}`);
      console.error("device.list 失败", e);
    }
  }

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
      setState("selectedByModule", id, kept.length > 0 ? kept : undefined!);
    }
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

  function selectedSerials(moduleId: string, mode: SelectionMode): string[] {
    return resolveTargetSerials(
      mode,
      state.focusSerial,
      state.selectedByModule[moduleId] ?? [],
      onlineSerials(state.devices),
    );
  }

  function selectedDevices(moduleId: string, mode: SelectionMode): DeviceInfo[] {
    return lookupSelectedDevices(selectedSerials(moduleId, mode), state.devices);
  }

  void onDevicesChanged((e) => {
    setState("lastError", "");
    applyDevices(e.devices);
  });

  return { state, load, refresh, setFocus, selectDevice, selectedSerials, selectedDevices };
}

export type DeviceStoreApi = ReturnType<typeof createDeviceStore>;
