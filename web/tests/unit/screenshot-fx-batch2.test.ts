/**
 * 截圖演出產生器第二批的規則（規格 docs/refactor/specs/screenshot-fx.md 1.8、3.11～3.14）：
 * 運鏡（對象、時間軸的放慢與延長、看的範圍）、塗黑的邊界演出（欄位、淡入淡出）、段階公開的順序與進度、
 * 編輯區的倍率、ZIP 的檔名。
 */
import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  type CameraSettings,
  cameraFocusRect,
  cameraTarget,
  cameraView,
  computeLayout,
  EDIT_ZOOMS,
  edgeEnvelope,
  editZoomFor,
  exportFileName,
  type Frame,
  type FxState,
  frameFileName,
  initialCamera,
  initialDefaults,
  initialState,
  LAYERS,
  layerFileName,
  makeFrame,
  normalizeState,
  rectInCard,
  stepEditZoom,
  stepFileName,
  stepFrames,
  stepProgress,
  timelineOf,
  toCanvasRect,
  type ZoomFrame,
} from '@/tools/screenshot-fx/model';

const IMG = { id: 'img', name: 'shot.png', width: 1600, height: 900 };
const d = initialDefaults();
const marker = (id: string, x = 100, y = 100, w = 300, h = 30): Frame =>
  makeFrame('marker', { x, y, w, h }, d, id);
const redact = (
  id: string,
  mode: 'static' | 'reveal' | 'conceal' = 'reveal',
  x = 500,
  y = 500,
): Frame => ({
  ...(makeFrame('redact', { x, y, w: 200, h: 40 }, d, id) as Extract<Frame, { kind: 'redact' }>),
  mode,
});
const zoom = (id: string, x = 50, y = 50, w = 600, h = 200): Frame =>
  makeFrame('zoom', { x, y, w, h }, d, id);
const cam = (patch: Partial<CameraSettings> = {}): CameraSettings => ({
  ...initialCamera(),
  mode: 'pullback',
  ...patch,
});
const timing = initialState().timing;
const state = (frames: Frame[], patch: Partial<FxState> = {}): FxState => ({
  ...initialState(),
  image: { ...IMG },
  frames,
  ...patch,
});

describe('運鏡：對象', () => {
  it('關掉時沒有對象；自動＝第一個會動的螢光筆或塗黑，沒有時第一個螢光筆或塗黑', () => {
    const frames = [zoom('z'), redact('s', 'static'), marker('m'), redact('r')];
    expect(cameraTarget(frames, initialCamera())).toBeNull();
    expect(cameraTarget(frames, cam())?.id).toBe('m');
    expect(cameraTarget([zoom('z'), redact('s', 'static')], cam())?.id).toBe('s');
    expect(cameraTarget([zoom('z')], cam())).toBeNull();
  });

  it('指定的框；不在了（或是放大框）時回到自動', () => {
    const frames = [marker('m'), redact('r'), zoom('z')];
    expect(cameraTarget(frames, cam({ target: 'r' }))?.id).toBe('r');
    expect(cameraTarget(frames, cam({ target: 'gone' }))?.id).toBe('m');
    expect(cameraTarget(frames, cam({ target: 'z' }))?.id).toBe('m');
  });

  it('存檔整理：倍率、時間夾在範圍內並對齊每格；指定的框不在了時回到自動', () => {
    const s = normalizeState({
      image: IMG,
      frames: [marker('m')],
      camera: { mode: 'pullback', target: 'nope', focus: 'x', zoom: 9, duration: 0.33 },
    });
    expect(s.camera).toEqual({
      mode: 'pullback',
      target: 'auto',
      focus: 'start',
      zoom: 4,
      duration: 1,
    });
    expect(
      normalizeState({ image: IMG, frames: [marker('m')], camera: { target: 'm', zoom: 2.44 } })
        .camera,
    ).toMatchObject({ mode: 'off', target: 'm', zoom: 2.4, duration: 3.6 });
    expect(normalizeState({}).camera).toEqual(initialCamera());
  });
});

