/**
 * 版面（規格第 3 節）：把心得卡片、多人比較圖排成場景節點（core/scene），預覽與下載用同一份。
 * 排版只靠「量字寬」的函式（env.measure），單元測試可以用假的字寬；畫圖時由 canvas 量。
 * 所有數值都是 1 倍時的 px；陰影不受 canvas 的縮放影響，匯出 2 倍時由 env.shadowScale 放大。
 */
import type { Rect, SceneNode, Shadow, TextFont, TextNode } from '@/core/scene';
import { breakText } from '@/core/typeset';
import type { Cell, ImageRatio, ReviewState, ViewMode } from './model';

export const CARD_FONT = 'Noto Sans TC';

export const COLORS = {
  background: '#ffffff',
  text: '#212529',
  sub: '#868e96',
  border: '#e9ecef',
  imageBox: '#e9ecef',
  chip: '#f1f3f5',
  chipText: '#495057',
  listCard: '#f1f3f5',
  listChip: '#ffffff',
  ruleBadge: 'rgba(255,255,255,0.9)',
  ruleText: '#212529',
  darkBadge: '#212529',
  darkBadgeText: '#ffffff',
  comment: '#ffffff',
  imageEdge: 'rgba(0,0,0,0.05)',
} as const;

/** 心得卡片的尺寸（1 倍） */
export const CARD = {
  width: 900,
  pad: 50,
  /* 個人資料 */
  avatar: 100,
  avatarRadius: 32,
  avatarGap: 24,
  profileBottom: 40,
  nameSize: 28,
  nameLine: 36,
  handleSize: 15,
  handleLine: 20,
  infoGap: 6,
  /* 九宮格 */
  gridCols: 3,
  gridGap: 30,
  imageRadius: 20,
  emptyOriginalHeight: 150,
  imageGap: 12,
  textPad: 4,
  textGap: 6,
  titleSize: 18,
  titleLine: 23.4,
  writerSize: 14,
  writerLine: 18,
  chipsTop: 4,
  ruleInset: 12,
  /* 清單 */
  listCols: 2,
  listGap: 20,
  listPad: 24,
  listRadius: 24,
  listTextGap: 8,
  listTitleSize: 20,
  listTitleLine: 26,
  listWriterSize: 15,
  listWriterLine: 18,
  listChipsTop: 6,
  commentTop: 10,
  commentSize: 14,
  commentLine: 21,
  commentPadX: 16,
  commentPadY: 14,
  commentRadius: 12,
  commentMin: 48,
} as const;

/** 標籤（小圓角方塊）的樣式 */
export interface ChipStyle {
  size: number;
  weight: number;
  line: number;
  padX: number;
  padY: number;
  radius: number;
  gap: number;
  fill: string;
  color: string;
}

export const CARD_CHIP: ChipStyle = {
  size: 12,
  weight: 600,
  line: 16,
  padX: 10,
  padY: 6,
  radius: 12,
  gap: 6,
  fill: COLORS.chip,
  color: COLORS.chipText,
};

export interface LayoutEnv {
  /** 字串的寬（px，1 倍） */
  measure: (font: TextFont, text: string) => number;
  /** 圖片 id → 可以畫的圖（讀不到時 null，畫成空的灰底） */
  image: (id: string) => CanvasImageSource | null;
  /** 陰影的倍率（匯出 2 倍時 2） */
  shadowScale?: number;
}

export interface CardLayout {
  width: number;
  height: number;
  nodes: SceneNode[];
  /** 每一格的範圍（點選、拖放） */
  cells: { id: string; box: Rect }[];
  /** 個人資料列的範圍（沒有個人資料時 null） */
  profile: Rect | null;
}

const font = (size: number, weight: number): TextFont => ({ family: CARD_FONT, size, weight });

const shadow = (env: LayoutEnv, color: string, blur: number, y: number): Shadow => {
  const k = env.shadowScale ?? 1;
  return { color, blur: blur * k, x: 0, y: y * k };
};

/* ---------- 文字 ---------- */

/** 依寬度斷行（保留原本的換行；中文逐字、英文以詞為單位、避頭尾） */
export function wrapLines(env: LayoutEnv, f: TextFont, text: string, width: number): string[] {
  if (!text) return [];
  return breakText(text, {
    limit: Math.max(1, width),
    unit: (ch) => env.measure(f, ch),
    segment: 'grapheme',
  }).map((l) => l.join(''));
}

/** 單行放不下時截短並加「…」 */
export function ellipsize(env: LayoutEnv, f: TextFont, text: string, width: number): string {
  if (env.measure(f, text) <= width) return text;
  const chars = breakText(text, { limit: 0, unit: () => 0, segment: 'grapheme' })[0] ?? [];
  let out = '';
  for (const ch of chars) {
    if (env.measure(f, `${out}${ch}…`) > width) break;
    out += ch;
  }
  return `${out}…`;
}

