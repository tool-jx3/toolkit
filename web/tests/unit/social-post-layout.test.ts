/**
 * 社群貼文產生器的版面（規格 3.1、3.4～3.7）：各畫面的大小、區塊的位置、可以點的地方、編輯用的東西不進輸出。
 * 量字用假的（中日韓一個字＝字級、其他半個字級），只驗證版面規則。
 */
import { describe, expect, it } from 'vitest';
import {
  addPost,
  addSticker,
  addStory,
  blankStory,
  initialState,
  type SocialState,
  setCellImage,
} from '../../src/tools/social-post/model';
import { commentsScreen } from '../../src/tools/social-post/render/comments';
import type { Env } from '../../src/tools/social-post/render/common';
import { feedScreen, layoutTray } from '../../src/tools/social-post/render/feed';
import type { Op } from '../../src/tools/social-post/render/ops';
import { postScreen } from '../../src/tools/social-post/render/post';
import { GRID_CELL, profileScreen } from '../../src/tools/social-post/render/profile';
import {
  cellRects,
  chipText,
  gradient160,
  layoutSticker,
  storyScreen,
} from '../../src/tools/social-post/render/story';
import { PALETTES } from '../../src/tools/social-post/render/theme';
import type { Measure } from '../../src/tools/social-post/text';

const measure: Measure = (text, font) =>
  Array.from(text).reduce(
    (w, ch) => w + (/[⺀-￿]|\p{Extended_Pictographic}/u.test(ch) ? 1 : 0.5) * font.size,
    0,
  );

function env(patch: (s: SocialState) => void = () => {}, edit = false): Env {
  const state = structuredClone(initialState());
  patch(state);
  return { measure, pal: PALETTES[state.theme], fs: state.screen.fontScale, state, edit };
}

const texts = (ops: Op[]): string[] =>
  ops.flatMap((o) => (o.t === 'text' ? [o.text] : o.t === 'group' ? texts(o.ops) : []));
const icons = (ops: Op[]): string[] =>
  ops.flatMap((o) => (o.t === 'icon' ? [o.name] : o.t === 'group' ? icons(o.ops) : []));

