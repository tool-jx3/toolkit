/**
 * 社群貼文產生器的版面（規格 3.1、3.4～3.7）：各畫面的大小、區塊的位置、可以點的地方、編輯用的東西不進輸出。
 * 量字用假的（中日韓一個字＝字級、其他半個字級），只驗證版面規則。
 */
import { describe, expect, it } from 'vitest';
import {
  addSticker,
  blankStory,
  initialState,
  type SocialState,
  setCellImage,
} from '../../src/tools/social-post/model';
import { commentsScreen } from '../../src/tools/social-post/render/comments';
import type { Env } from '../../src/tools/social-post/render/common';
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

  it('進度條：目前那段之前滿、之後空；HTML 自動播放時目前那段從 0 開始', () => {
    const e = env((s) => {
      Object.assign(s.stories[0], { count: 4, current: 3, progress: 50 });
    });
    const l = storyScreen(e, e.state.stories[0]);
    expect(l.parts.bar.width).toBeCloseTo((360 - 2 * 7.92 - 3 * 3.6) / 4);
    const fills = l.ops.filter((o) => o.t === 'rect' && o.fill === '#ffffff' && o.h < 3);
    expect(fills).toHaveLength(3);
    const v = storyScreen(e, e.state.stories[0], { viewer: { autoplay: true, closable: true } });
    expect(v.ops.filter((o) => o.t === 'rect' && o.fill === '#ffffff' && o.h < 3)).toHaveLength(2);
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