const textNode = (
  x: number,
  y: number,
  w: number,
  lines: readonly string[],
  f: TextFont,
  color: string,
  linePx: number,
  align: TextNode['align'] = 'left',
): TextNode => ({
  kind: 'text',
  x,
  y,
  w,
  h: lines.length * linePx,
  text: lines.join('\n'),
  font: f,
  color,
  align,
  wrap: 'none',
  lineHeight: linePx / f.size,
});

/** 一段文字（已斷行）＋高度；沒有字時 null */
function textBlock(
  env: LayoutEnv,
  text: string,
  f: TextFont,
  color: string,
  linePx: number,
  width: number,
): Block | null {
  const lines = wrapLines(env, f, text.trim() ? text : '', width);
  if (!lines.length) return null;
  return {
    height: lines.length * linePx,
    nodes: (x, y) => [textNode(x, y, width, lines, f, color, linePx)],
  };
}

/* ---------- 區塊（由上往下排） ---------- */

interface Block {
  height: number;
  /** 和上一個區塊之間多留的距離（CSS 的 margin-top） */
  marginTop?: number;
  nodes: (x: number, y: number) => SceneNode[];
}

/** 由上往下排區塊（區塊之間 gap，再加上各自的 marginTop）；回傳總高與節點 */
function stack(blocks: readonly (Block | null)[], x: number, y: number, gap: number) {
  const nodes: SceneNode[] = [];
  let h = 0;
  let first = true;
  for (const b of blocks) {
    if (!b) continue;
    if (!first) h += gap;
    h += b.marginTop ?? 0;
    nodes.push(...b.nodes(x, y + h));
    h += b.height;
    first = false;
  }
  return { height: h, nodes };
}

/** 一排標籤（放不下時換行；比整排還寬的標籤自己斷行） */
export function chipsBlock(
  env: LayoutEnv,
  tags: readonly string[],
  style: ChipStyle,
  width: number,
  marginTop = 0,
): Block | null {
  const list = tags.filter((t) => t.trim());
  if (!list.length) return null;
  const f = font(style.size, style.weight);
  const inner = Math.max(1, width - style.padX * 2);
  const chips = list.map((t) => {
    const w = env.measure(f, t);
    const lines = w <= inner ? [t] : wrapLines(env, f, t, inner);
    const textW = w <= inner ? w : Math.max(...lines.map((l) => env.measure(f, l)));
    return {
      lines,
      w: Math.min(width, textW + style.padX * 2),
      h: lines.length * style.line + style.padY * 2,
    };
  });
  /* 排成好幾排 */
  const placed: { x: number; y: number; c: (typeof chips)[number] }[] = [];
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  for (const c of chips) {
    if (cx > 0 && cx + c.w > width + 1e-6) {
      cx = 0;
      cy += rowH + style.gap;
      rowH = 0;
    }
    placed.push({ x: cx, y: cy, c });
    cx += c.w + style.gap;
    rowH = Math.max(rowH, c.h);
  }
  return {
    height: cy + rowH,
    marginTop,
    nodes: (x, y) =>
      placed.flatMap(({ x: px, y: py, c }) => [
        {
          kind: 'rect',
          x: x + px,
          y: y + py,
          w: c.w,
          h: c.h,
          fill: style.fill,
          radius: Math.min(style.radius, c.h / 2),
        } satisfies SceneNode,
        textNode(
          x + px + style.padX,
          y + py + style.padY,
          c.w - style.padX * 2,
          c.lines,
          f,
          style.color,
          style.line,
        ),
      ]),
  };
}

/* ---------- 心得卡片 ---------- */

/** 個人資料列有沒有內容（頭像、暱稱、帳號任一個） */
export const hasProfile = (d: Pick<ReviewState, 'profile'>): boolean =>
  !!(d.profile.image || d.profile.name.trim() || d.profile.handle.trim());

/** 圖片框的高度（九宮格） */
export function imageBoxHeight(
  cell: Pick<Cell, 'image'>,
  ratio: ImageRatio,
  width: number,
): number {
  if (ratio === 'square') return width;
  if (!cell.image) return CARD.emptyOriginalHeight;
  return (width * cell.image.height) / cell.image.width;
}

interface CellBox {
  height: number;
  /** rowH：同一列最高的格子（清單的灰底要撐到這麼高） */
  nodes: (x: number, y: number, rowH: number) => SceneNode[];
}

