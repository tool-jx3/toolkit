/**
 * 畫整張斷面圖（編輯畫面與匯出共用）。呼叫前先把 canvas 縮放成「1 單位＝1 格」、原點是建築的左上角。
 *
 * 順序：紙 → （地圖本體的範圍裡）天空、地層、屋頂、區域（內牆、設備）、太窄的縫、通道、淹水、光、格線、
 * 樓層標示、區域名、備註 → 外框線 → 紙的老舊 → 圖框與標題欄 → （編輯畫面）選取與隔間的把手。
 */
import { drawPaperWear } from '@/core/paperWear';
import { fixtureDef, lightColorOf } from '../model/catalog';
import {
  CEIL_T,
  FLOOR_T,
  interiorOf,
  isGmShaft,
  type Layout,
  type Rect,
  type RoomBox,
  touchingPairs,
  WALL_T,
} from '../model/layout';
import { clamp, ITEM_PAD } from '../model/ops';
import {
  type Audience,
  type EnvId,
  type Fixture,
  momentOfEnv,
  type Note,
  type SectionDoc,
  type SelRef,
  type WallTone,
} from '../model/types';
import {
  fixtureShown,
  nameShown,
  notePlace,
  noteShown,
  roomLook,
  shaftShown,
} from '../model/visibility';
import { drawEarth, drawSky, hatchRect } from './backdrop';
import { BREAKABLE, drawFixture } from './fixtures';
import { drawElevation, drawFrame, sheetRect } from './frame';
import { box, type Ctx, type Kit, seg } from './kit';
import { drawFlood, drawLighting, type LightSpot } from './lighting';
import { alpha, paletteOf } from './palette';
import { drawRoof } from './roof';
import { drawGmMark, drawShaft } from './shafts';
import { drawText, fitText, textWidth, wrapText } from './text';

export type Crop = 'sheet' | 'map' | 'vtt';

export interface EditOverlay {
  sel: SelRef | null;
  /** 畫隔間的把手 */
  handles: boolean;
}

export interface SceneOpts {
  audience: Audience;
  env: EnvId;
  /** 淹水的水位（0＝不畫） */
  flood: number;
  crop: Crop;
  transparent?: boolean;
  edit?: EditOverlay;
}

/** 這張圖的範圍（世界座標） */
export function sceneRect(doc: SectionDoc, L: Layout, crop: Crop): Rect {
  return crop === 'sheet' ? sheetRect(L, doc.frame) : { ...L.world };
}

/* ---------- 設備 ---------- */

export interface PlacedFixture {
  item: Fixture;
  /** 底部的中間（建築的座標） */
  x: number;
  y: number;
  scale: number;
  w: number;
  h: number;
  /** 事件後倒下時的角度（弧度） */
  tilt: number;
}

/** 設備在區域裡的位置與大小（太寬、太高時自動縮小到放得下） */
export function placeFixture(r: Rect, it: Fixture, after: boolean): PlacedFixture | null {
  const def = fixtureDef(it.kind);
  if (!def) return null;
  const top = r.y + CEIL_T;
  const bottom = r.y + r.h - FLOOR_T;
  const room = bottom - top;
  const inner = Math.max(0.8, r.w - ITEM_PAD * 2);
  /* 放不下就縮：寬度留一點邊、高度不碰到天花板 */
  const fit = Math.min(it.scale || 1, (0.92 * inner) / def.width, (0.96 * room) / def.height);
  const w = def.width * fit;
  const h = def.height * fit;
  const left = r.x + ITEM_PAD;
  const x = clamp(left + it.rx * inner, left + w / 2, left + inner - w / 2);
  const base: Record<typeof def.hang, () => number> = {
    floor: () => bottom,
    ceiling: () => top + h,
    wall: () => top + h / 2 + room * clamp(it.ry ?? 0.44, 0.18, 0.82),
  };
  const tilt = after && it.upset ? 0.314 * (it.flip ? -1 : 1) : 0;
  return { item: it, x, y: base[def.hang](), scale: fit, w, h, tilt };
}

