/**
 * 地圖演出產生器：路線的形狀與長出、點選路線的點（移動、縮放、插入、刪除、整理）、遮罩的揭開進度（掃描與淡出）、
 * 時間軸、房間遮罩 ZIP 的檔名與格數、X 用 MP4 的大小、狀態與動作（點選建立、編輯點、複製）。
 * 規格 docs/refactor/specs/map-fx.md 第 3 節。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { dragCorner, redactCover, type VideoMode } from '@/core/imagefx';
import {
  applyRect,
  boundsOf,
  canFinishPoints,
  cellCount,
  duplicateFrame,
  exportFileName,
  type Frame,
  gridRect,
  initialDefaults,
  initialState,
  insertPoint,
  isActionFrame,
  type MapState,
  makeFrame,
  makePointRoute,
  mapFileName,
  movePoints,
  nearestSegment,
  normalizeDefaults,
  normalizeFrame,
  normalizeState,
  pathLength,
  pathUntil,
  pointAlong,
  type RouteFrame,
  removePoint,
  roomFileNames,
  routePath,
  safeName,
  stepFrames,
  timelineOf,
  toPointRoute,
  xVideoSize,
  xVideoUsable,
} from '@/tools/map-fx/model';
import { demoFrames, ROOMS, roomRect, SAMPLE_SIZE } from '@/tools/map-fx/sample';
import {
  addDraftPoint,
  addPointOnSegment,
  deletePoint,
  docNow,
  duplicate,
  endPointMode,
  finishPointRoute,
  historyStep,
  normalizePrefs,
  resetAll,
  setFrameRect,
  startEditPoints,
  startPointRoute,
  undoDraftPoint,
  usePoints,
} from '@/tools/map-fx/store';

const IMG = { width: 1200, height: 840 };

const route = (o: Partial<RouteFrame> = {}): RouteFrame => ({
  id: 'r',
  kind: 'route',
  x: 100,
  y: 200,
  w: 300,
  h: 100,
  style: 'dashed',
  shape: 'right',
  points: [],
  label: '',
  ...o,
});

describe('路線的形狀（3.7）', () => {
  it('直線走框的中線，四個方向', () => {
    expect(routePath(route({ shape: 'right' }))).toEqual([
      { x: 100, y: 250 },
      { x: 400, y: 250 },
    ]);
    expect(routePath(route({ shape: 'left' }))).toEqual([
      { x: 400, y: 250 },
      { x: 100, y: 250 },
    ]);
    expect(routePath(route({ shape: 'down' }))).toEqual([
      { x: 250, y: 200 },
      { x: 250, y: 300 },
    ]);
    expect(routePath(route({ shape: 'up' }))).toEqual([
      { x: 250, y: 300 },
      { x: 250, y: 200 },
    ]);
  });

  it('L 字與 Z 字從左上角到右下角', () => {
    expect(routePath(route({ shape: 'hv' }))).toEqual([
      { x: 100, y: 200 },
      { x: 400, y: 200 },
      { x: 400, y: 300 },
    ]);
    expect(routePath(route({ shape: 'vh' }))).toEqual([
      { x: 100, y: 200 },
      { x: 100, y: 300 },
      { x: 400, y: 300 },
    ]);
    expect(routePath(route({ shape: 'z' }))).toEqual([
      { x: 100, y: 200 },
      { x: 250, y: 200 },
      { x: 250, y: 300 },
      { x: 400, y: 300 },
    ]);
  });

  it('L 字與 Z 字從拖曳的起點那一角出發、走到對角（D10）；直線照形狀的方向，不看起點', () => {
    expect(routePath(route({ shape: 'hv', from: 'se' }))).toEqual([
      { x: 400, y: 300 },
      { x: 100, y: 300 },
      { x: 100, y: 200 },
    ]);
    expect(routePath(route({ shape: 'vh', from: 'ne' }))).toEqual([
      { x: 400, y: 200 },
      { x: 400, y: 300 },
      { x: 100, y: 300 },
    ]);
    expect(routePath(route({ shape: 'z', from: 'sw' }))).toEqual([
      { x: 100, y: 300 },
      { x: 250, y: 300 },
      { x: 250, y: 200 },
      { x: 400, y: 200 },
    ]);
    expect(routePath(route({ shape: 'right', from: 'se' }))).toEqual(
      routePath(route({ shape: 'right' })),
    );
    /* 拖曳的方向 → 起點那一角 */
    expect(dragCorner({ x: 400, y: 300 }, { x: 100, y: 200 })).toBe('se');
    expect(dragCorner({ x: 100, y: 300 }, { x: 400, y: 200 })).toBe('sw');
    expect(dragCorner({ x: 400, y: 200 }, { x: 100, y: 300 })).toBe('ne');
    expect(dragCorner({ x: 100, y: 200 }, { x: 400, y: 300 })).toBe('nw');
  });

  it('起點那一角：新框記下來（左上不寫）、整理時保留、換成點選的路線時拿掉', () => {
    const d = initialDefaults();
    const r = { x: 100, y: 200, w: 300, h: 100 };
    expect(makeFrame('route', r, d, 'a', 'se')).toMatchObject({ from: 'se' });
    expect(makeFrame('route', r, d, 'a', 'nw')).not.toHaveProperty('from');
    expect(makeFrame('route', r, d, 'a')).not.toHaveProperty('from');
    expect(normalizeFrame(route({ shape: 'hv', from: 'ne' }), IMG)).toMatchObject({ from: 'ne' });
    expect(normalizeFrame(route({ shape: 'hv', from: 'x' as never }), IMG)).not.toHaveProperty(
      'from',
    );
    const pr = toPointRoute(route({ shape: 'hv', from: 'se' }), IMG);
    expect(pr).not.toHaveProperty('from');
    expect(pr.points[0]).toEqual({ x: 400, y: 300 });
  });

  it('點選建立的照點的順序；地點（圖釘、準星、危險區）沒有路線', () => {
    const pts = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 10, y: 10 },
    ];
    expect(routePath(route({ shape: 'points', points: pts }))).toEqual(pts);
    for (const style of ['pin', 'target', 'danger'] as const)
      expect(routePath(route({ style }))).toEqual([]);
  });

  it('長出：線長、走到 d 的位置與方向、前 d 那一段', () => {
    const pts = routePath(route({ shape: 'hv' }));
    expect(pathLength(pts)).toBe(400);
    expect(pointAlong(pts, 150)).toEqual({ x: 250, y: 200, angle: 0 });
    const p = pointAlong(pts, 350);
    expect([p.x, p.y]).toEqual([400, 250]);
    expect(p.angle).toBeCloseTo(Math.PI / 2);
    /* 超出範圍夾到頭尾 */
    expect(pointAlong(pts, 999)).toMatchObject({ x: 400, y: 300 });
    expect(pathUntil(pts, 350)).toEqual([
      { x: 100, y: 200 },
      { x: 400, y: 200 },
      { x: 400, y: 250 },
    ]);
    expect(pathUntil(pts, 0)).toEqual([{ x: 100, y: 200 }]);
    /* 同一點重複（U 字的往返）長度 0 的段跳過 */
    const u = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ];
    expect(pointAlong(u, 10)).toEqual({ x: 10, y: 0, angle: 0 });
  });
});

