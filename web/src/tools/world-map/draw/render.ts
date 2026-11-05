/**
 * 畫整張地圖（canvas 2D）。畫面與 PNG 用同一套畫法；畫面上把費工的部分存成圖層：
 * - 地表層：海（波紋）、海岸的光暈、陸地、四種地表的顏色與花紋、海岸線。
 * - 地形層：山與森林的圖案、濕地的蘆葦（只畫在陸地裡）。畫面上用預先畫好的小圖（sprite），PNG 用向量。
 * 其他（國的塗色與國界、城牆、格線、路線、名字、素材、地名・備註、外框）每次直接畫，拖曳時不必重畫地表。
 *
 * 畫的順序（下 → 上）：海 → 陸地與地表 → 國的塗色與國界（只在陸地上）→ 山與森林 → 國的城牆 → 格線 →
 * 路線（川、街道、航路、國界線、城牆）→ 國名 → 素材（依腳下的位置由上往下）→ 據點名 → 地名・備註 → 外框。
 */
import { hexGridPolylines, hexMetrics } from '@/core/grid';
import { NO_SHADOW, SNOW_ASSETS } from '../model/assets';
import { climateAt, type SnowAt, snowSampler } from '../model/climate';
import { centroid, riverRadii, sampleCurve, signedArea, tracePath } from '../model/geometry';
import { dockOf } from '../model/ports';
import { layoutMarks, type Mark, mountainScale, treeScale } from '../model/relief';
import { type Grid, outlineInto, traceOutlines } from '../model/terrain';
import {
  CELL,
  type DrawMode,
  FOREST,
  GRID_PX,
  MARSH,
  type MapObject,
  MOUNTAIN,
  type Pt,
  type ThemeId,
  type WorldDoc,
} from '../model/types';
import { type Audience, forAudience } from '../model/visibility';
import { drawAsset } from './assets';
import { drawFrame } from './frame';
import { drawLabel, labelStyle, nameStyle } from './labels';
import { drawMountain, drawReeds, drawTree } from './marks';
import { buildColors, deepForest, reliefColors, THEMES } from './palette';
import { surfaceTile, TILE, tilePattern, waveTile } from './surface';
import { drawWall } from './walls';

type Ctx = CanvasRenderingContext2D;

export type { Audience };

export interface Derived {
  grid: Grid;
  mode: DrawMode;
  seed: number;
  land: Path2D;
  surfaces: { value: 1 | 4 | 5 | 6; path: Path2D }[];
  snowAt: SnowAt;
  marks: (value: typeof FOREST | typeof MOUNTAIN) => Mark[];
  /** 物件位置的氣候（同一個地形重複查詢時快取） */
  climate: (x: number, y: number) => ReturnType<typeof climateAt>;
}

/** 由格子算出畫地圖要用的形狀與排法 */
export function deriveGrid(grid: Grid, mode: DrawMode, seed: number): Derived {
  const land = new Path2D();
  outlineInto(
    traceOutlines(grid.terrain, grid.cols, grid.rows, (v) => v > 0),
    mode,
    land,
  );
  const surfaces: Derived['surfaces'] = [];
  for (const value of [1, 4, 5, 6] as const) {
    if (!grid.ground.includes(value)) continue;
    const path = new Path2D();
    outlineInto(
      traceOutlines(grid.ground, grid.cols, grid.rows, (v) => v === value),
      mode,
      path,
    );
    surfaces.push({ value, path });
  }
  let snowAt: SnowAt | null = null;
  const markCache = new Map<number, Mark[]>();
  const climateCache = new Map<string, ReturnType<typeof climateAt>>();
  return {
    grid,
    mode,
    seed,
    land,
    surfaces,
    get snowAt() {
      snowAt ??= snowSampler(grid);
      return snowAt;
    },
    marks: (value) => {
      let m = markCache.get(value);
      if (!m) {
        m = grid.terrain.includes(value)
          ? layoutMarks(grid.terrain, grid.cols, grid.rows, value, seed)
          : [];
        markCache.set(value, m);
      }
      return m;
    },
    climate: (x, y) => {
      const k = `${Math.round(x)},${Math.round(y)}`;
      let c = climateCache.get(k);
      if (!c) {
        if (climateCache.size > 4000) climateCache.clear();
        c = climateAt(grid, x, y);
        climateCache.set(k, c);
      }
      return c;
    },
  };
}

