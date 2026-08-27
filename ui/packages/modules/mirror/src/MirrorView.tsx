/**
 * 投屏主视图：设备画面嵌在 YoPanel；解码在 WebCodecs。
 */

import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import {
  dialogSaveFile,
  mirrorSavePng,
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

import { H264CanvasDecoder } from "./decoder";
import { AndroidKey, TOUCH_DOWN, TOUCH_MOVE, TOUCH_UP } from "./keys";
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
];

const FPS_OPTIONS = [
  { value: "0", label: "不限" },
  { value: "15", label: "15 fps" },
  { value: "30", label: "30 fps" },
  { value: "60", label: "60 fps" },
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
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return String(error);
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
  const decoder = new H264CanvasDecoder();
  let canvas: HTMLCanvasElement | undefined;
  const [pressing, setPressing] = createSignal(false);

  onMount(() => {
    mirrorStore.bindDecoder(decoder);
    if (canvas) decoder.attach(canvas);
    mirrorStore.applySettings(props.settings);
  });
  onCleanup(() => {
    mirrorStore.bindDecoder(null);
    decoder.reset();
  });

  createEffect(() => {
    const serial = props.selectedSerials[0] ?? null;
    void mirrorStore.bindSerial(serial);
  });

  createEffect(() => {
    const width = mirrorStore.state.width;
    const height = mirrorStore.state.height;
    if (!canvas || width < 1 || height < 1) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  });

  const live = () => mirrorStore.state.phase === "live";
  const waiting = () => {
    const phase = mirrorStore.state.phase;
    return phase === "starting" || (phase === "live" && !mirrorStore.state.hasFrame);
  };
  const canControl = () => live() && mirrorStore.state.hasFrame && !mirrorStore.state.readOnly && mirrorStore.state.control;

  function videoPoint(event: PointerEvent): { x: number; y: number; width: number; height: number } | null {
    if (!canvas) return null;
    const width = mirrorStore.state.width || canvas.width;
    const height = mirrorStore.state.height || canvas.height;
    if (!width || !height) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const x = Math.max(0, Math.min(width, Math.round(((event.clientX - rect.left) / rect.width) * width)));
    const y = Math.max(0, Math.min(height, Math.round(((event.clientY - rect.top) / rect.height) * height)));
    return { x, y, width, height };
  }

  function sendTouch(action: number, event: PointerEvent): void {
    if (!canControl()) return;
    const point = videoPoint(event);
    if (!point) return;
    void mirrorStore.inject({
      kind: "touch",
      action,
      x: point.x,
      y: point.y,
      width: point.width,
      height: point.height,
    });
  }

  async function tapKey(keycode: number): Promise<void> {
    await mirrorStore.inject({ kind: "key", keycode, down: true });
    await mirrorStore.inject({ kind: "key", keycode, down: false });
  }

  async function send(message: MirrorControlMessage): Promise<void> {
    await mirrorStore.inject(message);
  }

  async function screenshot(): Promise<void> {
    const data = decoder.snapshotPng();
    if (!data) {
      toaster.show("当前没有可保存的画面", "error");
      return;
    }
    const path = await dialogSaveFile({
      title: "保存截图",
      defaultPath: "mirror.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (!path) return;
    try {
      await mirrorSavePng({ path, data_b64: data });
      toaster.show("截图已保存", "success");
    } catch (e) {
      toaster.show(`保存失败: ${ipcMessage(e)}`, "error");
    }
  }

  const painted = () => live() && mirrorStore.state.hasFrame;

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
        <YoPanel variant="pane" class="yohu-mirror__panel" aria-label="投屏画面">
          <div class="yohu-mirror__stage">
            <canvas
              ref={(el) => {
                canvas = el;
                decoder.attach(el);
              }}
              class="yohu-mirror__canvas"
              classList={{ "yohu-mirror__canvas--hidden": !painted() }}
              onPointerDown={(event) => {
                if (!canControl()) return;
                (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
                setPressing(true);
                sendTouch(TOUCH_DOWN, event);
              }}
              onPointerMove={(event) => {
                if (!pressing()) return;
                sendTouch(TOUCH_MOVE, event);
              }}
              onPointerUp={(event) => {
                if (!pressing()) return;
                setPressing(false);
                sendTouch(TOUCH_UP, event);
              }}
              onContextMenu={(event) => event.preventDefault()}
            />
            <Show when={waiting()}>
              <YoLoading
                cover
                title={waitingCopy(mirrorStore.state.phase).title}
                description={waitingCopy(mirrorStore.state.phase).description}
              />
            </Show>
            <Show when={!live() && !waiting()}>
              <YoEmptyState
                icon="mirror"
                title={emptyCopy(mirrorStore.state.phase, props.selectedSerials.length > 0, mirrorStore.state.error).title}
                description={
                  emptyCopy(mirrorStore.state.phase, props.selectedSerials.length > 0, mirrorStore.state.error)
                    .description
                }
              />
            </Show>
          </div>
        </YoPanel>

        <YoPanel class="yohu-mirror__func" variant="pane" padding="md" aria-label="投屏功能栏">
          <div class="yohu-mirror__group" title="下次开始生效">
            <div class="yohu-mirror__group-label">质量</div>
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
            <label class="yohu-mirror__toggle" title="下次开始生效">
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
