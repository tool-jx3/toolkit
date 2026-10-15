/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見上一層的 UPSTREAM_LICENSE。
 *
 * 關係線的 SVG（原作的 edgeSvgFor、selfEdgeSvgFor、onlineLabelSvg、buildEdgeObstacleIndex）：
 * 捆綁主幹與中央接點、平行車道、避讓第三者的弧線、手動彎曲、名字讓位、端點、線型、外框、跳線、線上標籤。
 */
import type { Char, Rel, RelType } from '../model/types';
import {
  charRadius,
  displayName,
  edgeGapPx,
  esc,
  nameBoxExitDist,
  relNameFS,
  relNoteFS,
  type SheetCtx,
  typeLineColor,
  typeLineW,
  typeOutlineColor,
  typeOutlineW,
  typeTextColor,
} from './geom';
import {
  type Bez,
  bridgedPathD,
  capDecoSvg,
  FANCY_CAPS,
  FANCY_LINE_STYLES,
  f1,
  type Outline,
  type Pt,
  styledLineMarkup,
  wavyPathD,
} from './lines';
import { type ImageHref, miniAvatarSvg } from './nodes';

/** 避讓用的障礙索引（一張圖建一次；256 px 格網分桶） */
interface ObsItem {
  id: number;
  x: number;
  y: number;
  r: number;
  seq: number;
}
interface Obstacles {
  cell: number;
  grid: Map<string, ObsItem[]>;
  items: ObsItem[];
  maxClear: number;
}

export function buildObstacles(ctx: SheetCtx): Obstacles {
  const cell = 256;
  const grid = new Map<string, ObsItem[]>();
  const items: ObsItem[] = [];
  let maxClear = 24;
  ctx.sheet.chars.forEach((o, seq) => {
    if (o.relIgnore) return;
    const it = { id: o.id, x: o.x, y: o.y, r: charRadius(ctx, o), seq };
    items.push(it);
    if (it.r + 24 > maxClear) maxClear = it.r + 24;
    const key = `${Math.floor(o.x / cell)}:${Math.floor(o.y / cell)}`;
    let a = grid.get(key);
    if (!a) {
      a = [];
      grid.set(key, a);
    }
    a.push(it);
  });
  return { cell, grid, items, maxClear };
}

function candidates(obs: Obstacles, x0: number, y0: number, x1: number, y1: number): ObsItem[] {
  const m = obs.maxClear;
  const cell = obs.cell;
  const cx0 = Math.floor((Math.min(x0, x1) - m) / cell);
  const cx1 = Math.floor((Math.max(x0, x1) + m) / cell);
  const cy0 = Math.floor((Math.min(y0, y1) - m) / cell);
  const cy1 = Math.floor((Math.max(y0, y1) + m) / cell);
  if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) >= obs.grid.size) return obs.items;
  const out: ObsItem[] = [];
  for (let gx = cx0; gx <= cx1; gx++)
    for (let gy = cy0; gy <= cy1; gy++) {
      const a = obs.grid.get(`${gx}:${gy}`);
      if (a) out.push(...a);
    }
  return out;
}

/** 一張圖的關係線共用的東西 */
export interface EdgeCtx {
  ctx: SheetCtx;
  /** 標籤的底色（畫布底色） */
  bgColor: string;
  panelColor: string;
  bridge: boolean;
  /** 跳線用：已畫的線的折線 */
  geo: Pt[][];
  /** 線上標籤（集中畫在所有線之後） */
  lblOut: string[];
  /** 捆綁組的快取（一對一份） */
  grps: Map<string, PairGroup>;
  obs: Obstacles;
  href: ImageHref;
  idPrefix: string;
  /** 自我關係縮小頭貼的 clipPath */
  defs: string[];
}

interface PairGroup {
  grp: Rel[];
  trunkOn: boolean;
  skips: Rel[] | null;
  ctrl?: Pt | null;
  m?: Pt;
  ctrlDone?: boolean;
}

/** 捆綁忽略的有效值＝線自己的旗標 ∪ 關係類型的旗標 */
export const relBundleSkip = (ctx: SheetCtx, r: Rel): boolean =>
  !!(r.pairSkip || ctx.typeById.get(r.type)?.pairSkip);

const visibleType = (ctx: SheetCtx, r: Rel): RelType | null => {
  const t = ctx.typeById.get(r.type);
  return t && !t.hidden ? t : null;
};