describe('貼文（3.4）', () => {
  it('狀態列 54＋帳號列 56＋照片 390÷比例＋圓點列 18（新式、兩張以上）＋按鈕列 46＋內文', () => {
    const e = env();
    const post = e.state.posts[0];
    const l = postScreen(e, post);
    expect(l.width).toBe(390);
    expect(l.parts.status.height).toBe(54);
    expect(l.parts.header).toEqual({ x: 0, y: 54, width: 390, height: 56 });
    expect(l.parts.media).toEqual({ x: 0, y: 110, width: 390, height: 487.5 });
    expect(l.parts.actions.y).toBe(110 + 487.5 + 18);
    expect(l.parts.body.y).toBe(l.parts.actions.y + 46);
    expect(l.height).toBe(l.parts.body.y + l.parts.body.height);
    /* 內文：內文行 × 18 ＋ 5 ＋ 時間 18 ＋ 下 14 */
    expect((l.parts.body.height - 14 - 5 - 18) % 18).toBe(0);
  });

  it('狀態列關掉時從 0 開始；比例 1.91:1 的照片高 390÷1.91', () => {
    const e = env((s) => {
      s.screen.status = false;
      s.posts[0].ratio = '1.91:1';
    });
    const l = postScreen(e, e.state.posts[0]);
    expect(l.parts.header.y).toBe(0);
    expect(l.parts.media.height).toBeCloseTo(390 / 1.91);
  });

  it('舊式：沒有圓點列、圓點在按鈕列中央；「N 個讚」與「查看全部 N 則留言」', () => {
    const e = env((s) => {
      s.posts[0].countStyle = 'classic';
    });
    const l = postScreen(e, e.state.posts[0]);
    expect(l.parts.actions.y).toBe(110 + 487.5);
    const t = texts(l.ops);
    expect(t).toContain('1,284 個讚');
    expect(t).toContain('查看全部 36 則留言');
    /* 數字不在圖示旁 */
    expect(t).not.toContain('1,284');
  });

  it('新式：數字在圖示旁；關閉留言時沒有留言圖示與數字、也不能打開留言', () => {
    const e = env((s) => {
      s.posts[0].commentsOff = true;
    });
    const l = postScreen(e, e.state.posts[0]);
    expect(texts(l.ops)).toContain('1,284');
    expect(texts(l.ops)).not.toContain('36');
    expect(icons(l.ops)).not.toContain('comment');
    expect(l.hits.some((h) => h.key === 'open-comments')).toBe(false);
  });

  it('輪播膠囊「目前／總數」、轉發與分享圖示可以關掉', () => {
    const e = env((s) => {
      s.posts[0].current = 1;
      s.posts[0].showRepost = false;
      s.posts[0].showShare = false;
    });
    const l = postScreen(e, e.state.posts[0]);
    expect(texts(l.ops)).toContain('2/3');
    expect(icons(l.ops)).not.toContain('repost');
    expect(icons(l.ops)).not.toContain('send');
  });

  it('沒有照片：預覽與 PNG 畫相機＋「加入照片」，HTML 只有灰底', () => {
    const e = env((s) => {
      s.posts[0].photos = [];
    });
    expect(texts(postScreen(e, e.state.posts[0]).ops)).toContain('加入照片');
    expect(texts(postScreen(e, e.state.posts[0], { viewer: true }).ops)).not.toContain('加入照片');
  });

  it('「更多」折疊、按讚的人、共同貼文、追蹤按鈕、地點', () => {
    const e = env((s) => {
      Object.assign(s.posts[0], {
        collapse: true,
        likedBy: 'kai.archive',
        collab: 'kai.archive',
        follow: true,
      });
    });
    const t = texts(postScreen(e, e.state.posts[0]).ops);
    expect(t).toContain('… 更多');
    expect(t).toContain('都說讚');
    expect(t).toContain(' 和 kai.archive');
    expect(t).toContain('追蹤');
    expect(t).toContain('霧港鎮・燈塔步道');
  });

  it('共同貼文的帳號很長時兩邊都省略，帳號至少留一半的寬度', () => {
    const e = env((s) => {
      s.posts[0].collab = 'a'.repeat(60);
      s.posts[0].follow = true;
    });
    /* 帳號列（y 54～110）裡的字 */
    const t = postScreen(e, e.state.posts[0]).ops.flatMap((o) =>
      o.t === 'text' && o.y >= 54 && o.y < 110 ? [o.text] : [],
    );
    expect(t).toContain('xiaoyu.lin');
    expect(t.some((x) => x.startsWith(' 和 a') && x.endsWith('…'))).toBe(true);
  });

  it('字級倍率放大內文的行高', () => {
    const a = postScreen(env(), initialState().posts[0]);
    const e = env((s) => {
      s.screen.fontScale = 1.4;
    });
    const b = postScreen(e, e.state.posts[0]);
    expect(b.parts.body.height).toBeGreaterThan(a.parts.body.height);
    expect(b.parts.header.height).toBe(56);
  });
});

describe('留言（3.5）', () => {
  it('疊在貼文上：390 × 844；一半＝上緣 844 × 34%、全部＝54', () => {
    const e = env();
    const l = commentsScreen(e, e.state.posts[0]);
    expect([l.width, l.height]).toEqual([390, 844]);
    expect(l.parts.sheet.y).toBeCloseTo(844 * 0.34);
    const f = env((s) => {
      s.posts[0].sheet.height = 'full';
    });
    expect(commentsScreen(f, f.state.posts[0]).parts.sheet.y).toBe(54);
  });

  it('下方固定在底：線＋表情＋輸入列＝121（字級 100%）', () => {
    const e = env();
    const l = commentsScreen(e, e.state.posts[0]);
    expect(l.parts.foot).toEqual({ x: 0, y: 844 - 121, width: 390, height: 121 });
    expect(texts(l.ops)).toContain('留言給 xiaoyu.lin…');
  });

  it('只有面板：高度依內容、沒有狀態列；留言多一則就變高', () => {
    const e = env((s) => {
      s.posts[0].sheet.backdrop = false;
    });
    const a = commentsScreen(e, e.state.posts[0]);
    expect(a.parts.status).toBeUndefined();
    expect(a.height).toBe(a.parts.head.height + a.parts.list.height + 121);
    e.state.posts[0].sheet.items.push({ ...e.state.posts[0].sheet.items[0], id: 'cx' });
    expect(commentsScreen(e, e.state.posts[0]).height).toBeGreaterThan(a.height);
  });

  it('留言的字：作者、置頂、回覆、查看另外 N 則回覆', () => {
    const e = env((s) => {
      s.posts[0].sheet.items[0].pinned = true;
    });
    const t = texts(commentsScreen(e, e.state.posts[0]).ops);
    expect(t).toEqual(
      expect.arrayContaining(['已置頂', '· 作者', '回覆', '查看另外 2 則回覆', 'kai.archive']),
    );
  });

  it('關閉留言：兩行說明、沒有下方的輸入列', () => {
    const e = env((s) => {
      s.posts[0].commentsOff = true;
    });
    const l = commentsScreen(e, e.state.posts[0]);
    expect(texts(l.ops)).toEqual(
      expect.arrayContaining(['留言功能已關閉。', '這則貼文無法留言。']),
    );
    expect(l.parts.foot).toBeUndefined();
  });
});