function imageNodes(
  env: LayoutEnv,
  ref: Cell['image'],
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  boxShadow: Shadow,
  edge: boolean,
): SceneNode[] {
  const img = ref ? env.image(ref.id) : null;
  const inset = edge ? 1 : 0;
  const nodes: SceneNode[] = [
    { kind: 'rect', x, y, w, h, fill: COLORS.imageBox, radius, shadow: boxShadow },
  ];
  if (img)
    nodes.push({
      kind: 'image',
      x: x + inset,
      y: y + inset,
      w: w - inset * 2,
      h: h - inset * 2,
      image: img,
      fit: 'cover',
      radius: Math.max(0, radius - inset),
    });
  if (!edge) return nodes;
  nodes.push({
    kind: 'rect',
    x: x + 0.5,
    y: y + 0.5,
    w: w - 1,
    h: h - 1,
    radius: Math.max(0, radius - 0.5),
    stroke: { color: COLORS.imageEdge, width: 1 },
  });
  return nodes;
}

/** 九宮格的一格：圖片框（左上角疊規則）→ 劇本名稱 → 作者 → 心得標籤 */
function gridCell(env: LayoutEnv, cell: Cell, ratio: ImageRatio, w: number): CellBox {
  const imgH = imageBoxHeight(cell, ratio, w);
  const tw = w - CARD.textPad * 2;
  const blocks = [
    textBlock(env, cell.title, font(CARD.titleSize, 700), COLORS.text, CARD.titleLine, tw),
    textBlock(env, cell.writer, font(CARD.writerSize, 500), COLORS.sub, CARD.writerLine, tw),
    chipsBlock(env, cell.tags, CARD_CHIP, tw, CARD.chipsTop),
  ];
  const text = stack(blocks, 0, 0, CARD.textGap);
  const height = imgH + (text.height ? CARD.imageGap + text.height : 0);
  return {
    height,
    nodes: (x, y) => {
      const out = imageNodes(
        env,
        cell.image,
        x,
        y,
        w,
        imgH,
        CARD.imageRadius,
        shadow(env, 'rgba(0,0,0,0.03)', 10, 4),
        true,
      );
      const rule = cell.rule.trim();
      if (rule) {
        const f = font(12, 700);
        const maxText = w - CARD.ruleInset * 2 - 20;
        const label = ellipsize(env, f, rule, maxText);
        const bw = Math.min(maxText, env.measure(f, label)) + 20;
        const bx = x + CARD.ruleInset;
        const by = y + CARD.ruleInset;
        out.push(
          {
            kind: 'rect',
            x: bx,
            y: by,
            w: bw,
            h: 28,
            fill: COLORS.ruleBadge,
            radius: 10,
            shadow: shadow(env, 'rgba(0,0,0,0.1)', 8, 2),
          },
          textNode(bx + 10, by + 6, bw - 20, [label], f, COLORS.ruleText, 16),
        );
      }
      if (text.height)
        out.push(...stack(blocks, x + CARD.textPad, y + imgH + CARD.imageGap, CARD.textGap).nodes);
      return out;
    },
  };
}

/** 清單的一格：灰底卡片裡 規則（深色小牌）→ 劇本名稱 → 作者 → 心得標籤 → 感想 */
function listCell(env: LayoutEnv, cell: Cell, w: number): CellBox {
  const pad = CARD.listPad + CARD.textPad;
  const tw = w - pad * 2;
  const blocks = ((): (Block | null)[] => {
    const rule = cell.rule.trim();
    const rf = font(12, 700);
    const label = rule ? ellipsize(env, rf, rule, tw - 20) : '';
    const commentLines = wrapLines(
      env,
      font(CARD.commentSize, 400),
      cell.comment.trim() ? cell.comment.replace(/\s+$/, '') : '',
      tw - CARD.commentPadX * 2 - 2,
    );
    const commentH = Math.max(
      CARD.commentMin,
      commentLines.length * CARD.commentLine + CARD.commentPadY * 2 + 2,
    );
    return [
      rule
        ? {
            height: 22 + 2,
            nodes: (x, y) => {
              const bw = Math.min(tw, env.measure(rf, label) + 20);
              return [
                { kind: 'rect', x, y, w: bw, h: 22, fill: COLORS.darkBadge, radius: 8 },
                textNode(x + 10, y + 4, bw - 20, [label], rf, COLORS.darkBadgeText, 14),
              ];
            },
          }
        : null,
      textBlock(
        env,
        cell.title,
        font(CARD.listTitleSize, 700),
        COLORS.text,
        CARD.listTitleLine,
        tw,
      ),
      textBlock(
        env,
        cell.writer,
        font(CARD.listWriterSize, 500),
        COLORS.sub,
        CARD.listWriterLine,
        tw,
      ),
      chipsBlock(env, cell.tags, { ...CARD_CHIP, fill: COLORS.listChip }, tw, CARD.listChipsTop),
      commentLines.length
        ? {
            height: commentH,
            marginTop: CARD.commentTop,
            nodes: (x, y) => [
              {
                kind: 'rect',
                x: x + 0.5,
                y: y + 0.5,
                w: tw - 1,
                h: commentH - 1,
                fill: COLORS.comment,
                radius: CARD.commentRadius,
                stroke: { color: COLORS.border, width: 1 },
              },
              textNode(
                x + 1 + CARD.commentPadX,
                y + 1 + CARD.commentPadY,
                tw - CARD.commentPadX * 2 - 2,
                commentLines,
                font(CARD.commentSize, 400),
                COLORS.text,
                CARD.commentLine,
              ),
            ],
          }
        : null,
    ];
  })();
  const inner = stack(blocks, 0, 0, CARD.listTextGap).height;
  return {
    height: inner + CARD.listPad * 2,
    nodes: (x, y, rowH) => [
      { kind: 'rect', x, y, w, h: rowH, fill: COLORS.listCard, radius: CARD.listRadius },
      ...stack(blocks, x + pad, y + CARD.listPad, CARD.listTextGap).nodes,
    ],
  };
}

