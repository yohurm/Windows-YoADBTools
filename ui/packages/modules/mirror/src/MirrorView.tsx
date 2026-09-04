/**
 * 投屏主视图：可用区只量盒；画面在壳 HWND 上。
 */

import { For, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { errorText, deviceSetNightMode, type DeviceSession } from "@yohu/api";
import {
  Layout,
  YoButton,
  YoChrome,
  YoIconButton,
  YoPage,
  YoPanel,
  YoSelect,
  YoToaster,
  createToaster,
  type IconName,
} from "@yohu/ui";

import { AndroidKey } from "./keys";
import { clientZoneRect, layoutIsPresentable } from "./layout";
import { mirrorStore } from "./store";
import "./mirror.css";

const toaster = createToaster();

const SIZE_OPTIONS = [
  { value: "0", label: "原始" },
  { value: "640", label: "640" },
  { value: "1024", label: "1024" },
  { value: "1280", label: "1280" },
  { value: "1920", label: "1920" },
];

const RATE_OPTIONS = [
  { value: "1000000", label: "1 Mbps" },
  { value: "2000000", label: "2 Mbps" },
  { value: "4000000", label: "4 Mbps" },
  { value: "8000000", label: "8 Mbps" },
  { value: "16000000", label: "16 Mbps" },
];

const FPS_OPTIONS = [
  { value: "0", label: "不限" },
  { value: "15", label: "15 fps" },
  { value: "30", label: "30 fps" },
  { value: "60", label: "60 fps" },
  { value: "120", label: "120 fps" },
];

const PROTOCOL_OPTIONS = [
  { value: "usb", label: "USB" },
  { value: "wifi", label: "无线" },
];

type DeviceOp = { icon: IconName; title: string; keycode: number };

const NAV_OPS: DeviceOp[] = [
  { icon: "nav-back", title: "返回", keycode: AndroidKey.Back },
  { icon: "nav-home", title: "Home", keycode: AndroidKey.Home },
  { icon: "nav-recent", title: "多任务", keycode: AndroidKey.AppSwitch },
  { icon: "volume-down", title: "音量-", keycode: AndroidKey.VolumeDown },
  { icon: "volume-up", title: "音量+", keycode: AndroidKey.VolumeUp },
  { icon: "nav-power", title: "电源", keycode: AndroidKey.Power },
];

const BRIGHTNESS_OPS: DeviceOp[] = [
  { icon: "brightness-down", title: "亮度-", keycode: AndroidKey.BrightnessDown },
  { icon: "brightness-up", title: "亮度+", keycode: AndroidKey.BrightnessUp },
];

function withCurrentOption(
  options: { value: string; label: string }[],
  current: number,
  labelOf: (n: number) => string,
): { value: string; label: string }[] {
  const value = String(current);
  if (options.some((item) => item.value === value)) return options;
  return [{ value, label: labelOf(current) }, ...options];
}

function ipcMessage(error: unknown): string {
  return errorText(error);
}

function shutdownLayout(): Parameters<typeof mirrorStore.syncLayout>[0] {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    visible: false,
    dpr: 1,
    fullscreen: false,
    paused: false,
    control: false,
    has_device: false,
    failed: false,
    error: "",
    dark: false,
  };
}

