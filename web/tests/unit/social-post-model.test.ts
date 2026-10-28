/**
 * 社群貼文產生器的資料與規則（規格 docs/refactor/specs/social-post.md 第 1、3.9 節）：
 * 預設內容、整理存檔、貼文／限時動態／留言／貼紙的清單操作、精選動態的連結、照片與格狀縮圖。
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import {
  addComment,
  addMessage,
  addPhotos,
  addPost,
  addSticker,
  addStory,
  addThread,
  blankPost,
  blankStory,
  cellCount,
  clearCell,
  collectAssetIds,
  duplicatePost,
  duplicateStory,
  duplicateThread,
  friendGroups,
  initialState,
  LIMITS,
  MAX,
  mixHex,
  moveComment,
  movePhoto,
  movePost,
  moveStory,
  moveThread,
  myStoryList,
  normalizeState,
  ownerOf,
  removeComment,
  removePhoto,
  removePost,
  removeStory,
  removeThread,
  type SocialState,
  STORY_LAYOUTS,
  setCellImage,
  setMyStory,
  setPostRatio,
  setStoryGap,
  setStoryLayout,
  stickerAction,
  storyCellRects,
  threadPreview,
  threadTitle,
} from '../../src/tools/social-post/model';
import { anchorOf } from '../../src/tools/social-post/place';

const clone = (s: SocialState): SocialState => structuredClone(s);
const asset = (id: string) => ({
  kind: 'asset' as const,
  id,
  name: `${id}.png`,
  width: 800,
  height: 600,
});

describe('預設內容（D2）', () => {
  it('範例：2 則貼文、2 則限時動態（第 2 則是朋友的）、2 個精選動態連到存在的限時動態', () => {
    const s = initialState();
    expect(s.theme).toBe('light');
    expect(s.posts).toHaveLength(2);
    expect(s.posts[0].photos).toHaveLength(3);
    expect(s.posts[1].photos).toHaveLength(1);
    expect(s.posts[0].sheet.items).toHaveLength(3);
    expect(s.stories).toHaveLength(2);
    expect(s.stories[0].layout).toBe('4');
    expect(s.stories[0].cells).toHaveLength(6);
    expect(s.stories[0].friend).toBe(false);
    expect(s.stories[1]).toMatchObject({ friend: true, layout: '1', time: '2 小時' });
    expect(s.stories[1].owner.username).toBe('kai.archive');
    expect(s.feed).toEqual({ logo: 'Moments', heartDot: true, dmBadge: '2', myStories: ['s1'] });
    expect(s.posts.every((p) => !p.friend && p.inFeed)).toBe(true);
    expect(s.account.highlights).toHaveLength(2);
    const storyIds = new Set(s.stories.map((x) => x.id));
    for (const h of s.account.highlights) if (h.story) expect(storyIds.has(h.story)).toBe(true);
    expect(s.screen).toMatchObject({ status: true, icons: true, battery: 100, fontScale: 1 });
    expect(s.profile.username).toBe('xiaoyu.lin');
  });

  it('範例內容不出現 Instagram 的字樣', () => {
    const text = JSON.stringify(initialState());
    expect(text).not.toMatch(/instagram|insta|\bIG\b/i);
  });

  it('空白貼文：沒有照片、4:5、新式數字、有預設留言', () => {
    const p = blankPost('p9');
    expect(p.id).toBe('p9');
    expect(p.photos).toEqual([]);
    expect(p.ratio).toBe('4:5');
    expect(p.countStyle).toBe('inline');
    expect(p.sheet).toMatchObject({ backdrop: true, height: 'half' });
    expect(p.sheet.items.length).toBeGreaterThan(0);
  });

  it('空白限時動態：4 格、6 格都空、間距 0.5 白色、進度 1 段第 1 段 40%（原作 7b7411a 改成 1 段）', () => {
    const st = blankStory('s9');
    expect(st.layout).toBe('4');
    expect(st.cells).toHaveLength(6);
    expect(st.cells.every((c) => c.image === null)).toBe(true);
    expect(st).toMatchObject({
      gap: 0.5,
      gapColor: '#ffffff',
      count: 1,
      current: 1,
      progress: 40,
      bottom: 'reply',
      showTop: true,
    });
    expect(st.stickers).toEqual([]);
  });
});

describe('版面', () => {
  it('六種版面的格數', () => {
    expect(STORY_LAYOUTS.map((l) => [l, cellCount(l)])).toEqual([
      ['1', 1],
      ['2v', 2],
      ['2h', 2],
      ['3v', 3],
      ['4', 4],
      ['6', 6],
    ]);
  });
});

describe('貼文清單（F13～F17）', () => {
  it('新增加在最後、id 不重複', () => {
    const s = clone(initialState());
    const id = addPost(s);
    expect(s.posts.at(-1)?.id).toBe(id);
    expect(new Set(s.posts.map((p) => p.id)).size).toBe(s.posts.length);
  });

  it('滿 30 則時不能新增', () => {
    const s = clone(initialState());
    while (s.posts.length < MAX.posts) addPost(s);
    expect(addPost(s)).toBeNull();
    expect(s.posts).toHaveLength(MAX.posts);
  });

  it('複製放在後面、內容相同但 id 與留言 id 是新的', () => {
    const s = clone(initialState());
    const src = s.posts[0];
    const id = duplicatePost(s, src.id);
    expect(s.posts[1].id).toBe(id);
    expect(s.posts[1].caption).toBe(src.caption);
    expect(s.posts[1].photos).toHaveLength(src.photos.length);
    const ids = s.posts.flatMap((p) => [
      p.id,
      ...p.photos.map((x) => x.id),
      ...p.sheet.items.map((c) => c.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('刪除：至少留一則；回傳刪掉後該選的 id（同位置，最後一則時往前）', () => {
    const s = clone(initialState());
    const [a, b] = s.posts.map((p) => p.id);
    expect(removePost(s, b)).toBe(a);
    expect(s.posts.map((p) => p.id)).toEqual([a]);
    expect(removePost(s, a)).toBeNull();
    expect(s.posts).toHaveLength(1);
  });

  it('往前、往後交換位置；到頭時不動', () => {
    const s = clone(initialState());
    const [a, b] = s.posts.map((p) => p.id);
    expect(movePost(s, a, -1)).toBe(false);
    expect(movePost(s, a, 1)).toBe(true);
    expect(s.posts.map((p) => p.id)).toEqual([b, a]);
  });
});

describe('照片（F18、F19、F21）', () => {
  it('加入照片：目前那張換到新加的第一張；最多 20 張', () => {
    const s = clone(initialState());
    const p = s.posts[1];
    const added = addPhotos(p, [asset('x1'), asset('x2')]);
    expect(added).toBe(2);
    expect(p.current).toBe(1);
    expect(p.photos.map((x) => x.image)).toEqual([p.photos[0].image, asset('x1'), asset('x2')]);
    const many = Array.from({ length: 30 }, (_, i) => asset(`m${i}`));
    expect(addPhotos(p, many)).toBe(MAX.photos - 3);
    expect(p.photos).toHaveLength(MAX.photos);
  });

  it('拿掉第一張時格狀縮圖回到預設；目前那張夾回範圍', () => {
    const s = clone(initialState());
    const p = s.posts[0];
    p.thumb = { zoom: 2, x: 0.1, y: 0, turns: 0 };
    p.current = 2;
    removePhoto(p, 2);
    expect(p.current).toBe(1);
    expect(p.thumb.zoom).toBe(2);
    removePhoto(p, 0);
    expect(p.thumb).toEqual({ zoom: 1, x: 0, y: 0, turns: 0 });
  });

  it('移動第一張時格狀縮圖回到預設；目前那張跟著移動的那張', () => {
    const s = clone(initialState());
    const p = s.posts[0];
    const ids = p.photos.map((x) => x.id);
    p.thumb = { zoom: 2, x: 0, y: 0, turns: 0 };
    movePhoto(p, 2, 1);
    expect(p.photos.map((x) => x.id)).toEqual([ids[0], ids[2], ids[1]]);
    expect(p.current).toBe(1);
    expect(p.thumb.zoom).toBe(2);
    movePhoto(p, 1, 0);
    expect(p.thumb.zoom).toBe(1);
  });
});

describe('留言（F40、F41）', () => {
  it('新增：user_N、剛剛、留言內容；最多 50 則', () => {
    const p = blankPost('p1');
    p.sheet.items = [];
    addComment(p);
    expect(p.sheet.items[0]).toMatchObject({
      username: 'user_1',
      time: '剛剛',
      text: '留言內容',
      author: false,
    });
    while (p.sheet.items.length < MAX.comments) addComment(p);
    expect(addComment(p)).toBeNull();
  });

  it('往上、往下、刪除', () => {
    const p = clone(initialState()).posts[0];
    const ids = p.sheet.items.map((c) => c.id);
    moveComment(p, ids[0], 1);
    expect(p.sheet.items.map((c) => c.id)).toEqual([ids[1], ids[0], ids[2]]);
    removeComment(p, ids[2]);
    expect(p.sheet.items).toHaveLength(2);
  });
});

describe('限時動態清單與精選動態的連結（F48）', () => {
  it('刪除限時動態：連到它的精選動態改成「無」，其他不變；至少留一則', () => {
    const s = clone(initialState());
    const first = s.stories[0].id;
    const second = addStory(s) as string;
    s.account.highlights[1].story = second;
    removeStory(s, first);
    expect(s.account.highlights[0].story).toBeNull();
    expect(s.account.highlights[1].story).toBe(second);
    /* 我的限時動態也拿掉 */
    expect(s.feed.myStories).toEqual([]);
    removeStory(s, 's2');
    expect(removeStory(s, second)).toBeNull();
  });

  it('換位置、複製時精選動態仍連到同一則（以 id 記）', () => {
    const s = clone(initialState());
    const first = s.stories[0].id;
    const second = addStory(s) as string;
    moveStory(s, second, -1);
    moveStory(s, second, -1);
    expect(s.stories.map((x) => x.id)).toEqual([second, first, 's2']);
    expect(s.account.highlights[0].story).toBe(first);
    const dup = duplicateStory(s, first);
    expect(s.stories.map((x) => x.id)).toEqual([second, first, dup, 's2']);
    expect(s.account.highlights[0].story).toBe(first);
    /* 我的限時動態以 id 記：換位置、複製後仍是同一則（複製的不放進去，同原作） */
    expect(s.feed.myStories).toEqual([first]);
  });
});

