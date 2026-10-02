/**
 * 前景框產生器：單位與窗的幾何（規格 0.、3.2）、窗的資訊與格數（F05、F11、3.13）、線條的位置（3.4）、
 * 線性漸層的端點（3.3）、命中測試與拖曳（F48）、差分標籤的擺放（3.9）、文字排版（3.10）。
 */
import { describe, expect, it } from 'vitest';
import { suggestGridCells } from '@/ccfolia';
import {
  cornerSize,
  DRAG_THRESHOLD,
  hitTest,
  lockAxis,
  openingRect,
  type PathSink,
  traceOuter,
  traceWindow,
  virtualWidth,
  windowInfo,
} from '@/tools/foreground-frame/geometry';
import { indicatorCenter, LABEL_PAD } from '@/tools/foreground-frame/label';
import { defaultState, type FrameState } from '@/tools/foreground-frame/model';
import {
  doubleGap,
  layoutText,
  linearGradientLine,
  MIN_TEXT_HIT,
  RADIAL_INNER,
  spacedWidth,
} from '@/tools/foreground-frame/render';

const withShape = (patch: Partial<FrameState['opening']>, size = { w: 1920, h: 1080 }) => {
  const s = defaultState();
  s.size = size;
  s.opening = { ...s.opening, ...patch };
  return s;
};

describe('單位：畫布高＝1080 單位（規格 0.）', () => {
  it('畫布寬：16:9 為 1920、4:3 為 1440、正方形為 1080', () => {
    expect(virtualWidth({ w: 1920, h: 1080 })).toBe(1920);
    expect(virtualWidth({ w: 1280, h: 720 })).toBe(1920);
    expect(virtualWidth({ w: 1440, h: 1080 })).toBe(1440);
    expect(virtualWidth({ w: 960, h: 720 })).toBe(1440);
    expect(virtualWidth({ w: 1080, h: 1080 })).toBe(1080);
  });
});

describe('窗的矩形（F10、3.2）', () => {
  it('畫布扣掉四邊邊距', () => {
    expect(openingRect(defaultState())).toEqual({
      x0: 36,
      y0: 36,
      x1: 1884,
      y1: 1044,
      w: 1848,
      h: 1008,
    });
    const r = openingRect(withShape({}, { w: 1440, h: 1080 }));
    expect([r.w, r.h]).toEqual([1368, 1008]);
  });
  it('邊距各自限制在畫布內；寬或高不足 8 單位時以中心撐開成 8', () => {
    const r = openingRect(withShape({ margin: { t: 540, b: 540, l: 960, r: 960 } }));
    expect(r).toEqual({ x0: 956, y0: 536, x1: 964, y1: 544, w: 8, h: 8 });
    const r2 = openingRect(withShape({ margin: { t: 0, b: 0, l: 2000, r: 0 } }));
    expect([r2.x0, r2.x1, r2.w]).toEqual([1916, 1924, 8]);
  });
  it('角的大小不超過窗短邊的一半，直角是 0', () => {
    const s = withShape({
      margin: { t: 400, b: 400, l: 36, r: 36 },
      corners: [0, 1, 2, 3].map(() => ({ type: 'round', size: 300 })),
    });
    const r = openingRect(s);
    expect(r.h).toBe(280);
    expect(cornerSize(s.opening, 0, r)).toBe(140);
    s.opening.corners[0].type = 'square';
    expect(cornerSize(s.opening, 0, r)).toBe(0);
  });
});

/** 記錄路徑指令（Node 沒有 canvas） */
function recorder() {
  const calls: [string, ...number[]][] = [];
  const sink: PathSink = {
    moveTo: (...a: number[]) => void calls.push(['moveTo', ...a]),
    lineTo: (...a: number[]) => void calls.push(['lineTo', ...a]),
    arc: (...a: unknown[]) => void calls.push(['arc', ...(a.slice(0, 5) as number[])]),
    arcTo: (...a: number[]) => void calls.push(['arcTo', ...a]),
    ellipse: (...a: unknown[]) => void calls.push(['ellipse', ...(a.slice(0, 7) as number[])]),
    closePath: () => void calls.push(['closePath']),
  } as PathSink;
  return { calls, sink };
}

