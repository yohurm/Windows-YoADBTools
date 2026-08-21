export { createDeviceStore, type DeviceStoreApi } from "./device-store";
export { resolveTargetSerials } from "./selection";
export { createSettingsStore, type SettingsStoreApi } from "./settings-store";
export { createTaskStore, type TaskStoreApi } from "./task-store";
export { createUpdateStore, type UpdateStoreApi } from "./update-store";

import { createDeviceStore } from "./device-store";
import { createSettingsStore } from "./settings-store";
import { createTaskStore } from "./task-store";
import { createUpdateStore } from "./update-store";

/** 壳级全局 store（应用生命周期单例）。 */
export const deviceStore = createDeviceStore();
export const settingsStore = createSettingsStore();
export const taskStore = createTaskStore();
export const updateStore = createUpdateStore();