describe('格子（F49、F50）', () => {
  it('放入照片時位置回到預設；清空', () => {
    const st = blankStory('s1');
    st.cells[2].place = { zoom: 3, x: 0.2, y: 0, turns: 1 };
    setCellImage(st, 2, asset('c'));
    expect(st.cells[2]).toEqual({ image: asset('c'), place: { zoom: 1, x: 0, y: 0, turns: 0 } });
    clearCell(st, 2);
    expect(st.cells[2].image).toBeNull();
  });
});

describe('照片的位置：換比例、換版面、間距、整理存檔（F20、F51、3.9）', () => {
  /* 1500 × 1200 的橫圖：4:5 時高剛好蓋滿、左右多出來 */
  const wide = { kind: 'asset' as const, id: 'w', name: 'w.jpg', width: 1500, height: 1200 };
  const IMG = { width: 1500, height: 1200 };
  const box = (r: number) => ({ width: 1, height: 1 / r });

  it('換比例：每張照片在可以移動的範圍裡的比例不變（原作的 object-position）', () => {
    const p = blankPost('p1');
    addPhotos(p, [wide, wide]);
    p.photos[0].place = { zoom: 1, x: 0.1, y: 0, turns: 0 };
    p.photos[1].place = { zoom: 2, x: -0.3, y: 0.2, turns: 0 };
    const before = p.photos.map((x) => anchorOf(IMG, box(4 / 5), x.place));
    setPostRatio(p, '1:1');
    expect(p.ratio).toBe('1:1');
    p.photos.forEach((x, i) => {
      const a = anchorOf(IMG, box(1), x.place);
      expect(a.x).toBeCloseTo(before[i].x);
      expect(a.y).toBeCloseTo(before[i].y);
    });
    /* 1:1 的範圍是 ±0.125：在範圍裡 */
    expect(Math.abs(p.photos[0].place.x)).toBeLessThanOrEqual(0.125);
  });

  it('換版面：看得到的格子保持比例；藏起來的格子換回來時回到原來的位置', () => {
    const st = blankStory('s1');
    setCellImage(st, 0, wide);
    setCellImage(st, 3, wide);
    const r4 = storyCellRects('4', st.gap);
    st.cells[3].place = { zoom: 2, x: 0.2, y: -0.1, turns: 0 };
    const a3 = anchorOf(IMG, r4[3], st.cells[3].place);
    st.cells[0].place = { zoom: 1.5, x: -0.2, y: 0, turns: 0 };
    const a0 = anchorOf(IMG, r4[0], st.cells[0].place);
    setStoryLayout(st, '1');
    expect(st.layout).toBe('1');
    const r1 = storyCellRects('1', st.gap);
    expect(anchorOf(IMG, r1[0], st.cells[0].place).x).toBeCloseTo(a0.x);
    setStoryLayout(st, '4');
    const back = anchorOf(IMG, r4[3], st.cells[3].place);
    expect(back.x).toBeCloseTo(a3.x);
    expect(back.y).toBeCloseTo(a3.y);
    expect(st.cells[3].place.x).toBeCloseTo(0.2);
    expect(st.cells[3].place.y).toBeCloseTo(-0.1);
    expect(st.cells[3].place.ax).toBeUndefined();
  });

  it('間距：格子變大變小時比例不變', () => {
    const st = blankStory('s1');
    setCellImage(st, 1, wide);
    st.cells[1].place = { zoom: 1.2, x: 0.15, y: 0.03, turns: 0 };
    const a = anchorOf(IMG, storyCellRects('4', st.gap)[1], st.cells[1].place);
    setStoryGap(st, 3);
    expect(st.gap).toBe(3);
    const b = anchorOf(IMG, storyCellRects('4', 3)[1], st.cells[1].place);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y).toBeCloseTo(a.y);
  });

  it('開檔、還原：照片、格狀縮圖、看得到的格子的位置夾回蓋滿的範圍；剛好放得下的那一邊的比例留著', () => {
    const raw = clone(initialState());
    raw.posts[0].photos = [{ id: 'ph1', image: wide, place: { zoom: 1, x: 9, y: -9, turns: 0 } }];
    raw.posts[0].ratio = '1:1';
    raw.posts[0].thumb = { zoom: 2, x: -3, y: 0, turns: 0 };
    raw.stories[0].layout = '1';
    raw.stories[0].cells[0] = {
      image: wide,
      place: { zoom: 1, x: 0, y: 0, turns: 0, ax: 0.25, ay: 0.8 },
    };
    raw.stories[0].cells[4] = { image: wide, place: { zoom: 1, x: 3, y: 0, turns: 0, ax: 0.1 } };
    const n = normalizeState(raw);
    expect(n.posts[0].photos[0].place.x).toBeCloseTo(0.125);
    expect(n.posts[0].photos[0].place.y).toBe(0);
    /* 格狀縮圖（1:1，第一張照片）：2 倍時左右的範圍是 ±(1.25 × 2 − 1) ÷ 2 */
    expect(n.posts[0].thumb.x).toBeCloseTo(-0.75);
    /* 1 張版面（360 × 640）：高蓋滿、左右可以移動 → ax 不留；ay 留著 */
    expect(n.stories[0].cells[0].place.ax).toBeUndefined();
    expect(n.stories[0].cells[0].place.ay).toBe(0.8);
    /* 藏起來的格子不動 */
    expect(n.stories[0].cells[4].place).toEqual({ zoom: 1, x: 3, y: 0, turns: 0, ax: 0.1 });
    /* 沒有超出的不變 */
    const again = normalizeState(n);
    expect(again).toEqual(n);
  });
});

