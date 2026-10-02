/**
 * 文字記錄（780 × 1080 的頁）：四種版面（素面、頂部色帶、側邊色帶、雙欄配對），版面為本專案自行設計。
 * 每頁每欄：標題、副標題（格式化文字）、「標題跟著本文」、本文（格式化文字，最多 50,000 字）、垂直對齊、首行縮排。
 * 本文放不下時推到下一頁同一欄的開頭（paginate），最多 30 頁；只往後推，不會把後面的字拉回來。
 */
import { makeCanvas } from '@/core/image';
import {
  docLength,
  docText,
  joinDocs,
  layoutRich,
  plainDoc,
  type RichDoc,
  recolorLines,
  rowsThatFit,
  splitRich,
} from '@/core/richtext';
import {
  blurCanvas,
  fadeCanvas,
  layoutRichNode,
  type RichNode,
  richAdvance as richAdvanceOf,
  type SceneNode,
  type TextFont,
} from '@/core/scene';
import {
  bool,
  citeId,
  type Draft,
  DraftError,
  type FieldDef,
  type GroupDef,
  hit,
  num,
  rich,
  type SceneEnv,
  type SideDef,
  str,
  type TemplateDef,
  type Value,
} from '../model';
import { LOG_SAMPLE, S, T } from '../strings';
import { SANS, SERIF } from './kit';

const L = T.log;
export const PAGE_W = 780;
export const PAGE_H = 1080;
export const MAX_PAGES = 30;
export const MAX_BODY = 50_000;
/** 看全部：頁與頁的間隔 */
export const PAGE_GAP = 10;
const TEXT = '#323232';
const QUOTE = '#888888';

type Box4 = readonly [number, number, number, number];

interface Lane {
  title: Box4;
  sub: Box4;
  body: Box4;
  align?: 'left' | 'right';
}

interface Decor {
  box: Box4;
  axis: 'x' | 'y';
  /** 反過來淡出（另一側不透明） */
  reverse?: boolean;
}

export interface LogVariant {
  id: string;
  name: string;
  tip: string;
  /** 「標題跟著本文」的間距 */
  gap: number;
  lanes: readonly Lane[];
  /** 黑體時的版面（不給時同明體） */
  sans?: readonly Lane[];
  decor: readonly Decor[];
  /** 副標題的行數 */
  subLines: 1 | 2;
  sample: 'long' | 'short';
}

export const LOG_VARIANTS: Record<'plain' | 'band' | 'side' | 'duo', LogVariant> = {
  plain: {
    id: 'log-plain',
    name: L.plain,
    tip: L.tipPlain,
    gap: 30,
    lanes: [{ title: [110, 104, 560, 44], sub: [110, 148, 560, 28], body: [110, 208, 560, 774] }],
    decor: [],
    subLines: 1,
    sample: 'long',
  },
  band: {
    id: 'log-band',
    name: L.band,
    tip: L.tipBand,
    gap: 60,
    lanes: [{ title: [110, 196, 560, 44], sub: [110, 240, 560, 28], body: [110, 330, 560, 652] }],
    sans: [{ title: [110, 196, 560, 44], sub: [110, 240, 560, 28], body: [110, 352, 560, 630] }],
    decor: [{ box: [0, 0, 780, 270], axis: 'y' }],
    subLines: 1,
    sample: 'short',
  },
  side: {
    id: 'log-side',
    name: L.side,
    tip: L.tipSide,
    gap: 60,
    lanes: [{ title: [226, 118, 500, 44], sub: [226, 162, 500, 28], body: [226, 304, 500, 678] }],
    sans: [{ title: [226, 118, 500, 44], sub: [226, 162, 500, 28], body: [226, 330, 500, 652] }],
    decor: [{ box: [0, 0, 196, 1080], axis: 'x' }],
    subLines: 1,
    sample: 'short',
  },
  duo: {
    id: 'log-duo',
    name: L.duo,
    tip: L.tipDuo,
    gap: 50,
    lanes: [
      { title: [52, 52, 310, 44], sub: [52, 96, 210, 54], body: [52, 176, 292, 590] },
      {
        title: [418, 316, 310, 44],
        sub: [518, 360, 210, 54],
        body: [436, 440, 292, 590],
        align: 'right',
      },
    ],
    decor: [
      { box: [40, 790, 310, 236], axis: 'y', reverse: true },
      { box: [430, 52, 310, 236], axis: 'y' },
    ],
    subLines: 2,
    sample: 'short',
  },
};