function drawRoomFixtures(
  k: Kit,
  doc: SectionDoc,
  rb: RoomBox,
  audience: Audience,
  env: EnvId,
  lights: LightSpot[],
  sel: SelRef | null,
): void {
  const { c, p } = k;
  const m = momentOfEnv(env);
  const after = m === 'after';
  for (const it of doc.items) {
    if (it.room !== rb.room.id || !fixtureShown(it, audience, m)) continue;
    const def = fixtureDef(it.kind);
    const pl = placeFixture(rb, it, after);
    if (!def || !pl) continue;
    const color = lightColorOf(def, it.variant);
    if (def.glow && color) {
      const { radius, lift } = def.glow;
      lights.push({
        x: pl.x,
        y: pl.y + pl.scale * lift,
        r: pl.scale * radius,
        color,
        keep: !!def.backup,
      });
    }
    c.save();
    c.translate(pl.x, pl.y);
    if (pl.tilt) c.rotate(pl.tilt);
    c.scale(it.flip ? -pl.scale : pl.scale, pl.scale);
    if (p.id === 'color' && def.hang === 'floor' && !def.flat) {
      c.beginPath();
      c.ellipse(0, 0.02, def.width * 0.46, 0.07, 0, 0, Math.PI * 2);
      c.fillStyle = alpha('#565c4c', 0.28);
      c.fill();
    }
    const ceil = def.reach && !pl.tilt ? (CEIL_T + FLOOR_T - rb.h) / pl.scale : null;
    drawFixture(k, it.kind, {
      broken: after && !!it.smashed && BREAKABLE.has(it.kind),
      env,
      ceil,
      variant: it.variant,
    });
    if (sel?.kind === 'item' && sel.id === it.id) {
      c.setLineDash([0.18, 0.12]);
      box(
        k,
        -def.width / 2 - 0.1,
        -def.height - 0.1,
        def.width + 0.2,
        def.height + 0.2,
        null,
        0.08 / pl.scale,
        p.select,
      );
      c.setLineDash([]);
    }
    c.restore();
  }
}

/* ---------- 區域 ---------- */

/** 內牆的紋路 */
function wallGrain(c: Ctx, r: Rect, tone: WallTone, color: string): void {
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  c.beginPath();
  const rows = (dy: number, offset: number, dx: number) => {
    let row = 0;
    for (let y = r.y; y < r.y + r.h; y += dy, row++) {
      c.moveTo(r.x, y);
      c.lineTo(r.x + r.w, y);
      for (let x = r.x + (row % 2) * offset; x < r.x + r.w; x += dx) {
        c.moveTo(x, y);
        c.lineTo(x, y + dy);
      }
    }
  };
  if (tone === 'tile') rows(0.5, 0, 0.5);
  else if (tone === 'brick') rows(0.32, 0.4, 0.8);
  else if (tone === 'stone') rows(0.7, 0.75, 1.5);
  else if (tone === 'concrete') {
    for (let y = r.y + 1.2; y < r.y + r.h; y += 1.2) {
      c.moveTo(r.x, y);
      c.lineTo(r.x + r.w, y);
    }
    for (let x = r.x + 2; x < r.x + r.w; x += 2) {
      c.moveTo(x, r.y);
      c.lineTo(x, r.y + r.h);
    }
  } else if (tone === 'wood')
    for (let x = r.x + 0.34; x < r.x + r.w; x += 0.34) {
      c.moveTo(x, r.y);
      c.lineTo(x, r.y + r.h);
    }
  else if (tone === 'metal') {
    for (let x = r.x + 1.6; x < r.x + r.w; x += 1.6) {
      c.moveTo(x, r.y);
      c.lineTo(x, r.y + r.h);
    }
  }
  c.strokeStyle = color;
  c.lineWidth = 0.02;
  c.stroke();
  if (tone === 'metal' || tone === 'concrete') {
    const step = tone === 'metal' ? 1.6 : 2;
    c.fillStyle = color;
    for (let x = r.x + step / 2; x < r.x + r.w; x += step)
      for (let y = r.y + 0.3; y < r.y + r.h; y += 1.2) {
        c.beginPath();
        c.arc(x, y, 0.035, 0, Math.PI * 2);
        c.fill();
      }
  }
  c.restore();
}

/** PL 用：地上的祕密區域偽裝成砌石的牆 */
function drawCamo(k: Kit, r: Rect): void {
  const { c, p } = k;
  c.fillStyle = p.camo;
  c.fillRect(r.x, r.y, r.w, r.h);
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  c.beginPath();
  let row = 0;
  for (let y = r.y; y < r.y + r.h; y += 0.42, row++) {
    c.moveTo(r.x, y);
    c.lineTo(r.x + r.w, y);
    for (let x = r.x + (row % 2) * 0.85; x < r.x + r.w; x += 1.7) {
      c.moveTo(x, y);
      c.lineTo(x, y + 0.42);
    }
  }
  c.strokeStyle = alpha(p.ink, 0.22);
  c.lineWidth = 0.025;
  c.stroke();
  c.restore();
  box(k, r.x + 0.05, r.y + 0.05, r.w - 0.1, r.h - 0.1, null, 0.04);
}

