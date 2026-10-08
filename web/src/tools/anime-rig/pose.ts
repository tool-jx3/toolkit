/**
 * 網格、變形、物理與自動動作（不依賴 WebGL 與 DOM；規格 1.3、3.4）。
 *
 * 參考原作 Anime2.5DRig（MIT）app.js 的 prepareLayers、deform、updateSprings、animate 改寫，數值與順序相同：
 * 同一組參數畫出來的網格與原作一致（亂數由呼叫端給，測試可以固定）。
 */
import {
  type AnchorOffsets,
  clamp,
  PARAM_KEYS,
  PARAM_RANGES,
  type ParamKey,
  type Params,
} from './params';
import type { RigAnchors, RigPart } from './rigger';
import { partBase } from './rigger';
import { meshSize, type SpringState, spring } from './runtime';

export const smooth = (t: number): number => {
  const v = clamp(t, 0, 1);
  return v * v * (3 - 2 * v);
};

/* ---------- 部件的網格 ---------- */

interface StrandSpring {
  stiff: SpringState & { dx: number };
  soft: SpringState & { dx: number };
  phase: number;
}

/** 一個部件在畫面上的狀態（網格、物理、使用者的圖層設定） */
export interface LayerRuntime extends Omit<RigPart, 'img' | 'opacity'> {
  /** 「繪製順序:名稱」 */
  id: string;
  /** 部位（去掉左右與編號） */
  bn: string;
  visible: boolean;
  opacity: number;
  defaultDepth: number;
  defaultOpacity: number;
  /** 原本的頂點（畫布座標，x、y 交錯） */
  base: Float32Array;
  /** 這一格變形後的頂點 */
  cur: Float32Array;
  uv: Float32Array;
  indices: Uint16Array;
  /** 每個頂點對每條髮束的權重（頂點數 × 髮束數） */
  sw: Float32Array | null;
  /** 每個頂點從髮根到髮梢的位置（0～1） */
  su: Float32Array | null;
  spr: StrandSpring[] | null;
  /** 瀏海三區塊的權重（頂點數 × 3） */
  bw: Float32Array | null;
}

/** 部件 → 網格（一格約 42 px，有物理的 30 px，依畫布寬比例放大，最小 0.6 倍）與髮束權重 */
export function prepareLayer(part: RigPart, canvasW: number): LayerRuntime {
  const cell = (part.phys ? 30 : 42) * Math.max(0.6, canvasW / 768);
  const { nx, ny } = meshSize(part.w, part.h, cell);
  const nv = (nx + 1) * (ny + 1);
  const base = new Float32Array(nv * 2);
  const uv = new Float32Array(nv * 2);
  let k = 0;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      base[k] = part.x + (part.w * i) / nx;
      base[k + 1] = part.y + (part.h * j) / ny;
      uv[k] = i / nx;
      uv[k + 1] = j / ny;
      k += 2;
    }
  }
  const indices = new Uint16Array(nx * ny * 6);
  let q = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      indices[q++] = a;
      indices[q++] = b;
      indices[q++] = c;
      indices[q++] = b;
      indices[q++] = d;
      indices[q++] = c;
    }
  }
  const { img: _img, opacity, ...rest } = part;
  const L: LayerRuntime = {
    ...rest,
    id: `${part.z}:${part.name}`,
    bn: partBase(part.name),
    visible: true,
    opacity: opacity ?? 1,
    defaultDepth: part.depth,
    defaultOpacity: opacity ?? 1,
    base,
    cur: new Float32Array(base),
    uv,
    indices,
    sw: null,
    su: null,
    spr: null,
    bw: null,
  };
  const S = part.strands;
  if (S?.length) {
    const nS = S.length;
    let spacing = 120;
    if (nS > 1) {
      const ds: number[] = [];
      for (let s = 1; s < nS; s++) ds.push(S[s].x - S[s - 1].x);
      ds.sort((a, b) => a - b);
      spacing = ds[ds.length >> 1];
    }
    const sig = Math.max(1, spacing * 0.6);
    const sw = new Float32Array(nv * nS);
    const su = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const x = base[v * 2];
      const y = base[v * 2 + 1];
      let tot = 0;
      for (let s = 0; s < nS; s++) {
        const w = Math.exp(-(((x - S[s].x) / sig) ** 2));
        sw[v * nS + s] = w;
        tot += w;
      }
      let rY = 0;
      let tY = 0;
      if (tot > 1e-6) {
        for (let s = 0; s < nS; s++) {
          sw[v * nS + s] /= tot;
          rY += sw[v * nS + s] * S[s].rootY;
          tY += sw[v * nS + s] * S[s].tipY;
        }
      } else {
        sw[v * nS] = 1;
        rY = S[0].rootY;
        tY = S[0].tipY;
      }
      su[v] = clamp((y - rY) / Math.max(1, tY - rY), 0, 1);
    }
    L.sw = sw;
    L.su = su;
    L.spr = S.map((_, i) => ({
      stiff: { x: 0, v: 0, dx: 0 },
      soft: { x: 0, v: 0, dx: 0 },
      phase: i * 1.37 + part.z,
    }));
  }
  return L;
}