const recent: { terrain: string; ground: string; mode: DrawMode; seed: number; d: Derived }[] = [];

/** 文件的地形（同一份字串只算一次） */
export function deriveDoc(doc: WorldDoc, grid: () => Grid): Derived {
  const hit = recent.find(
    (r) =>
      r.terrain === doc.terrain &&
      r.ground === doc.ground &&
      r.mode === doc.drawMode &&
      r.seed === doc.seed,
  );
  if (hit) return hit.d;
  const d = deriveGrid(grid(), doc.drawMode, doc.seed);
  recent.unshift({
    terrain: doc.terrain,
    ground: doc.ground,
    mode: doc.drawMode,
    seed: doc.seed,
    d,
  });
  if (recent.length > 6) recent.pop();
  return d;
}

/* ---------- 地表層 ---------- */

export function drawGround(ctx: Ctx, doc: WorldDoc, d: Derived, scale: number): void {
  const t = THEMES[doc.theme];
  const W = doc.cols * CELL;
  const H = doc.rows * CELL;
  ctx.save();
  ctx.fillStyle = t.sea;
  ctx.fillRect(0, 0, W, H);
  const wave = waveTile(t.wave, scale);
  const wp = tilePattern(ctx, wave.tile, wave.w);
  if (wp) {
    ctx.fillStyle = wp;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = t.wave;
  ctx.lineWidth = 14;
  ctx.lineJoin = 'round';
  ctx.stroke(d.land);
  ctx.globalAlpha = 1;
  ctx.fillStyle = t.surface[1];
  ctx.fill(d.land, 'evenodd');
  ctx.strokeStyle = t.coast;
  ctx.lineWidth = 2.3;
  ctx.stroke(d.land);
  ctx.clip(d.land, 'evenodd');
  for (const s of d.surfaces) {
    ctx.fillStyle = t.surface[s.value];
    ctx.fill(s.path, 'evenodd');
    const p = tilePattern(ctx, surfaceTile(s.value, doc.seed, scale), TILE);
    if (p) {
      ctx.fillStyle = p;
      ctx.fill(s.path, 'evenodd');
    }
  }
  ctx.restore();
}

/* ---------- 地形層（山與森林） ---------- */

const sprites = new Map<
  string,
  { c: HTMLCanvasElement; x: number; y: number; w: number; h: number }
>();
const SPRITE_RES = 3;

function sprite(key: string, box: [number, number, number, number], paint: (ctx: Ctx) => void) {
  let s = sprites.get(key);
  if (s) return s;
  if (sprites.size > 600) sprites.delete(sprites.keys().next().value!);
  const [x, y, w, h] = box;
  const c = document.createElement('canvas');
  c.width = w * SPRITE_RES;
  c.height = h * SPRITE_RES;
  const ctx = c.getContext('2d')!;
  ctx.scale(SPRITE_RES, SPRITE_RES);
  ctx.translate(-x, -y);
  paint(ctx);
  s = { c, x, y, w, h };
  sprites.set(key, s);
  return s;
}

const q = (v: number, steps: number) => Math.round(v * steps) / steps;

export function drawRelief(ctx: Ctx, doc: WorldDoc, d: Derived, vector: boolean): void {
  const theme = doc.theme;
  ctx.save();
  ctx.clip(d.land, 'evenodd');
  for (const m of d.marks(MOUNTAIN)) {
    const variant = Math.min(15, Math.floor(m.n * 16));
    const n = (variant + 0.5) / 16;
    const { sx, sy } = mountainScale(m, n);
    const raw = d.climate(m.x, m.y);
    const c = { snow: q(raw.snow, 8), desert: q(raw.desert, 8), wet: q(raw.wet, 8) };
    const wood = q(m.wood, 4);
    const colors = reliefColors(theme, c);
    if (vector) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(sx, sy);
      drawMountain(ctx, colors, n, c.snow, wood);
      ctx.restore();
    } else {
      const s = sprite(
        `m${theme}:${variant}:${c.snow}:${c.desert}:${c.wet}:${wood}`,
        [-40, -57, 80, 69],
        (g) => drawMountain(g, colors, n, c.snow, wood),
      );
      ctx.drawImage(s.c, m.x + s.x * sx, m.y + s.y * sy, s.w * sx, s.h * sy);
    }
  }
  for (const m of d.marks(FOREST)) {
    const variant = Math.min(5, Math.floor(m.n * 6));
    const n = (variant + 0.5) / 6;
    const k = treeScale(m, n);
    const snow = q(d.snowAt(m.x, m.y), 4);
    const density = q(m.depth, 4);
    const colors = deepForest(reliefColors(theme, { snow, desert: 0, wet: 0 }), density);
    if (vector) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(k, k);
      drawTree(ctx, colors, n, snow);
      ctx.restore();
    } else {
      const s = sprite(`t${theme}:${variant}:${snow}:${density}`, [-17, -18, 34, 36], (g) =>
        drawTree(g, colors, n, snow),
      );
      ctx.drawImage(s.c, m.x + s.x * k, m.y + s.y * k, s.w * k, s.h * k);
    }
  }
  /* 濕地：每 3 格一叢蘆葦 */
  const { grid } = d;
  const reed = reliefColors(theme).tree;
  const bc = buildColors(theme);
  for (let y = 2; y < grid.rows - 2; y += 3)
    for (let x = 2; x < grid.cols - 2; x += 3) {
      if (grid.terrain[y * grid.cols + x] !== MARSH) continue;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.translate(x * CELL, y * CELL);
      ctx.scale(0.4, 0.4);
      drawReeds(ctx, bc, reed, 0);
      ctx.restore();
    }
  ctx.restore();
}

