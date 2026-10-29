/**
 * 2026-10-29（參考 KIIN マップ制作スタジオ；畫法本站自己設計，規格 F261～F263、3.14.5、3.14.6）：
 * - 樣式的畫面效果：黑色電影的底片顆粒＋暗角、監視終端的掃描線＋雜訊＋四個角的取景框；
 * - 紙的污漬與摺痕：不規則的水漬（中間淡、邊緣一圈深、旁邊幾滴）＋橫的（有時再一條直的）摺痕。
 * 都用 canvas 的漸層與決定性的亂數（同樣的種子每次畫一樣），不用圖片。
 */
import { seeded } from './furniture/kit';
import { type FloorTheme, isDarkTheme } from './themes';

type Ctx = CanvasRenderingContext2D;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ---------- 雜訊的圖樣（固定的種子；每個瀏覽器分頁做一次） ---------- */

const NOISE = 128;
const noiseTiles = new Map<string, HTMLCanvasElement | null>();

/** 128 × 128 的雜訊圖：35%（掃描線用 25%）的點有顆粒，透明度 0～maxAlpha，亮暗各半（固定的種子） */
function noiseTile(kind: 'grain' | 'scan'): HTMLCanvasElement | null {
  if (noiseTiles.has(kind)) return noiseTiles.get(kind) ?? null;
  let tile: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    tile = document.createElement('canvas');
    tile.width = NOISE;
    tile.height = NOISE;
    const c = tile.getContext('2d');
    if (c) {
      const img = c.createImageData(NOISE, NOISE);
      const rnd = seeded(kind === 'grain' ? 0x51a7 : 0x7e11);
      const max = kind === 'grain' ? 46 : 26;
      for (let i = 0; i < NOISE * NOISE; i++) {
        /* 只有一部分的點有顆粒（稀疏一點，匯出的 PNG 比較壓得下來） */
        const on = rnd() < (kind === 'grain' ? 0.35 : 0.25);
        const light = rnd() < 0.5;
        const a = on ? rnd() * max : 0;
        const o = i * 4;
        const v = light ? 255 : 0;
        img.data[o] = kind === 'scan' && light ? 150 : v;
        img.data[o + 1] = v;
        img.data[o + 2] = kind === 'scan' && light ? 200 : v;
        img.data[o + 3] = a;
      }
      c.putImageData(img, 0, 0);
    } else tile = null;
  }
  noiseTiles.set(kind, tile);
  return tile;
}

/** 不畫雜訊時的暗角分幾層 */
const VIGNETTE_STEPS = 32;

/**
 * 樣式的畫面效果。呼叫時的座標系是像素（左上 0, 0）；範圍 w × h px。
 * `unit`：1 個 CSS px 是幾個像素（編輯畫面＝devicePixelRatio；匯出依每格 px 換算，見 export.ts）。
 * `noise`：畫顆粒與雜訊（2026-10-29 主控追加：匯出時可以關掉，因為雜訊讓 PNG 壓不下來）。關掉時掃描線、取景框照畫
 * （規則的線，幾乎不影響壓縮），暗角改用一圈一圈的畫法（漸層的抖動也壓不下來），D74。
 */
