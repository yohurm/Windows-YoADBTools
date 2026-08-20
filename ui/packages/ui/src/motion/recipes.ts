import type { MotionDurationName } from "../tokens/motion";

/** Presence 配方名（与 motion.css data-recipe 对齐）。 */
export type PresenceRecipe = "dialog" | "toast" | "popover" | "fade";

/** 出场等待时长（超时兜底 = 该值 + 50ms）。 */
export const PRESENCE_EXIT_DURATION: Record<PresenceRecipe, MotionDurationName> = {
  dialog: "local",
  toast: "local",
  popover: "local",
  fade: "local",
};
