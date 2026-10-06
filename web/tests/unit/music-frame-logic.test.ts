/**
 * 音樂播放畫面產生器的純函式（規格 3.2～3.6、4）：配色抽取、版面幾何、文字的自動縮小與堆疊、歌詞的大小、
 * 視覺化的數值、時間的寫法、設定的正規化、檔名與匯出範圍。
 */
import { describe, expect, it } from 'vitest';
import { fontStack } from '@/tools/music-frame/fonts';
import {
  bottomLyricDims,
  buildStack,
  fitText,
  frameLayout,
  letterSpacingFor,
  type Measure,
  type StackInput,
  stackLyricDims,
  stackLyricHeight,
  vizBox,
  wrapText,
} from '@/tools/music-frame/layout';
import {
  autoHudText,
  defaultSettings,
  exportRange,
  fileBase,
  formatClock,
  hudTextOf,
  lyricPositionOf,
  normalizeSettings,
  parseClock,
  timecode,
} from '@/tools/music-frame/model';
import {
  computeTheme,
  extractPalette,
  hexToHsl,
  hslToHex,
  hueDistance,
  rgbToHsl,
} from '@/tools/music-frame/theme';
import {
  beatScale,
  createVizState,
  FAKE_PEAKS,
  fakeBar,
  meterLevel,
  peakAt,
  peakCount,
  updateViz,
  vizSettling,
  wavePoints,
} from '@/tools/music-frame/viz';

/** 假的量字：每個字寬＝字級 × 0.5（加上字距） */
const measure: Measure = (text, style) =>
  Array.from(text).length * (style.size * 0.5 + letterSpacingFor(style));

/** n 個像素的 RGBA，依比例填顏色 */
function pixels(parts: [number, [number, number, number]][]): Uint8Array {
  const total = parts.reduce((s, [n]) => s + n, 0);
  const out = new Uint8Array(total * 4);
  let o = 0;
  for (const [n, [r, g, b]] of parts)
    for (let i = 0; i < n; i++) {
      out.set([r, g, b, 255], o);
      o += 4;
    }
  return out;
}

