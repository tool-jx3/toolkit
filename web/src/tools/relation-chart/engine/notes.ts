/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 便利貼與圖表節點的畫法（原作的 noteMarkup、noteFontSize、noteAutoFontSize、noteWrapLines、noteEdge、chartNoteMarkup、
 * chartNoteSeries、noteBleedPad、viewerViewBox）：畫在所有圖層之上（便利貼層），不是角色。
 * 紙面＝畫布配色的便利貼紙色（深色 #2a2a2a、淺色 #e0e0e0；原作取介面主題的 --panel2，本站換成分頁的畫布配色，D3）。
 * 隱藏紙面：紙面、分隔線寫成透明（匯出只剩文字），紙色只放在編輯畫面的 CSS 變數裡（滑過才叫回來）。
 */
import { radarStateName } from '../logic/card';
import { variantOf } from '../model/library';
import { ownColor } from '../model/normalize';
import { NOTE_BAR } from '../model/notes';
import type { CharEntry, Note, Palette, RadarTpl } from '../model/types';
import { S } from '../strings';
import { type ChartSeries, charts } from './charts';
import { displayName, esc, exactTextWidth, type SheetCtx } from './geom';

export const NOTE_LH = 1.35;
const FS_MIN = 8;
const FS_MAX = 28;
const CHART_TITLE_FS = 14;
const CHART_LEGEND_FS = 11;

export interface NoteLook {
  paper: string;
  ink: string;
  edge: string;
  accent: string;
}

/** 紙色亮就壓暗、暗就提亮（原作的 noteEdge） */
export function noteEdge(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#444444';
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => Number.parseInt(x, 16));
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const f = luma > 0.55 ? 0.72 : 1.35;
  const cl = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * f)))
      .toString(16)
      .padStart(2, '0');
  return `#${cl(r)}${cl(g)}${cl(b)}`;
}

/** 便利貼的配色（深色＝原作的 --panel2／--ink／--accent；淺色＝原作的淺色主題） */
export function noteLook(palette: Palette): NoteLook {
  const paper = palette === 'light' ? '#e0e0e0' : '#2a2a2a';
  const ink = palette === 'light' ? '#121212' : '#ffffff';
  return { paper, ink, edge: noteEdge(paper), accent: ink };
}

/** 依寬度斷行：先照使用者的換行切段，段內逐字塞（字寬估算同純文字角色） */
export function noteWrapLines(text: string, maxW: number, k: number): string[] {
  const out: string[] = [];
  for (const para of String(text || '').split('\n')) {
    if (!para) {
      out.push('');
      continue;
    }
    let cur = '';
    for (const ch of para) {
      if (cur && exactTextWidth(cur + ch) * k > maxW) {
        out.push(cur);
        cur = ch;
      } else cur += ch;
    }
    out.push(cur);
  }
  return out;
}

export const noteTextPad = (fs: number): number => Math.max(9, fs * 0.55);

function textFits(w: number, h: number, text: string, fs: number): boolean {
  const pad = noteTextPad(fs);
  const innerW = w - pad * 2;
  const bodyH = h - NOTE_BAR - pad;
  if (innerW <= 4 || bodyH <= 0) return false;
  return noteWrapLines(text, innerW, fs / 15).length * fs * NOTE_LH <= bodyH;
}

const fsCache = new Map<string, number>();