/* ---------- 錨點（自動偵測＋手動位移） ---------- */

export interface PoseAnchors {
  A: RigAnchors;
  /** 臉的比例（動作量） */
  FS: number;
  /** 脖子的轉軸 */
  NP: { cx: number; cy: number };
  /** 身體的轉軸 */
  BP: { cx: number; cy: number };
  /** 臉的中心 */
  FC: { x: number; y: number };
  /** 胸部（晃動的中心與範圍） */
  CHEST: { cx: number; cy: number; rx: number; ry: number };
}

const offsetOf = (o: AnchorOffsets, k: keyof AnchorOffsets) => o[k] ?? {};

/** 自動偵測的錨點套上手動位移（規格 F49） */
export function applyAnchorOffsets(base: RigAnchors, offsets: AnchorOffsets): PoseAnchors {
  const a = structuredClone(base);
  const off = (k: keyof AnchorOffsets) => offsetOf(offsets, k);
  a.face.cx += off('face').dx || 0;
  a.face.cy += off('face').dy || 0;
  for (const s of ['L', 'R'] as const) {
    const e = s === 'L' ? a.eyeL : a.eyeR;
    if (!e) continue;
    const eo = off(s === 'L' ? 'eyeL' : 'eyeR');
    e.icx += eo.dx || 0;
    e.icy += eo.dy || 0;
    e.closeY += off(s === 'L' ? 'eyeLClose' : 'eyeRClose').dy || 0;
  }
  const m = off('mouth');
  a.mouth.cx += m.dx || 0;
  a.mouth.x0 += m.dx || 0;
  a.mouth.x1 += m.dx || 0;
  a.mouth.cy += m.dy || 0;
  a.mouth.y0 += m.dy || 0;
  a.mouth.y1 += m.dy || 0;
  a.neckPivot.cx += off('neck').dx || 0;
  a.neckPivot.cy += off('neck').dy || 0;
  const NP = a.neckPivot;
  const ch = off('chest');
  const fh = a.face.y1 - a.face.y0;
  return {
    A: a,
    FS: a.faceScale,
    NP,
    BP: a.bodyPivot,
    FC: { x: a.face.cx, y: a.face.cy },
    CHEST: {
      cx: NP.cx + (ch.dx || 0),
      cy: a.neckBottom + fh * 0.6 + (ch.dy || 0),
      rx: Math.max(1, (a.face.x1 - a.face.x0) * 0.6),
      ry: Math.max(1, fh * 0.45),
    },
  };
}