describe('配色', () => {
  it('HSL 換算來回一致；色相距離是環狀的', () => {
    expect(rgbToHsl(255, 0, 0)).toEqual([0, 1, 0.5]);
    expect(hslToHex([0, 1, 0.5])).toBe('#ff0000');
    expect(hslToHex(hexToHsl('#2389c8'))).toBe('#2389c8');
    expect(hueDistance(0.95, 0.05)).toBeCloseTo(0.1);
  });

  it('主色＝面積最大、鮮豔色＝彩度高亮度適中的、第二色＝色相不同的；平均亮度', () => {
    const p = extractPalette(
      pixels([
        [2000, [20, 24, 60]],
        [800, [240, 140, 30]],
        [336, [40, 160, 90]],
      ]),
    );
    expect(p.dominant.n).toBeCloseTo(2000 / 3136);
    expect(hslToHex([p.dominant.h, p.dominant.s, p.dominant.l])).toBe('#14183c');
    expect(hslToHex([p.vibrant.h, p.vibrant.s, p.vibrant.l])).toBe('#f08c1e');
    /* 第二色依面積找：深藍（彩度 0.5、色相和橘色差很多）比綠色先找到 */
    expect(p.secondary).toBe(p.dominant);
    const noNavy = extractPalette(
      pixels([
        [2000, [30, 30, 30]],
        [800, [240, 140, 30]],
        [336, [40, 160, 90]],
      ]),
    );
    expect(hslToHex([noNavy.secondary.h, noNavy.secondary.s, noNavy.secondary.l])).toBe('#28a05a');
    expect(p.mono).toBe(false);
    expect(p.avgL).toBeLessThan(0.58);
  });

  it('面積不到 0.4% 的顏色不算鮮豔色；黑白封面是 mono', () => {
    const tiny = extractPalette(
      pixels([
        [3130, [128, 128, 128]],
        [6, [255, 0, 0]],
      ]),
    );
    expect(tiny.vibrant).toBe(tiny.dominant);
    expect(tiny.mono).toBe(true);
    expect(tiny.secondary).toBe(tiny.vibrant);
  });

  it('深色主題（自動、平均亮度 < 0.58）：底色、背景色、重點色的夾值、文字色', () => {
    const p = extractPalette(
      pixels([
        [2000, [20, 24, 60]],
        [800, [240, 140, 30]],
        [336, [40, 160, 90]],
      ]),
    );
    const T = computeTheme(p, { mood: 'auto', accentAuto: true, accent: '#000000' });
    expect(T.dark).toBe(true);
    expect(T.base[2]).toBe(0.11);
    expect(T.base[1]).toBeCloseTo(Math.min(p.dominant.s, 0.5) * 0.8);
    expect(T.b2).toEqual([p.vibrant.h, Math.min(p.vibrant.s, 0.65), 0.3]);
    expect(T.b3).toEqual([p.secondary.h, Math.min(p.secondary.s, 0.55), 0.22]);
    expect(T.acc[0]).toBe(p.vibrant.h);
    expect(T.acc[1]).toBe(Math.min(0.85, Math.max(0.45, p.vibrant.s)));
    expect(T.acc[2]).toBe(Math.min(0.74, Math.max(0.62, p.vibrant.l)));
    expect(T.ink).toEqual([p.dominant.h, 0.12, 0.96]);
  });

  it('淺色、手動重點色、黑白封面的重點色彩度 ≤ 0.1', () => {
    const light = extractPalette(pixels([[100, [240, 240, 240]]]));
    const T = computeTheme(light, { mood: 'auto', accentAuto: true, accent: '#000000' });
    expect(T.dark).toBe(false);
    expect(T.base[2]).toBe(0.93);
    expect(T.acc[1]).toBeLessThanOrEqual(0.1);
    expect(T.acc[2]).toBe(Math.min(0.46, Math.max(0.36, light.vibrant.l)));
    expect(T.ink[2]).toBe(0.11);
    const forced = computeTheme(light, { mood: 'dark', accentAuto: false, accent: '#336699' });
    expect(forced.dark).toBe(true);
    expect(hslToHex(forced.acc)).toBe('#336699');
  });
});

describe('版面幾何', () => {
  it('左右：封面 620 px 在 (170, 230)，文字從 910 起、寬 840', () => {
    const L = frameLayout('split');
    expect(L.art).toEqual({ x: 170, y: 230, s: 620 });
    expect(L.text).toMatchObject({ x: 910, w: 840, align: 'left', cy: 540, ts: 78, bars: 48 });
    expect(vizBox(L.text)).toEqual({ x: 910, w: 720 });
  });
  it('中央：封面 480 px 在上方中央、文字置中（中心 y 800）、視覺化 880 寬', () => {
    const L = frameLayout('center');
    expect(L.art).toEqual({ x: 720, y: 84, s: 480 });
    expect(L.text).toMatchObject({ x: 960, w: 1100, align: 'center', cy: 800, lines: 1, bars: 64 });
    expect(vizBox(L.text)).toEqual({ x: 520, w: 880 });
  });
  it('黑膠：封面 580 px、黑膠半徑 280 中心 (685, 540)、文字從 1075 起', () => {
    const L = frameLayout('vinyl');
    expect(L.art).toEqual({ x: 150, y: 250, s: 580 });
    expect(L.vinyl).toEqual({ cx: 685, cy: 540, R: 280 });
    expect(L.text).toMatchObject({ x: 1075, w: 695, ts: 70, bars: 44 });
    expect(vizBox(L.text)).toEqual({ x: 1075, w: 695 });
  });
});

