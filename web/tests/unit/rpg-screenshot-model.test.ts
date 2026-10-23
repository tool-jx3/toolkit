/**
 * RPG 截圖產生器的規則（規格 docs/refactor/specs/rpg-screenshot.md）：台詞的分頁與說話者、顏色標記、選項與演出文字的行、
 * GIF 的影格表（3.10）、背景圖的位置、輸出的大小與檔名、存檔的整理。
 */
import { describe, expect, it } from 'vitest';
import {
  animScale,
  clampView,
  easeBack,
  easeOut,
  exportFileName,
  FULL_CLOCKS,
  frameTable,
  initialState,
  listLineCount,
  listLines,
  normalizeState,
  outputSize,
  type PageInfo,
  pageAtCaret,
  pageInfos,
  panView,
  parsePages,
  playClocks,
  popTotal,
  stamp,
  type TableFrame,
  tokenCount,
  tokenize,
  viewCrop,
  zoomView,
} from '@/tools/rpg-screenshot/model';

const ACCENT = '#e0508f';
const text = (tokens: { ch: string }[]) => tokens.map((t) => t.ch).join('');

describe('台詞的分頁與說話者', () => {
  it('一行只有「---」換頁；頁的第一行「@名字」換說話者，只寫「@」不顯示名字', () => {
    const pages = parsePages('第一頁\n---\n@甲\n第二頁\n  ---  \n@\n第三頁\n---\n第四頁', '預設');
    expect(pages).toEqual([
      { speaker: '預設', text: '第一頁' },
      { speaker: '甲', text: '第二頁' },
      { speaker: '', text: '第三頁' },
      { speaker: '預設', text: '第四頁' },
    ]);
  });

  it('「----」不是換頁；全形的「－－－」「＠」也可以；頭尾空白去掉', () => {
    expect(parsePages('a\n----\nb', '').map((p) => p.text)).toEqual(['a\n----\nb']);
    expect(parsePages('a\n－－－\n＠ 乙 \nb', ' 丙 ')).toEqual([
      { speaker: '丙', text: 'a' },
      { speaker: '乙', text: 'b' },
    ]);
  });

  it('空白的台詞＝一頁空白；@ 不在第一行時照樣是文字', () => {
    expect(parsePages('', '')).toEqual([{ speaker: '', text: '' }]);
    expect(parsePages('嗨\n@甲', '')).toEqual([{ speaker: '', text: '嗨\n@甲' }]);
  });

  it('游標所在的頁＝游標前面有幾行「---」', () => {
    const s = 'a\n---\nb\n---\nc';
    expect(pageAtCaret(s, 0)).toBe(0);
    expect(pageAtCaret(s, 2)).toBe(0);
    expect(pageAtCaret(s, 6)).toBe(1);
    expect(pageAtCaret(s, s.length)).toBe(2);
  });
});

describe('顏色標記', () => {
  it('名稱、色碼、「[/]」回到預設色；標記不算字', () => {
    const t = tokenize('A[紅]B[/]C[#12abEF]D[#fff]E', ACCENT);
    expect(text(t)).toBe('ABCDE');
    expect(t.map((x) => x.color)).toEqual([null, '#ff5a5a', null, '#12abEF', '#fff']);
  });

  it('中文名稱（含別名）的色值同原作', () => {
    const names: [string, string][] = [
      ['紅', '#ff5a5a'],
      ['橘', '#ff9f43'],
      ['黃色', '#ffd43b'],
      ['綠', '#51cf66'],
      ['藍', '#4dabf7'],
      ['天藍', '#74e0ff'],
      ['紫', '#b197fc'],
      ['粉紅', '#ff8cc6'],
      ['灰', '#9aa0a6'],
      ['白', '#ffffff'],
      ['黑', '#111111'],
    ];
    for (const [n, c] of names) expect(tokenize(`[${n}]x`, ACCENT)[0].color).toBe(c);
  });

  it('「[強調]」＝主題的強調色；全形括號也可以', () => {
    expect(tokenize('[強調]x', ACCENT)[0].color).toBe(ACCENT);
    expect(tokenize('［綠］x［/］y', ACCENT).map((t) => t.color)).toEqual(['#51cf66', null]);
  });

  it('認不得的標記照原樣當成字', () => {
    expect(text(tokenize('[note]a[#ab][#abcd][ 紅]', ACCENT))).toBe('[note]a[#ab][#abcd][ 紅]');
    expect(tokenize('[note]a', ACCENT).every((t) => t.color === null)).toBe(true);
  });

  it('以 code point 計；換行不算字、空白算', () => {
    const t = tokenize('😀 a\nb', ACCENT);
    expect(t.map((x) => x.ch)).toEqual(['😀', ' ', 'a', '\n', 'b']);
    expect(tokenCount(t)).toBe(4);
  });
});

