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

/** 按钮文案槽：与侧栏/预览栏同一 spatial-panel 宽度过渡。 */
export const SWAP_DURATION: MotionDurationName = "slow";

/** 传输卡等一次性条目：停留后再播 dismiss-fade；须与 CSS calc(toast − slow) 对齐。 */
export const DISMISS_HOLD_DURATION: MotionDurationName = "toast";