describe('貼紙（F56、F64）', () => {
  it('位置依張數錯開：x＝50＋（n%3−1）×8、y＝28＋（n%6）×9', () => {
    const st = blankStory('s1');
    const pos = [0, 1, 2, 3].map(() => {
      const id = addSticker(st, 'emoji') as string;
      const k = st.stickers.find((x) => x.id === id);
      return [k?.x, k?.y];
    });
    expect(pos).toEqual([
      [42, 28],
      [50, 37],
      [58, 46],
      [42, 55],
    ]);
  });

  it('提及的預設文字是帳號；地點、標籤有預設', () => {
    const s = clone(initialState());
    const st = s.stories[0];
    const id = addSticker(st, 'mention', { username: s.profile.username }) as string;
    expect(st.stickers.find((k) => k.id === id)).toMatchObject({
      type: 'mention',
      text: 'xiaoyu.lin',
      style: 'white',
    });
  });

  it('最上層、最下層、複製（+4%）、移到中央、刪除', () => {
    const st = blankStory('s1');
    const a = addSticker(st, 'emoji') as string;
    const b = addSticker(st, 'text') as string;
    stickerAction(st, a, 'front');
    expect(st.stickers.map((k) => k.id)).toEqual([b, a]);
    stickerAction(st, a, 'back');
    expect(st.stickers.map((k) => k.id)).toEqual([a, b]);
    const c = stickerAction(st, b, 'dup') as string;
    const kb = st.stickers.find((k) => k.id === b);
    const kc = st.stickers.find((k) => k.id === c);
    expect(kc?.x).toBe((kb?.x ?? 0) + 4);
    expect(kc?.y).toBe((kb?.y ?? 0) + 4);
    stickerAction(st, c, 'center');
    expect(st.stickers.find((k) => k.id === c)).toMatchObject({ x: 50, y: 50 });
    stickerAction(st, c, 'delete');
    expect(st.stickers.map((k) => k.id)).toEqual([a, b]);
  });
});