describe('點選路線的點（3.11）', () => {
  it('範圍是點的範圍，至少 4 px，夾在圖裡', () => {
    expect(
      boundsOf(
        [
          { x: 10, y: 20 },
          { x: 110, y: 70 },
        ],
        IMG,
      ),
    ).toEqual({ x: 10, y: 20, w: 100, h: 50 });
    /* 一條直的線：寬補到 4 */
    expect(
      boundsOf(
        [
          { x: 50, y: 20 },
          { x: 50, y: 80 },
        ],
        IMG,
      ),
    ).toEqual({ x: 48, y: 20, w: 4, h: 60 });
  });

  it('移動、改大小：點照比例跟著動；複製往右下 16 px', () => {
    const f = makePointRoute(
      [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 200 },
      ],
      initialDefaults(),
      IMG,
      'p',
    );
    expect(f).toMatchObject({ x: 100, y: 100, w: 200, h: 100, shape: 'points', style: 'dashed' });
    const moved = structuredClone(f) as Frame;
    applyRect(moved, { x: 150, y: 120, w: 200, h: 100 });
    expect((moved as RouteFrame).points).toEqual([
      { x: 150, y: 120 },
      { x: 350, y: 120 },
      { x: 350, y: 220 },
    ]);
    const scaled = structuredClone(f) as Frame;
    applyRect(scaled, { x: 100, y: 100, w: 400, h: 50 });
    expect((scaled as RouteFrame).points).toEqual([
      { x: 100, y: 100 },
      { x: 500, y: 100 },
      { x: 500, y: 150 },
    ]);
    const copy = duplicateFrame(f, IMG, 'q') as RouteFrame;
    expect(copy.id).toBe('q');
    expect(copy.points[0]).toEqual({ x: 116, y: 116 });
    expect(f.points[0]).toEqual({ x: 100, y: 100 });
    /* 拖曳畫出的路線只換範圍 */
    const d = makeFrame('route', { x: 0, y: 0, w: 50, h: 50 }, initialDefaults(), 'd');
    applyRect(d, { x: 10, y: 10, w: 50, h: 50 });
    expect(d).toMatchObject({ x: 10, y: 10, points: [] });
  });

  it('插入、刪除（至少留兩個）、最近的線段、能不能確定', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(nearestSegment(pts, { x: 50, y: 3 })).toEqual({ index: 0, distance: 3 });
    expect(nearestSegment(pts, { x: 96, y: 60 })).toEqual({ index: 1, distance: 4 });
    expect(insertPoint(pts, 0, { x: 50, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(removePoint(pts, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(removePoint(pts.slice(0, 2), 0)).toHaveLength(2);
    expect(canFinishPoints([{ x: 1, y: 1 }])).toBe(false);
    expect(
      canFinishPoints([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toBe(false);
    expect(
      canFinishPoints([
        { x: 1, y: 1 },
        { x: 1, y: 3 },
      ]),
    ).toBe(true);
    expect(
      movePoints(pts, { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 50, h: 50 })[2],
    ).toEqual({
      x: 50,
      y: 50,
    });
  });

  it('拖曳畫出的路線換成點選的：點＝轉折點', () => {
    const p = toPointRoute(route({ shape: 'z' }), IMG);
    expect(p.shape).toBe('points');
    expect(p.points).toHaveLength(4);
    expect(p.points[1]).toEqual({ x: 250, y: 200 });
  });

  it('整理：點夾在圖裡、看不懂的點拿掉、不到兩點的路線拿掉、範圍重算、地點的種類改成移動路線、標籤 40 字', () => {
    const f = normalizeFrame(
      {
        kind: 'route',
        id: 'x',
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        style: 'pin',
        shape: 'points',
        points: [{ x: -50, y: 10 }, { x: 'a' }, { x: 2000, y: 900 }, null],
        label: '標'.repeat(50),
      },
      IMG,
    ) as RouteFrame;
    expect(f.points).toEqual([
      { x: 0, y: 10 },
      { x: 1200, y: 840 },
    ]);
    expect([f.x, f.y, f.w, f.h]).toEqual([0, 10, 1200, 830]);
    expect(f.style).toBe('dashed');
    expect(Array.from(f.label)).toHaveLength(40);
    expect(
      normalizeFrame({ kind: 'route', shape: 'points', points: [{ x: 1, y: 1 }] }, IMG),
    ).toBeNull();
    const d = normalizeFrame(
      { kind: 'route', x: 1, y: 1, w: 50, h: 50, shape: 'spiral', style: '?' },
      IMG,
    );
    expect(d).toMatchObject({ shape: 'right', style: 'dashed', points: [], label: '' });
    const m = normalizeFrame(
      { kind: 'redact', x: 1, y: 1, w: 50, h: 50, dir: 'diag', style: 'fog' },
      IMG,
    );
    expect(m).toMatchObject({ dir: 'fade', style: 'fog', mode: 'reveal', label: '' });
  });

  it('內容整理沒有運鏡的欄位；預設值', () => {
    const s = normalizeState({ ...initialState(), camera: { mode: 'pullback' } });
    expect('camera' in s).toBe(false);
    expect(initialDefaults()).toEqual(normalizeDefaults({}));
    expect(initialDefaults().redact).toMatchObject({ style: 'dark', mode: 'reveal', dir: 'fade' });
    expect(initialDefaults().route).toMatchObject({ style: 'dashed', shape: 'right' });
    expect(initialDefaults().zoom).toMatchObject({ style: 'plain', scale: 1.25, border: 4 });
  });
});

describe('遮罩的揭開進度（3.8）', () => {
  it('掃描：揭開 [q, 1]、蓋上 [0, q]；淡出：揭開不透明度 1 − q、蓋上 q；一直蓋著全部', () => {
    expect(redactCover('reveal', 'h', 0.3)).toEqual({ span: [0.3, 1], alpha: 1 });
    expect(redactCover('conceal', 'v', 0.3)).toEqual({ span: [0, 0.3], alpha: 1 });
    expect(redactCover('reveal', 'fade', 0.3).alpha).toBeCloseTo(0.7);
    expect(redactCover('reveal', 'fade', 0.3).span).toEqual([0, 1]);
    expect(redactCover('conceal', 'fade', 0.3).alpha).toBeCloseTo(0.3);
    expect(redactCover('static', 'fade', 0.3)).toEqual({ span: [0, 1], alpha: 1 });
    expect(redactCover('reveal', 'fade', 1).alpha).toBe(0);
  });

  it('會動的框：路線・地點七種都算、一直蓋著的遮罩不算；示範演出依序 7.9 秒', () => {
    const d = initialDefaults();
    expect(
      isActionFrame(
        makeFrame(
          'route',
          { x: 0, y: 0, w: 9, h: 9 },
          { ...d, route: { ...d.route, style: 'pin' } },
          'a',
        ),
      ),
    ).toBe(true);
    expect(
      isActionFrame(
        makeFrame(
          'redact',
          { x: 0, y: 0, w: 9, h: 9 },
          { ...d, redact: { ...d.redact, mode: 'static' } },
          'b',
        ),
      ),
    ).toBe(false);
    expect(isActionFrame(makeFrame('zoom', { x: 0, y: 0, w: 9, h: 9 }, d, 'c'))).toBe(false);
    const s: MapState = {
      ...initialState(),
      image: { id: 'i', name: '', ...SAMPLE_SIZE },
      frames: demoFrames(),
    };
    const tl = timelineOf(s);
    expect(tl.actionIds).toHaveLength(4);
    expect(tl.total).toBeCloseTo(7.9, 6);
    expect(tl.windows[s.frames[1].id]).toEqual({ start: 1.1, end: 2.3 });
    /* 逐步公開：區域放大＋4 個會動的框 */
    expect(stepFrames(s.frames)).toHaveLength(5);
  });
});

describe('房間遮罩 ZIP 的檔名與格數、X 用 MP4 的大小（3.9）', () => {
  it('格數取到小數一位、整數不寫小數點', () => {
    expect(cellCount(144, 24)).toBe('6');
    expect(cellCount(150, 24)).toBe('6.3');
    expect(cellCount(1200, 24)).toBe('50');
    expect(cellCount(100, 48)).toBe('2.1');
    expect(mapFileName(IMG, 24)).toBe('map_50x35.png');
  });

  it('裁切範圍往外對齊格線：以地圖左上角為原點擴到整格（剛好在格線上的不多擴）', () => {
    /* 剛好對齊 */
    expect(gridRect({ x: 48, y: 72, w: 240, h: 264 }, 24)).toEqual({
      rect: { x: 48, y: 72, w: 240, h: 264 },
      cells: { x: 2, y: 3, w: 10, h: 11 },
    });
    /* 沒對齊：左上往左上擴、右下往右下擴 */
    expect(gridRect({ x: 48, y: 72, w: 240, h: 264 }, 48)).toEqual({
      rect: { x: 48, y: 48, w: 240, h: 288 },
      cells: { x: 1, y: 1, w: 5, h: 6 },
    });
    expect(gridRect({ x: 130, y: 50, w: 100, h: 20 }, 24)).toEqual({
      rect: { x: 120, y: 48, w: 120, h: 24 },
      cells: { x: 5, y: 2, w: 5, h: 1 },
    });
    /* 浮點誤差不多擴一格；很小的房間也至少一格 */
    expect(
      gridRect({ x: 0.1 + 0.2 - 0.3, y: 24.000000001, w: 47.9999999, h: 2 }, 24).cells,
    ).toEqual({ x: 0, y: 1, w: 2, h: 1 });
    /* 超出地圖（1200×840、1 格 48 px＝17.5 格高）：照樣擴到整格，超出的地方匯出時是透明的 */
    expect(gridRect({ x: 1100, y: 800, w: 100, h: 40 }, 48)).toEqual({
      rect: { x: 1056, y: 768, w: 144, h: 96 },
      cells: { x: 22, y: 16, w: 3, h: 2 },
    });
  });

  it('檔名：兩位數序號＋房名（去掉不能用的字、最多 24 字）＋ full／在第幾格與幾格大', () => {
    expect(safeName(' 地下 室/A:B? ')).toBe('地下_室_A_B');
    expect(Array.from(safeName('房'.repeat(40)))).toHaveLength(24);
    const names = roomFileNames(
      [
        { label: '院長室', x: 48, y: 72, w: 240, h: 264 },
        { label: '', x: 130, y: 50, w: 150, h: 100 },
      ],
      24,
    );
    expect(names.map((n) => [n.full, n.crop])).toEqual([
      ['01_院長室_full.png', '01_院長室_x2y3_10x11.png'],
      ['02_full.png', '02_x5y2_7x5.png'],
    ]);
    expect(names[1].rect).toEqual({ x: 120, y: 48, w: 168, h: 120 });
    expect(roomFileNames([{ label: '書房', x: 120, y: 48, w: 140, h: 90 }], 24)[0].crop).toBe(
      '01_書房_x5y2_6x4.png',
    );
  });

  it('X 用 MP4 只用 H.264：VP9 的 MP4、WebM、沒寫編碼的即時錄影都不算', () => {
    const plan = (codec: 'avc1' | 'vp09') =>
      ({ kind: 'mp4', plan: { video: { codec } } }) as unknown as VideoMode;
    expect(xVideoUsable(plan('avc1'))).toBe(true);
    expect(xVideoUsable(plan('vp09'))).toBe(false);
    const rec = (mimeType: string): VideoMode => ({ kind: 'realtime', mimeType, alpha: false });
    expect(xVideoUsable(rec('video/mp4;codecs=avc1.640028'))).toBe(true);
    expect(xVideoUsable(rec('video/mp4;codecs=avc1'))).toBe(true);
    expect(xVideoUsable(rec('video/mp4'))).toBe(false);
    expect(xVideoUsable(rec('video/webm;codecs=vp9'))).toBe(false);
    expect(xVideoUsable({ kind: 'none', alpha: false })).toBe(false);
    expect(xVideoUsable(null)).toBe(false);
  });

  it('X 用 MP4：長邊 1280 以內、等比、偶數', () => {
    expect(xVideoSize({ width: 1920, height: 1080 })).toEqual({ width: 1280, height: 720 });
    expect(xVideoSize({ width: 1080, height: 1920 })).toEqual({ width: 720, height: 1280 });
    expect(xVideoSize({ width: 1200, height: 900 })).toEqual({ width: 1200, height: 900 });
    expect(xVideoSize({ width: 4000, height: 3001 })).toEqual({ width: 1280, height: 960 });
    expect(xVideoSize({ width: 641, height: 479 })).toEqual({ width: 640, height: 478 });
  });

  it('匯出的檔名', () => {
    const now = new Date(2026, 9, 25, 9, 8, 7);
    expect(exportFileName('png', now)).toBe('map-fx-20261025-090807.png');
    expect(exportFileName('apng', now)).toBe('map-fx-20261025-090807-anim.png');
    expect(exportFileName('x', now)).toBe('map-fx-20261025-090807-x.mp4');
    expect(exportFileName('rooms', now)).toBe('map-fx-20261025-090807-rooms.zip');
    expect(exportFileName('steps', now)).toBe('map-fx-20261025-090807-steps.zip');
  });

  it('偏好：1 格幾 px 夾在 8～200', () => {
    expect(normalizePrefs({ grid: 3 }).grid).toBe(8);
    expect(normalizePrefs({ grid: 48.4 }).grid).toBe(48);
    expect(normalizePrefs({}).grid).toBe(24);
  });
});

describe('範例地圖', () => {
  it('房間對齊 24 px 的格子、示範演出的框都在圖裡', () => {
    for (const r of ROOMS) {
      const R = roomRect(r.id);
      for (const v of [R.x, R.y, R.w, R.h]) expect(v % 24).toBe(0);
    }
    for (const f of demoFrames()) {
      expect(f.x + f.w).toBeLessThanOrEqual(SAMPLE_SIZE.width);
      expect(f.y + f.h).toBeLessThanOrEqual(SAMPLE_SIZE.height);
      expect(normalizeFrame(f, SAMPLE_SIZE)).toEqual(f);
    }
  });
});

describe('狀態與動作：點選建立、編輯點、範圍改了點跟著動', () => {
  beforeEach(() => {
    endPointMode();
    resetAll({ ...initialState(), image: { id: 'img', name: 'm.png', ...IMG } });
  });

  it('依序點、同一點可以再點、退回上一點、Enter 確定成一條路線（一步復原）', () => {
    startPointRoute();
    addDraftPoint({ x: 100, y: 100 });
    addDraftPoint({ x: 300, y: 100 });
    addDraftPoint({ x: 100, y: 100 });
    addDraftPoint({ x: 500, y: 500 });
    undoDraftPoint();
    const id = finishPointRoute();
    expect(id).toBeTruthy();
    expect(usePoints.getState().draft).toBeNull();
    const f = docNow().frames[0] as RouteFrame;
    expect(f.shape).toBe('points');
    expect(f.points).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 100, y: 100 },
    ]);
    expect([f.x, f.y, f.w, f.h]).toEqual([100, 98, 200, 4]);
    historyStep('undo');
    expect(docNow().frames).toHaveLength(0);
  });

  it('不到兩點或全在同一點時不能確定', () => {
    startPointRoute();
    addDraftPoint({ x: 10, y: 10 });
    expect(finishPointRoute()).toBeNull();
    addDraftPoint({ x: 10, y: 10 });
    expect(finishPointRoute()).toBeNull();
    expect(docNow().frames).toHaveLength(0);
  });

  it('編輯點：拖曳畫出的路線換成點選的、加點、刪點（至少兩點）；拖曳框時點跟著動；複製', () => {
    resetAll({
      ...docNow(),
      frames: [makeFrame('route', { x: 100, y: 100, w: 200, h: 100 }, initialDefaults(), 'r1')],
    });
    startEditPoints('r1');
    let f = docNow().frames[0] as RouteFrame;
    expect(f.shape).toBe('points');
    expect(f.points).toEqual([
      { x: 100, y: 150 },
      { x: 300, y: 150 },
    ]);
    addPointOnSegment('r1', 0, { x: 200, y: 150 });
    f = docNow().frames[0] as RouteFrame;
    expect(f.points).toHaveLength(3);
    deletePoint('r1', 1);
    deletePoint('r1', 0);
    expect((docNow().frames[0] as RouteFrame).points).toHaveLength(2);
    endPointMode();
    setFrameRect('r1', { x: 120, y: 148, w: 200, h: 4 });
    expect((docNow().frames[0] as RouteFrame).points).toEqual([
      { x: 120, y: 150 },
      { x: 320, y: 150 },
    ]);
    const nid = duplicate('r1');
    const c = docNow().frames.find((x) => x.id === nid) as RouteFrame;
    expect(c.points[0]).toEqual({ x: 136, y: 166 });
  });
});
