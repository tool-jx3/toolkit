/**
 * 車廂的各部分（本站自己的圖形；單位是格）：
 * - 車頂：一般車廂是低的弧形車頂＋雨水溝＋香菇形的通風口；車頂的移動路線是沿著車頂的虛線（車廂之間畫跳過去的弧），
 *   艙口是撐開的蓋子。蒸氣機關車：前面的煙囪（直的、有帽子）、汽包、往後飄的三團煙、駕駛室的平頂；
 *   電氣機關車：平頂、單臂的集電弓、駕駛室上面的電阻器箱。
 * - 車身的區域：外框是車身的顏色（不是建築的斜線），內牆、窗（依車廂的種類：個室與餐車有窗簾、臥鋪半放的百葉窗、
 *   沙龍是拱形的高窗、客車一排窗、護送車有鐵條…）；展望台沒有後面的牆、斜格的欄杆、從頂篷吊下來的提燈。
 * - PL 用的祕密區域：車廂的外板（看不到裡面）、窗的百葉窗全部拉下、腰帶、接縫。
 * - 底盤：側梁、前後的轉向架（板彈簧、軸箱、兩個車輪），中間的床下（電池箱、空氣筒、水箱；整塊不透明）；
 *   床下的祕密空間（GM 用、公開差分用）：剖開的低矮空間、捲起的鋪蓋、提燈、木箱、天花板的活板門。
 *   蒸氣機關車：前面一個導輪、兩個大動輪與連桿、汽缸、後面一個從輪；電氣機關車兩個轉向架。
 * - 連結器：車廂之間的風檔（摺子）與下面的連結器；上鎖畫掛鎖、鐵柵畫鐵條、分離時風檔拿掉、連結器分開。
 */
import { interiorOf, type Rect, WALL_T } from '../model/layout';
import type { CarBox, CarRoomBox, CouplerBox, RowBox } from '../model/trainLayout';
import {
  CAR_H,
  CAR_W,
  type Car,
  type CarRoom,
  type Coupler,
  type EnvId,
  type LocoKind,
} from '../model/types';
import { box, dot, type Kit, poly, seg, shape } from './kit';
import { alpha, mix } from './palette';
import { drawText } from './text';
import type { TrainColors } from './trainPalette';
import { wallGrain } from './walls';

/* ---------- 窗 ---------- */

type WinStyle = 'plain' | 'curtain' | 'blind' | 'arch' | 'bars';
interface WinRow {
  w: number;
  h: number;
  /** 窗的上緣離內部頂端多遠 */
  top: number;
  /** 窗與窗的間隔（中心到中心） */
  gap: number;
  style: WinStyle;
}

const WINDOWS: Record<Exclude<Car['type'], 'loco'>, WinRow> = {
  suite: { w: 1.6, h: 1.4, top: 0.85, gap: 2.6, style: 'curtain' },
  berth: { w: 1.1, h: 0.9, top: 0.5, gap: 1.8, style: 'blind' },
  dining: { w: 2.0, h: 1.5, top: 0.75, gap: 2.8, style: 'curtain' },
  lounge: { w: 1.3, h: 2.1, top: 0.55, gap: 2.2, style: 'arch' },
  coach: { w: 1.2, h: 1.3, top: 0.8, gap: 1.75, style: 'plain' },
  baggage: { w: 0.9, h: 0.6, top: 0.4, gap: 4.5, style: 'plain' },
  observation: { w: 2.3, h: 2.0, top: 0.6, gap: 3.0, style: 'plain' },
  escort: { w: 0.8, h: 0.8, top: 0.7, gap: 3.0, style: 'bars' },
};

/** 這一間的窗（世界座標的矩形＋樣子）；機關車的駕駛室一扇、機器室沒有窗 */
export function windowsOf(car: Car, room: CarRoom, inn: Rect): { r: Rect; style: WinStyle }[] {
  if (room.role === 'deck') return [];
  let row: WinRow;
  if (car.type === 'loco') {
    if (room.role !== 'cab') return [];
    row = { w: 1.5, h: 1.3, top: 0.55, gap: 99, style: 'plain' };
  } else row = WINDOWS[car.type];
  const n = Math.max(1, Math.floor((inn.w - 0.3) / row.gap));
  const w = Math.min(row.w, inn.w - 0.5);
  if (w < 0.4) return [];
  return Array.from({ length: n }, (_, i) => ({
    r: { x: inn.x + (inn.w * (i + 0.5)) / n - w / 2, y: inn.y + row.top, w, h: row.h },
    style: row.style,
  }));
}