describe('選項與演出文字', () => {
  it('一行一個、去掉空白與空行、最多 4 個', () => {
    expect(listLines(' 是 \n\n否\n\r\n三\n四\n五')).toEqual(['是', '否', '三', '四']);
    expect(listLineCount('a\n\nb\nc\nd\ne')).toBe(5);
  });
});

describe('動畫的時間', () => {
  it('演出文字全部做完的時間', () => {
    expect(popTotal(0)).toBe(0);
    expect(popTotal(1)).toBe(760 + 700 + 150);
    expect(popTotal(4)).toBe(760 + 280 * 3 + 700 + 150);
  });

  it('緩出、過頭再回來', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(2)).toBe(1);
    expect(easeBack(0)).toBeCloseTo(0, 9);
    expect(easeBack(1)).toBe(1);
    expect(Math.max(...[0.6, 0.7, 0.8].map(easeBack))).toBeGreaterThan(1);
  });

  it('預覽播放：每個字 typeSpeed 毫秒；演出文字在打完後或一起開始', () => {
    expect(playClocks(0, 10, 45, 'after')).toEqual({
      reveal: 0,
      name: 0,
      loc: 0,
      pop: -1,
      blinkOn: true,
    });
    expect(playClocks(100, 10, 45, 'after').reveal).toBe(2);
    expect(playClocks(500, 10, 45, 'after')).toMatchObject({ reveal: 10, pop: 50 });
    expect(playClocks(100, 10, 45, 'with').pop).toBe(100);
  });
});

