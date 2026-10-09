/**
 * 刮刮卡產生器（scratch-card）：內容的整理（自動儲存、專案檔讀回）、文字與網址的規則、
 * 原作設定檔（scratch_ticket_config.json）的讀入規則（規格 2.、3.9、3.10）。
 */
import { describe, expect, it } from 'vitest';
import {
  cleanColor,
  cleanImageRef,
  cleanImageUrl,
  initialState,
  multiLine,
  normalizeState,
  oneLine,
  sentenceList,
  urlImageName,
} from '@/tools/scratch-card/model';
import { addNotice } from '@/tools/scratch-card/notices';
import { applyLegacyConfig, isLegacyConfig } from '@/tools/scratch-card/project';

describe('預設值', () => {
  it('350 × 180、隨機圖示 3 個、塗層「刮刮看！」#9ca3af、筆刷 35、5 句範例', () => {
    const s = initialState(1);
    expect(s).toMatchObject({
      expert: false,
      fixedSeed: false,
      seed: 1,
      width: 350,
      height: 180,
      bgColor: '#ffffff',
      bgFit: 'cover',
      zone: { x: 20, y: 20, w: 310, h: 140 },
      titleText: '',
      titleColor: '#1f2937',
      titleSize: 18,
      titlePos: 'tc',
      coverText: '刮刮看！',
      coverColor: '#9ca3af',
      brush: 35,
      kind: 'icons',
      count: 3,
      coverShape: 'zone',
      sentenceSize: 28,
      sentenceColor: '#1f2937',
      imageSize: 80,
      imageStyle: 'rounded',
      trim: false,
      images: [],
    });
    expect(sentenceList(s.sentences)).toHaveLength(5);
  });

  it('沒有種子時隨機（0～999,999）', () => {
    const s = initialState();
    expect(Number.isInteger(s.seed)).toBe(true);
    expect(s.seed).toBeGreaterThanOrEqual(0);
    expect(s.seed).toBeLessThan(1_000_000);
  });
});

describe('整理（normalizeState）', () => {
  it('壞掉的、缺的欄位用預設；數值夾到範圍；選項不認得時用預設', () => {
    const s = normalizeState({
      expert: 'yes',
      width: 5000,
      height: 10,
      zone: { x: -5, y: 'abc', w: 0, h: 99999 },
      brush: 3,
      count: 11.6,
      kind: 'video',
      coverShape: 'star',
      imageStyle: 'contain',
      titlePos: 'xx',
      bgColor: '#ABC',
      coverColor: 'red',
      seed: 12.4,
    });
    expect(s.expert).toBe(false);
    expect(s.width).toBe(1200);
    expect(s.height).toBe(60);
    expect(s.zone).toEqual({ x: 0, y: 20, w: 1, h: 1200 });
    expect(s.brush).toBe(10);
    expect(s.count).toBe(10);
    expect(s.kind).toBe('icons');
    expect(s.coverShape).toBe('zone');
    expect(s.imageStyle).toBe('contain');
    expect(s.titlePos).toBe('tc');
    expect(s.bgColor).toBe('#aabbcc');
    expect(s.coverColor).toBe('#9ca3af');
    expect(s.seed).toBe(12);
  });

  it('文字截到上限、單行欄位的換行換成空白；壞掉的圖片丟掉、最多 30 張', () => {
    const s = normalizeState({
      coverText: 'a\nb'.padEnd(40, 'x'),
      titleText: '一\r\n二',
      sentences: 'x'.repeat(6000),
      images: [
        ...Array.from({ length: 35 }, (_, i) => ({
          kind: 'url',
          url: `https://e.com/${i}.png`,
          name: '',
        })),
      ],
    });
    expect(s.coverText).toBe('a b'.padEnd(30, 'x'));
    expect(s.titleText).toBe('一  二');
    expect(s.sentences).toHaveLength(5000);
    expect(s.images).toHaveLength(30);
    expect(s.images[0]).toEqual({ kind: 'url', url: 'https://e.com/0.png', name: '0.png' });
    expect(
      normalizeState({ images: [{ kind: 'url', url: 'javascript:alert(1)' }, 5, null] }).images,
    ).toEqual([]);
  });

  it('圖片參照：上傳的圖要有合法的 id；網址只收 http(s)', () => {
    expect(
      cleanImageRef({ kind: 'asset', id: 'a1b2', name: 'x.png', width: 10, height: 20 }),
    ).toEqual({ kind: 'asset', id: 'a1b2', name: 'x.png', width: 10, height: 20 });
    expect(cleanImageRef({ kind: 'asset', id: '../x' })).toBeNull();
    expect(cleanImageRef({ kind: 'url', url: 'data:image/png;base64,AAAA' })).toBeNull();
  });
});