function glassPath(k: Kit, r: Rect, arch: boolean): void {
  const { c } = k;
  if (arch) {
    const rad = r.w / 2;
    c.moveTo(r.x, r.y + r.h);
    c.lineTo(r.x, r.y + rad);
    c.arc(r.x + rad, r.y + rad, rad, Math.PI, 0);
    c.lineTo(r.x + r.w, r.y + r.h);
    c.closePath();
  } else c.roundRect(r.x, r.y, r.w, r.h, Math.min(0.16, r.w * 0.2));
}

function drawWindow(k: Kit, r: Rect, style: WinStyle, tc: TrainColors): void {
  const { c, p } = k;
  shape(k, () => glassPath(k, r, style === 'arch'), tc.glass, 0.035);
  c.save();
  c.beginPath();
  glassPath(k, r, style === 'arch');
  c.clip();
  seg(k, r.x, r.y + r.h * 0.4, r.x + r.w, r.y + r.h * 0.4, 0.025, alpha(p.ink, 0.7));
  seg(
    k,
    r.x + r.w * 0.22,
    r.y + r.h * 0.85,
    r.x + r.w * 0.62,
    r.y + r.h * 0.15,
    0.03,
    alpha('#ffffff', 0.5),
  );
  if (style === 'blind') {
    box(k, r.x, r.y, r.w, r.h * 0.48, tc.blind, 0.02);
    for (let y = r.y + 0.1; y < r.y + r.h * 0.46; y += 0.1)
      seg(k, r.x, y, r.x + r.w, y, 0.012, alpha(p.ink, 0.35));
  }
  if (style === 'bars')
    for (let i = 1; i < 4; i++)
      seg(k, r.x + (r.w * i) / 4, r.y, r.x + (r.w * i) / 4, r.y + r.h, 0.05, p.iron);
  c.restore();
  if (style === 'curtain')
    for (const side of [-1, 1]) {
      const x = side < 0 ? r.x - 0.12 : r.x + r.w + 0.12;
      const inner = x - side * 0.42;
      shape(
        k,
        () => {
          c.moveTo(x, r.y - 0.1);
          c.lineTo(inner, r.y - 0.1);
          c.quadraticCurveTo(x - side * 0.1, r.y + r.h * 0.5, x - side * 0.05, r.y + r.h + 0.12);
          c.lineTo(x, r.y + r.h + 0.12);
          c.closePath();
        },
        alpha(p.fabric, 0.7),
        0.022,
      );
      dot(k, x - side * 0.14, r.y + r.h * 0.55, 0.05, p.gilt, 0.012);
    }
  if (style === 'curtain' || style === 'arch')
    seg(k, r.x - 0.25, r.y - 0.1, r.x + r.w + 0.25, r.y - 0.1, 0.035, p.gilt);
}

/** PL 用的祕密區域：車廂的外板（百葉窗全部拉下）；看不到裡面，在每個場景都一樣 */
export function drawCarCamo(k: Kit, rb: CarRoomBox, tc: TrainColors): void {
  const { c, p } = k;
  const body = tc.livery[rb.car.type];
  box(k, rb.x, rb.y, rb.w, rb.h, body, 0);
  c.save();
  c.beginPath();
  c.rect(rb.x, rb.y, rb.w, rb.h);
  c.clip();
  for (const { r, style } of windowsOf(rb.car, rb.room, interiorOf(rb))) {
    shape(k, () => glassPath(k, r, style === 'arch'), tc.blind, 0.035);
    for (let y = r.y + 0.1; y < r.y + r.h; y += 0.12)
      seg(k, r.x, y, r.x + r.w, y, 0.012, alpha(p.ink, 0.3));
  }
  box(k, rb.x, rb.y + rb.h * 0.6, rb.w, 0.2, alpha(p.gilt, 0.8), 0);
  for (let x = rb.x + 2.3; x < rb.x + rb.w - 0.3; x += 2.3)
    seg(k, x, rb.y + 0.1, x, rb.y + rb.h - 0.1, 0.02, alpha(p.ink, 0.3));
  for (let x = rb.x + 0.35; x < rb.x + rb.w - 0.2; x += 0.55) {
    dot(k, x, rb.y + 0.28, 0.035, alpha(p.ink, 0.35), 0);
    dot(k, x, rb.y + rb.h - 0.25, 0.035, alpha(p.ink, 0.35), 0);
  }
  c.restore();
  box(k, rb.x + 0.05, rb.y + 0.05, rb.w - 0.1, rb.h - 0.1, null, 0.04);
}