describe('GIF 的影格表（3.10）', () => {
  const opts = { light: false, typeSpeed: 45, popupWhen: 'after' as const, location: false };
  const delays = (t: TableFrame[]) => t.map((f) => f.delay);

  it('有名字的一頁：開場 6 格、每字一格、收尾 1 格、停留、最後一頁閃 3 次', () => {
    const t = frameTable([{ total: 10, hasName: true, popups: 0 }], [0], opts);
    expect(delays(t)).toEqual([
      ...Array(6).fill(60),
      ...Array(11).fill(45),
      60,
      700,
      300,
      450,
      300,
      450,
      300,
      450,
    ]);
    expect(t[0].clocks).toEqual({ reveal: 0, name: 0, loc: Infinity, pop: -1, blinkOn: true });
    expect(t[6].clocks).toMatchObject({ reveal: 0, name: 360 });
    expect(t[16].clocks).toMatchObject({ reveal: 10, name: 360 + 450 });
    expect(t[18].clocks).toEqual({ ...FULL_CLOCKS });
    expect(t[19].clocks.blinkOn).toBe(false);
  });

  it('字多時每格多打幾個字（最多 60 格）；最後一格不一定是全部的字，收尾補齊', () => {
    const t = frameTable([{ total: 130, hasName: false, popups: 0 }], [0], opts);
    /* c＝⌈130 ÷ 60⌉＝3，k＝0、3、…、129（44 格）；沒有名字也算名字剩下的時間（520 − 打字長度 < 0 → 0） */
    const typing = t.filter((f) => f.delay === 135);
    expect(typing).toHaveLength(44);
    expect(typing.at(-1)?.clocks.reveal).toBe(129);
    expect(t[44].clocks.reveal).toBe(130);
    expect(t[44].delay).toBe(60);
  });

  it('短的台詞：收尾含名字剩下的時間（即使沒有名字）', () => {
    const t = frameTable([{ total: 2, hasName: false, popups: 0 }], [0], opts);
    /* 打字 3 格；收尾＝520 − 90＝430 → t＝0…420（8 格） */
    expect(delays(t).slice(0, 3)).toEqual([45, 45, 45]);
    expect(t.slice(3, 11).every((f) => f.delay === 60)).toBe(true);
    expect(t[11].delay).toBe(700);
  });

  it('演出文字：打完之後從 0 開始、一起時從打字開始；收尾到演出文字做完', () => {
    const after = frameTable([{ total: 4, hasName: false, popups: 2 }], [0], opts);
    const tailAfter = after.filter((f) => f.delay === 60);
    /* 收尾＝popTotal(2)＝1890 → 0…1860（32 格） */
    expect(tailAfter).toHaveLength(32);
    expect(tailAfter[0].clocks.pop).toBe(0);
    expect(after.slice(0, 5).every((f) => f.clocks.pop === -1)).toBe(true);
    const withText = frameTable([{ total: 4, hasName: false, popups: 2 }], [0], {
      ...opts,
      popupWhen: 'with',
    });
    expect(withText[1].clocks.pop).toBe(45);
    const tailWith = withText.filter((f) => f.delay === 60);
    expect(tailWith).toHaveLength(Math.floor((1890 - 180) / 60) + 1);
    expect(tailWith[0].clocks.pop).toBe(180);
  });

  it('地點只在第一個做的頁；多頁時只有最後一頁閃 3 次', () => {
    const pages: PageInfo[] = [
      { total: 3, hasName: false, popups: 0 },
      { total: 3, hasName: false, popups: 0 },
    ];
    const t = frameTable(pages, [0, 1], { ...opts, location: true });
    const p0 = t.filter((f) => f.page === 0);
    const p1 = t.filter((f) => f.page === 1);
    expect(p0[0].clocks.loc).toBe(0);
    expect(p0.filter((f) => f.delay === 300)).toHaveLength(1);
    expect(p1.filter((f) => f.delay === 300)).toHaveLength(3);
    /* 第 2 頁沒有名字也沒有地點：沒有開場 */
    expect(p1[0].delay).toBe(45);
    expect(p1.every((f) => f.clocks.loc === Infinity)).toBe(true);
  });

  it('只做目前這一頁時也算「第一個」（有地點的開場）', () => {
    const pages: PageInfo[] = [
      { total: 3, hasName: false, popups: 0 },
      { total: 3, hasName: false, popups: 0 },
    ];
    const t = frameTable(pages, [1], { ...opts, location: true });
    expect(t[0].clocks.loc).toBe(0);
    expect(t[0].delay).toBe(60);
  });

  it('輕量：每格 100 ms、打字最多 18 格、每頁只閃一次', () => {
    const t = frameTable([{ total: 40, hasName: true, popups: 0 }], [0], { ...opts, light: true });
    expect(t.slice(0, 4).map((f) => f.delay)).toEqual([100, 100, 100, 100]);
    /* c＝⌈40 ÷ 18⌉＝3、每格 135 ms，k＝0…39（14 格） */
    expect(t.filter((f) => f.delay === 135)).toHaveLength(14);
    expect(t.filter((f) => f.delay === 300)).toHaveLength(1);
  });

  it('頁的資訊：演出文字只算最後一頁（每一頁都顯示時每頁都算）', () => {
    const s = { ...initialState(), dialogue: '@甲\na\n---\nbb', speaker: '', popups: '一\n二' };
    expect(pageInfos(s, ACCENT)).toEqual([
      { total: 1, hasName: true, popups: 0 },
      { total: 2, hasName: false, popups: 2 },
    ]);
    expect(pageInfos({ ...s, popupAll: true }, ACCENT)[0].popups).toBe(2);
  });
});

describe('背景圖的位置', () => {
  const img = { width: 1200, height: 900 };
  const out = { width: 816, height: 624 };

  it('看到的範圍：剛好蓋滿、放大時以中心縮小範圍、左上角夾在圖裡', () => {
    const c = viewCrop(img, out, { zoom: 1, x: 0, y: 0 });
    expect(c.height).toBe(900);
    expect(c.width).toBeCloseTo(1176.923, 3);
    const z = viewCrop(img, out, { zoom: 2, x: 0, y: 0 });
    expect(z.width).toBeCloseTo(c.width / 2, 9);
    expect(z.x).toBeCloseTo(c.x + c.width / 4, 9);
    const far = viewCrop(img, out, { zoom: 2, x: 10_000, y: -10_000 });
    expect(far.x).toBeCloseTo(1200 - far.width, 9);
    expect(far.y).toBe(0);
  });

  it('夾回範圍：位移換成實際看到的範圍', () => {
    const v = clampView(img, out, { zoom: 2, x: 10_000, y: 0 });
    expect(viewCrop(img, out, v)).toEqual(viewCrop(img, out, { zoom: 2, x: 10_000, y: 0 }));
    expect(v.x).toBeCloseTo(1200 - 1176.923 / 2 - (11.538 + 1176.923 / 4), 2);
    expect(clampView(img, out, { zoom: 9, x: 0, y: 0 }).zoom).toBe(4);
    expect(clampView(img, out, { zoom: 0.5, x: 0, y: 0 }).zoom).toBe(1);
  });

  it('拖曳：圖跟著指標移動（畫面 px 換成原圖 px）', () => {
    const from = { zoom: 2, x: 0, y: 0 };
    const v = panView(img, out, from, 100, 50);
    const k = viewCrop(img, out, from).width / 816;
    expect(v.x).toBeCloseTo(-100 * k, 9);
    expect(v.y).toBeCloseTo(-50 * k, 9);
  });

  it('縮放：位移不變，夾在 1～4', () => {
    expect(zoomView({ zoom: 2, x: 5, y: 6 }, 3)).toEqual({ zoom: 3, x: 5, y: 6 });
    expect(zoomView({ zoom: 2, x: 5, y: 6 }, 10).zoom).toBe(4);
  });
});