/* ---------- 欄位 id ---------- */

export const pageSide = (n: number) => `p${n}`;
export const pageNo = (side: string): number | null => {
  const m = /^p(\d+)$/.exec(side);
  return m ? Number(m[1]) : null;
};
export const fid = (
  n: number,
  lane: number,
  name: 'title' | 'sub' | 'follow' | 'body' | 'align' | 'indent',
) => `p${n}.${lane}.${name}`;

export const pagesOf = (d: Draft): number[] => (d.pages?.length ? d.pages : [1]);
export const activeOf = (d: Draft): number => {
  const ps = pagesOf(d);
  return d.active !== undefined && ps.includes(d.active) ? d.active : ps[0];
};

/* ---------- 字型與排版 ---------- */

export type LogKind = 'title' | 'sub' | 'body';

export interface LogStyle {
  font: TextFont;
  lineHeight: number;
  letterSpacing: number;
  spaceScale: number;
  scaleX: number;
}

const SIZES: Record<LogKind, number> = { title: 32, sub: 20, body: 22 };

/** 明體／黑體的字型、字重、行高、字距 */
export function logStyle(serif: boolean, kind: LogKind): LogStyle {
  return {
    font: {
      family: serif ? SERIF : SANS,
      weight: kind === 'title' ? (serif ? 600 : 700) : kind === 'body' && serif ? 500 : 400,
      size: SIZES[kind],
    },
    lineHeight: kind === 'body' ? (serif ? 1.5 : 1.3) : 1.3,
    letterSpacing: serif ? -2.5 : -0.5,
    spaceScale: serif ? 2 : 1,
    scaleX: 0.95,
  };
}

const isSerif = (d: Draft) => str(d.v, 'o.font') !== 'sans';
export const lanesOf = (variant: LogVariant, d: Draft): readonly Lane[] =>
  !isSerif(d) && variant.sans ? variant.sans : variant.lanes;

function richNode(box: Box4, doc: RichDoc, st: LogStyle, more: Partial<RichNode> = {}): RichNode {
  return {
    kind: 'rich',
    x: box[0],
    y: box[1],
    w: box[2],
    h: box[3],
    doc,
    font: st.font,
    boldWeight: 700,
    lineHeight: st.lineHeight,
    letterSpacing: st.letterSpacing,
    spaceScale: st.spaceScale,
    scaleX: st.scaleX,
    ...more,
  };
}

/** 一頁一欄本文的節點（分頁與畫圖共用） */
export function bodyNode(
  variant: LogVariant,
  d: Draft,
  n: number,
  lane: number,
  box?: Box4,
): RichNode {
  const ln = lanesOf(variant, d)[lane];
  const id = fid(n, lane, 'body');
  return richNode(box ?? ln.body, rich(d.v, id), logStyle(isSerif(d), 'body'), {
    indent: num(d.v, fid(n, lane, 'indent'), 30),
    continued: d.cont?.[id] === true,
    align: ln.align === 'right' ? 'right' : 'left',
    valign: (str(d.v, fid(n, lane, 'align')) || 'middle') as 'top' | 'middle' | 'bottom',
  });
}

export type Advance = (node: RichNode) => (ch: string, bold: boolean) => number;

