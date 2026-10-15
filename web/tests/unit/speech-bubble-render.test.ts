/**
 * 動態對話泡泡產生器：2026-10 的畫法（規格 F60～F64、3.9～3.12）——樣式的各個項目、說話者與日期、
 * 卡片比例與最小高度、自由拖曳的位移（拖曳中畫布固定）、頁首頁尾與分隔線、卡片底、紋理。
 * 字寬用假的量測（全形＝字級、半形＝0.5 字級）。
 */
import { describe, expect, it } from 'vitest';
import type { MeasureFn } from '../../src/core/typeset/measure';
import { drawBubble, FULL_TEXT } from '../../src/tools/speech-bubble/draw';
import {
  type BubbleLayout,
  cachedUnit,
  type LayoutInput,
  layoutBubble,
  planCanvas,
} from '../../src/tools/speech-bubble/layout';
import {
  BASE_SETTINGS,
  DEFAULT_CARD,
  DEFAULT_FMT,
  type Fmt,
  type SbData,
} from '../../src/tools/speech-bubble/model';
import { defaultData } from '../../src/tools/speech-bubble/presets';
import { buildScene } from '../../src/tools/speech-bubble/scene';
import { styleDefaults } from '../../src/tools/speech-bubble/styles';
import { textureInk, textureTile } from '../../src/tools/speech-bubble/texture';
import { recordCanvas } from '../helpers/canvasRecorder';

const fakeMeasure: MeasureFn = (font, ch) => {
  const px = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const w = ch.charCodeAt(0) > 0x24f ? px : px * 0.5;
  return { w, l: 0, r: w, a: px * 0.8, d: px * 0.2 };
};
const unit = cachedUnit(fakeMeasure);

const input = (o: Partial<LayoutInput> & Pick<LayoutInput, 'style'>): LayoutInput => ({
  title: '',
  text: '你好嗎',
  icon: styleDefaults(o.style).icon,
  button: '',
  align: 'left',
  ...o,
});
const base = {
  font: BASE_SETTINGS.font,
  fontSize: 20,
  lineHeight: 1.5,
  wrapWidth: 200,
  shadow: true,
};
const lay = (b: LayoutInput, f: Partial<Fmt> = {}): BubbleLayout =>
  layoutBubble(b, { ...base, fmt: { ...DEFAULT_FMT, ...f } }, unit);

const draw = (L: BubbleLayout, colors = styleDefaults(L.spec.id).colors) => {
  const r = recordCanvas();
  drawBubble(
    r.ctx,
    L,
    { colors, icon: 'none' },
    {
      shadow: true,
      u: 1,
      seed: 1,
      text: FULL_TEXT,
      shine: null,
      scan: null,
    },
  );
  return r.log as unknown[][];
};
const calls = (log: unknown[][], name: string) => log.filter((c) => c[0] === name);