describe('文字的換行與自動縮小', () => {
  const style = { weight: 700, size: 20, title: false };
  it('以空白分詞；太長的詞逐字斷開', () => {
    /* 每字 20 × 0.5 − 20 × 0.03 = 9.4 px */
    expect(wrapText('ab cd ef', 50, style, measure)).toEqual(['ab cd', 'ef']);
    expect(wrapText('一二三四五六七八', 40, style, measure)).toEqual(['一二三四', '五六七八']);
  });
  it('每次小 2 px 直到放得下；到最小還放不下時截斷加「…」', () => {
    const r = fitText('一二三四五六七八九十', 700, 40, 20, 160, 1, true, measure);
    /* 標題字距 −4%：每字 0.46 × 字級；10 字 ≤ 160 → 字級 ≤ 34.7 → 34 */
    expect(r.size).toBe(34);
    expect(r.lines).toEqual(['一二三四五六七八九十']);
    const cut = fitText('一二三四五六七八九十', 700, 40, 38, 160, 1, true, measure);
    expect(cut.size).toBe(38);
    expect(cut.lines).toEqual(['一二三四五六七八…']);
    const two = fitText('一二三四五六七八九十', 700, 40, 40, 160, 2, true, measure);
    expect(two.lines).toEqual(['一二三四五六七八', '九十']);
  });
});

describe('文字區的堆疊', () => {
  const base: StackInput = {
    layout: 'split',
    title: '短標題',
    artist: '歌手',
    subtitle: '',
    viz: 'bars',
    progress: true,
    lyricsActive: false,
    lyricPosition: 'bottom',
    lyricSize: 32,
    lyricShowNext: true,
    translated: false,
  };
  it('標題 → 歌手 → 視覺化 → 進度條，整疊以 540 置中', () => {
    const st = buildStack(base, measure);
    expect(st.items.map((i) => [i.k, Math.round(i.y * 100) / 100])).toEqual([
      ['title', 0],
      ['artist', 110.76],
      ['viz', 206.96],
      ['progress', 342.96],
    ]);
    const total = 342.96 + 44;
    expect(st.top).toBeCloseTo(540 - total / 2);
  });
  it('副標、沒有視覺化時進度條的間距（左右 48、中央 36）', () => {
    const st = buildStack({ ...base, subtitle: '一句話', viz: 'none' }, measure);
    const sub = st.items.find((i) => i.k === 'subtitle')!;
    const prog = st.items.find((i) => i.k === 'progress')!;
    expect(sub.y).toBeCloseTo(110.76 + 44.2 + 8);
    expect(prog.y).toBeCloseTo(162.96 + 24 * 1.35 + 48);
    const center = buildStack({ ...base, layout: 'center', viz: 'none' }, measure);
    const p2 = center.items.find((i) => i.k === 'progress')!;
    const a2 = center.items.find((i) => i.k === 'artist')!;
    expect(p2.y).toBeCloseTo(a2.y + 30 * 1.3 + 36);
  });
  it('歌詞在資訊下方：間距 30（中央 18）、高度；中央版面整疊至少在封面下方 60 px', () => {
    const st = buildStack({ ...base, lyricsActive: true, lyricPosition: 'stack' }, measure);
    const ly = st.items.find((i) => i.k === 'lyrics') as { y: number; h: number };
    expect(ly.y).toBeCloseTo(110.76 + 44.2 + 30);
    expect(ly.h).toBeCloseTo(stackLyricHeight(32, false, true));
    const center = buildStack(
      { ...base, layout: 'center', lyricsActive: true, lyricPosition: 'stack' },
      measure,
    );
    expect(center.top).toBeGreaterThanOrEqual(84 + 480 + 60);
    const viz = center.items.find((i) => i.k === 'viz')!;
    const ly2 = center.items.find((i) => i.k === 'lyrics') as { y: number; h: number };
    expect(viz.y).toBeCloseTo(ly2.y + ly2.h + 40 - 18);
  });
  it('歌詞的大小：資訊下方是 0.75 倍；有翻譯時預告的間距變大', () => {
    expect(stackLyricDims(32, false)).toEqual({ s: 24, t: 18, n: 16, gT: 6, gN: 7 });
    expect(stackLyricDims(32, true)).toEqual({ s: 24, t: 18, n: 16, gT: 6, gN: 23 });
    expect(bottomLyricDims(40, false)).toEqual({ s: 40, t: 26, n: 25, gT: 10, gN: 12 });
    expect(bottomLyricDims(40, true)).toEqual({ s: 40, t: 26, n: 23, gT: 10, gN: 32 });
    expect(stackLyricHeight(32, true, false)).toBeCloseTo(24 * 1.25 + 6 + 18 * 1.25);
  });
});