describe('個人頁（3.6）', () => {
  it('底部分頁列開著：844，格狀裁到分頁列上面；關掉：依內容', () => {
    const e = env();
    const l = profileScreen(e);
    expect(l.height).toBe(844);
    expect(l.parts.nav).toEqual({ x: 0, y: 760, width: 390, height: 84 });
    expect(l.parts.grid.y + l.parts.grid.height).toBe(760);
    const off = env((s) => {
      s.account.nav = false;
    });
    const m = profileScreen(off);
    /* 2 則貼文＋4 張其他照片＝6 格＝2 列 */
    expect(m.height).toBeCloseTo(m.parts.grid.y + GRID_CELL * 2 + 2);
    expect(m.parts.nav).toBeUndefined();
  });

  it('HTML：依內容加高、底部分頁列接在最後', () => {
    const e = env();
    const l = profileScreen(e, { viewer: true });
    expect(l.parts.nav.y).toBeCloseTo(l.parts.grid.y + GRID_CELL * 2 + 2);
    expect(l.height).toBeCloseTo(l.parts.nav.y + 84);
  });

  it('貼文縮圖、有連結的精選動態可以點', () => {
    const e = env();
    const keys = profileScreen(e).hits.map((h) => h.key);
    expect(keys).toEqual(expect.arrayContaining(['post:p1', 'post:p2', 'story:s1']));
    expect(keys.filter((k) => k.startsWith('story:'))).toHaveLength(1);
  });

  it('自己的帳號：編輯／分享個人檔案、新增；別人的：追蹤、訊息', () => {
    expect(texts(profileScreen(env()).ops)).toEqual(
      expect.arrayContaining(['編輯個人檔案', '分享個人檔案', '新增']),
    );
    const other = env((s) => {
      s.account.own = false;
    });
    const t = texts(profileScreen(other).ops);
    expect(t).toEqual(expect.arrayContaining(['追蹤', '訊息']));
    expect(t).not.toContain('新增');
  });

  it('沒有任何照片時補空格到空格數', () => {
    const e = env((s) => {
      for (const p of s.posts) p.photos = [];
      s.account.grid = [];
      s.account.placeholders = 9;
      s.account.nav = false;
    });
    const l = profileScreen(e);
    expect(l.parts.grid.height).toBeCloseTo(GRID_CELL * 3 + 4);
  });
});