describe('樣式的項目（F60）', () => {
  const m = input({ style: 'messenger' });

  it('預設值＝不給樣式（以前的畫法）', () => {
    expect(lay(m)).toEqual(layoutBubble(m, base, unit));
    expect(draw(lay(m))).toEqual(draw(layoutBubble(m, base, unit)));
  });

  it('內距（倍數）、字距、寬度不貼合文字', () => {
    const a = lay(m);
    const p = lay(m, { padX: 2, padY: 1.5 });
    expect(p.w - a.w).toBeCloseTo(0.8 * 20 * 2, 5);
    expect(p.h - a.h).toBeCloseTo(0.5 * 20 * 0.5 * 2, 5);
    const ls = lay(m, { letterSpacing: 3 });
    expect(ls.lines[0].w).toBe(60 + 9);
    expect(ls.ls).toBe(3);
    /* 有字距時一個字一個字畫 */
    expect(calls(draw(ls), 'fillText')).toHaveLength(3);
    expect(calls(draw(a), 'fillText')).toHaveLength(1);
    const fixed = lay(m, { fitWidth: false });
    expect(fixed.w).toBeCloseTo(0.8 * 20 * 2 + 200, 5);
  });

  it('文字對齊靠右、上下微調只移動內文', () => {
    const r = lay(input({ style: 'messenger', text: '一\n一二三' }), {
      textAlign: 'right',
      fitWidth: false,
    });
    const right = r.content.x + r.content.w;
    expect(r.lines[0].x + r.lines[0].w).toBeCloseTo(right, 5);
    expect(r.lines[1].x + r.lines[1].w).toBeCloseTo(right, 5);
    const c = input({ style: 'chat-card', title: '名字' });
    const a = lay(c);
    const d = lay(c, { textDy: 6 });
    expect(d.lines[0].cy - a.lines[0].cy).toBe(6);
    expect(d.titleCy).toBe(a.titleCy);
  });

  it('尾巴與角：全圓沒有尾巴；尖角時訊息泡泡沒有小勾、指向側的上角是尖的', () => {
    const a = lay(m);
    const round = lay(m, { corner: 'round' });
    const point = lay(m, { corner: 'point' });
    expect(a.tail).toBe('hook');
    expect(round.tail).toBe('none');
    expect(point.tail).toBe('none');
    expect(round.ext.b).toBeLessThan(a.ext.b);
    /* 尖角：左上角直接畫到角落（沒有 arcTo 到左上角） */
    const log = draw(point);
    expect(calls(log, 'arcTo').some((c) => c[1] === 0 && c[2] === 0)).toBe(false);
    expect(calls(draw(a), 'arcTo').some((c) => c[1] === 0 && c[2] === 0)).toBe(true);
    expect(lay(input({ style: 'speech' }), { corner: 'point' }).tail).toBe('point');
    expect(lay(input({ style: 'thought' }), { corner: 'round' }).tail).toBe('none');
  });

  it('圓角：設了就取代造型的圓角；邊框粗細 0 不畫邊框', () => {
    const c = input({ style: 'chat-card' });
    const arcR = (L: BubbleLayout) => calls(draw(L), 'arcTo')[0]?.[5];
    expect(arcR(lay(c))).toBeCloseTo(20 * 0.55, 5);
    expect(arcR(lay(c, { radius: 3 }))).toBe(3);
    const strokes = (L: BubbleLayout) => calls(draw(L), 'stroke').length;
    expect(strokes(lay(c, { borderScale: 0 }))).toBe(strokes(lay(c)) - 1);
    const w = calls(draw(lay(c, { borderScale: 2.5 })), '=').filter((x) => x[1] === 'lineWidth');
    expect(w.some((x) => x[2] === 2.5)).toBe(true);
  });

  it('柔和陰影：一律關、一律開（本來沒有陰影的造型另外畫一層）；範圍跟著變', () => {
    const blurs = (L: BubbleLayout) =>
      calls(draw(L), '=').filter((x) => x[1] === 'shadowBlur' && (x[2] as number) > 0).length;
    const card = input({ style: 'card' });
    expect(blurs(lay(card))).toBeGreaterThan(0);
    expect(blurs(lay(card, { softShadow: 'off' }))).toBe(0);
    expect(lay(card, { softShadow: 'off' }).ext.b).toBeLessThan(lay(card).ext.b);
    expect(blurs(lay(m))).toBe(0);
    const on = lay(m, { softShadow: 'on' });
    expect(blurs(on)).toBeGreaterThan(0);
    expect(on.ext.b).toBeGreaterThan(lay(m).ext.b);
  });

  it('底部實色陰影：剪影往下錯開、用指定的顏色，範圍往下加', () => {
    const s = lay(m, { solidShadow: true, solidColor: '#123456', solidOffset: 7 });
    expect(s.ext.b - lay(m).ext.b).toBe(7);
    const log = draw(s);
    const i = log.findIndex((c) => c[0] === '=' && c[1] === 'fillStyle' && c[2] === '#123456');
    expect(i).toBeGreaterThan(-1);
    expect(log.slice(0, i).some((c) => c[0] === 'translate' && c[2] === 7)).toBe(true);
  });

  it('想法泡泡的雲朵大小：圓變大、範圍變大', () => {
    const t = input({ style: 'thought' });
    expect(lay(t, { cloudPuff: 1.6 }).ext.l).toBeGreaterThan(lay(t).ext.l);
  });
});

describe('說話者與日期（F61）', () => {
  const m = input({ style: 'messenger', speaker: '阿明', time: '下午 2:30' });

  it('名字在上方、時間在旁邊：靠左的時間在右邊，靠右的在左邊', () => {
    const L = lay(m);
    expect(L.meta?.name?.cy).toBeLessThan(0);
    expect(L.meta?.timeAt?.x).toBeGreaterThan(L.w);
    expect(L.ext.t).toBeGreaterThan(lay(input({ style: 'messenger' })).ext.t);
    const R = lay({ ...m, align: 'right' });
    expect(R.meta?.timeAt?.x).toBeLessThan(0);
    expect(R.ext.l).toBeGreaterThan(L.ext.l - 1);
    /* 有外面的名字（標題）時放在它上面 */
    const T = lay({ ...m, title: '標題' });
    expect(T.meta?.name?.cy).toBeLessThan(T.titleCy);
  });

  it('名字與時間都在上方、在泡泡旁邊、在泡泡裡（分隔線）、不顯示', () => {
    const h = lay(m, { meta: 'header' });
    expect(h.meta?.name?.cy).toBe(h.meta?.timeAt?.cy);
    expect(h.meta?.timeAt?.x).toBeGreaterThan(h.meta?.name?.x ?? 0);
    const s = lay(m, { meta: 'side' });
    expect(s.meta?.name?.x).toBeLessThan(0);
    expect(s.meta?.timeAt?.cy).toBeGreaterThan(s.meta?.name?.cy ?? 0);
    const i = lay(m, { meta: 'inside' });
    expect(i.h).toBeGreaterThan(lay(input({ style: 'messenger' })).h);
    expect(i.meta?.divider).not.toBeNull();
    expect(i.meta?.sep).not.toBeNull();
    expect(i.meta?.name?.cy).toBeLessThan(i.h);
    expect(lay(m, { meta: 'off' }).meta).toBeNull();
    expect(lay(input({ style: 'messenger' })).meta).toBeNull();
    /* 畫出來：名字、「・」、時間 */
    const texts = calls(draw(i), 'fillText').map((c) => c[1]);
    expect(texts).toEqual(expect.arrayContaining(['阿明', '・', '下午 2:30']));
  });
});