/* ---------- 區域 ---------- */

/** 車廂裡的一間：車身的外框、內牆、窗；回傳內部（光、淹水、格線用） */
export function drawCarRoomShell(k: Kit, rb: CarRoomBox, loco: LocoKind, tc: TrainColors): Rect {
  const { c, p } = k;
  const body = tc.livery[rb.car.type];
  box(k, rb.x, rb.y, rb.w, rb.h, body, 0);
  seg(k, rb.x, rb.y + 0.27, rb.x + rb.w, rb.y + 0.27, 0.04, alpha(p.gilt, 0.85));
  const inn = interiorOf(rb);
  if (rb.room.role === 'deck') {
    /* 展望台：沒有後面的牆，外面看得到天空；斜格的欄杆、頂篷吊下來的提燈 */
    const open = { ...inn, w: inn.w + WALL_T };
    box(k, open.x, open.y, open.w, open.h, alpha(tc.glass, 0.45), 0);
    const railTop = open.y + open.h - 1.2;
    c.save();
    c.beginPath();
    c.rect(open.x, railTop, open.w, 1.2);
    c.clip();
    c.beginPath();
    for (let x = open.x - 1.2; x < open.x + open.w + 1.2; x += 0.5) {
      c.moveTo(x, railTop);
      c.lineTo(x + 1.2, railTop + 1.2);
      c.moveTo(x + 1.2, railTop);
      c.lineTo(x, railTop + 1.2);
    }
    c.strokeStyle = alpha(p.ink, 0.7);
    c.lineWidth = 0.03;
    c.stroke();
    c.restore();
    seg(k, open.x, railTop, open.x + open.w, railTop, 0.07, p.gilt);
    seg(k, rb.x + rb.w - 0.08, inn.y, rb.x + rb.w - 0.08, inn.y + inn.h, 0.07, body);
    const lx = rb.x + rb.w - 0.55;
    seg(k, lx, inn.y, lx, inn.y + 0.5, 0.02);
    box(k, lx - 0.15, inn.y + 0.5, 0.3, 0.36, p.amber, 0.025, p.ink, 0.05);
    box(k, open.x, open.y, open.w, open.h, null, 0.035);
    return inn;
  }
  c.fillStyle = p.walls[rb.room.wall] ?? p.walls.wood;
  c.fillRect(inn.x, inn.y, inn.w, inn.h);
  wallGrain(c, inn, rb.room.wall, p.grain);
  if (hasLouver(rb.car, rb.room, loco)) {
    /* 電氣機關車的機器室：牆上的通風百葉 */
    const lw = Math.min(2.4, inn.w * 0.4);
    const lx = inn.x + (inn.w - lw) / 2;
    box(k, lx, inn.y + 0.5, lw, 1.2, alpha(p.iron, 0.4), 0.03);
    for (let x = lx + 0.15; x < lx + lw - 0.1; x += 0.2)
      seg(k, x, inn.y + 0.6, x, inn.y + 1.6, 0.03, alpha(p.ink, 0.5));
  }
  for (const w of windowsOf(rb.car, rb.room, inn)) drawWindow(k, w.r, w.style, tc);
  seg(
    k,
    inn.x,
    inn.y + inn.h * 0.62,
    inn.x + inn.w,
    inn.y + inn.h * 0.62,
    0.022,
    alpha(p.ink, 0.22),
  );
  c.fillStyle = alpha(mix(body, p.ink, 0.3), 0.45);
  c.fillRect(inn.x, inn.y + inn.h - 0.16, inn.w, 0.16);
  box(k, inn.x, inn.y, inn.w, inn.h, null, 0.042);
  box(k, rb.x + 0.05, rb.y + 0.05, rb.w - 0.1, rb.h - 0.1, null, 0.04);
  return inn;
}

/** 電氣機關車的機器室才畫通風百葉（蒸氣的鍋爐室沒有） */
export const hasLouver = (car: Car, room: CarRoom, loco: LocoKind): boolean =>
  car.type === 'loco' && room.role === 'engine' && loco === 'electric';

