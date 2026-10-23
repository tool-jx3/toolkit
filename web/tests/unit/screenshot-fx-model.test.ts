/**
 * 截圖演出產生器的規則（規格 docs/refactor/specs/screenshot-fx.md）：畫面大小與擺放、框的座標換算、
 * 時間軸的分段與依序／同時、各框的進度、塗黑蓋住的範圍、放大框彈出的位置、APNG／影片的影格、檔名、存檔與專案檔的整理。
 */
import { describe, expect, it } from 'vitest';
import { parseProjectBytes, serializeProjectZip } from '@/core/storage';
import {
  actionProgress,
  apngTimes,
  buildTimeline,
  canvasSize,
  cardRect,
  clampRect,
  computeLayout,
  coverSpan,
  duplicateFrame,
  evenSize,
  exportFileName,
  type Frame,
  type FxState,
  initialDefaults,
  initialState,
  kindIndex,
  LIMITS,
  makeFrame,
  normalizeDefaults,
  normalizeState,
  popupAlpha,
  popupProgress,
  rectFromDrag,
  snapRange,
  spanRect,
  timelineSegments,
  toCanvasRect,
  toSourcePoint,
  toSourceRect,
  videoTimes,
  windowProgress,
  zoomFactor,
} from '@/tools/screenshot-fx/model';
import { mosaicCells } from '@/tools/screenshot-fx/render';

const IMG = { id: 'abc', name: 'shot.png', width: 1280, height: 820 };
const d = initialDefaults();
const zoom = (id: string, x = 100, y = 100, w = 200, h = 100): Frame =>
  makeFrame('zoom', { x, y, w, h }, d, id);
const marker = (id: string, x = 120, y = 120, w = 80, h = 20): Frame =>
  makeFrame('marker', { x, y, w, h }, d, id);
const redact = (id: string, mode: 'static' | 'reveal' | 'conceal' = 'reveal'): Frame => ({
  ...(makeFrame('redact', { x: 300, y: 300, w: 60, h: 20 }, d, id) as Extract<
    Frame,
    { kind: 'redact' }
  >),
  mode,
});
const withFrames = (frames: Frame[], patch: Partial<FxState> = {}): FxState => ({
  ...initialState(),
  image: { ...IMG },
  frames,
  ...patch,
});

