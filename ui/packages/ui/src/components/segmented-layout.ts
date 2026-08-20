/**
 * 选择块几何：兼容旧 import；实现迁到 motion/indicator-layout。
 */

export type { IndicatorBox as ThumbBox } from "../motion/indicator-layout";
export { EMPTY_INDICATOR as EMPTY_THUMB, indicatorReady as thumbReady } from "../motion/indicator-layout";
export { measureIndicator as measureThumb } from "../motion/indicator-layout";