/** 瀏海三區塊的權重（依臉的中心與寬度，錨點改了要重算） */
export function buildBangWeights(L: LayerRuntime, P: PoseAnchors): void {
  if (L.bn !== 'front hair' || !L.su) {
    L.bw = null;
    return;
  }
  const fw = P.A.face.x1 - P.A.face.x0;
  const fcx = P.A.face.cx;
  const f = 36;
  const b1 = fcx - fw * 0.22;
  const b2 = fcx + fw * 0.22;
  const nv = L.base.length / 2;
  const bw = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const x = L.base[v * 2];
    const s1 = smooth((x - b1) / f + 0.5);
    const s2 = smooth((x - b2) / f + 0.5);
    bw[v * 3] = 1 - s1;
    bw[v * 3 + 1] = s1 * (1 - s2);
    bw[v * 3 + 2] = s2;
  }
  L.bw = bw;
}

/* ---------- 一格的姿勢 ---------- */

/** 一格的參數：使用者的參數＋自動算出來的呼吸、瞳孔彈跳 */
export interface Frame extends Params {
  breath: number;
  breathHead: number;
  irisBounceX: number;
  irisBounceY: number;
}

export interface BlinkInfo {
  /** 2＝這次眨眼用長閉眼 */
  variant: 1 | 2;
}

/** 部件這一格的不透明度（閉眼／閉嘴的交叉淡化；規格 F46 眼睛、嘴巴） */
export function fadeAlpha(
  L: Pick<LayerRuntime, 'fade' | 'side'>,
  e: Frame,
  alt: { L: boolean; R: boolean },
  blinkVariant: 1 | 2,
): number {
  if (!L.fade) return 1;
  if (L.fade === 'eyeOpen') {
    const v = L.side === 'L' ? e.eyeOpenL : e.eyeOpenR;
    return smooth((v - (0.1 + e.eyeEase * 0.45)) / 0.15);
  }
  if (L.fade === 'eyeClose' || L.fade === 'eyeClose2') {
    const alternate = blinkVariant === 2 && !!L.side && alt[L.side];
    if ((L.fade === 'eyeClose2') !== alternate) return 0;
    const v = L.side === 'L' ? e.eyeOpenL : e.eyeOpenR;
    return 1 - smooth((v - (0.1 + e.eyeEase * 0.45)) / 0.15);
  }
  if (L.fade === 'mouthOpen') return smooth((e.mouthOpen - (0.05 + e.mouthEase * 0.35)) / 0.12);
  if (L.fade === 'mouthClose')
    return 1 - smooth((e.mouthOpen - (0.05 + e.mouthEase * 0.35)) / 0.12);
  return 1;
}

const FRONTISH: Record<string, true> = { 'front hair': true, 'side hair': true, ahoge: true };

export interface DeformContext extends PoseAnchors {
  /** 頭髮物理開著 */
  phys: boolean;
  /** 胸部晃動的位移 */
  bounceDy: number;
}

