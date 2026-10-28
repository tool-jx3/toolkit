/**
 * 私訊（規格 3.12；原作 c35aa85、781628e）：訊息列表與對話。預覽與 PNG 都是 390 × 844（放不下的裁掉）；
 * 對話的訊息少時從上面排，放不下時讓最新的訊息貼在下面（舊的從上面裁掉）。
 * HTML（viewer）：訊息列表依內容加高；對話是上方列、可以捲動的訊息、下方的輸入列三段（chatPieces）。
 */
import { imageSize, mixHex, type Thread, threadPreview, threadTitle } from '../model';
import { S } from '../strings';
import { ellipsize, type FontSpec, type Line, layoutLines, linkTokens, type Run } from '../text';
import { avatar, badgeRun, type Env, linesToOps, PHONE_H, STATUS_H, statusBar, W } from './common';
import type { Hit, Op, Radius, Rect, ScreenLayout } from './ops';
import { contrastText, INHERIT_LH, ui } from './theme';

/** 訊息列表的上方列、對話的上方列與下方的高 */
export const DM_TOP_H = 50;
export const CHAT_TOP_H = 56;
export const CHAT_FOOT_H = 82;
/** 在線上的綠點的顏色（本站自己挑，D5） */
export const ONLINE = '#3ecf6e';

/**
 * 在線上的綠點：大頭貼（左上 x、y，直徑 d）的右下角。外徑（含 3 的底色框）＝直徑的 26%（最小 11），綠色＝外徑 − 6，
 * 再往外移外徑的 12%（原作的 .dm-on 被後面的 border-box 蓋過，實際量到：大頭貼 56 時外徑 14.5、34 時 11）。
 */
function onlineDot(env: Env, x: number, y: number, d: number): Op[] {
  const outer = Math.max(11, d * 0.26);
  const shift = outer * 0.12;
  const cx = x + d - outer / 2 + shift;
  const cy = y + d - outer / 2 + shift;
  return [
    { t: 'circle', cx, cy, r: outer / 2, fill: env.pal.bg },
    { t: 'circle', cx, cy, r: outer / 2 - 3, fill: ONLINE },
  ];
}

/* ---------- 訊息列表 ---------- */

export interface DmOptions {
  /** HTML：依內容加高 */
  viewer?: boolean;
}