/* ---------- 車頂與機關車的外形 ---------- */

function drawRoof(
  k: Kit,
  x: number,
  top: number,
  w: number,
  tc: TrainColors,
  roofColor: string,
): void {
  const { c, p } = k;
  shape(
    k,
    () => {
      c.moveTo(x + 0.05, top);
      c.lineTo(x + 0.05, top - 0.35);
      c.quadraticCurveTo(x + w / 2, top - 1.25, x + w - 0.05, top - 0.35);
      c.lineTo(x + w - 0.05, top);
      c.closePath();
    },
    roofColor,
    0.05,
  );
  seg(k, x + 0.1, top - 0.3, x + w - 0.1, top - 0.3, 0.025, alpha(p.ink, 0.55));
  for (const vx of [x + 2.4, x + w / 2 + 1.6, x + w - 2.4]) {
    const vy = top - 0.35 - 0.45 * (1 - ((vx - x - w / 2) / (w / 2)) ** 2);
    seg(k, vx, vy + 0.05, vx, vy - 0.2, 0.06);
    shape(k, () => c.ellipse(vx, vy - 0.22, 0.32, 0.14, 0, Math.PI, 0), tc.wheel, 0.03);
  }
}

/** 車頂的弧線上某個 x 的高度（艙口、移動路線用） */
const roofY = (x: number, top: number, cx: number, half: number) =>
  top - 0.35 - 0.45 * (1 - ((x - cx) / half) ** 2);

function drawSteamTop(k: Kit, cb: CarBox, cabX: number, tc: TrainColors, env: EnvId): void {
  const { c, p } = k;
  const { x, y: top } = cb;
  shape(
    k,
    () => {
      c.moveTo(x + 0.05, top);
      c.lineTo(x + 0.05, top - 0.35);
      c.quadraticCurveTo(x + 0.1, top - 0.6, x + 0.5, top - 0.6);
      c.lineTo(cabX - 0.1, top - 0.6);
      c.lineTo(cabX - 0.1, top);
      c.closePath();
    },
    mix(tc.livery.loco, p.ink, 0.2),
    0.05,
  );
  for (const bx of [x + 2.6, x + 5.2]) seg(k, bx, top - 0.58, bx, top, 0.04, alpha(p.gilt, 0.9));
  /* 煙囪（直的、有帽子） */
  poly(
    k,
    [x + 1.1, top - 0.58, x + 1.25, top - 1.7, x + 1.85, top - 1.7, x + 2.0, top - 0.58],
    tc.chassis,
    0.045,
  );
  box(k, x + 1.0, top - 1.92, 1.1, 0.24, tc.chassis, 0.04, p.ink, 0.06);
  /* 汽包 */
  shape(k, () => c.ellipse(x + 4.2, top - 0.6, 0.6, 0.5, 0, Math.PI, 0), p.gilt, 0.04);
  seg(k, x + 6.3, top - 0.6, x + 6.3, top - 1.05, 0.05);
  shape(k, () => c.ellipse(x + 6.3, top - 1.1, 0.12, 0.07, 0, 0, Math.PI * 2), p.gilt, 0.02);
  /* 駕駛室的平頂（後面多出來一點） */
  box(
    k,
    cabX - 0.15,
    top - 0.6,
    x + CAR_W - cabX + 0.45,
    0.6,
    mix(tc.livery.loco, p.ink, 0.1),
    0.05,
    p.ink,
    0.12,
  );
  /* 往後飄的三團煙 */
  for (const [dx, dy, r] of [
    [1.7, 2.35, 0.38],
    [2.6, 2.95, 0.5],
    [3.9, 3.35, 0.56],
  ])
    shape(
      k,
      () => c.arc(x + dx, top - dy, r, 0, Math.PI * 2),
      alpha(tc.smoke, 0.88),
      0.02,
      alpha(p.ink, 0.4),
    );
  drawHeadlamp(k, x - 0.38, top + 0.55, env);
}

