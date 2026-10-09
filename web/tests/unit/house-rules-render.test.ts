/**
 * CoC 房規表產生器的 PNG 排版（render.ts 的 layoutPng，量字寬用假的函式）：
 * 寬度、注記欄、圖例、斷行、所有字都在圖的範圍內、配色不影響排版、太長的表降低倍率。
 */
import { describe, expect, it } from 'vitest';
import { buildModel, initialData, type TableModel } from '@/tools/house-rules/model';
import {
  type DrawOp,
  effectiveScale,
  layoutPng,
  MAX_CANVAS_SIDE,
  type MeasureFn,
  modelText,
  PALETTES,
  PNG_WIDTH,
  type PngOptions,
  wrapText,
} from '@/tools/house-rules/render';

/** 假的字寬：全形字＝字級，其他＝0.55 倍字級 */
const measure: MeasureFn = (s, f) =>
  Array.from(s).reduce((w, ch) => w + ((ch.codePointAt(0) ?? 0) < 0x250 ? 0.55 : 1) * f.size, 0);

const BASE: PngOptions = { theme: 'dark', layout: 'wide', notes: true, legend: true };
const DATE = '2026-10-09';

function model(edit?: (d: ReturnType<typeof initialData>) => void): TableModel {
  const d = initialData(DATE);
  edit?.(d);
  return buildModel(d);
}

const texts = (ops: DrawOp[]) => ops.flatMap((o) => (o.t === 'text' ? [o] : []));

describe('layoutPng', () => {
  it('寬度：橫式 960、直式 600（下載 2 倍＝1920／1200）', () => {
    const m = model();
    expect(layoutPng(m, BASE, measure).width).toBe(PNG_WIDTH.wide);
    expect(layoutPng(m, { ...BASE, layout: 'narrow' }, measure).width).toBe(PNG_WIDTH.narrow);
    expect(PNG_WIDTH).toEqual({ wide: 960, narrow: 600 });
  });

  it('配色不影響排版；兩種配色的顏色都有', () => {
    const m = model();
    expect(layoutPng(m, BASE, measure)).toEqual(layoutPng(m, { ...BASE, theme: 'light' }, measure));
    expect(Object.keys(PALETTES.dark).sort()).toEqual(Object.keys(PALETTES.light).sort());
  });

  it('注記欄：沒有任何注記或不包含注記時不畫；橫式才有欄名', () => {
    const plain = model();
    expect(layoutPng(plain, BASE, measure).noteColumn).toBe(false);
    const noted = model((d) => {
      d.secs['7'].rows.push.note = '只限一次';
    });
    const wide = layoutPng(noted, BASE, measure);
    expect(wide.noteColumn).toBe(true);
    expect(texts(wide.ops).map((o) => o.text)).toEqual(
      expect.arrayContaining(['規則', '設定', '注記', '只限一次']),
    );
    expect(layoutPng(noted, { ...BASE, notes: false }, measure).noteColumn).toBe(false);
    const narrow = layoutPng(noted, { ...BASE, layout: 'narrow' }, measure);
    expect(texts(narrow.ops).map((o) => o.text)).not.toContain('規則');
    expect(texts(narrow.ops).map((o) => o.text)).toContain('只限一次');
  });

  it('圖例：拿掉時比較矮、沒有圖例那行', () => {
    const m = model();
    const a = layoutPng(m, BASE, measure);
    const b = layoutPng(m, { ...BASE, legend: false }, measure);
    expect(b.height).toBeLessThan(a.height);
    expect(texts(a.ops).some((o) => o.text.startsWith('○ 採用'))).toBe(true);
    expect(texts(b.ops).some((o) => o.text.startsWith('○ 採用'))).toBe(false);
  });

  it('放進表的規則越多越高；備註畫在最後', () => {
    const few = layoutPng(model(), BASE, measure);
    const many = layoutPng(
      model((d) => {
        d.edition = 'both';
        for (const s of Object.values(d.secs)) for (const r of Object.values(s.rows)) r.vis = true;
        d.info.remarks = '備註第一行\n備註第二行';
      }),
      BASE,
      measure,
    );
    expect(many.height).toBeGreaterThan(few.height * 2);
    const t = texts(many.ops).map((o) => o.text);
    expect(t.indexOf('備註第二行')).toBeGreaterThan(t.indexOf('其他備註'));
  });

  it('長的文字自動斷行，所有字都在圖的範圍內', () => {
    const long = '很長的注記'.repeat(30);
    const m = model((d) => {
      d.info.title = '超長的標題'.repeat(20);
      d.secs['7'].rows.push = { val: 'm', note: long, vis: true, name: '名稱'.repeat(20) };
    });
    for (const layout of ['wide', 'narrow'] as const) {
      const l = layoutPng(m, { ...BASE, layout }, measure);
      for (const o of texts(l.ops)) {
        const w = measure(o.text, o.font);
        const left = o.align === 'left' ? o.x : o.align === 'center' ? o.x - w / 2 : o.x - w;
        expect(left, o.text).toBeGreaterThanOrEqual(0);
        expect(left + w, o.text).toBeLessThanOrEqual(l.width + 0.01);
        expect(o.y).toBeLessThan(l.height);
      }
      /* 注記被斷成好幾行，接起來就是原文 */
      const noteLines = texts(l.ops)
        .map((o) => o.text)
        .filter((s) => s !== '注記' && Array.from(s).every((ch) => '很長的注記'.includes(ch)));
      expect(noteLines.length).toBeGreaterThan(1);
      expect(noteLines.join('')).toBe(long);
    }
  });

  it('斷行：英文以詞為單位，行首不放「，。」', () => {
    const f = { size: 10, weight: 400 };
    expect(wrapText('hello world foo', 60, f, measure)).toEqual(['hello', 'world foo']);
    expect(wrapText('一二三四，五', 40, f, measure)).toEqual(['一二三四，', '五']);
    expect(wrapText('a\nb', 100, f, measure)).toEqual(['a', 'b']);
  });

  it('太長的表：倍率降低到高度不超過上限', () => {
    const l = { width: 960, height: 20000, ops: [], noteColumn: false };
    expect(effectiveScale(l, 2)).toBeCloseTo(MAX_CANVAS_SIDE / 20000);
    expect(effectiveScale({ ...l, height: 3000 }, 2)).toBe(2);
  });

  it('modelText：表裡用到的每個字只出現一次（載入字型用）', () => {
    const t = modelText(model());
    expect(new Set(Array.from(t)).size).toBe(Array.from(t).length);
    expect(t).toContain('孤');
    expect(t).toContain('○');
  });
});