describe('限時動態（3.7）', () => {
  it('360 × 640、黑底；4 格的格子位置（間距 0.5 cqw）', () => {
    const e = env();
    const st = e.state.stories[0];
    const l = storyScreen(e, st);
    expect([l.width, l.height, l.background]).toEqual([360, 640, '#000000']);
    const r = cellRects(st);
    expect(r).toHaveLength(4);
    expect(r[1].x).toBeCloseTo(r[0].width + 1.8);
    expect(r[0].width).toBeCloseTo((360 - 1.8) / 2);
  });

  it('空格子的提示與選取框只在編輯時', () => {
    const e = env((s) => {
      s.stories[0] = blankStory('s1');
    }, true);
    const st = e.state.stories[0];
    expect(texts(storyScreen(e, st, { selectedCell: 0 }).ops)).toContain('加入照片');
    const out = { ...e, edit: false };
    expect(texts(storyScreen(out, st, { selectedCell: 0 }).ops)).not.toContain('加入照片');
  });

  it('進度條：目前那段之前滿、之後空；HTML 自動播放時不畫（檢視程式依接著看的則數畫，F126）', () => {
    const e = env((s) => {
      Object.assign(s.stories[0], { count: 4, current: 3, progress: 50 });
    });
    const l = storyScreen(e, e.state.stories[0]);
    const segW = (360 - 2 * 7.92 - 3 * 3.6) / 4;
    const tracks = l.ops.filter(
      (o) => o.t === 'rect' && o.fill === 'rgba(255,255,255,0.35)' && o.h < 3,
    );
    expect(tracks).toHaveLength(4);
    expect(tracks[0].t === 'rect' && tracks[0].w).toBeCloseTo(segW);
    const fills = l.ops.filter((o) => o.t === 'rect' && o.fill === '#ffffff' && o.h < 3);
    expect(fills).toHaveLength(3);
    const b = l.parts.bars;
    expect([b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100)).toEqual([
      7.92, 48.6, 344.16, 2.34,
    ]);
    const v = storyScreen(e, e.state.stories[0], { viewer: { autoplay: true, closable: true } });
    expect(v.ops.filter((o) => o.t === 'rect' && o.h < 3 && o.y === 13.5 * 3.6)).toHaveLength(0);
    expect(v.parts.bars).toEqual(l.parts.bars);
  });

  it('下方介面：傳送訊息／動態／無', () => {
    const e = env();
    expect(texts(storyScreen(e, e.state.stories[0]).ops)).toContain('傳送訊息');
    e.state.stories[0].bottom = 'own';
    expect(texts(storyScreen(e, e.state.stories[0]).ops)).toEqual(
      expect.arrayContaining(['動態', '精選', '傳送', '更多']),
    );
    e.state.stories[0].bottom = 'none';
    expect(texts(storyScreen(e, e.state.stories[0]).ops)).not.toContain('傳送訊息');
  });

  it('漸層 160°：起點在左上偏上、終點在右下偏下', () => {
    const g = gradient160({ x: 0, y: 0, width: 360, height: 640 }, [
      [0, '#000'],
      [1, '#fff'],
    ]);
    expect(g.linear.x0).toBeLessThan(180);
    expect(g.linear.y0).toBeLessThan(0);
    expect(g.linear.x1).toBeGreaterThan(180);
    expect(g.linear.y1).toBeGreaterThan(640);
  });

  it('貼紙：標籤類的字（@、#、大寫）、文字貼紙最寬 90 cqw', () => {
    const st = blankStory('s1');
    const e = env();
    const id = addSticker(st, 'hashtag') as string;
    const k = st.stickers.find((x) => x.id === id);
    if (k?.type !== 'hashtag') throw new Error('type');
    k.text = '#trpg';
    expect(chipText(k)).toBe('#TRPG');
    const tid = addSticker(st, 'text') as string;
    const t = st.stickers.find((x) => x.id === tid);
    if (t?.type !== 'text') throw new Error('type');
    t.text = '很長很長的一段文字'.repeat(6);
    const l = layoutSticker(e, t);
    expect(l.w).toBeLessThanOrEqual(324 + 1e-6);
    expect(l.h).toBeGreaterThan(7.2 * 3.6 * 1.38);
  });

  it('照片貼紙最大 60 cqw、保持比例', () => {
    const st = blankStory('s1');
    setCellImage(st, 0, { kind: 'asset', id: 'a', name: '', width: 10, height: 10 });
    const id = addSticker(st, 'image', {
      image: { kind: 'asset', id: 'b', name: '', width: 1200, height: 600 },
    }) as string;
    const k = st.stickers.find((x) => x.id === id);
    if (!k) throw new Error('missing');
    const l = layoutSticker(env(), k);
    expect(l.w).toBeCloseTo(216);
    expect(l.h).toBeCloseTo(108);
  });
});

/* ---------- 對等驗證後的修正（規格 7.1） ---------- */

const rects = (ops: Op[]): Extract<Op, { t: 'rect' }>[] =>
  ops.flatMap((o) => (o.t === 'rect' ? [o] : o.t === 'group' ? rects(o.ops) : [])) as Extract<
    Op,
    { t: 'rect' }
  >[];