function drawRoomShell(k: Kit, rb: RoomBox): Rect {
  const { c, p } = k;
  hatchRect(c, rb.x, rb.y, rb.w, rb.h, p.structure, p.hatch);
  const inn = interiorOf(rb);
  c.fillStyle = p.walls[rb.room.wall] ?? p.walls.plaster;
  c.fillRect(inn.x, inn.y, inn.w, inn.h);
  wallGrain(c, inn, rb.room.wall, p.grain);
  seg(
    k,
    inn.x,
    inn.y + inn.h * 0.68,
    inn.x + inn.w,
    inn.y + inn.h * 0.68,
    0.022,
    alpha(p.ink, 0.22),
  );
  c.fillStyle = alpha(p.structure, 0.45);
  c.fillRect(inn.x, inn.y + inn.h - 0.16, inn.w, 0.16);
  box(k, inn.x, inn.y, inn.w, inn.h, null, 0.042);
  box(k, rb.x + 0.05, rb.y + 0.05, rb.w - 0.1, rb.h - 0.1, null, 0.04);
  return inn;
}

function drawRoomName(k: Kit, rb: RoomBox, gmSecret: boolean): void {
  const { c, p } = k;
  const name = rb.room.name.trim();
  if (!name) return;
  const maxW = Math.max(1.4, rb.w - 0.36);
  const pad = 0.44;
  const raw = textWidth(c, name, { size: 1, weight: 700 });
  const size = clamp((maxW - pad) / Math.max(3.6, raw), 0.21, 0.32);
  const text = fitText(c, name, maxW - pad, { size, weight: 700 });
  const w = Math.min(maxW, Math.max(1.6, textWidth(c, text, { size, weight: 700 }) + pad));
  const cx = rb.x + rb.w / 2;
  box(k, cx - w / 2, rb.y + 0.06, w, 0.4, alpha(p.paper, 0.94), 0.03, gmSecret ? p.gm : p.ink, 0.1);
  drawText(c, text, cx, rb.y + 0.27, {
    size,
    weight: 700,
    align: 'center',
    baseline: 'middle',
    color: p.ink,
  });
}

/* ---------- 備註 ---------- */

export interface NoteShape {
  note: Note;
  /** 畫的中心 */
  x: number;
  y: number;
  /** 外框（世界座標） */
  rect: Rect;
  lines: string[];
  size: number;
  owner: RoomBox | null;
}

/** 行高（字級的倍數） */
const NOTE_LINE = 1.28;
const noteFont = (size: number) => ({ size, weight: 600 });

/** 區域裡放得了備註的範圍：四周留 edge、底下留 foot；區域夠高（4 格以上）時上面讓給區域名稱 */
function noteArea(owner: RoomBox, edge: number, foot: number): Rect {
  const head = owner.h >= 4 ? 0.56 : edge;
  return { x: owner.x + edge, y: owner.y + head, w: owner.w - 2 * edge, h: owner.h - head - foot };
}

/** 中心夾在 lo～hi 裡、兩邊各占 half；放不下就放正中間 */
const keepInside = (v: number, lo: number, hi: number, half: number): number =>
  hi - lo <= 2 * half ? (lo + hi) / 2 : clamp(v, lo + half, hi - half);

/** 備註的大小與位置（區域裡的備註收在區域裡、換行） */
export function noteShape(c: Ctx, L: Layout, n: Note): NoteShape {
  const { x: px, y: py, owner } = notePlace(L, n);
  const base = clamp(n.size || 0.46, 0.3, 1.2);
  const made = (x: number, y: number, w: number, h: number, lines: string[], size: number) => ({
    note: n,
    x,
    y,
    rect: { x: x - w / 2, y: y - h / 2, w, h },
    lines,
    size,
    owner,
  });
  if (n.style === 'badge') {
    let r = Math.max(0.45, base * 0.95);
    if (!owner) return made(px, py, 2 * r, 2 * r, [n.text], Math.min(base, r * 1.15));
    const a = noteArea(owner, 0.12, 0.14);
    r = Math.min(r, Math.max(0.28, a.w / 2 - 0.02), Math.max(0.28, Math.max(0.6, a.h) / 2 - 0.06));
    return made(
      keepInside(px, a.x, a.x + a.w, r),
      keepInside(py, a.y, a.y + a.h, r + 0.04),
      2 * r,
      2 * r,
      [n.text],
      Math.min(base, r * 1.15),
    );
  }
  const single = Math.max(2, textWidth(c, n.text, noteFont(base)) + 0.65);
  if (!owner) return made(px, py, single, base * 1.8, [n.text], base);
  const a = noteArea(owner, 0.14, 0.16);
  const roomW = Math.max(1.2, a.w);
  const roomH = Math.max(0.8, a.h);
  /* 一行放不下時字縮小、換行 */
  const size = single > roomW ? Math.min(base, clamp(base * 0.74, 0.24, 0.32)) : base;
  const lh = size * NOTE_LINE;
  const rows = clamp(Math.floor((roomH - 0.24) / lh), 1, 8);
  const lines = wrapText(c, n.text, Math.max(0.8, roomW - 0.42), noteFont(size), rows);
  const widest = lines.reduce((m, l) => Math.max(m, textWidth(c, l, noteFont(size))), size);
  const w = Math.min(roomW, Math.max(1.6, widest + 0.48));
  const h = Math.min(roomH, lh * lines.length + 0.3);
  return made(
    keepInside(px, a.x, a.x + a.w, w / 2),
    keepInside(py, a.y, a.y + a.h, h / 2 + 0.04),
    w,
    h,
    lines,
    size,
  );
}

