import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mirrorStart: vi.fn(),
  mirrorStop: vi.fn(),
  mirrorStatus: vi.fn(),
  mirrorInject: vi.fn(),
  mirrorCloseControl: vi.fn(),
  settingsSet: vi.fn(),
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
  packetHandlers: [] as ((e: { serial: string; generation: number }) => void)[],
  offlineHandlers: [] as ((e: { serial: string }) => void)[],
  settingsHandlers: [] as ((e: {
    key: string;
    settings: {
      mirror_max_size: number;
      mirror_video_bit_rate: number;
      mirror_max_fps: number;
      mirror_force_forward: boolean;
    };
  }) => void)[],
}));

vi.mock("@yohu/api", () => ({
  APP_SETTINGS_DEFAULT: {
    mirror_max_size: 1024,
    mirror_video_bit_rate: 2_000_000,
    mirror_max_fps: 30,
    mirror_force_forward: false,
  },
  mirrorStart: (...a: unknown[]) => mocks.mirrorStart(...a),
  mirrorStop: (...a: unknown[]) => mocks.mirrorStop(...a),
  mirrorStatus: (...a: unknown[]) => mocks.mirrorStatus(...a),
  mirrorInject: (...a: unknown[]) => mocks.mirrorInject(...a),
  mirrorCloseControl: (...a: unknown[]) => mocks.mirrorCloseControl(...a),
  settingsSet: (...a: unknown[]) => mocks.settingsSet(...a),
  onMirrorState: (h: (typeof mocks.stateHandlers)[0]) => {
    mocks.stateHandlers.push(h);
  },
  onMirrorPacket: (h: (typeof mocks.packetHandlers)[0]) => {
    mocks.packetHandlers.push(h);
  },
  onDeviceOffline: (h: (typeof mocks.offlineHandlers)[0]) => {
    mocks.offlineHandlers.push(h);
  },
  onSettingsChanged: (h: (typeof mocks.settingsHandlers)[0]) => {
    mocks.settingsHandlers.push(h);
  },
  YoLog: { info: () => undefined, warn: () => undefined, error: () => undefined },
}));

describe("mirror store", () => {
  beforeEach(() => {
    mocks.mirrorStart.mockReset();
    mocks.mirrorStop.mockReset();
    mocks.mirrorStatus.mockReset();
    mocks.mirrorStatus.mockResolvedValue({
      serial: "S1",
      mirroring: false,
      generation: 0,
      width: 0,
      height: 0,
      codec: "",
      control: false,
    });
    mocks.mirrorInject.mockReset();
    mocks.mirrorCloseControl.mockReset();
    mocks.settingsSet.mockReset();
    mocks.settingsSet.mockResolvedValue({
      mirror_max_size: 1024,
      mirror_video_bit_rate: 2_000_000,
      mirror_max_fps: 30,
      mirror_force_forward: false,
    });
    mocks.stateHandlers.length = 0;
    mocks.packetHandlers.length = 0;
    mocks.offlineHandlers.length = 0;
    mocks.settingsHandlers.length = 0;
  });

  it("无设备时 start 为空操作；绑定后 start 走 IPC", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.start();
    expect(mocks.mirrorStart).not.toHaveBeenCalled();
    await store.bindSerial("S1");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(mocks.mirrorStart).toHaveBeenCalledWith({
      serial: "S1",
      max_size: 1024,
      video_bit_rate: 2_000_000,
      max_fps: 30,
      control: false,
      force_forward: false,
    });
    const onState = mocks.stateHandlers.at(-1)!;
    onState({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h264",
      control: false,
    });
    expect(store.state.phase).toBe("live");
    expect(store.state.width).toBe(1080);
  });

  it("掉线清空当前设备画面状态", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    const onState = mocks.stateHandlers.at(-1)!;
    onState({
      serial: "S1",
      generation: 2,
      state: "live",
      width: 1,
      height: 1,
      codec: "h264",
      control: true,
    });
    mocks.offlineHandlers.at(-1)!({ serial: "S1" });
    expect(store.state.phase).toBe("idle");
    expect(store.state.error).toBe("设备已掉线");
  });
});
