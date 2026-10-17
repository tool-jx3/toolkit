/**
 * 社群貼文產生器的資料與規則（規格 docs/refactor/specs/social-post.md 第 1、3.9 節）：
 * 預設內容、整理存檔、貼文／限時動態／留言／貼紙的清單操作、精選動態的連結、照片與格狀縮圖。
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import {
  addComment,
  addPhotos,
  addPost,
  addSticker,
  addStory,
  blankPost,
  blankStory,
  cellCount,
  clearCell,
  collectAssetIds,
  duplicatePost,
  duplicateStory,
  initialState,
  LIMITS,
  MAX,
  moveComment,
  movePhoto,
  movePost,
  moveStory,
  normalizeState,
  removeComment,
  removePhoto,
  removePost,
  removeStory,
  type SocialState,
  STORY_LAYOUTS,
  setCellImage,
  stickerAction,
} from '../../src/tools/social-post/model';

const clone = (s: SocialState): SocialState => structuredClone(s);
const asset = (id: string) => ({
  kind: 'asset' as const,
  id,
  name: `${id}.png`,
  width: 800,
  height: 600,
});

describe('預設內容（D2）', () => {
  it('範例：2 則貼文、1 則限時動態、2 個精選動態連到存在的限時動態', () => {
    const s = initialState();
    expect(s.theme).toBe('light');
    expect(s.posts).toHaveLength(2);
    expect(s.posts[0].photos).toHaveLength(3);
    expect(s.posts[1].photos).toHaveLength(1);
    expect(s.posts[0].sheet.items).toHaveLength(3);
    expect(s.stories).toHaveLength(1);
    expect(s.stories[0].layout).toBe('4');
    expect(s.stories[0].cells).toHaveLength(6);
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

  it('空白限時動態：4 格、6 格都空、間距 0.5 白色、進度 3 段第 1 段 40%', () => {
    const st = blankStory('s9');
    expect(st.layout).toBe('4');
    expect(st.cells).toHaveLength(6);
    expect(st.cells.every((c) => c.image === null)).toBe(true);
    expect(st).toMatchObject({
      gap: 0.5,
      gapColor: '#ffffff',
      count: 3,
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
    expect(removeStory(s, second)).toBeNull();
  });

  it('換位置、複製時精選動態仍連到同一則（以 id 記）', () => {
    const s = clone(initialState());
    const first = s.stories[0].id;
    const second = addStory(s) as string;
    moveStory(s, second, -1);
    expect(s.stories.map((x) => x.id)).toEqual([second, first]);
    expect(s.account.highlights[0].story).toBe(first);
    const dup = duplicateStory(s, first);
    expect(s.stories.map((x) => x.id)).toEqual([second, first, dup]);
    expect(s.account.highlights[0].story).toBe(first);
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
    expect(collectAssetIds(s).sort()).toEqual(['av', 'cell', 'cm', 'grid', 'ph']);
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
    expect(next.stories).toHaveLength(2);
    expect(next.stories[0].stickers).toHaveLength(3);
  });
});