/** 部件的網格變形（寫進 L.cur） */
export function deform(L: LayerRuntime, e: Frame, ctx: DeformContext): void {
  const { A, FS, NP, BP, FC, CHEST } = ctx;
  const b = L.base;
  const o = L.cur;
  const n = b.length;
  const isHead = L.group === 'head';
  const az = e.angleZ * 0.07;
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  const ab = e.body * 0.028;
  const cb = Math.cos(ab);
  const sb = Math.sin(ab);
  const bn = L.bn;
  const eyeSide = L.side;
  const EA = eyeSide === 'L' ? A.eyeL : eyeSide === 'R' ? A.eyeR : undefined;
  const vOpen = eyeSide === 'L' ? e.eyeOpenL : e.eyeOpenR;
  const mo = e.mouthOpen;
  const mHalfW = (A.mouth.x1 - A.mouth.x0) / 2;
  const nS = L.strands ? L.strands.length : 0;
  const bcx = L.x + L.w / 2;
  const bcy = L.y + L.h / 2;
  const kind = L.phys === 'sway' ? 'acc' : FRONTISH[bn] ? 'fh' : 'bh';
  const physOn = nS && ctx.phys && L.su;
  const ampK = kind === 'acc' ? e.accAmp * 1.4 : kind === 'fh' ? e.fhAmp : e.physAmp;
  const softK = kind === 'acc' ? 0.8 : kind === 'fh' ? e.fhSoft : e.soft;
  const powA = kind === 'acc' ? 1.2 : kind === 'fh' ? 1.8 : 2.1;
  for (let k = 0; k < n; k += 2) {
    let x = b[k];
    let y = b[k + 1];
    const vi = k >> 1;
    /* 閉眼／嘴巴的縮放 */
    if (EA && (bn === 'eye_close' || bn === 'eye_close2')) {
      const sE = eyeSide === 'L' ? e.eyeScaleL : e.eyeScaleR;
      if (sE !== 1) {
        const cxE = (EA.x0 + EA.x1) / 2;
        const cyE = (EA.y0 + EA.y1) / 2;
        x = cxE + (x - cxE) * sE;
        y = cyE + (y - cyE) * sE;
      }
    }
    if (bn === 'mouth_open' || bn === 'mouth_close') {
      const sM = e.mouthScale;
      if (sM !== 1) {
        x = A.mouth.cx + (x - A.mouth.cx) * sM;
        y = A.mouth.cy + (y - A.mouth.cy) * sM;
      }
    }
    /* 眼睛、眉毛、嘴巴 */
    if (L.fade === 'eyeOpen' && EA) {
      if (bn === 'irides') {
        const isc = e.irisScale;
        const ibx = e.irisBounceX || 1;
        const iby = e.irisBounceY || 1;
        x = EA.icx + (x - EA.icx) * isc * ibx;
        y = EA.icy + (y - EA.icy) * isc * iby;
        x += e.eyeX * 11 * FS;
        y += e.eyeY * 6 * FS;
        const tl = smooth((0.32 - vOpen) / 0.32); /* 快閉上才把瞳孔壓扁 */
        y = EA.closeY + (y - EA.closeY) * (1 - 0.8 * tl);
      } else {
        y = EA.closeY + (y - EA.closeY) * (1 - 0.85 * (1 - vOpen)); /* 眼皮往下壓 */
      }
    }
    if ((L.fade === 'eyeClose' || L.fade === 'eyeClose2') && EA) {
      y -= vOpen * 3;
      y += e.eyeCY * 14 * FS;
      const thE = e.eyeCAng * 0.3 * (eyeSide === 'L' ? 1 : -1);
      if (thE) {
        const ct = Math.cos(thE);
        const st = Math.sin(thE);
        const rx = x - bcx;
        const ry = y - bcy;
        x = bcx + rx * ct - ry * st;
        y = bcy + rx * st + ry * ct;
      }
    }
    if (bn === 'eyebrow') {
      y += (-e.brow * 9 + (1 - vOpen) * 3.5) * FS;
      const th = (eyeSide === 'L' ? e.browAngL + e.browAngSym : e.browAngR - e.browAngSym) * 0.3;
      if (th) {
        const ct = Math.cos(th);
        const st = Math.sin(th);
        const rx = x - bcx;
        const ry = y - bcy;
        x = bcx + rx * ct - ry * st;
        y = bcy + rx * st + ry * ct;
      }
    }
    if (L.fade === 'mouthOpen') {
      y = A.mouth.y0 + (y - A.mouth.y0) * (0.5 + 0.5 * mo);
      const q = (Math.abs(x - A.mouth.cx) / (mHalfW + 4)) ** 1.5;
      y -= e.mouthForm * 6 * FS * (q - 0.35);
    }
    if (L.fade === 'mouthClose') {
      y += e.mouthCY * 14 * FS;
      const thM = e.mouthCAng * 0.35;
      if (thM) {
        const ct = Math.cos(thM);
        const st = Math.sin(thM);
        const rx = x - A.mouth.cx;
        const ry = y - A.mouth.cy;
        x = A.mouth.cx + rx * ct - ry * st;
        y = A.mouth.cy + rx * st + ry * ct;
      }
    }
    if (bn === 'face' && y > A.mouth.cy)
      y += mo * 6 * FS * smooth((y - A.mouth.cy) / Math.max(1, A.face.y1 - A.mouth.cy));
    /* 頭部的轉動（身體也稍微跟著頭部的 XYZ） */
    let hw = isHead ? 1 : L.group === 'body' ? 0.16 : 0;
    if (bn === 'neck')
      hw = 0.55 * smooth((A.neckBottom - y) / Math.max(1, A.neckBottom - A.neckTop));
    if (hw > 0) {
      const rx = x - NP.cx;
      const ry = y - NP.cy;
      const rx2 = rx * cz - ry * sz;
      const ry2 = rx * sz + ry * cz;
      x += (rx2 - rx) * hw;
      y += (ry2 - ry) * hw;
      const dd = L.depth;
      x += hw * FS * (e.angleX * (14 + 40 * (dd - 1)) + e.angleX * (NP.cy - y) * 0.028);
      y += hw * FS * (-e.angleY * (9 + 30 * (dd - 1)) - e.angleY * (dd - 1) * (y - FC.y) * 0.05);
    }
    /* 呼吸 */
    y -= (L.group === 'body' ? e.breath * 2.0 : e.breathHead * 1.6) * FS;
    if (bn === 'topwear' && y < CHEST.cy)
      y -= e.breath * 2.2 * FS * smooth((CHEST.cy - y) / (CHEST.ry * 2)); /* 肩膀上提 */
    if (bn === 'topwear') x = NP.cx + (x - NP.cx) * (1 + e.breath * 0.003);
    /* 胸部晃動 */
    if (bn === 'topwear') {
      const gx = (x - CHEST.cx) / CHEST.rx;
      const gy = (y - (CHEST.cy + e.bustY * 70 * FS)) / CHEST.ry;
      y += ctx.bounceDy * e.bust * Math.exp(-gx * gx - gy * gy);
    }
    /* 手臂 */
    if (bn === 'handwear') {
      const w = smooth(((y - L.y) / L.h) * 1.15);
      y -= e.armY * 30 * FS * w;
      y += e.armPos * 40 * FS;
      x += e.armY * 6 * FS * w * (x < NP.cx ? 1 : -1);
    }
    /* 瀏海三區塊 */
    if (L.bw && L.su) {
      const m = L.su[vi] ** 1.4 * 22 * FS;
      x += (e.bangL * L.bw[vi * 3] + e.bangC * L.bw[vi * 3 + 1] + e.bangR * L.bw[vi * 3 + 2]) * m;
    }
    /* 髮束物理：髮根硬、髮梢軟（瀏海、小物各有自己的參數） */
    if (physOn && L.su && L.sw && L.spr) {
      const u = kind === 'fh' ? Math.min(1, L.su[vi] * 1.6) : L.su[vi];
      const amp = u ** powA * ampK;
      const softMix = Math.min(1, u ** 1.2 * softK);
      let dx = 0;
      for (let s = 0; s < nS; s++) {
        const w = L.sw[vi * nS + s];
        if (w < 0.001) continue;
        const sp = L.spr[s];
        dx += w * (sp.stiff.dx * (1 - softMix) + sp.soft.dx * softMix);
      }
      x += dx * amp;
      y += Math.abs(dx) * amp * 0.12;
    }
    o[k] = x;
    o[k + 1] = y;
  }
  /* 身體的傾斜（以畫布底部中央為軸） */
  if (Math.abs(ab) > 1e-4) {
    for (let k = 0; k < n; k += 2) {
      const rx = o[k] - BP.cx;
      const ry = o[k + 1] - BP.cy;
      o[k] = BP.cx + rx * cb - ry * sb;
      o[k + 1] = BP.cy + rx * sb + ry * cb;
    }
  }
}

