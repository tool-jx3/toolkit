/**
 * 證件與票券產生器的資料規則（規格 docs/refactor/specs/id-ticket.md 第 1、3 節）：
 * 範本的欄位、編號的格式、收據合計、讀檔整理、印刷尺寸、檔名、Code 128、QR code。
 */
import qrcode from 'qrcode-generator';
import { describe, expect, it } from 'vitest';
import {
  CODE128_PATTERNS,
  code128Codes,
  code128Modules,
  code128Text,
  code128Widths,
} from '@/tools/id-ticket/code128';
import { rgbOf } from '@/tools/id-ticket/colors';
import { firstChar } from '@/tools/id-ticket/kit';
import {
  BLEED_U,
  CARD_U,
  captionOf,
  cardUnits,
  cleanValue,
  EXPORT_SCALE,
  facePixels,
  formatAmount,
  generateCode,
  idFileName,
  initialState,
  normalizeState,
  oneLine,
  parseAmount,
  receiptTotals,
  sheetGapPx,
  stateAssetIds,
  ticketFileName,
} from '@/tools/id-ticket/model';
import { qrMatrix } from '@/tools/id-ticket/qr';
import {
  GIF_LONG_OPTIONS,
  gifLayout,
  gifSolidColors,
  matColor,
  QR_MIN_MODULE_MM,
  QR_MIN_MODULE_PX,
  qrDensity,
  ticketSize,
} from '@/tools/id-ticket/render';
import {
  ID_DEFAULTS,
  ID_TEMPLATES,
  idTemplate,
  TICKET_TEMPLATES,
  ticketTemplate,
} from '@/tools/id-ticket/templates';