function drawNote(k: Kit, sh: NoteShape, audience: Audience, selected: boolean): void {
  const { c, p } = k;
  const n = sh.note;
  const gmMark = n.secret && audience === 'gm';
  const stroke = selected ? p.select : gmMark ? p.gm : p.ink;
  c.save();
  if (sh.owner) {
    c.beginPath();
    c.rect(sh.owner.x + 0.05, sh.owner.y + 0.05, sh.owner.w - 0.1, sh.owner.h - 0.1);
    c.clip();
  }
  if (gmMark) c.setLineDash([0.14, 0.08]);
  if (n.style === 'badge') {
    const r = sh.rect.w / 2;
    c.beginPath();
    c.arc(sh.x, sh.y, r, 0, Math.PI * 2);
    c.fillStyle = p.paper;
    c.fill();
    c.lineWidth = selected ? 0.08 : 0.045;
    c.strokeStyle = stroke;
    c.stroke();
    c.setLineDash([]);
    drawText(
      c,
      fitText(c, sh.lines[0], r * 1.8, { size: sh.size, weight: 700 }),
      sh.x,
      sh.y + 0.02,
      {
        size: sh.size,
        weight: 700,
        align: 'center',
        baseline: 'middle',
        color: p.ink,
      },
    );
  } else {
    box(
      k,
      sh.rect.x,
      sh.rect.y,
      sh.rect.w,
      sh.rect.h,
      alpha(p.paper, 0.93),
      selected ? 0.08 : 0.038,
      stroke,
      0.14,
    );
    c.setLineDash([]);
    const lineH = sh.size * NOTE_LINE;
    const start = sh.y + 0.02 - (lineH * (sh.lines.length - 1)) / 2;
    sh.lines.forEach((l, i) => {
      drawText(c, l, sh.x, start + i * lineH, {
        size: sh.size,
        weight: 600,
        align: 'center',
        baseline: 'middle',
        color: p.ink,
      });
    });
  }
  c.restore();
}

/* ---------- 隔間的把手 ---------- */

export interface DividerHandle {
  floorId: string;
  left: string;
  right: string;
  x: number;
  y0: number;
  y1: number;
}

export function dividerHandles(L: Layout): DividerHandle[] {
  return L.floors.flatMap((f) =>
    touchingPairs(f.floor.rooms).map(([l, r]) => ({
      floorId: f.floor.id,
      left: l.id,
      right: r.id,
      x: l.x1,
      y0: f.y0,
      y1: f.y1,
    })),
  );
}

/* ---------- 整張 ---------- */

