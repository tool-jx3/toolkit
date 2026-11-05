/**
 * 證件與票券產生器 2026-11-05 的追加（規格 F87～F95、D41～D46）：看起來像的碼的決定性、晶片、日期格式、卡片效果、
 * 數位證件的版面、名字產生器（離線語料）、預設集的整理與檔案、讀檔（資料版本 2 照讀）、證件的浮水印與裝飾圖。
 */
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/names';
import {
  ID_WATERMARK_TEXT,
  initialIdDecor,
  initialState,
  normalizeIdDecor,
  normalizeState,
  stateAssetIds,
} from '@/tools/id-ticket/model';
import { drawIdFace, idHasGround } from '@/tools/id-ticket/render';
import { chipShapes, SF_CHIP_TYPES } from '@/tools/id-ticket/sf/chips';
import {
  ean13,
  isLookalikeCode,
  isScannableCode,
  isSquareCode,
  lookalikeShapes,
  SF_CODE_TYPES,
} from '@/tools/id-ticket/sf/codes';
import { formatSfDate, formatYmd, parseSfDate, SF_DATE_FORMATS } from '@/tools/id-ticket/sf/dates';
import {
  DIGITAL_MARGIN,
  digitalBackdrop,
  digitalCardOffset,
  digitalLayout,
  digitalTint,
} from '@/tools/id-ticket/sf/digital';
import { glowBlur, grainPixels, SF_FX_DEFAULT } from '@/tools/id-ticket/sf/fx';
import { defaultSfStyle, initialSf, normalizeSf } from '@/tools/id-ticket/sf/model';
import { generateSfName } from '@/tools/id-ticket/sf/namegen';
import { SF_NAME_REGIONS } from '@/tools/id-ticket/sf/names';
import {
  applyExample,
  normalizePresets,
  PresetFileError,
  parsePresetFile,
  presetAssetIds,
  presetFileJson,
  SF_EXAMPLES,
  SF_PRESET_MAX,
} from '@/tools/id-ticket/sf/presets';
import { sfCodeDensity, sfFileName, sfPixels, sfSize } from '@/tools/id-ticket/sf/render';
import { recordCanvas } from '../helpers/canvasRecorder';

const BOX = { x: 10, y: 20, w: 300, h: 100 };