describe('輸出', () => {
  it('PNG 1～3 倍；動畫最多 2 倍；輕量寬最多 560', () => {
    expect(outputSize('4:3', 'png', 2)).toEqual({ width: 1632, height: 1248 });
    expect(outputSize('4:3', 'png', 3)).toEqual({ width: 2448, height: 1872 });
    expect(outputSize('4:3', 'gif', 3)).toEqual({ width: 1632, height: 1248 });
    expect(outputSize('4:3', 'gif-light', 3)).toEqual({ width: 560, height: 428 });
    expect(outputSize('16:9', 'gif-light', 1)).toEqual({ width: 560, height: 315 });
    expect(outputSize('1:1', 'gif-light', 1)).toEqual({ width: 560, height: 560 });
    expect(outputSize('9:16', 'gif-light', 1)).toEqual({ width: 560, height: 996 });
    expect(animScale(816, 1, false)).toBe(1);
  });

  it('檔名：rpg-screenshot-年月日-時分秒', () => {
    const d = new Date(2026, 9, 23, 14, 5, 9);
    expect(stamp(d)).toBe('20261023-140509');
    expect(exportFileName('png', d)).toBe('rpg-screenshot-20261023-140509.png');
    expect(exportFileName('gif', d)).toBe('rpg-screenshot-20261023-140509.gif');
    expect(exportFileName('gif-light', d)).toBe('rpg-screenshot-20261023-140509-light.gif');
    expect(exportFileName('apng', d)).toBe('rpg-screenshot-20261023-140509-anim.png');
    expect(exportFileName('webp', d)).toBe('rpg-screenshot-20261023-140509.webp');
  });
});

describe('整理存檔', () => {
  it('壞掉的資料換成預設、數值夾在範圍內並取整、打字速度對齊每格 5', () => {
    const s = normalizeState({
      pixelSize: 99,
      levels: 1.6,
      brightness: -80,
      tone: 'nope',
      theme: 'classic',
      typeSpeed: 47,
      nameColor: '#ABCDEF',
      dialogue: 5,
      face: { id: 'x', width: 0, height: 10 },
      bg: { id: 'b', name: 'a.png', width: 10, height: 20 },
      view: { zoom: 9, x: 'a', y: 3 },
    });
    expect(s.pixelSize).toBe(20);
    expect(s.levels).toBe(2);
    expect(s.brightness).toBe(-50);
    expect(s.tone).toBe('none');
    expect(s.theme).toBe('classic');
    expect(s.typeSpeed).toBe(45);
    expect(s.nameColor).toBe('#abcdef');
    expect(s.dialogue).toBe(initialState().dialogue);
    expect(s.face).toBeNull();
    expect(s.bg).toEqual({ id: 'b', name: 'a.png', width: 10, height: 20 });
    expect(s.view).toEqual({ zoom: 4, x: 0, y: 3 });
  });

  it('名字顏色：沒有這個欄位時用預設（跟著主題）；看不懂的色碼也是跟著主題', () => {
    expect(normalizeState({}).nameColor).toBeNull();
    expect(normalizeState({ nameColor: 'red' }).nameColor).toBeNull();
  });

  it('預設值與原作相同（台詞與說話者是新版的範例）', () => {
    const d = initialState();
    expect(d).toMatchObject({
      pixelSize: 6,
      levels: 8,
      dither: true,
      tone: 'none',
      scanline: true,
      vignette: true,
      ratio: '4:3',
      theme: 'galge',
      boxOpacity: 86,
      winPos: 'bottom',
      showWindow: true,
      showArrow: true,
      fontSize: 26,
      textFx: 'outline',
      nameStyle: 'pill',
      typeSpeed: 45,
      popupPos: 'tr',
      popupWhen: 'after',
      popupAll: false,
      faceSide: 'left',
      nameColor: null,
    });
    expect(normalizeState(d)).toEqual(d);
  });
});