describe('整理存檔（3.9）', () => {
  it('壞掉的存檔換成預設', () => {
    expect(normalizeState(null)).toEqual(initialState());
    expect(normalizeState('x')).toEqual(initialState());
  });

  it('數值夾回範圍、選項不認得時用預設、文字截到上限', () => {
    const raw = clone(initialState()) as unknown as Record<string, unknown>;
    const s = raw as unknown as SocialState;
    s.screen.battery = 400;
    s.screen.fontScale = 0.1;
    (s as unknown as { theme: string }).theme = 'purple';
    s.posts[0].ratio = '2:1' as never;
    s.posts[0].caption = 'a'.repeat(5000);
    s.stories[0].count = 99;
    s.stories[0].gap = -2;
    s.stories[0].layout = '9' as never;
    const n = normalizeState(raw);
    expect(n.screen.battery).toBe(100);
    expect(n.screen.fontScale).toBe(0.8);
    expect(n.theme).toBe('light');
    expect(n.posts[0].ratio).toBe('4:5');
    expect(n.posts[0].caption).toHaveLength(LIMITS.caption);
    expect(n.stories[0].count).toBe(12);
    expect(n.stories[0].gap).toBe(0);
    expect(n.stories[0].layout).toBe('4');
  });

  it('貼文、限時動態至少一則；格子補滿 6 格；精選動態連到不存在的限時動態時改成無', () => {
    const raw = clone(initialState());
    raw.posts = [];
    raw.stories[0].cells = raw.stories[0].cells.slice(0, 2);
    raw.account.highlights[0].story = 'nope';
    const n = normalizeState(raw);
    expect(n.posts).toHaveLength(1);
    expect(n.stories[0].cells).toHaveLength(6);
    expect(n.account.highlights[0].story).toBeNull();
  });

  it('id 重複時重編', () => {
    const raw = clone(initialState());
    raw.posts[1].id = raw.posts[0].id;
    raw.posts[1].photos[0].id = raw.posts[0].photos[0].id;
    const n = normalizeState(raw);
    expect(new Set(n.posts.map((p) => p.id)).size).toBe(2);
    const photoIds = n.posts.flatMap((p) => p.photos.map((x) => x.id));
    expect(new Set(photoIds).size).toBe(photoIds.length);
  });

  it('不認得的圖（不是資產也不是範例）拿掉', () => {
    const raw = clone(initialState()) as unknown as {
      profile: { avatar: unknown };
      posts: { photos: { image: unknown }[] }[];
    };
    raw.profile.avatar = { kind: 'asset', id: '' };
    raw.posts[0].photos[0].image = { kind: 'sample', key: 'nope' };
    const n = normalizeState(raw);
    expect(n.profile.avatar).toBeNull();
    expect(n.posts[0].photos).toHaveLength(2);
  });

  it('資產 id 收集（專案檔、圖片庫整理用）', () => {
    const s = clone(initialState());
    s.profile.avatar = asset('av');
    addPhotos(s.posts[0], [asset('ph')]);
    setCellImage(s.stories[0], 0, asset('cell'));
    s.account.grid.push({ id: 'g1', image: asset('grid') });
    s.posts[0].sheet.items[0].avatar = asset('cm');
    s.posts[1].owner.avatar = asset('po');
    s.stories[1].owner.avatar = asset('so');
    expect(collectAssetIds(s).sort()).toEqual(['av', 'cell', 'cm', 'grid', 'ph', 'po', 'so']);
  });
});