describe('畫面大小', () => {
  it('三種預設與原圖大小（長邊超過 4096 時等比縮小；沒有圖時 1920 × 1080）', () => {
    expect(canvasSize('1920x1080', null)).toEqual({ width: 1920, height: 1080 });
    expect(canvasSize('1080x1920', IMG)).toEqual({ width: 1080, height: 1920 });
    expect(canvasSize('1200x900', IMG)).toEqual({ width: 1200, height: 900 });
    expect(canvasSize('original', IMG)).toEqual({ width: 1280, height: 820 });
    expect(canvasSize('original', { width: 8192, height: 2000 })).toEqual({
      width: 4096,
      height: 1000,
    });
    expect(canvasSize('original', null)).toEqual({ width: 1920, height: 1080 });
  });

  it('影片的寬高往下取偶數', () => {
    expect(evenSize({ width: 1281, height: 821 })).toEqual({ width: 1280, height: 820 });
    expect(evenSize({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
    expect(evenSize({ width: 1, height: 1 })).toEqual({ width: 2, height: 2 });
  });
});

describe('截圖的擺放與出處', () => {
  it('等比放進「畫面 × 比例」、置中', () => {
    const l = computeLayout(withFrames([]), IMG);
    const f = Math.min((1920 * 0.86) / 1280, (1080 * 0.86) / 820);
    expect(l.shot.f).toBeCloseTo(f, 9);
    expect(l.shot.w).toBeCloseTo(1280 * f, 6);
    expect(l.shot.x).toBeCloseTo((1920 - 1280 * f) / 2, 6);
    expect(l.shot.y).toBeCloseTo((1080 - 820 * f) / 2, 6);
    expect(l.credit).toBeNull();
  });

  it('出處在圖下：先扣掉一行字的高度，圖與出處一起置中；文字靠圖的右緣', () => {
    const s = withFrames([], { credit: { text: '出處：測試', pos: 'below', size: 'md' } });
    const l = computeLayout(s, IMG);
    const px = 26;
    expect(l.credit?.px).toBe(px);
    const reserve = Math.round(px * 1.9);
    expect(l.shot.h).toBeCloseTo(1080 * 0.86 - reserve, 6);
    expect(l.shot.y).toBeCloseTo((1080 - l.shot.h - reserve) / 2, 6);
    expect(l.credit?.x).toBeCloseTo(l.shot.x + l.shot.w, 6);
    expect(l.credit?.align).toBe('right');
  });

  it('出處在畫面底部置中、在圖內是右下角；字級依短邊縮放（小中大＝20、26、34 ÷ 1080）', () => {
    const bottom = computeLayout(
      withFrames([], { credit: { text: 'x', pos: 'bottom', size: 'lg' } }),
      IMG,
    );
    expect(bottom.credit).toMatchObject({ x: 960, align: 'center', px: 34 });
    const badge = computeLayout(
      withFrames([], {
        canvas: '1200x900',
        credit: { text: 'x', pos: 'badge', size: 'sm' },
      }),
      IMG,
    );
    expect(badge.credit?.px).toBe(Math.round(20 * (900 / 1080)));
    expect(badge.credit?.x).toBeLessThan(badge.shot.x + badge.shot.w);
    /* 空白的出處不畫 */
    expect(
      computeLayout(withFrames([], { credit: { text: '  ', pos: 'below', size: 'md' } }), IMG)
        .credit,
    ).toBeNull();
  });
});

describe('框的座標（原圖 px ↔ 畫面 px）', () => {
  const shot = { x: 100, y: 50, w: 640, h: 410, f: 0.5 };

  it('來回換算一致', () => {
    const r = { x: 200, y: 100, w: 300, h: 60 };
    const c = toCanvasRect(shot, r);
    expect(c).toEqual({ x: 200, y: 100, w: 150, h: 30 });
    expect(toSourceRect(shot, c)).toEqual(r);
  });

  it('畫面上的點夾在圖裡', () => {
    expect(toSourcePoint(shot, IMG, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(toSourcePoint(shot, IMG, 2000, 2000)).toEqual({ x: 1280, y: 820 });
    expect(toSourcePoint(shot, IMG, 300, 150)).toEqual({ x: 400, y: 200 });
  });

  it('拖曳畫出的範圍：任何方向都可以、夾在圖裡、太小時當成點一下', () => {
    expect(rectFromDrag({ x: 500, y: 400 }, { x: 300, y: 350 }, IMG)).toEqual({
      x: 300,
      y: 350,
      w: 200,
      h: 50,
    });
    expect(rectFromDrag({ x: 1200, y: 800 }, { x: 1500, y: 900 }, IMG)).toEqual({
      x: 1200,
      y: 800,
      w: 80,
      h: 20,
    });
    expect(rectFromDrag({ x: 10, y: 10 }, { x: 12, y: 40 }, IMG)).toBeNull();
  });

  it('範圍取整、至少 4 px、夾在圖裡', () => {
    expect(clampRect({ x: -5.4, y: 810.2, w: 2, h: 30.6 }, IMG)).toEqual({
      x: 0,
      y: 789,
      w: LIMITS.minSize,
      h: 31,
    });
    expect(clampRect({ x: 100, y: 100, w: 5000, h: 10 }, IMG)).toEqual({
      x: 0,
      y: 100,
      w: 1280,
      h: 10,
    });
  });

  it('複製：往右下移 16 px（夾在圖裡）、新的 id；序號依種類算', () => {
    const z = zoom('a', 1100, 700, 180, 120);
    const copy = duplicateFrame(z, IMG, 'b');
    expect(copy).toMatchObject({ id: 'b', kind: 'zoom', x: 1100, y: 700, w: 180, h: 120 });
    expect(duplicateFrame(marker('m', 10, 10), IMG, 'n')).toMatchObject({ x: 26, y: 26 });
    const frames = [zoom('z1'), marker('m1'), zoom('z2'), marker('m2')];
    expect(kindIndex(frames, 'z2')).toBe(2);
    expect(kindIndex(frames, 'm1')).toBe(1);
    expect(kindIndex(frames, 'nope')).toBe(0);
  });
});

describe('時間軸', () => {
  const timing = initialState().timing;

  it('四段依序：開場 → 彈出 → 動作 → 結尾（預設 0.5＋0.6＋1.2＋2.0）', () => {
    const tl = buildTimeline(timing, [zoom('z')]);
    expect(tl.phases.intro).toEqual({ start: 0, end: 0.5 });
    expect(tl.phases.popup).toEqual({ start: 0.5, end: 1.1 });
    expect(tl.phases.action).toEqual({ start: 1.1, end: 2.3 });
    expect(tl.phases.outro).toEqual({ start: 2.3, end: 4.3 });
    expect(tl.total).toBe(4.3);
    expect(tl.actionIds).toEqual([]);
  });

  it('依序：會動的框照清單順序一個接一個，每個佔「動作」秒數；靜止的塗黑不算', () => {
    const frames = [marker('m1'), zoom('z'), redact('r1', 'static'), redact('r2'), marker('m2')];
    const tl = buildTimeline(timing, frames);
    expect(tl.actionIds).toEqual(['m1', 'r2', 'm2']);
    expect(tl.windows.m1).toEqual({ start: 1.1, end: 2.3 });
    expect(tl.windows.r2).toEqual({ start: 2.3, end: 3.5 });
    expect(tl.windows.m2).toEqual({ start: 3.5, end: 4.7 });
    expect(tl.phases.action).toEqual({ start: 1.1, end: 4.7 });
    expect(tl.total).toBe(6.7);
  });

  it('同時：全部一起，動作段＝秒數', () => {
    const frames = [marker('m1'), redact('r2', 'conceal'), marker('m2')];
    const tl = buildTimeline({ ...timing, order: 'simultaneous' }, frames);
    for (const id of ['m1', 'r2', 'm2']) expect(tl.windows[id]).toEqual({ start: 1.1, end: 2.3 });
    expect(tl.total).toBe(4.3);
  });

  it('秒數取到微秒（0.1 秒的加總不會出現 4.6999…）', () => {
    const tl = buildTimeline({ ...timing, intro: 0.1, popup: 0.2, action: 0.1, outro: 0.3 }, [
      marker('a'),
      marker('b'),
      marker('c'),
    ]);
    expect(tl.total).toBe(0.9);
    expect(tl.windows.c).toEqual({ start: 0.5, end: 0.6 });
  });

  it('分段色條：長度 0 的段不列', () => {
    const tl = buildTimeline({ ...timing, intro: 0, outro: 0 }, []);
    const segs = timelineSegments(tl, {
      intro: '開場',
      popup: '彈出',
      action: '動作',
      outro: '結尾',
    });
    expect(segs.map((s) => s.id)).toEqual(['popup', 'action']);
    expect(segs[1]).toMatchObject({ label: '動作', start: 0.6, end: 1.8 });
  });

  it('進度：彈出、每個框的動作；不會動的框一律 1；長度 0 時到了就是 1', () => {
    const frames = [marker('m1'), marker('m2'), redact('s', 'static')];
    const tl = buildTimeline(timing, frames);
    expect(popupProgress(tl, 0)).toBe(0);
    expect(popupProgress(tl, 0.8)).toBeCloseTo(0.5, 9);
    expect(popupProgress(tl, 5)).toBe(1);
    expect(actionProgress(tl, 'm1', 1.7)).toBeCloseTo(0.5, 9);
    expect(actionProgress(tl, 'm2', 1.7)).toBe(0);
    expect(actionProgress(tl, 'm2', 3.5)).toBe(1);
    expect(actionProgress(tl, 's', 0)).toBe(1);
    expect(windowProgress({ start: 1, end: 1 }, 0.99)).toBe(0);
    expect(windowProgress({ start: 1, end: 1 }, 1)).toBe(1);
  });
});

describe('塗黑與螢光筆的範圍', () => {
  it('靜止一直全蓋；解除從起點剝開；抹消從起點蓋上', () => {
    expect(coverSpan('static', 0)).toEqual([0, 1]);
    expect(coverSpan('static', 0.7)).toEqual([0, 1]);
    expect(coverSpan('reveal', 0)).toEqual([0, 1]);
    expect(coverSpan('reveal', 0.25)).toEqual([0.25, 1]);
    expect(coverSpan('reveal', 1)).toEqual([1, 1]);
    expect(coverSpan('conceal', 0)).toEqual([0, 0]);
    expect(coverSpan('conceal', 0.6)).toEqual([0, 0.6]);
    expect(coverSpan('conceal', 2)).toEqual([0, 1]);
  });

  it('沿方向取一段（橫向左→右、直向上→下）', () => {
    const r = { x: 10, y: 20, w: 100, h: 40 };
    expect(spanRect(r, 'h', 0.25, 1)).toEqual({ x: 35, y: 20, w: 75, h: 40 });
    expect(spanRect(r, 'v', 0, 0.5)).toEqual({ x: 10, y: 20, w: 100, h: 20 });
    expect(spanRect(r, 'h', 1, 1).w).toBe(0);
  });

  it('馬賽克的格數：粒大小以截圖原本的大小（畫面 px）計', () => {
    const f = { ...(redact('r') as Extract<Frame, { kind: 'redact' }>), w: 120, h: 30, grain: 12 };
    expect(mosaicCells(f, 1)).toEqual({ cols: 10, rows: 3 });
    expect(mosaicCells(f, 0.5)).toEqual({ cols: 5, rows: 1 });
    expect(mosaicCells({ ...f, w: 3, h: 3 }, 1)).toEqual({ cols: 1, rows: 1 });
  });
});

describe('放大框', () => {
  const canvas = { width: 1920, height: 1080 };
  const shot = { x: 160, y: 90, w: 1600, h: 900, f: 1.25 };

  it('倍率：開始 1、結束是設定值，中間略為超過（過衝回彈）', () => {
    expect(zoomFactor(1.25, 0)).toBe(1);
    expect(zoomFactor(1.25, 1)).toBe(1.25);
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => zoomFactor(1.25, (i + 1) / 100)));
    expect(peak).toBeGreaterThan(1.25);
    expect(peak).toBeLessThan(1.3);
    expect(popupAlpha(0)).toBe(0);
    expect(popupAlpha(1)).toBe(1);
  });

  it('以框的中心放大；超出畫面時推回來（留邊），比畫面大時置中', () => {
    const r = cardRect({ x: 400, y: 300, w: 200, h: 100 }, shot, canvas, 1.5);
    const c = toCanvasRect(shot, { x: 400, y: 300, w: 200, h: 100 });
    expect(r.w).toBeCloseTo(c.w * 1.5, 9);
    expect(r.x + r.w / 2).toBeCloseTo(c.x + c.w / 2, 9);
    expect(r.y + r.h / 2).toBeCloseTo(c.y + c.h / 2, 9);
    /* 貼著右下角的框：推回畫面內，留 12 px */
    const full = { x: 0, y: 0, w: 1920, h: 1080, f: 1.5 };
    const corner = cardRect({ x: 1180, y: 700, w: 100, h: 20 }, full, canvas, 1.6, 12);
    expect(corner.x + corner.w).toBeCloseTo(1920 - 12, 9);
    expect(corner.y + corner.h).toBeCloseTo(1080 - 12, 9);
    /* 比畫面還寬：置中 */
    const wide = cardRect({ x: 0, y: 0, w: 1280, h: 100 }, shot, canvas, 1.6, 12);
    expect(wide.x).toBeCloseTo((1920 - wide.w) / 2, 9);
  });
});

describe('匯出', () => {
  it('APNG：每格 1 ÷ FPS 秒，格數＝總長 × FPS 無條件進位，最後一格是完成的樣子', () => {
    const t = apngTimes(4.3, 15);
    expect(t).toHaveLength(65);
    expect(t[1]).toBeCloseTo(1 / 15, 9);
    expect(t[t.length - 1]).toBe(4.3);
    expect(apngTimes(4.3, 60)).toHaveLength(258);
    expect(apngTimes(0, 15)).toEqual([0]);
  });

  it('影片：30／60 fps 同樣的取樣', () => {
    expect(videoTimes(6.7, 30)).toHaveLength(201);
    expect(videoTimes(6.7, 60)).toHaveLength(402);
    expect(videoTimes(6.7, 30).at(-1)).toBe(6.7);
  });

  it('檔名：screenshot-fx-年月日-時分秒（APNG 加 -anim）', () => {
    const now = new Date(2026, 9, 23, 9, 5, 7);
    expect(exportFileName('png', now)).toBe('screenshot-fx-20261023-090507.png');
    expect(exportFileName('apng', now)).toBe('screenshot-fx-20261023-090507-anim.png');
    expect(exportFileName('mp4', now)).toBe('screenshot-fx-20261023-090507.mp4');
    expect(exportFileName('webm', now)).toBe('screenshot-fx-20261023-090507.webm');
  });
});

describe('存檔與專案檔的整理', () => {
  it('空的或壞掉的存檔回到預設', () => {
    expect(normalizeState(null)).toEqual(initialState());
    expect(normalizeState({ canvas: 'nope', bg: 5, frames: 'x' })).toEqual(initialState());
  });

  it('數值夾在範圍內並對齊每格；不認得的選項用預設；出處截到上限、換行變空白', () => {
    const s = normalizeState({
      image: IMG,
      bg: { mode: 'solid', blur: 61, brightness: 12, color: '#ABCDEF' },
      shot: { scale: 49, radius: 40.4, shadow: 33, spotlight: 92 },
      credit: { text: `一\n二${'字'.repeat(200)}`, pos: 'top', size: 'xl' },
      timing: { intro: 0.55, popup: 9, action: 0, outro: -1, order: 'x', fps: 24 },
    });
    expect(s.bg).toEqual({ mode: 'solid', blur: 60, brightness: 15, color: '#abcdef' });
    expect(s.shot).toEqual({ scale: 50, radius: 40, shadow: 34, spotlight: 90 });
    expect(Array.from(s.credit.text)).toHaveLength(LIMITS.credit);
    expect(s.credit.text.startsWith('一 二')).toBe(true);
    expect(s.credit.pos).toBe('below');
    expect(s.credit.size).toBe('md');
    expect(s.timing).toEqual({
      intro: 0.6,
      popup: 3,
      action: 0.1,
      outro: 0,
      order: 'sequential',
      fps: 15,
    });
    expect(snapRange('zoomScale', 1.27, 1.25)).toBe(1.25);
    expect(snapRange('zoomScale', 1.28, 1.25)).toBe(1.3);
  });

  it('框：看不懂的拿掉、範圍夾在圖裡、重複的 id 換新的；沒有圖時框也清掉', () => {
    const s = normalizeState({
      image: IMG,
      frames: [
        { id: 'a', kind: 'zoom', x: 1270, y: 0, w: 100, h: 50, scale: 3, style: 'x', border: 5 },
        { id: 'a', kind: 'marker', x: 0, y: 0, w: 10, h: 10, style: 'redBox', dir: 'v' },
        { id: 'c', kind: 'circle', x: 0, y: 0, w: 10, h: 10 },
        null,
        {
          id: 'd',
          kind: 'redact',
          x: 5,
          y: 5,
          w: 50,
          h: 50,
          mode: 'conceal',
          density: 3,
          grain: 100,
        },
      ],
    });
    expect(s.frames.map((f) => f.kind)).toEqual(['zoom', 'marker', 'redact']);
    expect(s.frames[0]).toMatchObject({ x: 1180, w: 100, scale: 1.65, style: 'card', border: 4 });
    expect(s.frames[1]).toMatchObject({ style: 'redBox', dir: 'v' });
    expect(s.frames[1].id).not.toBe('a');
    expect(s.frames[2]).toMatchObject({ mode: 'conceal', style: 'black', density: 20, grain: 48 });
    expect(normalizeState({ image: null, frames: [zoom('z')] }).frames).toEqual([]);
  });

  it('框最多 60 個', () => {
    const many = Array.from({ length: 80 }, (_, i) => marker(`m${i}`));
    expect(normalizeState({ image: IMG, frames: many }).frames).toHaveLength(LIMITS.frames);
  });

  it('新畫的框的預設：壞掉時回到預設、夾範圍', () => {
    expect(normalizeDefaults(undefined)).toEqual(initialDefaults());
    expect(
      normalizeDefaults({
        zoom: { scale: 2, style: 'torn', border: 6 },
        marker: { style: 'nope', dir: 'v' },
        redact: { style: 'frost', mode: 'static', density: 55, grain: 7 },
      }),
    ).toEqual({
      zoom: { scale: 1.65, style: 'torn', border: 6 },
      marker: { style: 'yellow', dir: 'v' },
      redact: { style: 'frost', mode: 'static', dir: 'h', density: 55, grain: 8 },
    });
  });

  it('專案檔（ZIP）存了再讀，整理後內容相同', () => {
    const s = withFrames([zoom('z'), marker('m'), redact('r', 'conceal')], {
      credit: { text: '出處：測試', pos: 'badge', size: 'lg' },
      bg: { mode: 'transparent', blur: 24, brightness: 40, color: '#10131a' },
    });
    const bytes = serializeProjectZip('screenshot-fx', 1, s, [
      { name: 'abc.png', data: new Uint8Array([137, 80, 78, 71]) },
    ]);
    const back = parseProjectBytes(bytes, 'screenshot-fx');
    expect(back.version).toBe(1);
    expect([...back.files.keys()]).toEqual(['abc.png']);
    expect(normalizeState(back.data)).toEqual(s);
  });
});