describe('卡片比例與最小高度（F64）', () => {
  const o = {
    canvasMode: 'auto' as const,
    margin: 10,
    width: 640,
    height: 360,
    anchor: 'mc' as const,
  };

  it('正方形、限動 9:16、橫幅 16:9：剛好放得下內容的整數倍，內容依位置擺', () => {
    const sq = planCanvas({ width: 100, height: 50 }, { ...o, canvasMode: 'square' });
    expect([sq.width, sq.height]).toEqual([120, 120]);
    expect(sq.oy).toBeCloseTo(10 + (120 - 20 - 50) / 2, 5);
    const st = planCanvas({ width: 300, height: 100 }, { ...o, canvasMode: 'story' });
    expect(st.width / st.height).toBe(9 / 16);
    expect(st.width).toBeGreaterThanOrEqual(320);
    expect(st.width - 9).toBeLessThan(320);
    const wd = planCanvas({ width: 100, height: 300 }, { ...o, canvasMode: 'wide', anchor: 'tl' });
    expect(wd.width / wd.height).toBe(16 / 9);
    expect(wd.height).toBeGreaterThanOrEqual(320);
    expect([wd.ox, wd.oy]).toEqual([10, 10]);
    const big = planCanvas({ width: 10, height: 5000 }, { ...o, canvasMode: 'story' });
    expect(big.overflow).toBe(true);
    expect(big.height).toBeLessThanOrEqual(4096);
  });

  it('最小高度：自動畫布撐高，多的高度依內容位置分配；比例畫布也算進去', () => {
    const a = planCanvas({ width: 100, height: 50 }, { ...o, minHeight: 400, anchor: 'tc' });
    expect([a.width, a.height, a.oy]).toEqual([120, 400, 10]);
    expect(planCanvas({ width: 100, height: 50 }, { ...o, minHeight: 30 })).toEqual(
      planCanvas({ width: 100, height: 50 }, o),
    );
    const sq = planCanvas(
      { width: 100, height: 50 },
      { ...o, canvasMode: 'square', minHeight: 300 },
    );
    expect([sq.width, sq.height]).toEqual([300, 300]);
  });
});

const d0 = (o: Partial<SbData> = {}): SbData => ({ ...defaultData(), idle: 'none', ...o });