describe('運鏡：時間軸', () => {
  it('對象的動作比拉回短：放慢到拉回的時間，後面的框跟著往後；拉回從對象的動作開始', () => {
    const frames = [marker('a'), marker('b'), marker('c')];
    const tl = buildTimeline(timing, frames, cam({ target: 'b', duration: 3 }));
    expect(tl.windows.a).toEqual({ start: 1.1, end: 2.3 });
    expect(tl.windows.b).toEqual({ start: 2.3, end: 5.3 });
    expect(tl.windows.c).toEqual({ start: 5.3, end: 6.5 });
    expect(tl.camera).toEqual({ start: 2.3, end: 5.3, targetId: 'b' });
    expect(tl.total).toBe(8.5);
  });

  it('對象的動作比拉回長：不放慢，拉回在動作中途結束', () => {
    const tl = buildTimeline({ ...timing, action: 5 }, [marker('a')], cam({ duration: 2 }));
    expect(tl.windows.a).toEqual({ start: 1.1, end: 6.1 });
    expect(tl.camera).toEqual({ start: 1.1, end: 3.1, targetId: 'a' });
  });

  it('同時：動作段＝最長的那一個', () => {
    const tl = buildTimeline(
      { ...timing, order: 'simultaneous' },
      [marker('a'), marker('b')],
      cam({ target: 'b', duration: 4 }),
    );
    expect(tl.windows.a).toEqual({ start: 1.1, end: 2.3 });
    expect(tl.windows.b).toEqual({ start: 1.1, end: 5.1 });
    expect(tl.phases.action).toEqual({ start: 1.1, end: 5.1 });
  });

  it('對象不會動（靜止的塗黑）：從動作段的開頭拉回；超過結尾時結尾延長', () => {
    const tl = buildTimeline(
      { ...timing, outro: 0.5 },
      [redact('s', 'static')],
      cam({ duration: 8 }),
    );
    expect(tl.camera).toEqual({ start: 1.1, end: 9.1, targetId: 's' });
    expect(tl.phases.outro).toEqual({ start: 2.3, end: 9.1 });
    expect(tl.total).toBe(9.1);
  });

  it('運鏡關掉時時間軸和第一批相同', () => {
    const frames = [marker('a'), redact('r')];
    expect(buildTimeline(timing, frames, initialCamera())).toEqual(buildTimeline(timing, frames));
    expect(timelineOf(state(frames)).camera).toBeNull();
  });
});

describe('運鏡：看的範圍', () => {
  const s = state([marker('m', 100, 400, 1200, 40)], { camera: cam({ zoom: 2, duration: 4 }) });
  const layout = computeLayout(s, IMG);
  const tl = timelineOf(s);
  const { width: W, height: H } = layout.canvas;

  it('拉回前：大小＝畫面 ÷ 倍率；演出開始的那一端在看到的範圍左邊 0.3 的地方', () => {
    const v = cameraView(s, layout, tl, 0);
    expect(v).not.toBeNull();
    expect(v?.w).toBeCloseTo(W / 2, 6);
    expect(v?.h).toBeCloseTo(H / 2, 6);
    const r = toCanvasRect(layout.shot, s.frames[0]);
    expect((v?.x ?? 0) + (v?.w ?? 0) / 2).toBeCloseTo(r.x + (W / 2) * 0.3, 6);
    expect((v?.y ?? 0) + (v?.h ?? 0) / 2).toBeCloseTo(r.y + r.h / 2, 6);
    /* 拉回開始之前不動 */
    expect(cameraView(s, layout, tl, 1.1)).toEqual(v);
  });

  it('框的中央；範圍不超出畫面', () => {
    const s2 = { ...s, camera: cam({ zoom: 2, duration: 4, focus: 'center' as const }) };
    const v = cameraView(s2, layout, timelineOf(s2), 0);
    const r = toCanvasRect(layout.shot, s.frames[0]);
    expect((v?.x ?? 0) + (v?.w ?? 0) / 2).toBeCloseTo(r.x + r.w / 2, 6);
    const edge = state([marker('m', 0, 0, 40, 20)], { camera: cam({ zoom: 3 }) });
    const ve = cameraView(edge, layout, timelineOf(edge), 0);
    expect(ve?.x).toBeCloseTo(0, 6);
    expect(ve?.y).toBeCloseTo(0, 6);
  });

  it('拉回中範圍變大；拉回結束後是全圖（null）', () => {
    const v0 = cameraView(s, layout, tl, 0);
    const mid = cameraView(s, layout, tl, 3.1);
    expect(mid?.w).toBeGreaterThan(v0?.w ?? 0);
    expect(mid?.w).toBeLessThan(W);
    const x = mid?.x ?? -1;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + (mid?.w ?? 0)).toBeLessThanOrEqual(W + 1e-6);
    expect(cameraView(s, layout, tl, tl.camera?.end ?? 0)).toBeNull();
    expect(cameraView(s, layout, tl, 99)).toBeNull();
  });

  it('對象在放大框裡：對準放大框彈出後的位置', () => {
    const z = zoom('z', 50, 350, 800, 200) as ZoomFrame;
    const m = marker('m', 100, 400, 300, 40);
    const sz = state([z, m], { camera: cam() });
    const lz = computeLayout(sz, IMG);
    expect(cameraFocusRect(sz, lz, m)).toEqual(rectInCard(z, m, lz));
    expect(cameraFocusRect(sz, lz, m).w).toBeCloseTo(300 * lz.shot.f * z.scale, 6);
  });
});