/** 線上標籤：只有名稱＝膠囊；有備註＝名稱粗體在上、備註較小在下 */
export function onlineLabelSvg(
  ectx: EdgeCtx,
  cx: number,
  cy: number,
  t: RelType,
  note: string,
  stroke: string,
  textColor: string,
  withName: boolean,
  withNote: boolean,
  o: Outline | null,
): string {
  const nfs = relNameFS(ectx.ctx);
  const nofs = relNoteFS(ectx.ctx);
  const nk = nfs / 15;
  const bg = ectx.bgColor;
  const tStroke =
    o && o.w > 0
      ? ` paint-order="stroke" stroke="${o.col}" stroke-width="${f1(o.w * 2)}" stroke-linejoin="round"`
      : '';
  const noteLines = withNote
    ? String(note || '')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s !== '')
    : [];
  if (withName && !noteLines.length) {
    const w = Math.max(34 * nk, t.label.length * 17 * nk + 18);
    return `<g class="edge-label"><rect x="${f1(cx - w / 2)}" y="${f1(cy - 14 * nk)}" width="${f1(w)}" height="${f1(28 * nk)}" rx="${f1(14 * nk)}" fill="${bg}" stroke="${stroke}" stroke-width="1.5"/><text x="${f1(cx)}" y="${f1(cy + 5 * nk)}" text-anchor="middle" font-size="${f1(nfs)}" fill="${textColor}" font-weight="700"${tStroke}>${esc(t.label)}</text></g>`;
  }
  const nameRows = withName ? String(t.label).split('\n') : [];
  if (!nameRows.length && !noteLines.length) return '';
  const rows = nameRows
    .map((s) => ({ s, fs: nfs, fw: 700, op: 1, lh: Math.round((nfs * 19) / 15) }))
    .concat(
      noteLines.map((s) => ({ s, fs: nofs, fw: 400, op: 0.82, lh: Math.round((nofs * 16) / 12) })),
    );
  const wunit = (s: string) =>
    [...s].reduce((n, ch) => n + ((ch.codePointAt(0) ?? 0) > 0x2e7f ? 1 : 0.6), 0);
  const padX = 13;
  const padY = 8;
  const sep = 3;
  const boxH =
    rows.reduce((a, rw) => a + rw.lh, 0) +
    (nameRows.length && noteLines.length ? sep : 0) +
    padY * 2;
  const w = Math.max(40, ...rows.map((rw) => wunit(rw.s) * rw.fs * 1.02 + padX * 2));
  const top = cy - boxH / 2;
  let y = top + padY;
  let texts = '';
  rows.forEach((rw, idx) => {
    if (nameRows.length && idx === nameRows.length) y += sep;
    texts += `<text x="${f1(cx)}" y="${f1(y + rw.fs * 0.82)}" text-anchor="middle" font-size="${f1(rw.fs)}" fill="${textColor}"${rw.op < 1 ? ` fill-opacity="${rw.op}"` : ''} font-weight="${rw.fw}"${tStroke}${tStroke && rw.op < 1 ? ` stroke-opacity="${rw.op}"` : ''}>${esc(rw.s)}</text>`;
    y += rw.lh;
  });
  return `<g class="edge-label"><rect x="${f1(cx - w / 2)}" y="${f1(top)}" width="${f1(w)}" height="${f1(boxH)}" rx="12" fill="${bg}" stroke="${stroke}" stroke-width="1.5"/>${texts}</g>`;
}

const arrowPath = (
  x: number,
  y: number,
  dx: number,
  dy: number,
  px: number,
  py: number,
  AL: number,
  AW: number,
  col: string,
  capO: string,
) =>
  `<path d="M ${f1(x)} ${f1(y)} L ${f1(x - dx * AL + px * AL * AW)} ${f1(y - dy * AL + py * AL * AW)} L ${f1(x - dx * AL - px * AL * AW)} ${f1(y - dy * AL - py * AL * AW)} Z" fill="${col}"${capO}/>`;

/** 線的提示文字 */
function tipText(a: Char, b: Char, t: RelType, r: Rel): string {
  const arrow = r.both ? '⇄' : '→';
  return `${displayName(a)} ${arrow} ${t.label} ${arrow} ${displayName(b)}${r.note ? `\n${r.note}` : ''}`;
}

/**
 * 一條關係線。i／k＝這一對的第幾條／共幾條；loId＝這一對 id 較小的那位（車道的基準方向）。
 */