describe('窗的四角（F12、3.2）', () => {
  const corners = (type: string, size: number) =>
    [0, 1, 2, 3].map(() => ({ type, size })) as FrameState['opening']['corners'];
  const m = { t: 200, b: 200, l: 200, r: 200 };
  it('斜切：從角往兩邊各 s 處連成直線', () => {
    const { calls, sink } = recorder();
    traceWindow(sink, withShape({ margin: m, corners: corners('chamfer', 120) }));
    expect(calls.slice(0, 2)).toEqual([
      ['moveTo', 200, 320],
      ['lineTo', 320, 200],
    ]);
  });
  it('缺角：框伸出一塊 s × s 的正方形（窗的角變成直角階梯）', () => {
    const { calls, sink } = recorder();
    traceWindow(sink, withShape({ margin: m, corners: corners('notch', 120) }));
    expect(calls.slice(0, 3)).toEqual([
      ['moveTo', 200, 320],
      ['lineTo', 320, 320],
      ['lineTo', 320, 200],
    ]);
  });
  it('圓角：半徑 s 的外凸圓弧；內凹：以窗角為圓心、半徑 s 的四分之一圓', () => {
    const a = recorder();
    traceWindow(a.sink, withShape({ margin: m, corners: corners('round', 120) }));
    expect(a.calls[1]).toEqual(['arcTo', 200, 200, 320, 200, 120]);
    const b = recorder();
    traceWindow(b.sink, withShape({ margin: m, corners: corners('scoop', 120) }));
    const [name, cx, cy, r, a0, a1] = b.calls[1];
    expect([name, cx, cy, r]).toEqual(['arc', 200, 200, 120]);
    expect(a0).toBeCloseTo(Math.PI / 2, 9);
    expect(a1).toBeCloseTo(0, 9);
  });
  it('直角與大小 0：只有四個角點', () => {
    const { calls, sink } = recorder();
    traceWindow(sink, withShape({ margin: m, corners: corners('round', 0) }));
    expect(calls).toEqual([
      ['moveTo', 200, 200],
      ['lineTo', 1720, 200],
      ['lineTo', 1720, 880],
      ['lineTo', 200, 880],
      ['closePath'],
    ]);
  });
  it('四角個別設定時各角各自套用', () => {
    const s = withShape({
      margin: m,
      linkCorners: false,
      corners: [
        { type: 'square', size: 50 },
        { type: 'chamfer', size: 50 },
        { type: 'square', size: 0 },
        { type: 'notch', size: 30 },
      ],
    });
    const { calls, sink } = recorder();
    traceWindow(sink, s);
    expect(calls).toEqual([
      ['moveTo', 200, 200],
      ['lineTo', 1670, 200],
      ['lineTo', 1720, 250],
      ['lineTo', 1720, 880],
      ['lineTo', 230, 880],
      ['lineTo', 230, 850],
      ['lineTo', 200, 850],
      ['closePath'],
    ]);
  });
  it('橢圓：內切於窗的矩形', () => {
    const { calls, sink } = recorder();
    traceWindow(sink, withShape({ shape: 'ellipse' }));
    expect(calls[1]).toEqual(['ellipse', 960, 540, 924, 504, 0, 0, Math.PI * 2]);
  });
  it('外側圓角：半徑限制在 540 以內', () => {
    const { calls, sink } = recorder();
    traceOuter(sink, withShape({ outerRadius: 100 }));
    expect(calls[0]).toEqual(['moveTo', 100, 0]);
    expect(calls[1]).toEqual(['arcTo', 1920, 0, 1920, 1080, 100]);
  });
});

