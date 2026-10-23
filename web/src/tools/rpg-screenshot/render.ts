/**
 * 畫一格（規格 3.3～3.9）：背景圖（已像素化）→ 暗角 → 地點標示 → 訊息視窗（頭像、名字、台詞、選項、繼續箭頭）→ 演出文字 → 掃描線。
 * 預覽、PNG、GIF 都用這一段；畫的順序、每一步的數值與畫布狀態的設定照原作（同一個瀏覽器畫出來逐像素相同）。
 *
 * 照原作保留的細節（規格第 5 節）：台詞與演出文字一個字一個字畫；名字畫兩次（往右 bo）；顏色換算失敗時
 * （名字底是算出來的 rgb() 色、再加深一次）畫布會沿用上一個顏色——膠囊的厚度與名字的描邊因此是淡白色，看起來和原作相同。
 */
import { pixelateImage, type RetroSource } from '@/core/image';
import {
  BASE_WIDTH,
  clamp01,
  easeBack,
  easeOut,
  type FrameClocks,
  LOC_IN,
  listLines,
  NAME_IN,
  POP_IN,
  POP_SHINE,
  POP_STAGGER,
  parsePages,
  popTotal,
  type RpgState,
  screenSize,
  type Token,
  tokenCount,
  tokenize,
  viewCrop,
} from './model';
import { THEMES, type WindowTheme } from './themes';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/* ---------- 小工具（同原作） ---------- */