/** 胸部晃動的彈簧 */
export interface Bounce {
  x: number;
  v: number;
  dy: number;
}

/** 髮束與胸部的彈簧（wind：待機時的風） */
export function updateSprings(
  layers: readonly LayerRuntime[],
  e: Frame,
  t: number,
  dt: number,
  wind: boolean,
  P: PoseAnchors,
  bounce: Bounce,
): void {
  const { NP, FC, BP, FS } = P;
  const headDX = (e.angleX * 14 + e.angleZ * 0.07 * (NP.cy - FC.y)) * FS;
  const bodyDX = e.body * 0.028 * (BP.cy - NP.cy) * 0.35 + e.angleX * 14 * 0.16 * FS;
  for (const L of layers) {
    if (!L.spr) continue;
    const base = L.group === 'head' ? headDX : bodyDX;
    const windScale = L.phys === 'sway' && L.group !== 'head' ? 2.5 : 1;
    for (const sp of L.spr) {
      const w = wind
        ? (1.8 * Math.sin(t * 0.8 + sp.phase) + 1.0 * Math.sin(t * 1.9 + sp.phase * 2.3)) *
          windScale
        : 0;
      const txv = base + w * FS;
      spring(sp.stiff, txv, 70, 9, dt);
      sp.stiff.dx = -(sp.stiff.x - txv) * 2.2;
      spring(sp.soft, txv, 16, 1.3, dt);
      sp.soft.dx = -(sp.soft.x - txv) * 3.0;
    }
  }
  const bustTgt = (e.breath * 3.0 - e.angleY * 6.0 + e.body * 4.0) * FS;
  spring(bounce, bustTgt, 140, 4.2, dt);
  bounce.dy = -(bounce.x - bustTgt) * 3.0;
}