describe('窗的資訊與 CCFOLIA 格數（F05、F11、3.13）', () => {
  it('預設 1920 × 1080、邊距 36 → 1848 × 1008 px，46.2 × 25.2 格，位置 0.9, 0.9', () => {
    expect(windowInfo(defaultState())).toEqual({
      pxW: 1848,
      pxH: 1008,
      cellsW: '46.2',
      cellsH: '25.2',
      posX: '0.9',
      posY: '0.9',
    });
  });
  it('換輸出尺寸時設計維持比例：邊距 36 單位在 1280 × 720 是 24 px', () => {
    const s = defaultState();
    s.size = { w: 1280, h: 720 };
    const info = windowInfo(s);
    expect([info.pxW, info.pxH]).toEqual([1232, 672]);
    expect([info.cellsW, info.posX]).toEqual(['46.2', '0.9']);
  });
  it('3.13 的表（64 × 4096 依第 7 節裁定改成 1 × 64）', () => {
    const rows: [number, number, number, number, boolean][] = [
      [1920, 1080, 48, 27, false],
      [1280, 720, 48, 27, false],
      [1152, 648, 48, 27, false],
      [1600, 900, 48, 27, false],
      [1440, 1080, 60, 45, false],
      [960, 720, 40, 30, false],
      [1080, 1080, 45, 45, false],
      [1536, 864, 64, 36, false],
      [1000, 700, 50, 35, false],
      [1001, 700, 48, 34, true],
      [4096, 64, 64, 1, false],
      [64, 4096, 1, 64, false],
    ];
    for (const [w, h, cw, ch, approx] of rows)
      expect(suggestGridCells(w, h), `${w}×${h}`).toEqual({
        width: cw,
        height: ch,
        approximate: approx,
      });
  });
});

describe('線條（3.4）與漸層（3.3）', () => {
  it('雙線的間隔＝max(3, 1.5 × 粗細)', () => {
    expect(doubleGap(1)).toBe(3);
    expect(doubleGap(2)).toBe(3);
    expect(doubleGap(4)).toBe(6);
    /* 窗緣 x＝100、粗細 4、距離 10 → 線在 86～89 與 76～79 */
    const w = 4;
    const gap = 10;
    const second = gap + w + doubleGap(w);
    expect([100 - gap - w, 100 - gap - 1, 100 - second - w, 100 - second - 1]).toEqual([
      86, 89, 76, 79,
    ]);
  });
  it('線性漸層的長度與 CSS 相同（投影整張畫布）', () => {
    expect(linearGradientLine(180, 1920).map((v) => Math.round(v) + 0)).toEqual([
      960, 0, 960, 1080,
    ]);
    expect(linearGradientLine(0, 1920).map((v) => Math.round(v) + 0)).toEqual([960, 1080, 960, 0]);
    expect(linearGradientLine(90, 1920).map((v) => Math.round(v) + 0)).toEqual([0, 540, 1920, 540]);
    /* 45°：左下角＝框色 1、右上角＝框色 2；端點的投影剛好碰到角 */
    const [x0, y0, x1, y1] = linearGradientLine(45, 1920);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const t = (x: number, y: number) => ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy);
    expect(t(0, 1080)).toBeCloseTo(0, 9);
    expect(t(1920, 0)).toBeCloseTo(1, 9);
  });
  it('放射漸層：中心到 35% 是框色 1', () => {
    expect(RADIAL_INNER).toBe(0.35);
  });
});

