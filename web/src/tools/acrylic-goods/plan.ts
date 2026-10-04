/**
 * 純計算（規格第 3 節）：燈光位置、底座與外框的形狀、搖搖樂的碰撞牆與零件、立體透視的圖層位置與底座、
 * 匯出的影格計畫、搖晃動畫的角度、重力。單位一律是原圖的 px（＝3D 世界座標），y 往上、z 朝向鏡頭。
 */
import type { Bounds, Pt } from './contour';
import type { FrameShape, Kind, LightSettings } from './model';

/* ---------- 燈光（規格 3.5） ---------- */

/** 打光盤的半徑對應到的水平距離 */
export const LIGHT_REACH = 400;
/** 主光的高度（固定） */
export const LIGHT_HEIGHT = 300;
/** 補光：固定在左後下方 */
export const FILL_LIGHT = { position: [-200, 100, -200] as const, intensity: 0.3 };

/** 主光位置：打光盤 (x, y) → (x × 400, 300, y × 400) */
export function keyLightPosition(light: Pick<LightSettings, 'x' | 'y'>): [number, number, number] {
  return [light.x * LIGHT_REACH, LIGHT_HEIGHT, light.y * LIGHT_REACH];
}

/* ---------- 形狀 ---------- */

/** 正方形（中心在原點，半邊長 r） */
export function squarePoints(r: number): Pt[] {
  return [
    { x: -r, y: -r },
    { x: r, y: -r },
    { x: r, y: r },
    { x: -r, y: r },
  ];
}