/** 訊息列表：狀態列、上方列（‹、自己的帳號、編輯）、搜尋、「訊息／請求」、每個對話一列 */
export function dmListScreen(env: Env, opts: DmOptions = {}): ScreenLayout {
  const { pal, fs, measure, state } = env;
  const ops: Op[] = [];
  const hits: Hit[] = [];
  const parts: Record<string, Rect> = {};
  let y = 0;
  if (state.screen.status) {
    ops.push(...statusBar(env, 0, pal.ink));
    y = STATUS_H;
  }
  parts.status = { x: 0, y: 0, width: W, height: y };

  /* 上方列（高 50） */
  {
    const cy = y + DM_TOP_H / 2;
    ops.push({ t: 'icon', name: 'back', x: 10, y: cy - 13, size: 26, color: pal.ink, sw: 2.2 });
    hits.push({
      key: 'dm:back',
      label: S.viewer.back,
      box: { x: 4, y, width: 38, height: DM_TOP_H },
    });
    const editX = W - 16 - 24;
    ops.push({ t: 'icon', name: 'edit', x: editX, y: cy - 12, size: 24, color: pal.ink });
    const f = ui(20 * fs, 700);
    const lh = 20 * fs * 1.3;
    const name = ellipsize(state.profile.username, Math.max(20, editX - 8 - 44 - 16), f, measure);
    ops.push({ t: 'text', x: 44, y: cy - lh / 2, lh, text: name, font: f, color: pal.ink });
    const cx = 44 + measure(name, f) + 4;
    ops.push({
      t: 'icon',
      name: 'chevronDown',
      x: cx,
      y: cy - 6,
      size: 12,
      color: pal.ink,
      sw: 2.6,
    });
    parts.top = { x: 0, y, width: W, height: DM_TOP_H };
    y += DM_TOP_H;
  }
  /* 搜尋（上 4、下 10、左右 16；高 38、圓角 10） */
  {
    const top = y + 4;
    ops.push({ t: 'rect', x: 16, y: top, w: W - 32, h: 38, r: 10, fill: pal.btn });
    ops.push({ t: 'icon', name: 'search', x: 28, y: top + 11, size: 16, color: pal.sec, sw: 2.4 });
    const lh = 15 * fs * INHERIT_LH;
    ops.push({
      t: 'text',
      x: 52,
      y: top + 19 - lh / 2,
      lh,
      text: S.screen.dmSearch,
      font: ui(15 * fs),
      color: pal.sec,
    });
    y = top + 38 + 10;
  }
  /* 「訊息」「請求」（上下 8） */
  {
    const lh = 16 * fs * INHERIT_LH;
    const top = y + 8;
    ops.push({
      t: 'text',
      x: 16,
      y: top,
      lh,
      text: S.screen.dmMessages,
      font: ui(16 * fs, 700),
      color: pal.ink,
    });
    ops.push({
      t: 'text',
      x: W - 16,
      y: top,
      lh,
      text: S.screen.dmRequests,
      font: ui(14 * fs, 600),
      color: pal.sec,
      align: 'right',
    });
    y = top + lh + 8;
  }
  /* 對話（每列上下 8、左右 16；大頭貼 56） */
  const rowsTop = y;
  const rows: Op[] = [];
  const nlh = 14 * fs * 1.3;
  const plh = 13 * fs * 1.3;
  const rowH = Math.max(56, nlh + plh) + 16;
  for (const t of state.dm.threads) {
    const cy = y + rowH / 2;
    const ay = cy - 28;
    rows.push(...avatar(t.avatar, 16 + 28, cy, 56, pal));
    if (t.online) rows.push(...onlineDot(env, 16, ay, 56));
    const rightW = t.unread ? 8 : 24;
    if (t.unread) rows.push({ t: 'circle', cx: W - 16 - 4, cy, r: 4, fill: pal.accent });
    else
      rows.push({
        t: 'icon',
        name: 'camera',
        x: W - 16 - 24,
        y: cy - 12,
        size: 24,
        color: pal.sec,
      });
    const tx = 16 + 56 + 12;
    const tw = Math.max(20, W - 16 - rightW - 12 - tx);
    const weight = t.unread ? 700 : 400;
    const nf = ui(14 * fs, weight);
    const pf = ui(13 * fs, weight);
    const top = cy - (nlh + plh) / 2;
    const badgeW = t.verified ? 16 : 0;
    const title = ellipsize(threadTitle(t), tw - badgeW, nf, measure);
    const nameRuns: Run[] = [{ text: title, font: nf, color: pal.ink }];
    if (t.verified) nameRuns.push(badgeRun(nf, 12));
    rows.push(...linesToOps(layoutLines(nameRuns, 10_000, measure).slice(0, 1), tx, top, nlh, pal));
    const time = t.time ? `${S.screen.dmTimeSep}${t.time}` : '';
    const timeW = time ? measure(time, pf) : 0;
    const prev = ellipsize(
      threadPreview(t).replace(/\n/g, ' '),
      Math.max(10, tw - timeW),
      pf,
      measure,
    );
    const pc = t.unread ? pal.ink : pal.sec;
    rows.push({ t: 'text', x: tx, y: top + nlh, lh: plh, text: prev, font: pf, color: pc });
    if (time)
      rows.push({
        t: 'text',
        x: tx + measure(prev, pf),
        y: top + nlh,
        lh: plh,
        text: time,
        font: pf,
        color: pc,
      });
    hits.push({
      key: `thread:${t.id}`,
      label: S.hits.thread(threadTitle(t)),
      box: { x: 0, y, width: W, height: rowH },
    });
    y += rowH;
  }
  const phone = !opts.viewer;
  const height = phone ? PHONE_H : y;
  ops.push({
    t: 'group',
    clip: { x: 0, y: rowsTop, width: W, height: Math.max(0, height - rowsTop) },
    ops: rows,
  });
  parts.rows = { x: 0, y: rowsTop, width: W, height: Math.max(0, height - rowsTop) };
  return {
    width: W,
    height,
    background: pal.bg,
    ops,
    hits: hits.filter((h) => h.box.y < height),
    parts,
  };
}

/* ---------- 對話 ---------- */

