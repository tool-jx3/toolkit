/**
 * 畫橫向的連結車廂（編輯畫面與匯出共用；第二批）。呼叫前先把 canvas 縮放成「1 單位＝1 格」、原點是第一節車廂的左上角
 * （車廂的頂），和建築的畫法一樣。
 *
 * 順序：紙 →（地圖本體的範圍裡）外景與軌道（環境的暗只蓋外景）、每節的車頂與底盤、連結器、車廂裡的區域（車身的外框、
 * 內牆、窗、設備）、床下、淹水（每節從地板往上）、光、格線、車廂編號、區域名、備註、折返的接續牌 → 外框線 → 紙的老舊 →
 * 圖框與標題欄 →（編輯畫面）選取與隔間的把手。
 *
 * PL 用：祕密區域畫成車廂的外板（百葉窗拉下）、床下的祕密空間畫成一般的底盤；兩種都蓋在外景之上、整塊不透明、
 * 不受環境與淹水影響（CCFOLIA 房間 ZIP 的偽裝在每個場景都一樣）。車廂裡的東西一律剪在那一間的範圍裡。
 */
import { drawPaperWear } from '@/core/paperWear';
import { CEIL_T, FLOOR_T, type Rect } from '../model/layout';
import type { CarBox, CarRoomBox, TrainLayout } from '../model/trainLayout';
import { CAR_H, CAR_W, momentOfEnv, type SectionDoc, type Train } from '../model/types';
import { nameShown, noteShown, roomLook } from '../model/visibility';
import { S } from '../strings';
import {
  drawCarCamo,
  drawCarRoomShell,
  drawCarTag,
  drawCarTop,
  drawContinuation,
  drawCoupler,
  drawRoofRoute,
  drawRunningGear,
  drawUnderCutaway,
  drawUnderframe,
} from './carParts';
import { drawFrame } from './frame';
import { box, type Kit, seg } from './kit';
import { drawFlood, drawLighting, type LightSpot } from './lighting';
import { alpha, paletteOf } from './palette';
import {
  drawNote,
  drawRoomFixtures,
  drawRoomName,
  noteShape,
  type SceneOpts,
  sceneRect,
  sealedOut,
} from './render';
import { drawScenery } from './scenery';
import { textWidth } from './text';
import { trainColors } from './trainPalette';

/** 列車的平面（備註、點選用）：車廂裡的區域＋床下的祕密空間 */
export const trainBoxes = (T: TrainLayout) => ({ rooms: [...T.rooms, ...T.unders] });

/** 車廂編號牌的字（「3 車　餐車」） */
export const carLabel = (cb: CarBox): string => `${S.train.carNo(cb.index + 1)}　${cb.car.name}`;

/** 車廂裡的隔間的把手 */
export interface CarDivider {
  carId: string;
  left: string;
  right: string;
  x: number;
  y0: number;
  y1: number;
}

export function carDividers(T: TrainLayout): CarDivider[] {
  const out: CarDivider[] = [];
  for (const cb of T.cars) {
    const row = [...cb.car.rooms].sort((a, b) => a.x0 - b.x0);
    row.forEach((r, i) => {
      const next = row[i + 1];
      if (next && r.x1 === next.x0)
        out.push({
          carId: cb.car.id,
          left: r.id,
          right: next.id,
          x: cb.x + r.x1,
          y0: cb.y,
          y1: cb.y + CAR_H,
        });
    });
  }
  return out;
}

const clipTo = (k: Kit, r: Rect) => {
  k.c.save();
  k.c.beginPath();
  k.c.rect(r.x, r.y, r.w, r.h);
  k.c.clip();
};

