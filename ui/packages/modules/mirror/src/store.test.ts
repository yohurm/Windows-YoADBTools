import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mirrorStart: vi.fn(),
  mirrorStop: vi.fn(),
  mirrorInject: vi.fn(),
  mirrorCloseControl: vi.fn(),
  mirrorLayout: vi.fn(),
  mirrorScreenshot: vi.fn(),
  deviceSetNightMode: vi.fn(),
  settingsSet: vi.fn(),
  dialogSaveFile: vi.fn(),
  stateHandlers: [] as ((e: {
    serial: string;
    generation: number;
    state: string;
    width: number;
    height: number;
    codec: string;
    control: boolean;
    error?: string;
  }) => void)[],
  paintedHandlers: [] as ((e: { serial: string; generation: number; painted_fps: number }) => void)[],
  offlineHandlers: [] as ((e: { serial: string }) => void)[],
}));

vi.mock("@yohu/api", () => ({
  APP_SETTINGS_DEFAULT: {
    mirror_max_size: 0,
    mirror_video_bit_rate: 16_000_000,
    mirror_max_fps: 0,
    mirror_protocol: "usb",
    mirror_force_forward: false,
  },
  errorText: (e: unknown) => String(e),
  mirrorStart: (...a: unknown[]) => mocks.mirrorStart(...a),
  mirrorStop: (...a: unknown[]) => mocks.mirrorStop(...a),
  mirrorInject: (...a: unknown[]) => mocks.mirrorInject(...a),
  mirrorCloseControl: (...a: unknown[]) => mocks.mirrorCloseControl(...a),
  mirrorLayout: (...a: unknown[]) => mocks.mirrorLayout(...a),
  mirrorScreenshot: (...a: unknown[]) => mocks.mirrorScreenshot(...a),
  deviceSetNightMode: (...a: unknown[]) => mocks.deviceSetNightMode(...a),
  settingsSet: (...a: unknown[]) => mocks.settingsSet(...a),
  dialogSaveFile: (...a: unknown[]) => mocks.dialogSaveFile(...a),
  onMirrorState: (h: (typeof mocks.stateHandlers)[0]) => {
    mocks.stateHandlers.push(h);
  },
  onMirrorPainted: (h: (typeof mocks.paintedHandlers)[0]) => {
    mocks.paintedHandlers.push(h);
  },
  onDeviceOffline: (h: (typeof mocks.offlineHandlers)[0]) => {
    mocks.offlineHandlers.push(h);
  },
  YoLog: { info: () => undefined, warn: () => undefined, error: () => undefined },
}));