function drawHeadlamp(k: Kit, x: number, y: number, env: EnvId): void {
  const { c, p } = k;
  const lit = env !== 'day';
  if (lit) {
    const g = c.createRadialGradient(x, y + 0.25, 0, x, y + 0.25, 1.4);
    g.addColorStop(0, alpha(p.amber, 0.5));
    g.addColorStop(1, alpha(p.amber, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y + 0.25, 1.4, 0, Math.PI * 2);
    c.fill();
  }
  box(k, x - 0.02, y, 0.42, 0.5, p.iron, 0.03, p.ink, 0.06);
  dot(k, x + 0.12, y + 0.25, 0.14, lit ? p.amber : p.ironLit, 0.025);
}

function drawElectricTop(k: Kit, cb: CarBox, tc: TrainColors, env: EnvId): void {
  const { c, p } = k;
  const { x, y: top } = cb;
  box(
    k,
    x + 0.1,
    top - 0.45,
    CAR_W - 0.2,
    0.45,
    mix(tc.livery.loco, p.ink, 0.15),
    0.05,
    p.ink,
    0.25,
  );
  /* 電阻器箱 */
  box(k, x + 1.2, top - 0.85, 2.6, 0.4, tc.wheel, 0.035);
  for (let fx = x + 1.4; fx < x + 3.7; fx += 0.25)
    seg(k, fx, top - 0.82, fx, top - 0.48, 0.02, alpha(p.ink, 0.6));
  /* 單臂的集電弓 */
  const px = x + 10;
  for (const ix of [px - 0.6, px + 0.6]) {
    box(k, ix - 0.08, top - 0.75, 0.16, 0.3, p.paper, 0.025);
    seg(k, ix - 0.12, top - 0.62, ix + 0.12, top - 0.62, 0.02);
  }
  seg(k, px - 0.7, top - 0.75, px + 0.7, top - 0.75, 0.05);
  seg(k, px - 0.5, top - 0.78, px + 0.75, top - 1.3, 0.05);
  seg(k, px + 0.75, top - 1.3, px - 0.2, top - 1.65, 0.045);
  seg(k, px - 0.8, top - 1.67, px + 0.4, top - 1.67, 0.06);
  for (const hx of [px - 0.8, px + 0.4]) {
    const dir = hx < px ? -1 : 1;
    shape(
      k,
      () => {
        c.moveTo(hx, top - 1.67);
        c.quadraticCurveTo(hx + dir * 0.25, top - 1.67, hx + dir * 0.3, top - 1.5);
      },
      null,
      0.035,
    );
  }
  drawHeadlamp(k, x - 0.38, top + 1.0, env);
  poly(k, [x, cb.y + CAR_H, x - 0.5, cb.y + CAR_H + 1.6, x, cb.y + CAR_H + 1.6], tc.chassis, 0.04);
}

/** 車頂（含機關車的外形）、車頂的艙口 */
export function drawCarTop(
  k: Kit,
  cb: CarBox,
  loco: LocoKind,
  route: boolean,
  tc: TrainColors,
  env: EnvId,
): void {
  const { c, p } = k;
  const car = cb.car;
  if (car.type === 'loco') {
    if (loco === 'steam') {
      const cab = car.rooms.find((r) => r.role === 'cab');
      drawSteamTop(k, cb, cb.x + (cab && cab.x0 > 0 ? cab.x0 : 8), tc, env);
    } else drawElectricTop(k, cb, tc, env);
    return;
  }
  drawRoof(k, cb.x, cb.y, CAR_W, tc, p.roofing);
  if (route && car.hatch) {
    /* 撐開的艙口 */
    const hx = cb.x + 4;
    const hy = roofY(hx, cb.y, cb.x + CAR_W / 2, CAR_W / 2);
    box(k, hx - 0.5, hy - 0.12, 1.0, 0.14, tc.chassis, 0.03);
    c.save();
    c.translate(hx + 0.5, hy - 0.12);
    c.rotate(-0.85);
    box(k, -1.0, -0.1, 1.0, 0.1, tc.wheel, 0.03);
    c.restore();
    seg(k, hx + 0.1, hy - 0.12, hx - 0.1, hy - 0.62, 0.025);
  }
}

/** 車頂的移動路線：沿著每一排的車頂走的虛線（車廂之間畫跳過去的弧） */
export function drawRoofRoute(k: Kit, row: RowBox): void {
  const { c, p } = k;
  const cars = row.cars.filter((cb) => cb.car.type !== 'loco');
  if (!cars.length) return;
  c.save();
  c.setLineDash([0.32, 0.18]);
  c.lineCap = 'round';
  c.beginPath();
  cars.forEach((cb, i) => {
    const a = cb.x + 0.7;
    const b = cb.x + CAR_W - 0.7;
    const y = cb.y - 1.05;
    if (i === 0 || cars[i - 1].x + CAR_W + 1 !== cb.x) c.moveTo(a, y);
    else c.quadraticCurveTo(cb.x - 0.5, y - 0.6, a, y);
    c.lineTo(b, y);
  });
  c.strokeStyle = alpha(p.alarm, 0.75);
  c.lineWidth = 0.07;
  c.stroke();
  c.restore();
  for (const cb of cars) {
    const x = cb.x + CAR_W - 1.0;
    poly(
      k,
      [x - 0.2, cb.y - 1.25, x + 0.15, cb.y - 1.05, x - 0.2, cb.y - 0.85],
      alpha(p.alarm, 0.75),
      0,
    );
  }
}

/* ---------- 底盤 ---------- */

function wheel(k: Kit, x: number, y: number, r: number, tc: TrainColors): void {
  const { c } = k;
  dot(k, x, y, r, tc.wheel, 0.045);
  dot(k, x, y, r * 0.72, null, 0.02, alpha(k.p.ink, 0.6));
  dot(k, x, y, r * 0.2, tc.chassis, 0.02);
  c.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + 0.5;
    c.moveTo(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2);
    c.lineTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72);
  }
  c.strokeStyle = alpha(k.p.ink, 0.6);
  c.lineWidth = 0.025;
  c.stroke();
}

