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
} from "@yohu/ui";

import { frameStyle } from "./frame";
import { AndroidKey } from "./keys";
import { physicalPanelRect } from "./layout";
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

const NAV_KEYS: { label: string; keycode: number }[] = [
  { label: "Home", keycode: AndroidKey.Home },
  { label: "返回", keycode: AndroidKey.Back },
  { label: "多任务", keycode: AndroidKey.AppSwitch },
  { label: "电源", keycode: AndroidKey.Power },
  { label: "音量+", keycode: AndroidKey.VolumeUp },
  { label: "音量-", keycode: AndroidKey.VolumeDown },
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
  let panelZone: HTMLDivElement | undefined;
  let zoneObserver: ResizeObserver | undefined;
  let stageObserver: ResizeObserver | undefined;
  let layoutRaf = 0;
  let layoutVisible: boolean | undefined;
  let originTimer = 0;
  let lastOriginX = Number.NaN;
  let lastOriginY = Number.NaN;
  const [zoneSize, setZoneSize] = createSignal<{ w: number; h: number }>({ w: 0, h: 0 });

  function pushLayout(visible?: boolean): void {
    if (visible !== undefined) layoutVisible = visible;
    if (layoutRaf !== 0) return;
    layoutRaf = window.requestAnimationFrame(() => {
      layoutRaf = 0;
      if (!stage) return;
      const css = stage.getBoundingClientRect();
      const vv = window.visualViewport;
      lastOriginX = window.screenX;
      lastOriginY = window.screenY;
      const rect = physicalPanelRect(
        css,
        window.screenX,
        window.screenY,
        window.devicePixelRatio || 1,
        { left: vv?.offsetLeft ?? 0, top: vv?.offsetTop ?? 0 },
      );
      void mirrorStore.syncLayout({ ...rect, visible: layoutVisible });
    });
  }

  onMount(() => {
    mirrorStore.applySettings(props.settings);
    if (panelZone) {
      zoneObserver = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect) setZoneSize({ w: rect.width, h: rect.height });
      });
      zoneObserver.observe(panelZone);
    }
    if (stage) {
      stageObserver = new ResizeObserver(() => {
        pushLayout();
      });
      stageObserver.observe(stage);
    }
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    document.addEventListener("visibilitychange", onVis);
    originTimer = window.setInterval(() => {
      if (window.screenX !== lastOriginX || window.screenY !== lastOriginY) {
        pushLayout();
      }
    }, 50);
  });
  onCleanup(() => {
    if (layoutRaf !== 0) window.cancelAnimationFrame(layoutRaf);
    if (originTimer !== 0) window.clearInterval(originTimer);
    zoneObserver?.disconnect();
    stageObserver?.disconnect();
    window.removeEventListener("resize", onWin);
    window.removeEventListener("scroll", onWin, true);
    document.removeEventListener("visibilitychange", onVis);
    const serial = mirrorStore.state.serial;
    if (serial) {
      void mirrorStore.syncLayout({ x: 0, y: 0, width: 1, height: 1, visible: false });
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
    void _phase;
    void _paused;
    void _full;
    void _has;
    void _w;
    void _h;
    pushLayout(!_paused && (_phase === "live" || _phase === "starting"));
  });

  const live = () => mirrorStore.state.phase === "live";
  const waiting = () => {
    const phase = mirrorStore.state.phase;
    return phase === "starting" || (phase === "live" && !mirrorStore.state.hasFrame);
  };
  const canControl = () => live() && mirrorStore.state.hasFrame && !mirrorStore.state.readOnly && mirrorStore.state.control;

  async function tapKey(keycode: number): Promise<void> {
    await mirrorStore.inject({ kind: "key", keycode, down: true });
    await mirrorStore.inject({ kind: "key", keycode, down: false });
  }

  async function send(message: MirrorControlMessage): Promise<void> {
    await mirrorStore.inject(message);
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
      </YoChrome>

      <div class="yohu-mirror__body">
        <div
          ref={(el) => {
            panelZone = el;
          }}
          class="yohu-mirror__panel-zone"
          style={frameStyle(zoneSize().w, zoneSize().h, mirrorStore.state.width, mirrorStore.state.height, mirrorStore.state.phase)}
        >
          <YoPanel variant="pane" class="yohu-mirror__panel yohu-recipe-mirror-frame" aria-label="投屏画面">
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
            <label class="yohu-mirror__toggle">
              <span class="yohu-mirror__field-name">只读</span>
              <YoSwitch
                ariaLabel="只读（关闭控制通道）"
                checked={mirrorStore.state.readOnly}
                onChange={(v) => void mirrorStore.setReadOnly(v)}
              />
            </label>
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

          <Show when={!mirrorStore.state.readOnly}>
            <div class="yohu-mirror__group">
              <div class="yohu-mirror__group-label">导航</div>
              <div class="yohu-mirror__keys">
                <For each={NAV_KEYS}>
                  {(item) => (
                    <YoButton
                      size="sm"
                      variant="secondary"
                      disabled={!canControl()}
                      onClick={() => void tapKey(item.keycode)}
                    >
                      {item.label}
                    </YoButton>
                  )}
                </For>
                <YoButton
                  size="sm"
                  variant="secondary"
                  disabled={!canControl()}
                  onClick={() => void send({ kind: "display_power", on: false })}
                >
                  息屏
                </YoButton>
                <YoButton
                  size="sm"
                  variant="secondary"
                  disabled={!canControl()}
                  onClick={() => void send({ kind: "display_power", on: true })}
                >
                  亮屏
                </YoButton>
              </div>
            </div>
          </Show>
        </YoPanel>
      </div>
      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
