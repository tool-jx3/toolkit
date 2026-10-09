/**
 * 劇本文字產生器：資料的整理、小工具、原作專案檔的讀入（規格 2、5. D5）、效果差分的像素運算（3.5）。
 */
import { describe, expect, it } from 'vitest';
import { applyPixelEffect, blurGeometry, hasTransparentPixel } from '@/tools/scenario-text/effects';
import { fromDataUrl, isLegacyProject, readLegacyProject } from '@/tools/scenario-text/legacy';
import {
  baseName,
  cleanDoc,
  defaultDoc,
  isImageUrl,
  sizeText,
  snippet,
  stamp,
  urlImageName,
} from '@/tools/scenario-text/model';

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG_URL = `data:image/png;base64,${PNG_B64}`;
const GIF_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

describe('小工具', () => {
  it('名稱、網址、大小、摘要、時間', () => {
    expect(baseName('立繪.final.png')).toBe('立繪.final');
    expect(baseName('.png')).toBe('圖片');
    expect(urlImageName('https://example.com/a/%E9%91%B0%E5%8C%99.png?x=1')).toBe('鑰匙');
    expect(urlImageName('https://example.com/')).toBe('網址的圖片');
    expect(urlImageName('不是網址')).toBe('網址的圖片');
    expect(isImageUrl('https://a.b/c.png')).toBe(true);
    expect(isImageUrl('http://a.b/c.png')).toBe(false);
    expect(isImageUrl('https://a.b/c d.png')).toBe(false);
    expect(sizeText(100)).toBe('1 KB');
    expect(sizeText(1536)).toBe('2 KB');
    expect(sizeText(5 * 1024 * 1024 + 1)).toBe('5.0 MB');
    expect(snippet('  a\n\nb  ', 28)).toBe('a b');
    expect(snippet('一二三四五', 3)).toBe('一二三…');
    expect(stamp(new Date(2026, 0, 2, 3, 4))).toBe('20260102-0304');
  });
});

describe('整理（自動保存、專案檔）', () => {
  it('不是物件時預設；缺的欄位補預設；格式不對的項目丟掉', () => {
    expect(cleanDoc(null)).toEqual(defaultDoc());
    const d = cleanDoc({
      images: [
        { id: 'i', kind: 'file', name: 'a', asset: 'x', type: 'image/png', size: '12' },
        { id: 'u', kind: 'url', url: '' },
        { kind: 'file', asset: 'y' },
        'x',
      ],
      speakers: [{ name: '甲', faces: [{ label: '笑' }, 3] }],
      script: 5,
      opts: { mode: 'heading', unit: 'x', keepQuotes: 'yes', narratorName: 'GM' },
      edited: [{ kind: 'bad', title: 1, line: 0, image: '' }],
      confirmed: [{ mode: 'heading', entries: 'x' }, null],
    });
    expect(d.images).toEqual([
      { id: 'i', kind: 'file', name: 'a', credit: '', asset: 'x', type: 'image/png', size: 12 },
    ]);
    expect(d.speakers[0]).toMatchObject({ name: '甲', aliases: '', imageId: null });
    expect(d.speakers[0].faces.map((f) => f.label)).toEqual(['笑']);
    expect(d.script).toBe('5');
    expect(d.opts).toEqual({
      mode: 'heading',
      unit: 'line',
      style: 'auto',
      keepQuotes: true,
      narration: 'include',
      narratorName: 'GM',
      faceInTitle: false,
    });
    expect(d.edited).toEqual([
      {
        kind: 'narration',
        title: '1',
        text: '',
        speakerId: null,
        face: '',
        line: null,
        titleCustom: false,
        image: 'auto',
      },
    ]);
    expect(d.confirmed).toHaveLength(1);
    expect(d.confirmed[0]).toMatchObject({ mode: 'heading', entries: [], edited: false });
  });
});