/** 轉向架：板彈簧、軸箱、兩個車輪 */
function bogie(k: Kit, bx: number, floor: number, rail: number, tc: TrainColors): void {
  const { c, p } = k;
  const wy = rail - 0.5;
  for (const wx of [bx + 0.62, bx + 1.88]) wheel(k, wx, wy, 0.5, tc);
  poly(
    k,
    [
      bx + 0.05,
      floor + 0.55,
      bx + 2.45,
      floor + 0.55,
      bx + 2.3,
      floor + 1.05,
      bx + 0.2,
      floor + 1.05,
    ],
    tc.chassis,
    0.04,
  );
  for (const wx of [bx + 0.62, bx + 1.88]) box(k, wx - 0.18, wy - 0.2, 0.36, 0.32, tc.wheel, 0.025);
  for (let i = 0; i < 3; i++)
    shape(
      k,
      () => {
        c.moveTo(bx + 0.75 + i * 0.05, floor + 0.42 + i * 0.07);
        c.quadraticCurveTo(
          bx + 1.25,
          floor + 0.62 + i * 0.07,
          bx + 1.75 - i * 0.05,
          floor + 0.42 + i * 0.07,
        );
      },
      null,
      0.03,
      p.ink,
    );
}

/** 床下（前後轉向架之間 8 × 2 格）：機器箱、空氣筒、水箱；整塊不透明（PL 用的偽裝在每個場景都一樣） */
export function drawUnderframe(k: Kit, x: number, floor: number, tc: TrainColors): void {
  const { p } = k;
  const zx = x + 3;
  box(k, zx, floor, 8, 2, mix(tc.chassis, p.ink, 0.25), 0);
  box(k, zx + 0.4, floor + 0.3, 2.2, 0.9, tc.wheel, 0.035, p.ink, 0.06);
  for (let fx = zx + 0.65; fx < zx + 2.5; fx += 0.3)
    seg(k, fx, floor + 0.4, fx, floor + 1.1, 0.02, alpha(p.ink, 0.5));
  box(k, zx + 3.0, floor + 0.45, 2.4, 0.6, tc.wheel, 0.035, p.ink, 0.3);
  seg(k, zx + 3.0, floor + 0.75, zx + 5.4, floor + 0.75, 0.02, alpha(p.ink, 0.45));
  box(k, zx + 5.8, floor + 0.3, 1.8, 1.1, mix(tc.wheel, p.paper, 0.15), 0.035, p.ink, 0.05);
  dot(k, zx + 6.7, floor + 0.85, 0.16, tc.chassis, 0.02);
  seg(k, zx, floor + 1.65, zx + 8, floor + 1.65, 0.035, alpha(p.ink, 0.5));
}