/** 副標題實際的高度（最多 subLines 行） */
function subHeight(
  variant: LogVariant,
  d: Draft,
  n: number,
  lane: number,
  advance: Advance,
): number {
  const ln = lanesOf(variant, d)[lane];
  const node = richNode(ln.sub, rich(d.v, fid(n, lane, 'sub')), logStyle(isSerif(d), 'sub'));
  const rows = layoutRich(node.doc, { width: node.w, advance: advance(node), scaleX: node.scaleX });
  const lh = node.font.size * (node.lineHeight ?? 1.3);
  return Math.min(ln.sub[3], Math.min(variant.subLines, rows.length) * lh);
}

/** 本文的框（雙欄配對＋標題跟著本文時往下移） */
export function bodyBox(
  variant: LogVariant,
  d: Draft,
  n: number,
  lane: number,
  advance: Advance,
): Box4 {
  const ln = lanesOf(variant, d)[lane];
  if (variant.lanes.length < 2 || !bool(d.v, fid(n, lane, 'follow'))) return ln.body;
  const delta = Math.max(
    0,
    ln.sub[1] + subHeight(variant, d, n, lane, advance) + variant.gap - ln.body[1],
  );
  return [ln.body[0], ln.body[1] + delta, ln.body[2], Math.max(0, ln.body[3] - delta)];
}

/* ---------- 預設值 ---------- */

const sampleBody = (variant: LogVariant): RichDoc =>
  recolorLines(plainDoc(LOG_SAMPLE[variant.sample], TEXT), (t) => t.startsWith('──'), QUOTE);

function pageDefaults(variant: LogVariant, n: number, body: RichDoc | null): Record<string, Value> {
  const v: Record<string, Value> = {};
  variant.lanes.forEach((_, lane) => {
    v[fid(n, lane, 'title')] = plainDoc(L.sampleTitle, TEXT);
    v[fid(n, lane, 'sub')] = plainDoc(L.sampleSub, TEXT);
    v[fid(n, lane, 'follow')] = false;
    v[fid(n, lane, 'body')] = body ?? plainDoc('', TEXT);
    v[fid(n, lane, 'align')] = 'middle';
    v[fid(n, lane, 'indent')] = 30;
  });
  return v;
}

function optionDefaults(variant: LogVariant): Record<string, Value> {
  const v: Record<string, Value> = {
    'o.font': 'serif',
    'o.bg': 'solid',
    'o.bgColor': '#f9f9f9',
    'o.bgBlur': false,
    'o.bgOpacity': 100,
  };
  variant.decor.forEach((_, i) => {
    v[`o.d${i}`] = 'solid';
    v[`o.d${i}.color`] = '#666666';
    v[`o.d${i}.blur`] = false;
    v[`o.d${i}.opacity`] = 100;
  });
  return v;
}

/* ---------- 欄位 ---------- */

function optionGroups(variant: LogVariant): GroupDef[] {
  const bgFields = (
    mode: string,
    color: string,
    blur: string,
    opacity: string,
    colorLabel: string,
  ): FieldDef[] => [
    {
      id: mode,
      label: mode === 'o.bg' ? L.bgMode : L.decorMode,
      type: 'radio',
      options: [
        { value: 'solid', label: L.solid },
        { value: 'image', label: L.image },
      ],
    },
    { id: color, label: colorLabel, type: 'color', when: { id: mode, is: 'solid' } },
    { id: blur, label: L.blur, type: 'checkbox', when: { id: mode, is: 'image' } },
    {
      id: opacity,
      label: L.opacity,
      type: 'number',
      min: 0,
      max: 100,
      unit: '%',
      when: { id: mode, is: 'image' },
    },
  ];
  return [
    {
      id: 'layout',
      label: L.layout,
      fields: [
        {
          id: 'o.font',
          label: L.font,
          type: 'radio',
          options: [
            { value: 'serif', label: L.serif },
            { value: 'sans', label: L.sans },
          ],
        },
        { id: 'o.sep', type: 'separator' },
        ...bgFields('o.bg', 'o.bgColor', 'o.bgBlur', 'o.bgOpacity', L.bgColor),
      ],
      slots: [
        {
          id: 'o.bgImg',
          width: PAGE_W,
          height: PAGE_H,
          when: { id: 'o.bg', is: 'image' },
          after: true,
        },
      ],
    },
    ...variant.decor.map(
      (dc, i): GroupDef => ({
        id: `decor${i}`,
        label: variant.decor.length > 1 ? L.decorN(i + 1) : L.decor,
        fields: bgFields(
          `o.d${i}`,
          `o.d${i}.color`,
          `o.d${i}.blur`,
          `o.d${i}.opacity`,
          L.decorColor,
        ),
        slots: [
          {
            id: `o.d${i}Img`,
            width: dc.box[2],
            height: dc.box[3],
            when: { id: `o.d${i}`, is: 'image' },
            after: true,
          },
        ],
      }),
    ),
  ];
}