describe('塗黑的邊界演出', () => {
  it('新的塗黑預設金光、強度 70%；存檔整理夾範圍、看不懂的用預設', () => {
    expect(initialDefaults().redact).toMatchObject({ edge: 'glow', glow: 70 });
    const s = normalizeState({
      image: IMG,
      frames: [
        { id: 'a', kind: 'redact', x: 0, y: 0, w: 50, h: 20, edge: 'scan', glow: 103 },
        { id: 'b', kind: 'redact', x: 0, y: 0, w: 50, h: 20, edge: 'fire', glow: 42 },
      ],
    });
    expect(s.frames[0]).toMatchObject({ edge: 'scan', glow: 100 });
    expect(s.frames[1]).toMatchObject({ edge: 'glow', glow: 40 });
  });

  it('只在動作中：頭尾各 8% 淡入淡出', () => {
    expect(edgeEnvelope(0)).toBe(0);
    expect(edgeEnvelope(1)).toBe(0);
    expect(edgeEnvelope(0.04)).toBeCloseTo(0.5, 9);
    expect(edgeEnvelope(0.5)).toBe(1);
    expect(edgeEnvelope(0.96)).toBeCloseTo(0.5, 9);
  });
});

describe('段階公開', () => {
  const frames = [
    zoom('z'),
    redact('s', 'static'),
    marker('m'),
    redact('r'),
    redact('c', 'conceal'),
  ];

  it('順序：放大框與會動的框，照清單順序（靜止的塗黑不算）', () => {
    expect(stepFrames(frames).map((f) => f.id)).toEqual(['z', 'm', 'r', 'c']);
  });

  it('第 k 張：前 k 個做完、其他還沒開始；靜止的塗黑一直蓋著', () => {
    const p0 = stepProgress(frames, 0);
    expect(p0.popup(frames[0] as ZoomFrame)).toBe(0);
    expect(p0.action(frames[2])).toBe(0);
    expect(p0.action(frames[1])).toBe(1);
    const p2 = stepProgress(frames, 2);
    expect(p2.popup(frames[0] as ZoomFrame)).toBe(1);
    expect(p2.action(frames[2])).toBe(1);
    expect(p2.action(frames[3])).toBe(0);
    const p4 = stepProgress(frames, 4);
    expect(frames.slice(2).map((f) => p4.action(f))).toEqual([1, 1, 1]);
  });
});

describe('編輯區的倍率（不影響輸出）', () => {
  it('選項 100～800%；−／＋ 到上一個、下一個', () => {
    expect(EDIT_ZOOMS).toEqual([1, 1.5, 2, 3, 4, 6, 8]);
    expect(stepEditZoom(1, 1)).toBe(1.5);
    expect(stepEditZoom(2.5, 1)).toBe(3);
    expect(stepEditZoom(2.5, -1)).toBe(2);
    expect(stepEditZoom(8, 1)).toBe(8);
    expect(stepEditZoom(1, -1)).toBe(1);
  });

  it('把一個範圍放大到佔編輯區的比例（1～8 倍，取到 0.01）', () => {
    const canvas = { width: 1920, height: 1080 };
    expect(editZoomFor({ x: 0, y: 0, w: 480, h: 100 }, canvas, 1)).toBe(4);
    expect(editZoomFor({ x: 0, y: 0, w: 192, h: 54 }, canvas, 0.55)).toBe(5.5);
    expect(editZoomFor({ x: 0, y: 0, w: 10, h: 10 }, canvas, 1)).toBe(8);
    expect(editZoomFor({ x: 0, y: 0, w: 1920, h: 1080 }, canvas, 0.5)).toBe(1);
  });
});

describe('ZIP 的檔名', () => {
  it('三種 ZIP、段階 step_00、連番 frame_0001（超過 9999 格時位數跟著加）、圖層四張', () => {
    const now = new Date(2026, 9, 24, 8, 1, 2);
    expect(exportFileName('steps', now)).toBe('screenshot-fx-20261024-080102-steps.zip');
    expect(exportFileName('layers', now)).toBe('screenshot-fx-20261024-080102-layers.zip');
    expect(exportFileName('frames', now)).toBe('screenshot-fx-20261024-080102-frames.zip');
    expect(stepFileName(0)).toBe('step_00.png');
    expect(stepFileName(12)).toBe('step_12.png');
    expect(frameFileName(0, 101)).toBe('frame_0001.png');
    expect(frameFileName(100, 101)).toBe('frame_0101.png');
    expect(frameFileName(0, 12000)).toBe('frame_00001.png');
    expect(LAYERS.map(layerFileName)).toEqual([
      '1_background.png',
      '2_cutouts.png',
      '3_markers.png',
      '4_final.png',
    ]);
  });
});