/** 對話的上方列（高 56、下邊線）：‹、大頭貼 34（綠點）、名稱＋徽章、動態；右邊電話、視訊 */
function chatHead(env: Env, t: Thread, y: number): { ops: Op[]; hits: Hit[] } {
  const { pal, fs, measure } = env;
  const ops: Op[] = [];
  /* 下邊線 0.5 算在 56 裡（原作 border-box），內容在上面 55.5 的中央 */
  const cy = y + (CHAT_TOP_H - 0.5) / 2;
  ops.push({ t: 'rect', x: 0, y, w: W, h: CHAT_TOP_H, fill: pal.bg });
  ops.push({ t: 'rect', x: 0, y: y + CHAT_TOP_H - 0.5, w: W, h: 0.5, fill: pal.line });
  ops.push({ t: 'icon', name: 'back', x: 10, y: cy - 13, size: 26, color: pal.ink, sw: 2.2 });
  ops.push(...avatar(t.avatar, 46 + 17, cy, 34, pal));
  if (t.online) ops.push(...onlineDot(env, 46, cy - 17, 34));
  const videoX = W - 16 - 26;
  const phoneX = videoX - 14 - 10 - 24;
  ops.push({ t: 'icon', name: 'video', x: videoX, y: cy - 13, size: 26, color: pal.ink });
  ops.push({ t: 'icon', name: 'phone', x: phoneX, y: cy - 12, size: 24, color: pal.ink });
  const tx = 90;
  const tw = Math.max(20, phoneX - 14 - 10 - tx);
  const nf = ui(16 * fs, 700);
  const nlh = 16 * fs * 1.25;
  const af = ui(12 * fs);
  const alh = 12 * fs * 1.25;
  const h = nlh + (t.active ? alh : 0);
  const top = cy - h / 2;
  const name = ellipsize(threadTitle(t), tw - (t.verified ? 16 : 0), nf, measure);
  const runs: Run[] = [{ text: name, font: nf, color: pal.ink }];
  if (t.verified) runs.push(badgeRun(nf, 12));
  ops.push(...linesToOps(layoutLines(runs, 10_000, measure).slice(0, 1), tx, top, nlh, pal));
  if (t.active)
    ops.push({
      t: 'text',
      x: tx,
      y: top + nlh,
      lh: alh,
      text: ellipsize(t.active, tw, af, measure),
      font: af,
      color: pal.sec,
    });
  return {
    ops,
    hits: [
      { key: 'dm:back', label: S.viewer.back, box: { x: 4, y, width: 38, height: CHAT_TOP_H } },
    ],
  };
}

/** 下方的輸入列（上 8、下 28、左右 12；高 46、圓角 23） */
function chatFoot(env: Env, y: number): Op[] {
  const { pal, fs, measure } = env;
  const ops: Op[] = [{ t: 'rect', x: 0, y, w: W, h: CHAT_FOOT_H, fill: pal.bg }];
  const top = y + 8;
  const cy = top + 23;
  ops.push({ t: 'rect', x: 12, y: top, w: W - 24, h: 46, r: 23, fill: pal.btn });
  ops.push({ t: 'circle', cx: 18 + 17, cy, r: 17, fill: pal.accent });
  ops.push({ t: 'icon', name: 'camera', x: 35 - 10, y: cy - 10, size: 20, color: '#ffffff' });
  let ix = W - 12 - 14 - 22;
  const icons = ['sticker', 'gallery', 'mic'] as const;
  for (const name of icons) {
    ops.push({ t: 'icon', name, x: ix, y: cy - 11, size: 22, color: pal.ink });
    ix -= 12 + 22;
  }
  const pf = ui(15 * fs);
  const lh = 15 * fs * INHERIT_LH;
  const px = 18 + 34 + 12;
  ops.push({
    t: 'text',
    x: px,
    y: cy - lh / 2,
    lh,
    text: ellipsize(S.screen.dmInput, ix + 22 - 12 - px, pf, measure),
    font: pf,
    color: pal.sec,
  });
  return ops;
}

/** 泡泡裡的文字：#、@ 加底線（同原作，顏色不變） */
function bubbleText(lines: Line[], x: number, y: number, lh: number, size: number): Op[] {
  const ops: Op[] = [];
  lines.forEach((line, i) => {
    const top = y + i * lh;
    for (const r of line.runs) {
      if (!r.text.trim()) continue;
      ops.push({ t: 'text', x: x + r.x, y: top, lh, text: r.text, font: r.font, color: r.color });
      if (r.underline)
        ops.push({
          t: 'rect',
          x: x + r.x,
          y: top + lh / 2 + size * 0.5,
          w: r.width,
          h: Math.max(1, size / 15),
          fill: r.color,
        });
    }
  });
  return ops;
}

