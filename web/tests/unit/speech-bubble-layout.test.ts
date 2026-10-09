/**
 * 動態對話泡泡產生器：排版與排列（規格 3.1、3.3）。字寬用假的量測（全形＝字級、半形＝0.5 字級），結果可以手算。
 */
import { describe, expect, it } from 'vitest';
import type { MeasureFn } from '../../src/core/typeset/measure';
import {
  arrangeBubbles,
  cachedUnit,
  layoutBubble,
  pileTilt,
  planCanvas,
  visualBox,
} from '../../src/tools/speech-bubble/layout';
import { BASE_SETTINGS, type Bubble, MAX_CANVAS } from '../../src/tools/speech-bubble/model';
import { styleDefaults } from '../../src/tools/speech-bubble/styles';

const fakeMeasure: MeasureFn = (font, ch) => {
  const px = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const wide = ch.charCodeAt(0) > 0x24f;
  const w = ch === ' ' ? px * 0.3 : wide ? px : px * 0.5;
  return { w, l: 0, r: w, a: px * 0.8, d: px * 0.2 };
};
const unit = cachedUnit(fakeMeasure);

const bubble = (o: Partial<Bubble> & Pick<Bubble, 'style'>): Bubble => {
  const d = styleDefaults(o.style);
  return {
    id: 'x',
    title: '',
    text: '',
    icon: d.icon,
    button: '',
    align: 'left',
    colors: d.colors,
    ...o,
  };
};

const opts = {
  font: BASE_SETTINGS.font,
  fontSize: 20,
  lineHeight: 1.5,
  wrapWidth: 200,
  shadow: false,
};