const avatars = (ops: Op[]): Extract<Op, { t: 'avatar' }>[] =>
  ops.flatMap((o) => (o.t === 'avatar' ? [o] : o.t === 'group' ? avatars(o.ops) : [])) as Extract<
    Op,
    { t: 'avatar' }
  >[];
const iconOps = (ops: Op[]): Extract<Op, { t: 'icon' }>[] =>
  ops.flatMap((o) => (o.t === 'icon' ? [o] : o.t === 'group' ? iconOps(o.ops) : [])) as Extract<
    Op,
    { t: 'icon' }
  >[];

describe('沒有寫行高的地方照原作繼承 1.6（3.10(5)；F35、F42、F43、F45、F46、F69）', () => {
  it('輪播膠囊：12 × 1.6 ＋ 上下 3 ＝ 25.2（字級 140% 時 32.88）', () => {
    const e = env();
    const pill = (x: Env) =>
      rects(postScreen(x, x.state.posts[0]).ops).find((o) => o.fill === 'rgba(18,18,18,0.7)');
    expect(pill(e)?.h).toBeCloseTo(25.2);
    const big = env((s) => {
      s.screen.fontScale = 1.4;
    });
    expect(pill(big)?.h).toBeCloseTo(12 * 1.4 * 1.6 + 6);
  });

  it('留言面板：把手＋標題＝12＋14＋16 × 1.6＋12＝63.6；「回覆」與「查看另外」列 12 × 1.6', () => {
    const e = env((s) => {
      s.posts[0].sheet.backdrop = false;
      for (const c of s.posts[0].sheet.items) c.text = 'a';
    });
    const l = commentsScreen(e, e.state.posts[0]);
    expect(l.parts.head.height).toBeCloseTo(63.6);
    /* 每則：10 ＋ 第一行 16 ＋ 2 ＋ 內容 18 ＋ 6 ＋ 回覆 19.2 ＋ 10＝81.2；第 3 則另有「查看另外」12 ＋ 19.2 */
    expect(l.parts.list.height).toBeCloseTo(4 + 81.2 * 3 + 12 + 19.2 + 8);
    expect(l.height).toBeCloseTo(63.6 + 4 + 81.2 * 3 + 31.2 + 8 + 121);
  });

  it('留言右邊的讚：數字的行 12 × 1.6；只有讚數沒有內容時一則的高也包含右邊那一欄', () => {
    const e = env((s) => {
      s.screen.fontScale = 0.8;
      s.posts[0].sheet.backdrop = false;
      s.posts[0].sheet.items = [{ ...s.posts[0].sheet.items[0], text: '', likes: '24', more: 0 }];
    });
    const l = commentsScreen(e, e.state.posts[0]);
    /* 左邊：16 × 0.8 ＋ 6 ＋ 12 × 0.8 × 1.6＝34.16；右邊：6 ＋ 14 ＋ 2 ＋ 12 × 0.8 × 1.6＝37.36 */
    expect(l.parts.list.height).toBeCloseTo(4 + 10 + 37.36 + 10 + 8);
  });

  it('字級 80%：「回覆」列只有作者按讚時才至少 16（小頭像）；「查看另外」列 12 × 0.8 × 1.6', () => {
    const one = (patch: Partial<SocialState['posts'][0]['sheet']['items'][0]>) => {
      const e = env((s) => {
        s.screen.fontScale = 0.8;
        s.posts[0].sheet.backdrop = false;
        s.posts[0].sheet.items = [
          { ...s.posts[0].sheet.items[0], text: 'a', likes: '', more: 2, ...patch },
        ];
      });
      return commentsScreen(e, e.state.posts[0]).parts.list.height - 12;
    };
    const lh = 12 * 0.8 * 1.6;
    expect(one({ authorLiked: false })).toBeCloseTo(10 + 12.8 + 2 + 14.4 + 6 + lh + 12 + lh + 10);
    expect(one({ authorLiked: true })).toBeCloseTo(10 + 12.8 + 2 + 14.4 + 6 + 16 + 12 + lh + 10);
  });

  it('留言功能已關閉：兩行 16 × 1.6、14 × 1.6；只有面板時 63.6 ＋ 220', () => {
    const e = env((s) => {
      s.posts[0].commentsOff = true;
      s.posts[0].sheet.backdrop = false;
    });
    expect(commentsScreen(e, e.state.posts[0]).height).toBeCloseTo(283.6);
  });

  it('個人頁：名稱的行 15 × 1.6（字級 140% 時大頭貼那一列跟著變高）；精選動態的標題 12 × 1.6', () => {
    const e = env((s) => {
      s.screen.fontScale = 1.4;
    });
    const l = profileScreen(e);
    const right = 15 * 1.4 * 1.6 + 6 + (17 + 14) * 1.4 * 1.2;
    expect(l.parts.row.height).toBeCloseTo(10 + right);
    const hl = profileScreen(env()).hits.find((h) => h.key.startsWith('story:'));
    expect(hl?.box.height).toBeCloseTo(64 + 6 + 12 * 1.6);
  });

  it('限時動態的動態列：圖示下的字 2.9 cqw × 1.6；整列下緣在 3 cqw', () => {
    const e = env((s) => {
      s.stories[0].bottom = 'own';
    });
    const l = storyScreen(e, e.state.stories[0]);
    const U = 3.6;
    const itemH = 6.4 * U + 0.8 * U + 2.9 * U * 1.6;
    const icon = iconOps(l.ops).find((o) => o.name === 'more' && o.y > 500);
    expect(icon?.y).toBeCloseTo(640 - 3 * U - itemH);
  });

  it('提問貼紙的輸入框：3.8 cqw × 1.6 ＋ 上下 3.2 cqw（一行的問題時卡片高 121.4）', () => {
    const st = blankStory('s1');
    const id = addSticker(st, 'question') as string;
    const k = st.stickers.find((x) => x.id === id);
    if (!k) throw new Error('missing');
    const U = 3.6;
    const l = layoutSticker(env(), k);
    expect(l.h).toBeCloseTo(8 * U + 4.8 * U * 1.3 + 3 * U + (3.8 * U * 1.6 + 6.4 * U) + 4 * U);
  });
});