describe('在 store 的 Immer draft 裡操作', () => {
  it('複製貼文、限時動態、貼紙不會因為 draft 而失敗', () => {
    const next = produce(initialState(), (d) => {
      duplicatePost(d, 'p1');
      duplicateStory(d, 's1');
      stickerAction(d.stories[0], 'k1', 'dup');
    });
    expect(next.posts).toHaveLength(3);
    expect(next.stories).toHaveLength(3);
    expect(next.stories[0].stickers).toHaveLength(3);
  });
});

describe('朋友身分（F111～F115）', () => {
  it('新增朋友的貼文、限時動態：friend_N（N＝朋友的貼文與限時動態數＋1）', () => {
    const s = clone(initialState());
    const p = addPost(s, true) as string;
    const post = s.posts.find((x) => x.id === p);
    /* 範例已有一則朋友的限時動態 → friend_2 */
    expect(post).toMatchObject({ friend: true, inFeed: true });
    expect(post?.owner).toEqual({ username: 'friend_2', avatar: null, verified: false });
    const st = addStory(s, 'friend') as string;
    expect(s.stories.find((x) => x.id === st)).toMatchObject({
      friend: true,
      layout: '1',
      bg: 'dusk',
      owner: { username: 'friend_3' },
    });
    const mine = addStory(s, 'mine') as string;
    expect(s.feed.myStories).toEqual(['s1', mine]);
  });

  it('帳號：朋友的用 owner（沒有帳號時 friend、沒有動態外圈），否則是自己的帳號', () => {
    const s = clone(initialState());
    s.profile.ring = true;
    expect(ownerOf(s, s.posts[0])).toBe(s.profile);
    s.posts[0].friend = true;
    s.posts[0].owner = { username: '', avatar: null, verified: true };
    expect(ownerOf(s, s.posts[0])).toMatchObject({
      username: 'friend',
      verified: true,
      ring: false,
    });
  });

  it('首頁動態的圈：我的限時動態照清單的順序、不放朋友的；同一個帳號的朋友合成一個圈', () => {
    const s = clone(initialState());
    const a = addStory(s, 'mine') as string;
    moveStory(s, a, -1);
    moveStory(s, a, -1);
    expect(myStoryList(s).map((x) => x.id)).toEqual([a, 's1']);
    setMyStory(s, 's1', false);
    expect(myStoryList(s).map((x) => x.id)).toEqual([a]);
    /* 朋友的限時動態放進「我的」也不算 */
    setMyStory(s, 's2', true);
    expect(myStoryList(s).map((x) => x.id)).toEqual([a]);
    const b = addStory(s, 'friend') as string;
    const c = addStory(s, 'friend') as string;
    (s.stories.find((x) => x.id === c) as { owner: { username: string } }).owner.username =
      ' KAI.archive ';
    const g = friendGroups(s);
    expect(g.map((x) => x.stories.map((y) => y.id))).toEqual([['s2', c], [b]]);
  });
});