describe('文字換行與泡泡大小', () => {
  it('訊息泡泡：一行的大小＝內距＋字寬', () => {
    const L = layoutBubble(bubble({ style: 'messenger', text: '你好嗎' }), opts, unit);
    expect(L.lines).toHaveLength(1);
    expect(L.lines[0].w).toBe(60);
    /* 內距 0.5／0.8 字級 */
    expect(L.w).toBeCloseTo(0.8 * 20 + 60 + 0.8 * 20, 5);
    expect(L.h).toBeCloseTo(0.5 * 20 + 30 + 0.5 * 20, 5);
    expect(L.lines[0].x).toBeCloseTo(16, 5);
    expect(L.lines[0].cy).toBeCloseTo(10 + 15, 5);
    expect(L.chars).toBe(3);
  });

  it('超過寬度上限自動換行（中文逐字），原本的換行保留，結尾的空白行不算', () => {
    const text = '一二三四五六七八九十甲乙\n第二段\n\n';
    const L = layoutBubble(bubble({ style: 'messenger', text }), opts, unit);
    /* 200 px ÷ 20 px＝每行 10 字 */
    expect(L.lines.map((l) => l.chars.join(''))).toEqual([
      '一二三四五六七八九十',
      '甲乙',
      '第二段',
    ]);
    expect(L.chars).toBe(15);
  });

  it('英文單字不從中間切開；避頭點（，。）留在上一行', () => {
    const L = layoutBubble(
      bubble({ style: 'messenger', text: '一二三四五六七八九十，好' }),
      opts,
      unit,
    );
    expect(L.lines[0].chars.join('')).toBe('一二三四五六七八九十，');
    const E = layoutBubble(
      bubble({ style: 'messenger', text: 'hello wonderful world' }),
      {
        ...opts,
        wrapWidth: 100,
      },
      unit,
    );
    expect(E.lines.map((l) => l.chars.join(''))).toEqual(['hello', 'wonderful', 'world']);
  });

  it('置中的造型：每行在內容區裡置中', () => {
    const L = layoutBubble(bubble({ style: 'neon', text: '一\n一二三' }), opts, unit);
    const [a, b] = L.lines;
    expect(a.x + a.w / 2).toBeCloseTo(b.x + b.w / 2, 5);
    expect(a.x + a.w / 2).toBeCloseTo(L.content.x + L.content.w / 2, 5);
  });

  it('標題在上方（above）：標題一行＋間隔＋內文', () => {
    const L = layoutBubble(bubble({ style: 'toast', title: '成功', text: '內文' }), opts, unit);
    const ts = 20 * 0.78;
    expect(L.ts).toBeCloseTo(ts, 1);
    expect(L.titleCy).toBeLessThan(L.lines[0].cy);
    /* 有圖示（勾勾）：內文往右讓出圖示欄 */
    expect(L.icon).not.toBeNull();
    expect(L.lines[0].x).toBeGreaterThan(L.icon!.cx + L.icon!.size / 2);
  });

  it('標題在左側（side）：標題對齊內文第一行、內文接在後面', () => {
    const L = layoutBubble(bubble({ style: 'card', title: 'A', text: '調查書架' }), opts, unit);
    expect(L.titleCy).toBeCloseTo(L.lines[0].cy, 5);
    expect(L.lines[0].x).toBeCloseTo(L.titleX + L.titleW + 20 * 0.7, 5);
  });

  it('標題列（bar）：本體加高一條標題列；最小寬度', () => {
    const L = layoutBubble(
      bubble({ style: 'window', title: '注意', text: '確定？', button: '好' }),
      opts,
      unit,
    );
    expect(L.barH).toBeGreaterThan(0);
    expect(L.lines[0].cy).toBeGreaterThan(L.barH);
    expect(L.w).toBeGreaterThanOrEqual(11 * 20);
    /* 按鈕在內容下方、靠右 */
    expect(L.buttonBox).not.toBeNull();
    expect(L.buttonBox!.x + L.buttonBox!.w).toBeCloseTo(L.w - 1.1 * 20, 5);
    expect(L.buttonBox!.y).toBeGreaterThan(L.lines[0].cy);
  });

  it('名字在外面（outside）：超出範圍往上加；尾巴往下加；靠右時名字靠右', () => {
    const L = layoutBubble(
      bubble({ style: 'messenger', title: '小明', text: '嗨', align: 'right' }),
      opts,
      unit,
    );
    expect(L.titleCy).toBeLessThan(0);
    expect(L.ext.t).toBeGreaterThan(20 * 0.68);
    expect(L.ext.b).toBeGreaterThan(20 * 0.4);
    expect(L.titleX + L.titleW).toBeCloseTo(L.w - 20 * 0.3, 5);
    expect(L.tailX).toBeCloseTo(L.w - 20 * 1.1, 5);
  });

  it('名牌（tag）壓在上框線；左側標籤（label）讓內文往右', () => {
    const R = layoutBubble(bubble({ style: 'rpg', title: '老人', text: '去吧' }), opts, unit);
    expect(R.tagBox!.y).toBeLessThan(0);
    expect(R.ext.t).toBeGreaterThanOrEqual(R.tagBox!.h / 2);
    const N = layoutBubble(bubble({ style: 'news', title: '快訊', text: '新聞' }), opts, unit);
    expect(N.labelW).toBeGreaterThan(N.titleW);
    expect(N.lines[0].x).toBeGreaterThan(N.labelW);
  });

  it('陰影：開啟時有投影的造型往外加範圍，下方多一點', () => {
    const a = layoutBubble(bubble({ style: 'card', text: '一' }), opts, unit);
    const b = layoutBubble(bubble({ style: 'card', text: '一' }), { ...opts, shadow: true }, unit);
    expect(b.ext.b - a.ext.b).toBeGreaterThan(b.ext.t - a.ext.t);
    expect(b.ext.l).toBeGreaterThan(a.ext.l);
    /* 訊息泡泡沒有投影 */
    const m = layoutBubble(
      bubble({ style: 'messenger', text: '一' }),
      { ...opts, shadow: true },
      unit,
    );
    const m0 = layoutBubble(bubble({ style: 'messenger', text: '一' }), opts, unit);
    expect(m.ext).toEqual(m0.ext);
  });

  it('沒有內文只有標題時照樣排得出來；21 種造型都不出錯', () => {
    for (const style of [
      'messenger',
      'speech',
      'thought',
      'shout',
      'chat-card',
      'rpg',
      'battle',
      'tag',
      'sticky',
      'notebook',
      'parchment',
      'neon',
      'news',
      'toast',
      'window',
      'glass',
      'capsule',
      'card',
      'hud',
      'terminal',
      'hologram',
    ] as const) {
      for (const b of [
        bubble({ style, title: '標題', text: '' }),
        bubble({ style, title: '', text: '只有內文' }),
        bubble({ style, title: '標題', text: '一二三\n四五' }),
      ]) {
        const L = layoutBubble(b, opts, unit);
        expect(L.w, style).toBeGreaterThan(0);
        expect(L.h, style).toBeGreaterThan(0);
        expect(Number.isFinite(L.titleCy), style).toBe(true);
      }
    }
  });
});