describe('看起來像的碼（F87）', () => {
  it('種類：Code 128、QR code 掃得出來；QR code、點碼是方形；其他 4 種看起來像', () => {
    expect(SF_CODE_TYPES).toEqual(['barcode', 'qr', 'ean13', 'postal', 'stacked', 'dots']);
    expect(SF_CODE_TYPES.filter(isScannableCode)).toEqual(['barcode', 'qr']);
    expect(SF_CODE_TYPES.filter(isSquareCode)).toEqual(['qr', 'dots']);
    expect(SF_CODE_TYPES.filter(isLookalikeCode)).toEqual(['ean13', 'postal', 'stacked', 'dots']);
  });

  it('同一個編號每次畫的一樣，換了編號就換一組（4 種）', () => {
    for (const t of ['ean13', 'postal', 'stacked', 'dots'] as const) {
      const a = JSON.stringify(lookalikeShapes(t, BOX, 'MP-2087-0413'));
      expect(JSON.stringify(lookalikeShapes(t, BOX, 'MP-2087-0413')), t).toBe(a);
      expect(JSON.stringify(lookalikeShapes(t, BOX, 'MP-2087-0414')), t).not.toBe(a);
    }
  });

  it('EAN-13：編號裡的數字＋補足、檢查碼對、95 個模組；高 ≥ 80 時下面 1＋6＋6 位數字、護線比較長', () => {
    const e = ean13('MP-2087-0413');
    expect(e.digits).toHaveLength(13);
    expect(e.digits.startsWith('20870413')).toBe(true);
    const d = [...e.digits].map(Number);
    const sum = d.slice(0, 12).reduce((a, v, i) => a + v * (i % 2 ? 3 : 1), 0);
    expect((10 - (sum % 10)) % 10).toBe(d[12]);
    expect(e.run.reduce((a, r) => a + r.w, 0)).toBe(95);
    expect(e.run.filter((r) => r.guard).length).toBe(11);
    const shapes = lookalikeShapes('ean13', BOX, 'MP-2087-0413');
    const texts = shapes.filter((s) => s.kind === 'text');
    expect(texts.map((t) => (t.kind === 'text' ? t.text : '')).join('')).toBe(e.digits);
    const bars = shapes.filter((s) => s.kind === 'rect');
    const hs = new Set(bars.map((b) => (b.kind === 'rect' ? Math.round(b.h) : 0)));
    expect(hs.size).toBe(2);
    for (const b of bars) if (b.kind === 'rect') expect(b.x + b.w).toBeLessThanOrEqual(310 + 1e-9);
    /* 矮的時候沒有字 */
    expect(lookalikeShapes('ean13', { ...BOX, h: 60 }, 'X').some((s) => s.kind === 'text')).toBe(
      false,
    );
  });

  it('四態郵政：24～65 條、頭尾全高；每條是全高、上 2/3、下 2/3 或中間 1/3', () => {
    const shapes = lookalikeShapes('postal', BOX, 'A1');
    expect(shapes.length).toBeGreaterThanOrEqual(24);
    expect(shapes.length).toBeLessThanOrEqual(65);
    const t = BOX.h / 3;
    const kinds = new Set<string>();
    for (const s of shapes) {
      if (s.kind !== 'rect') throw new Error('postal 只有矩形');
      kinds.add(`${Math.round(s.y - BOX.y)}:${Math.round(s.h)}`);
    }
    expect(
      [...kinds].every((k) =>
        ['0:100', '0:67', `${Math.round(t)}:67`, `${Math.round(t)}:33`].includes(k),
      ),
    ).toBe(true);
    const first = shapes[0];
    const last = shapes[shapes.length - 1];
    expect(first.kind === 'rect' && first.h).toBe(BOX.h);
    expect(last.kind === 'rect' && last.h).toBe(BOX.h);
  });

  it('堆疊式：3～6 列，每列的條塞滿寬度、起始與結束的圖樣排成直條', () => {
    const shapes = lookalikeShapes('stacked', BOX, 'A1');
    const rows = new Map<number, number[]>();
    for (const s of shapes) if (s.kind === 'rect') rows.set(s.y, [...(rows.get(s.y) ?? []), s.x]);
    expect(rows.size).toBeGreaterThanOrEqual(3);
    expect(rows.size).toBeLessThanOrEqual(6);
    const firsts = [...rows.values()].map((xs) => xs[0]);
    expect(new Set(firsts.map((x) => x.toFixed(6))).size).toBe(1);
  });

  it('點碼：15 × 15 的格子，四個角一定有點', () => {
    const b = { x: 0, y: 0, w: 150, h: 150 };
    const dots = lookalikeShapes('dots', b, 'A1');
    const at = (i: number, j: number) =>
      dots.some((d) => d.kind === 'dot' && d.cx === (i + 0.5) * 10 && d.cy === (j + 0.5) * 10);
    expect(at(0, 0) && at(14, 0) && at(0, 14) && at(14, 14)).toBe(true);
    expect(dots.every((d) => d.kind === 'dot' && Math.abs(d.r - 4) < 1e-9)).toBe(true);
  });

  it('看起來像的碼不提醒太密（掃不出編號）', () => {
    const sf = { ...initialSf(), style: { ...defaultSfStyle(), code: 'stacked' as const } };
    expect(sfCodeDensity(sf, { kind: 'code', w: 50 }, 1)).toBeNull();
  });
});