describe('資料版本 3 與舊的存檔（3.9）', () => {
  /** 版本 2 的存檔：沒有 friend、owner、inFeed、seen、feed */
  function v2() {
    const s = clone(initialState()) as unknown as Record<string, unknown>;
    const strip = (o: Record<string, unknown>, keys: string[]) => {
      for (const k of keys) delete o[k];
    };
    for (const p of s.posts as Record<string, unknown>[]) strip(p, ['friend', 'owner', 'inFeed']);
    const stories = (s.stories as Record<string, unknown>[]).slice(0, 1);
    for (const st of stories) {
      strip(st, ['friend', 'owner', 'seen']);
      Object.assign(st, { count: 3, current: 1, progress: 40 });
    }
    s.stories = stories;
    delete s.feed;
    return s;
  }

  it('版本 2 的存檔照常讀：自己的貼文與限時動態、在首頁動態顯示、我的限時動態是第一則', () => {
    const n = normalizeState(v2(), 2);
    expect(n.posts.every((p) => !p.friend && p.inFeed)).toBe(true);
    expect(n.posts[0].owner).toEqual({ username: 'friend_1', avatar: null, verified: false });
    expect(n.stories).toHaveLength(1);
    expect(n.stories[0]).toMatchObject({ friend: false, seen: false });
    expect(n.feed).toEqual({ logo: 'Moments', heartDot: true, dmBadge: '2', myStories: ['s1'] });
  });

  it('版本 3 以前還是舊預設（3 段、第 1 段、40%）的限時動態改成 1 段；改過的不動', () => {
    expect(normalizeState(v2(), 2).stories[0].count).toBe(1);
    const changed = v2();
    Object.assign((changed.stories as Record<string, unknown>[])[0], { count: 3, current: 2 });
    expect(normalizeState(changed, 2).stories[0].count).toBe(3);
    /* 版本 3 的存檔不轉換 */
    expect(normalizeState(v2(), 3).stories[0].count).toBe(3);
  });

  it('整理：我的限時動態只留存在、不是朋友的；文字截到上限；owner 壞掉時用預設', () => {
    const s = clone(initialState()) as unknown as Record<string, unknown>;
    s.feed = {
      logo: 'x'.repeat(50),
      heartDot: 'yes',
      dmBadge: 12,
      myStories: ['s2', 's1', 'zz', 's1'],
    };
    (s.posts as Record<string, unknown>[])[0].owner = 'bad';
    const n = normalizeState(s);
    expect(n.feed).toEqual({
      logo: 'x'.repeat(20),
      heartDot: true,
      dmBadge: '2',
      myStories: ['s1'],
    });
    expect(n.posts[0].owner.username).toBe('friend_1');
  });
});