/** 床下的祕密空間（GM 用、公開差分用）：剖開的低矮空間；回傳內部（光用） */
export function drawUnderCutaway(k: Kit, x: number, floor: number, gm: boolean): Rect {
  const { c, p } = k;
  const zx = x + 3;
  c.save();
  c.beginPath();
  c.rect(zx, floor, 8, 2);
  c.clip();
  box(k, zx, floor, 8, 2, mix(p.slab, p.ink, 0.35), 0);
  const inn = { x: zx + 0.15, y: floor + 0.15, w: 7.7, h: 1.7 };
  box(k, inn.x, inn.y, inn.w, inn.h, mix(p.walls.wood, p.ink, 0.25), 0.035);
  for (let fx = inn.x + 0.6; fx < inn.x + inn.w; fx += 0.6)
    seg(k, fx, inn.y + inn.h - 0.12, fx, inn.y + inn.h, 0.015, alpha(p.ink, 0.4));
  c.setLineDash([0.1, 0.07]);
  box(k, inn.x + 5.3, inn.y, 1.1, 0.12, null, 0.025);
  c.setLineDash([]);
  /* 捲起的鋪蓋、提燈、木箱 */
  shape(
    k,
    () => c.roundRect(inn.x + 0.4, inn.y + inn.h - 0.5, 2.4, 0.45, 0.22),
    alpha(p.fabric, 0.85),
    0.03,
  );
  for (const dx of [0.9, 1.8])
    seg(
      k,
      inn.x + dx,
      inn.y + inn.h - 0.5,
      inn.x + dx,
      inn.y + inn.h - 0.05,
      0.025,
      alpha(p.ink, 0.6),
    );
  box(k, inn.x + 3.2, inn.y + inn.h - 0.55, 0.32, 0.5, p.amber, 0.025, p.ink, 0.05);
  seg(k, inn.x + 3.36, inn.y + inn.h - 0.55, inn.x + 3.36, inn.y + inn.h - 0.72, 0.02);
  box(k, inn.x + 4.4, inn.y + inn.h - 0.85, 1.2, 0.85, p.timberLit, 0.035);
  seg(k, inn.x + 4.4, inn.y + inn.h - 0.85, inn.x + 5.6, inn.y + inn.h, 0.02, alpha(p.ink, 0.5));
  if (gm) {
    c.setLineDash([0.22, 0.14]);
    box(k, inn.x + 0.05, inn.y + 0.05, inn.w - 0.1, inn.h - 0.1, null, 0.06, p.gm);
    c.setLineDash([]);
  }
  c.restore();
  return inn;
}

/** 側梁與轉向架（或蒸氣機關車的車輪） */
export function drawRunningGear(
  k: Kit,
  cb: CarBox,
  rail: number,
  loco: LocoKind,
  tc: TrainColors,
): void {
  const { p } = k;
  const floor = cb.y + CAR_H;
  const x = cb.x;
  if (cb.car.type === 'loco' && loco === 'steam') {
    wheel(k, x + 1.5, rail - 0.45, 0.45, tc);
    wheel(k, x + 12.4, rail - 0.45, 0.45, tc);
    box(k, x + 0.6, floor, 3.4, 0.45, tc.chassis, 0.035);
    box(k, x + 2.2, floor + 0.5, 1.7, 0.7, tc.wheel, 0.04, p.ink, 0.12);
    for (const wx of [x + 5.6, x + 8.8]) wheel(k, wx, rail - 0.85, 0.85, tc);
    const pin = rail - 0.85 + 0.32;
    seg(k, x + 3.9, floor + 0.85, x + 5.6, pin, 0.08, tc.chassis);
    seg(k, x + 5.6, pin, x + 8.8, pin, 0.1, mix(tc.wheel, p.paper, 0.2));
    for (const wx of [x + 5.6, x + 8.8]) dot(k, wx, pin, 0.08, p.gilt, 0.02);
  } else {
    bogie(k, x + 0.5, floor, rail, tc);
    bogie(k, x + 11, floor, rail, tc);
  }
  box(k, x + 0.15, floor, CAR_W - 0.3, 0.3, tc.chassis, 0.035);
  box(k, x - 0.4, floor + 0.08, 0.4, 0.5, tc.chassis, 0.03);
  box(k, x + CAR_W, floor + 0.08, 0.4, 0.5, tc.chassis, 0.03);
}

/* ---------- 連結器 ---------- */