export function drawScene(c: Ctx, doc: SectionDoc, L: Layout, o: SceneOpts): void {
  const p = paletteOf(doc.style);
  const k: Kit = { c, p };
  const sheet = sceneRect(doc, L, o.crop);
  const w = L.world;
  const sel = o.edit?.sel ?? null;
  if (!o.transparent) {
    c.fillStyle = p.paper;
    c.fillRect(sheet.x, sheet.y, sheet.w, sheet.h);
  }
  c.save();
  c.beginPath();
  c.rect(w.x, w.y, w.w, w.h);
  c.clip();
  drawSky(k, doc, L, o.env);
  drawEarth(k, doc, L);
  drawRoof(k, doc, L);

  const lights: LightSpot[] = [];
  const secretLights: LightSpot[] = [];
  const interiors: Rect[] = [];
  const secretInteriors: Rect[] = [];
  const named: { rb: RoomBox; gm: boolean }[] = [];
  for (const rb of L.rooms) {
    const look = roomLook(rb, o.audience);
    if (look === 'hidden') continue;
    if (look === 'camo') {
      drawCamo(k, rb);
      continue;
    }
    const secret = rb.room.secret;
    const inn = drawRoomShell(k, rb);
    (secret ? secretInteriors : interiors).push(inn);
    drawRoomFixtures(k, doc, rb, o.audience, o.env, secret ? secretLights : lights, sel);
    if (secret && o.audience === 'gm') {
      c.setLineDash([0.26, 0.16]);
      box(k, inn.x + 0.08, inn.y + 0.08, inn.w - 0.16, inn.h - 0.16, null, 0.07, p.gm);
      c.setLineDash([]);
    }
    if (sel?.kind === 'room' && sel.id === rb.room.id) {
      box(
        k,
        rb.x + 0.06,
        rb.y + 0.06,
        rb.w - 0.12,
        rb.h - 0.12,
        alpha(p.select, 0.08),
        0.09,
        p.select,
      );
    }
    if (doc.labels && nameShown(rb.room, o.audience))
      named.push({ rb, gm: secret && o.audience === 'gm' });
  }
  /* 太窄、放不下區域的縫畫成牆 */
  for (const f of L.floors)
    for (const g of f.gaps) {
      hatchRect(c, g.x0, f.y0, g.x1 - g.x0, f.y1 - f.y0, p.structure, p.hatch);
      box(k, g.x0, f.y0, g.x1 - g.x0, f.y1 - f.y0, null, 0.035);
    }
  for (const s of L.shafts) {
    if (!shaftShown(s.shaft, o.audience)) continue;
    const gmOnly = isGmShaft(s.shaft);
    if (!gmOnly)
      interiors.push({
        x: s.x + WALL_T,
        y: s.y + CEIL_T,
        w: s.w - WALL_T * 2,
        h: s.h - CEIL_T - FLOOR_T,
      });
    drawShaft(k, L, s, o.env);
    if (gmOnly && s.shaft.kind !== 'duct') drawGmMark(k, s);
    if (sel?.kind === 'shaft' && sel.id === s.shaft.id) {
      c.setLineDash([0.28, 0.16]);
      box(k, s.x + 0.05, s.y + 0.05, s.w - 0.1, s.h - 0.1, null, 0.1, p.select);
      c.setLineDash([]);
    }
  }
  /* 淹水（地下的部分；沒有地下時整棟） */
  if (o.flood > 0) {
    const top = L.totalH > L.glY ? L.glY : 0;
    drawFlood(k, interiors, top, L.totalH, o.flood);
    drawFlood(k, secretInteriors, top, L.totalH, o.flood);
  }
  drawLighting(k, o.env, interiors, lights);
  drawLighting(k, o.env, secretInteriors, secretLights);
  if (doc.grid) {
    for (const group of [interiors, secretInteriors]) {
      if (!group.length) continue;
      c.save();
      c.beginPath();
      for (const r of group) c.rect(r.x, r.y, r.w, r.h);
      c.clip();
      c.beginPath();
      for (let x = 1; x < L.width; x++) {
        c.moveTo(x, 0);
        c.lineTo(x, L.totalH);
      }
      for (let y = 1; y < L.totalH; y++) {
        c.moveTo(0, y);
        c.lineTo(L.width, y);
      }
      c.strokeStyle = alpha(p.ink, 0.11);
      c.lineWidth = 0.022;
      c.stroke();
      c.restore();
    }
  }
  if (doc.elevation) drawElevation(k, L);
  for (const { rb, gm } of named) drawRoomName(k, rb, gm);
  const m = momentOfEnv(o.env);
  for (const n of doc.notes) {
    if (!noteShown(L, n, o.audience, m)) continue;
    drawNote(k, noteShape(c, L, n), o.audience, sel?.kind === 'note' && sel.id === n.id);
  }
  if (o.edit?.handles && o.audience !== 'player') {
    for (const h of dividerHandles(L)) {
      const cy = (h.y0 + h.y1) / 2;
      box(k, h.x - 0.15, cy - 0.58, 0.3, 1.16, alpha(p.paper, 0.9), 0.04, p.ink, 0.1);
      seg(k, h.x - 0.045, cy - 0.26, h.x - 0.045, cy + 0.26, 0.028);
      seg(k, h.x + 0.045, cy - 0.26, h.x + 0.045, cy + 0.26, 0.028);
    }
  }
  c.restore();
  box(k, w.x, w.y, w.w, w.h, null, 0.065);
  if (!o.transparent && doc.wear > 0) drawPaperWear(c, sheet, doc.seed, doc.wear / 100, p.dark);
  if (o.crop === 'sheet' && doc.frame)
    drawFrame(k, doc, sheet, { audience: o.audience, env: o.env, flood: o.flood });
}