/** 固定順序的亂數 */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('範本', () => {
  it('證件 7 款、票券 5 款，代號不重複', () => {
    expect(ID_TEMPLATES.map((t) => t.id)).toEqual([
      'employee',
      'highschool',
      'university',
      'press',
      'police',
      'member',
      'detective',
    ]);
    expect(TICKET_TEMPLATES.map((t) => t.id)).toEqual([
      'movie',
      'boarding',
      'rail',
      'hsr',
      'receipt',
    ]);
    for (const t of [...ID_TEMPLATES, ...TICKET_TEMPLATES]) {
      const keys = t.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('每個證件欄位都有預設值；下拉選單的預設在選項裡；編號欄位有產生格式', () => {
    for (const t of ID_TEMPLATES) {
      for (const f of t.fields) {
        expect(f.key in ID_DEFAULTS, `${t.id}.${f.key}`).toBe(true);
        if (f.options && ID_DEFAULTS[f.key]) expect(f.options).toContain(ID_DEFAULTS[f.key]);
      }
      expect(t.fields.find((f) => f.key === t.codeKey)?.gen, t.id).toBeTruthy();
      expect(t.fields.some((f) => f.key === 'qr')).toBe(!!t.qr);
    }
  });

  it('同一個代號在不同證件裡是同一種欄位（名稱、上限相同）', () => {
    const seen = new Map<string, string>();
    for (const t of ID_TEMPLATES)
      for (const f of t.fields) {
        const sig = `${f.label}|${f.max}|${(f.options ?? []).join(',')}`;
        if (seen.has(f.key)) expect(sig, f.key).toBe(seen.get(f.key));
        seen.set(f.key, sig);
      }
  });

  it('每個票券欄位都有預設值；條碼欄位有產生格式', () => {
    for (const t of TICKET_TEMPLATES) {
      for (const f of t.fields) expect(f.key in t.defaults, `${t.id}.${f.key}`).toBe(true);
      expect(t.fields.find((f) => f.key === t.codeKey)?.gen, t.id).toBeTruthy();
    }
  });

  it('找不到的範本回到第一款', () => {
    expect(idTemplate('nope' as never).id).toBe('employee');
    expect(ticketTemplate('nope' as never).id).toBe('movie');
  });
});

describe('文字', () => {
  it('單行：換行變空白、以字元截斷（emoji 算一個）', () => {
    expect(oneLine('甲\n乙\r\n  丙', 10)).toBe('甲 乙 丙');
    expect(oneLine('😀😀😀', 2)).toBe('😀😀');
  });

  it('下拉選單只收選項或空白；文字欄截到上限', () => {
    const access = idTemplate('employee').fields.find((f) => f.key === 'emp_access');
    expect(access && cleanValue(access, '全區通行')).toBe('全區通行');
    expect(access && cleanValue(access, '亂填')).toBe('');
    const name = idTemplate('employee').fields.find((f) => f.key === 'name');
    expect(name && cleanValue(name, 'x'.repeat(50))).toHaveLength(20);
    expect(name && cleanValue(name, 12)).toBe('12');
    expect(name && cleanValue(name, null)).toBe('');
  });

  it('標誌字：機構名稱的第一個字、英文轉大寫；空白時「•」（F23）', () => {
    expect(firstChar('acme biotech')).toBe('A');
    expect(firstChar('  émile & co')).toBe('É');
    expect(firstChar('辰星生技')).toBe('辰');
    expect(firstChar('   ')).toBe('•');
  });
});

describe('編號', () => {
  it('# 換成數字、第一個不是 0；{yyyy} 換成今年', () => {
    expect(generateCode('AB-####', seq(0, 0, 0, 0))).toBe('AB-1000');
    expect(generateCode('AB-####', seq(0.99, 0.99, 0.99, 0.99))).toBe('AB-9999');
    expect(generateCode('{yyyy}-##', seq(0.5), new Date(2026, 9, 19))).toBe('2026-55');
    for (let i = 0; i < 50; i++) {
      expect(generateCode('NO. ####')).toMatch(/^NO\. [1-9]\d{3}$/);
      expect(generateCode('SEQ ### · TKT ### #### ####')).toMatch(
        /^SEQ [1-9]\d{2} · TKT \d{3} \d{4} \d{4}$/,
      );
    }
  });
});

describe('收據', () => {
  it('金額欄的數字：去掉千分位與符號', () => {
    expect(parseAmount('NT$1,490')).toBe(1490);
    expect(parseAmount('−50')).toBe(50);
    expect(parseAmount('-50')).toBe(-50);
    expect(parseAmount('abc')).toBe(0);
  });

  it('小計＝Σ 數量 × 單價；合計＝小計 −｜折扣｜', () => {
    const items = [
      { qty: 2, price: 90 },
      { qty: 1, price: 120 },
    ];
    expect(receiptTotals(items, '0')).toEqual({ subtotal: 300, discount: 0, total: 300 });
    expect(receiptTotals(items, '-50')).toEqual({ subtotal: 300, discount: 50, total: 250 });
    expect(receiptTotals(items, '1,000')).toEqual({ subtotal: 300, discount: 1000, total: -700 });
    expect(receiptTotals([], '')).toEqual({ subtotal: 0, discount: 0, total: 0 });
  });

  it('千分位', () => {
    expect(formatAmount(1490)).toBe('1,490');
    expect(formatAmount(12.5)).toBe('12.5');
    expect(formatAmount(Number.NaN)).toBe('0');
  });
});

describe('證件的尺寸', () => {
  it('設計單位：成品 297 × 473、出血 11', () => {
    expect(CARD_U).toEqual({ w: 297, h: 473 });
    expect(BLEED_U).toBe(11);
    expect(cardUnits('landscape')).toEqual({ w: 473, h: 297 });
    expect(EXPORT_SCALE).toBeCloseTo(4.2949, 4);
  });

  it('卡片 1276 × 2031、印刷 1370 × 2126（600 dpi）；橫式對調；排在一張的間隔 142', () => {
    expect(facePixels('portrait', 'card')).toEqual({ width: 1276, height: 2031 });
    expect(facePixels('portrait', 'print')).toEqual({ width: 1370, height: 2126 });
    expect(facePixels('landscape', 'card')).toEqual({ width: 2031, height: 1276 });
    expect(facePixels('landscape', 'print')).toEqual({ width: 2126, height: 1370 });
    expect(sheetGapPx()).toBe(142);
  });

  it('檔名', () => {
    expect(idFileName('employee', 'front', 'card')).toBe('id-employee-front-card.png');
    expect(idFileName('police', 'sheet', 'print')).toBe('id-police-sheet-print.png');
    expect(ticketFileName('receipt', 'gif')).toBe('ticket-receipt.gif');
  });
});

describe('讀檔整理', () => {
  it('預設內容整理後一模一樣（連欄位順序；開頁不會因為整理多存一次）', () => {
    const s = initialState();
    expect(JSON.stringify(normalizeState(JSON.parse(JSON.stringify(s))))).toBe(JSON.stringify(s));
  });

  it('壞掉的內容回到預設', () => {
    expect(normalizeState(null)).toEqual(initialState());
    expect(normalizeState('x')).toEqual(initialState());
  });

  it('不認得的範本、顏色、選項換成預設；文字截到上限；照片的位置夾回範圍', () => {
    const s = normalizeState({
      kind: 'ticket',
      idTemplate: 'nope',
      ticketTemplate: 'receipt',
      idValues: { name: 'x'.repeat(99), emp_access: '亂填', extra: 'y' },
      idStyles: { employee: { color: 'red', dark: 'yes', g1: '#ABCDEF', g2: 3 } },
      idPhoto: {
        image: { id: 'abc', name: 'a.png', width: 100, height: 50 },
        place: { zoom: 99, x: -40, y: 0.2, turns: 5 },
      },
      ticketValues: { movie: { mv_title: '甲\n乙' } },
      ticketCaptions: { movie: { mv_date: '日子', mv_cinema: '不能改' } },
      ticketPhotos: { rail: { image: { id: 'r', width: 1, height: 1 } }, movie: { image: {} } },
      receiptItems: [
        { id: 'a', name: '咖啡', qty: 2.6, price: 90.556 },
        { id: 'a', name: 5, qty: -3, price: 'x' },
        'junk',
      ],
      receiptPhoto: false,
      theme: { c1: '#112233', c2: 'nope' },
    });
    expect(s.kind).toBe('ticket');
    expect(s.idTemplate).toBe('employee');
    expect(s.idValues.name).toHaveLength(20);
    expect(s.idValues.emp_access).toBe('');
    expect('extra' in s.idValues).toBe(false);
    expect(s.idValues.hi_school).toBe(ID_DEFAULTS.hi_school);
    expect(s.idStyles.employee).toEqual({ color: '#2563eb', dark: false, g1: '#abcdef', g2: null });
    expect(s.idPhoto?.place).toEqual({ zoom: 6, x: -3, y: 0.2, turns: 1 });
    expect(s.ticketValues.movie.mv_title).toBe('甲 乙');
    expect(s.ticketValues.movie.mv_date).toBe('2026.10.31');
    expect(s.ticketCaptions.movie).toEqual({ mv_date: '日子' });
    /* 車票沒有照片格；寬高壞掉的照片不要 */
    expect(s.ticketPhotos).toEqual({});
    expect(s.receiptItems).toHaveLength(2);
    expect(s.receiptItems[0]).toEqual({ id: 'a', name: '咖啡', qty: 3, price: 90.56 });
    expect(s.receiptItems[1].id).not.toBe('a');
    expect(s.receiptItems[1]).toMatchObject({ name: '', qty: 0, price: 0 });
    expect(s.receiptPhoto).toBe(false);
    expect(s.theme).toEqual({ c1: '#112233', c2: initialState().theme.c2 });
  });

  it('用到的照片', () => {
    const s = initialState();
    s.idPhoto = {
      image: { id: 'a', name: '', width: 1, height: 1 },
      place: { zoom: 1, x: 0, y: 0, turns: 0 },
    };
    s.ticketPhotos.movie = {
      image: { id: 'b', name: '', width: 1, height: 1 },
      place: { zoom: 1, x: 0, y: 0, turns: 0 },
    };
    expect(stateAssetIds(s)).toEqual(['a', 'b']);
  });

  it('票上的欄位名稱：改過的優先，收據的小計／合計', () => {
    const s = initialState();
    const movie = ticketTemplate('movie');
    expect(captionOf(s, movie, 'mv_date')).toBe('日期');
    s.ticketCaptions.movie.mv_date = 'DATE';
    expect(captionOf(s, movie, 'mv_date')).toBe('DATE');
    s.ticketCaptions.movie.mv_seat = '';
    expect(captionOf(s, movie, 'mv_seat')).toBe('');
    expect(captionOf(s, ticketTemplate('receipt'), 'total')).toBe('合計');
  });
});

/** 條寬 → 碼（測試用的解碼） */
function decode(widths: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < widths.length) {
    const n = widths.length - i === 7 ? 7 : 6;
    const pat = widths.slice(i, i + n).join('');
    const code = CODE128_PATTERNS.indexOf(pat);
    expect(code, `pattern ${pat}`).toBeGreaterThanOrEqual(0);
    out.push(code);
    i += n;
  }
  return out;
}

/** 碼 → 文字（B、C 字集） */
function codesToText(codes: number[]): string {
  let set = codes[0] === 105 ? 'C' : 'B';
  let s = '';
  for (const c of codes.slice(1, -2)) {
    if (c === 99) set = 'C';
    else if (c === 100) set = 'B';
    else if (set === 'C') s += String(c).padStart(2, '0');
    else s += String.fromCharCode(c + 32);
  }
  return s;
}

describe('Code 128', () => {
  it('對照表：107 個、6 條＝11 模組（STOP 13）、黑條的模組數是偶數、不重複', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const w = [...p].map(Number);
      expect(
        w.reduce((a, b) => a + b, 0),
        `#${i}`,
      ).toBe(i === 106 ? 13 : 11);
      if (i < 106) expect((w[0] + w[2] + w[4]) % 2, `#${i}`).toBe(0);
    });
    expect([
      CODE128_PATTERNS[0],
      CODE128_PATTERNS[104],
      CODE128_PATTERNS[105],
      CODE128_PATTERNS[106],
    ]).toEqual(['212222', '211214', '211232', '2331112']);
  });

  it('B 字集與檢查碼', () => {
    expect(code128Codes('PJJ123C')).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
  });

  it('全是數字（4 個以上）用 C 字集', () => {
    expect(code128Codes('12345678')).toEqual([105, 12, 34, 56, 78, 47, 106]);
  });

  it('文字中間的長數字切到 C、剩一個數字回到 B；解得回原本的文字', () => {
    for (const t of [
      'AB-2047',
      'S112047',
      'B11204017',
      'NO.0142',
      'SEQ017TKT29726103107',
      '8801 2047 5566',
      'x1234567y',
    ]) {
      const codes = code128Codes(t) as number[];
      const widths = code128Widths(t) as number[];
      expect(decode(widths)).toEqual(codes);
      expect(codesToText(codes)).toBe(code128Text(t));
      let sum = codes[0];
      for (let k = 1; k < codes.length - 2; k++) sum += codes[k] * k;
      expect(codes[codes.length - 2]).toBe(sum % 103);
      expect(code128Modules(widths)).toBe((codes.length - 1) * 11 + 13);
    }
    expect(code128Codes('SEQ017TKT29726103107')?.includes(99)).toBe(true);
  });

  it('不能編碼的字略過；什麼都不剩時 null', () => {
    expect(code128Text('員工 AB-1')).toBe(' AB-1');
    expect(code128Codes('林若晴')).toBeNull();
    expect(code128Widths('')).toBeNull();
  });
});