function pageGroups(variant: LogVariant, n: number): GroupDef[] {
  const two = variant.lanes.length > 1;
  return variant.lanes.flatMap((_, lane): GroupDef[] => [
    {
      id: `title${lane}`,
      label: two ? L.titleLane(lane) : L.title,
      fields: [
        {
          id: fid(n, lane, 'title'),
          label: L.titleText,
          type: 'rich',
          rows: 1,
          note: L.titleNote,
          clear: true,
          color: TEXT,
        },
        {
          id: fid(n, lane, 'sub'),
          label: L.subText,
          type: 'rich',
          rows: variant.subLines,
          note: L.subNote,
          clear: true,
          color: TEXT,
        },
        { id: fid(n, lane, 'follow'), label: L.follow(variant.gap), type: 'checkbox' },
      ],
    },
    {
      id: `body${lane}`,
      label: two ? L.bodyLane(lane) : L.body,
      fields: [
        {
          id: fid(n, lane, 'body'),
          label: L.bodyText,
          type: 'rich',
          max: MAX_BODY,
          note: L.bodyNote,
          color: TEXT,
        },
        {
          id: fid(n, lane, 'align'),
          label: L.align,
          type: 'radio',
          options: [
            { value: 'top', label: L.top },
            { value: 'middle', label: L.middle },
            { value: 'bottom', label: L.bottom },
          ],
        },
        {
          id: fid(n, lane, 'indent'),
          label: L.indent,
          type: 'number',
          min: 0,
          max: 50,
          unit: 'px',
        },
      ],
    },
  ]);
}

/* ---------- 畫面 ---------- */

/** 看全部時第 i 頁的位置 */
export function pageOffset(i: number): { x: number; y: number } {
  return { x: (i % 3) * (PAGE_W + PAGE_GAP), y: Math.floor(i / 3) * (PAGE_H + PAGE_GAP) };
}

