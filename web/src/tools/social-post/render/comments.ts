/**
 * 留言（規格 3.5）：疊在貼文上（390 × 844：貼文畫面＋半透明黑＋面板）或只有面板（高度依內容）。
 */
import { type Comment, type Post, SHEET_EMOJI } from '../model';
import { S } from '../strings';
import { ellipsize, layoutLines, linkTokens, PIN, type Run } from '../text';
import { avatar, badgeRun, type Env, linesToOps, PHONE_H, STATUS_H, W, withAlpha } from './common';
import type { Op, Rect, ScreenLayout } from './ops';
import { postScreen } from './post';
import { INHERIT_LH, ui } from './theme';

export interface SheetLayout {
  ops: Op[];
  height: number;
  parts: { head: Rect; list: Rect; foot: Rect | null };
}

const LIKE_COL = 22;

/** 一則留言（從 top 開始）；回傳指令與高 */
function layoutComment(env: Env, m: Comment, top: number): { ops: Op[]; height: number } {
  const { pal, fs, measure } = env;
  const pr = env.state.profile;
  const ops: Op[] = [];
  const size = m.reply ? 26 : 34;
  const ax = m.reply ? 60 : 16;
  const user = m.author ? pr.username : m.username;
  const img = m.author ? pr.avatar : m.avatar;
  const verified = m.author ? pr.verified : m.verified;
  ops.push(...avatar(img, ax + size / 2, top + 10 + size / 2, size, pal));

  const bodyX = ax + size + 12;
  const likeX = W - 16 - LIKE_COL;
  const bodyW = Math.max(40, likeX - 12 - bodyX);
  let y = top + 10;

  /* 第一行：帳號、徽章、時間、置頂、· 作者（間隔 6，放不下時換行） */
  const hf = ui(13 * fs);
  const hb = ui(13 * fs, 600);
  const hlh = 16 * fs;
  const gap = (): Run => ({ text: ' ', font: hf, color: pal.sec, advance: 6 });
  const runs: Run[] = [{ text: user, font: hb, color: pal.ink }];
  if (verified) runs.push(badgeRun(hb, 12, 4));
  if (m.time) runs.push(gap(), { text: m.time, font: hf, color: pal.sec });
  if (m.pinned)
    runs.push(
      gap(),
      { text: PIN, font: hf, color: pal.sec, advance: 15 },
      { text: S.screen.pinned, font: hf, color: pal.sec },
    );
  if (m.author) runs.push(gap(), { text: S.screen.authorTag, font: hf, color: pal.sec });
  const head = layoutLines(runs, bodyW, measure);
  ops.push(...linesToOps(head, bodyX, y, hlh, pal));
  y += head.length * hlh;

  /* 內容 */
  const tf = ui(14 * fs);
  const tlh = 18 * fs;
  if (m.text) {
    y += 2;
    const lines = layoutLines(
      linkTokens(m.text).map((t) => ({
        text: t.text,
        font: tf,
        color: t.link ? pal.link : pal.ink,
      })),
      bodyW,
      measure,
    );
    ops.push(...linesToOps(lines, bodyX, y, tlh, pal));
    y += lines.length * tlh;
  }

  /* 回覆列 */
  const af = ui(12 * fs, 600);
  /* 12 × 1.6 的行；作者按讚時那一列至少是小頭像的 16（原作 .c-a 是 flex，高＝最高的那一個） */
  const tlh12 = 12 * fs * INHERIT_LH;
  const alh = m.authorLiked ? Math.max(16, tlh12) : tlh12;
  y += 6;
  ops.push({ t: 'text', x: bodyX, y, lh: alh, text: S.screen.reply, font: af, color: pal.sec });
  if (m.authorLiked) {
    const x = bodyX + measure(S.screen.reply, af) + 14;
    ops.push(...avatar(pr.avatar, x + 8, y + alh / 2, 16, pal));
    ops.push({
      t: 'icon',
      name: 'heart',
      x: x + 12,
      y: y + alh / 2 + 1,
      size: 10,
      color: pal.red,
      fill: pal.red,
    });
  }
  y += alh;

  /* 查看另外 N 則回覆 */
  if (m.more > 0) {
    y += 12;
    ops.push({
      t: 'rect',
      x: bodyX,
      y: y + tlh12 / 2 - 0.5,
      w: 24,
      h: 1,
      fill: withAlpha(pal.sec, 0.7),
    });
    ops.push({
      t: 'text',
      x: bodyX + 36,
      y,
      lh: tlh12,
      text: S.screen.moreReplies(m.more),
      font: af,
      color: pal.sec,
    });
    y += tlh12;
  }

  /* 右邊的讚 */
  const lx = likeX + LIKE_COL / 2;
  const ly = top + 10 + 6;
  ops.push(
    m.liked
      ? { t: 'icon', name: 'heart', x: lx - 7, y: ly, size: 14, color: pal.red, fill: pal.red }
      : { t: 'icon', name: 'heart', x: lx - 7, y: ly, size: 14, color: pal.sec },
  );
  if (m.likes) {
    const lf = ui(12 * fs);
    ops.push({
      t: 'text',
      x: lx,
      y: ly + 16,
      lh: tlh12,
      text: m.likes,
      font: lf,
      color: pal.sec,
      align: 'center',
    });
  }
  const bodyH = y - (top + 10);
  /* 右邊那一欄：上 6 ＋ 愛心 14 ＋ 間隔 2 ＋ 讚數（同原作 .c-l，沒有內容的短留言時可能比較高） */
  const likeH = 6 + 14 + 2 + (m.likes ? tlh12 : 0);
  return { ops, height: 10 + Math.max(size, bodyH, likeH) + 10 };
}