describe('視覺化', () => {
  it('長條：頻帶平均 ÷ 255、^1.7、往高頻加權、最多 1；往下每 1/60 秒最多掉 0.03', () => {
    const v = createVizState();
    const full = new Uint8Array(1024).fill(255);
    updateViz(v, full, 48, { sampleRate: 48000 });
    expect(v.bars[0]).toBe(1);
    expect(v.bass).toBe(1);
    const half = new Uint8Array(1024).fill(128);
    updateViz(v, half, 48, { sampleRate: 48000, frames: 2 });
    expect(v.bars[0]).toBeCloseTo(0.94, 5);
    expect(v.bass).toBeCloseTo(Math.max(128 / 255, 0.81), 5);
    const zero = new Uint8Array(1024);
    for (let i = 0; i < 40; i++) updateViz(v, zero, 48, { sampleRate: 48000 });
    expect(v.bars[0]).toBe(0);
    expect(vizSettling(v, 48)).toBe(true);
    for (let i = 0; i < 200; i++) updateViz(v, zero, 48, { sampleRate: 48000 });
    expect(vizSettling(v, 48)).toBe(false);
  });
  it('單一頻帶的值：((x ÷ 255)^1.7) × (1 + 0.7 i ÷ n) × 1.12', () => {
    const v = createVizState();
    const f = new Uint8Array(1024).fill(100);
    updateViz(v, f, 10, { sampleRate: 48000 });
    expect(v.bars[5]).toBeCloseTo(Math.min(1, (100 / 255) ** 1.7 * (1 + 0.35) * 1.12), 5);
  });
  it('隨節拍的放大、音量表、示意長條、整首波形', () => {
    expect(beatScale(0)).toBe(1);
    expect(beatScale(1)).toBeCloseTo(1.03);
    expect(meterLevel({ live: true, bass: 0.5, motion: true, ph: 0 })).toBe(Math.round(0.625 * 14));
    expect(meterLevel({ live: false, bass: 0, motion: false, ph: 3 })).toBe(Math.round(0.55 * 14));
    expect(fakeBar(0, 0)).toBeCloseTo(0.14 + 0.34 * 0.5 * 0.6 + 0.28 * 0.125);
    expect(FAKE_PEAKS).toHaveLength(220);
    expect(Math.min(...FAKE_PEAKS)).toBeGreaterThanOrEqual(0.08);
    expect(Math.max(...FAKE_PEAKS)).toBeLessThanOrEqual(1);
    expect(peakCount(720)).toBe(80);
    expect(peakAt(FAKE_PEAKS, 40, 80)).toBe(FAKE_PEAKS[110]);
  });
  it('波形：靜音是一條直線；兩端收尖', () => {
    const flat = wavePoints(new Uint8Array(2048).fill(128), 0);
    expect(flat).toHaveLength(141);
    expect(flat.every((v) => Math.abs(v) < 1e-12)).toBe(true);
    const loud = wavePoints(new Uint8Array(2048).fill(255), 0);
    expect(loud[0]).toBe(0);
    expect(loud[70]).toBeCloseTo(1);
  });
});

