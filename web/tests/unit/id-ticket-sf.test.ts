/**
 * 證件與票券產生器的 SF 證件與 2026-10-30 的追加（規格 1.11～1.16、D23～D40）：
 * 機讀區（ICAO 9303 TD2＋檢查碼）、DNA 條的決定性、照片效果、裝飾圖的單色遮罩、掛繩孔與掛繩的幾何、
 * 編號與日期的產生、讀檔整理（資料版本 1 照讀）。
 */
import { describe, expect, it } from 'vitest';
import { code128Modules, code128Widths } from '@/tools/id-ticket/code128';
import {
  ID_STRAP_MM,
  ID_STRAP_U,
  idSlot,
  idSlot as idSlotOf,
  idStrapPixels,
  LANYARD_MODES,
  lanyardHole,
  lanyardStrap,
  SF_CARD_TOP,
  SF_SLOTS,
  strapGeometry,
} from '@/tools/id-ticket/lanyard';
import {
  generateCode,
  generateDate,
  initialState,
  normalizeState,
  stateAssetIds,
} from '@/tools/id-ticket/model';
import {
  ditherMask,
  halftoneDots,
  inkIsLighter,
  monoMask,
  normalizePhotoFx,
  photoLuma,
} from '@/tools/id-ticket/photofx';
import { SF_BLANKS, SF_SERIALS, sfBlank } from '@/tools/id-ticket/sf/defs';
import { dnaHelix, dnaLetters, dnaSeed } from '@/tools/id-ticket/sf/dna';
import { elementRect, maskAlpha, otsu, SF_OUTLINES, sfPortrait } from '@/tools/id-ticket/sf/draw';
import { bounds } from '@/tools/id-ticket/sf/geom';
import { LICENSE_KEYS } from '@/tools/id-ticket/sf/licenses';
import {
  defaultSfStyle,
  initialSf,
  normalizeSf,
  sfCaption,
  sfGenerate,
} from '@/tools/id-ticket/sf/model';
import { buildMrz, checkDigit, mrzDate, mrzName, mrzSex } from '@/tools/id-ticket/sf/mrz';
import {
  SF_CODE_MIN_PX,
  sfCodeBox,
  sfCodeDensity,
  sfFileName,
  sfPixels,
} from '@/tools/id-ticket/sf/render';

const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

/* ---------- 機讀區 ---------- */

describe('機讀區（ICAO 9303 TD2）', () => {
  it('檢查碼照 7-3-1 權重（ICAO 9303 的範例值）', () => {
    expect(checkDigit('D23145890')).toBe('7');
    expect(checkDigit('L898902C3')).toBe('6');
    expect(checkDigit('740812')).toBe('2');
    expect(checkDigit('120415')).toBe('9');
    expect(checkDigit('690806')).toBe('1');
    expect(checkDigit('940623')).toBe('6');
    expect(checkDigit('<<<<<<')).toBe('0');
  });

  it('日期、性別、姓名欄的整理', () => {
    expect(mrzDate('2061-08-14')).toBe('610814');
    expect(mrzDate('2061.8.4')).toBe('610804');
    expect(mrzDate('20931231')).toBe('931231');
    expect(mrzDate('2093-13-01')).toBe('<<<<<<');
    expect(mrzDate('明天')).toBe('<<<<<<');
    expect(mrzSex('f')).toBe('F');
    expect(mrzSex('男')).toBe('M');
    expect(mrzSex('')).toBe('<');
    expect(mrzName('Lin', 'Nova')).toBe(`LIN<<NOVA${'<'.repeat(22)}`);
    expect(mrzName("O'Hara-Vega", 'Ana María')).toBe(`OHARA<VEGA<<ANA<MARIA${'<'.repeat(10)}`);
    /* 撇號拿掉（ICAO 9303：O'BRIEN → OBRIEN），連字號、空白換成 < */
    expect(mrzName("O'BRIEN", "D'ARCY JEAN-LUC")).toBe(`OBRIEN<<DARCY<JEAN<LUC${'<'.repeat(9)}`);
    expect(mrzName('O’Neil', 'Ann')).toBe(`ONEIL<<ANN${'<'.repeat(21)}`);
    /* 中文名字沒有英文字母：不出現在機讀區 */
    expect(mrzName('林', '若晴')).toBe('<'.repeat(31));
    expect(mrzName('A'.repeat(40), 'B')).toHaveLength(31);
  });

  it('兩行各 36 字，號碼、出生日期、到期日、總檢查碼都對', () => {
    const [l1, l2] = buildMrz({
      state: 'msp',
      number: 'MP-2087-0413',
      surname: 'LIN',
      given: 'NOVA',
      sex: 'F',
      dob: '2061-08-14',
      expires: '2093-12-31',
    });
    expect(l1).toBe(`IDMSPLIN<<NOVA${'<'.repeat(22)}`);
    expect(l1).toHaveLength(36);
    expect(l2).toHaveLength(36);
    /* 號碼 MP20870413 有 10 碼：前 9 碼＋<，第 10 碼與整個號碼的檢查碼放進選用欄 */
    expect(l2.slice(0, 10)).toBe('MP2087041<');
    expect(l2.slice(10, 13)).toBe('MSP');
    expect(l2.slice(13, 20)).toBe(`610814${checkDigit('610814')}`);
    expect(l2[20]).toBe('F');
    expect(l2.slice(21, 28)).toBe(`931231${checkDigit('931231')}`);
    expect(l2.slice(28, 35)).toBe(`3${checkDigit('MP20870413')}<<<<<`);
    expect(l2[35]).toBe(checkDigit(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35)));
    expect(l2).toBe(
      buildMrz({
        state: 'MSP',
        number: 'MP-2087-0413',
        surname: 'Lin',
        given: 'Nova',
        sex: 'f',
        dob: '2061.08.14',
        expires: '2093/12/31',
      })[1],
    );
  });

  it('9 碼以內的號碼：號碼欄＋自己的檢查碼', () => {
    const [, l2] = buildMrz({
      state: 'UTO',
      number: 'D23145890',
      surname: 'A',
      given: 'B',
      sex: 'M',
      dob: '1974-08-12',
      expires: '2012-04-15',
    });
    expect(l2.slice(0, 10)).toBe('D231458907');
    expect(l2.slice(13, 20)).toBe('7408122');
    expect(l2.slice(21, 28)).toBe('1204159');
    expect(l2.slice(28, 35)).toBe('<<<<<<<');
  });
});