describe('私訊（F134～F145）', () => {
  it('範例：2 個對話（阿凱：在線上、未讀、反應；霧港鎮觀光資訊）、泡泡的顏色', () => {
    const s = initialState();
    expect(s.dm.threads.map((t) => [t.id, t.username, t.unread, t.online])).toEqual([
      ['t1', 'kai.archive', true, true],
      ['t2', 'mistharbor.info', false, false],
    ]);
    expect(s.dm.threads[0].messages.map((m) => m.from)).toEqual([
      'time',
      'them',
      'them',
      'me',
      'me',
      'them',
    ]);
    expect(s.dm.threads[0].messages[4].react).toBe('❤️');
    expect([s.dm.c1, s.dm.c2]).toEqual(['#7a4fd6', '#3f63e0']);
  });

  it('新增（friend_N、打招呼的兩則）、複製（訊息換新的 id）、往下、刪除（至少留一個）', () => {
    const s = clone(initialState());
    const a = addThread(s) as string;
    const t = s.dm.threads.find((x) => x.id === a);
    expect(t?.username).toBe('friend_3');
    expect(t?.messages.map((m) => [m.from, m.text])).toEqual([
      ['time', '今天 下午 2:10'],
      ['them', '嗨！'],
      ['me', '嗨 😊'],
    ]);
    const ids = s.dm.threads.flatMap((x) => x.messages.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
    const b = duplicateThread(s, 't1') as string;
    expect(s.dm.threads.map((x) => x.id)).toEqual(['t1', b, 't2', a]);
    const all = s.dm.threads.flatMap((x) => x.messages.map((m) => m.id));
    expect(new Set(all).size).toBe(all.length);
    moveThread(s, 't1', 1);
    expect(s.dm.threads[1].id).toBe('t1');
    for (const id of [b, 't2', a]) removeThread(s, id);
    expect(removeThread(s, 't1')).toBeNull();
  });

  it('新增訊息：我、對方的是空白、時間是「今天 下午 3:00」；照片的訊息（拖放）', () => {
    const s = clone(initialState());
    addMessage(s, 't2', 'me');
    addMessage(s, 't2', 'time');
    addMessage(s, 't2', 'me', { kind: 'asset', id: 'x', name: 'x.png', width: 10, height: 10 });
    const ms = s.dm.threads[1].messages.slice(-3);
    expect(ms.map((m) => [m.from, m.text, m.image?.kind ?? null])).toEqual([
      ['me', '', null],
      ['time', '今天 下午 3:00', null],
      ['me', '', 'asset'],
    ]);
  });

  it('名稱與訊息列表的預覽：名稱空白時用帳號；最後一則（不是時間）；我的加「你：」；只有照片時說明', () => {
    const s = clone(initialState());
    const [kai, info] = s.dm.threads;
    expect(threadTitle(kai)).toBe('阿凱');
    expect(threadTitle(info)).toBe('mistharbor.info');
    expect(threadPreview(kai)).toBe('……我帶手電筒');
    expect(threadPreview(info)).toBe('你：收到，謝謝提醒 🙏');
    info.messages.push({ id: 'z', from: 'me', text: '', image: kai.avatar, react: '' });
    expect(threadPreview(info)).toBe('你傳送了一張相片');
    info.messages.push({ id: 'z2', from: 'time', text: '剛剛', image: null, react: '' });
    expect(threadPreview(info)).toBe('你傳送了一張相片');
    info.preview = '自訂的預覽';
    expect(threadPreview(info)).toBe('自訂的預覽');
  });

  it('泡泡的顏色從上面的色漸變到下面的色', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('整理：沒有私訊時用範例；時間的訊息的照片與反應留著；不認得的換預設；文字截到上限', () => {
    const raw = clone(initialState()) as unknown as Record<string, unknown>;
    delete raw.dm;
    expect(normalizeState(raw, 2).dm.threads.map((t) => t.id)).toEqual(['t1', 't2']);
    raw.dm = {
      c1: 'red',
      c2: '#ABCDEF',
      threads: [
        {
          id: 't9',
          username: 'x'.repeat(40),
          messages: [
            {
              id: 'm1',
              from: 'time',
              text: 't'.repeat(50),
              image: { kind: 'sample', key: 'moon' },
              react: '❤️',
            },
            { id: 'm1', from: 'who', text: 'hi', react: '👍👍👍👍👍👍👍👍👍' },
            'bad',
          ],
        },
      ],
    };
    const n = normalizeState(raw);
    expect(n.dm.c1).toBe('#7a4fd6');
    expect(n.dm.c2).toBe('#abcdef');
    const t = n.dm.threads[0];
    expect(t.username).toHaveLength(30);
    expect(t).toMatchObject({ seen: '已讀', intro: true, unread: false });
    expect(t.messages).toHaveLength(2);
    /* 時間的訊息只是不畫照片與反應，資料留著（改回一般的訊息時還在，同原作） */
    expect(t.messages[0]).toMatchObject({
      from: 'time',
      image: { kind: 'sample', key: 'moon' },
      react: '❤️',
    });
    expect(t.messages[0].text).toHaveLength(50);
    expect(t.messages[1].from).toBe('me');
    expect(t.messages[1].id).not.toBe('m1');
    expect(Array.from(t.messages[1].react)).toHaveLength(8);
  });
});