export function drawTrainScene(
  c: CanvasRenderingContext2D,
  doc: SectionDoc,
  t: Train,
  T: TrainLayout,
  o: SceneOpts,
): void {
  const p = paletteOf(doc.style);
  const tc = trainColors(p);
  const k: Kit = { c, p };
  const sheet = sceneRect(doc, T, o.crop);
  const w = T.world;
  const sel = o.edit?.sel ?? null;
  const gm = o.audience === 'gm';
  if (!o.transparent) {
    c.fillStyle = p.paper;
    c.fillRect(sheet.x, sheet.y, sheet.w, sheet.h);
  }
  c.save();
  c.beginPath();
  c.rect(w.x, w.y, w.w, w.h);
  c.clip();
  drawScenery(k, t, T, o.env, doc.seed, tc);

  for (const row of T.rows) {
    for (const cb of row.cars) {
      drawCarTop(k, cb, t.loco, t.roofRoute, tc, o.env);
      drawRunningGear(k, cb, row.rail, t.loco, tc);
    }
    if (t.roofRoute) drawRoofRoute(k, row);
  }
  for (const cp of T.couplers) drawCoupler(k, cp, tc);

  const lights: LightSpot[] = [];
  const hiddenGlows: LightSpot[] = [];
  /** 每一排的內部（淹水每排各自從地板往上） */
  const rowInner = T.rows.map(() => ({ open: [] as Rect[], secret: [] as Rect[] }));
  const named: { rb: CarRoomBox; gm: boolean }[] = [];
  const rowOf = new Map(T.cars.map((cb) => [cb.car.id, cb.row]));
  for (const rb of T.rooms) {
    const look = roomLook(rb, o.audience);
    if (look !== 'normal') {
      drawCarCamo(k, rb, tc);
      continue;
    }
    const secret = rb.room.secret;
    clipTo(k, rb);
    const inn = drawCarRoomShell(k, rb, t.loco, tc);
    drawRoomFixtures(k, t.items, rb, o.audience, o.env, secret ? hiddenGlows : lights, sel);
    c.restore();
    const group = rowInner[rowOf.get(rb.car.id) ?? 0];
    (secret ? group.secret : group.open).push(inn);
    if (secret && gm) {
      c.setLineDash([0.26, 0.16]);
      box(k, inn.x + 0.08, inn.y + 0.08, inn.w - 0.16, inn.h - 0.16, null, 0.07, p.gm);
      c.setLineDash([]);
    }
    if (sel?.kind === 'room' && sel.id === rb.room.id)
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
    if (doc.labels && nameShown(rb.room, o.audience)) named.push({ rb, gm: secret && gm });
  }
  /* 床下：PL 用與沒有祕密空間的車廂是一般的底盤，有的話（GM 用、公開差分用）剖開 */
  const unders = new Set(T.unders.map((u) => u.car.id));
  const underInner: Rect[] = [];
  for (const cb of T.cars) {
    if (cb.car.type === 'loco' && t.loco === 'steam') continue;
    const floor = cb.y + CAR_H;
    if (unders.has(cb.car.id) && o.audience !== 'player') {
      underInner.push(drawUnderCutaway(k, cb.x, floor, gm));
      if (doc.labels && gm) {
        const u = T.unders.find((v) => v.car.id === cb.car.id);
        if (u) named.push({ rb: u, gm: true });
      }
    } else drawUnderframe(k, cb.x, floor, tc);
  }
  /* 淹水：每節從地板往上淹到水位（車廂內部高度的百分比） */
  if (o.flood > 0)
    T.rows.forEach((row, i) => {
      const top = row.cabin + CEIL_T;
      const bottom = row.floor - FLOOR_T;
      drawFlood(k, rowInner[i].open, top, bottom, o.flood);
      drawFlood(k, rowInner[i].secret, top, bottom, o.flood);
    });
  const open = rowInner.flatMap((g) => g.open);
  const secretInner = [...rowInner.flatMap((g) => g.secret), ...underInner];
  drawLighting(k, o.env, open, lights);
  drawLighting(k, o.env, secretInner, hiddenGlows);
  if (doc.grid)
    for (const group of [open, secretInner]) {
      if (!group.length) continue;
      c.save();
      c.beginPath();
      for (const r of group) c.rect(r.x, r.y, r.w, r.h);
      c.clip();
      c.beginPath();
      for (let x = Math.ceil(w.x); x < w.x + w.w; x++) {
        c.moveTo(x, w.y);
        c.lineTo(x, w.y + w.h);
      }
      for (let y = Math.ceil(w.y); y < w.y + w.h; y++) {
        c.moveTo(w.x, y);
        c.lineTo(w.x + w.w, y);
      }
      c.strokeStyle = alpha(p.ink, 0.11);
      c.lineWidth = 0.022;
      c.stroke();
      c.restore();
    }
  if (doc.elevation)
    for (const cb of T.cars) {
      const label = carLabel(cb);
      drawCarTag(
        k,
        cb,
        label,
        Math.min(CAR_W - 1, textWidth(c, label, { size: 0.3, weight: 700 }) + 0.6),
      );
    }
  for (const { rb, gm: g } of named) drawRoomName(k, rb, g);
  const boxes = trainBoxes(T);
  const m = momentOfEnv(o.env);
  for (const n of t.notes) {
    if (!noteShown(boxes, n, o.audience, m) || (o.seal && sealedOut(boxes, n, m))) continue;
    drawNote(k, noteShape(c, boxes, n), o.audience, sel?.kind === 'note' && sel.id === n.id);
  }
  /* 兩段折返：上排的最後、下排的最前面放接續牌 */
  if (T.folded) {
    const [upper, lower] = T.rows;
    const last = upper.cars[upper.cars.length - 1];
    const first = lower.cars[0];
    if (last && first) {
      drawContinuation(
        k,
        upper.w + 0.4,
        upper.cabin + CAR_H / 2,
        S.train.toNext(first.index + 1),
        last.car.coupler,
      );
      drawContinuation(
        k,
        -2.75,
        lower.cabin + CAR_H / 2,
        S.train.toNext(last.index + 1),
        last.car.coupler,
      );
    }
  }
  if (sel?.kind === 'car') {
    const cb = T.cars.find((v) => v.car.id === sel.id);
    if (cb) {
      c.setLineDash([0.3, 0.18]);
      box(
        k,
        cb.x - 0.2,
        cb.y - 1.3,
        CAR_W + 0.4,
        CAR_H + 3.4,
        alpha(p.select, 0.05),
        0.09,
        p.select,
        0.2,
      );
      c.setLineDash([]);
    }
  }
  if (o.edit?.handles && o.audience !== 'player')
    for (const h of carDividers(T)) {
      const cy = (h.y0 + h.y1) / 2;
      box(k, h.x - 0.15, cy - 0.58, 0.3, 1.16, alpha(p.paper, 0.9), 0.04, p.ink, 0.1);
      seg(k, h.x - 0.045, cy - 0.26, h.x - 0.045, cy + 0.26, 0.028);
      seg(k, h.x + 0.045, cy - 0.26, h.x + 0.045, cy + 0.26, 0.028);
    }
  c.restore();
  box(k, w.x, w.y, w.w, w.h, null, 0.065);
  if (!o.transparent && doc.wear > 0) drawPaperWear(c, sheet, doc.seed, doc.wear / 100, p.dark);
  if (o.crop === 'sheet' && doc.frame)
    drawFrame(k, doc, sheet, {
      audience: o.audience,
      env: o.env,
      flood: o.flood,
      cars: t.cars.length,
    });
}
