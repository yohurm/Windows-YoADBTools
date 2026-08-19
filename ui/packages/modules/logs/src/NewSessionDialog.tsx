/**
 * 新建日志窗口：设备 + 划分（包名/PID）+ 可检索进程列表。
 * 进程列表是主内容（唯一滚动区）；检索框同时是过滤和创建值，避免「下拉 + 再输入」叠层。
 */

import { For, Show, createEffect, createMemo, createSignal, untrack } from "solid-js";

import { deviceList, type DeviceInfo } from "@yohu/api";
import { Icon, YoButton, YoCheckbox, YoDialog, YoSegmentedButton, YoTextField } from "@yohu/ui";

import type { SessionScope } from "./pipeline";
import { logStore } from "./store";

function deviceChipLabel(device: DeviceInfo): string {
  const name = device.model?.trim();
  const short = device.serial.length > 6 ? device.serial.slice(-4) : device.serial;
  return name ? `${name} · ${short}` : device.serial;
}

export function NewSessionDialog(props: { open: () => boolean; onClose: () => void }) {
  const [mode, setMode] = createSignal<"package" | "pid">("package");
  const [query, setQuery] = createSignal("");
  const [includeChild, setIncludeChild] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [devices, setDevices] = createSignal<DeviceInfo[]>([]);
  const [deviceSerial, setDeviceSerial] = createSignal<string>("");

  const resetForm = (): void => {
    setMode("package");
    setQuery("");
    setIncludeChild(false);
    setError("");
  };

  const loadDevice = (serial: string): void => {
    setDeviceSerial(serial);
    setError("");
    if (!serial) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void logStore.refreshProcesses(serial).finally(() => setLoading(false));
  };

  createEffect(() => {
    if (!props.open()) return;
    untrack(() => {
      resetForm();
      const focus = logStore.serial() ?? "";
      setDeviceSerial(focus);
      setLoading(true);
      void deviceList()
        .then((list) => {
          const online = list.filter((d) => d.state === "online");
          setDevices(online);
          const next =
            focus && online.some((d) => d.serial === focus) ? focus : (online[0]?.serial ?? "");
          loadDevice(next);
        })
        .catch(() => {
          setDevices([]);
          setLoading(false);
        });
    });
  });

  const switchMode = (next: "package" | "pid"): void => {
    if (mode() === next) return;
    setMode(next);
    setQuery("");
    setError("");
  };

  const packageNames = createMemo(() =>
    [...new Set(logStore.state.processEntries.map((e) => e.name))].sort(),
  );

  const filteredPackages = createMemo(() => {
    const q = query().trim().toLowerCase();
    const names = packageNames();
    if (!q) return names;
    return names.filter((n) => n.toLowerCase().includes(q));
  });

  const filteredPids = createMemo(() => {
    const q = query().trim().toLowerCase();
    const entries = [...logStore.state.processEntries].sort(
      (a, b) => a.name.localeCompare(b.name) || a.pid - b.pid,
    );
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q) || String(e.pid).includes(q));
  });

  const parsedPid = (): number => Number.parseInt(query().trim(), 10);

  const canCreate = (): boolean => {
    if (!deviceSerial()) return false;
    if (mode() === "package") return query().trim().length > 0;
    const pid = parsedPid();
    return Number.isInteger(pid) && pid > 0;
  };

  const create = (): void => {
    const serial = deviceSerial();
    if (!serial) {
      setError("请选择设备");
      return;
    }
    let scope: SessionScope;
    let title: string;
    if (mode() === "package") {
      const name = query().trim();
      if (!name) {
        setError("请选择或输入包名");
        return;
      }
      scope = { kind: "package", pkg: name, includeChild: includeChild() };
      title = name;
    } else {
      const pid = parsedPid();
      if (!Number.isInteger(pid) || pid <= 0) {
        setError("请输入有效 PID");
        return;
      }
      scope = { kind: "pid", pid };
      title = `PID ${pid}`;
    }
    logStore.createSession(scope, title, serial);
    props.onClose();
  };

  const pickPackage = (name: string): void => {
    setQuery(name);
    setError("");
  };

  const pickPid = (pid: number): void => {
    setQuery(String(pid));
    setError("");
  };

  return (
    <YoDialog
      open={props.open}
      title="新建日志窗口"
      width={440}
      height={520}
      onClose={props.onClose}
      footer={
        <>
          <YoButton variant="ghost" onClick={props.onClose}>
            取消
          </YoButton>
          <YoButton onClick={create} disabled={!canCreate()}>
            创建
          </YoButton>
        </>
      }
    >
      <div class="yohu-logs__new">
        <div class="yohu-logs__new-row">
          <span class="yohu-logs__label">设备</span>
          <Show
            when={devices().length > 0}
            fallback={<p class="yohu-logs__new-hint">没有在线设备，请先在左侧设备栏连接。</p>}
          >
            <div class="yohu-logs__new-chips" role="listbox" aria-label="设备">
              <For each={devices()}>
                {(device) => (
                  <button
                    type="button"
                    class="yohu-logs__new-chip yohu-interactive"
                    classList={{ "yohu-interactive--selected": deviceSerial() === device.serial }}
                    title={device.serial}
                    role="option"
                    aria-selected={deviceSerial() === device.serial}
                    onClick={() => loadDevice(device.serial)}
                  >
                    <span>{deviceChipLabel(device)}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="yohu-logs__new-seg">
          <YoSegmentedButton
            ariaLabel="划分方式"
            value={mode()}
            items={[
              { value: "package", label: "包名" },
              { value: "pid", label: "PID" },
            ]}
            onChange={(value) => {
              if (value === "package" || value === "pid") switchMode(value);
            }}
          />
        </div>

        <div class="yohu-logs__new-search">
          <span class="yohu-logs__new-search-icon" aria-hidden="true">
            <Icon name="search" size={13} />
          </span>
          <YoTextField
            ariaLabel={mode() === "package" ? "过滤或输入包名" : "过滤进程或输入 PID"}
            value={query()}
            clearable
            placeholder={
              mode() === "package"
                ? loading()
                  ? "正在读取进程…"
                  : "过滤或输入包名"
                : loading()
                  ? "正在读取进程…"
                  : "过滤进程或输入 PID"
            }
            onInput={(v) => {
              setQuery(v);
              setError("");
            }}
          />
        </div>

        <div class="yohu-logs__new-list" role="listbox" aria-label={mode() === "package" ? "包名列表" : "进程列表"}>
          <Show when={mode() === "package"}>
            <Show
              when={filteredPackages().length > 0}
              fallback={
                <p class="yohu-logs__new-empty">
                  {loading() ? "正在读取进程…" : query().trim() ? "无匹配进程，将使用上方输入创建" : "进程列表为空，可手动输入包名"}
                </p>
              }
            >
              <For each={filteredPackages()}>
                {(name) => (
                  <button
                    type="button"
                    class="yohu-logs__new-item yohu-interactive"
                    classList={{ "yohu-interactive--selected": query().trim() === name }}
                    role="option"
                    aria-selected={query().trim() === name}
                    onClick={() => pickPackage(name)}
                    onDblClick={() => {
                      pickPackage(name);
                      create();
                    }}
                  >
                    <span class="yohu-logs__new-item-name">{name}</span>
                  </button>
                )}
              </For>
            </Show>
          </Show>
          <Show when={mode() === "pid"}>
            <Show
              when={filteredPids().length > 0}
              fallback={
                <p class="yohu-logs__new-empty">
                  {loading() ? "正在读取进程…" : query().trim() ? "无匹配进程，将使用上方 PID 创建" : "进程列表为空，可手动输入 PID"}
                </p>
              }
            >
              <For each={filteredPids()}>
                {(entry) => (
                  <button
                    type="button"
                    class="yohu-logs__new-item yohu-interactive"
                    classList={{ "yohu-interactive--selected": query().trim() === String(entry.pid) }}
                    role="option"
                    aria-selected={query().trim() === String(entry.pid)}
                    onClick={() => pickPid(entry.pid)}
                    onDblClick={() => {
                      pickPid(entry.pid);
                      create();
                    }}
                  >
                    <span class="yohu-logs__new-item-name">{entry.name}</span>
                    <span class="yohu-logs__new-item-pid">{entry.pid}</span>
                  </button>
                )}
              </For>
            </Show>
          </Show>
        </div>

        <Show when={mode() === "package"}>
          <YoCheckbox label="包含子进程（pkg:xxx）" checked={includeChild()} onChange={setIncludeChild} />
        </Show>
        <Show when={logStore.state.indexDegraded}>
          <p class="yohu-logs__new-hint">进程列表读取失败，可直接在上方输入包名或 PID。</p>
        </Show>
        <Show when={error()}>
          <p class="yohu-logs__new-error">{error()}</p>
        </Show>
      </div>
    </YoDialog>
  );
}