describe('晶片（F88）', () => {
  const b = { x: 100, y: 200, w: 160, h: 160 };
  it('6 種，每一種都在方框裡、第一塊是強調色的板子（處理器封裝是接腳在先）', () => {
    expect(SF_CHIP_TYPES).toEqual(['contact', 'emv', 'die', 'coil', 'jack', 'hex']);
    for (const t of SF_CHIP_TYPES) {
      const shapes = chipShapes(t, b);
      expect(shapes.length, t).toBeGreaterThan(4);
      const pts = shapes.flatMap((s) => [
        ...(s.poly ?? []),
        ...(s.line ?? []),
        ...(s.circle ? [[s.circle[0], s.circle[1]] as const] : []),
      ]);
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(b.x - 1e-9);
        expect(x).toBeLessThanOrEqual(b.x + b.w + 1e-9);
        expect(y).toBeGreaterThanOrEqual(b.y - 1e-9);
        expect(y).toBeLessThanOrEqual(b.y + b.h + 1e-9);
      }
      expect(
        shapes.some((s) => s.fill === 'accent'),
        t,
      ).toBe(true);
    }
  });

  it('ISO 接觸式和以前一樣：左上、右下切角的 6 點板子＋6 條線＋晶片窗', () => {
    const s = chipShapes('contact', b);
    const P = (u: number, v: number) => [b.x + u * b.w, b.y + v * b.h];
    const c = 0.0875;
    expect(s[0].poly).toEqual([P(c, 0), P(1, 0), P(1, 1 - c), P(1 - c, 1), P(0, 1), P(0, c)]);
    expect(s.filter((x) => x.line).length).toBe(6);
    expect(s[7].poly).toHaveLength(4);
  });
});

describe('日期格式（F89）', () => {
  const t = { y: 2077, m: 10, d: 31 };
  it('6 種格式（照原作的例子）', () => {
    expect(SF_DATE_FORMATS.map((f) => formatYmd(t, f))).toEqual([
      '2077-10-31',
      '31.10.2077',
      '10/31/2077',
      '31 OCT 2077',
      '31OCT77',
      '20771031',
    ]);
  });
  it('預設照打的印；其他格式認 / . 分隔與 1～2 位的月日；不是日期的照打的', () => {
    expect(formatSfDate('2061-8-4', 'iso')).toBe('2061-8-4');
    expect(formatSfDate('2061/8/4', 'dmy')).toBe('04.08.2061');
    expect(formatSfDate('2061.12.01', 'icao')).toBe('01DEC61');
    expect(formatSfDate('UNKNOWN', 'dmon')).toBe('UNKNOWN');
    expect(formatSfDate('2061-13-01', 'compact')).toBe('2061-13-01');
    expect(parseSfDate(' 2093-12-31 ')).toEqual({ y: 2093, m: 12, d: 31 });
  });
});

describe('卡片效果與數位證件（F90、F91）', () => {
  it('效果預設都關；光暈的模糊＝強度 × 60 × 倍率', () => {
    expect(SF_FX_DEFAULT).toMatchObject({ glow: false, grain: false, scan: false });
    expect(glowBlur(40, 2)).toBeCloseTo(48);
  });
  it('顆粒的圖塊是固定的（種子 1337）：墨色、大約一半透明', () => {
    const a = grainPixels('#050507');
    expect(grainPixels('#050507')).toEqual(a);
    let clear = 0;
    for (let p = 3; p < a.length; p += 4) if (!a[p]) clear++;
    expect(clear / (a.length / 4)).toBeGreaterThan(0.45);
    expect(clear / (a.length / 4)).toBeLessThan(0.56);
    expect([a[0], a[1], a[2]]).toEqual([5, 5, 7]);
  });
  it('場景：四周留白（單位＝卡片短邊 ÷ 640）；卡片放在整數像素', () => {
    const l = digitalLayout(1600, 1010);
    const u = 1010 / 640;
    expect(l.u).toBeCloseTo(u);
    expect(l.w).toBeCloseTo(1600 + 2 * DIGITAL_MARGIN.side * u);
    expect(l.h).toBeCloseTo(1010 + (DIGITAL_MARGIN.top + DIGITAL_MARGIN.bottom) * u);
    expect(digitalCardOffset(l, 2)).toEqual({
      x: Math.round(l.x * 2),
      y: Math.round(l.y * 2),
    });
  });
  it('背景與顏色：夜色；自己的顏色往暗 45%；強調色看得清楚才用，否則青色／近黑', () => {
    expect(digitalBackdrop(null)).toEqual(['#0a0d16', '#030307']);
    expect(digitalBackdrop('#ff6b6b')).toEqual(['#ff6b6b', '#733030']);
    expect(digitalTint(null, '#ff1a2e', '#050507')).toBe('255,26,46');
    expect(digitalTint(null, '#050507', '#111111')).toBe('0,240,255');
    expect(digitalTint('#e8e4d8', '#ffffff', '#050507')).toBe('5,5,7');
  });
  it('開了數位證件：輸出變大、檔名加 -digital；卡片的位置', () => {
    const s = { ...initialSf(), style: { ...defaultSfStyle(), digital: true } };
    const z = sfSize(s, 'none');
    expect(z.x).toBeGreaterThan(0);
    expect(sfPixels(s, 1, 'none').width).toBe(Math.round(z.w));
    expect(sfFileName(s, 2)).toBe('sf-citizen-digital-2x.png');
    expect(sfFileName(initialSf(), 2)).toBe('sf-citizen-2x.png');
  });
});