/** 物理歸零（測試用的靜止畫面、換模型時） */
export function resetPhysics(layers: readonly LayerRuntime[], bounce: Bounce): void {
  for (const L of layers) {
    for (const sp of L.spr ?? []) {
      Object.assign(sp.stiff, { x: 0, v: 0, dx: 0 });
      Object.assign(sp.soft, { x: 0, v: 0, dx: 0 });
    }
  }
  Object.assign(bounce, { x: 0, v: 0, dy: 0 });
}

/* ---------- 自動動作 ---------- */

/** 攝影機追蹤值（規格 1.7） */
export interface CamValues {
  ax: number;
  ay: number;
  az: number;
  eL: number;
  eR: number;
  mo: number;
  ex: number;
  ey: number;
  br: number;
  mf: number;
}

export interface AnimateInput {
  /** 使用者的參數（滑桿） */
  target: Params;
  auto: {
    idle: boolean;
    blink: boolean;
    rand: boolean;
    talk: boolean;
    mouse: boolean;
    phys: boolean;
  };
  /** 表情預設開著（不眨眼、不隨機嘴型） */
  preset: boolean;
  /** 攝影機追蹤中（有最近 1.2 秒內的追蹤值）時的值 */
  cam: CamValues | null;
  /** 滑鼠在預覽上的位置（−1.5～1.5），不在上面時 null */
  mouse: { x: number; y: number } | null;
  /** 麥克風的音量（0～1），沒開時 null */
  mic: number | null;
}

/**
 * 自動動作的狀態機（待機、眨眼、隨機動作、隨機嘴型、瞳孔彈跳、呼吸、平滑）。
 * `random` 給 Math.random 以外的亂數時可以重現（測試）。
 */
export class Animator {
  readonly cur: Params;
  blinkT = -1;
  blinkVariant: 1 | 2 = 1;
  private blinkBounceStarted = false;
  irisBounceT = -1;
  nextBlink: number;
  private rnd = { ax: 0, ay: 0, az: 0, bd: 0, ex: 0, ey: 0 };
  private nextRnd = 0;
  private talkOn = false;
  private talkV = 0;
  private talkTgt = 0;
  private nextTalkState = 0;
  private nextSyl = 0;
  private camPhysScale = 1;

  constructor(
    initial: Params,
    startMs: number,
    private random: () => number = Math.random,
  ) {
    this.cur = { ...initial };
    this.nextBlink = startMs + 1800;
  }

  /** 換模型時：眨眼與瞳孔彈跳重來 */
  resetBlink(): void {
    this.blinkT = -1;
    this.blinkVariant = 1;
    this.irisBounceT = -1;
  }