describe('文字與網址', () => {
  it('單行、多行', () => {
    expect(oneLine('a\tb\nc', 10)).toBe('a b c');
    expect(oneLine('😀😀😀', 2)).toBe('😀😀');
    expect(multiLine('a\r\nb\rc', 10)).toBe('a\nb\nc');
  });

  it('句子清單：一行一句，空白行不算', () => {
    expect(sentenceList('甲\n\n乙\n \n丙')).toEqual(['甲', '乙', '丙']);
    expect(sentenceList('')).toEqual([]);
  });

  it('圖片網址：只收 http、https；名稱是最後一段', () => {
    expect(cleanImageUrl('  https://example.com/a/b.png  ')).toBe('https://example.com/a/b.png');
    expect(cleanImageUrl('http://x.y/z')).toBe('http://x.y/z');
    expect(cleanImageUrl('javascript:alert(1)')).toBeNull();
    expect(cleanImageUrl('ftp://x.y/z.png')).toBeNull();
    expect(cleanImageUrl('https://')).toBeNull();
    expect(cleanImageUrl(`https://e.com/${'a'.repeat(2000)}`)).toBeNull();
    expect(urlImageName('https://e.com/img/%E5%9C%96.png?x=1')).toBe('圖.png');
    expect(urlImageName('https://e.com/')).toBe('e.com');
  });

  it('顏色', () => {
    expect(cleanColor('#ABCDEF', '#000000')).toBe('#abcdef');
    expect(cleanColor('#abc', '#000000')).toBe('#aabbcc');
    expect(cleanColor('#abcdef80', '#000000')).toBe('#000000');
    expect(cleanColor(12, '#000000')).toBe('#000000');
  });
});