describe('場景：位移、頁首頁尾、卡片底（F62～F65）', () => {
  const two = () => {
    const d = defaultData();
    const b = d.bubbles[0];
    return [
      { ...b, id: 'a', text: '左', align: 'left' as const },
      { ...b, id: 'b', text: '右', align: 'right' as const },
    ];
  };

  it('自由拖曳的位移：排好之後再移動，自動畫布跟著變大；拖曳中畫布與其他泡泡不動', () => {
    const plain = buildScene(d0({ bubbles: two() }), fakeMeasure);
    const bs = two();
    bs[1] = { ...bs[1], dx: 40, dy: 30 };
    const moved = buildScene(d0({ bubbles: bs }), fakeMeasure);
    expect(moved.items[1].x - moved.items[0].x).toBeCloseTo(
      plain.items[1].x - plain.items[0].x + 40,
      5,
    );
    expect(moved.items[1].y - moved.items[0].y).toBeCloseTo(
      plain.items[1].y - plain.items[0].y + 30,
      5,
    );
    expect(moved.width).toBeGreaterThan(plain.width);
    /* 拖曳中：用拖曳前的幾何，畫布大小、第一個泡泡的位置都不變 */
    const frozen = buildScene(d0({ bubbles: bs }), fakeMeasure, { freeze: plain.geometry });
    expect([frozen.width, frozen.height]).toEqual([plain.width, plain.height]);
    expect(frozen.items[0].x).toBeCloseTo(plain.items[0].x, 9);
    expect(frozen.items[1].x).toBeCloseTo(plain.items[1].x + 40, 9);
  });

  it('頁首、頁尾與分隔線：泡泡往下移、畫布變高，靜止地畫在每一格', () => {
    const plain = buildScene(d0(), fakeMeasure);
    const d = d0({
      card: { ...DEFAULT_CARD, header: '第三章\n霧之港', footer: '— 完 —', divider: 'double' },
    });
    const s = buildScene(d, fakeMeasure);
    expect(s.notes).toHaveLength(2);
    expect(s.notes[0].lines.map((l) => l.text)).toEqual(['第三章', '霧之港']);
    expect(s.dividers).toHaveLength(2);
    expect(s.height).toBeGreaterThan(plain.height + 14 * 1.5 * 3);
    expect(s.items[0].y).toBeGreaterThan(plain.items[0].y);
    const r = recordCanvas();
    s.render(r.ctx, 0);
    const texts = (r.log as unknown[][]).filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(texts).toEqual(['第三章', '霧之港', '— 完 —']);
  });

  it('卡片底：底色鋪滿整張（第一格就有）、圓角時角落外透明；沒開時沒有任何指令', () => {
    const d = d0({ card: { ...DEFAULT_CARD, bg: true, color: '#abcdef', radius: 12 } });
    const s = buildScene(d, fakeMeasure);
    const r = recordCanvas();
    s.render(r.ctx, 0);
    const log = r.log as unknown[][];
    expect(log.some((c) => c[0] === '=' && c[1] === 'fillStyle' && c[2] === '#abcdef')).toBe(true);
    expect(log.some((c) => c[0] === 'fillRect' && c[3] === s.width && c[4] === s.height)).toBe(
      true,
    );
    expect(log.some((c) => c[0] === 'clip')).toBe(true);
    const off = recordCanvas();
    buildScene(d0(), fakeMeasure).render(off.ctx, 0);
    expect(off.log).toEqual([]);
  });

  it('字型：泡泡自己的字型、說話者、頁首頁尾的字都會載入；沒用到時和以前相同（兩組）', () => {
    expect(buildScene(d0(), fakeMeasure).fontLoads).toHaveLength(2);
    const b = defaultData().bubbles[0];
    const d = d0({
      bubbles: [
        {
          ...b,
          speaker: '阿明',
          fmt: { ...DEFAULT_FMT, font: { source: 'google', family: 'Iansui', weight: 400 } },
        },
      ],
      card: { ...DEFAULT_CARD, header: '頁首' },
    });
    const loads = buildScene(d, fakeMeasure).fontLoads;
    expect(loads.map((f) => `${f.family}|${f.weight}`)).toEqual([
      'Noto Sans TC|500',
      'Noto Sans TC|700',
      'Iansui|400',
      'Iansui|700',
      'Noto Sans TC|500',
    ]);
    expect(loads[3].text).toContain('阿明');
    expect(loads[4].text).toBe('頁首');
  });
});

describe('紋理（F62）', () => {
  it('同樣的設定每次相同；強度 0 或沒有紋理時不畫；方格是規律的線', () => {
    const ink = textureInk({ color: '#faf7f0', strength: 50, darkBoost: true });
    expect(ink.light).toBe(false);
    const a = textureTile('paper', ink)!;
    const b = textureTile('paper', ink)!;
    expect(a.width).toBe(256);
    expect(a.data.every((v, i) => v === b.data[i])).toBe(true);
    expect(textureTile('none', ink)).toBeNull();
    expect(textureTile('grain', { light: false, gain: 0 })).toBeNull();
    const g = textureTile('grid', ink)!;
    const alpha = (x: number, y: number) => g.data[(y * g.width + x) * 4 + 3];
    expect(alpha(0, 5)).toBeGreaterThan(0);
    expect(alpha(5, 5)).toBe(0);
    expect(alpha(20, 7)).toBe(alpha(0, 7));
  });

  it('深色底：開了自動加強時改用淺色的墨、加深；關閉時照舊用深色的墨', () => {
    const dark = textureInk({ color: '#1b150c', strength: 50, darkBoost: true });
    expect(dark.light).toBe(true);
    expect(dark.gain).toBeGreaterThan(0.5);
    expect(textureInk({ color: '#1b150c', strength: 50, darkBoost: false })).toEqual({
      light: false,
      gain: 0.5,
    });
    const t = textureTile('crumple', dark)!;
    const lightPx = Array.from({ length: 2000 }, (_, i) => i * 4).find(
      (i) => t.data[i + 3] > 0 && t.data[i] > 200,
    );
    expect(lightPx).toBeDefined();
  });
});