describe('排列與畫布', () => {
  const lay = (style: Bubble['style'], text: string, align: Bubble['align'] = 'left') =>
    layoutBubble(bubble({ style, text, align }), opts, unit);

  it('直向：由上往下、間距；靠左與靠右混在一起時互相錯開 indent', () => {
    const a = lay('messenger', '一二三', 'left');
    const b = lay('messenger', '一二三', 'right');
    const r = arrangeBubbles(
      [
        { index: 0, layout: a },
        { index: 1, layout: b },
      ],
      { arrange: 'column', columns: 2, gap: 10, indent: 50 },
      [0, 1],
    );
    const va = visualBox(a, 0);
    const vb = visualBox(b, 0);
    /* 尾巴往所在側超出：靠左的往左、靠右的往右 */
    expect(va.x0).toBeLessThan(vb.x0);
    expect(vb.x1 - b.w).toBeGreaterThan(va.x1 - a.w);
    expect(r.width).toBeCloseTo(Math.max(va.x1 - va.x0, vb.x1 - vb.x0) + 50, 5);
    expect(r.items[0].x + va.x0).toBeCloseTo(0, 5);
    expect(r.items[1].x + b.w + b.ext.r).toBeCloseTo(r.width, 5);
    expect(r.items[1].y).toBeCloseTo(r.items[0].y + a.h + a.ext.b + 10 + b.ext.t, 5);
    /* 全部靠左時不錯開 */
    const s = arrangeBubbles(
      [
        { index: 0, layout: a },
        { index: 1, layout: a },
      ],
      { arrange: 'column', columns: 2, gap: 10, indent: 50 },
      [0, 1],
    );
    expect(s.width).toBeCloseTo(va.x1 - va.x0, 5);
  });

  it('格狀：欄寬＝最寬的泡泡，一列一列往下', () => {
    const items = [0, 1, 2].map((i) => ({ index: i, layout: lay('card', '一'.repeat(i + 1)) }));
    const r = arrangeBubbles(items, { arrange: 'grid', columns: 2, gap: 8, indent: 0 }, [0, 1, 2]);
    const boxes = items.map((it) => visualBox(it.layout, 0));
    const colW = Math.max(...boxes.map((b) => b.x1 - b.x0));
    expect(r.width).toBeCloseTo(colW * 2 + 8, 5);
    expect(r.items[2].y).toBeGreaterThan(r.items[0].y);
    expect(r.items[1].x).toBeGreaterThan(r.items[0].x);
  });

  it('疊放：後出現的往右上、左右交替歪斜；輪流：全部疊在同一個中心', () => {
    const items = [0, 1, 2].map((i) => ({ index: i, layout: lay('battle', '第一擊') }));
    const r = arrangeBubbles(items, { arrange: 'pile', columns: 2, gap: 20, indent: 0 }, [0, 1, 2]);
    expect(r.items[1].x - r.items[0].x).toBeCloseTo(20, 5);
    expect(r.items[1].y - r.items[0].y).toBeCloseTo(-11, 5);
    expect(r.items.map((it) => it.rotate)).toEqual([0, pileTilt(1), pileTilt(2)]);
    expect(Math.sign(pileTilt(1))).toBe(-Math.sign(pileTilt(2)));
    const s = arrangeBubbles(items, { arrange: 'swap', columns: 2, gap: 20, indent: 0 }, [0, 1, 2]);
    expect(s.items[0].x).toBeCloseTo(s.items[2].x, 5);
    expect(s.items[0].y).toBeCloseTo(s.items[2].y, 5);
  });

  it('便利貼本身歪 −2°：外接框比本體大', () => {
    const L = lay('sticky', '紙條');
    const v = visualBox(L, -2);
    expect(v.x1 - v.x0).toBeGreaterThan(L.w + L.ext.l + L.ext.r);
  });

  it('自動畫布：內容＋四周留白，進位成整數；超過上限時夾住並標示', () => {
    const p = planCanvas(
      { width: 100.4, height: 50 },
      { ...BASE_SETTINGS, canvasMode: 'auto', margin: 24 },
    );
    expect(p).toMatchObject({ width: 149, height: 98, overflow: false });
    expect(p.ox).toBeCloseTo(24 + (149 - 148.4) / 2, 5);
    const big = planCanvas({ width: 5000, height: 10 }, { ...BASE_SETTINGS, margin: 0 });
    expect(big.width).toBe(MAX_CANVAS);
    expect(big.overflow).toBe(true);
  });

  it('自訂畫布：依九宮格位置擺放；放不下時標示', () => {
    const base = {
      ...BASE_SETTINGS,
      canvasMode: 'fixed' as const,
      width: 400,
      height: 300,
      margin: 20,
    };
    expect(planCanvas({ width: 100, height: 50 }, { ...base, anchor: 'tl' })).toMatchObject({
      ox: 20,
      oy: 20,
    });
    expect(planCanvas({ width: 100, height: 50 }, { ...base, anchor: 'mc' })).toMatchObject({
      ox: 150,
      oy: 125,
    });
    expect(planCanvas({ width: 100, height: 50 }, { ...base, anchor: 'br' })).toMatchObject({
      ox: 280,
      oy: 230,
    });
    expect(planCanvas({ width: 380, height: 50 }, base).overflow).toBe(true);
  });
});