describe('時間、設定、檔名', () => {
  it('分:秒 的寫法與解析（時:分:秒、秒數、全形）', () => {
    expect(formatClock(663)).toBe('11:03');
    expect(formatClock(59.9)).toBe('0:59');
    expect(parseClock('11:03')).toBe(663);
    expect(parseClock('1:02:03')).toBe(3723);
    expect(parseClock('90.5')).toBe(90.5);
    expect(parseClock('０：３０')).toBe(30);
    expect(Number.isNaN(parseClock('abc'))).toBe(true);
    expect(Number.isNaN(parseClock(''))).toBe(true);
    expect(Number.isNaN(parseClock('1::2'))).toBe(true);
  });
  it('字型堆疊：等寬、像素體的退路有 monospace（ui-monospace 只有 Safari 認得），中文再退回黑體', () => {
    for (const id of ['mono', 'pixel'] as const) {
      const list = fontStack(id)
        .split(',')
        .map((f) => f.trim());
      expect(list).toContain('ui-monospace');
      expect(list).toContain('monospace');
      expect(list.indexOf('monospace')).toBeLessThan(list.indexOf('sans-serif'));
    }
    expect(fontStack('mono').startsWith('"Roboto Mono", "Noto Sans TC", ')).toBe(true);
    expect(
      fontStack('sans')
        .split(',')
        .map((f) => f.trim()),
    ).not.toContain('monospace');
  });
  it('科技風的時間碼（每秒 30 格）', () => {
    expect(timecode(328)).toBe('00:05:28:00');
    expect(timecode(3723.5)).toBe('01:02:03:15');
  });
  it('左下角文字跟著 FPS；中央版面的歌詞一律在資訊下方', () => {
    const s = defaultSettings();
    expect(hudTextOf(s)).toBe(autoHudText(30));
    s.export.fps = 60;
    expect(hudTextOf(s)).toBe('60 FPS');
    s.hudTextAuto = false;
    s.hudText = '第一章';
    expect(hudTextOf(s)).toBe('第一章');
    s.layout = 'center';
    expect(lyricPositionOf(s)).toBe('stack');
  });
  it('正規化：不認得的值換成預設、數值夾在範圍、步進對齊', () => {
    const s = normalizeSettings({
      layout: 'weird',
      radius: 99,
      accent: 'red',
      lyrics: { size: 31, offset: 2.04, text: 5 },
      export: { fps: 24, loopLength: 1 },
      cover: { id: 'abc', name: 'x.png' },
    });
    expect(s.layout).toBe('split');
    expect(s.radius).toBe(48);
    expect(s.accent).toBe(defaultSettings().accent);
    expect(s.lyrics.size).toBe(32);
    expect(s.lyrics.offset).toBe(2);
    expect(s.lyrics.text).toBe('');
    expect(s.export.fps).toBe(30);
    expect(s.export.loopLength).toBe(4);
    expect(s.cover).toEqual({ id: 'abc', name: 'x.png' });
    expect(s.audio).toEqual({ id: null, name: '' });
    expect(normalizeSettings(null)).toEqual(defaultSettings());
  });
  it('檔名「標題 - 歌手」：拿掉不能用的字、最多 80 字、都空白時「播放畫面」', () => {
    expect(fileBase({ title: '序曲: 開始?', artist: '樂團/A' })).toBe('序曲 開始 - 樂團A');
    expect(fileBase({ title: '', artist: '' })).toBe('播放畫面');
    expect(fileBase({ title: 'x'.repeat(100), artist: '' })).toHaveLength(80);
  });
  it('匯出範圍：整首、區間（夾在曲長內）、不到 1 秒時 null', () => {
    const s = defaultSettings();
    expect(exportRange(s, 200)).toEqual({ start: 0, end: 200 });
    s.export.range = 'part';
    s.export.start = 10;
    s.export.end = 40;
    expect(exportRange(s, 200)).toEqual({ start: 10, end: 40 });
    expect(exportRange(s, 30)).toEqual({ start: 10, end: 30 });
    s.export.end = 10.5;
    expect(exportRange(s, 200)).toBeNull();
    expect(exportRange(defaultSettings(), 0.5)).toBeNull();
  });
});