export function edgeSvg(ectx: EdgeCtx, r: Rel, i: number, k: number, loId: number): string {
  const { ctx } = ectx;
  const a = ctx.byId.get(r.from);
  const b = ctx.byId.get(r.to);
  const tg = ctx.typeById.get(r.type);
  if (!a || !b || !tg) return '';
  if (a.id === b.id) return selfEdgeSvg(ectx, r, a, tg, i, k);
  const tagColor = typeLineColor(ctx, tg);
  const tagTextColor = typeTextColor(ctx, tg, tagColor);
  const lineStyle = tg.lineStyle;
  const capStyle = tg.capStyle;
  const lw = typeLineW(ctx, tg);
  const lwk = lw / 3;
  const rA = charRadius(ctx, a);
  const rB = charRadius(ctx, b);
  const lo = a.id === loId ? a : b;
  const hi = a.id === loId ? b : a;
  const dxp = hi.x - lo.x;
  const dyp = hi.y - lo.y;
  const lp2 = Math.hypot(dxp, dyp) || 1;
  const nx = -dyp / lp2;
  const ny = dxp / lp2;
  const ddx = b.x - a.x;
  const ddy = b.y - a.y;
  const dl = Math.hypot(ddx, ddy) || 1;
  const ux = ddx / dl;
  const uy = ddy / dl;

  /* 捆綁（預設形態）：組內 ≥ 2 條而且兩端都有線指到，或只有一條雙向線 */
  let pm = false;
  let pmGrp: Rel[] | null = null;
  let pairSkips: Rel[] | null = null;
  let pc: PairGroup | undefined;
  if (k >= 2 || r.both) {
    const hiId = r.from + r.to - loId;
    const gk = `${Math.min(loId, hiId)}-${Math.max(loId, hiId)}`;
    pc = ectx.grps.get(gk);
    if (!pc) {
      const inPair = (x: Rel) =>
        (x.from === loId && x.to === hiId) || (x.from === hiId && x.to === loId);
      const grp = ctx.sheet.rels.filter(
        (x) => !relBundleSkip(ctx, x) && inPair(x) && visibleType(ctx, x),
      );
      const trunkOn =
        (grp.length >= 2 &&
          grp.some((x) => x.both || x.to === loId) &&
          grp.some((x) => x.both || x.to === hiId)) ||
        (grp.length === 1 && grp[0].both);
      pc = {
        grp,
        trunkOn,
        skips: trunkOn
          ? ctx.sheet.rels.filter((x) => relBundleSkip(ctx, x) && inPair(x) && visibleType(ctx, x))
          : null,
      };
      ectx.grps.set(gk, pc);
    }
    if (pc.trunkOn && !relBundleSkip(ctx, r)) {
      pm = true;
      pmGrp = pc.grp;
    }
    if (pc.trunkOn && relBundleSkip(ctx, r)) pairSkips = pc.skips;
  }
  let pmJr = 0;
  let pmLane = 0;
  let pmSideN = 0;
  let pmSideIdx = 0;
  if (pm && pmGrp) {
    let maxLwG = 3;
    for (const x of pmGrp) {
      const xt = ctx.typeById.get(x.type);
      const w = xt?.lineW && xt.lineW >= 1 ? xt.lineW : 3;
      if (w > maxLwG) maxLwG = w;
    }
    const maxSwG = (maxLwG * 3.5) / 3;
    const nLo = pmGrp.filter((x) => !x.both && x.to === loId).length;
    const nHi = pmGrp.filter((x) => !x.both && x.to !== loId).length;
    const maxSideN = Math.max(nLo, nHi, 1);
    let spacing = Math.max(8, maxSwG + 4);
    if (maxSideN > 1) spacing = Math.min(spacing, 28 / (maxSideN - 1));
    pmJr = Math.max(4.5, Math.min(8, maxSwG * 0.9));
    if (r.both) {
      const bl = pmGrp.filter((x) => x.both);
      const j = bl.findIndex((x) => x.id === r.id);
      pmLane =
        pmGrp.length === 1
          ? 0
          : (j % 2 === 0 ? 1 : -1) *
            (((maxSideN - 1) / 2) * spacing + spacing * (Math.floor(j / 2) + 1));
      pmSideN = bl.length;
      pmSideIdx = j;
    } else {
      const sl = pmGrp.filter((x) => !x.both && x.to === r.to);
      const idx = Math.max(
        0,
        sl.findIndex((x) => x.id === r.id),
      );
      pmLane = (idx - (sl.length - 1) / 2) * spacing;
      pmSideN = sl.length;
      pmSideIdx = idx;
    }
  }
  /* 主幹的彎曲：整組共用一個控制點（手動彎曲優先，否則自動避讓）；中央接點在曲線中點 */
  let pmCtrl: Pt | null = null;
  let pmM: Pt = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
  if (pm && pmGrp && pc) {
    if (pc.ctrlDone) {
      pmCtrl = pc.ctrl ?? null;
      pmM = pc.m ?? pmM;
    } else {
      const last = pmGrp[pmGrp.length - 1];
      const cRel = last.curveDir ? last : pmGrp.find((x) => x.curveDir);
      const tux = dxp / lp2;
      const tuy = dyp / lp2;
      if (cRel) {
        const bend = Math.max(45, lp2 * 0.22);
        pmCtrl = {
          x: (lo.x + hi.x) / 2 + nx * bend * cRel.curveDir,
          y: (lo.y + hi.y) / 2 + ny * bend * cRel.curveDir,
        };
      } else {
        /* 主幹的自動避讓（原作這裡不看「直線」設定，照原作） */
        const rl = charRadius(ctx, lo);
        const rh = charRadius(ctx, hi);
        const q0 = { x: lo.x + tux * (rl + 8), y: lo.y + tuy * (rl + 8) };
        const q1 = { x: hi.x - tux * (rh + 8), y: hi.y - tuy * (rh + 8) };
        const vx = q1.x - q0.x;
        const vy = q1.y - q0.y;
        const ll = Math.hypot(vx, vy) || 1;
        const vl2 = ll * ll;
        const lnx = -vy / ll;
        const lny = vx / ll;
        let maxPush = 0;
        let bestDir = 0;
        let bestSeq = Number.POSITIVE_INFINITY;
        for (const o of candidates(ectx.obs, q0.x, q0.y, q1.x, q1.y)) {
          if (o.id === lo.id || o.id === hi.id) continue;
          const t0 = ((o.x - q0.x) * vx + (o.y - q0.y) * vy) / vl2;
          if (t0 <= 0.08 || t0 >= 0.92) continue;
          const dist = Math.hypot(o.x - (q0.x + vx * t0), o.y - (q0.y + vy * t0));
          const clearR = o.r + 24;
          if (dist < clearR) {
            const overlap = clearR - dist;
            const dir = (o.x - q0.x) * vy - (o.y - q0.y) * vx >= 0 ? 1 : -1;
            if (overlap > maxPush || (overlap === maxPush && o.seq < bestSeq)) {
              maxPush = overlap;
              bestDir = dir;
              bestSeq = o.seq;
            }
          }
        }
        if (maxPush > 0) {
          const cp = Math.min(maxPush * 1.8, ll * 0.4);
          pmCtrl = {
            x: (q0.x + q1.x) / 2 + lnx * cp * bestDir * 1.5,
            y: (q0.y + q1.y) / 2 + lny * cp * bestDir * 1.5,
          };
        }
      }
      pmM = pmCtrl
        ? {
            x: 0.25 * lo.x + 0.5 * pmCtrl.x + 0.25 * hi.x,
            y: 0.25 * lo.y + 0.5 * pmCtrl.y + 0.25 * hi.y,
          }
        : { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
      pc.ctrl = pmCtrl;
      pc.m = pmM;
      pc.ctrlDone = true;
    }
  }

  const bleedOffset = edgeGapPx(ctx.s);
  const half = pm && !r.both;
  const edgeSpan = half
    ? Math.max(10, dl / 2 - rB - bleedOffset - pmJr - 3)
    : Math.max(12, dl - rA - rB - 2 * bleedOffset);
  const AL = Math.min(Math.max(14 * lwk, 7), edgeSpan * (r.both ? 0.3 : 0.45));
  const AW = 0.4;
  const dotR = Math.min(Math.max(5.5 * lwk, 2.75), edgeSpan * 0.22);
  const tipGap = Math.min(14 * lwk, 14);
  const fancyCap = FANCY_CAPS.has(capStyle);
  const lwDraw = Math.max(
    1,
    capStyle === 'arrow' || fancyCap
      ? Math.min(lw, (AL * AW * 2) / 1.5)
      : capStyle === 'dot'
        ? Math.min(lw, dotR * 1.6)
        : Math.min(lw, edgeSpan * 0.5),
  );
  const olW = typeOutlineW(tg);
  const oInfo: Outline | null = olW > 0 ? { col: typeOutlineColor(ctx, tg), w: olW } : null;
  const capO = oInfo
    ? ` stroke="${oInfo.col}" stroke-width="${f1(oInfo.w * 2)}" paint-order="stroke" stroke-linejoin="round"`
    : '';
  const capGap =
    capStyle === 'arrow' || fancyCap
      ? tipGap + bleedOffset
      : capStyle === 'dot'
        ? Math.min(10 * lwk, dotR + 6) + bleedOffset
        : 6 + bleedOffset;
  let startGap = half ? pmJr + 2.5 : r.both ? rA + capGap : rA + 8 + bleedOffset;
  let endGap = rB + capGap;
  /* 名字讓位：有端點裝飾的那一端 */
  {
    const ax2 = half ? b.x - pmM.x : ddx;
    const ay2 = half ? b.y - pmM.y : ddy;
    const al2 = Math.hypot(ax2, ay2) || 1;
    const extB = nameBoxExitDist(ctx, b, -ax2 / al2, -ay2 / al2);
    if (extB > rB) endGap = extB + capGap;
    if (r.both) {
      const extA = nameBoxExitDist(ctx, a, ux, uy);
      if (extA > rA) startGap = extA + capGap;
    }
  }
  const totalRequired = startGap + endGap + 10;
  let laneScale = 1;
  const centerDist = half ? dl / 2 : dl;
  if (centerDist < totalRequired) {
    const scale = Math.max(0.1, (centerDist - 10) / (startGap + endGap));
    startGap *= scale;
    endGap *= scale;
    laneScale = Math.max(0.2, scale);
  }
  const laneStep = 16;
  let lane: number;
  if (pm) lane = pmLane;
  else if (pairSkips) {
    const j = Math.max(
      0,
      pairSkips.findIndex((x) => x.id === r.id),
    );
    lane = (j % 2 === 0 ? 1 : -1) * (Math.floor(j / 2) + 1) * laneStep * laneScale;
  } else lane = (i - (k - 1) / 2) * laneStep * laneScale;
  let p0: Pt;
  let p1: Pt;
  if (half) {
    const hdx = b.x - pmM.x;
    const hdy = b.y - pmM.y;
    const hl = Math.hypot(hdx, hdy) || 1;
    const hux = hdx / hl;
    const huy = hdy / hl;
    p0 = { x: pmM.x + hux * startGap, y: pmM.y + huy * startGap };
    p1 = { x: b.x - hux * endGap + nx * lane, y: b.y - huy * endGap + ny * lane };
  } else {
    p0 = { x: a.x + ux * startGap + nx * lane, y: a.y + uy * startGap + ny * lane };
    p1 = { x: b.x - ux * endGap + nx * lane, y: b.y - uy * endGap + ny * lane };
  }
  let ctrl: Pt | null = null;
  if (pm) {
    if (r.both) {
      const cx0 = pmCtrl ? pmCtrl.x : (lo.x + hi.x) / 2;
      const cy0 = pmCtrl ? pmCtrl.y : (lo.y + hi.y) / 2;
      ctrl = { x: cx0 - nx * lane, y: cy0 - ny * lane };
    } else if (pmCtrl) {
      ctrl = {
        x: (pmCtrl.x + b.x) / 2 + nx * lane * 0.5,
        y: (pmCtrl.y + b.y) / 2 + ny * lane * 0.5,
      };
    }
  } else if (!ctx.s.edgeStraight) {
    /* 單線避讓：控制點放在障礙的對側 */
    const vx = p1.x - p0.x;
    const vy = p1.y - p0.y;
    const lineLen = Math.hypot(vx, vy) || 1;
    const vl2 = lineLen * lineLen;
    const lnx = -vy / lineLen;
    const lny = vx / lineLen;
    let maxPush = 0;
    let bestDir = 0;
    let bestSeq = Number.POSITIVE_INFINITY;
    for (const o of candidates(ectx.obs, p0.x, p0.y, p1.x, p1.y)) {
      if (o.id === a.id || o.id === b.id) continue;
      const t0 = ((o.x - p0.x) * vx + (o.y - p0.y) * vy) / vl2;
      if (t0 <= 0.08 || t0 >= 0.92) continue;
      const dist = Math.hypot(o.x - (p0.x + vx * t0), o.y - (p0.y + vy * t0));
      const clearR = o.r + 24;
      if (dist < clearR) {
        const overlap = clearR - dist;
        const pushDir = (o.x - p0.x) * vy - (o.y - p0.y) * vx >= 0 ? 1 : -1;
        if (overlap > maxPush || (overlap === maxPush && o.seq < bestSeq)) {
          maxPush = overlap;
          bestDir = pushDir;
          bestSeq = o.seq;
        }
      }
    }
    if (maxPush > 0) {
      const push = Math.min(maxPush * 1.8, lineLen * 0.4);
      ctrl = {
        x: (p0.x + p1.x) / 2 + lnx * push * bestDir * 1.5,
        y: (p0.y + p1.y) / 2 + lny * push * bestDir * 1.5,
      };
    }
  }
  if (!pm && r.curveDir) {
    const bend = Math.max(45, Math.hypot(p1.x - p0.x, p1.y - p0.y) * 0.22);
    const vx = p1.x - p0.x;
    const vy = p1.y - p0.y;
    const len = Math.hypot(vx, vy) || 1;
    ctrl = {
      x: (p0.x + p1.x) / 2 + (-vy / len) * bend * r.curveDir,
      y: (p0.y + p1.y) / 2 + (vx / len) * bend * r.curveDir,
    };
  }
  const c = ctrl;
  const bez: Bez = (t) =>
    c
      ? {
          x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x,
          y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y,
        }
      : { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) };
  const segs: Pt[] = [];
  const steps = c ? 16 : 1;
  for (let s = 0; s <= steps; s++) segs.push(bez(s / steps));
  ectx.geo.push(segs);
  const myIdx = ectx.geo.length - 1;

  const ALIN = Math.max(AL * 0.55, AL - 1.5 * lwk, lwDraw * (1 / (2 * AW) + 0.5) + 2);
  let e1x = ux;
  let e1y = uy;
  if (c) {
    const tx = p1.x - c.x;
    const ty = p1.y - c.y;
    const tl = Math.hypot(tx, ty) || 1;
    e1x = tx / tl;
    e1y = ty / tl;
  }
  let s0x = ux;
  let s0y = uy;
  if (c) {
    const tx = c.x - p0.x;
    const ty = c.y - p0.y;
    const tl = Math.hypot(tx, ty) || 1;
    s0x = tx / tl;
    s0y = ty / tl;
  }
  const pxE = -e1y;
  const pyE = e1x;
  let endDeco = '';
  let startDeco = '';
  let capInsEnd = 0;
  let capInsStart = 0;
  if (capStyle === 'arrow')
    endDeco = arrowPath(p1.x, p1.y, e1x, e1y, pxE, pyE, AL, AW, tagColor, capO);
  else if (capStyle === 'dot')
    endDeco = `<circle cx="${f1(p1.x)}" cy="${f1(p1.y)}" r="${f1(dotR)}" fill="${tagColor}"${capO}/>`;
  else if (fancyCap) {
    const ce = capDecoSvg(
      capStyle,
      p1.x,
      p1.y,
      e1x,
      e1y,
      pxE,
      pyE,
      AL,
      dotR,
      lwDraw,
      tagColor,
      oInfo,
    );
    endDeco = ce.deco;
    capInsEnd = ce.ins;
  }
  if (r.both) {
    const px0 = -s0y;
    const py0 = s0x;
    if (capStyle === 'arrow')
      startDeco = arrowPath(p0.x, p0.y, -s0x, -s0y, px0, py0, AL, AW, tagColor, capO);
    else if (capStyle === 'dot')
      startDeco = `<circle cx="${f1(p0.x)}" cy="${f1(p0.y)}" r="${f1(dotR)}" fill="${tagColor}"${capO}/>`;
    else if (fancyCap) {
      const cs2 = capDecoSvg(
        capStyle,
        p0.x,
        p0.y,
        -s0x,
        -s0y,
        px0,
        py0,
        AL,
        dotR,
        lwDraw,
        tagColor,
        oInfo,
      );
      startDeco = cs2.deco;
      capInsStart = cs2.ins;
    }
  }
  const insE = capStyle === 'arrow' ? ALIN : capInsEnd;
  const insS = r.both ? (capStyle === 'arrow' ? ALIN : capInsStart) : 0;
  const pe = insE ? { x: p1.x - e1x * insE, y: p1.y - e1y * insE } : p1;
  const ps = insS ? { x: p0.x + s0x * insS, y: p0.y + s0y * insS } : p0;

  /* 線上標籤 */
  const showName = r.flipName ? !ctx.s.showRelName : ctx.s.showRelName;
  const showNote = (r.flipNote ? !ctx.s.showRelNote : ctx.s.showRelNote) && !!r.note.trim();
  let labelSvg = '';
  if (showName || showNote) {
    let tPos: number;
    if (half) tPos = pmSideN <= 1 ? 0.5 : 0.3 + (pmSideIdx / (pmSideN - 1)) * 0.4;
    else if (pm) {
      tPos = pmSideN <= 1 ? 0.12 : 0.1 + (pmSideIdx / (pmSideN - 1)) * 0.8;
      if (r.from !== loId) tPos = 1 - tPos;
      if (tPos > 0.44 && tPos < 0.56) tPos = 0.62;
    } else {
      tPos = k === 1 ? 0.5 : 0.28 + (i / (k - 1)) * 0.44;
      if (k > 1 && r.from !== loId) tPos = 1 - tPos;
    }
    const hasT = r.labelT !== null;
    if (r.labelT !== null) tPos = Math.min(0.95, Math.max(0.05, r.labelT));
    let pt = bez(tPos);
    if (half && !hasT && pmSideN > 2) {
      const st = (pmSideIdx % 2 ? 1 : -1) * 15;
      pt = { x: pt.x + nx * st, y: pt.y + ny * st };
    }
    labelSvg = onlineLabelSvg(
      ectx,
      pt.x,
      pt.y,
      tg,
      r.note,
      tagColor,
      tagTextColor,
      showName,
      showNote,
      oInfo,
    );
  }

  const dPath = ectx.bridge
    ? bridgedPathD(ps, pe, c, myIdx, ectx.geo)
    : c
      ? `M ${f1(ps.x)} ${f1(ps.y)} Q ${f1(c.x)} ${f1(c.y)} ${f1(pe.x)} ${f1(pe.y)}`
      : `M ${f1(ps.x)} ${f1(ps.y)} L ${f1(pe.x)} ${f1(pe.y)}`;
  const clickPath = c
    ? `M ${f1(p0.x)} ${f1(p0.y)} Q ${f1(c.x)} ${f1(c.y)} ${f1(p1.x)} ${f1(p1.y)}`
    : `M ${f1(p0.x)} ${f1(p0.y)} L ${f1(p1.x)} ${f1(p1.y)}`;
  const lineLen = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const tA = insS ? Math.min(0.35, insS / lineLen) : 0;
  const tB = insE ? 1 - Math.min(0.35, insE / lineLen) : 1;
  const bezDraw: Bez = (t) => bez(tA + t * (tB - tA));
  let visLine: string;
  if (lineStyle === 'wavy') {
    const wd = wavyPathD(bezDraw, Math.max(1, lwDraw / 3), edgeSpan * 0.2, lwDraw);
    visLine =
      (oInfo
        ? `<path d="${wd}" fill="none" stroke="${oInfo.col}" stroke-width="${f1(lwDraw + oInfo.w * 2)}" stroke-linecap="round" stroke-linejoin="round"/>`
        : '') +
      `<path d="${wd}" fill="none" stroke="${tagColor}" stroke-width="${f1(lwDraw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (FANCY_LINE_STYLES.has(lineStyle)) {
    visLine = styledLineMarkup(lineStyle, bezDraw, tagColor, lwDraw, edgeSpan * 0.2, oInfo);
  } else {
    const sw = (lwDraw * 3.5) / 3;
    const dash =
      lineStyle === 'dashed'
        ? ` stroke-dasharray="${f1(Math.max(12, sw * 0.9))} ${f1(Math.max(9, sw * 1.4))}"`
        : lineStyle === 'dotted'
          ? ` stroke-dasharray="0.1 ${f1(Math.max(9, sw * 1.4))}"`
          : '';
    visLine =
      (oInfo
        ? `<path d="${dPath}" fill="none" stroke="${oInfo.col}" stroke-width="${f1(sw + oInfo.w * 2)}" stroke-linecap="round"${dash}/>`
        : '') +
      `<path d="${dPath}" fill="none" stroke="${tagColor}" stroke-width="${f1(sw)}" stroke-linecap="round"${dash}/>`;
  }
  let joint = '';
  if (pm && pmGrp && r.id === pmGrp[pmGrp.length - 1].id) {
    joint = `<circle class="pair-joint" cx="${f1(pmM.x)}" cy="${f1(pmM.y)}" r="${f1(pmJr)}" fill="${ectx.panelColor}" stroke="${ctx.pal.ink}" stroke-width="1.5" pointer-events="none"/>`;
  }
  const tip = esc(tipText(a, b, tg, r));
  if (labelSvg) {
    ectx.lblOut.push(
      `<g class="edge edge-lbl" data-relid="${r.id}" data-from="${r.from}" data-to="${r.to}" data-type="${r.type}"><title>${tip}</title>${labelSvg}</g>`,
    );
  }
  return `<g class="edge" data-relid="${r.id}" data-from="${r.from}" data-to="${r.to}" data-type="${r.type}"><title>${tip}</title><path class="edge-hit" d="${clickPath}" fill="none" stroke="rgba(0,0,0,0)" stroke-width="${f1(Math.max(16, lw + 12))}"/>${visLine}${endDeco}${startDeco}${joint}</g>`;
}

/** 自我關係：頭像旁的縮小頭貼＋短線（同一角色的多條共用一個頭貼） */
function selfEdgeSvg(ectx: EdgeCtx, r: Rel, c: Char, tg: RelType, i: number, k: number): string {
  const { ctx } = ectx;
  const tagColor = typeLineColor(ctx, tg);
  const tagTextColor = typeTextColor(ctx, tg, tagColor);
  const lineStyle = tg.lineStyle;
  const capStyle = tg.capStyle;
  const lw = typeLineW(ctx, tg);
  const lwk = lw / 3;
  const R = charRadius(ctx, c);
  const miniR = Math.max(11, R * 0.5);
  const sibs = ctx.sheet.rels.filter(
    (x) => x.from === c.id && x.to === c.id && visibleType(ctx, x),
  );
  const last = sibs[sibs.length - 1];
  const angRel = last && last.selfAng !== null ? last : sibs.find((x) => x.selfAng !== null);
  let ang: number;
  if (angRel && angRel.selfAng !== null) ang = angRel.selfAng;
  else {
    let sx = 0;
    let sy = 0;
    const chars = ctx.sheet.chars;
    for (const o of chars) {
      sx += o.x;
      sy += o.y;
    }
    ang = -Math.PI * 0.28;
    if (chars.length > 1) {
      const ddx = c.x - sx / chars.length;
      const ddy = c.y - sy / chars.length;
      if (Math.hypot(ddx, ddy) > 1e-3) ang = Math.atan2(ddy, ddx);
    }
  }
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const px = -dy;
  const py = dx;
  let maxLw = lw;
  for (const x of sibs) {
    const t = ctx.typeById.get(x.type);
    const w = t?.lineW && t.lineW >= 1 ? t.lineW : 3;
    if (w > maxLw) maxLw = w;
  }
  const maxLwk = maxLw / 3;
  const maxSw = (Math.max(1, maxLw) * 3.5) / 3;
  const gap = Math.max(10, 8 + maxLwk * 4) + (k > 1 ? 6 : 0);
  const D = R + gap + miniR;
  const mcx = c.x + dx * D;
  const mcy = c.y + dy * D;
  let spacing = Math.max(10, maxSw * 1.6);
  const maxOff = miniR * 0.8;
  if (k > 1 && ((k - 1) / 2) * spacing > maxOff) spacing = maxOff / ((k - 1) / 2);
  const off = k > 1 ? (i - (k - 1) / 2) * spacing : 0;
  const qn = Math.sqrt(Math.max(1, R * R - off * off));
  const qm = Math.sqrt(Math.max(1, miniR * miniR - off * off));
  const sx0 = c.x + px * off + dx * qn;
  const sy0 = c.y + py * off + dy * qn;
  const ex = mcx + px * off - dx * qm;
  const ey = mcy + py * off - dy * qm;
  const AL = Math.max(7, Math.min(14 * lwk, gap * 0.9));
  const AW = 0.42;
  const dotR = Math.max(2.75, Math.min(5.5 * lwk, gap * 0.5));
  const olW = typeOutlineW(tg);
  const oInfo: Outline | null = olW > 0 ? { col: typeOutlineColor(ctx, tg), w: olW } : null;
  const capO = oInfo
    ? ` stroke="${oInfo.col}" stroke-width="${f1(oInfo.w * 2)}" paint-order="stroke" stroke-linejoin="round"`
    : '';
  let endDeco = '';
  let capIns = 0;
  if (capStyle === 'arrow') endDeco = arrowPath(ex, ey, dx, dy, px, py, AL, AW, tagColor, capO);
  else if (capStyle === 'dot')
    endDeco = `<circle cx="${f1(ex)}" cy="${f1(ey)}" r="${f1(dotR)}" fill="${tagColor}"${capO}/>`;
  else if (FANCY_CAPS.has(capStyle)) {
    const ce = capDecoSvg(
      capStyle,
      ex,
      ey,
      dx,
      dy,
      px,
      py,
      AL,
      dotR,
      Math.max(1, lw),
      tagColor,
      oInfo,
    );
    endDeco = ce.deco;
    capIns = ce.ins;
  }
  let startDeco = '';
  if (r.both) {
    if (capStyle === 'arrow')
      startDeco = arrowPath(sx0, sy0, -dx, -dy, px, py, AL, AW, tagColor, capO);
    else if (capStyle === 'dot')
      startDeco = `<circle cx="${f1(sx0)}" cy="${f1(sy0)}" r="${f1(dotR)}" fill="${tagColor}"${capO}/>`;
    else if (FANCY_CAPS.has(capStyle))
      startDeco = capDecoSvg(
        capStyle,
        sx0,
        sy0,
        -dx,
        -dy,
        px,
        py,
        AL,
        dotR,
        Math.max(1, lw),
        tagColor,
        oInfo,
      ).deco;
  }
  const insEnd = capStyle === 'arrow' ? AL * 0.7 : capStyle === 'dot' ? dotR : capIns;
  const insStart = r.both ? insEnd : 0;
  const lsx = sx0 + dx * insStart;
  const lsy = sy0 + dy * insStart;
  const lex = ex - dx * insEnd;
  const ley = ey - dy * insEnd;
  const sw = (Math.max(1, lw) * 3.5) / 3;
  let visLine: string;
  if (lineStyle === 'wavy' || FANCY_LINE_STYLES.has(lineStyle)) {
    const sbez: Bez = (t2) => ({ x: lsx + (lex - lsx) * t2, y: lsy + (ley - lsy) * t2 });
    visLine = styledLineMarkup(lineStyle, sbez, tagColor, Math.max(1, lw), gap * 0.5, oInfo);
  } else {
    const dash =
      lineStyle === 'dashed'
        ? ` stroke-dasharray="${f1(Math.max(9, sw * 0.9))} ${f1(Math.max(7, sw * 1.4))}"`
        : lineStyle === 'dotted'
          ? ` stroke-dasharray="0.1 ${f1(Math.max(7, sw * 1.4))}"`
          : '';
    const d = `M ${f1(lsx)} ${f1(lsy)} L ${f1(lex)} ${f1(ley)}`;
    visLine =
      (oInfo
        ? `<path d="${d}" fill="none" stroke="${oInfo.col}" stroke-width="${f1(sw + oInfo.w * 2)}" stroke-linecap="round"${dash}/>`
        : '') +
      `<path d="${d}" fill="none" stroke="${tagColor}" stroke-width="${f1(sw)}" stroke-linecap="round"${dash}/>`;
  }
  let mini = '';
  if (i === k - 1) {
    const m = miniAvatarSvg(ctx, c, mcx, mcy, miniR, `${ectx.idPrefix}self${r.id}`, ectx.href);
    if (m.defs) ectx.defs.push(m.defs);
    mini = `<g class="self-mini" data-relid="${r.id}">${m.svg}</g>`;
  }
  const showName = r.flipName ? !ctx.s.showRelName : ctx.s.showRelName;
  const showNote = (r.flipNote ? !ctx.s.showRelNote : ctx.s.showRelNote) && !!r.note.trim();
  let labelSvg = '';
  if (showName || showNote) {
    const loff = k > 1 ? (i - (k - 1) / 2) * 30 : 0;
    const lx = c.x + dx * (D + miniR + 6);
    const ly = c.y + dy * (D + miniR + 6) + loff;
    labelSvg = onlineLabelSvg(
      ectx,
      lx,
      ly,
      tg,
      r.note,
      tagColor,
      tagTextColor,
      showName,
      showNote,
      oInfo,
    );
  }
  const tip = esc(`${displayName(c)} ⟲ ${tg.label}${r.note ? `\n${r.note}` : ''}`);
  return `<g class="edge self-edge" data-relid="${r.id}" data-from="${r.from}" data-to="${r.to}" data-type="${r.type}"><title>${tip}</title><path class="edge-hit" d="M ${f1(sx0)} ${f1(sy0)} L ${f1(ex)} ${f1(ey)}" fill="none" stroke="rgba(0,0,0,0)" stroke-width="${f1(Math.max(16, lw + 12))}"/>${visLine}${endDeco}${startDeco}${mini}${labelSvg}</g>`;
}

/** 這張圖全部的關係線（粗的先畫）；回傳線的 markup（標籤在最後）與自我關係頭貼的 defs */
export function edgesSvg(ectx: EdgeCtx): string {
  const { ctx } = ectx;
  const vis = ctx.sheet.rels.filter(
    (r) => visibleType(ctx, r) && ctx.byId.has(r.from) && ctx.byId.has(r.to),
  );
  const pairs = new Map<string, Rel[]>();
  for (const r of vis) {
    const key = `${Math.min(r.from, r.to)}-${Math.max(r.from, r.to)}`;
    let l = pairs.get(key);
    if (!l) {
      l = [];
      pairs.set(key, l);
    }
    l.push(r);
  }
  const keys = [...pairs.keys()];
  const maxW = new Map<string, number>();
  for (const k of keys) {
    maxW.set(
      k,
      Math.max(
        ...(pairs.get(k) ?? []).map((r) => {
          const t = ctx.typeById.get(r.type);
          return t ? typeLineW(ctx, t) : 1;
        }),
      ),
    );
  }
  keys.sort((a, b) => (maxW.get(b) ?? 0) - (maxW.get(a) ?? 0));
  let out = '';
  for (const key of keys) {
    const list = pairs.get(key) ?? [];
    const loId = Number(key.split('-')[0]);
    list.forEach((r, i) => {
      out += edgeSvg(ectx, r, i, list.length, loId);
    });
  }
  return out + ectx.lblOut.join('');
}