/** 自動字級：8～28 裡「斷行後塞得進內文區」的最大整數（空白＝依便利貼大小） */
export function noteAutoFontSize(n: Pick<Note, 'w' | 'h' | 'text'>): number {
  const key = `${n.w}x${n.h}|${n.text}`;
  const hit = fsCache.get(key);
  if (hit !== undefined) return hit;
  let fs: number;
  if (!n.text) fs = Math.max(FS_MIN, Math.min(FS_MAX, Math.round(Math.min(n.w, n.h) / 13)));
  else {
    let lo = FS_MIN;
    let hi = FS_MAX;
    fs = FS_MIN;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (textFits(n.w, n.h, n.text, mid)) {
        fs = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
  }
  if (fsCache.size > 600) fsCache.clear();
  fsCache.set(key, fs);
  return fs;
}

/** 字級：個別 → 分頁預設 → 自動 */
export function noteFontSize(ctx: Pick<SheetCtx, 's'>, n: Note): number {
  if (n.size && n.size >= 1) return n.size;
  if (ctx.s.defStickySize >= 1) return ctx.s.defStickySize;
  return noteAutoFontSize(n);
}

/** 圖表節點要畫的序列：A、B 各一組（各自選的狀態） */
export function chartNoteSeries(
  ctx: SheetCtx,
  n: Note,
  lib: { library: readonly CharEntry[] },
  tpl: RadarTpl,
): ChartSeries[] {
  const ch = n.chart;
  if (!ch) return [];
  const one = (id: number, idx: number, key: string): ChartSeries | null => {
    const c = id ? ctx.byId.get(id) : undefined;
    const v = c ? variantOf(lib as { library: CharEntry[] }, c).variant : undefined;
    if (!c || !v) return null;
    const list = v.radars.filter((s) => s.tpl === tpl.id);
    if (!list.length) return null;
    const i = Math.min(idx, list.length - 1);
    const nm = radarStateName(list[i], i, list.length);
    return {
      key,
      name: displayName(c) + (nm ? `・${nm}` : ''),
      own: ownColor(c.color) ?? '',
      vals: list[i].vals,
    };
  };
  const out = [one(ch.a, ch.stA, 'a'), ch.b ? one(ch.b, ch.stB, 'b') : null].filter(
    (x): x is ChartSeries => !!x,
  );
  return charts.assignColors(out, charts.PALETTE);
}

/** 編輯畫面的標記 */
export interface NoteUi {
  /** 正在就地編輯的便利貼（文字讓位給輸入框、外框亮起） */
  editing?: number | null;
}

export interface NoteRender {
  look: NoteLook;
  /** 數值範本與角色庫（圖表節點用；沒給＝範本不存在） */
  radarTpls?: readonly RadarTpl[];
  library?: readonly CharEntry[];
  /** null＝匯出／互動網頁（沒有小圓鈕、把手、命中框） */
  ui: NoteUi | null;
}

const f1 = (v: number) => v.toFixed(1);

/** 橫槓上的小圓鈕的圖示（24 單位見方；本站自己畫的） */
const ICONS: Record<'pin' | 'del' | 'cfg', string> = {
  pin: '<path d="M9 3h6l-1 5 3 3H7l3-3zM12 11v9" fill="none" stroke-linejoin="round" stroke-linecap="round"/>',
  del: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke-linecap="round"/>',
  cfg: '<path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke-linecap="round"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="17" r="2"/>',
};

/** 一張便利貼（或圖表節點） */
export function noteSvg(ctx: SheetCtx, n: Note, r: NoteRender): string {
  const { paper, ink, edge, accent } = r.look;
  const ui = r.ui;
  const fs = noteFontSize(ctx, n);
  const k = fs / 15;
  const lh = fs * NOTE_LH;
  const bare = n.bare;
  const pad = noteTextPad(fs);
  const x = n.x - n.w / 2;
  const y = n.y - n.h / 2;
  const top = y + NOTE_BAR;
  const body =
    `<rect${bare ? ' class="note-paper"' : ''} x="${f1(x)}" y="${f1(y)}" width="${f1(n.w)}" height="${f1(n.h)}" rx="3" fill="${bare ? 'rgba(0,0,0,0)' : paper}" stroke="${edge}"${bare ? ' stroke-opacity="0"' : ''} stroke-width="1.5"/>` +
    `<line${bare ? ' class="note-sep"' : ''} x1="${f1(x)}" y1="${f1(top)}" x2="${f1(x + n.w)}" y2="${f1(top)}" stroke="${edge}"${bare ? ' stroke-opacity="0"' : ''} stroke-width="1"/>`;
  let content: string;
  let hit = '';
  if (n.chart) {
    const ch = n.chart;
    const tpl = r.radarTpls?.find((t) => t.id === ch.tpl);
    const series = tpl ? chartNoteSeries(ctx, n, { library: r.library ?? [] }, tpl) : [];
    const cpad = 10;
    const titleLine = n.text.split('\n')[0];
    const titleH = n.text ? CHART_TITLE_FS * 1.5 : 0;
    const rows = ch.legend && series.length ? series : [];
    const legendH = rows.length ? CHART_LEGEND_FS * 1.6 * rows.length + 4 : 0;
    const bodyTop = top + cpad * 0.6;
    const bodyH = Math.max(40, n.h - NOTE_BAR - cpad * 1.2 - titleH - legendH);
    const msg = (t: string) =>
      `<text x="${f1(x + n.w / 2)}" y="${f1(bodyTop + bodyH / 2)}" text-anchor="middle" font-size="12" fill="${ink}" fill-opacity=".6">${esc(t)}</text>`;
    const inner = !tpl
      ? msg(S.note.chartNoTpl)
      : !series.length
        ? msg(S.note.chartNoData)
        : charts.chartSvg(tpl, series, {
            pal: charts.PALETTE,
            axisName: (i) => S.radar.axisN(i + 1),
            box: { x: x + cpad, y: bodyTop + titleH, w: n.w - cpad * 2, h: bodyH },
            color: ink,
          });
    const title = n.text
      ? `<text x="${f1(x + cpad)}" y="${f1(bodyTop + CHART_TITLE_FS)}" font-size="${CHART_TITLE_FS}" font-weight="700" fill="${ink}"${bare ? ` stroke="${paper}" stroke-width="3" paint-order="stroke" stroke-linejoin="round"` : ''}>${esc(titleLine)}</text>`
      : '';
    const legend = rows
      .map((sr, i) => {
        const ly = y + n.h - cpad * 0.6 - (rows.length - 1 - i) * CHART_LEGEND_FS * 1.6;
        return `<circle cx="${f1(x + cpad + 5)}" cy="${f1(ly - 4)}" r="4.5" fill="${esc(sr.color ?? '')}"/><text x="${f1(x + cpad + 14)}" y="${f1(ly)}" font-size="${CHART_LEGEND_FS}" fill="${ink}"${bare ? ` stroke="${paper}" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round"` : ''}>${esc(sr.name ?? '')}</text>`;
      })
      .join('');
    content = `<g class="chart-body">${title}${inner}${legend}</g>`;
    if (bare && ui)
      hit = `<rect class="note-hit" x="${f1(x)}" y="${f1(top)}" width="${f1(n.w)}" height="${f1(n.h - NOTE_BAR)}" fill="rgba(0,0,0,0)"/>`;
  } else {
    const lines = noteWrapLines(n.text, n.w - pad * 2, k);
    const bodyH = n.h - NOTE_BAR - pad;
    const maxLines = Math.max(1, Math.floor(bodyH / lh));
    const shown = lines.slice(0, maxLines);
    if (lines.length > maxLines && shown.length)
      shown[shown.length - 1] = shown[shown.length - 1].replace(/.$/u, '…');
    const tOut = bare
      ? ` stroke="${paper}" stroke-width="${Math.max(1.5, fs * 0.22).toFixed(2)}" paint-order="stroke" stroke-linejoin="round"`
      : '';
    content = `<g class="note-text">${shown
      .map(
        (ln, i) =>
          `<text x="${f1(x + pad)}" y="${f1(top + pad * 0.5 + fs * 0.95 + i * lh)}" font-size="${fs}" fill="${ink}"${tOut} xml:space="preserve">${esc(ln)}</text>`,
      )
      .join('')}</g>`;
    if (bare && ui) {
      const tw = shown.reduce((m, ln) => Math.max(m, exactTextWidth(ln) * k), 0);
      const hw = Math.max(tw + 8, 44);
      const hh = Math.max(shown.length * lh + 4, 26);
      hit = `<rect class="note-hit" x="${f1(x + pad - 4)}" y="${f1(top + pad * 0.5 - 2)}" width="${f1(hw)}" height="${f1(hh)}" fill="rgba(0,0,0,0)"/>`;
    }
  }
  let bar = '';
  let grip = '';
  if (ui) {
    const R = 11;
    const by = y + NOTE_BAR / 2;
    const btn = (
      side: 'l' | 'r',
      i: number,
      act: 'pin' | 'del' | 'cfg',
      on: boolean,
      tip: string,
    ) => {
      const bx = side === 'l' ? x + pad + R + i * (R * 2 + 6) : x + n.w - pad - R - i * (R * 2 + 6);
      const col = on ? accent : ink;
      const s = 10.5 / 24;
      return `<g class="note-btn" data-note-act="${act}" data-noteid="${n.id}"><title>${esc(tip)}</title><circle cx="${f1(bx)}" cy="${f1(by)}" r="${R + 5}" fill="rgba(0,0,0,0)"/><circle class="nb-ring" cx="${f1(bx)}" cy="${f1(by)}" r="${R}" fill="rgba(0,0,0,0)" stroke="${col}" stroke-opacity="${on ? 1 : 0.32}" stroke-width="${on ? 1.6 : 1}"/><g class="nb-ico" transform="translate(${f1(bx - 12 * s)},${f1(by - 12 * s)}) scale(${s.toFixed(4)})" stroke="${col}" fill="${col}" stroke-width="${on ? 3 : 2.4}" opacity="${on ? 1 : 0.72}" pointer-events="none">${ICONS[act]}</g></g>`;
    };
    bar =
      btn('l', 0, 'pin', n.locked, S.note.pinTip) +
      btn('r', 0, 'del', false, S.note.closeTip) +
      btn('r', 1, 'cfg', !!n.size, S.note.cfgTip);
    if (!n.locked) {
      const hs = 13;
      const hx = x + n.w;
      const hy = y + n.h;
      grip = `<g class="note-grip" data-noteid="${n.id}"><title>${esc(S.note.gripTip)}</title><rect x="${f1(hx - hs - 8)}" y="${f1(hy - hs - 8)}" width="${f1(hs + 12)}" height="${f1(hs + 12)}" fill="rgba(0,0,0,0)"/><path d="M ${f1(hx - hs)} ${f1(hy)} H ${f1(hx)} V ${f1(hy - hs)} Z" fill="${edge}" opacity="0.75"/></g>`;
    }
  }
  const cls = `note-node${bare ? ' note-bare' : ''}${n.chart ? ' chart-node' : ''}${ui?.editing === n.id ? ' note-editing' : ''}`;
  const style = ui
    ? ` style="cursor:${n.locked ? 'pointer' : 'move'}${bare ? `;--nb-fill:${paper};--nb-edge:${edge}` : ''}"`
    : '';
  return `<g class="${cls}" data-noteid="${n.id}"${style}>${body}${hit}${content}${bar}${grip}</g>`;
}

/** 整層便利貼（沒有便利貼＝空字串） */
export function notesSvg(ctx: SheetCtx, r: NoteRender): string {
  const notes = ctx.sheet.notes ?? [];
  if (!notes.length) return '';
  return notes.map((n) => noteSvg(ctx, n, r)).join('');
}

/** 便利貼超出畫布時的外擴（溢出量＋96；不畫出血框、不出提醒，原作的 noteBleedPad） */
export function noteBleedPad(ctx: Pick<SheetCtx, 'sheet' | 'W' | 'H'>): number {
  let overflow = 0;
  for (const n of ctx.sheet.notes ?? [])
    overflow = Math.max(
      overflow,
      -(n.x - n.w / 2),
      -(n.y - n.h / 2),
      n.x + n.w / 2 - ctx.W,
      n.y + n.h / 2 - ctx.H,
    );
  return overflow > 0 ? Math.ceil(overflow + 96) : 0;
}

/** 有幾張便利貼（一部分）在畫布外 */
export function notesOutside(ctx: Pick<SheetCtx, 'sheet' | 'W' | 'H'>): number {
  return (ctx.sheet.notes ?? []).filter(
    (n) => n.x - n.w / 2 < 0 || n.y - n.h / 2 < 0 || n.x + n.w / 2 > ctx.W || n.y + n.h / 2 > ctx.H,
  ).length;
}