/* ---------- DNA 條 ---------- */

describe('DNA 條', () => {
  const f = {
    number: 'MP-2087-0413',
    given: 'NOVA',
    surname: 'LIN',
    dob: '2061-08-14',
    species: 'HUMAN',
  };

  it('同樣的欄位每次一樣，改了欄位就換一組', () => {
    const a = dnaLetters(dnaSeed(f), 60);
    expect(dnaLetters(dnaSeed({ ...f }), 60)).toEqual(a);
    expect(dnaLetters(dnaSeed({ ...f, dob: '2061-08-15' }), 60)).not.toEqual(a);
    const h1 = dnaHelix(dnaSeed(f), 200, 1450, 766, 13);
    const h2 = dnaHelix(dnaSeed(f), 200, 1450, 766, 13);
    expect(h1.phase).toBe(h2.phase);
    expect(h1.rungs).toEqual(h2.rungs);
    expect(dnaHelix(dnaSeed({ ...f, species: 'ANDROID' }), 200, 1450, 766, 13).phase).not.toBe(
      h1.phase,
    );
  });

  it('字母 6 個一組（每 7 格空一格）；只有 A、C、G、T；有的是強調色', () => {
    const l = dnaLetters(dnaSeed(f), 70);
    expect(l).toHaveLength(60);
    expect(l.every((x) => x.i % 7 !== 6)).toBe(true);
    expect(new Set(l.map((x) => x.base)).size).toBeGreaterThan(2);
    expect(l.every((x) => 'ACGT'.includes(x.base))).toBe(true);
    expect(l.some((x) => x.accent)).toBe(true);
  });

  it('雙螺旋的兩條骨架對稱、橫桿在兩條之間', () => {
    const h = dnaHelix(dnaSeed(f), 200, 1450, 766, 13);
    for (const x of [250, 600, 1000]) expect(h.yAt(x, 1) + h.yAt(x, -1)).toBeCloseTo(766 * 2, 6);
    expect(h.rungs.length).toBeGreaterThan(50);
    for (const r of h.rungs) expect(Math.abs(r.ya - r.yb)).toBeGreaterThanOrEqual(6);
  });
});

/* ---------- 照片效果 ---------- */

/** 左半黑、右半白的 w × h 圖 */
function halfImage(w: number, h: number, alpha = 255): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 0 : 255;
      d.set([v, v, v, alpha], (y * w + x) * 4);
    }
  return d;
}