/** 一列放幾格、格子寬 */
export function gridColumns(view: ViewMode): { cols: number; gap: number; width: number } {
  const inner = CARD.width - CARD.pad * 2;
  const cols = view === 'grid' ? CARD.gridCols : CARD.listCols;
  const gap = view === 'grid' ? CARD.gridGap : CARD.listGap;
  return { cols, gap, width: (inner - gap * (cols - 1)) / cols };
}

/** 心得卡片（規格 3.2～3.4） */
export function layoutCard(d: ReviewState, env: LayoutEnv): CardLayout {
  const W = CARD.width;
  const P = CARD.pad;
  const inner = W - P * 2;
  const nodes: SceneNode[] = [{ kind: 'rect', x: 0, y: 0, w: W, h: 0, fill: COLORS.background }];
  let y = P;
  let profile: Rect | null = null;

  if (hasProfile(d)) {
    const p = d.profile;
    const avatar = p.image ? CARD.avatar : 0;
    const ix = P + (avatar ? avatar + CARD.avatarGap : 0);
    const iw = inner - (ix - P);
    const infoBlocks = [
      textBlock(env, p.name, font(CARD.nameSize, 800), COLORS.text, CARD.nameLine, iw),
      textBlock(env, p.handle, font(CARD.handleSize, 500), COLORS.sub, CARD.handleLine, iw),
    ];
    const info = stack(infoBlocks, 0, 0, CARD.infoGap);
    const rowH = Math.max(avatar, info.height);
    if (p.image)
      nodes.push(
        ...imageNodes(
          env,
          p.image,
          P,
          y + (rowH - avatar) / 2,
          avatar,
          avatar,
          CARD.avatarRadius,
          shadow(env, 'rgba(0,0,0,0.05)', 12, 4),
          false,
        ),
      );
    nodes.push(...stack(infoBlocks, ix, y + (rowH - info.height) / 2, CARD.infoGap).nodes);
    profile = { x: P, y, width: inner, height: rowH };
    y += rowH + CARD.profileBottom;
  }

  const { cols, gap, width: cw } = gridColumns(d.view);
  const cells: CardLayout['cells'] = [];
  for (let r = 0; r * cols < d.cells.length; r++) {
    const row = d.cells.slice(r * cols, r * cols + cols);
    const boxes = row.map((c) =>
      d.view === 'grid' ? gridCell(env, c, d.ratio, cw) : listCell(env, c, cw),
    );
    const rowH = Math.max(...boxes.map((b) => b.height));
    if (r > 0) y += gap;
    row.forEach((c, i) => {
      const x = P + i * (cw + gap);
      nodes.push(...boxes[i].nodes(x, y, rowH));
      cells.push({ id: c.id, box: { x, y, width: cw, height: rowH } });
    });
    y += rowH;
  }
  const height = Math.ceil(y + P);
  (nodes[0] as { h: number }).h = height;
  return { width: W, height, nodes, cells, profile };
}

/** 卡片用到的字（字型只下載用到的字） */
export function cardFontUses(d: ReviewState): { family: string; weight: number; text: string }[] {
  const by = new Map<number, string>();
  const add = (w: number, t: string) => by.set(w, (by.get(w) ?? '') + t);
  add(800, d.profile.name);
  add(500, d.profile.handle);
  for (const c of d.cells) {
    add(700, c.title + c.rule);
    add(500, c.writer);
    add(600, c.tags.join(''));
    if (d.view === 'list') add(400, c.comment);
  }
  add(700, '…');
  return [...by].map(([weight, text]) => ({
    family: CARD_FONT,
    weight,
    text: [...new Set(Array.from(text))].join(''),
  }));
}
