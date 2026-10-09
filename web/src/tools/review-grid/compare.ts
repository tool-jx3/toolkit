/**
 * 比較多人的心得（規格 1.8、3.6）：好幾個人的檔案依「劇本名稱」分組，每個劇本列出每個人的心得標籤與感想，排成一張圖。
 * 這裡是純函式（分組、版面）；讀檔在 compareFiles.ts。
 */
import type { SceneNode, TextFont } from '@/core/scene';
import {
  CARD_FONT,
  type ChipStyle,
  COLORS,
  chipsBlock,
  ellipsize,
  type LayoutEnv,
  wrapLines,
} from './layout';
import type { Cell } from './model';

export type CompareCell = Pick<Cell, 'rule' | 'title' | 'writer' | 'tags' | 'comment'>;

export interface ComparePerson {
  /** 檔名（錯誤訊息、除錯用） */
  file: string;
  name: string;
  handle: string;
  /** 頭像（可以畫的圖；沒有時 null） */
  avatar: CanvasImageSource | null;
  cells: CompareCell[];
}

export interface CompareEntry {
  /** people 的索引 */
  person: number;
  tags: string[];
  comment: string;
}

export interface CompareGroup {
  /** 第一次出現時的寫法 */
  title: string;
  /** 第一個有填的規則（都沒有時空白） */
  rule: string;
  entries: CompareEntry[];
}

/** 劇本名稱的比對方式：全形半形統一、去頭尾空白、連續空白當一個、英文不分大小寫 */
export const titleKey = (t: string): string =>
  t.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

/** 依劇本名稱分組（第一次出現的順序；沒有劇本名稱的格子不算） */
export function groupByTitle(people: readonly Pick<ComparePerson, 'cells'>[]): CompareGroup[] {
  const map = new Map<string, CompareGroup>();
  people.forEach((p, person) => {
    for (const c of p.cells) {
      const key = titleKey(c.title);
      if (!key) continue;
      let g = map.get(key);
      if (!g) {
        g = { title: c.title.trim(), rule: '', entries: [] };
        map.set(key, g);
      }
      if (!g.rule && c.rule.trim()) g.rule = c.rule.trim();
      g.entries.push({ person, tags: [...c.tags], comment: c.comment.trim() });
    }
  });
  return [...map.values()];
}

/* ---------- 版面 ---------- */

export const COMPARE = {
  width: 1000,
  pad: 50,
  radius: 32,
  titleSize: 32,
  titleLine: 42,
  headGap: 10,
  subSize: 18,
  subLine: 26,
  headBottom: 50,
  divider: 2,
  sectionTop: 30,
  sectionBottom: 40,
  nameSize: 28,
  nameLine: 36,
  badgeSize: 16,
  badgeLine: 21,
  badgePadX: 14,
  badgePadY: 6,
  badgeGap: 12,
  titleBottom: 24,
  rowPad: 30,
  rowRadius: 20,
  rowGap: 20,
  profileWidth: 140,
  avatar: 90,
  avatarRadius: 24,
  profileGap: 12,
  personSize: 18,
  personLine: 24,
  handleSize: 14,
  handleLine: 18,
  contentGap: 30,
  contentInnerGap: 16,
  commentSize: 18,
  commentLine: 30.6,
  commentPadX: 24,
  commentPadY: 20,
  commentRadius: 16,
} as const;

export const COMPARE_CHIP: ChipStyle = {
  size: 15,
  weight: 700,
  line: 20,
  padX: 16,
  padY: 8,
  radius: 16,
  gap: 6,
  fill: '#ffffff',
  color: COLORS.chipText,
};

const font = (size: number, weight: number): TextFont => ({ family: CARD_FONT, size, weight });