describe('原作的設定檔（3.10）', () => {
  const upstream = {
    isExpertMode: true,
    seed: '4242',
    useCustomSeed: true,
    width: '400',
    height: '200',
    ticketBgColor: '#fef3c7',
    ticketBgImageDataUrl: null,
    ticketBgSize: 'contain',
    zoneX: '10',
    zoneY: '0',
    zoneW: '380',
    zoneH: '150',
    titleText: '[寶物]',
    titleColor: '#ff0000',
    titleSize: '22',
    titlePos: 'br',
    scratchText: '긁어 보세요!',
    color: '#000000',
    brush: '50',
    type: 'image-icon',
    iconCount: '4',
    coverType: 'individual-circle',
    sentences: 'A\nB',
    sentenceSize: '30',
    sentenceColor: '#123456',
    imageIconSize: '64',
    imageIconStyle: 'rect-flat',
    trimTransparent: true,
    imagePool: ['https://example.com/a.png', 'not a url'],
  };

  it('認得原作的檔；本站的專案檔、其他 JSON 不算', () => {
    expect(isLegacyConfig(upstream)).toBe(true);
    expect(isLegacyConfig({ scratchText: 'x' })).toBe(true);
    expect(isLegacyConfig({ format: 'trpg-toolkit-project', scratchText: 'x' })).toBe(false);
    expect(isLegacyConfig({ hello: 1 })).toBe(false);
    expect(isLegacyConfig([1])).toBe(false);
  });

  it('每個欄位照原作的規則套用；自己指定種子時用檔案的種子', async () => {
    const r = await applyLegacyConfig(initialState(1), upstream);
    expect(r.state).toMatchObject({
      expert: true,
      fixedSeed: true,
      seed: 4242,
      width: 400,
      height: 200,
      bgColor: '#fef3c7',
      bgImage: null,
      bgFit: 'contain',
      zone: { x: 10, y: 0, w: 380, h: 150 },
      titleText: '[寶物]',
      titleColor: '#ff0000',
      titleSize: 22,
      titlePos: 'br',
      coverText: '긁어 보세요!',
      coverColor: '#000000',
      brush: 50,
      kind: 'image-icon',
      count: 4,
      coverShape: 'circle',
      sentences: 'A\nB',
      sentenceSize: 30,
      sentenceColor: '#123456',
      imageSize: 64,
      imageStyle: 'square',
      trim: true,
      images: [{ kind: 'url', url: 'https://example.com/a.png', name: 'a.png' }],
    });
    expect(r.failed).toBe(1);
    expect(r.dropped).toBe(0);
  });

  it('沒有值的欄位保留目前的值（原作 `if (c.width)`）；沒有自己指定種子時隨機', async () => {
    const cur = { ...initialState(77), width: 500, sentences: '目前', coverText: '目前' };
    const r = await applyLegacyConfig(cur, {
      scratchText: '',
      width: '',
      sentences: '',
      titleText: '',
      useCustomSeed: false,
      seed: '77',
    });
    expect(r.state.width).toBe(500);
    expect(r.state.sentences).toBe('目前');
    expect(r.state.coverText).toBe('目前');
    expect(r.state.titleText).toBe('');
    expect(r.state.fixedSeed).toBe(false);
  });

  it('自己指定種子而且檔案沒有種子時用目前的種子；種子不是數字時隨機', async () => {
    const cur = { ...initialState(321), fixedSeed: true };
    expect((await applyLegacyConfig(cur, { scratchText: 'x' })).state.seed).toBe(321);
    const r = await applyLegacyConfig(cur, { scratchText: 'x', seed: 'abc' });
    expect(r.state.seed).not.toBe(321);
  });

  it('數值夾到範圍；不認得的選項不變；讀不了的背景圖算失敗；超過 30 張的不要', async () => {
    const r = await applyLegacyConfig(initialState(1), {
      scratchText: 'x',
      width: '99999',
      brush: '1',
      type: 'video',
      titlePos: 'zz',
      ticketBgImageDataUrl: 'https://example.com/bg.png',
      imagePool: Array.from({ length: 33 }, (_, i) => `https://e.com/${i}.png`),
    });
    expect(r.state.width).toBe(1200);
    expect(r.state.brush).toBe(10);
    expect(r.state.kind).toBe('icons');
    expect(r.state.titlePos).toBe('tc');
    expect(r.state.images).toHaveLength(30);
    expect(r.dropped).toBe(3);
    expect(r.failed).toBe(1);
  });

  it('data URL 解不開時算讀不了，其他照常', async () => {
    const r = await applyLegacyConfig(initialState(1), {
      imagePool: ['data:image/png;base64,AAAA', 'https://e.com/ok.png'],
    });
    expect(r.failed).toBe(1);
    expect(r.state.images.map((i) => i.kind)).toEqual(['url']);
  });
});

describe('加入圖片的通知（同一批合成一則）', () => {
  it('全部成功：成功色', () => {
    expect(addNotice({ added: 2, notImages: [], failed: [], over: 0, notSaved: false })).toEqual({
      title: '已加入 2 張圖片。',
      tone: 'success',
    });
  });
  it('部分有問題：警告色，問題寫在說明', () => {
    expect(
      addNotice({ added: 1, notImages: ['a.txt'], failed: ['b.png'], over: 2, notSaved: true }),
    ).toEqual({
      title: '已加入 1 張圖片。',
      description:
        '不是圖片：a.txt。讀不了：b.png。圖片最多 30 張，有 2 張沒有加入。瀏覽器空間不足或無法存檔，圖片這次可以用，但重新整理後就不見了。',
      tone: 'warning',
    });
  });
  it('一張都沒加：錯誤色，第一個問題當標題；什麼都沒有時不通知', () => {
    expect(
      addNotice({ added: 0, notImages: ['a.txt'], failed: [], over: 0, notSaved: false }),
    ).toEqual({ title: '不是圖片：a.txt。', description: undefined, tone: 'danger' });
    expect(addNotice({ added: 0, notImages: [], failed: [], over: 0, notSaved: false })).toBeNull();
  });
  it('背景圖', () => {
    expect(
      addNotice({
        added: 1,
        notImages: [],
        failed: [],
        over: 0,
        notSaved: false,
        background: true,
      }),
    ).toEqual({ title: '已換上背景圖。', tone: 'success' });
  });
});