/** 由左到右的灰階漸層 */
function ramp(w: number, h: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255);
      d.set([v, v, v, 255], (y * w + x) * 4);
    }
  return d;
}

describe('照片效果', () => {
  it('單色化：暗的地方是墨色、亮的透明；透明的像素不畫', () => {
    const { L, A } = photoLuma(halfImage(20, 4), false, 50);
    const on = monoMask(L, A);
    expect(on[0]).toBe(1);
    expect(on[19]).toBe(0);
    const t = photoLuma(halfImage(20, 4, 0), false, 50);
    expect([...monoMask(t.L, t.A)].every((v) => v === 0)).toBe(true);
  });

  it('深色的卡（墨色比卡面亮）：明暗反過來，照片不會變成負片', () => {
    expect(inkIsLighter('#00f0ff', '#0b0b10')).toBe(true);
    expect(inkIsLighter('#050507', '#ffffff')).toBe(false);
    const { L, A } = photoLuma(halfImage(20, 4), true, 50);
    const on = monoMask(L, A);
    expect(on[0]).toBe(0);
    expect(on[19]).toBe(1);
  });

  it('明暗：往亮偏（level 大）墨點變少', () => {
    const count = (level: number) => {
      const { L, A } = photoLuma(ramp(64, 8), false, level);
      return ditherMask(L, A, 64, 8).reduce((s, v) => s + v, 0);
    };
    expect(count(80)).toBeLessThan(count(50));
    expect(count(20)).toBeGreaterThan(count(50));
  });

  it('抖色：墨點的比例跟著暗的程度（漸層約一半）', () => {
    const { L, A } = photoLuma(ramp(64, 16), false, 50);
    const on = ditherMask(L, A, 64, 16);
    const ratio = on.reduce((s, v) => s + v, 0) / on.length;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
    let left = 0;
    let right = 0;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        left += on[y * 64 + x];
        right += on[y * 64 + 48 + x];
      }
    expect(left).toBeGreaterThan(right * 3);
  });

  it('網點：奇數列錯開半格；越暗的點越大、全白的地方沒有點', () => {
    const { L, A } = photoLuma(ramp(100, 40), false, 50);
    const dots = halftoneDots(L, A, 100, 40, 10);
    expect(dots.length).toBeGreaterThan(20);
    const row0 = dots.filter((d) => d.y === 0);
    const row1 = dots.filter((d) => d.y === 10);
    expect(row0[0].x % 10).toBe(0);
    expect(row1[0].x % 10).toBe(5);
    expect(row0[0].r).toBeGreaterThan(row0[row0.length - 1].r);
    expect(dots.every((d) => d.x < 100 || d.r >= 0.6)).toBe(true);
  });

  it('讀檔整理：不認得的效果換成原樣、數值夾回範圍', () => {
    expect(normalizePhotoFx({ fx: 'blur', level: 300, dot: 1 })).toEqual({
      fx: 'none',
      level: 100,
      dot: 4,
    });
    expect(normalizePhotoFx({ fx: 'halftone', level: 40.4, dot: 12 })).toEqual({
      fx: 'halftone',
      level: 40,
      dot: 12,
    });
  });
});

/* ---------- 裝飾圖、執照圖示的單色遮罩 ---------- */

describe('單色印的遮罩', () => {
  it('有透明的圖用它的不透明度', () => {
    const d = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) d.set([200, 10, 10, i < 8 ? 0 : 255], i * 4);
    const a = maskAlpha(d, 4, 4, 0);
    expect(a[0]).toBe(0);
    expect(a[15]).toBe(255);
  });

  it('白底的深色圖：深色變墨、白底消失；門檻越高越硬', () => {
    const w = 10;
    const d = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const inside = x > 2 && x < 7 && y > 2 && y < 7;
        const v = inside ? 120 : 255;
        d.set([v, v, v, 255], (y * w + x) * 4);
      }
    const soft = maskAlpha(d, w, w, 0);
    const hard = maskAlpha(d, w, w, 100);
    expect(soft[0]).toBe(0);
    expect(soft[5 * w + 5]).toBeGreaterThan(100);
    expect(soft[5 * w + 5]).toBeLessThan(255);
    expect(hard[5 * w + 5]).toBe(255);
    expect(hard[0]).toBe(0);
  });

  it('Otsu：兩群之間切開', () => {
    const hist = new Float64Array(256);
    hist[30] = 100;
    hist[200] = 100;
    const cut = otsu(hist);
    expect(cut).toBeGreaterThan(30);
    expect(cut).toBeLessThan(200);
  });

  it('裝飾圖的範圍：裁切後的圖放進「短邊 × 大小」的方形、中心在 (x, y)', () => {
    const r = elementRect(
      {
        id: 'e',
        image: { id: 'i', name: '', width: 400, height: 200 },
        x: 0.5,
        y: 0.25,
        size: 0.5,
        alpha: 100,
        tint: true,
        thr: 0,
        crop: { x: 0, y: 0, w: 1, h: 1 },
      },
      1600,
      1000,
    );
    expect(r).toEqual({ x: 550, y: 125, w: 500, h: 250 });
  });
});