describe('QR code', () => {
  it('和 qrcode-generator 直接產生的相同（容錯 M、版本自動）', () => {
    const m = qrMatrix('AB-2047');
    const q = qrcode(0, 'M');
    q.addData('AB-2047');
    q.make();
    expect(m?.size).toBe(q.getModuleCount());
    for (let r = 0; r < q.getModuleCount(); r++)
      for (let c = 0; c < q.getModuleCount(); c++) expect(m?.dark(r, c)).toBe(q.isDark(r, c));
  });

  it('中文用 UTF-8；太長放不下時 null；空白 null', () => {
    const m = qrMatrix('霧港市碼頭街 13 號');
    expect(m?.size).toBeGreaterThanOrEqual(21);
    const q = qrcode(0, 'M');
    const bytes = new TextEncoder().encode('霧港市碼頭街 13 號');
    q.addData(String.fromCharCode(...bytes), 'Byte');
    q.make();
    expect(m?.size).toBe(q.getModuleCount());
    expect(qrMatrix('x'.repeat(5000))).toBeNull();
    expect(qrMatrix('')).toBeNull();
  });
});

describe('QR code 太密的提醒', () => {
  const URL = 'https://example.com/clue/03';
  const LONG = '霧港市碼頭街十三號的燈塔'.repeat(25);

  it('證件：以印出來每格幾 mm 判斷（< 0.3 mm 提醒）；偵探執照沒有 QR code', () => {
    expect(QR_MIN_MODULE_MM).toBe(0.3);
    for (const t of ID_TEMPLATES) {
      const s = { ...initialState(), idTemplate: t.id };
      const d = qrDensity(s);
      if (!t.qr) {
        expect(d).toBeNull();
        continue;
      }
      expect(d).toMatchObject({ unit: 'mm', dense: false });
      /* 預設（編號）：21 格；每格＝(框 − 留白 × 2) ÷ 5.5 ÷ 格數 */
      expect(d?.modules).toBe(21);
      expect(d?.module).toBeCloseTo((t.qr.size - t.qr.pad * 2) / 5.5 / 21, 6);
      expect(qrDensity({ ...s, idValues: { ...s.idValues, qr: URL } })?.dense).toBe(false);
      const long = qrDensity({ ...s, idValues: { ...s.idValues, qr: LONG } });
      expect(long?.dense).toBe(true);
      expect(long?.module).toBeLessThan(0.15);
    }
  });

  it('票券：只有高鐵風格有 QR code，以 1 倍時每格幾 px 判斷（< 2 px 提醒）', () => {
    expect(QR_MIN_MODULE_PX).toBe(2);
    const s = { ...initialState(), kind: 'ticket' as const };
    expect(qrDensity({ ...s, ticketTemplate: 'movie' })).toBeNull();
    const hsr = { ...s, ticketTemplate: 'hsr' as const };
    expect(qrDensity(hsr)).toMatchObject({ unit: 'px', dense: false });
    const v = (qr: string) => ({
      ...hsr,
      ticketValues: { ...hsr.ticketValues, hsr: { ...hsr.ticketValues.hsr, qr } },
    });
    expect(qrDensity(v(URL))?.dense).toBe(false);
    expect(qrDensity(v(LONG))?.dense).toBe(true);
  });
});

