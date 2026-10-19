/**
 * 錄影帶畫面產生器的規則（規格 docs/refactor/specs/vhs-frame.md）：
 * 尺寸、時間（錄影帶的格、GIF 的 24 格）、字幕（前兩行、逐字打出）、時間碼（播放時間、日期時間）、照片的位置（夾回範圍、拖曳、以一點縮放）、
 * 磨損度的描述、檔名、存檔的整理；調色的備用算法（畫布不支援濾鏡時）。
 */
import { describe, expect, it } from 'vitest';
import {
  addClockSeconds,
  animSize,
  captionHasExtra,
  captionLines,
  clampView,
  coverScale,
  DEFAULT_CLOCK_START,
  exportFileName,
  fileBase,
  formatTape,
  frameText,
  GIF_DURATION,
  GIF_FRAMES,
  gifChars,
  gifFrameAt,
  gifFrameTime,
  heightFor,
  initialState,
  masterWidthFor,
  minZoom,
  normalizeState,
  panView,
  parseClockStart,
  parseTapeStart,
  screenSize,
  stateAssetIds,
  TAPE_LOOP,
  tapeFrameTime,
  tidyOsd,
  timecodeText,
  typedLines,
  viewRect,
  wearLevel,
  wheelPixels,
  zoomViewAt,
  zoomViewTo,
} from '@/tools/vhs-frame/model';
import { gradePixels, osdRuns, rnd } from '@/tools/vhs-frame/render';

describe('尺寸', () => {
  it('畫面 1280 × 960／1280 × 720；動畫小中大；照片層的合成寬度', () => {
    expect(screenSize('4:3')).toEqual({ width: 1280, height: 960 });
    expect(screenSize('16:9')).toEqual({ width: 1280, height: 720 });
    expect([0, 1, 2].map((i) => animSize('4:3', i))).toEqual([
      { width: 360, height: 270 },
      { width: 480, height: 360 },
      { width: 640, height: 480 },
    ]);
    expect([0, 1, 2].map((i) => animSize('16:9', i))).toEqual([
      { width: 480, height: 270 },
      { width: 640, height: 360 },
      { width: 854, height: 480 },
    ]);
    expect(animSize('4:3', 9)).toEqual({ width: 640, height: 480 });
    expect(heightFor(720, '4:3')).toBe(540);
    expect(heightFor(720, '16:9')).toBe(405);
    expect(heightFor(854, '16:9')).toBe(480);
    expect(masterWidthFor(360)).toBe(720);
    expect(masterWidthFor(640)).toBe(720);
    expect(masterWidthFor(854)).toBe(854);
    expect(masterWidthFor(1280)).toBe(1280);
  });
});

describe('時間', () => {
  it('錄影帶：每 1/24 秒一格、0～58 秒', () => {
    expect(tapeFrameTime(0)).toBe(0);
    expect(tapeFrameTime(1 / 24)).toBe(1 / 24);
    expect(tapeFrameTime(5)).toBe(5);
    expect(tapeFrameTime(5.03)).toBe(120 / 24);
    expect(tapeFrameTime(5.05)).toBe(121 / 24);
    expect(tapeFrameTime(-1)).toBe(0);
    expect(tapeFrameTime(TAPE_LOOP)).toBe((TAPE_LOOP * 24 - 1) / 24);
  });

  it('GIF：24 格、每格 0.09 秒（與原作同一個算式）', () => {
    expect(GIF_FRAMES).toBe(24);
    expect(GIF_DURATION).toBeCloseTo(2.16, 10);
    for (let f = 0; f < 24; f++) expect(gifFrameTime(f)).toBe(f * 0.09);
    expect(gifFrameAt(0)).toBe(0);
    expect(gifFrameAt(0.09)).toBe(1);
    expect(gifFrameAt(0.17)).toBe(1);
    expect(gifFrameAt(2.159)).toBe(23);
    expect(gifFrameAt(5)).toBe(23);
  });
});