export function MirrorView(props: DeviceSession) {
  let avail: HTMLDivElement | undefined;
  let zoneObserver: ResizeObserver | undefined;
  let layoutRaf = 0;
  let layoutVisible: boolean | undefined;
  let lastInsetKey = "";
  const [pendingNight, setPendingNight] = createSignal<boolean | null>(null);
  const sessionNight = (): boolean | null => {
    const serial = props.selectedSerials[0];
    if (!serial) return null;
    return props.deviceStatuses[serial]?.night ?? null;
  };
  const deviceNight = (): boolean | null => pendingNight() ?? sessionNight();
  function pushLayout(visible?: boolean): void {
    if (visible !== undefined) layoutVisible = visible;
    if (layoutRaf !== 0) return;
    layoutRaf = window.requestAnimationFrame(() => {
      layoutRaf = 0;
      if (!avail) return;
      const zone = avail.getBoundingClientRect();
      const vv = window.visualViewport;
      const dpr = window.devicePixelRatio || 1;
      const rect = clientZoneRect(zone, dpr, { left: vv?.offsetLeft ?? 0, top: vv?.offsetTop ?? 0 });
      const hiding = layoutVisible === false;
      if (!hiding && !layoutIsPresentable(rect.width, rect.height)) {
        return;
      }
      const phase = mirrorStore.state.phase;
      const live = phase === "live";
      const hasFrame = mirrorStore.state.hasFrame;
      const visibleNow = layoutVisible !== false;
      const control = live && hasFrame && !mirrorStore.state.readOnly && mirrorStore.state.control;
      const hasDevice = props.selectedSerials.length > 0;
      const failed = phase === "failed";
      const error = mirrorStore.state.error ?? "";
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      const fullscreen = mirrorStore.state.fullscreen;
      const paused = mirrorStore.state.paused;
      const insetKey = `${props.selectedSerials[0] ?? ""},${rect.x},${rect.y},${rect.width}x${rect.height},v=${visibleNow},dpr=${dpr},f=${fullscreen},p=${paused},c=${control},dev=${hasDevice},fail=${failed},e=${error},dark=${dark}`;
      if (insetKey === lastInsetKey) return;
      lastInsetKey = insetKey;
      void mirrorStore.syncLayout({
        ...rect,
        visible: visibleNow,
        dpr,
        fullscreen,
        paused,
        control,
        has_device: hasDevice,
        failed,
        error,
        dark,
      });
    });
  }

  onMount(() => {
    mirrorStore.applySettings(props.settings);
    if (avail) {
      zoneObserver = new ResizeObserver(() => {
        pushLayout();
      });
      zoneObserver.observe(avail);
    }
    window.addEventListener("scroll", onWin, true);
    window.addEventListener("keydown", onEsc);
    document.addEventListener("visibilitychange", onVis);
  });
  onCleanup(() => {
    if (layoutRaf !== 0) window.cancelAnimationFrame(layoutRaf);
    zoneObserver?.disconnect();
    window.removeEventListener("scroll", onWin, true);
    window.removeEventListener("keydown", onEsc);
    document.removeEventListener("visibilitychange", onVis);
    lastInsetKey = "";
    void mirrorStore.syncLayout(shutdownLayout());
  });

  function onWin(): void {
    pushLayout();
  }
  function onVis(): void {
    pushLayout(document.visibilityState === "visible");
  }
  function onEsc(e: KeyboardEvent): void {
    if (e.key !== "Escape" || !mirrorStore.state.fullscreen) return;
    e.preventDefault();
    mirrorStore.setFullscreen(false);
  }

  createEffect(() => {
    const serial = props.selectedSerials[0] ?? null;
    void mirrorStore.bindSerial(serial);
    mirrorStore.bindConnection(props.selectedDevices[0]?.connection ?? "usb");
  });

  createEffect(() => {
    void props.selectedSerials[0];
    setPendingNight(null);
  });

  createEffect(() => {
    const hub = sessionNight();
    const pending = pendingNight();
    if (pending !== null && hub === pending) setPendingNight(null);
  });

  createEffect(() => {
    mirrorStore.applySettings(props.settings);
  });

  createEffect(() => {
    const _phase = mirrorStore.state.phase;
    const _paused = mirrorStore.state.paused;
    const _full = mirrorStore.state.fullscreen;
    const _has = mirrorStore.state.hasFrame;
    const _ro = mirrorStore.state.readOnly;
    const _ctrl = mirrorStore.state.control;
    const _err = mirrorStore.state.error;
    const _serial = props.selectedSerials[0];
    void _phase;
    void _paused;
    void _full;
    void _has;
    void _ro;
    void _ctrl;
    void _err;
    void _serial;
    pushLayout(document.visibilityState === "visible");
  });

  const live = () => mirrorStore.state.phase === "live";
  const canControl = () => live() && mirrorStore.state.hasFrame && !mirrorStore.state.readOnly && mirrorStore.state.control;

  async function tapKey(keycode: number): Promise<void> {
    await mirrorStore.inject({ kind: "key", keycode, down: true });
    await mirrorStore.inject({ kind: "key", keycode, down: false });
  }

  async function runOp(op: DeviceOp): Promise<void> {
    await tapKey(op.keycode);
  }

  async function toggleDeviceNight(): Promise<void> {
    const serial = props.selectedSerials[0];
    const current = deviceNight();
    if (!serial || current === null) return;
    const next = !current;
    setPendingNight(next);
    try {
      await deviceSetNightMode(serial, next);
    } catch (e) {
      setPendingNight(null);
      toaster.show(`切换设备深浅色失败: ${ipcMessage(e)}`, "error");
    }
  }

  async function screenshot(): Promise<void> {
    try {
      await mirrorStore.saveScreenshot();
      toaster.show("截图已保存", "success");
    } catch (e) {
      toaster.show(`保存失败: ${ipcMessage(e)}`, "error");
    }
  }

  return (
    <YoPage class={`yohu-mirror${mirrorStore.state.fullscreen ? " yohu-mirror--full" : ""}`}>
      <YoChrome title="投屏显示" deviceLabel={props.selectedLabel ?? undefined}>
        <YoButton
          size="sm"
          variant="primary"
          disabled={!props.selectedSerials[0] || mirrorStore.state.phase === "starting"}
          loading={mirrorStore.state.phase === "starting"}
          onClick={() => {
            if (live()) void mirrorStore.stop();
            else void mirrorStore.start();
          }}
        >
          {live() ? "停止" : "开始"}
        </YoButton>
        <YoIconButton
          icon={mirrorStore.state.paused ? "play" : "pause"}
          title={mirrorStore.state.paused ? "继续" : "暂停画面"}
          disabled={!live()}
          onClick={() => mirrorStore.setPaused(!mirrorStore.state.paused)}
        />
        <YoIconButton
          icon="export"
          title="截图"
          disabled={!live() || !mirrorStore.state.hasFrame}
          onClick={() => void screenshot()}
        />
        <YoIconButton
          icon={mirrorStore.state.fullscreen ? "window-restore" : "window-max"}
          title={mirrorStore.state.fullscreen ? "退出全屏" : "面板内全屏"}
          disabled={!live()}
          onClick={() => mirrorStore.setFullscreen(!mirrorStore.state.fullscreen)}
        />
        <YoButton
          size="sm"
          variant={mirrorStore.state.readOnly ? "primary" : "secondary"}
          aria-pressed={mirrorStore.state.readOnly}
          disabled={!props.selectedSerials[0] || mirrorStore.state.phase === "starting"}
          onClick={() => void mirrorStore.setReadOnly(!mirrorStore.state.readOnly)}
        >
          仅显示
        </YoButton>
      </YoChrome>

      <div class="yohu-mirror__body">
        <div class="yohu-mirror__stage" aria-label="投屏画面">
          <div
            ref={(el) => {
              avail = el;
            }}
            class="yohu-mirror__avail"
          >
            <div class="yohu-mirror__hole" aria-hidden="true" />
          </div>
        </div>

        <YoPanel class="yohu-mirror__ops" variant="pane" padding="none" aria-label="设备操作">
          <For each={NAV_OPS}>
            {(op) => (
              <YoIconButton
                icon={op.icon}
                title={op.title}
                size={Layout.IconMd}
                disabled={!canControl()}
                onClick={() => void runOp(op)}
              />
            )}
          </For>
          <YoIconButton
            icon={deviceNight() === true ? "display-off" : "display-on"}
            title={
              deviceNight() === null ? "设备深浅色" : deviceNight() === true ? "设备深色" : "设备浅色"
            }
            size={Layout.IconMd}
            pressed={deviceNight() === true}
            disabled={!props.selectedSerials[0] || deviceNight() === null}
            onClick={() => void toggleDeviceNight()}
          />
          <For each={BRIGHTNESS_OPS}>
            {(op) => (
              <YoIconButton
                icon={op.icon}
                title={op.title}
                size={Layout.IconMd}
                disabled={!canControl()}
                onClick={() => void runOp(op)}
              />
            )}
          </For>
        </YoPanel>

        <YoPanel class="yohu-mirror__func" variant="pane" padding="md" aria-label="投屏功能栏">
          <div class="yohu-mirror__group" title="下次开始生效">
            <div class="yohu-mirror__group-label">质量</div>
            <label class="yohu-mirror__field">
              <span class="yohu-mirror__field-name">投屏协议</span>
              <YoSelect
                block
                options={PROTOCOL_OPTIONS}
                value={mirrorStore.state.protocol}
                disabled={mirrorStore.state.phase === "starting"}
                onChange={(v) => void mirrorStore.persistQuality("mirror_protocol", v as "usb" | "wifi")}
              />
            </label>
            <label class="yohu-mirror__field">
              <span class="yohu-mirror__field-name">长边</span>
              <YoSelect
                block
                options={withCurrentOption(SIZE_OPTIONS, mirrorStore.state.maxSize, (n) =>
                  n === 0 ? "原始" : String(n),
                )}
                value={String(mirrorStore.state.maxSize)}
                disabled={mirrorStore.state.phase === "starting"}
                onChange={(v) => void mirrorStore.persistQuality("mirror_max_size", Number.parseInt(v, 10))}
              />
            </label>
            <label class="yohu-mirror__field">
              <span class="yohu-mirror__field-name">码率</span>
              <YoSelect
                block
                options={withCurrentOption(RATE_OPTIONS, mirrorStore.state.videoBitRate, (n) =>
                  n >= 1_000_000 ? `${n / 1_000_000} Mbps` : `${n} bps`,
                )}
                value={String(mirrorStore.state.videoBitRate)}
                disabled={mirrorStore.state.phase === "starting"}
                onChange={(v) => void mirrorStore.persistQuality("mirror_video_bit_rate", Number.parseInt(v, 10))}
              />
            </label>
            <label class="yohu-mirror__field">
              <span class="yohu-mirror__field-name">帧率</span>
              <YoSelect
                block
                options={withCurrentOption(FPS_OPTIONS, mirrorStore.state.maxFps, (n) =>
                  n === 0 ? "不限" : `${n} fps`,
                )}
                value={String(mirrorStore.state.maxFps)}
                disabled={mirrorStore.state.phase === "starting"}
                onChange={(v) => void mirrorStore.persistQuality("mirror_max_fps", Number.parseInt(v, 10))}
              />
            </label>
          </div>
        </YoPanel>
      </div>
      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