describe('限時動態不跟著深淺色（F12）', () => {
  it('沒有大頭貼時：帳號列、動態列的小頭像、提問貼紙的預設人像底色在深色時也一樣', () => {
    const make = (theme: 'light' | 'dark') => {
      const state = structuredClone(initialState());
      state.theme = theme;
      state.profile.avatar = null;
      state.stories[0].bottom = 'own';
      addSticker(state.stories[0], 'question');
      const e: Env = { measure, pal: PALETTES[theme], fs: 1, state, edit: false };
      return storyScreen(e, state.stories[0]);
    };
    const bgs = (l: ReturnType<typeof make>) => [
      ...avatars(l.ops).map((o) => o.bg),
      ...[...l.stickers.values()].flatMap((k) => avatars(k.ops).map((o) => o.bg)),
    ];
    const light = bgs(make('light'));
    expect(light.length).toBeGreaterThanOrEqual(5);
    expect(bgs(make('dark'))).toEqual(light);
  });
});

describe('照片貼紙的白色相框（F62）', () => {
  const framed = (width: number, height: number) => {
    const st = blankStory('s1');
    const id = addSticker(st, 'image', {
      image: { kind: 'asset', id: 'b', name: '', width, height },
    }) as string;
    const k = st.stickers.find((x) => x.id === id);
    if (k?.type !== 'image') throw new Error('type');
    k.frame = true;
    return layoutSticker(env(), k);
  };

  it('白邊算在 60 cqw 裡（原作 box-sizing: border-box）：正方形 216 × 216', () => {
    const l = framed(1000, 1000);
    expect(l.w).toBeCloseTo(216);
    expect(l.h).toBeCloseTo(216);
  });

  it('橫圖：照片 (216 − 2 × 5.76) 寬、保持比例，加上白邊', () => {
    const l = framed(1200, 600);
    const inner = 216 - 2 * 1.6 * 3.6;
    expect(l.w).toBeCloseTo(216);
    expect(l.h).toBeCloseTo(inner / 2 + 2 * 1.6 * 3.6);
  });

  it('比 60 cqw 小的照片照原本的大小（只縮小不放大）', () => {
    const l = framed(100, 50);
    expect(l.w).toBeCloseTo(100 + 2 * 1.6 * 3.6);
    expect(l.h).toBeCloseTo(50 + 2 * 1.6 * 3.6);
  });
});