describe('命中測試與拖曳（F48）', () => {
  const hits = [
    { id: 'a', cx: 100, cy: 100, w: 40, h: 20, rotation: 0 },
    { id: 'b', cx: 110, cy: 100, w: 40, h: 20, rotation: 90 },
  ];
  it('命中最上層（清單最後），容許邊緣外 6 單位，隨旋轉', () => {
    expect(hitTest(hits, 110, 100)?.id).toBe('b');
    expect(hitTest(hits, 75, 100)?.id).toBe('a');
    expect(hitTest(hits, 73, 100)).toBeNull();
    /* b 轉了 90°：上下方向是長邊 */
    expect(hitTest(hits, 110, 125)?.id).toBe('b');
    expect(hitTest(hits, 110, 127)).toBeNull();
  });
  it('移動超過 2 單位才開始拖；Shift 只留較大的方向', () => {
    expect(DRAG_THRESHOLD).toBe(2);
    expect(lockAxis(5, 3, true)).toEqual([5, 0]);
    expect(lockAxis(2, -7, true)).toEqual([0, -7]);
    expect(lockAxis(2, -7, false)).toEqual([2, -7]);
  });
});

describe('差分標籤的擺放（3.9）', () => {
  const m = { t: 36, r: 36, b: 36, l: 36 };
  it('左右類距畫布邊 30、中間類水平置中', () => {
    const box = { w: 184, h: 75 };
    expect(indicatorCenter({ pos: 'tl', x: 0, y: 0 }, box, m, 1920)).toEqual({
      cx: 30 + 92,
      cy: 30 + 37.5,
    });
    expect(indicatorCenter({ pos: 'br', x: 0, y: 0 }, box, m, 1920)).toEqual({
      cx: 1920 - 30 - 92,
      cy: 1080 - 30 - 37.5,
    });
    expect(indicatorCenter({ pos: 'tc', x: 0, y: 0 }, box, m, 1920).cx).toBe(960);
    expect(LABEL_PAD).toBe(30);
  });
  it('上邊距 ≥ 標籤高＋16 時放在上方框帶的正中間（電影黑邊）', () => {
    const cinema = { t: 120, r: 0, b: 120, l: 0 };
    expect(indicatorCenter({ pos: 'tc', x: 0, y: 0 }, { w: 200, h: 76 }, cinema, 1920).cy).toBe(60);
    expect(indicatorCenter({ pos: 'br', x: 0, y: 0 }, { w: 200, h: 76 }, cinema, 1920).cy).toBe(
      1020,
    );
    expect(indicatorCenter({ pos: 'tc', x: 0, y: 0 }, { w: 200, h: 105 }, cinema, 1920).cy).toBe(
      30 + 52.5,
    );
  });
  it('自由位置：標籤中心在畫布寬、高的比例', () => {
    expect(indicatorCenter({ pos: 'free', x: 0.25, y: 0.5 }, { w: 10, h: 10 }, m, 1440)).toEqual({
      cx: 360,
      cy: 540,
    });
  });
});

describe('文字排版（3.10）', () => {
  /* 假的量測：每個字寬＝字級（以 1 計，乘上字級） */
  const measure = (s: string) => [...s].length * 44;
  it('橫書：行高 1.3 × 字級、字距加在字之間、整塊寬＝最寬的一行', () => {
    const b = layoutText(
      '一二三四五六七八\n短',
      { size: 44, spacing: 0.1, vertical: false },
      measure,
    );
    expect(b.lineH).toBeCloseTo(57.2, 9);
    expect(b.h).toBeCloseTo(114.4, 9);
    expect(b.w).toBeCloseTo(8 * 44 + 7 * 4.4, 9);
    expect(spacedWidth(measure, 'ab', 0)).toBe(88);
  });
  it('直書：每行一欄（欄寬 1.35 × 字級）、字間距＝字級 ×（1＋字距）', () => {
    const b = layoutText('一二三\n四', { size: 40, spacing: 0.2, vertical: true }, measure);
    expect(b.w).toBeCloseTo(2 * 54, 9);
    expect(b.h).toBeCloseTo(3 * 48, 9);
  });
  it('命中範圍至少 24 × 24 單位', () => {
    expect(MIN_TEXT_HIT).toBe(24);
  });
});