describe('名字產生器（F92）', () => {
  it('每個地區都產生大寫的名與姓；日本、韓國、俄羅斯是英文字母，台灣是中文', async () => {
    for (const region of SF_NAME_REGIONS) {
      const n = await generateSfName(region, 'f', seededRandom(`t-${region}`));
      expect(n.gender).toBe('f');
      expect(n.given, region).toBeTruthy();
      expect(n.given).toBe(n.given.toLocaleUpperCase('en'));
      if (['jp', 'kr', 'ru', 'west'].includes(region)) {
        expect(n.given, region).toMatch(/^[A-Z' -]+$/);
        expect(n.surname, region).toMatch(/^[A-Z' -]+$/);
      }
      if (region === 'tw') expect(n.given + n.surname).toMatch(/\p{Script=Han}/u);
    }
  });
  it('同樣的亂數每次一樣；性別不限時也決定一個', async () => {
    const a = await generateSfName('any', 'any', seededRandom('x'));
    const b = await generateSfName('any', 'any', seededRandom('x'));
    expect(a).toEqual(b);
    expect(['m', 'f']).toContain(a.gender);
  });
});

describe('讀檔與預設集（F94、3.6）', () => {
  it('資料版本 2 的 SF 證件：新的樣式補預設；壞的值換回預設', () => {
    const s = normalizeSf({
      style: { code: 'qr', chipType: 'nope', dateFmt: 'dmy', glowAmt: 999 },
    });
    expect(s.style.code).toBe('qr');
    expect(s.style.chipType).toBe('contact');
    expect(s.style.dateFmt).toBe('dmy');
    expect(s.style.glowAmt).toBe(100);
    expect(s.style.digital).toBe(false);
    expect(s.style.digitalBg).toBeNull();
    expect(normalizeSf({ style: { digitalBg: 'red' } }).style.digitalBg).toBeNull();
    expect(normalizeSf({ style: { digitalBg: '#ABCDEF' } }).style.digitalBg).toBe('#abcdef');
  });

  it('預設的整理：沒有名字、壞掉的丟掉；id 重複換新的；最多 30 個', () => {
    const sf = initialSf();
    const list = normalizePresets([
      { id: 'a', name: '  一  ', sf },
      { id: 'a', name: '二', sf },
      { name: '', sf },
      { id: 'c', name: '三' },
      ...Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, name: `n${i}`, sf })),
    ]);
    expect(list[0].name).toBe('一');
    expect(list[1].id).not.toBe('a');
    expect(list).toHaveLength(SF_PRESET_MAX);
  });

  it('匯出、匯入：圖片內嵌（資產 id → data URL）、格式不對時說明', () => {
    const sf = {
      ...initialSf(),
      photo: {
        image: { id: 'abc', name: 'p.png', width: 10, height: 10 },
        place: { zoom: 1, x: 0, y: 0, turns: 0 },
      },
    };
    const list = normalizePresets([{ id: 'p', name: '我的', savedAt: 5, sf }]);
    expect(presetAssetIds(list)).toEqual(['abc']);
    const json = presetFileJson(list, { abc: 'data:image/png;base64,AAAA' });
    const msg = { notJson: 'notJson', wrong: 'wrong', empty: 'empty' };
    const back = parsePresetFile(json, msg);
    expect(back.presets[0].name).toBe('我的');
    expect(back.presets[0].sf).toEqual(list[0].sf);
    expect(back.images).toEqual({ abc: 'data:image/png;base64,AAAA' });
    expect(() => parsePresetFile('{', msg)).toThrow(PresetFileError);
    expect(() => parsePresetFile('{"format":"x"}', msg)).toThrow('wrong');
  });

  it('範例：每一款一個、讀檔整理後不變；套用時留著目前的圖', () => {
    expect(SF_EXAMPLES.map((e) => e.sf.blank)).toEqual([
      'event',
      'citizen',
      'license',
      'operator',
      'pass',
    ]);
    for (const e of SF_EXAMPLES) expect(normalizeSf(e.sf)).toEqual(e.sf);
    const cur = {
      ...initialSf(),
      photo: {
        image: { id: 'abc', name: 'p.png', width: 10, height: 10 },
        place: { zoom: 1, x: 0, y: 0, turns: 0 },
      },
    };
    const got = applyExample(cur, SF_EXAMPLES[2].sf);
    expect(got.photo).toEqual(cur.photo);
    expect(got.blank).toBe('license');
  });
});

describe('證件的浮水印與裝飾圖（F95）', () => {
  it('資料版本 2 沒有 idDecor：補預設（浮水印關、沒有裝飾圖）', () => {
    const s = normalizeState({ kind: 'id' });
    expect(s.idDecor).toEqual(initialIdDecor());
    expect(s.idDecor.watermark.text).toBe(ID_WATERMARK_TEXT);
    expect(idHasGround(s, 'front')).toBe(false);
  });

  it('讀檔整理：每一款每一面的裝飾圖、印在哪一面、用到的圖', () => {
    const el = {
      id: 'e1',
      image: { id: 'img1', name: 'a.png', width: 50, height: 40 },
      x: 0.5,
      y: 0.5,
      size: 0.3,
      alpha: 100,
      tint: true,
      thr: 0,
      crop: { x: 0, y: 0, w: 1, h: 1 },
    };
    const d = normalizeIdDecor({
      side: 'back',
      watermark: { mode: 'image', image: { id: 'wm', name: 'w.png', width: 9, height: 9 } },
      elements: { employee: { front: [el], back: [{ ...el, id: 'e1' }, { bad: 1 }] }, nope: {} },
    });
    expect(d.side).toBe('back');
    expect(d.elements.employee.front).toHaveLength(1);
    expect(d.elements.employee.back).toHaveLength(1);
    expect(d.elements.employee.back[0].id).not.toBe('e1');
    expect(normalizeIdDecor({ side: 'top' }).side).toBe('both');
    const s = { ...initialState(), idDecor: d };
    expect(stateAssetIds(s)).toEqual(expect.arrayContaining(['wm', 'img1']));
    expect(idHasGround(s, 'front')).toBe(true);
  });

  it('浮水印只畫在選的那一面（印在「背面」時正面照以前畫）', () => {
    const base = initialState();
    const on = {
      ...base,
      idDecor: {
        ...base.idDecor,
        side: 'back' as const,
        watermark: { ...base.idDecor.watermark, mode: 'text' as const },
      },
    };
    expect(idHasGround(on, 'front')).toBe(false);
    expect(idHasGround(on, 'back')).toBe(true);
    const draw = (s: typeof base, side: 'front' | 'back') => {
      const r = recordCanvas(400, 600);
      const ctx = r.ctx as unknown as Record<string, unknown>;
      const proxy = new Proxy(ctx, {
        get(t, k) {
          if (k === 'getTransform')
            return () => {
              const m = (t.getTransform as () => Record<string, number>)();
              const self = {
                ...m,
                inverse: () => self,
                multiply: () => self,
              };
              return self;
            };
          return t[k as string];
        },
        set(t, k, v) {
          t[k as string] = v;
          return true;
        },
      }) as unknown as CanvasRenderingContext2D;
      drawIdFace(proxy, s, side, { preview: false, photo: null });
      return JSON.stringify(r.log);
    };
    expect(draw(on, 'front')).toBe(draw(base, 'front'));
    const back = draw(on, 'back');
    expect(back).not.toBe(draw(base, 'back'));
    /* 字距不是 0：一個字一個字畫 */
    for (const c of ID_WATERMARK_TEXT.replace(/\s/g, '')) expect(back).toContain(`"${c}"`);
  });
});