export function logSize(d: Draft): { width: number; height: number } {
  if (d.view !== 'all') return { width: PAGE_W, height: PAGE_H };
  const n = pagesOf(d).length;
  return {
    width: Math.min(3, n) * (PAGE_W + PAGE_GAP) - PAGE_GAP,
    height: Math.ceil(n / 3) * (PAGE_H + PAGE_GAP) - PAGE_GAP,
  };
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
const fillCache = new Map<string, { src: CanvasImageSource | null; canvas: AnyCanvas }>();

/** 背景或裝飾區的點陣（單色、或 #f9f9f9 上的圖片＋不透明度＋模糊；裝飾區再往一側淡出） */
function fillCanvas(
  key: string,
  w: number,
  h: number,
  mode: string,
  color: string,
  img: CanvasImageSource | null,
  blur: boolean,
  opacity: number,
  fade: Decor | null,
): AnyCanvas {
  const src = mode === 'image' ? img : null;
  const sig = JSON.stringify([key, w, h, mode, color, blur, opacity, fade?.axis, fade?.reverse]);
  const hit0 = fillCache.get(sig);
  if (hit0 && hit0.src === src) return hit0.canvas;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = mode === 'image' ? '#f9f9f9' : color;
  ctx.fillRect(0, 0, w, h);
  if (src) {
    const layer = makeCanvas(w, h);
    const lc = layer.getContext('2d') as CanvasRenderingContext2D;
    const s = src as { width: number; height: number };
    const r = Math.max(w / s.width, h / s.height);
    lc.imageSmoothingEnabled = true;
    lc.imageSmoothingQuality = 'high';
    lc.drawImage(src, (w - s.width * r) / 2, (h - s.height * r) / 2, s.width * r, s.height * r);
    if (blur) blurCanvas(layer, 10);
    ctx.globalAlpha = opacity / 100;
    ctx.drawImage(layer, 0, 0);
    ctx.globalAlpha = 1;
  }
  if (fade) fadeCanvas(c, fade.axis, fade.reverse ? 1 : 0, fade.reverse ? 0 : 1);
  if (fillCache.size > 40) fillCache.clear();
  fillCache.set(sig, { src, canvas: c });
  return c;
}

export interface PageSceneOptions {
  /** 頁序（頁碼 = index + 1） */
  index: number;
  /** 看全部時：點頁面切換到那一頁（點選區的鍵 `goto/<n>`） */
  overview?: boolean;
}

/** 一頁的場景（頁面座標；看全部時由呼叫端用群組位移） */
export function pageScene(
  variant: LogVariant,
  d: Draft,
  env: SceneEnv,
  n: number,
  o: PageSceneOptions,
): SceneNode[] {
  const v = d.v;
  const side = pageSide(n);
  const goto = o.overview ? { key: `goto/${n}`, label: S.gotoPage(o.index + 1) } : undefined;
  /* 看全部時整頁只有一個點選區（切換到那一頁），其他元素不能點 */
  const opt = (g: string, label: string) =>
    goto ? undefined : hit('options', g, `${L.options}：${label}`);
  const pg = (g: string, label: string) =>
    goto ? undefined : hit(side, g, `${L.pageN(o.index + 1)}：${label}`);
  const nodes: SceneNode[] = [];
  const bgMode = str(v, 'o.bg') || 'solid';
  nodes.push({
    kind: 'image',
    x: 0,
    y: 0,
    w: PAGE_W,
    h: PAGE_H,
    image: fillCanvas(
      'bg',
      PAGE_W,
      PAGE_H,
      bgMode,
      str(v, 'o.bgColor') || '#f9f9f9',
      env.image('o.bgImg'),
      bool(v, 'o.bgBlur'),
      num(v, 'o.bgOpacity', 100),
      null,
    ),
    fit: 'fill',
  });
  nodes.push({
    kind: 'rect',
    x: 0,
    y: 0,
    w: PAGE_W,
    h: PAGE_H,
    fill: 'rgba(0,0,0,0)',
    hit: goto ?? opt('layout', L.layout),
  });
  variant.decor.forEach((dc, i) => {
    const [x, y, w, h] = dc.box;
    nodes.push({
      kind: 'image',
      x,
      y,
      w,
      h,
      fit: 'fill',
      image: fillCanvas(
        `d${i}`,
        w,
        h,
        str(v, `o.d${i}`) || 'solid',
        str(v, `o.d${i}.color`) || '#666666',
        env.image(`o.d${i}Img`),
        bool(v, `o.d${i}.blur`),
        num(v, `o.d${i}.opacity`, 100),
        dc,
      ),
      hit: opt(`decor${i}`, variant.decor.length > 1 ? L.decorN(i + 1) : L.decor),
    });
  });
  const serif = isSerif(d);
  const lanes = lanesOf(variant, d);
  const advance: Advance = (node) => (ch, bold) => richAdvanceOf(env.measure, node, ch, bold);
  lanes.forEach((ln, lane) => {
    const box = bodyBox(variant, d, n, lane, advance);
    const body = bodyNode(variant, d, n, lane, box);
    const align = ln.align === 'right' ? 'right' : 'left';
    let title: Box4 = ln.title;
    let sub: Box4 = ln.sub;
    if (variant.lanes.length < 2 && bool(v, fid(n, lane, 'follow'))) {
      const top = layoutRichNode(env.measure, body).top;
      const delta = top - variant.gap - (ln.sub[1] + ln.sub[3]);
      title = [ln.title[0], ln.title[1] + delta, ln.title[2], ln.title[3]];
      sub = [ln.sub[0], ln.sub[1] + delta, ln.sub[2], ln.sub[3]];
    } else if (variant.lanes.length > 1 && bool(v, fid(n, lane, 'follow'))) {
      const delta = Math.max(
        0,
        layoutRichNode(env.measure, body).top -
          variant.gap -
          (ln.sub[1] + subHeight(variant, d, n, lane, advance)),
      );
      title = [ln.title[0], ln.title[1] + delta, ln.title[2], ln.title[3]];
      sub = [ln.sub[0], ln.sub[1] + delta, ln.sub[2], ln.sub[3]];
    }
    const titleLabel = variant.lanes.length > 1 ? L.titleLane(lane) : L.title;
    const bodyLabel = variant.lanes.length > 1 ? L.bodyLane(lane) : L.body;
    nodes.push({
      kind: 'rect',
      x: box[0],
      y: box[1],
      w: box[2],
      h: box[3],
      fill: 'rgba(0,0,0,0)',
      hit: pg(`body${lane}`, bodyLabel),
    });
    nodes.push({
      kind: 'rect',
      x: title[0],
      y: title[1],
      w: title[2],
      h: sub[1] + sub[3] - title[1],
      fill: 'rgba(0,0,0,0)',
      hit: pg(`title${lane}`, titleLabel),
    });
    if (!env.noText) {
      nodes.push(body);
      nodes.push(
        richNode(title, rich(v, fid(n, lane, 'title')), logStyle(serif, 'title'), {
          align,
          maxLines: 1,
        }),
      );
      nodes.push(
        richNode(sub, rich(v, fid(n, lane, 'sub')), logStyle(serif, 'sub'), {
          align,
          maxLines: variant.subLines,
        }),
      );
    }
  });
  if (!env.noText)
    nodes.push({
      kind: 'text',
      x: 690,
      y: 1026,
      w: 60,
      h: 28,
      text: String(o.index + 1),
      font: { family: serif ? SERIF : SANS, weight: 400, size: 20 },
      color: '#aaaaaa',
      align: 'right',
      lineHeight: 1.3,
    });
  /* 出處（有圖時） */
  const credit = (slot: string, mode: string, x: number, y: number, w: number) => {
    const c = str(v, citeId(slot)).trim();
    if (!c || str(v, mode) !== 'image' || !env.image(slot)) return;
    nodes.push({
      kind: 'text',
      x,
      y,
      w,
      text: `ⓒ ${c}`,
      font: { family: SANS, weight: 400, size: 12 },
      color: '#666666',
      align: 'center',
      shrink: 0.6,
    });
  };
  credit('o.bgImg', 'o.bg', 4, PAGE_H - 24, PAGE_W - 8);
  variant.decor.forEach((dc, i) => {
    const [x, y, w, h] = dc.box;
    credit(
      `o.d${i}Img`,
      `o.d${i}`,
      x + 4,
      dc.axis === 'x' ? y + 8 : dc.reverse ? y + 8 : y + h - 20,
      Math.min(w - 8, PAGE_W - x - 8),
    );
  });
  return nodes;
}

/* ---------- 版型定義 ---------- */

function createPage(
  d: Draft,
  variant: LogVariant,
  after: number,
  source: number | null,
): { draft: Draft; n: number } | null {
  const pages = pagesOf(d);
  const n = Array.from({ length: MAX_PAGES }, (_, i) => i + 1).find((k) => !pages.includes(k));
  if (!n) return null;
  const v = { ...d.v, ...pageDefaults(variant, n, null) };
  const touched = { ...d.touched };
  if (source !== null)
    variant.lanes.forEach((_, lane) => {
      for (const name of ['title', 'sub', 'follow', 'align', 'indent'] as const) {
        const from = fid(source, lane, name);
        const to = fid(n, lane, name);
        v[to] = d.v[from] ?? v[to];
        if (d.touched[from]) touched[to] = true;
      }
    });
  const list = [...pages];
  list.splice(after + 1, 0, n);
  return { draft: { ...d, v, touched, pages: list }, n };
}

/** 新增一頁（在最後，沿用目前頁的標題、副標題與設定）並切過去；30 頁時 null */
export function addPage(d: Draft, variant: LogVariant): Draft | null {
  const pages = pagesOf(d);
  if (pages.length >= MAX_PAGES) return null;
  const made = createPage(d, variant, pages.length - 1, activeOf(d));
  return made ? { ...made.draft, active: made.n } : null;
}

/** 刪除一頁（連同文字與那一頁的貼紙）；只剩一頁時 null */
export function removePage(d: Draft, n: number): Draft | null {
  const pages = pagesOf(d);
  const i = pages.indexOf(n);
  if (i < 0 || pages.length <= 1) return null;
  const list = pages.filter((k) => k !== n);
  const prefix = `p${n}.`;
  const keep = <T>(m: Record<string, T>) =>
    Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(prefix)));
  return {
    ...d,
    pages: list,
    active: list[Math.min(i, list.length - 1)],
    v: keep(d.v),
    touched: keep(d.touched) as Record<string, true>,
    cont: keep(d.cont ?? {}) as Record<string, true>,
    stickers: d.stickers.filter((s) => s.page !== n),
  };
}