describe("mirror store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.mirrorStart.mockReset();
    mocks.mirrorStop.mockReset();
    mocks.mirrorInject.mockReset();
    mocks.mirrorCloseControl.mockReset();
    mocks.mirrorLayout.mockReset();
    mocks.mirrorLayout.mockResolvedValue(undefined);
    mocks.mirrorScreenshot.mockReset();
    mocks.deviceSetNightMode.mockReset();
    mocks.settingsSet.mockReset();
    mocks.dialogSaveFile.mockReset();
    mocks.settingsSet.mockResolvedValue({
      mirror_max_size: 0,
      mirror_video_bit_rate: 16_000_000,
      mirror_max_fps: 0,
      mirror_protocol: "usb",
      mirror_force_forward: false,
    });
    mocks.stateHandlers.length = 0;
    mocks.paintedHandlers.length = 0;
    mocks.offlineHandlers.length = 0;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("无设备时 start 为空操作；绑定后 start 只传请求", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.start();
    expect(mocks.mirrorStart).not.toHaveBeenCalled();
    await store.bindSerial("S1");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(mocks.mirrorStart.mock.calls[0]?.[0]).toEqual({
      serial: "S1",
      control: true,
      connection: "usb",
      session_quality_touched: false,
    });
    expect(mocks.mirrorStart.mock.calls[0]?.length).toBe(1);
    const onState = mocks.stateHandlers.at(-1)!;
    onState({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h265",
      control: false,
    });
    expect(store.state.phase).toBe("live");
    expect(store.state.width).toBe(1080);
    expect(store.state.hasFrame).toBe(false);
  });

  it("Live 不等于已出画；mirror/painted 才置 hasFrame", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(store.state.hasFrame).toBe(false);
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h265",
      control: false,
    });
    expect(store.state.hasFrame).toBe(false);
    mocks.paintedHandlers.at(-1)!({ serial: "S1", generation: 1, painted_fps: 42 });
    expect(store.state.hasFrame).toBe(true);
    expect(store.state.paintedFps).toBe(42);
  });

  it("掉线清空当前设备画面状态，保留编码尺寸", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 2,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h264",
      control: true,
    });
    mocks.offlineHandlers.at(-1)!({ serial: "S1" });
    expect(store.state.phase).toBe("idle");
    expect(store.state.error).toBe("设备已掉线");
    expect(store.state.width).toBe(1080);
    expect(store.state.height).toBe(1920);
  });

  it("applySettings 不进入 start 负载；persistQuality 后 session_quality_touched 为 true", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    store.applySettings({
      mirror_max_size: 0,
      mirror_video_bit_rate: 16_000_000,
      mirror_max_fps: 0,
      mirror_protocol: "usb",
    });
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(mocks.mirrorStart.mock.calls[0]?.[0]).toEqual({
      serial: "S1",
      control: true,
      connection: "usb",
      session_quality_touched: false,
    });
    await store.persistQuality("mirror_max_size", 1280);
    await store.start();
    expect(mocks.mirrorStart.mock.calls[1]?.[0]).toEqual({
      serial: "S1",
      control: true,
      connection: "usb",
      session_quality_touched: true,
    });
  });

  it("tcp 连接自动 wifi 档并默认 forward", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    store.bindConnection("tcp:192.168.1.8:5555");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(mocks.mirrorStart.mock.calls[0]?.[0]).toEqual({
      serial: "S1",
      control: true,
      connection: "tcp:192.168.1.8:5555",
      session_quality_touched: false,
    });
  });

  it("adopt 不再 stop+restart", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 3, adopted: true });
    await store.start();
    expect(mocks.mirrorStop).not.toHaveBeenCalled();
    expect(mocks.mirrorStart).toHaveBeenCalledTimes(1);
  });

  it("会话进行中忽略空 serial，避免误停", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h265",
      control: false,
    });
    await store.bindSerial(null);
    expect(mocks.mirrorStop).not.toHaveBeenCalled();
    expect(store.state.serial).toBe("S1");
    expect(store.state.phase).toBe("live");
  });

  it("saveScreenshot 走 dialog 再 mirror.screenshot", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.dialogSaveFile.mockResolvedValue("/x/mirror.png");
    mocks.mirrorScreenshot.mockResolvedValue(undefined);
    await store.saveScreenshot();
    expect(mocks.dialogSaveFile).toHaveBeenCalledWith({
      title: "保存截图",
      defaultPath: "mirror.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    expect(mocks.mirrorScreenshot).toHaveBeenCalledWith({
      serial: "S1",
      path: "/x/mirror.png",
    });
  });

    it("saveScreenshot 取消时不写盘", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.dialogSaveFile.mockResolvedValue(null);
    await store.saveScreenshot();
    expect(mocks.mirrorScreenshot).not.toHaveBeenCalled();
  });

  it("仅显示启动不打开控制通道", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    await store.setReadOnly(true);
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(mocks.mirrorStart.mock.calls[0]?.[0]).toEqual({
      serial: "S1",
      control: false,
      connection: "usb",
      session_quality_touched: false,
    });
  });

  it("Live 只读只 closeControl，失败不上重启", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    await store.setReadOnly(false);
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h265",
      control: true,
    });
    mocks.mirrorCloseControl.mockRejectedValueOnce(new Error("NotLive"));
    await expect(store.setReadOnly(true)).rejects.toThrow("NotLive");
    expect(mocks.mirrorStop).not.toHaveBeenCalled();
    expect(store.state.readOnly).toBe(false);
  });

  it("idle 仍上报 layout", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    store.syncLayout({
      x: 10,
      y: 20,
      width: 300,
      height: 600,
      visible: true,
      dpr: 1,
      fullscreen: false,
      paused: false,
      control: false,
      has_device: true,
      failed: false,
      error: "",
      dark: false,
    });
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).toMatchObject({
      serial: "S1",
      visible: true,
      dpr: 1,
      fullscreen: false,
      paused: false,
      control: false,
      has_device: true,
      failed: false,
      error: "",
      dark: false,
    });
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("video_width");
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("mode");
  });

  it("layout 只抄占用字段，不含编码尺寸", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    store.syncLayout({
      x: 10,
      y: 20,
      width: 300,
      height: 600,
      visible: true,
      dpr: 1.5,
      fullscreen: true,
      paused: true,
      control: false,
      has_device: true,
      failed: false,
      error: "",
      dark: true,
    });
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).toMatchObject({
      serial: "S1",
      dpr: 1.5,
      fullscreen: true,
      paused: true,
      control: false,
      has_device: true,
      failed: false,
      dark: true,
    });
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("video_width");
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("video_height");
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("stroke_px");
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("corner_radius");
  });

  it("setDeviceNight 走 device.setNightMode", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    mocks.deviceSetNightMode.mockResolvedValue({ serial: "S1", night: true });
    await store.setDeviceNight("S1", true);
    expect(mocks.deviceSetNightMode).toHaveBeenCalledWith("S1", true);
  });

  it("停止保留编码尺寸", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    mocks.mirrorStop.mockResolvedValue(undefined);
    await store.start();
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h265",
      control: true,
    });
    await store.stop();
    expect(store.state.phase).toBe("idle");
    expect(store.state.hasFrame).toBe(false);
    expect(store.state.width).toBe(1080);
    expect(store.state.height).toBe(1920);
  });

  it("bindSerial 与 stopped 事件不得把宽高清零", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1088,
      height: 2400,
      codec: "h265",
      control: true,
    });
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "stopped",
      width: 0,
      height: 0,
      codec: "",
      control: false,
    });
    expect(store.state.width).toBe(1088);
    expect(store.state.height).toBe(2400);
    await store.bindSerial("S2");
    expect(store.state.serial).toBe("S2");
    expect(store.state.phase).toBe("idle");
    expect(store.state.width).toBe(1088);
    expect(store.state.height).toBe(2400);
  });
});