/* ---------- 掛繩 ---------- */

describe('掛繩孔與掛繩的幾何', () => {
  it('四種選擇：只在預覽、不要不匯出；掛繩孔打洞；掛繩孔＋掛繩往上延伸', () => {
    expect(LANYARD_MODES).toEqual(['preview', 'none', 'hole', 'strap']);
    expect(LANYARD_MODES.map(lanyardHole)).toEqual([false, false, true, true]);
    expect(LANYARD_MODES.map(lanyardStrap)).toEqual([false, false, false, true]);
  });

  it('既有的證件：13 × 3.2 mm、水平置中、離上緣 3.5 mm；掛繩 20 mm（600 dpi 472 px）', () => {
    const p = idSlot('portrait');
    expect(p.w).toBeCloseTo(13 * 5.5, 6);
    expect(p.h).toBeCloseTo(3.2 * 5.5, 6);
    expect(p.y).toBeCloseTo(3.5 * 5.5, 6);
    expect(p.x + p.w / 2).toBeCloseTo(297 / 2, 6);
    const l = idSlot('landscape');
    expect(l.x + l.w / 2).toBeCloseTo(473 / 2, 6);
    expect(ID_STRAP_MM).toBe(20);
    expect(idStrapPixels(600)).toBe(472);
  });

  it('掛繩、扣環、扣片：掛繩從畫布上緣接到扣環、扣環在卡片上緣之上、扣片穿到孔的中間', () => {
    const slot = idSlot('portrait');
    const g = strapGeometry(slot, 0, -ID_STRAP_U);
    expect(g.u).toBeCloseTo(1, 6);
    expect(g.ribbon.y).toBe(-ID_STRAP_U);
    expect(g.ribbon.y + g.ribbon.h).toBeGreaterThan(g.clip.y);
    expect(g.clip.y + g.clip.h).toBeLessThan(0);
    expect(g.tab.y + g.tab.h).toBeCloseTo(slot.y + slot.h / 2, 6);
    expect(g.tab.w).toBeLessThan(slot.w);
    for (const r of [g.ribbon, g.clip, g.tab])
      expect(r.x + r.w / 2).toBeCloseTo(slot.x + slot.w / 2, 6);
    /* SF 證件：依孔寬等比例放大 */
    const s = strapGeometry(SF_SLOTS.event, SF_CARD_TOP.event, -400);
    expect(s.u).toBeCloseTo(260 / 71.5, 6);
    expect(s.clip.y + s.clip.h).toBeLessThan(SF_CARD_TOP.event);
  });

  it('SF 證件的孔在卡片外形裡、水平置中；通行證用本來的孔', () => {
    for (const b of SF_BLANKS) {
      const slot = SF_SLOTS[b.id];
      const o = bounds(SF_OUTLINES[b.id]);
      expect(slot.x + slot.w / 2).toBeCloseTo(b.w / 2, 6);
      expect(slot.y).toBeGreaterThan(o.y);
      expect(slot.y).toBeGreaterThanOrEqual(SF_CARD_TOP[b.id]);
      expect(slot.y + slot.h).toBeLessThan(o.y + o.h);
    }
    expect(SF_SLOTS.pass).toEqual({ x: 370, y: 92, w: 260, h: 56 });
    /* 公民 ID 的孔不切到發行單位的帶子（y 120 起） */
    expect(SF_SLOTS.citizen.y + SF_SLOTS.citizen.h).toBeLessThan(120);
    /* 執照卡的孔不切到發照單位的帶子（y 130 起） */
    expect(SF_SLOTS.license.y + SF_SLOTS.license.h).toBeLessThan(130);
    expect(idSlotOf('portrait')).toEqual(idSlot('portrait'));
  });

  it('SF 證件的輸出大小：1 倍＝原生、2 倍、掛繩往上 400', () => {
    const sf = initialSf();
    expect(sfPixels(sf, 1, 'preview')).toEqual({ width: 1600, height: 1010 });
    expect(sfPixels(sf, 2, 'hole')).toEqual({ width: 3200, height: 2020 });
    expect(sfPixels({ ...sf, blank: 'event' }, 1, 'strap')).toEqual({ width: 1200, height: 2000 });
    expect(sfFileName(sf, 1)).toBe('sf-citizen.png');
    expect(sfFileName({ ...sf, blank: 'pass' }, 2)).toBe('sf-pass-2x.png');
  });
});