describe('票券 GIF 的大小', () => {
  it('長邊一律不超過選的長邊；票與白邊照倍率四捨五入；最多 2 倍（F53）', () => {
    expect(GIF_LONG_OPTIONS).toEqual([1400, 1000, 700]);
    for (const t of TICKET_TEMPLATES)
      for (const long of GIF_LONG_OPTIONS) {
        const s = { ...initialState(), kind: 'ticket' as const, ticketTemplate: t.id };
        const L = gifLayout(s, long);
        const tk = ticketSize(s);
        expect(Math.max(L.width, L.height)).toBeLessThanOrEqual(long);
        expect(L.scale).toBeLessThanOrEqual(2);
        expect(L.pad).toBe(Math.round(46 * L.scale));
        expect(L.layer).toEqual({
          width: Math.round(tk.width * L.scale),
          height: Math.round(tk.height * L.scale),
        });
        expect([L.width, L.height]).toEqual([
          L.layer.width + L.pad * 2,
          L.layer.height + L.pad * 2,
        ]);
        /* 沒有被 2 倍擋住時，長邊只差 2 px 以內（白邊兩側一起少 1 px） */
        const stageLong = Math.max(tk.width, tk.height) + 92;
        if (long < stageLong * 2)
          expect(Math.max(L.width, L.height)).toBeGreaterThanOrEqual(long - 2);
      }
  });

  it('電影票：1400 → 736 × 1399、700 → 369 × 700（原本 701）；登機證 1000 → 1000 寬', () => {
    const s = { ...initialState(), kind: 'ticket' as const };
    const size = (long: number, tpl: (typeof TICKET_TEMPLATES)[number]['id'] = 'movie') => {
      const L = gifLayout({ ...s, ticketTemplate: tpl }, long);
      return [L.width, L.height];
    };
    expect(size(1400)).toEqual([736, 1399]);
    expect(size(700)).toEqual([369, 700]);
    expect(size(1400, 'boarding')).toEqual([1400, 725]);
    expect(size(1000, 'boarding')[0]).toBe(1000);
    expect(size(1400, 'rail')).toEqual([1384, 804]);
  });

  it('大片單色：墊紙、票面的紙色等（GIF 編碼器的 solidColors）', () => {
    const s = initialState();
    const solid = gifSolidColors(s);
    const has = (hex: string) => {
      const [r, g, b] = rgbOf(hex);
      return solid.some((c) => c[0] === r && c[1] === g && c[2] === b);
    };
    expect(has(matColor(s))).toBe(true);
    expect(has('#fffdf8')).toBe(true);
    expect(solid.length).toBeLessThanOrEqual(8);
  });
});
