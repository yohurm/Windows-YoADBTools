/**
 * 动效 token —— JS 消费侧单一事实源（动画系统-v6.md L1，HarmonyOS 时长分级）。
 * CSS 组件层通过 var(--yohu-dur-*) / var(--yohu-ease-*) / var(--yohu-motion-*) 消费。
 */

/** 时长分级：100 / 150 / 160 / 200 / 300 / 350 / 400ms；loop 系循环指示；toast 上限 3s。 */
export const MotionDuration = {
  /** 100ms：hover / 按下反馈 */
  fast: "100ms",
  /** 150ms：小范围运动（开关图标） */
  small: "150ms",
  /** 160ms：面板展开 / 下拉 */
  normal: "160ms",
  /** 200ms：局部运动（删除一行） */
  local: "200ms",
  /** 300ms：页面级过渡 / 面板进出场 */
  slow: "300ms",
  /** 350ms：大面板入场（Dialog 等） */
  enter: "350ms",
  /** 400ms：进度条最短感知时长 */
  progress: "400ms",
  /** 800ms：循环指示器（spinner） */
  loop: "800ms",
  /** 1.2s：不确定进度条扫动 */
  loopSlow: "1.2s",
  /** 3s：Toast 最长展示 */
  toast: "3s",
} as const;

export type MotionDurationName = keyof typeof MotionDuration;

/**
 * 鸿蒙弹簧：页面级 interpolatingSpring（Stiffness 128 / Damping 12 / Mass 1）。
 * snap*：指示器位移（ζ≈0.75，约 4% 过冲）；soft*：尺寸滞后（更软、过冲略大）。
 *
 * @internal 采样实现参数：只被 `springCssEasing` / `MotionEasing` 内部消费；
 * 消费弹簧请用公开契约 `MotionEasing.spring` / `MotionEasing.springSoft`。
 */
export const MotionSpring = {
  stiffness: 128,
  damping: 12,
  mass: 1,
  velocity: 0,
  response: 0.555,
  dampingFraction: 0.53,
  snapStiffness: 711,
  snapDamping: 40,
  softStiffness: 531,
  softDamping: 29,
} as const;

/**
 * 欠阻尼弹簧 0→1 采样为 CSS `linear()`（WebView2 Chromium）。
 *
 * @internal 采样实现算法：仅在 `MotionEasing` 构建 spring / springSoft 时内部调用，
 * 不进入对外导出面；如需弹簧样式请直接用 `MotionEasing.spring` / `MotionEasing.springSoft`。
 */
export function springCssEasing(
  stiffness: number = MotionSpring.snapStiffness,
  damping: number = MotionSpring.snapDamping,
  mass: number = MotionSpring.mass,
  samples = 24,
): string {
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = omega * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta));
  const settle = 4 / (zeta * omega);
  const at = (time: number): number => {
    const envelope = Math.exp(-zeta * omega * time);
    return 1 - envelope * (Math.cos(wd * time) + ((zeta * omega) / wd) * Math.sin(wd * time));
  };
  const stops: string[] = ["0"];
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    stops.push(`${at(t * settle).toFixed(4)} ${(t * 100).toFixed(1)}%`);
  }
  stops.push("1");
  return `linear(${stops.join(", ")})`;
}

/** 缓动曲线：standard / decel / accel / emphasized / spring / springSoft / loop。 */
export const MotionEasing = {
  /** 标准缓动 cubic-bezier(0.4, 0, 0.2, 1)：始终在视线内的物体 */
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** 减速缓动 cubic-bezier(0, 0, 0.4, 1)：视线中新出现的物体 */
  decel: "cubic-bezier(0, 0, 0.4, 1)",
  /** 加速缓动 cubic-bezier(0.4, 0, 1, 1)：出场（配对减速） */
  accel: "cubic-bezier(0.4, 0, 1, 1)",
  /** 强调减速 cubic-bezier(0.2, 0, 0, 1)：折叠等局部空间，尾段更长 */
  emphasized: "cubic-bezier(0.2, 0, 0, 1)",
  /** 循环缓动 ease-in-out：不确定指示器扫动 */
  loop: "ease-in-out",
  /** 跟手弹簧：位移 */
  spring: springCssEasing(),
  /** 软弹簧：滑块宽高滞后，形成拉伸回弹 */
  springSoft: springCssEasing(MotionSpring.softStiffness, MotionSpring.softDamping),
} as const;

export type MotionEasingName = keyof typeof MotionEasing;

/** 语义规格：组件引用名称，禁止自行拼 duration+easing。 */
export const MotionSpec = {
  /** hover / press 色 */
  effectsFast: { duration: "fast", easing: "standard" },
  /** 淡入 */
  effectsEnter: { duration: "normal", easing: "decel" },
  /** 淡出（比入场短） */
  effectsExit: { duration: "local", easing: "accel" },
  /** 滑块位移 / 开关：150ms 弹簧 */
  spatialSmall: { duration: "small", easing: "spring" },
  /** 滑块宽高滞后：200ms 软弹簧（拉伸） */
  spatialStretch: { duration: "local", easing: "springSoft" },
  /** 折叠高度 */
  spatialLocal: { duration: "local", easing: "emphasized" },
  /** 侧栏宽度 */
  spatialPanel: { duration: "slow", easing: "standard" },
  /** Dialog 入场 */
  spatialEnter: { duration: "enter", easing: "decel" },
  /** Dialog / 卡片出场 */
  spatialExit: { duration: "local", easing: "accel" },
} as const satisfies Record<string, { duration: MotionDurationName; easing: MotionEasingName }>;

export type MotionSpecName = keyof typeof MotionSpec;

/** 把时长 token 解析为毫秒（Presence 超时、Toast 停留）。 */
export function motionDurationMs(name: MotionDurationName): number {
  const token = MotionDuration[name];
  if (token.endsWith("ms")) {
    return Number.parseFloat(token);
  }
  if (token.endsWith("s")) {
    return Number.parseFloat(token) * 1000;
  }
  return Number.parseFloat(token);
}