function padlock(k: Kit, x: number, y: number, s: number): void {
  const { c, p } = k;
  shape(k, () => c.arc(x, y - 0.12 * s, 0.17 * s, Math.PI, 0), null, 0.05 * s);
  box(k, x - 0.24 * s, y - 0.12 * s, 0.48 * s, 0.4 * s, p.gilt, 0.03, p.ink, 0.05 * s);
  dot(k, x, y + 0.06 * s, 0.05 * s, p.ink, 0);
}

/** 連結器的狀態的小記號（折返的接續牌也用） */
export function couplerMark(k: Kit, state: Coupler, x: number, y: number, s = 1): void {
  const { p } = k;
  if (state === 'locked') padlock(k, x, y, s);
  else if (state === 'bars') {
    for (let i = -1; i <= 1; i++)
      seg(k, x + i * 0.16 * s, y - 0.3 * s, x + i * 0.16 * s, y + 0.3 * s, 0.06 * s, p.alarm);
    seg(k, x - 0.3 * s, y, x + 0.3 * s, y, 0.05 * s, p.alarm);
  } else if (state === 'split') {
    seg(k, x - 0.32 * s, y - 0.18 * s, x - 0.08 * s, y + 0.18 * s, 0.06 * s, p.alarm);
    seg(k, x + 0.08 * s, y - 0.18 * s, x + 0.32 * s, y + 0.18 * s, 0.06 * s, p.alarm);
  }
}

/** 車廂之間：風檔（摺子）與連結器 */
export function drawCoupler(k: Kit, cp: CouplerBox, tc: TrainColors): void {
  const { c, p } = k;
  const floor = cp.y + CAR_H;
  const x0 = cp.x - 0.05;
  const x1 = cp.x + cp.w + 0.05;
  if (cp.state === 'split') {
    box(k, cp.x - 0.35, floor + 0.55, 0.55, 0.22, tc.chassis, 0.03);
    box(k, cp.x + cp.w - 0.2, floor + 0.55, 0.55, 0.22, tc.chassis, 0.03);
    couplerMark(k, 'split', cp.x + cp.w / 2, cp.y + CAR_H / 2, 1.2);
    return;
  }
  const y0 = cp.y + 0.9;
  const y1 = floor - 0.4;
  box(k, x0, y0, x1 - x0, y1 - y0, mix(tc.chassis, p.paper, 0.35), 0.035);
  c.beginPath();
  for (let x = x0 + 0.15; x < x1; x += 0.15) {
    c.moveTo(x, y0);
    c.lineTo(x, y1);
  }
  c.strokeStyle = alpha(p.ink, 0.45);
  c.lineWidth = 0.018;
  c.stroke();
  box(k, cp.x - 0.3, floor + 0.55, cp.w + 0.6, 0.22, tc.chassis, 0.03);
  dot(k, cp.x + cp.w / 2, floor + 0.66, 0.12, tc.wheel, 0.025);
  if (cp.state !== 'normal') couplerMark(k, cp.state, cp.x + cp.w / 2, cp.y + CAR_H / 2, 1);
}

/** 兩段折返的接續牌（箭頭形的牌子：「接 N 車」；連結器不是照常時下面加記號） */
export function drawContinuation(k: Kit, x: number, y: number, text: string, state: Coupler): void {
  const { p } = k;
  poly(
    k,
    [x, y - 0.45, x + 1.9, y - 0.45, x + 2.3, y, x + 1.9, y + 0.45, x, y + 0.45],
    p.paper,
    0.04,
  );
  drawText(k.c, text, x + 1.0, y + 0.02, {
    size: 0.32,
    weight: 700,
    align: 'center',
    baseline: 'middle',
    color: p.ink,
  });
  if (state !== 'normal') couplerMark(k, state, x + 1.0, y + 1.0, 0.9);
}

/** 車廂編號牌（車頂上面） */
export function drawCarTag(k: Kit, cb: CarBox, label: string, width: number): void {
  const { p } = k;
  const cx = cb.x + CAR_W / 2;
  const y = cb.y - 1.85;
  box(k, cx - width / 2, y, width, 0.52, alpha(p.paper, 0.94), 0.03, p.ink, 0.1);
  drawText(k.c, label, cx, y + 0.27, {
    size: 0.3,
    weight: 700,
    align: 'center',
    baseline: 'middle',
    color: p.ink,
  });
}