describe('限時動態的狀態列圖示（F67）', () => {
  it('每個圖示高 3.2 cqw（電池 27 × 13 → 寬 23.9）、間隔 1.4 cqw、右邊 6.5 cqw：整組左緣 270', () => {
    const e = env();
    const l = storyScreen(e, e.state.stories[0]);
    const U = 3.6;
    const top = rects(l.ops).filter((o) => o.y < 30);
    const bars = top.filter(
      (o) => o.fill === '#ffffff' && Math.abs(o.w - 3 * ((3.2 * U) / 12)) < 1e-6,
    );
    expect(bars).toHaveLength(4);
    const kb = (3.2 * U) / 13;
    const right = 360 - 6.5 * U;
    const left =
      right - 27 * kb - 1.4 * U - 16 * ((3.2 * U) / 12) - 1.4 * U - 18 * ((3.2 * U) / 12);
    expect(Math.min(...bars.map((o) => o.x))).toBeCloseTo(left);
    expect(left).toBeCloseTo(270, 0);
    const outline = top.find((o) => o.stroke && Math.abs(o.w - 23 * kb) < 1e-6);
    expect(outline?.x).toBeCloseTo(right - 27 * kb + 0.5 * kb);
    expect(outline?.h).toBeCloseTo(12 * kb);
  });

  it('貼文的狀態列不變：訊號 18、Wi-Fi 16、電池 27、間隔 6（左緣 291）', () => {
    const e = env();
    const l = postScreen(e, e.state.posts[0]);
    const bars = rects(l.ops).filter((o) => o.y < 54 && o.w === 3 && o.fill === PALETTES.light.ink);
    expect(Math.min(...bars.map((o) => o.x))).toBeCloseTo(291);
  });
});

describe('朋友身分（F111、F112）', () => {
  const friend = (s: SocialState) => {
    s.posts[0].friend = true;
    s.posts[0].owner = { username: 'kai.archive', avatar: null, verified: true };
  };

  it('朋友的貼文：帳號列、內文開頭是朋友的帳號；作者的留言與輸入列的提示也是', () => {
    const e = env(friend);
    const t = texts(postScreen(e, e.state.posts[0]).ops);
    expect(t).toContain('kai.archive');
    expect(t).not.toContain('xiaoyu.lin');
    e.state.posts[0].sheet.items[1].author = true;
    const c = texts(commentsScreen(e, e.state.posts[0]).ops);
    expect(c).toContain('留言給 kai.archive…');
    expect(c.filter((x) => x === 'kai.archive').length).toBeGreaterThan(1);
  });

  it('個人頁的格狀不放朋友的貼文；都只剩朋友的貼文有照片時補空格', () => {
    const e = env(friend);
    const keys = profileScreen(e).hits.map((h) => h.key);
    expect(keys).not.toContain(`post:${e.state.posts[0].id}`);
    expect(keys).toContain(`post:${e.state.posts[1].id}`);
    const e2 = env((s) => {
      friend(s);
      s.posts[1].photos = [];
      s.account.grid = [];
      s.account.placeholders = 6;
    });
    const l = profileScreen(e2);
    const cells = l.ops.flatMap((o) =>
      o.t === 'group' && o.clip?.y === l.parts.grid.y ? o.ops : [],
    );
    /* 自己的貼文 1 格（沒有照片）＋補到 6 格 */
    expect(cells.filter((o) => o.t === 'rect')).toHaveLength(6);
  });

  it('朋友的限時動態：帳號列是朋友的帳號', () => {
    const e = env();
    const st = e.state.stories[1];
    expect(st.friend).toBe(true);
    const t = texts(storyScreen(e, st).ops);
    expect(t).toContain('kai.archive');
    expect(t).not.toContain('xiaoyu.lin');
  });
});