const text = (
  x: number,
  y: number,
  w: number,
  lines: readonly string[],
  f: TextFont,
  color: string,
  line: number,
  align: 'left' | 'center' = 'left',
): SceneNode => ({
  kind: 'text',
  x,
  y,
  w,
  h: lines.length * line,
  text: lines.join('\n'),
  font: f,
  color,
  align,
  wrap: 'none',
  lineHeight: line / f.size,
});

export interface CompareStrings {
  title: string;
  people: (n: number) => string;
  anonymous: string;
}

/** 比較圖（白色圓角卡片，四角透明） */
export function layoutCompare(
  people: readonly ComparePerson[],
  groups: readonly CompareGroup[],
  env: LayoutEnv,
  s: CompareStrings,
): { width: number; height: number; nodes: SceneNode[] } {
  const C = COMPARE;
  const W = C.width;
  const inner = W - C.pad * 2;
  const nodes: SceneNode[] = [];
  const bg: SceneNode & { kind: 'rect' } = {
    kind: 'rect',
    x: 0,
    y: 0,
    w: W,
    h: 0,
    fill: COLORS.background,
    radius: C.radius,
  };
  nodes.push(bg);
  let y = C.pad;
  const tf = font(C.titleSize, 800);
  const titleLines = wrapLines(env, tf, s.title, inner);
  nodes.push(text(C.pad, y, inner, titleLines, tf, COLORS.text, C.titleLine, 'center'));
  y += titleLines.length * C.titleLine + C.headGap;
  nodes.push(
    text(
      C.pad,
      y,
      inner,
      [s.people(people.length)],
      font(C.subSize, 400),
      COLORS.sub,
      C.subLine,
      'center',
    ),
  );
  y += C.subLine + C.headBottom;

  for (const g of groups) {
    nodes.push({ kind: 'rect', x: C.pad, y, w: inner, h: C.divider, fill: COLORS.border });
    y += C.divider + C.sectionTop;
    /* 規則（深色小牌）＋劇本名稱 */
    const bf = font(C.badgeSize, 800);
    const badgeW = g.rule ? Math.min(inner / 2, env.measure(bf, g.rule) + C.badgePadX * 2) : 0;
    const badgeH = C.badgeLine + C.badgePadY * 2;
    const tx = C.pad + (badgeW ? badgeW + C.badgeGap : 0);
    const nf = font(C.nameSize, 800);
    const nameLines = wrapLines(env, nf, g.title, inner - (tx - C.pad));
    const nameH = nameLines.length * C.nameLine;
    const rowH = Math.max(badgeW ? badgeH : 0, nameH);
    if (badgeW) {
      const by = y + (rowH - badgeH) / 2;
      const label = ellipsize(env, bf, g.rule, badgeW - C.badgePadX * 2);
      nodes.push(
        { kind: 'rect', x: C.pad, y: by, w: badgeW, h: badgeH, fill: COLORS.darkBadge, radius: 8 },
        text(
          C.pad + C.badgePadX,
          by + C.badgePadY,
          badgeW - C.badgePadX * 2,
          [label],
          bf,
          COLORS.darkBadgeText,
          C.badgeLine,
        ),
      );
    }
    nodes.push(
      text(
        tx,
        y + (rowH - nameH) / 2,
        inner - (tx - C.pad),
        nameLines,
        nf,
        COLORS.text,
        C.nameLine,
      ),
    );
    y += rowH + C.titleBottom;

    g.entries.forEach((e, i) => {
      const p = people[e.person];
      if (i > 0) y += C.rowGap;
      /* 左：頭像、名字、帳號 */
      const pf = font(C.personSize, 800);
      const hf = font(C.handleSize, 400);
      const nameL = wrapLines(env, pf, p.name.trim() || s.anonymous, C.profileWidth);
      const handleL = wrapLines(env, hf, p.handle, C.profileWidth);
      const colH =
        C.avatar +
        C.profileGap +
        nameL.length * C.personLine +
        (handleL.length ? C.profileGap + handleL.length * C.handleLine : 0);
      /* 右：標籤、感想 */
      const cw = inner - C.rowPad * 2 - C.profileWidth - C.contentGap;
      const chips = chipsBlock(env, e.tags, COMPARE_CHIP, cw);
      const cf = font(C.commentSize, 400);
      const commentL = wrapLines(env, cf, e.comment, cw - C.commentPadX * 2 - 2);
      const commentH = commentL.length
        ? commentL.length * C.commentLine + C.commentPadY * 2 + 2
        : 0;
      const contentH =
        (chips?.height ?? 0) + (chips && commentH ? C.contentInnerGap : 0) + commentH;
      const bodyH = Math.max(colH, contentH);
      const rowTop = y;
      nodes.push({
        kind: 'rect',
        x: C.pad,
        y: rowTop,
        w: inner,
        h: bodyH + C.rowPad * 2,
        fill: COLORS.listCard,
        radius: C.rowRadius,
      });
      const px = C.pad + C.rowPad;
      let py = rowTop + C.rowPad + (bodyH - colH) / 2;
      const ax = px + (C.profileWidth - C.avatar) / 2;
      nodes.push({
        kind: 'rect',
        x: ax,
        y: py,
        w: C.avatar,
        h: C.avatar,
        fill: COLORS.imageBox,
        radius: C.avatarRadius,
      });
      if (p.avatar)
        nodes.push({
          kind: 'image',
          x: ax,
          y: py,
          w: C.avatar,
          h: C.avatar,
          image: p.avatar,
          fit: 'cover',
          radius: C.avatarRadius,
        });
      py += C.avatar + C.profileGap;
      nodes.push(text(px, py, C.profileWidth, nameL, pf, COLORS.text, C.personLine, 'center'));
      py += nameL.length * C.personLine;
      if (handleL.length)
        nodes.push(
          text(
            px,
            py + C.profileGap,
            C.profileWidth,
            handleL,
            hf,
            COLORS.sub,
            C.handleLine,
            'center',
          ),
        );
      const cx = px + C.profileWidth + C.contentGap;
      let cy = rowTop + C.rowPad + (bodyH - contentH) / 2;
      if (chips) {
        nodes.push(...chips.nodes(cx, cy));
        cy += chips.height + (commentH ? C.contentInnerGap : 0);
      }
      if (commentH)
        nodes.push(
          {
            kind: 'rect',
            x: cx + 0.5,
            y: cy + 0.5,
            w: cw - 1,
            h: commentH - 1,
            fill: COLORS.comment,
            radius: C.commentRadius,
            stroke: { color: COLORS.border, width: 1 },
          },
          text(
            cx + 1 + C.commentPadX,
            cy + 1 + C.commentPadY,
            cw - C.commentPadX * 2 - 2,
            commentL,
            cf,
            COLORS.text,
            C.commentLine,
          ),
        );
      y = rowTop + bodyH + C.rowPad * 2;
    });
    y += C.sectionBottom;
  }
  const height = Math.ceil(y + C.pad);
  bg.h = height;
  return { width: W, height, nodes };
}

/** 比較圖用到的字 */
export function compareFontUses(
  people: readonly ComparePerson[],
  groups: readonly CompareGroup[],
  s: CompareStrings,
): { family: string; weight: number; text: string }[] {
  const by = new Map<number, string>();
  const add = (w: number, t: string) => by.set(w, (by.get(w) ?? '') + t);
  add(800, s.title + s.anonymous + people.map((p) => p.name).join(''));
  add(400, s.people(people.length) + people.map((p) => p.handle).join(''));
  for (const g of groups) {
    add(800, g.title + g.rule);
    for (const e of g.entries) {
      add(700, e.tags.join(''));
      add(400, e.comment);
    }
  }
  add(800, '…');
  return [...by].map(([weight, t]) => ({
    family: CARD_FONT,
    weight,
    text: [...new Set(Array.from(t))].join(''),
  }));
}
