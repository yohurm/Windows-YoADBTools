/**
 * 投屏主视图：YoPanel 透明占位；画面在壳 HWND 上。
 */

import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import {
  errorText,
  type DeviceSession,
  type MirrorControlMessage,
} from "@yohu/api";
import {
  Layout,
  Radius,
  Stroke,
  YoButton,
  YoChrome,
  YoEmptyState,
  YoIconButton,
  YoLoading,
  YoPage,
  YoPanel,
  YoSelect,
  YoSwitch,
  YoToaster,
  createToaster,
  type IconName,
} from "@yohu/ui";

import { frameStyle } from "./frame";
import { AndroidKey } from "./keys";
import { clientZoneRect, layoutIsPresentable, physicalCornerRadius, zoneInsetKey } from "./layout";
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

type DeviceOp =
  | { icon: IconName; title: string; keycode: number }
  | { icon: IconName; title: string; display: boolean };

const DEVICE_OPS: DeviceOp[] = [
  { icon: "nav-back", title: "返回", keycode: AndroidKey.Back },
  { icon: "nav-home", title: "Home", keycode: AndroidKey.Home },
  { icon: "nav-recent", title: "多任务", keycode: AndroidKey.AppSwitch },
  { icon: "volume-down", title: "音量-", keycode: AndroidKey.VolumeDown },
  { icon: "volume-up", title: "音量+", keycode: AndroidKey.VolumeUp },
  { icon: "nav-power", title: "电源", keycode: AndroidKey.Power },
  { icon: "display-off", title: "息屏", display: false },
  { icon: "display-on", title: "亮屏", display: true },
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

function emptyCopy(phase: string, hasDevice: boolean, error: string | null): { title: string; description?: string } {
  if (!hasDevice) return { title: "未选择设备", description: "在左侧设备栏选择一台在线设备" };
  if (error) return { title: phase === "failed" ? "启动失败" : "已停止", description: error };
  return { title: "未开始", description: "点击开始将画面嵌在此面板内" };
}

function waitingCopy(phase: string): { title: string; description: string } {
  if (phase === "starting") return { title: "启动中", description: "正在推送 server 并建立隧道" };
  return { title: "等待画面", description: "设备正在准备编码器，画面到达前请稍候" };
}

export function MirrorView(props: DeviceSession) {
  let stage: HTMLDivElement | undefined;
  let avail: HTMLDivElement | undefined;
  let zoneObserver: ResizeObserver | undefined;
  let layoutRaf = 0;
  let layoutVisible: boolean | undefined;
  let lastInsetKey = "";
  const [zoneSize, setZoneSize] = createSignal<{ w: number; h: number }>({ w: 0, h: 0 });

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
      const cssRadius = mirrorStore.state.fullscreen ? Radius.None : Math.max(0, Radius.Md - Stroke.Hairline);
      const radius = physicalCornerRadius(cssRadius, dpr);
      const clientW = Math.round((document.documentElement.clientWidth || window.innerWidth) * dpr);
      const clientH = Math.round((document.documentElement.clientHeight || window.innerHeight) * dpr);
      const insetKey = zoneInsetKey(rect, clientW, clientH, layoutVisible !== false, radius);
      if (insetKey === lastInsetKey) return;
      lastInsetKey = insetKey;
      void mirrorStore.syncLayout({
        ...rect,
        visible: layoutVisible,
        corner_radius: radius,
      });
    });
  }

  onMount(() => {
    mirrorStore.applySettings(props.settings);
    if (avail) {
      zoneObserver = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect) setZoneSize({ w: rect.width, h: rect.height });
        pushLayout();
      });
      zoneObserver.observe(avail);
    }
    window.addEventListener("scroll", onWin, true);
    document.addEventListener("visibilitychange", onVis);
  });
  onCleanup(() => {
    if (layoutRaf !== 0) window.cancelAnimationFrame(layoutRaf);
    zoneObserver?.disconnect();
    window.removeEventListener("scroll", onWin, true);
    document.removeEventListener("visibilitychange", onVis);
    lastInsetKey = "";
    const serial = mirrorStore.state.serial;
    if (serial) {
      void mirrorStore.syncLayout({ x: 0, y: 0, width: 0, height: 0, visible: false, corner_radius: 0 });
    }
  });

  function onWin(): void {
    pushLayout();
  }
  function onVis(): void {
    pushLayout(document.visibilityState === "visible" && !mirrorStore.state.paused);
  }

  createEffect(() => {
    const serial = props.selectedSerials[0] ?? null;
    void mirrorStore.bindSerial(serial);
    mirrorStore.bindConnection(props.selectedDevices[0]?.connection ?? "usb");
  });

  createEffect(() => {
    mirrorStore.applySettings(props.settings);
  });

  createEffect(() => {
    const _phase = mirrorStore.state.phase;
    const _paused = mirrorStore.state.paused;
    const _full = mirrorStore.state.fullscreen;
    const _has = mirrorStore.state.hasFrame;
    const _w = mirrorStore.state.width;
    const _h = mirrorStore.state.height;
    const _ro = mirrorStore.state.readOnly;
    const _ctrl = mirrorStore.state.control;
    void _phase;
    void _paused;
    void _full;
    void _has;
    void _w;
    void _h;
    void _ro;
    void _ctrl;
    pushLayout(!_paused && (_phase === "live" || _phase === "starting"));
  });

  const live = () => mirrorStore.state.phase === "live";
  const waiting = () => {
    const phase = mirrorStore.state.phase;
    return phase === "starting" || (phase === "live" && !mirrorStore.state.hasFrame);
  };
  const canControl = () => live() && mirrorStore.state.hasFrame && !mirrorStore.state.readOnly && mirrorStore.state.control;
  const panelVars = () =>
    frameStyle(zoneSize().w, zoneSize().h, mirrorStore.state.width, mirrorStore.state.height, mirrorStore.state.phase);
  const hugFrame = () => panelVars().length > 0;

  async function tapKey(keycode: number): Promise<void> {
    await mirrorStore.inject({ kind: "key", keycode, down: true });
    await mirrorStore.inject({ kind: "key", keycode, down: false });
  }

  async function send(message: MirrorControlMessage): Promise<void> {
    await mirrorStore.inject(message);
  }

  async function runOp(op: DeviceOp): Promise<void> {
    if ("display" in op) {
      await send({ kind: "display_power", on: op.display });
      return;
    }
    await tapKey(op.keycode);
  }

  async function screenshot(): Promise<void> {
    try {
      await mirrorStore.saveScreenshot();
      toaster.show("截图已保存", "success");
    } catch (e) {
      toaster.show(`保存失败: ${ipcMessage(e)}`, "error");
    }
  }

  const painted = () => live() && mirrorStore.state.hasFrame && !mirrorStore.state.paused;

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
        <div class="yohu-mirror__panel-zone">
          <div
            ref={(el) => {
              avail = el;
            }}
            class="yohu-mirror__avail"
            style={panelVars()}
          >
          <YoPanel
            variant="pane"
            class={`yohu-mirror__panel${hugFrame() ? " yohu-mirror__panel--hug" : ""}`}
            aria-label="投屏画面"
          >
            <div
              ref={(el) => {
                stage = el;
              }}
              class="yohu-mirror__stage"
            >
              <div class="yohu-mirror__hole" aria-hidden="true" />
              <Show when={!painted()}>
                <div class="yohu-mirror__overlay">
                  <Show
                    when={waiting() && !mirrorStore.state.paused}
                    fallback={
                      <YoEmptyState
                        icon="mirror"
                        title={
                          mirrorStore.state.paused
                            ? "已暂停"
                            : emptyCopy(mirrorStore.state.phase, props.selectedSerials.length > 0, mirrorStore.state.error).title
                        }
                        description={
                          mirrorStore.state.paused
                            ? "画面已隐藏，点击继续"
                            : emptyCopy(mirrorStore.state.phase, props.selectedSerials.length > 0, mirrorStore.state.error)
                                .description
                        }
                      />
                    }
                  >
                    <YoLoading
                      title={waitingCopy(mirrorStore.state.phase).title}
                      description={waitingCopy(mirrorStore.state.phase).description}
                    />
                  </Show>
                </div>
              </Show>
            </div>
          </YoPanel>
          </div>
        </div>

        <YoPanel class="yohu-mirror__ops" variant="pane" padding="none" aria-label="设备操作">
          <For each={DEVICE_OPS}>
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

          <div class="yohu-mirror__group">
            <div class="yohu-mirror__group-label">通道</div>
            <label class="yohu-mirror__toggle" title="无线调试（tcp:）开始时默认转发，不必手开">
              <span class="yohu-mirror__field-name">强制转发</span>
              <YoSwitch
                ariaLabel="强制 ADB forward"
                checked={mirrorStore.state.forceForward}
                disabled={mirrorStore.state.phase === "starting"}
                onChange={(v) => void mirrorStore.persistQuality("mirror_force_forward", v)}
              />
            </label>
          </div>
        </YoPanel>
      </div>
      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
