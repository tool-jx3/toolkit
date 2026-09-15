export type Easing = (x: number) => number;

export const linear: Easing = (x) => x;
export const easeInOutSine: Easing = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
export const easeOutCubic: Easing = (x) => 1 - Math.pow(1 - x, 3);
export const easeInCubic: Easing = (x) => x * x * x;
export const easeOutBack: Easing = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** 0→1→0 と往復する周期1の波。ループ保証に使う */
export const pingPong: Easing = (t) => 1 - Math.abs(1 - 2 * (t % 1));

export const EASINGS: Record<string, Easing> = {
  linear,
  easeInOutSine,
  easeOutCubic,
  easeInCubic,
  easeOutBack,
};