export interface PaginateResult {
  draft: Draft;
  changed: boolean;
  /** 到頁數或字數上限、還有放不下的字 */
  capped: boolean;
}

/**
 * 自動分頁：每頁每欄的本文放不下時，把放不下的部分接到下一頁同一欄本文的最前面（需要時在最後加一頁，沿用這一頁的設定）。
 * 一路往後推到最後一頁；到 30 頁或接起來超過 50,000 字時保留在原頁（capped）。
 */
export function paginate(d: Draft, variant: LogVariant, advance: Advance): PaginateResult {
  let next: Draft = {
    ...d,
    v: { ...d.v },
    touched: { ...d.touched },
    cont: { ...(d.cont ?? {}) },
    pages: [...pagesOf(d)],
  };
  let changed = false;
  let capped = false;
  for (let index = 0; index < (next.pages?.length ?? 0); index++) {
    for (let lane = 0; lane < variant.lanes.length; lane++) {
      const pages = next.pages ?? [];
      const n = pages[index];
      const box = bodyBox(variant, next, n, lane, advance);
      const node = bodyNode(variant, next, n, lane, box);
      const rows = layoutRich(node.doc, {
        width: node.w,
        advance: advance(node),
        indent: node.indent,
        continued: node.continued,
        scaleX: node.scaleX,
      });
      const max = rowsThatFit(box[3], node.font.size * (node.lineHeight ?? 1.5));
      const split = splitRich(node.doc, rows, max);
      if (!split || !docText(split.after)) continue;
      if (index === pages.length - 1) {
        if (pages.length >= MAX_PAGES) {
          capped = true;
          continue;
        }
        const made = createPage(next, variant, index, n);
        if (!made) {
          capped = true;
          continue;
        }
        next = { ...made.draft, cont: next.cont };
      }
      const target = fid((next.pages ?? [])[index + 1], lane, 'body');
      const joined = joinDocs(split.after, rich(next.v, target));
      if (docLength(joined) > MAX_BODY) {
        capped = true;
        continue;
      }
      const id = fid(n, lane, 'body');
      next.v[id] = split.before;
      next.v[target] = joined;
      next.cont = { ...next.cont };
      if (split.continued) next.cont[target] = true;
      else delete next.cont[target];
      next.touched[target] = true;
      changed = true;
    }
  }
  return { draft: changed ? next : d, changed, capped };
}