  /** 參數直接跳到目標（不平滑；換模型、離開錨點編輯時） */
  snap(target: Params): void {
    Object.assign(this.cur, target);
  }

  /** 一格（now：模擬時間 ms，dt：秒） */
  step(now: number, dt: number, input: AnimateInput, hasEyeClose2: boolean): Frame {
    const rand = this.random;
    const t = now / 1000;
    const tgt: Params = { ...input.target };
    const cam = input.cam;
    const camLive = !!cam;
    if (cam) {
      tgt.angleX = clamp(cam.ax, -1, 1);
      tgt.angleY = clamp(cam.ay, -1, 1);
      tgt.angleZ = clamp(cam.az, -1, 1);
      tgt.eyeOpenL = Math.min(tgt.eyeOpenL, cam.eL);
      tgt.eyeOpenR = Math.min(tgt.eyeOpenR, cam.eR);
      tgt.eyeX = clamp(cam.ex, -1, 1);
      tgt.eyeY = clamp(cam.ey, -1, 1);
      tgt.mouthOpen = Math.max(tgt.mouthOpen, cam.mo);
      tgt.brow = clamp(tgt.brow + (cam.br || 0), -1, 1);
      tgt.mouthForm = clamp(tgt.mouthForm + (cam.mf || 0), -1, 1);
      tgt.body = clamp(tgt.body + cam.ax * 0.25, -1, 1);
    }
    const auto = input.auto;
    if (!camLive && auto.mouse && input.mouse) {
      const m = input.mouse;
      tgt.angleX = clamp(m.x * 0.9, -1, 1);
      tgt.angleY = clamp(-m.y * 0.7, -1, 1);
      tgt.eyeX = clamp(m.x * 1.2, -1, 1);
      tgt.eyeY = clamp(-m.y * 0.8, -1, 1);
    }
    if (auto.idle && !camLive) {
      tgt.angleX += 0.13 * Math.sin(t * 0.42) + 0.05 * Math.sin(t * 1.13);
      tgt.angleY += 0.08 * Math.sin(t * 0.31 + 1.7);
      tgt.angleZ += 0.07 * Math.sin(t * 0.23 + 0.5);
      tgt.body += 0.1 * Math.sin(t * 0.19 + 2.1);
    }
    if (auto.rand && !camLive) {
      const r = this.rnd;
      if (now > this.nextRnd) {
        this.nextRnd = now + 1400 + rand() * 2600;
        r.ax = (rand() * 2 - 1) * 0.55;
        r.ay = (rand() * 2 - 1) * 0.4;
        r.az = (rand() * 2 - 1) * 0.35;
        r.bd = (rand() * 2 - 1) * 0.3;
        r.ex = (rand() * 2 - 1) * 0.6;
        r.ey = (rand() * 2 - 1) * 0.35;
      }
      tgt.angleX = clamp(tgt.angleX + r.ax, -1, 1);
      tgt.angleY = clamp(tgt.angleY + r.ay, -1, 1);
      tgt.angleZ = clamp(tgt.angleZ + r.az, -1, 1);
      tgt.body = clamp(tgt.body + r.bd, -1, 1);
      tgt.eyeX = clamp(tgt.eyeX + r.ex, -1, 1);
      tgt.eyeY = clamp(tgt.eyeY + r.ey, -1, 1);
    }
    if (auto.talk && !camLive && input.mic === null && !input.preset) {
      if (now > this.nextTalkState) {
        this.talkOn = !this.talkOn;
        this.nextTalkState = now + (this.talkOn ? 1200 + rand() * 2200 : 600 + rand() * 1800);
      }
      if (this.talkOn && now > this.nextSyl) {
        this.nextSyl = now + 70 + rand() * 110;
        this.talkTgt = rand() < 0.25 ? 0.04 : 0.25 + rand() * 0.75;
      }
      if (!this.talkOn) this.talkTgt = 0;
      this.talkV += (this.talkTgt - this.talkV) * Math.min(1, dt * 22);
      tgt.mouthOpen = Math.max(tgt.mouthOpen, this.talkV);
    }
    if (auto.blink && !camLive && !input.preset) {
      if (this.blinkT < 0 && now > this.nextBlink) {
        this.blinkT = 0;
        this.blinkBounceStarted = false;
        this.blinkVariant = hasEyeClose2 && rand() < 0.2 ? 2 : 1;
        this.nextBlink = now + 1600 + rand() * 3800;
        if (rand() < 0.18) this.nextBlink = now + 280;
      }
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        const d = this.blinkT;
        const hold = this.blinkVariant === 2 ? 3.4 : 0.34;
        let v: number;
        if (d < 0.08) v = 1 - d / 0.08;
        else if (d < 0.08 + hold) v = 0;
        else if (d < 0.24 + hold) {
          v = (d - 0.08 - hold) / 0.16;
          if (!this.blinkBounceStarted && v > 0.12) {
            this.blinkBounceStarted = true;
            this.irisBounceT = 0;
          }
        } else {
          v = 1;
          this.blinkT = -1;
        }
        tgt.eyeOpenL = Math.min(tgt.eyeOpenL, v);
        tgt.eyeOpenR = Math.min(tgt.eyeOpenR, v);
      }
    }
    if (this.irisBounceT >= 0) {
      this.irisBounceT += dt;
      if (this.irisBounceT > 0.52) this.irisBounceT = -1;
    }
    if (input.mic !== null) tgt.mouthOpen = Math.max(tgt.mouthOpen, input.mic);
    const kSmooth = 1 - Math.exp(-dt * 14);
    const cur = this.cur;
    for (const k of PARAM_KEYS) {
      const [lo, hi] = PARAM_RANGES[k];
      tgt[k] = clamp(tgt[k], lo, hi);
      cur[k] += (tgt[k] - cur[k]) * kSmooth;
    }
    const e: Frame = { ...cur, irisBounceX: 1, irisBounceY: 1, breath: 0, breathHead: 0 };
    if (this.irisBounceT >= 0) {
      const p = this.irisBounceT / 0.52;
      const damp = Math.exp(-2.2 * p);
      const scale = 1 + 0.18 * Math.sin(p * Math.PI * 4.0) * damp;
      const squash = 0.1 * Math.sin(p * Math.PI * 4.0 + Math.PI / 2) * damp;
      e.irisBounceX = scale * (1 + squash);
      e.irisBounceY = scale * (1 - squash);
    }
    /* 攝影機追蹤時頭髮的擺動減半 */
    this.camPhysScale += ((camLive ? 0.5 : 1) - this.camPhysScale) * Math.min(1, dt * 4);
    e.physAmp *= this.camPhysScale;
    e.soft *= this.camPhysScale;
    e.fhAmp *= this.camPhysScale;
    e.fhSoft *= this.camPhysScale;
    e.breath = 0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 3.4);
    e.breathHead = 0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 3.4 - 0.6); /* 頭比胸口慢一點 */
    return e;
  }
}

/** 錨點編輯時的靜止姿勢（角度、身體、視線、呼吸歸零；拖曳閉眼位置時那一眼閉上） */
export function restFrame(target: Params, closeEye: 'L' | 'R' | null): Frame {
  const e: Frame = {
    ...target,
    angleX: 0,
    angleY: 0,
    angleZ: 0,
    body: 0,
    eyeX: 0,
    eyeY: 0,
    irisBounceX: 1,
    irisBounceY: 1,
    breath: 0,
    breathHead: 0,
  };
  if (closeEye === 'L') e.eyeOpenL = 0;
  if (closeEye === 'R') e.eyeOpenR = 0;
  return e;
}

/** 固定的畫面（測試、暫停中改數值）：參數直接採用，呼吸 0、瞳孔不彈跳 */
export function stillFrame(target: Params): Frame {
  return { ...target, irisBounceX: 1, irisBounceY: 1, breath: 0, breathHead: 0 };
}

export type { ParamKey };