/* ---------- 範本、產生、讀檔 ---------- */

describe('SF 證件的範本與資料', () => {
  it('5 款的原生尺寸照原作；照片格跟著裝飾開關變大', () => {
    expect(SF_BLANKS.map((b) => [b.id, b.w, b.h])).toEqual([
      ['event', 1200, 1600],
      ['citizen', 1600, 1010],
      ['license', 1600, 1010],
      ['operator', 1600, 1010],
      ['pass', 1000, 1600],
    ]);
    const st = defaultSfStyle();
    expect(sfPortrait('citizen', st).box).toEqual({ x: 157, y: 220, w: 413, h: 530 });
    expect(sfPortrait('citizen', { ...st, dna: false, mrz: false }).box.h).toBe(658);
    expect(sfPortrait('license', { ...st, barcode: false }).box.h).toBe(654);
    expect(sfPortrait('pass', { ...st, barcode: false }).box.h).toBe(680);
  });

  it('編號：@ 英文字母（沒有 I、O）、% 十六進位；5 種格式隨機挑', () => {
    expect(generateCode('@@-%%', seq(0, 0.999, 0, 0.999))).toBe('AZ-0F');
    for (let i = 0; i < 40; i++) {
      const v = sfGenerate(sfBlank('citizen').fields.find((f) => f.key === 'number')!) ?? '';
      expect(v).toMatch(
        /^(X[1-9]\d-\d{4}|ID-[1-9]\d{3}-\d{4}|[A-HJ-NP-Z]{2}-[1-9]\d{3}-[A-HJ-NP-Z]|[0-9A-F]{2}(:[0-9A-F]{2}){3}|[A-HJ-NP-Z]{3}\/[1-9]\d{4})$/,
      );
    }
    expect(SF_SERIALS).toHaveLength(5);
    expect(generateDate([2088, 2099], seq(0, 0, 0))).toBe('2088-01-01');
    expect(generateDate([2088, 2099], seq(0.999, 0.999, 0.999))).toBe('2099-12-28');
  });

  it('讀檔：資料版本 1（沒有 SF、照片效果）補預設；壞的換預設、文字截到上限', () => {
    const v1 = { ...initialState() } as Record<string, unknown>;
    delete v1.sf;
    delete v1.idPhotoFx;
    const n = normalizeState(v1);
    expect(n.sf).toEqual(initialSf());
    expect(n.idPhotoFx).toEqual({ fx: 'none', level: 50, dot: 10 });
    const sf = normalizeSf({
      blank: 'nope',
      values: { given: 'X'.repeat(60), number: 42 },
      style: { card: 'red', frame: 'heart', code: 'qr', dna: 'yes' },
      licenses: ['magic', 'unknown', 'firearms'],
      licenseCaps: { magic: 'ARCANA', blades: '  ' },
      captions: { surname: '姓', bogus: 'x' },
      elements: {
        event: [
          {
            id: 'a',
            image: { id: 'img', name: 'a.png', width: 10, height: 10 },
            size: 9,
            alpha: 300,
          },
          { id: 'a', image: { id: 'img2', width: 10, height: 10 } },
          { image: null },
        ],
      },
      watermark: { mode: 'text', amount: 900, rotate: -400 },
    });
    expect(sf.blank).toBe('citizen');
    expect(sf.values.given).toHaveLength(24);
    expect(sf.values.number).toBe('MP-2087-0413');
    expect(sf.style.card).toBe('#ffffff');
    expect(sf.style.frame).toBe('notch');
    expect(sf.style.code).toBe('qr');
    expect(sf.style.dna).toBe(true);
    expect(sf.licenses).toEqual(['firearms', 'magic']);
    expect(sf.licenseCaps).toEqual({ magic: 'ARCANA' });
    expect(sf.captions).toEqual({ surname: '姓' });
    expect(sf.elements.event).toHaveLength(2);
    expect(sf.elements.event[0]).toMatchObject({ size: 1.5, alpha: 100 });
    expect(sf.elements.event[1].id).not.toBe('a');
    expect(sf.watermark).toMatchObject({ mode: 'text', amount: 100, rotate: -180 });
  });

  it('用到的圖都列進專案檔（照片、浮水印、裝飾圖、執照圖示）', () => {
    const s = initialState();
    const ref = (id: string) => ({ id, name: '', width: 10, height: 10 });
    s.sf.photo = { image: ref('p'), place: { zoom: 1, x: 0, y: 0, turns: 0 } };
    s.sf.watermark.image = ref('w');
    s.sf.elements.pass.push({
      id: 'e',
      image: ref('e'),
      x: 0.5,
      y: 0.5,
      size: 0.3,
      alpha: 100,
      tint: true,
      thr: 0,
      crop: { x: 0, y: 0, w: 1, h: 1 },
    });
    s.sf.licenseIcons.magic = { image: ref('m'), crop: { x: 0, y: 0, w: 1, h: 1 } };
    expect(stateAssetIds(s).sort()).toEqual(['e', 'm', 'p', 'w']);
  });

  it('卡上的欄位名稱：改過的優先；小字的 {org} 換成組織', () => {
    const sf = initialSf();
    expect(sfCaption(sf, 'surname')).toBe('SURNAME');
    expect(sfCaption({ ...sf, captions: { surname: '姓' } }, 'surname')).toBe('姓');
    expect(sfCaption(sf, 'fine')).toContain('HALCYON DYNAMICS');
    expect(sfCaption({ ...sf, captions: { fine: '本證屬於 {org}' } }, 'fine')).toBe(
      '本證屬於 HALCYON DYNAMICS',
    );
    expect(LICENSE_KEYS).toHaveLength(12);
  });
});