function makeTemplate(variant: LogVariant): TemplateDef {
  return {
    id: variant.id,
    name: variant.name,
    tag: '文字',
    tip: variant.tip,
    kind: 'textlog',
    initial: () => ({
      v: { ...optionDefaults(variant), ...pageDefaults(variant, 1, sampleBody(variant)) },
      touched: {},
      images: {},
      stickers: [],
      pages: [1],
      active: 1,
      view: 'single',
      cont: {},
    }),
    size: (d) => logSize(d),
    sides: (d): SideDef[] => [
      { id: 'options', label: L.options, groups: optionGroups(variant) },
      ...pagesOf(d).map((n, i) => ({
        id: pageSide(n),
        label: S.pageTab(i + 1),
        heading: S.pageTab(i + 1),
        groups: pageGroups(variant, n),
      })),
    ],
    defaults: (d) => {
      const out: Record<string, Value> = { ...optionDefaults(variant) };
      for (const n of pagesOf(d)) Object.assign(out, pageDefaults(variant, n, null));
      return out;
    },
    scene: (d, env) => {
      const pages = pagesOf(d);
      if (d.view !== 'all') {
        const n = activeOf(d);
        return pageScene(variant, d, env, n, { index: pages.indexOf(n) });
      }
      return pages.map(
        (n, i): SceneNode => ({
          kind: 'group',
          ...pageOffset(i),
          clip: { x: 0, y: 0, width: PAGE_W, height: PAGE_H },
          children: pageScene(variant, d, env, n, { index: i, overview: true }),
        }),
      );
    },
    stickerArea: (d, s) => {
      const pages = pagesOf(d);
      const n = s?.page ?? activeOf(d);
      const o = d.view === 'all' ? pageOffset(Math.max(0, pages.indexOf(n))) : { x: 0, y: 0 };
      return { x: o.x, y: o.y, width: PAGE_W, height: PAGE_H };
    },
    stickerOffset: (d, s) =>
      d.view === 'all' ? pageOffset(Math.max(0, pagesOf(d).indexOf(s.page ?? -1))) : { x: 0, y: 0 },
    stickerVisible: (d, s) => d.view === 'all' || s.page === activeOf(d),
    restore: (raw) => {
      const list = raw.pages;
      if (
        !Array.isArray(list) ||
        !list.length ||
        list.length > MAX_PAGES ||
        list.some((n) => !Number.isInteger(n) || n < 1 || n > MAX_PAGES) ||
        new Set(list).size !== list.length
      )
        throw new DraftError('頁面清單不正確。');
      const v: Record<string, Value> = { ...optionDefaults(variant) };
      for (const n of list) Object.assign(v, pageDefaults(variant, n, null));
      const cont: Record<string, true> = {};
      for (const n of list)
        variant.lanes.forEach((_, lane) => {
          const id = fid(n, lane, 'body');
          if (raw.cont?.[id] === true) cont[id] = true;
        });
      return {
        v,
        touched: {},
        images: {},
        stickers: [],
        pages: [...list],
        active: typeof raw.active === 'number' && list.includes(raw.active) ? raw.active : list[0],
        view: raw.view === 'all' ? 'all' : 'single',
        cont,
      };
    },
  };
}

export const logPlain = makeTemplate(LOG_VARIANTS.plain);
export const logBand = makeTemplate(LOG_VARIANTS.band);
export const logSide = makeTemplate(LOG_VARIANTS.side);
export const logDuo = makeTemplate(LOG_VARIANTS.duo);

/** 版型 id → 文字記錄的版面 */
export const variantOf = (id: string): LogVariant | null =>
  Object.values(LOG_VARIANTS).find((x) => x.id === id) ?? null;