/** 對話的訊息（從 0 開始，左右 12、上 8、下 6）；回傳指令與高 */
export function layoutChatBody(env: Env, t: Thread): { ops: Op[]; height: number } {
  const { pal, fs, measure, state } = env;
  const ops: Op[] = [];
  let y = 8;
  /* 個人檔案介紹（上 16、下 26） */
  if (t.intro) {
    y += 16;
    ops.push(...avatar(t.avatar, W / 2, y + 46, 92, pal));
    y += 92 + 8 + 3;
    const nf = ui(18 * fs, 700);
    const nlh = 18 * fs * INHERIT_LH;
    const title = ellipsize(threadTitle(t), W - 60, nf, measure);
    const runs: Run[] = [{ text: title, font: nf, color: pal.ink }];
    if (t.verified) runs.push(badgeRun(nf, 14));
    const line = layoutLines(runs, 10_000, measure).slice(0, 1);
    ops.push(...linesToOps(line, W / 2 - (line[0]?.width ?? 0) / 2, y, nlh, pal));
    y += nlh + 3;
    const sf = ui(13 * fs);
    const slh = 13 * fs * INHERIT_LH;
    const logo = state.feed.logo.trim();
    ops.push({
      t: 'text',
      x: W / 2,
      y,
      lh: slh,
      text: ellipsize(
        logo ? `${t.username}${S.screen.dmIntroSep}${logo}` : t.username,
        W - 60,
        sf,
        measure,
      ),
      font: sf,
      color: pal.sec,
      align: 'center',
    });
    y += slh + 3 + 12;
    const bf = ui(13 * fs, 600);
    const bw = measure(S.screen.dmProfile, bf) + 28;
    const bh = slh + 14;
    ops.push({ t: 'rect', x: W / 2 - bw / 2, y, w: bw, h: bh, r: 8, fill: pal.btn });
    ops.push({
      t: 'text',
      x: W / 2,
      y: y + 7,
      lh: slh,
      text: S.screen.dmProfile,
      font: bf,
      color: pal.ink,
      align: 'center',
    });
    y += bh + 26;
  }
  /* 訊息 */
  const msgs = t.messages;
  const mine = msgs.filter((m) => m.from === 'me').length;
  let k = 0;
  const maxW = (W - 24) * 0.72;
  const size = 15 * fs;
  const font: FontSpec = ui(size);
  const lh = size * 1.32;
  msgs.forEach((m, j) => {
    if (m.from === 'time') {
      const tf = ui(12 * fs, 600);
      const tlh = 12 * fs * INHERIT_LH;
      y += 14;
      ops.push({
        t: 'text',
        x: W / 2,
        y,
        lh: tlh,
        text: ellipsize(m.text, W - 24, tf, measure),
        font: tf,
        color: pal.sec,
        align: 'center',
      });
      y += tlh + 8;
      return;
    }
    const prev = msgs[j - 1];
    const next = msgs[j + 1];
    const first = !prev || prev.from !== m.from;
    const last = !next || next.from !== m.from;
    y += first ? 8 : 2;
    const me = m.from === 'me';
    const fill = me ? mixHex(state.dm.c1, state.dm.c2, mine > 1 ? k++ / (mine - 1) : 1) : pal.btn;
    const ink = me ? contrastText(fill) : pal.ink;
    /* 內容：照片（寬 210、最高 300）＋文字的泡泡（上下 9、左右 13），間隔 2 */
    const items: {
      w: number;
      h: number;
      stretch?: boolean;
      draw: (x: number, y: number, w: number) => Op[];
    }[] = [];
    if (m.image) {
      const img = m.image;
      const nat = imageSize(img);
      const w = Math.min(210, maxW);
      const h = Math.min(300, (w * nat.height) / nat.width);
      items.push({
        w,
        h,
        draw: (x, top) => [{ t: 'image', img, x, y: top, w, h, r: 18, fallback: pal.ph }],
      });
    }
    if (m.text || !m.image) {
      const runs: Run[] = linkTokens(m.text || ' ').map((tk) => ({
        text: tk.text,
        font,
        color: ink,
        underline: tk.link,
      }));
      const lines = layoutLines(runs, maxW - 26, measure);
      /* 換行的泡泡撐滿 72%（原作 max-width:72% ＋ flex，F137） */
      const w = lines.length > 1 ? maxW : Math.max(...lines.map((l) => l.width), 0) + 26;
      const h = lines.length * lh + 18;
      const r22 = 22;
      const radius: Radius = me
        ? [r22, first ? r22 : 6, last ? r22 : 6, r22]
        : [first ? r22 : 6, r22, r22, last ? r22 : 6];
      items.push({
        w,
        h,
        stretch: true,
        draw: (x, top, bw) => [
          { t: 'rect', x, y: top, w: bw, h, r: radius, fill },
          ...bubbleText(lines, x + 13, top + 9, lh, size),
        ],
      });
    }
    const cw = Math.max(...items.map((it) => it.w));
    const ch = items.reduce((s, it) => s + it.h, 0) + (items.length - 1) * 2;
    const left = me ? W - 12 - cw : 12 + 28 + 8;
    /* 對方的泡泡撐到內容的寬（原作 align-items 預設 stretch：照片比字寬時泡泡和照片一樣寬）；我的靠右、照字寬 */
    if (!me) for (const it of items) if (it.stretch) it.w = cw;
    let iy = y;
    for (const it of items) {
      ops.push(...it.draw(me ? W - 12 - it.w : left, iy, it.w));
      iy += it.h + 2;
    }
    if (!me && last) ops.push(...avatar(t.avatar, 12 + 14, y + ch - 14, 28, pal));
    if (m.react) {
      const rf = ui(13);
      const rw = measure(m.react, rf) + 10;
      const rh = 19;
      const rx = me ? W - 12 - 8 - rw : left + 8;
      const ry = y + ch + 16 - rh;
      ops.push({ t: 'rect', x: rx - 3, y: ry - 3, w: rw + 6, h: rh + 6, r: 15, fill: pal.btn });
      ops.push({ t: 'rect', x: rx - 2, y: ry - 2, w: rw + 4, h: rh + 4, r: 14, fill: pal.bg });
      ops.push({
        t: 'text',
        x: rx + rw / 2,
        y: ry + 3,
        lh: 13,
        text: m.react,
        font: rf,
        color: pal.ink,
        align: 'center',
      });
    }
    y += ch + (m.react ? 14 : 0);
  });
  /* 已讀（我的最後一則訊息下面，靠右） */
  const lastReal = [...msgs].reverse().find((m) => m.from !== 'time');
  if (lastReal?.from === 'me' && t.seen) {
    const sf = ui(12 * fs);
    const slh = 12 * fs * INHERIT_LH;
    y += 4;
    ops.push({
      t: 'text',
      x: W - 12 - 4,
      y,
      lh: slh,
      text: ellipsize(t.seen, W - 32, sf, measure),
      font: sf,
      color: pal.sec,
      align: 'right',
    });
    y += slh;
  }
  y += 6;
  return { ops, height: y };
}