/** 亮度（0.299R＋0.587G＋0.114B）；看不懂的色碼回傳 200（同原作；rgb() 字串回傳 NaN） */
export function lum(hex: string): number {
  let c = (hex || '').replace('#', '');
  if (c.length === 3)
    c = c
      .split('')
      .map((x) => x + x)
      .join('');
  if (c.length < 6) return 200;
  const r = Number.parseInt(c.substr(0, 2), 16);
  const g = Number.parseInt(c.substr(2, 2), 16);
  const b = Number.parseInt(c.substr(4, 2), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 往黑（f < 0）或往白（f > 0）移 |f| 的比例，回傳 rgb()。輸入可以是色碼或 rgb()（D16：原作只認色碼，
 * 把加深過一次的名字底色再加深時得到無效的顏色、畫布沿用上一個顏色；本站照原作本來想要的顏色畫）
 */
export function shade(color: string, f: number): string {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color || '');
  let n: number[];
  if (m) n = [m[1], m[2], m[3]].map(Number);
  else {
    let c = (color || '#000').replace('#', '');
    if (c.length === 3)
      c = c
        .split('')
        .map((x) => x + x)
        .join('');
    n = [0, 2, 4].map((i) => Number.parseInt(c.substr(i, 2), 16));
  }
  const t = f < 0 ? 0 : 255;
  const a = Math.abs(f);
  return `rgb(${n.map((v) => Math.round(v + (t - v) * a)).join(',')})`;
}

/** 圓角矩形路徑（四個 arcTo，同原作） */
function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** 量一個字的寬（依字型快取） */
const widths = new Map<string, number>();
function mw(ctx: Ctx, ch: string): number {
  const k = `${ctx.font}|${ch}`;
  let v = widths.get(k);
  if (v === undefined) {
    v = ctx.measureText(ch).width;
    widths.set(k, v);
  }
  return v;
}

interface Line {
  toks: (Token & { w: number })[];
  w: number;
}

/** 一個字一個字量寬度、超過就換行（手動換行照樣換） */
function wrapTokens(ctx: Ctx, tokens: readonly Token[], maxW: number): Line[] {
  const lines: Line[] = [];
  let cur: Line = { toks: [], w: 0 };
  for (const t of tokens) {
    if (t.ch === '\n') {
      lines.push(cur);
      cur = { toks: [], w: 0 };
      continue;
    }
    const w = mw(ctx, t.ch);
    if (cur.w + w > maxW && cur.toks.length) {
      lines.push(cur);
      cur = { toks: [], w: 0 };
    }
    cur.toks.push({ ...t, w });
    cur.w += w;
  }
  lines.push(cur);
  return lines;
}

/* ---------- 背景圖與頭像 ---------- */

/** 像素化與色調的設定 */
export type GradeFields = Pick<
  RpgState,
  'pixelSize' | 'levels' | 'dither' | 'tone' | 'brightness' | 'contrast' | 'saturation'
>;

/** 背景圖的像素化（畫面大小） */
export function buildBackground(
  img: RetroSource,
  s: GradeFields & Pick<RpgState, 'ratio' | 'view'>,
): AnyCanvas {
  const out = screenSize(s.ratio);
  const crop = viewCrop(img, out, s.view);
  return pixelateImage(img, out.width, out.height, {
    crop,
    pixelSize: s.pixelSize,
    levels: s.levels,
    dither: s.dither,
    tone: s.tone,
    brightness: s.brightness,
    contrast: s.contrast,
    saturation: s.saturation,
  });
}

/** 頭像的像素化（256 × 256，中央的正方形，像素大小 × 0.7） */
export const FACE_SIZE = 256;
export function buildFace(img: RetroSource, s: GradeFields): AnyCanvas {
  return pixelateImage(img, FACE_SIZE, FACE_SIZE, {
    crop: null,
    pixelSize: Math.max(2, Math.round(s.pixelSize * 0.7)),
    levels: s.levels,
    dither: s.dither,
    tone: s.tone,
    brightness: s.brightness,
    contrast: s.contrast,
    saturation: s.saturation,
  });
}

/* ---------- 一格 ---------- */

export interface SceneInput {
  state: RpgState;
  /** 第幾頁（夾在範圍內） */
  page: number;
  /** 像素化後的背景圖（畫面大小）；null＝空白（不畫任何東西） */
  bg: CanvasImageSource | null;
  /** 像素化後的頭像（256 × 256） */
  face: CanvasImageSource | null;
  /** 字型（ctx.font 的字型部分，例 `"Cubic 11", monospace`） */
  font: string;
  clocks: FrameClocks;
  /** 預覽的時間（毫秒）：給了就讓繼續箭頭與選項的游標底色依時間動；不給＝匯出（依 clocks.blinkOn） */
  now?: number;
  /** 不畫掃描線（輕量 GIF） */
  noScanline?: boolean;
}

export interface SceneResult {
  /** 台詞全部打出來了 */
  done: boolean;
  /** 開場動畫還在跑（名字、地點、演出文字） */
  animating: boolean;
  /** 有一直在動的繼續箭頭或選項游標（預覽的閒置動畫） */
  idle: boolean;
}

export function drawScene(ctx: Ctx, input: SceneInput): SceneResult {
  const S = input.state;
  const { width: W, height: H } = screenSize(S.ratio);
  const capturing = input.now === undefined;
  const now = input.now ?? 0;
  const { blinkOn } = input.clocks;
  const cssFont = (px: number) => `${px}px ${input.font}`;

  const th: WindowTheme = THEMES[S.theme];
  const pages = parsePages(S.dialogue, S.speaker);
  const pageIndex = Math.max(0, Math.min(pages.length - 1, input.page));
  const pg = pages[pageIndex];
  const isLast = pageIndex === pages.length - 1;

  ctx.clearRect(0, 0, W, H);
  if (!input.bg) return { done: true, animating: false, idle: false };
  /*
   * 線的接合：原作一直畫在同一張畫布上，文字效果「描邊」的字把接合設成圓角之後就一直是圓角（名字的描邊在 save／restore 裡，
   * 不會留下來），之後每一格的名字標籤框線都以圓角接合畫；陰影、無時一直是預設的尖角。新版每一格可能是新的畫布，
   * 所以照這個規則先設好（膠囊兩側的反鋸齒才會和原作逐像素相同）。
   */
  ctx.lineJoin = S.textFx === 'outline' ? 'round' : 'miter';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(input.bg, 0, 0);

  if (S.vignette) {
    const g = ctx.createRadialGradient(
      W / 2,
      H / 2,
      Math.min(W, H) * 0.35,
      W / 2,
      H / 2,
      Math.max(W, H) * 0.72,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  const fs = S.fontSize;
  const alpha = S.boxOpacity / 100;
  const name = (pg.speaker || '').trim();
  const choices = isLast ? listLines(S.choices) : [];
  const u = W / BASE_WIDTH;
  const m = Math.round(12 * u);
  const pad = Math.round(18 * u);
  const gap = Math.round(4 * u);
  const lineH = Math.round(fs * 1.5);
  const bh = Math.max(Math.round(H * 0.27), pad * 2 + lineH * 4 - Math.round(fs * 0.45));
  const bw = W - m * 2;
  const bx = m;
  const nfs = Math.round(fs * 0.88);
  const nh = Math.round(nfs + pad * 1.1);
  const NS = S.nameStyle;
  const nameSpace = !name
    ? 0
    : NS === 'pill'
      ? Math.round(nh * 0.62) + gap
      : NS === 'inline'
        ? 0
        : NS === 'window'
          ? nh + gap * 2
          : nh;
  const by =
    S.winPos === 'top'
      ? m + nameSpace
      : S.winPos === 'middle'
        ? Math.round((H - bh) / 2)
        : H - bh - m;

  /** 文字效果（陰影／描邊）＋字 */
  const fxText = (
    str: string,
    x: number,
    y: number,
    color: string,
    size: number,
    base: string,
  ): void => {
    if (!str) return;
    if (S.textFx !== 'none') {
      const sc = lum(base || color) > 140 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
      if (S.textFx === 'shadow') {
        const o = Math.max(2, Math.round(size * 0.08));
        ctx.fillStyle = sc;
        ctx.fillText(str, x + o, y + o);
      } else {
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, Math.round(size * 0.18));
        ctx.strokeStyle = sc;
        ctx.strokeText(str, x, y);
      }
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  };

  /** 視窗：影子＋漸層底色、上方的反光、框線、內線（規格 3.4） */
  const drawWindow = (
    x0: number,
    y0: number,
    w0: number,
    h0: number,
    rad?: number,
    k0?: number,
  ): void => {
    const k = k0 == null ? 1 : k0;
    const x = Math.round(x0);
    const y = Math.round(y0);
    const w = Math.round(w0);
    const h = Math.round(h0);
    const r = rad != null ? rad : Math.max(6, Math.round(12 * u));
    const lw = Math.max(2, Math.round(2 * u));
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${(0.22 * k).toFixed(3)})`;
    ctx.shadowBlur = Math.round(14 * u);
    ctx.shadowOffsetY = Math.round(4 * u);
    ctx.globalAlpha = alpha * k;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, th.fill[0]);
    g.addColorStop(1, th.fill[1]);
    rr(ctx, x, y, w, h, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = alpha * k;
    const hl = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
    hl.addColorStop(0, 'rgba(255,255,255,0.16)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    rr(ctx, x, y, w, h, r);
    ctx.fillStyle = hl;
    ctx.fill();
    ctx.globalAlpha = k;
    ctx.lineWidth = lw;
    ctx.strokeStyle = th.border;
    rr(ctx, x + lw / 2, y + lw / 2, w - lw, h - lw, Math.max(2, r - lw / 2));
    ctx.stroke();
    const ins = lw + Math.max(3, Math.round(4 * u));
    if (w > ins * 4 && h > ins * 4) {
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4 * k;
      ctx.strokeStyle = th.inner;
      rr(ctx, x + ins + 0.5, y + ins + 0.5, w - ins * 2 - 1, h - ins * 2 - 1, Math.max(2, r - ins));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  let locBusy = false;
  let nameBusy = false;

  /* ----- 地點標示（3.9） ----- */
  if (S.location.trim()) {
    const lfs = Math.round(fs * 0.9);
    const txt = S.location.trim();
    ctx.font = cssFont(lfs);
    const tw = ctx.measureText(txt).width;
    const ph = Math.round(lfs * 2);
    const pw = Math.round(tw + 120 * u);
    const lx = m;
    const ly = S.winPos === 'top' ? H - m - ph : m + Math.round(8 * u);
    const lel = input.clocks.loc;
    const le = easeOut(lel / LOC_IN);
    const te = easeOut((lel - LOC_IN * 0.35) / (LOC_IN * 0.65));
    if (Number.isFinite(lel) && lel < LOC_IN) locBusy = true;
    ctx.save();
    ctx.beginPath();
    ctx.rect(lx, ly - 2, Math.max(0, pw * le), ph + 4);
    ctx.clip();
    ctx.globalAlpha = le;
    const lg = ctx.createLinearGradient(lx, 0, lx + pw, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)');
    lg.addColorStop(0.25, 'rgba(0,0,0,0.6)');
    lg.addColorStop(0.75, 'rgba(0,0,0,0.6)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(lx, ly, pw, ph);
    const ll = ctx.createLinearGradient(lx, 0, lx + pw, 0);
    ll.addColorStop(0, 'rgba(255,255,255,0)');
    ll.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    ll.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = ll;
    ctx.fillRect(lx, ly, pw, 1);
    ctx.fillRect(lx, ly + ph - 1, pw, 1);
    ctx.restore();
    if (te > 0) {
      ctx.globalAlpha = te;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      fxText(
        txt,
        lx + pw / 2 - Math.round((1 - te) * 18 * u),
        ly + ph / 2 + 1,
        '#ffffff',
        lfs,
        '#ffffff',
      );
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }

  let done = true;
  if (S.showWindow) {
    drawWindow(bx, by, bw, bh);

    /* ----- 頭像 ----- */
    let textX = bx + pad + Math.round(8 * u);
    let textW = bw - pad * 2 - Math.round(16 * u);
    if (input.face) {
      const fsz = bh - pad * 2;
      const fy = by + pad;
      const fx = S.faceSide === 'left' ? bx + pad : bx + bw - fsz - pad;
      ctx.drawImage(input.face, fx, fy, fsz, fsz);
      const fgap = Math.round(20 * u);
      if (S.faceSide === 'left') {
        textX = fx + fsz + fgap;
        textW = bx + bw - pad - textX;
      } else textW = fx - fgap - textX;
    }

    /* ----- 名字（3.6） ----- */
    if (name) {
      const nel = input.clocks.name;
      const np = Number.isFinite(nel) ? clamp01(nel / NAME_IN) : 1;
      if (Number.isFinite(nel) && nel < NAME_IN) nameBusy = true;
      if (np > 0) {
        ctx.font = cssFont(nfs);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const mt = ctx.measureText(name);
        const inkL = mt.actualBoundingBoxLeft || 0;
        const bo = Math.max(1, Math.round(nfs / 22));
        const inkW =
          (mt.actualBoundingBoxRight != null ? mt.actualBoundingBoxRight + inkL : mt.width) + bo;
        const light = lum(th.nameBox) > 200;
        const fill = light ? th.nameBox : shade(th.nameBox, -0.1);
        const custom = S.nameColor !== null;
        const lip = Math.max(2, Math.round(3 * u));
        const bwid = Math.max(2, Math.round(2 * u));
        const rim = light ? th.border : 'rgba(255,255,255,0.8)';
        const onFill = custom ? (S.nameColor as string) : light ? th.text : '#ffffff';
        const onWin = custom ? (S.nameColor as string) : th.accent;
        const winOutline = lum(th.fill[0]) > 150 ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.45)';

        const nameText = (x: number, y: number, col: string, outline?: string) => {
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(2, Math.round(nfs * 0.11));
          ctx.strokeStyle =
            outline || (lum(col) > 150 ? shade(fill, -0.42) : 'rgba(255,255,255,0.85)');
          ctx.strokeText(name, x, y);
          ctx.strokeText(name, x + bo, y);
          ctx.fillStyle = col;
          ctx.fillText(name, x, y);
          ctx.fillText(name, x + bo, y);
        };
        const sheen = (x: number, y: number, w: number, h: number, path: () => void) => {
          ctx.save();
          path();
          ctx.clip();
          const sh = ctx.createLinearGradient(0, y, 0, y + h * 0.6);
          sh.addColorStop(0, 'rgba(255,255,255,0.32)');
          sh.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = sh;
          ctx.fillRect(x, y, w, h);
          ctx.restore();
        };

        const nx = bx + Math.round(24 * u);
        let ax: number;
        let ay: number;
        let draw: () => void;
        if (NS === 'pill') {
          const padX = Math.round(nfs * 1.15);
          const nw = Math.round(inkW + padX * 2);
          const r = Math.round(nh / 2);
          const ny = by - Math.round(nh * 0.62);
          ax = nx + nw / 2;
          ay = ny + nh;
          draw = () => {
            rr(ctx, nx, ny + lip, nw, nh, r);
            ctx.fillStyle = shade(fill, -0.22);
            ctx.fill();
            rr(ctx, nx, ny, nw, nh, r);
            ctx.fillStyle = fill;
            ctx.fill();
            sheen(nx, ny, nw, nh, () => rr(ctx, nx, ny, nw, nh, r));
            ctx.lineWidth = bwid;
            ctx.strokeStyle = rim;
            rr(ctx, nx + bwid / 2, ny + bwid / 2, nw - bwid, nh - bwid, r - bwid / 2);
            ctx.stroke();
            nameText(nx + padX + inkL, ny + nh / 2 + 1, onFill);
          };
        } else if (NS === 'tab') {
          const padX = Math.round(nfs * 1.0);
          const nw = Math.round(inkW + padX * 2);
          const th2 = Math.round(nh * 0.92);
          const r = Math.max(4, Math.round(12 * u));
          const ny = by - th2 + bwid;
          ax = nx + nw / 2;
          ay = by;
          const path = () => {
            ctx.beginPath();
            ctx.moveTo(nx, ny + th2);
            ctx.lineTo(nx, ny + r);
            ctx.arcTo(nx, ny, nx + r, ny, r);
            ctx.lineTo(nx + nw - r, ny);
            ctx.arcTo(nx + nw, ny, nx + nw, ny + r, r);
            ctx.lineTo(nx + nw, ny + th2);
            ctx.closePath();
          };
          draw = () => {
            path();
            ctx.fillStyle = th.border;
            ctx.fill();
            sheen(nx, ny, nw, th2, path);
            const brightTab = lum(th.border) > 190;
            nameText(
              nx + padX + inkL,
              ny + th2 / 2 + 1,
              brightTab ? (lum(th.text) > 150 ? shade(th.border, -0.7) : th.text) : '#ffffff',
              brightTab ? 'rgba(255,255,255,0.85)' : shade(th.border, -0.45),
            );
          };
        } else if (NS === 'window') {
          const padX = Math.round(nfs * 0.8);
          const nw = Math.round(inkW + padX * 2);
          const ny = by - nh - gap;
          ax = nx + nw / 2;
          ay = ny + nh;
          draw = () => {
            drawWindow(nx - Math.round(18 * u), ny, nw, nh, Math.max(4, Math.round(8 * u)));
            nameText(nx - Math.round(18 * u) + padX + inkL, ny + nh / 2 + 1, onWin, winOutline);
          };
        } else {
          const x0 = bx + pad + Math.round(8 * u);
          const y0 = by + pad + Math.round(nfs * 0.6);
          ax = x0;
          ay = y0;
          draw = () => {
            const barW = Math.max(3, Math.round(5 * u));
            rr(ctx, x0, y0 - Math.round(nfs * 0.55), barW, Math.round(nfs * 1.1), barW / 2);
            ctx.fillStyle = th.border;
            ctx.fill();
            nameText(x0 + barW + Math.round(10 * u) + inkL, y0, onWin, winOutline);
          };
        }
        ctx.save();
        const sc = 0.55 + 0.45 * easeBack(np);
        ctx.globalAlpha = clamp01(np * 2.2);
        ctx.translate(ax, ay);
        ctx.scale(sc, sc);
        ctx.translate(-ax, -ay);
        draw();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    /* ----- 台詞 ----- */
    ctx.font = cssFont(fs);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const tokens = tokenize(pg.text, th.accent);
    const lines = wrapTokens(ctx, tokens, textW);
    const ty =
      by +
      pad +
      Math.round((lineH - fs) / 2) +
      (!name
        ? 0
        : NS === 'pill'
          ? Math.round(nh * 0.3)
          : NS === 'inline'
            ? Math.round(nfs * 1.35)
            : 0);
    const rv = input.clocks.reveal;
    done = rv >= tokenCount(tokens);
    let count = 0;
    outer: for (let li = 0; li < lines.length; li++) {
      let x = textX;
      for (const t of lines[li].toks) {
        if (count >= rv) break outer;
        fxText(t.ch, x, ty + li * lineH, t.color || th.text, fs, th.text);
        x += t.w;
        count++;
      }
    }

    /* ----- 選項（3.7） ----- */
    if (done && choices.length) {
      const cfs = fs;
      ctx.font = cssFont(cfs);
      let maxw = 0;
      for (const c of choices) maxw = Math.max(maxw, ctx.measureText(c).width);
      const rowH = Math.round(cfs * 1.6);
      const cw = Math.round(maxw + pad * 2 + 24 * u);
      const ch = rowH * choices.length + pad * 2 - Math.round(6 * u);
      const cxp = bx + bw - cw;
      const cyp =
        S.winPos === 'top'
          ? by + bh + gap
          : by - ch - gap - (name && cxp < bx + Math.round(260 * u) ? nh + gap : 0);
      drawWindow(cxp, cyp, cw, ch);
      const top0 = cyp + pad - Math.round(3 * u);
      const pulse = capturing
        ? blinkOn
          ? 0.3
          : 0.14
        : 0.16 + (0.14 * (Math.sin(now / 220) + 1)) / 2;
      const cx0 = cxp + Math.round(10 * u);
      const cwid = cw - Math.round(20 * u);
      const lightWin = lum(th.fill[0]) > 170;
      const cc = lightWin ? th.border : '#ffffff';
      ctx.globalAlpha = lightWin ? pulse * 1.2 : pulse;
      ctx.fillStyle = cc;
      rr(ctx, cx0, top0, cwid, rowH, Math.max(2, Math.round(4 * u)));
      ctx.fill();
      ctx.globalAlpha = lightWin ? 0.8 : 0.55;
      ctx.lineWidth = 1;
      ctx.strokeStyle = cc;
      rr(ctx, cx0 + 0.5, top0 + 0.5, cwid - 1, rowH - 1, Math.max(2, Math.round(4 * u)));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      choices.forEach((c, i) => {
        fxText(
          c,
          cxp + pad + Math.round(8 * u),
          top0 + rowH * i + rowH / 2 + 1,
          th.text,
          cfs,
          th.text,
        );
      });
    }

    /* ----- 繼續箭頭（3.7） ----- */
    if (done && S.showArrow && !choices.length) {
      const s = Math.max(5, Math.round(fs * 0.32));
      const bob = capturing
        ? blinkOn
          ? 0
          : Math.round(3 * u)
        : Math.round(((Math.sin(now / 180) + 1) / 2) * 3 * u);
      const cx = Math.round(bx + bw / 2);
      const ay = Math.round(by + bh - pad * 0.55 - s + bob - Math.round(4 * u));
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.moveTo(cx - s + 1, ay + 2);
      ctx.lineTo(cx + s + 1, ay + 2);
      ctx.lineTo(cx + 1, ay + s + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = th.border;
      ctx.beginPath();
      ctx.moveTo(cx - s, ay);
      ctx.lineTo(cx + s, ay);
      ctx.lineTo(cx, ay + s);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ----- 演出文字（3.8） ----- */
  let popBusy = false;
  const popups = S.popupAll || isLast ? listLines(S.popups) : [];
  if (popups.length) {
    const el = input.clocks.pop;
    if (el >= 0) {
      popBusy = Number.isFinite(el) && el < popTotal(popups.length);
      const pfs = Math.round(fs * 0.82);
      ctx.font = cssFont(pfs);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const ph = Math.round(pfs * 2.1);
      const padX = Math.round(pfs * 0.95);
      const vgap = Math.round(8 * u);
      const items = popups.map((t) => {
        const toks = tokenize(t, th.accent).map((tk) => ({ ...tk, w: mw(ctx, tk.ch) }));
        let w = 0;
        for (const tk of toks) w += tk.w;
        return { toks, w: Math.round(w + padX * 2) };
      });
      const stackH = items.length * ph + (items.length - 1) * vgap;
      const topY =
        S.popupPos === 'center'
          ? Math.round(H * 0.4 - stackH / 2)
          : S.winPos === 'top'
            ? H - m - stackH - Math.round(8 * u)
            : m + Math.round(8 * u);
      const accent = th.accent;
      items.forEach((it, i) => {
        const local = el - i * POP_STAGGER;
        const e = Math.max(0, Math.min(1, local / POP_IN));
        if (e <= 0) return;
        const ease = easeOut(e);
        const w = it.w;
        let x = S.popupPos === 'tr' ? W - m - w : Math.round((W - w) / 2);
        let y = topY + i * (ph + vgap);
        if (S.popupPos === 'tr') x += Math.round((1 - ease) * 44 * u);
        else y += Math.round((1 - ease) * 22 * u);
        const sc = 0.92 + 0.08 * ease;
        ctx.save();
        ctx.translate(x + w / 2, y + ph / 2);
        ctx.scale(sc, sc);
        ctx.translate(-(x + w / 2), -(y + ph / 2));
        drawWindow(x, y, w, ph, Math.round(ph / 2), ease);
        ctx.font = cssFont(pfs);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.globalAlpha = ease;
        let tx = x + padX;
        it.toks.forEach((tk, j) => {
          const col =
            tk.color ||
            (j === 0 && (tk.ch === '▶' || tk.ch === '▷' || tk.ch === '♥' || tk.ch === '★')
              ? accent
              : th.text);
          fxText(tk.ch, tx, y + ph / 2 + 1, col, pfs, th.text);
          tx += tk.w;
        });
        ctx.globalAlpha = 1;
        ctx.restore();
        const sp = (local - POP_IN * 0.6) / POP_SHINE;
        if (sp > 0 && sp < 1) {
          ctx.save();
          rr(ctx, x, y, w, ph, Math.round(ph / 2));
          ctx.clip();
          const bx2 = x - ph + (w + ph * 2) * sp;
          const sg = ctx.createLinearGradient(bx2 - ph, 0, bx2 + ph, 0);
          sg.addColorStop(0, 'rgba(255,255,255,0)');
          sg.addColorStop(0.5, 'rgba(255,255,255,0.45)');
          sg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = sg;
          ctx.fillRect(x, y, w, ph);
          ctx.restore();
        }
      });
    }
  }

  /* ----- 掃描線 ----- */
  if (S.scanline && !input.noScanline) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;
  }

  return {
    done,
    animating: popBusy || locBusy || nameBusy,
    idle: done && S.showWindow && (choices.length > 0 || S.showArrow),
  };
}

/** 每一頁的文字有沒有超出訊息視窗（最後一行的底 > 視窗底）；回傳超出的頁（從 0 起） */
export function overflowPages(
  ctx: Ctx,
  s: RpgState,
  font: string,
  face: 'left' | 'right' | null,
): number[] {
  const { width: W, height: H } = screenSize(s.ratio);
  const th = THEMES[s.theme];
  const u = W / BASE_WIDTH;
  const fs = s.fontSize;
  const pad = Math.round(18 * u);
  const lineH = Math.round(fs * 1.5);
  const bh = Math.max(Math.round(H * 0.27), pad * 2 + lineH * 4 - Math.round(fs * 0.45));
  const bw = W - Math.round(12 * u) * 2;
  const nfs = Math.round(fs * 0.88);
  const nh = Math.round(nfs + pad * 1.1);
  let textW = bw - pad * 2 - Math.round(16 * u);
  if (face) {
    const fsz = bh - pad * 2;
    textW = bw - pad * 2 - fsz - Math.round(20 * u) - (face === 'right' ? Math.round(8 * u) : 0);
  }
  ctx.font = `${fs}px ${font}`;
  const out: number[] = [];
  parsePages(s.dialogue, s.speaker).forEach((pg, i) => {
    const lines = wrapTokens(ctx, tokenize(pg.text, th.accent), textW);
    const off = !pg.speaker
      ? 0
      : s.nameStyle === 'pill'
        ? Math.round(nh * 0.3)
        : s.nameStyle === 'inline'
          ? Math.round(nfs * 1.35)
          : 0;
    const top = pad + Math.round((lineH - fs) / 2) + off;
    if (top + (lines.length - 1) * lineH + fs > bh) out.push(i);
  });
  return out;
}