/** 面板上方（把手＋標題）的高 */
const headHeight = (fs: number) => 12 + 14 + 16 * fs * INHERIT_LH + 12;
/** 面板下方（線＋表情＋輸入列）的高 */
const footHeight = (fs: number) => 1 + 10 + (24 * fs + 12) + 44 + 30;

/**
 * 留言面板。fixedHeight 給了時面板固定這麼高（疊在貼文上；清單放不下的裁掉，下方固定在底），
 * 否則依內容。rounded：上緣圓角 16。
 */
export function layoutSheet(
  env: Env,
  post: Post,
  top: number,
  { fixedHeight, rounded }: { fixedHeight?: number; rounded: boolean },
): SheetLayout {
  const { pal, fs, measure } = env;
  const pr = env.state.profile;
  const off = post.commentsOff;
  const ops: Op[] = [];
  const hh = headHeight(fs);
  const fh = off ? 0 : footHeight(fs);

  /* 清單（先排好，才知道高度） */
  const list: Op[] = [];
  let listH: number;
  if (off) {
    const b = ui(16 * fs, 700);
    const s = ui(14 * fs);
    const bl = 16 * fs * INHERIT_LH;
    const sl = 14 * fs * INHERIT_LH;
    const content = bl + 6 + sl;
    const natural = Math.max(220, 40 + content + 80);
    listH = fixedHeight !== undefined ? Math.max(0, fixedHeight - hh) : natural;
    const areaTop = top + hh + 40;
    const areaH = Math.max(content, listH - 120);
    const cy = areaTop + (areaH - content) / 2;
    list.push({
      t: 'text',
      x: W / 2,
      y: cy,
      lh: bl,
      text: S.screen.offTitle,
      font: b,
      color: pal.ink,
      align: 'center',
    });
    list.push({
      t: 'text',
      x: W / 2,
      y: cy + bl + 6,
      lh: sl,
      text: S.screen.offBody,
      font: s,
      color: pal.sec,
      align: 'center',
    });
  } else {
    let y = top + hh + 4;
    for (const m of post.sheet.items) {
      const c = layoutComment(env, m, y);
      list.push(...c.ops);
      y += c.height;
    }
    y += 8;
    const natural = y - (top + hh);
    listH = fixedHeight !== undefined ? Math.max(0, fixedHeight - hh - fh) : natural;
  }
  const height = fixedHeight ?? hh + listH + fh;

  /* 面板底 */
  const r = rounded ? 16 : 0;
  ops.push({ t: 'rect', x: 0, y: top, w: W, h: height, r: [r, r, 0, 0], fill: pal.elev });
  /* 把手與標題 */
  ops.push({
    t: 'rect',
    x: W / 2 - 20,
    y: top + 8,
    w: 40,
    h: 4,
    r: 2,
    fill: withAlpha(pal.sec, 0.5),
  });
  const tl = 16 * fs * INHERIT_LH;
  ops.push({
    t: 'text',
    x: W / 2,
    y: top + 26,
    lh: tl,
    text: S.screen.sheetTitle,
    font: ui(16 * fs, 700),
    color: pal.ink,
    align: 'center',
  });
  const listRect: Rect = { x: 0, y: top + hh, width: W, height: listH };
  ops.push({ t: 'group', clip: listRect, ops: list });

  /* 下方 */
  let foot: Rect | null = null;
  if (!off) {
    const fy = top + height - fh;
    foot = { x: 0, y: fy, width: W, height: fh };
    ops.push({ t: 'rect', x: 0, y: fy, w: W, h: fh, fill: pal.elev });
    ops.push({ t: 'rect', x: 0, y: fy, w: W, h: 1, fill: pal.line });
    const ef = ui(24 * fs);
    const ey = fy + 1 + 10 + 2;
    const slot = (W - 20) / SHEET_EMOJI.length;
    SHEET_EMOJI.forEach((e, i) => {
      ops.push({
        t: 'text',
        x: 10 + slot * (i + 0.5),
        y: ey,
        lh: 24 * fs,
        text: e,
        font: ef,
        color: pal.ink,
        align: 'center',
      });
    });
    const iy = ey + 24 * fs + 10;
    ops.push(...avatar(pr.avatar, 16 + 20, iy + 22, 40, pal));
    const px = 16 + 40 + 12;
    const pw = W - 16 - px;
    ops.push({
      t: 'rect',
      x: px + 0.5,
      y: iy + 0.5,
      w: pw - 1,
      h: 43,
      r: 22,
      stroke: { color: pal.line, width: 1 },
    });
    const pf = ui(14 * fs);
    ops.push({
      t: 'text',
      x: px + 16,
      y: iy,
      lh: 44,
      text: ellipsize(S.screen.inputHint(pr.username), pw - 32, pf, measure),
      font: pf,
      color: pal.sec,
    });
  }
  return {
    ops,
    height,
    parts: { head: { x: 0, y: top, width: W, height: hh }, list: listRect, foot },
  };
}