describe('原作的專案檔（2、5. D5）', () => {
  it('data URL 解碼（MIME 依檔頭）', () => {
    const got = fromDataUrl(`data:application/octet-stream;base64,${PNG_B64}`);
    expect(got?.type).toBe('image/png');
    expect(got?.bytes.length).toBe(70);
    expect(fromDataUrl('data:,')).toBeNull();
    expect(fromDataUrl('x')).toBeNull();
  });

  it('認得原作的專案檔或 state，不認本站的專案檔', () => {
    expect(isLegacyProject({ tool: 'scenario-text-maker', state: {} })).toBe(true);
    expect(isLegacyProject({ speakers: [], script: '' })).toBe(true);
    expect(isLegacyProject({ format: 'trpg-toolkit-project', speakers: [], script: '' })).toBe(
      false,
    );
    expect(readLegacyProject({ hello: 1 })).toBeNull();
  });

  it('圖片庫的 data URL 圖、網址圖；舊格式說話者帶的圖搬進圖片庫（同一張只放一次）', () => {
    const r = readLegacyProject({
      tool: 'scenario-text-maker',
      version: 2,
      state: {
        images: [
          {
            id: 'i1',
            kind: 'file',
            name: '艾莉絲',
            type: 'image/png',
            size: 70,
            credit: '畫師',
            dataUrl: PNG_URL,
          },
          { id: 'i2', kind: 'url', name: '地圖', url: 'https://example.com/m.png' },
          { id: 'i3', kind: 'file', name: '沒有內容' },
        ],
        speakers: [
          { id: 's1', name: '艾莉絲', aliases: '', imageId: 'i1', faces: [] },
          {
            id: 's2',
            name: '鮑伯',
            aliases: '',
            image: { kind: 'file', dataUrl: GIF_URL, fileName: 'bob.gif' },
            faces: [
              {
                id: 'f1',
                label: '笑',
                image: { kind: 'file', dataUrl: GIF_URL, fileName: 'x.gif' },
              },
              { id: 'f2', label: '怒', image: { kind: 'url', url: 'https://example.com/m.png' } },
              {
                id: 'f3',
                label: '哭',
                image: { kind: 'url', url: 'https://example.com/%E5%93%AD.webp' },
              },
            ],
          },
        ],
        script: '艾莉絲「你好」',
        opts: { mode: 'script', faceInTitle: true },
        edited: [
          {
            kind: 'speaker',
            title: '艾莉絲',
            text: 'x',
            speakerId: 's1',
            face: '',
            line: '',
            image: 'i2',
          },
        ],
        confirmed: [],
      },
    });
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.files.map((f) => [f.id, f.type, f.bytes.length])).toEqual([
      ['i1', 'image/png', 70],
      [r.doc.speakers[1].imageId, 'image/gif', 42],
    ]);
    expect(r.doc.images.map((im) => [im.kind, im.name, im.credit])).toEqual([
      ['file', '艾莉絲', '畫師'],
      ['url', '地圖', ''],
      ['file', 'bob', ''],
      ['url', '哭', ''],
    ]);
    const bob = r.doc.speakers[1];
    expect(bob.faces[0].imageId).toBe(bob.imageId);
    expect(bob.faces[1].imageId).toBe('i2');
    expect(r.doc.opts.faceInTitle).toBe(true);
    expect(r.doc.edited?.[0]).toMatchObject({ line: null, image: 'i2' });
  });
});

describe('效果差分的像素運算（3.5）', () => {
  const px = () => new Uint8ClampedArray([200, 100, 50, 255, 10, 20, 30, 128]);
  it('剪影：顏色變黑、透明度不變', () => {
    const a = px();
    applyPixelEffect(a, 'silhouette');
    expect([...a]).toEqual([0, 0, 0, 255, 0, 0, 0, 128]);
  });
  it('懷舊（CSS sepia(1)）、黑白（CSS grayscale(1)）、半透明', () => {
    const s = px();
    applyPixelEffect(s, 'sepia');
    expect([...s.slice(0, 4)]).toEqual([165, 147, 114, 255]);
    const m = px();
    applyPixelEffect(m, 'mono');
    expect([...m.slice(0, 4)]).toEqual([118, 118, 118, 255]);
    const g = px();
    applyPixelEffect(g, 'ghost');
    expect([...g]).toEqual([200, 100, 50, 128, 10, 20, 30, 64]);
  });
  it('透明背景的判斷、模糊的邊與半徑', () => {
    expect(hasTransparentPixel(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 250]))).toBe(false);
    expect(hasTransparentPixel(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 249]))).toBe(true);
    expect(blurGeometry(100, 300)).toEqual({ pad: 8, radius: 2 });
    expect(blurGeometry(1000, 2000)).toEqual({ pad: 50, radius: 13 });
  });
});