export function drawThemeEffect(
  c: Ctx,
  theme: Pick<FloorTheme, 'effect' | 'wall'>,
  w: number,
  h: number,
  unit = 1,
  noise = true,
): void {
  const fx = theme.effect;
  if (!fx || w <= 0 || h <= 0) return;
  c.save();
  const tile = noise ? noiseTile(fx) : null;
  if (tile) {
    const pat = c.createPattern(tile, 'repeat');
    if (pat) {
      c.fillStyle = pat;
      c.fillRect(0, 0, w, h);
    }
  }
  if (fx === 'grain') {
    /* 暗角：中心不變，四周往外漸漸壓暗（從半對角線的 45% 到角落，最暗 50%） */
    const r = Math.hypot(w, h) / 2;
    const r0 = r * 0.45;
    if (noise) {
      const g = c.createRadialGradient(w / 2, h / 2, r0, w / 2, h / 2, r);
      g.addColorStop(0, 'rgba(0, 0, 0, 0)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    } else {
      /*
       * 不畫雜訊時暗角也改成一圈一圈（32 層，每層一樣淡，疊起來到角落是 50%）：瀏覽器畫漸層會加細小的抖動，
       * PNG 壓不下來（洋館 1F、每格 32 px：漸層的暗角約 +1.3 MB，一圈一圈約 +0.1 MB，D74）。
       */
      const steps = VIGNETTE_STEPS;
      c.fillStyle = `rgba(0, 0, 0, ${1 - 0.5 ** (1 / steps)})`;
      for (let i = 0; i < steps; i++) {
        c.beginPath();
        c.rect(0, 0, w, h);
        c.arc(w / 2, h / 2, r0 + ((r - r0) * (i + 0.5)) / steps, 0, Math.PI * 2);
        c.fill('evenodd');
      }
    }
  } else {
    /* 掃描線：每 3 個 CSS px 一條 1 px 的暗線 */
    const step = Math.max(2, Math.round(3 * unit));
    const lw = Math.max(1, Math.round(unit));
    c.fillStyle = 'rgba(0, 0, 0, 0.24)';
    for (let y = 0; y < h; y += step) c.fillRect(0, y, w, lw);
    /* 四個角的取景框 */
    const m = Math.min(w, h);
    const inset = Math.round(m * 0.025);
    const len = Math.round(m * 0.07);
    c.strokeStyle = theme.wall;
    c.globalAlpha = 0.55;
    c.lineWidth = Math.max(1, Math.round(1.5 * unit));
    c.beginPath();
    for (const [x0, y0, dx, dy] of [
      [inset, inset, 1, 1],
      [w - inset, inset, -1, 1],
      [w - inset, h - inset, -1, -1],
      [inset, h - inset, 1, -1],
    ] as const) {
      c.moveTo(x0 + dx * len, y0);
      c.lineTo(x0, y0);
      c.lineTo(x0, y0 + dy * len);
    }
    c.stroke();
  }
  c.restore();
}

/* ---------- 紙的污漬與摺痕 ---------- */

interface Stain {
  /** 中心（紙的比例 0～1） */
  u: number;
  v: number;
  /** 半徑（紙的短邊的比例） */
  r: number;
  /** 外形的起伏（每個角度的半徑倍率） */
  wobble: number[];
  alpha: number;
  drops: { du: number; dv: number; r: number }[];
}

interface Fold {
  /** 'h'＝橫的摺痕（y 固定）；'v'＝直的 */
  o: 'h' | 'v';
  /** 位置（紙的比例） */
  at: number;
  /** 往哪一側暗 */
  side: 1 | -1;
}

export interface WearPlan {
  stains: Stain[];
  folds: Fold[];
}

/** 種子 → 污漬與摺痕的配置（紙的比例座標；同樣的種子結果一樣） */
export function wearPlan(seed: number): WearPlan {
  const rnd = seeded((seed * 2654435761) ^ 0x3c6ef372);
  const n = 3 + Math.floor(rnd() * 3);
  const stains: Stain[] = [];
  for (let i = 0; i < n; i++) {
    const wobble = Array.from({ length: 28 }, () => 0);
    const k1 = rnd() * Math.PI * 2;
    const k2 = rnd() * Math.PI * 2;
    for (let j = 0; j < wobble.length; j++) {
      const a = (j / wobble.length) * Math.PI * 2;
      wobble[j] =
        1 + 0.13 * Math.sin(a * 3 + k1) + 0.07 * Math.sin(a * 7 + k2) + 0.05 * (rnd() - 0.5);
    }
    const drops = Array.from({ length: Math.floor(rnd() * 4) }, () => ({
      du: (rnd() - 0.5) * 2.6,
      dv: (rnd() - 0.5) * 2.6,
      r: 0.06 + rnd() * 0.12,
    }));
    stains.push({
      u: 0.08 + rnd() * 0.84,
      v: 0.08 + rnd() * 0.84,
      r: 0.05 + rnd() * 0.11,
      wobble,
      alpha: 0.6 + rnd() * 0.4,
      drops,
    });
  }
  const folds: Fold[] = [{ o: 'h', at: 0.42 + rnd() * 0.16, side: rnd() < 0.5 ? 1 : -1 }];
  if (rnd() < 0.6) folds.push({ o: 'v', at: 0.38 + rnd() * 0.24, side: rnd() < 0.5 ? 1 : -1 });
  return { stains, folds };
}

/**
 * 畫污漬與摺痕：sheet＝當成一張紙的範圍（目前座標系；編輯畫面是世界座標的地圖範圍，匯出是整張圖的像素），
 * strength 0.1～1。
 */
export function drawWear(
  c: Ctx,
  sheet: Box,
  seed: number,
  strength: number,
  theme: Pick<FloorTheme, 'bg'>,
): void {
  if (!(strength > 0) || sheet.w <= 0 || sheet.h <= 0) return;
  const plan = wearPlan(seed);
  const dark = isDarkTheme(theme);
  /* 淺色的紙：茶褐色的水漬；深色的紙：淡淡的白色水痕 */
  const tint = dark ? [235, 225, 200] : [126, 88, 38];
  const rgba = (a: number) => `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${Math.max(0, a)})`;
  const k = Math.min(1, strength) * (dark ? 0.55 : 1);
  const m = Math.min(sheet.w, sheet.h);
  c.save();
  for (const s of plan.stains) {
    const cx = sheet.x + s.u * sheet.w;
    const cy = sheet.y + s.v * sheet.h;
    const r = s.r * m;
    c.beginPath();
    s.wobble.forEach((f, j) => {
      const a = (j / s.wobble.length) * Math.PI * 2;
      const x = cx + Math.cos(a) * r * f;
      const y = cy + Math.sin(a) * r * f;
      if (j) c.lineTo(x, y);
      else c.moveTo(x, y);
    });
    c.closePath();
    const g = c.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.15);
    g.addColorStop(0, rgba(0.05 * k * s.alpha));
    g.addColorStop(0.7, rgba(0.1 * k * s.alpha));
    g.addColorStop(1, rgba(0.2 * k * s.alpha));
    c.fillStyle = g;
    c.fill();
    /* 乾掉的邊緣：一圈深一點的細線 */
    c.strokeStyle = rgba(0.22 * k * s.alpha);
    c.lineWidth = Math.max(r * 0.03, m * 0.0015);
    c.stroke();
    c.fillStyle = rgba(0.14 * k * s.alpha);
    for (const d of s.drops) {
      c.beginPath();
      c.arc(cx + d.du * r, cy + d.dv * r, d.r * r, 0, Math.PI * 2);
      c.fill();
    }
  }
  /* 摺痕：一條細亮線＋一側的暗帶 */
  for (const f of plan.folds) {
    const band = m * 0.012;
    const pos = f.o === 'h' ? sheet.y + f.at * sheet.h : sheet.x + f.at * sheet.w;
    const g =
      f.o === 'h'
        ? c.createLinearGradient(0, pos, 0, pos + band * f.side)
        : c.createLinearGradient(pos, 0, pos + band * f.side, 0);
    g.addColorStop(0, `rgba(0, 0, 0, ${0.16 * k})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = g;
    if (f.o === 'h') c.fillRect(sheet.x, Math.min(pos, pos + band * f.side), sheet.w, band);
    else c.fillRect(Math.min(pos, pos + band * f.side), sheet.y, band, sheet.h);
    c.strokeStyle = `rgba(255, 255, 255, ${(dark ? 0.12 : 0.45) * k})`;
    c.lineWidth = Math.max(m * 0.0015, band * 0.15);
    c.beginPath();
    if (f.o === 'h') {
      c.moveTo(sheet.x, pos - (band * f.side) / 6);
      c.lineTo(sheet.x + sheet.w, pos - (band * f.side) / 6);
    } else {
      c.moveTo(pos - (band * f.side) / 6, sheet.y);
      c.lineTo(pos - (band * f.side) / 6, sheet.y + sheet.h);
    }
    c.stroke();
  }
  c.restore();
}