/** 留言畫面：疊在貼文上（390 × 844）或只有面板 */
export function commentsScreen(env: Env, post: Post): ScreenLayout & { sheet: SheetLayout } {
  const { pal } = env;
  if (!post.sheet.backdrop) {
    const sheet = layoutSheet(env, post, 0, { rounded: false });
    return {
      width: W,
      height: sheet.height,
      background: pal.elev,
      ops: sheet.ops,
      hits: [],
      parts: { ...cleanParts(sheet.parts), sheet: { x: 0, y: 0, width: W, height: sheet.height } },
      sheet,
    };
  }
  const behind = postScreen(env, post);
  const top = post.sheet.height === 'full' ? STATUS_H : Math.round(PHONE_H * 0.34 * 100) / 100;
  const sheet = layoutSheet(env, post, top, { fixedHeight: PHONE_H - top, rounded: true });
  const ops: Op[] = [
    { t: 'group', clip: { x: 0, y: 0, width: W, height: PHONE_H }, ops: behind.ops },
    { t: 'rect', x: 0, y: 0, w: W, h: PHONE_H, fill: 'rgba(0,0,0,0.5)' },
    ...sheet.ops,
  ];
  return {
    width: W,
    height: PHONE_H,
    background: pal.bg,
    ops,
    hits: [],
    parts: { ...cleanParts(sheet.parts), sheet: { x: 0, y: top, width: W, height: PHONE_H - top } },
    sheet,
  };
}

function cleanParts(p: SheetLayout['parts']): Record<string, Rect> {
  const out: Record<string, Rect> = { head: p.head, list: p.list };
  if (p.foot) out.foot = p.foot;
  return out;
}

/** 留言面板的內容（HTML 的留言面板：把手＋標題、清單、下方分開切） */
export function sheetOnly(env: Env, post: Post): SheetLayout {
  return layoutSheet(env, post, 0, { rounded: true });
}