/* ---------- 條碼與 QR code 的密度（D39、D40 修訂） ---------- */

describe('SF 證件的碼太密的提醒', () => {
  it('條碼：碼的寬 × 倍數 ÷ 模組數；低於 1.5 px 提醒', () => {
    const sf = { ...initialSf(), blank: 'event' as const };
    const mods = code128Modules(code128Widths('MP-2087-0413') ?? []);
    const one = sfCodeDensity(sf, { kind: 'code', w: 160 }, 1);
    expect(one?.kind).toBe('code');
    expect(one?.module).toBeCloseTo(160 / mods, 6);
    expect(one?.dense).toBe(true);
    const two = sfCodeDensity(sf, { kind: 'code', w: 160 }, 2);
    expect(two?.module).toBeCloseTo((160 * 2) / mods, 6);
    expect(two?.dense).toBe((160 * 2) / mods < SF_CODE_MIN_PX.code);
    /* 通行證的條碼 800 寬：1 倍就夠 */
    expect(sfCodeDensity({ ...sf, blank: 'pass' }, { kind: 'code', w: 800 }, 1)?.dense).toBe(false);
    /* 關掉條碼、沒有碼的位置：不提醒 */
    expect(
      sfCodeDensity({ ...sf, style: { ...sf.style, barcode: false } }, { kind: 'code', w: 160 }, 1),
    ).toBeNull();
    expect(sfCodeDensity(sf, null, 1)).toBeNull();
  });

  it('QR code：方形的邊 × 倍數 ÷ 一邊的格數；低於 2 px 提醒（內容長時）', () => {
    const sf = initialSf();
    const short = sfCodeDensity(sf, { kind: 'qr', w: 160 }, 1);
    expect(short?.kind).toBe('qr');
    expect(short?.dense).toBe(false);
    const long = { ...sf, values: { ...sf.values, qr: 'https://example.com/'.repeat(22) } };
    const d1 = sfCodeDensity(long, { kind: 'qr', w: 160 }, 1);
    expect(d1?.dense).toBe(true);
    expect(sfCodeDensity(long, { kind: 'qr', w: 160 }, 2)?.module).toBeCloseTo(
      (d1?.module ?? 0) * 2,
      6,
    );
  });

  it('碼的位置從可以點的範圍找（QR code 優先）', () => {
    const r = (kind: 'code' | 'qr' | 'field', w: number) => ({
      kind,
      key: 'number',
      x: 0,
      y: 0,
      w,
      h: 10,
    });
    expect(sfCodeBox([r('field', 50), r('code', 240)])).toEqual({ kind: 'code', w: 240 });
    expect(sfCodeBox([r('code', 240), r('qr', 120)])).toEqual({ kind: 'qr', w: 120 });
    expect(sfCodeBox([r('field', 50)])).toBeNull();
  });
});