/** 對話的三段（HTML 用）：上方（狀態列＋上方列）、訊息（依內容）、下方 */
export function chatPieces(
  env: Env,
  t: Thread,
): { head: ScreenLayout; body: ScreenLayout; foot: ScreenLayout } {
  const { pal } = env;
  const statusH = env.state.screen.status ? STATUS_H : 0;
  const head = chatHead(env, t, statusH);
  const headOps = [...(statusH ? statusBar(env, 0, pal.ink) : []), ...head.ops];
  const body = layoutChatBody(env, t);
  const base = { width: W, background: pal.bg, parts: {} };
  return {
    head: { ...base, height: statusH + CHAT_TOP_H, ops: headOps, hits: head.hits },
    body: { ...base, height: body.height, ops: body.ops, hits: [] },
    foot: { ...base, height: CHAT_FOOT_H, ops: chatFoot(env, 0), hits: [] },
  };
}

/** 對話（390 × 844）：訊息少時從上面排，放不下時最新的貼在下面、舊的從上面裁掉（原作 781628e） */
export function dmChatScreen(env: Env, t: Thread): ScreenLayout {
  const { pal } = env;
  const ops: Op[] = [];
  const parts: Record<string, Rect> = {};
  let y = 0;
  if (env.state.screen.status) {
    ops.push(...statusBar(env, 0, pal.ink));
    y = STATUS_H;
  }
  parts.status = { x: 0, y: 0, width: W, height: y };
  const head = chatHead(env, t, y);
  ops.push(...head.ops);
  parts.top = { x: 0, y, width: W, height: CHAT_TOP_H };
  const bodyTop = y + CHAT_TOP_H;
  const footTop = PHONE_H - CHAT_FOOT_H;
  const area = Math.max(0, footTop - bodyTop);
  const body = layoutChatBody(env, t);
  const offset = body.height > area ? bodyTop + area - body.height : bodyTop;
  ops.push({
    t: 'group',
    clip: { x: 0, y: bodyTop, width: W, height: area },
    ops: [{ t: 'group', ty: offset, ops: body.ops }],
  });
  parts.body = { x: 0, y: bodyTop, width: W, height: area };
  parts.content = { x: 0, y: offset, width: W, height: body.height };
  ops.push(...chatFoot(env, footTop));
  parts.foot = { x: 0, y: footTop, width: W, height: CHAT_FOOT_H };
  return { width: W, height: PHONE_H, background: pal.bg, ops, hits: head.hits, parts };
}