/* ---------- 國 ---------- */

function polygon(pts: readonly Pt[]): Path2D {
  const p = new Path2D();
  pts.forEach((v, i) => {
    if (i) p.lineTo(v.x, v.y);
    else p.moveTo(v.x, v.y);
  });
  p.closePath();
  return p;
}

export function drawRegions(ctx: Ctx, doc: WorldDoc, d: Derived): void {
  if (!doc.regions.length) return;
  ctx.save();
  ctx.clip(d.land, 'evenodd');
  for (const r of doc.regions) {
    const path = polygon(r.points);
    ctx.globalAlpha = r.opacity;
    ctx.fillStyle = r.color;
    ctx.fill(path);
    if (!r.wall && doc.settings.borders) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 5]);
      ctx.stroke(path);
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

export function drawRegionWalls(ctx: Ctx, doc: WorldDoc, d: Derived): void {
  for (const r of doc.regions)
    if (r.wall) drawWall(ctx, r.points, true, 5.5, doc.theme, false, d.snowAt);
}

export function drawGridOverlay(ctx: Ctx, doc: WorldDoc): void {
  if (!doc.settings.grid) return;
  const t = THEMES[doc.theme];
  const W = doc.cols * CELL;
  const H = doc.rows * CELL;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (doc.settings.gridType === 'hex') {
    ctx.globalAlpha = 0.14;
    const m = hexMetrics(GRID_PX * Math.sqrt(3), { orientation: 'pointy' });
    for (const line of hexGridPolylines({ left: 0, top: 0, right: W, bottom: H }, m)) {
      line.forEach((p, i) => {
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
    }
  } else {
    ctx.globalAlpha = 0.12;
    for (let x = GRID_PX; x < W; x += GRID_PX) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = GRID_PX; y < H; y += GRID_PX) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/* ---------- 路線 ---------- */

/** 川的形狀：每個取樣點一個圓、相鄰兩點之間一個梯形（同一個繞行方向，重疊的部分不會變濃或挖空） */
export function riverRibbon(
  samples: readonly Pt[],
  radii: readonly number[],
  extra: number,
): Path2D {
  const path = new Path2D();
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const r = radii[i] + extra;
    path.moveTo(a.x + r, a.y);
    path.arc(a.x, a.y, r, 0, Math.PI * 2);
    if (i === samples.length - 1) continue;
    const b = samples[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const rb = radii[i + 1] + extra;
    let quad: Pt[] = [
      { x: a.x + nx * r, y: a.y + ny * r },
      { x: b.x + nx * rb, y: b.y + ny * rb },
      { x: b.x - nx * rb, y: b.y - ny * rb },
      { x: a.x - nx * r, y: a.y - ny * r },
    ];
    if (signedArea(quad) < 0) quad = quad.reverse();
    quad.forEach((p, k) => {
      if (k) path.lineTo(p.x, p.y);
      else path.moveTo(p.x, p.y);
    });
    path.closePath();
  }
  return path;
}

export function drawPaths(
  ctx: Ctx,
  doc: WorldDoc,
  d: Derived,
  audience: Audience,
  scale: number,
): void {
  const t = THEMES[doc.theme];
  for (const p of forAudience(doc, audience).paths) {
    if (p.kind === 'river') {
      const samples = sampleCurve(p.points, p.smooth);
      if (samples.length < 2) continue;
      const radii = riverRadii(samples, p.width);
      ctx.save();
      ctx.save();
      ctx.clip(d.land, 'evenodd');
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = t.land;
      ctx.fill(riverRibbon(samples, radii, 1.3));
      ctx.restore();
      const body = riverRibbon(samples, radii, 0);
      ctx.fillStyle = p.secret ? t.secret : t.sea;
      ctx.fill(body);
      if (!p.secret) {
        const wave = waveTile(t.wave, scale);
        const wp = tilePattern(ctx, wave.tile, wave.w);
        if (wp) {
          ctx.fillStyle = wp;
          ctx.fill(body);
        }
      }
      ctx.restore();
      continue;
    }
    if (p.kind === 'wall') {
      drawWall(ctx, p.points, false, p.width, doc.theme, p.secret, d.snowAt);
      continue;
    }
    const path = new Path2D();
    tracePath(p.points, p.smooth, path);
    const color = p.secret
      ? t.secret
      : p.kind === 'sea'
        ? t.route
        : p.kind === 'border'
          ? t.border
          : t.road;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = t.paper;
    ctx.lineWidth = p.width + 3;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = p.width;
    ctx.setLineDash(
      p.kind === 'road'
        ? [9, 5]
        : p.kind === 'sea'
          ? [2, 8]
          : p.kind === 'border'
            ? [10, 4, 2, 4]
            : [],
    );
    ctx.stroke(path);
    ctx.restore();
  }
}

/* ---------- 名字、素材、地名 ---------- */

export function drawRegionLabels(ctx: Ctx, doc: WorldDoc): void {
  if (!doc.settings.names) return;
  const t = THEMES[doc.theme];
  for (const r of doc.regions) {
    const c = centroid(r.points);
    drawLabel(ctx, {
      text: r.name,
      x: c.x + r.labelDx,
      y: c.y + r.labelDy,
      size: r.labelSize,
      style: labelStyle(doc.settings.font, r.font),
      weight: 500,
      curve: r.curve,
      tracking: 4,
      fill: t.ink,
      halo: t.halo,
      haloWidth: 4,
      haloAlpha: 0.65,
    });
  }
}

/** 素材依腳下（y＋大小 × 0.35）由上往下、同高時由左往右 */
export function objectOrder(list: readonly MapObject[]): MapObject[] {
  return list.slice().sort((a, b) => a.y + a.size * 0.35 - (b.y + b.size * 0.35) || a.x - b.x);
}

export function drawObject(ctx: Ctx, doc: WorldDoc, d: Derived, o: MapObject): void {
  const t = THEMES[doc.theme];
  const k = o.size / 48;
  ctx.save();
  ctx.translate(o.x, o.y);
  if (!NO_SHADOW.has(o.kind)) {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = doc.theme === 'night' ? '#0b2224' : t.ink;
    ctx.beginPath();
    ctx.ellipse(0, o.size * 0.34, o.size * 0.38, o.size * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.rotate((o.rotation * Math.PI) / 180);
  ctx.scale(o.flip ? -k : k, k);
  const raw = d.climate(o.x, o.y);
  const snowy = SNOW_ASSETS.has(o.kind) || o.kind === 'mountain' || o.kind === 'range';
  drawAsset(ctx, o.kind, {
    theme: doc.theme,
    climate: { ...raw, snow: snowy ? raw.snow : 0 },
    secret: o.secret,
    dock: dockOf(d.grid, o),
  });
  ctx.restore();
}

export function drawObjects(ctx: Ctx, doc: WorldDoc, d: Derived, audience: Audience): void {
  const t = THEMES[doc.theme];
  const list = objectOrder(forAudience(doc, audience).objects);
  for (const o of list) drawObject(ctx, doc, d, o);
  if (!doc.settings.names) return;
  for (const o of list) {
    if (!o.name) continue;
    drawLabel(ctx, {
      text: o.secret ? `[GM] ${o.name}` : o.name,
      x: o.x + o.labelDx,
      y: o.y + o.labelDy,
      size: 18,
      style: nameStyle(doc.settings.font),
      weight: 700,
      fill: t.ink,
      halo: t.halo,
      haloWidth: 4,
    });
  }
}

export function drawNotes(ctx: Ctx, doc: WorldDoc, audience: Audience): void {
  const t = THEMES[doc.theme];
  for (const n of forAudience(doc, audience).notes) {
    drawLabel(ctx, {
      text: n.secret ? `[GM] ${n.text}` : n.text,
      x: n.x,
      y: n.y,
      size: n.size,
      rotation: n.rotation,
      curve: n.curve,
      style: labelStyle(doc.settings.font, n.font),
      weight: 500,
      tracking: 2,
      fill: n.secret ? t.secretText : t.ink,
      halo: t.halo,
      haloWidth: 3,
      haloAlpha: 0.8,
    });
  }
}

/** 地表層以上、每次直接畫的部分 */
export function drawUpper(
  ctx: Ctx,
  doc: WorldDoc,
  d: Derived,
  audience: Audience,
  scale: number,
): void {
  drawPaths(ctx, doc, d, audience, scale);
  drawRegionLabels(ctx, doc);
  drawObjects(ctx, doc, d, audience);
  drawNotes(ctx, doc, audience);
  if (doc.settings.frame) drawFrame(ctx, doc);
}

export interface FullRenderOptions {
  audience: Audience;
  /** 1 px 地圖畫成幾 px（花紋的圖磚依這個倍率畫） */
  scale: number;
  /** 山與森林用向量畫（PNG） */
  vector: boolean;
}

/** 整張地圖（PNG、縮圖、小地圖） */
export function renderMap(ctx: Ctx, doc: WorldDoc, d: Derived, o: FullRenderOptions): void {
  drawGround(ctx, doc, d, o.scale);
  drawRegions(ctx, doc, d);
  if (doc.settings.details) drawRelief(ctx, doc, d, o.vector);
  drawRegionWalls(ctx, doc, d);
  drawGridOverlay(ctx, doc);
  drawUpper(ctx, doc, d, o.audience, o.scale);
}

export const themeColors = (theme: ThemeId) => THEMES[theme];