describe('字幕', () => {
  it('前兩行、去掉頭尾空白、拿掉空行；第 3 行以後提醒', () => {
    expect(captionLines('  一  \n二\n三')).toEqual(['一', '二']);
    expect(captionLines('\n第二行')).toEqual(['第二行']);
    expect(captionLines('一\r\n二')).toEqual(['一', '二']);
    expect(captionLines('   ')).toEqual([]);
    expect(captionHasExtra('一\n二\n三')).toBe(true);
    expect(captionHasExtra('一\n二\n  ')).toBe(false);
  });

  it('逐字打出：從第 1 行接到第 2 行，以字元計（emoji 不切開）', () => {
    const lines = ['你好', '世界😀'];
    expect(typedLines(lines, 0)).toEqual([]);
    expect(typedLines(lines, 1)).toEqual(['你']);
    expect(typedLines(lines, 2)).toEqual(['你好']);
    expect(typedLines(lines, 3)).toEqual(['你好', '世']);
    expect(typedLines(lines, 5)).toEqual(['你好', '世界😀']);
    expect(typedLines(lines, 99)).toEqual(['你好', '世界😀']);
  });

  it('GIF 第 f 格打出 round((f − 3) ÷ 14 × N) 個字，夾在 0～N（同原作）', () => {
    expect(gifChars(0, 0)).toBeNull();
    const n = 20;
    const got = Array.from({ length: 24 }, (_, f) => gifChars(f, n));
    expect(got.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(got[4]).toBe(1);
    expect(got[10]).toBe(10);
    expect(got[17]).toBe(20);
    expect(got[23]).toBe(20);
    /* 字少時更晚才出現第一個字 */
    expect(gifChars(4, 5)).toBe(0);
    expect(gifChars(5, 5)).toBe(1);
  });

  it('frameText：字幕、左上文字（去掉空白；空的＝null）、時間碼', () => {
    const s = { ...initialState(), caption: '你好\n世界', osd: '  REC ●  ' };
    expect(frameText(s, 5)).toEqual({
      caption: ['你好', '世界'],
      captionFull: ['你好', '世界'],
      osd: 'REC ●',
      timecode: '0:00:19',
    });
    expect(frameText(s, 0.09 * 7, 7).caption).toEqual(['你']);
    expect(frameText(s, 0.09 * 13, 13).caption).toEqual(['你好', '世']);
    expect(frameText({ ...s, osd: '   ' }, 0).osd).toBeNull();
  });

  it('左上文字：單行、最多 14 字', () => {
    expect(tidyOsd('REC\n●')).toBe('REC ●');
    expect(tidyOsd('一二三四五六七八九十一二三四五')).toBe('一二三四五六七八九十一二三四');
  });

  it('「●」另外一段（畫成紅色）', () => {
    expect(osdRuns('▶ PLAY')).toEqual([{ text: '▶ PLAY', dot: false }]);
    expect(osdRuns('REC ●')).toEqual([
      { text: 'REC ', dot: false },
      { text: '●', dot: true },
    ]);
    expect(osdRuns('●● A ●')).toEqual([
      { text: '●●', dot: true },
      { text: ' A ', dot: false },
      { text: '●', dot: true },
    ]);
  });
});

describe('時間碼', () => {
  it('播放時間：起點 ＋ t（捨去）；時不補零', () => {
    const tc = { mode: 'tape' as const, tape: 14, clock: DEFAULT_CLOCK_START };
    expect(timecodeText(tc, 0)).toBe('0:00:14');
    expect(timecodeText(tc, 0.99)).toBe('0:00:14');
    expect(timecodeText(tc, 46)).toBe('0:01:00');
    expect(timecodeText({ ...tc, tape: 3599 }, 1)).toBe('1:00:00');
    expect(timecodeText({ ...tc, mode: 'off' }, 0)).toBeNull();
    expect(formatTape(5025)).toBe('1:23:45');
    /* GIF：起點 14 時只出現 0:00:14～0:00:16 */
    const shown = new Set(Array.from({ length: 24 }, (_, f) => timecodeText(tc, gifFrameTime(f))));
    expect([...shown]).toEqual(['0:00:14', '0:00:15', '0:00:16']);
  });

  it('播放時間的起點：秒、分:秒、時:分:秒（全形也可以）；超出範圍不合法', () => {
    expect(parseTapeStart('14')).toBe(14);
    expect(parseTapeStart('1:30')).toBe(90);
    expect(parseTapeStart('0:00:14')).toBe(14);
    expect(parseTapeStart('1:23:45')).toBe(5025);
    expect(parseTapeStart('１：２３：４５')).toBe(5025);
    expect(parseTapeStart(' 99:59:59 ')).toBe(359999);
    expect(parseTapeStart('100:00:00')).toBeNull();
    expect(parseTapeStart('1:60')).toBeNull();
    expect(parseTapeStart('1:60:00')).toBeNull();
    expect(parseTapeStart('abc')).toBeNull();
    expect(parseTapeStart('')).toBeNull();
    expect(parseTapeStart('360000')).toBeNull();
  });

  it('日期時間：寫法、整理、加秒（照曆法進位）', () => {
    expect(parseClockStart('2026-10-31 03:14:15')).toBe('2026-10-31 03:14:15');
    expect(parseClockStart('2026/1/2 3:04')).toBe('2026-01-02 03:04:00');
    expect(parseClockStart('2026-01-02T23:59:59')).toBe('2026-01-02 23:59:59');
    expect(parseClockStart('2026-01-02')).toBe('2026-01-02 00:00:00');
    expect(parseClockStart('２０２６－１０－３１　０３：１４：１５')).toBe('2026-10-31 03:14:15');
    expect(parseClockStart('2026-02-29 00:00:00')).toBeNull();
    expect(parseClockStart('2024-02-29 00:00:00')).toBe('2024-02-29 00:00:00');
    expect(parseClockStart('2026-13-01 00:00:00')).toBeNull();
    expect(parseClockStart('2026-10-31 24:00:00')).toBeNull();
    expect(parseClockStart('0999-10-31 00:00:00')).toBeNull();
    expect(addClockSeconds('2026-12-31 23:59:59', 1.9)).toBe('2027-01-01 00:00:00');
    expect(addClockSeconds('2024-02-28 23:59:58', 3)).toBe('2024-02-29 00:00:01');
    const tc = { mode: 'clock' as const, tape: 14, clock: '2026-10-31 03:14:15' };
    expect(timecodeText(tc, 5.5)).toBe('2026-10-31 03:14:20');
  });
});

describe('照片的位置', () => {
  const box = screenSize('4:3');
  const wide = { width: 3000, height: 1000 };
  const tall = { width: 1000, height: 2000 };

  it('蓋滿、置中（預設）；可以縮小到整張放入', () => {
    expect(coverScale(wide, box)).toBe(0.96);
    const r = viewRect(wide, box, { zoom: 1, x: 0, y: 0 });
    expect(r.width).toBeCloseTo(2880);
    expect(r.height).toBeCloseTo(960);
    expect(r.x).toBeCloseTo(-800);
    expect(r.y).toBeCloseTo(0);
    expect(minZoom(wide, box)).toBeCloseTo(1280 / 3000 / 0.96, 10);
    expect(minZoom({ width: 4000, height: 3000 }, box)).toBe(1);
  });

  it('夾回範圍：大的那一邊不露黑底、小的那一邊置中、縮放 下限～8', () => {
    const far = clampView(wide, box, { zoom: 1, x: 5, y: 5 });
    const r = viewRect(wide, box, far);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(0);
    expect(clampView(wide, box, { zoom: 20, x: 0, y: 0 }).zoom).toBe(8);
    const lo = minZoom(tall, box);
    const small = clampView(tall, box, { zoom: 0.01, x: 0.3, y: 0.2 });
    expect(small.zoom).toBeCloseTo(lo, 10);
    expect(small.x).toBeCloseTo(0, 10);
    expect(small.y).toBeCloseTo(0, 10);
    /* 縮小到一半（直式照片的寬比畫面小）：左右置中、上下照樣夾 */
    const mid = clampView(tall, box, { zoom: lo * 1.2, x: 0.4, y: 9 });
    const rm = viewRect(tall, box, mid);
    expect(rm.x + rm.width / 2).toBeCloseTo(640);
    expect(rm.y).toBeCloseTo(0);
    expect(rm.height).toBeGreaterThan(960);
  });

  it('拖曳：照片跟著移動，拖過頭時從夾住之前的位置算回來', () => {
    const from = clampView(wide, box, { zoom: 1, x: 0, y: 0 });
    const moved = panView(wide, box, from, 100, 50);
    expect(viewRect(wide, box, moved).x).toBeCloseTo(-700);
    expect(viewRect(wide, box, moved).y).toBeCloseTo(0);
    /* 拖過頭（往右 1000，最多 800） */
    const over = panView(wide, box, from, 1000, 0);
    expect(viewRect(wide, box, over).x).toBeCloseTo(0);
    /* 同一次拖曳回到 +300（從起點算） */
    expect(viewRect(wide, box, panView(wide, box, from, 300, 0)).x).toBeCloseTo(-500);
  });

  it('以一點縮放：那一點下的照片位置不動（同原作）；＋三次＝1.15³', () => {
    const v0 = clampView(wide, box, { zoom: 1, x: 0, y: 0 });
    const v1 = zoomViewAt(wide, box, v0, 300, 400, 2);
    const r0 = viewRect(wide, box, v0);
    const r1 = viewRect(wide, box, v1);
    const ix0 = (300 - r0.x) / (r0.width / wide.width);
    const ix1 = (300 - r1.x) / (r1.width / wide.width);
    expect(ix1).toBeCloseTo(ix0, 6);
    expect(v1.zoom).toBe(2);
    let v = v0;
    for (let i = 0; i < 3; i++) v = zoomViewAt(wide, box, v, 640, 480, 1.15);
    expect(v.zoom).toBeCloseTo(1.15 ** 3, 12);
    /* 原作對照（對等驗證腳本）：再往右 60、往下 30 */
    v = panView(wide, box, v, 60, 30);
    const rv = viewRect(wide, box, v);
    expect(rv.x).toBeCloseTo(-1490.06, 2);
    expect(rv.y).toBeCloseTo(-220.02, 2);
    expect(zoomViewTo(wide, box, v0, 3).zoom).toBeCloseTo(3, 10);
  });

  it('滾動量：以行、頁計的換成 px', () => {
    expect(wheelPixels(100, 0, 800)).toBe(100);
    expect(wheelPixels(3, 1, 800)).toBe(48);
    expect(wheelPixels(1, 2, 800)).toBe(800);
  });
});

describe('磨損度、檔名、存檔', () => {
  it('磨損度的五段描述', () => {
    expect([0, 11, 12, 31, 32, 57, 58, 85, 86, 100].map(wearLevel)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });

  it('檔名：照片檔名去掉副檔名＋-vhs；沒有照片時 screen', () => {
    expect(fileBase('my.photo.jpg')).toBe('my.photo');
    expect(fileBase(null)).toBe('screen');
    expect(fileBase('')).toBe('screen');
    expect(exportFileName('cat.png', 'png')).toBe('cat-vhs.png');
    expect(exportFileName('cat.png', 'gif')).toBe('cat-vhs.gif');
    expect(exportFileName(null, 'apng')).toBe('screen-vhs-anim.png');
    expect(exportFileName('相片.jpeg', 'webp')).toBe('相片-vhs.webp');
  });

  it('整理存檔：不認得的換成預設、數值夾在範圍內、位置夾回範圍', () => {
    expect(normalizeState(undefined)).toEqual(initialState());
    const s = normalizeState({
      photo: { id: 'abc', name: 'w.png', width: 3000, height: 1000 },
      view: { zoom: 99, x: 5, y: -5 },
      caption: 'x'.repeat(100),
      osd: 'REC\n●',
      osdFont: 'comic',
      timecode: { mode: 'clock', tape: -5, clock: '2026-02-30 00:00:00' },
      wear: 123.4,
      aspect: '21:9',
    });
    expect(s.caption).toHaveLength(80);
    expect(s.osd).toBe('REC ●');
    expect(s.osdFont).toBe('mono');
    expect(s.timecode).toEqual({ mode: 'clock', tape: 0, clock: DEFAULT_CLOCK_START });
    expect(s.wear).toBe(100);
    expect(s.aspect).toBe('4:3');
    expect(s.view.zoom).toBe(8);
    const r = viewRect(s.photo as { width: number; height: number }, screenSize('4:3'), s.view);
    expect(r.x).toBeLessThanOrEqual(1e-9);
    expect(r.x + r.width).toBeGreaterThanOrEqual(1280 - 1e-9);
    expect(stateAssetIds(s)).toEqual(['abc']);
    /* 照片的資料壞掉：當作沒有照片，位置歸零 */
    const bad = normalizeState({ photo: { id: '', width: 0 }, view: { zoom: 3 } });
    expect(bad.photo).toBeNull();
    expect(bad.view).toEqual({ zoom: 1, x: 0, y: 0 });
  });
});

describe('畫法的輔助', () => {
  it('rnd：同一個整數永遠相同、在 0～1', () => {
    for (const n of [0, 1, 7, 91, 12345]) {
      expect(rnd(n)).toBe(rnd(n));
      expect(rnd(n)).toBeGreaterThanOrEqual(0);
      expect(rnd(n)).toBeLessThan(1);
    }
    const v = Math.sin(311.7) * 43758.5453;
    expect(rnd(0)).toBe(v - Math.floor(v));
  });

  it('調色的備用算法：CSS saturate(0.78) contrast(0.9) brightness(1.06)', () => {
    const px = new Uint8ClampedArray([
      255, 0, 0, 255, 128, 128, 128, 255, 0, 0, 0, 255, 255, 255, 255, 255,
    ]);
    gradePixels(px);
    /* 灰色：飽和度不變，(0.502 − 0.5) × 0.9 ＋ 0.5 → × 1.06 */
    expect(px[4]).toBe(Math.round(((128 / 255 - 0.5) * 0.9 + 0.5) * 1.06 * 255));
    expect(px[4]).toBe(px[5]);
    /* 黑：0.05 × 1.06；白：0.95 × 1.06 → 1.007 夾到 1 */
    expect(px[8]).toBe(Math.round(0.05 * 1.06 * 255));
    expect(px[12]).toBe(255);
    /* 紅：飽和度 0.78 的矩陣 */
    const r = 0.213 + 0.787 * 0.78;
    const g = 0.213 - 0.213 * 0.78;
    expect(px[0]).toBe(Math.round(Math.min(1, ((r - 0.5) * 0.9 + 0.5) * 1.06) * 255));
    expect(px[1]).toBe(Math.round(((g - 0.5) * 0.9 + 0.5) * 1.06 * 255));
    expect(px[3]).toBe(255);
  });
});