describe('首頁動態（3.11）', () => {
  it('390 × 844：狀態列 54、上方列 50、限時動態列 112.2（＋線 0.5）、貼文、底部分頁列 84', () => {
    const e = env();
    const l = feedScreen(e);
    expect([l.width, l.height]).toEqual([390, 844]);
    expect(l.parts.top).toEqual({ x: 0, y: 54, width: 390, height: 50 });
    expect(l.parts.tray.y).toBe(104);
    expect(l.parts.tray.height).toBeCloseTo(6 + 70 + 5 + 12 * 1.6 + 12);
    expect(l.parts.posts.y).toBeCloseTo(104 + 112.2 + 0.5);
    expect(l.parts.nav).toEqual({ x: 0, y: 760, width: 390, height: 84 });
    /* 貼文照清單的順序、之間 8 */
    expect(l.posts.map((p) => p.index)).toEqual([0, 1]);
    expect(l.posts[1].top).toBeCloseTo(l.posts[0].top + l.posts[0].layout.height + 8);
    expect(texts(l.ops)).toEqual(
      expect.arrayContaining(['Moments', '我的限時動態', 'kai.archive', '2']),
    );
  });

  it('限時動態列：我的、朋友的（同一個帳號一個圈）；點了接著看的 id', () => {
    const e = env((s) => {
      addStory(s, 'mine');
      const id = addStory(s, 'friend') as string;
      const st = s.stories.find((x) => x.id === id);
      if (st) st.owner.username = 'kai.archive';
    });
    const l = feedScreen(e);
    const tray = l.hits.filter((h) => h.key.startsWith('tray:')).map((h) => h.key);
    expect(tray).toEqual(['tray:s1,s3', 'tray:s2,s4']);
    /* 每一項 74 寬、間隔 14、左右 12 */
    const t = layoutTray(e, 0);
    expect(t.items.map((it) => it.box.x)).toEqual([12, 100]);
    expect(t.contentWidth).toBe(12 * 2 + 74 * 2 + 14);
  });

  it('圈：新的是漸層外圈、全部看過是灰色、我沒有限時動態時沒有外圈＋右下角的＋', () => {
    const e = env((s) => {
      s.feed.myStories = [];
      s.stories[1].seen = true;
    });
    const t = layoutTray(e, 0);
    /* 我的：大頭貼 64（沒有外圈）＋主色的＋ */
    expect(t.ops.some((o) => o.t === 'avatar' && o.r === 32)).toBe(true);
    expect(t.ops.some((o) => o.t === 'circle' && o.fill === e.pal.accent && o.r === 8)).toBe(true);
    expect(t.items.map((it) => it.stories)).toEqual([['s2']]);
    /* 朋友的：看過了 → 分隔線色的外圈 */
    expect(t.ops.some((o) => o.t === 'circle' && o.fill === e.pal.line && o.r === 35)).toBe(true);
    expect(t.ops.some((o) => o.t === 'circle' && typeof o.fill === 'object')).toBe(false);
  });

  it('不在首頁動態顯示的貼文不放；一則都沒有時說明；底部分頁列的首頁是實心的', () => {
    const e = env((s) => {
      for (const p of s.posts) p.inFeed = false;
    });
    const l = feedScreen(e);
    expect(l.posts).toEqual([]);
    expect(texts(l.ops)).toContain('首頁沒有要顯示的貼文。');
    expect(l.ops.some((o) => o.t === 'icon' && o.name === 'home' && o.fill === e.pal.ink)).toBe(
      true,
    );
    expect(icons(profileScreen(e).ops)).toContain('home');
    expect(profileScreen(e).ops.some((o) => o.t === 'icon' && o.name === 'home' && !!o.fill)).toBe(
      false,
    );
  });

  it('沒有未讀數、紅點時不畫；HTML 依內容加高、底部分頁列接在最後', () => {
    const e = env((s) => {
      s.feed.dmBadge = '';
      s.feed.heartDot = false;
      addPost(s);
    });
    const l = feedScreen(e);
    expect(l.ops.some((o) => o.t === 'circle' && o.fill === e.pal.red)).toBe(false);
    const v = feedScreen(e, { viewer: true });
    const last = v.posts.at(-1);
    if (!last) throw new Error('post');
    expect(v.parts.nav.y).toBeCloseTo(last.top + last.layout.height);
    expect(v.height).toBeCloseTo(v.parts.nav.y + 84);
  });
});