/** 正 n 邊形（近似圓，從 0 度起逆時針） */
export function circlePoints(r: number, steps = 32): Pt[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

/* ---------- 立牌（規格 3.2） ---------- */

/** 底面圖的大小：圓形、方形底座時長邊縮放到底座大小 × 1.8；依圖形狀時原尺寸 */
export function baseImageSize(
  width: number,
  height: number,
  shape: 'circle' | 'square' | 'contour',
  baseSize: number,
): { width: number; height: number } {
  if (shape === 'contour') return { width, height };
  const k = (baseSize * 1.8) / Math.max(width, height);
  return { width: width * k, height: height * k };
}

/* ---------- 搖搖樂（規格 3.3） ---------- */

export interface ShakerDims {
  /** 外框的厚度（壓克力厚度 × 1.5） */
  frameDepth: number;
  /** 前蓋與外框之間的空隙（壓克力厚度 × 0.8） */
  gap: number;
  /** 前蓋（透明板，厚 2）的位置 */
  coverZ: number;
  /** 零件的厚度（壓克力厚度 × 0.4） */
  partDepth: number;
  /** 零件所在的深度（空隙的正中央） */
  partZ: number;
}

export function shakerDims(thickness: number): ShakerDims {
  const frameDepth = thickness * 1.5;
  const gap = thickness * 0.8;
  return {
    frameDepth,
    gap,
    coverZ: frameDepth / 2 + gap,
    partDepth: thickness * 0.4,
    partZ: frameDepth / 2 + gap / 2,
  };
}

/** 碰撞範圍的邊界：外框形狀 × 內部留白（圓形用 32 邊形） */
export function shakerBoundary(
  frame: FrameShape,
  frameSize: number,
  padding: number,
  imageOutline: readonly Pt[] | null,
): Pt[] {
  const k = padding / 100;
  const r = frameSize / 2;
  if (frame === 'image') return (imageOutline ?? []).map((p) => ({ x: p.x * k, y: p.y * k }));
  if (frame === 'circle') return circlePoints(r * k, 32);
  return squarePoints(r * k);
}

/** 一面碰撞牆（很厚的長方體，沿著邊界的一段往外推半個牆厚） */
export interface Wall {
  /** 中心 */
  x: number;
  y: number;
  z: number;
  /** 半長、半寬（牆厚的一半）、半高 */
  halfLength: number;
  halfWidth: number;
  halfDepth: number;
  /** 繞 z 軸的角度（弧度） */
  angle: number;
}

/** 牆厚 */
export const WALL_THICKNESS = 400;
/** 相鄰的牆多長出來的長度（兩端各 5，避免牆角的縫） */
export const WALL_OVERLAP = 5;

/**
 * 沿著邊界每一段立一面牆：長度不到 0.5 的段略過；牆的中心往外（離開原點的方向）推半個牆厚，
 * 所以內側剛好貼著邊界；高度＝空隙。
 */
export function shakerWalls(points: readonly Pt[], dims: ShakerDims): Wall[] {
  const walls: Wall[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    let nx = -dy;
    let ny = dx;
    if (nx * mx + ny * my < 0) {
      nx = -nx;
      ny = -ny;
    }
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    walls.push({
      x: mx + (nx * WALL_THICKNESS) / 2,
      y: my + (ny * WALL_THICKNESS) / 2,
      z: dims.partZ,
      halfLength: len / 2 + WALL_OVERLAP,
      halfWidth: WALL_THICKNESS / 2,
      halfDepth: dims.gap / 2,
      angle: Math.atan2(dy, dx),
    });
  }
  return walls;
}

/** 零件的碰撞球半徑：縮放後外框寬高的大者 ÷ 2 × 0.8；質量：寬 × 高 ÷ 100 */
export function partBody(bounds: Bounds, scalePercent: number) {
  const k = scalePercent / 100;
  const w = (bounds.maxX - bounds.minX) * k;
  const h = (bounds.maxY - bounds.minY) * k;
  return { radius: (Math.max(w, h) / 2) * 0.8, mass: (w * h) / 100, width: w, height: h };
}

/** 外框的寬高（產生零件的範圍用） */
export function frameExtent(
  frame: FrameShape,
  frameSize: number,
  imageBounds: Bounds | null,
): { width: number; height: number } {
  if (frame === 'image' && imageBounds)
    return {
      width: imageBounds.maxX - imageBounds.minX,
      height: imageBounds.maxY - imageBounds.minY,
    };
  return { width: frameSize, height: frameSize };
}

/** 零件出現的位置：外框中央、寬高各一半的範圍內（rand 是 0～1 的亂數） */
export function spawnPoint(extent: { width: number; height: number }, rand: () => number): Pt {
  return { x: (rand() - 0.5) * extent.width * 0.5, y: (rand() - 0.5) * extent.height * 0.5 };
}

/** 零件總數 */
export function partCount(parts: readonly { image: string | null; qty: number }[]): number {
  return parts.reduce((n, p) => n + (p.image ? p.qty : 0), 0);
}

/* ---------- 重力與搖晃（規格 3.3、4） ---------- */

/** 重力的大小上限（每個方向） */
export const GRAVITY_LIMIT = 15000;
/** 鏡頭的「下方」換算成重力的倍數 */
export const GRAVITY_SCALE = 3000;
/** 拖曳畫面時每 px 加的力 */
export const SHAKE_PER_PX = 100;
/** 搖晃的力每一步（1/60 秒）衰減成 0.85 倍 */
export const SHAKE_DECAY = 0.85;
/** 陀螺儀：傾斜 1 度＝30 的重力 */
export const GYRO_SCALE = 30;

/**
 * 這一步的重力（周邊自己的座標）：搖晃的力＋（陀螺儀開著時）手機的傾斜，否則鏡頭的下方 × 3000；各方向夾在 ±15000。
 */
export function gravityFor(
  shake: Pt,
  localDown: Pt,
  gyro: { gamma: number; beta: number } | null,
): Pt {
  let gx = shake.x;
  let gy = shake.y;
  if (gyro) {
    gx += gyroGravity(gyro).x;
    gy += gyroGravity(gyro).y;
  } else {
    gx += localDown.x * GRAVITY_SCALE;
    gy += localDown.y * GRAVITY_SCALE;
  }
  const c = (v: number) => Math.max(-GRAVITY_LIMIT, Math.min(GRAVITY_LIMIT, v));
  return { x: c(gx), y: c(gy) };
}

/** 手機的傾斜（左右 gamma、前後 beta，各夾在 ±90 度）→ 重力 */
export function gyroGravity({ gamma, beta }: { gamma: number; beta: number }): Pt {
  const c = (v: number) => Math.max(-90, Math.min(90, v || 0));
  return { x: c(gamma) * GYRO_SCALE, y: -c(beta) * GYRO_SCALE };
}

/* ---------- 立體透視（規格 3.4） ---------- */

/** 第 index 張（0＝清單最上面＝最前面）的深度：整組以 0 為中心，相鄰間隔 gap */
export function layerZ(index: number, count: number, gap: number): number {
  return -((count - 1) * gap) / 2 + (count - 1 - index) * gap;
}

/** 底座：寬＝所有圖層外框的左右範圍＋兩側邊距；深＝（張數 − 1）× 間距＋厚度＋兩側邊距 */
export function dioramaBase(
  bounds: readonly Bounds[],
  gap: number,
  thickness: number,
  margin: number,
): { width: number; depth: number } {
  const minX = Math.min(...bounds.map((b) => b.minX));
  const maxX = Math.max(...bounds.map((b) => b.maxX));
  return {
    width: maxX - minX + margin * 2,
    depth: (bounds.length - 1) * gap + thickness + margin * 2,
  };
}

/* ---------- 自動旋轉與匯出（規格 3.6） ---------- */

/** 自動旋轉：速度 1 ＝ 每秒 0.6 弧度（舊版每畫面 0.01 × 速度，60 FPS） */
export const SPIN_RAD_PER_SEC = 0.6;
/** 匯出時沒有開自動旋轉的話用這個速度 */
export const EXPORT_DEFAULT_SPIN = 4;
/** 搖搖樂的匯出長度（秒） */
export const SHAKE_SECONDS = 4.5;
/** 搖晃動畫的最大角度（60 度） */
export const SHAKE_MAX_ANGLE = Math.PI / 3;
/** 匯出時物理每格前進的時間＝影格時間 × 這個比例（20 FPS 時每格 1/60 秒，與舊版相同） */
export const EXPORT_PHYSICS_RATIO = 1 / 3;

/** 搖晃動畫在進度 p（0～1）時的角度（繞 z 軸） */
export function shakerAngle(p: number): number {
  const t = p + 0.078 * Math.sin(p * Math.PI * 4);
  return SHAKE_MAX_ANGLE * Math.sin(t * Math.PI * 2);
}

export interface ExportPlan {
  kind: 'spin' | 'shake';
  frames: number;
  fps: number;
  /** 總長（秒）＝格數 ÷ fps */
  duration: number;
  /** 旋轉一圈的長度（秒；搖搖樂是 4.5） */
  cycle: number;
}

/** 匯出的影格計畫：立牌、立體透視轉一圈；搖搖樂左右搖 4.5 秒 */
export function exportPlan(kind: Kind, spin: number, fps: number): ExportPlan {
  if (kind === 'shaker') {
    const frames = Math.max(1, Math.round(SHAKE_SECONDS * fps));
    return { kind: 'shake', frames, fps, duration: frames / fps, cycle: SHAKE_SECONDS };
  }
  const speed = spin > 0 ? spin : EXPORT_DEFAULT_SPIN;
  const cycle = (Math.PI * 2) / (speed * SPIN_RAD_PER_SEC);
  const frames = Math.max(1, Math.round(cycle * fps));
  return { kind: 'spin', frames, fps, duration: frames / fps, cycle };
}

/** 第 i 格的角度：轉一圈的是 y 軸角度，搖搖樂是 z 軸角度 */
export function frameAngle(plan: ExportPlan, i: number): number {
  const p = i / plan.frames;
  return plan.kind === 'spin' ? p * Math.PI * 2 : shakerAngle(p);
}
