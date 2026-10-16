/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 第五批接手後補的：時間軸的其他影格、分頁庫也要算進來的地方（原作的 sheetDataObjs、binSheets），
 * 以及 GIF／影片的出血與逐格編碼 MP4 的回歸測試。
 * - 匯入的字型：只在別格出現的角色用的字型，GIF／影片、互動網頁的動畫也要內嵌（原作 vFontHashes 掃每一格）。
 * - 角色庫、標籤庫「依分頁分組」看每一格（原作 libSheetUsageMap）；角色庫的 ✓ 只看目前影格（原作 libOnCurrentSheet）。
 * - 角色庫、關係庫的用量與「只看未使用」把分頁庫也算在用（原作 libBinUsageCount、variantBinCount）。
 * - 頭像框的「幾位在戴」看每一格、也數分頁庫（原作 frameUsage）。
 * - 刪除關係類型：每一格那種關係線一起刪（原作只刪目前影格，其他影格留下沒有類型的線）。
 * - 讀原作的檔：有時間軸分頁就不是空白專案（原作 loadProject 的 pristine）。
 * - 分頁庫的複製：時間照原本那一筆（原作 sheetLibCopy）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const video = vi.hoisted(() => ({ encodeMp4: vi.fn(), canEncodeMp4: vi.fn() }));
vi.mock('@/core/video', async (orig) => ({
  ...(await orig<typeof import('@/core/video')>()),
  encodeMp4: video.encodeMp4,
  canEncodeMp4: video.canEncodeMp4,
}));
const raster = vi.hoisted(() => ({ svgToCanvas: vi.fn() }));
vi.mock('@/tools/relation-chart/export/raster', async (orig) => ({
  ...(await orig<typeof import('@/tools/relation-chart/export/raster')>()),
  svgToCanvas: raster.svgToCanvas,
}));

const { animFrameSvg } = await import('@/tools/relation-chart/engine/chart');
const { exportAssetIds } = await import('@/tools/relation-chart/editor/exportRun');
const { isBlankProject } = await import('@/tools/relation-chart/editor/files');
const { frameUsage } = await import('@/tools/relation-chart/editor/FrameUi');
const { labelUsage } = await import('@/tools/relation-chart/editor/LabelLibrary');
const { AnimPainter, animPlanFor, buildVideo } = await import('@/tools/relation-chart/export/anim');
const { usedFontIds } = await import('@/tools/relation-chart/export/fonts');
const { viewerHtml } = await import('@/tools/relation-chart/export/viewer');
const { tweenAt } = await import('@/tools/relation-chart/logic/tween');
const { typeLineCount } = await import('@/tools/relation-chart/model/timeline');
const { charLibUsage, relLibUsage } = await import('@/tools/relation-chart/model/library');
const { emptySheet, initialProject } = await import('@/tools/relation-chart/model/normalize');
const {
  addChar,
  addSheet,
  addType,
  deleteSheet,
  deleteType,
  linkClick,
  startLink,
  switchSheet,
  updateChar,
} = await import('@/tools/relation-chart/state/actions');
const { copySheetLibItem } = await import('@/tools/relation-chart/state/sheetLibActions');
const { activeSheet, setUi, updateProject, useProject, useUi } = await import(
  '@/tools/relation-chart/state/store'
);
const { addFrameAfter, convertToTimeline, copyFrameAt, switchFrame } = await import(
  '@/tools/relation-chart/state/tlActions'
);
const { undo } = await import('@/tools/relation-chart/editor/undo');

import type { Project } from '@/tools/relation-chart/model/types';

const p = (): Project => useProject.getState().data;

beforeEach(() => {
  let t = 1e12;
  vi.spyOn(Date, 'now').mockImplementation(() => (t += 10));
  setUi({ sel: [], panel: null, focus: null, readonly: false, tlPos: null, link: null });
});

/** 一張分頁：a、b 兩位角色在固定的位置 */
function start(): [number, number] {
  const s = emptySheet(1, 1, { W: 1000, H: 800 });
  useProject.getState().replace({ ...initialProject(), sheets: [s], nextId: 10 });
  const a = addChar(() => 0.5);
  const b = addChar(() => 0.5);
  updateChar(a, (c) => {
    c.x = 200;
    c.y = 300;
  });
  updateChar(b, (c) => {
    c.x = 700;
    c.y = 300;
  });
  useProject.temporal.getState().clear();
  return [a, b];
}

/** 時間軸：第 1 格 a、b；第 2 格（複製）多一位只在第 2 格的 c；回到第 1 格 */
function timelineWithExtra(): { a: number; b: number; c: number } {
  const [a, b] = start();
  convertToTimeline();
  copyFrameAt(0);
  const c = addChar(() => 0.5);
  updateChar(c, (x) => {
    x.x = 500;
    x.y = 600;
  });
  switchFrame(0);
  return { a, b, c };
}

describe('匯入的字型：只在別格出現的角色（GIF／影片、互動網頁的動畫）', () => {
  it('動畫要內嵌每一格用到的字型；靜態的匯出照舊只看目前影格', () => {
    const { c } = timelineWithExtra();
    updateProject((d) => {
      d.fonts = [{ id: 'font1', name: '手寫', fmt: 'woff2' }];
    });
    switchFrame(1);
    updateChar(c, (x) => {
      x.font = 'f:font1';
    });
    switchFrame(0);
    const s = activeSheet();
    expect(s.chars.some((x) => x.id === c)).toBe(false);
    const input = {
      font: 'sans' as const,
      fonts: p().fonts,
      uris: new Map([['font1', 'data:font/woff2;base64,AAAA']]),
    };
    expect(usedFontIds([s], input)).toEqual([]);
    expect(usedFontIds([s], input, true)).toEqual(['font1']);
    /* 匯出要準備的資料（字型的 data URI）含別格的字型 */
    expect([...exportAssetIds(p(), [0])]).toContain('font1');
    /* 互動網頁的動畫：@font-face 有這套字型 */
    const html = viewerHtml([s], { font: 'sans', labels: [], fonts: p().fonts, uris: input.uris });
    expect(html).toContain('font-family:"crf-font1"');
  });
});

describe('GIF／影片', () => {
  it('每一格以畫布左上為原點、裁到畫布：別格有角色出血時，這一格的內容不會跟著偏（7.4 第 6 項，D77）', () => {
    const { a, c } = timelineWithExtra();
    /* 第 2 格的 c 跑到畫布左外（出血） */
    switchFrame(1);
    updateChar(c, (x) => {
      x.x = -60;
      x.y = 100;
    });
    switchFrame(0);
    const s = activeSheet();
    const plan = animPlanFor(s, 'gif');
    const look = { href: () => null, font: 'sans' as const, outW: plan.outW, outH: plan.outH };
    const at = (pp: number) => {
      const fr = tweenAt(s, pp);
      return animFrameSvg(fr.sheet, { ...look, tween: fr.fx, width: plan.w, height: plan.h });
    };
    const cx = (svg: string, id: number) =>
      new RegExp(`data-id="${id}">[\\s\\S]*?<circle[^>]* cx="([-\\d.]+)"`).exec(svg)?.[1];
    for (const pp of [0, 0.5, 1]) {
      const svg = at(pp);
      expect(svg).toContain(`viewBox="0 0 ${plan.outW} ${plan.outH}"`);
      expect(cx(svg, a)).toBe('200');
    }
  });

  it('影片（MP4）：逐格編碼，每個取樣一格、最後一格重複 20 格＝多停 1 秒；寬高偶數；時長＝(取樣數 ＋ 20) ÷ 20', async () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    const fake = new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) => (k in t ? t[k] : () => undefined),
      set: (t, k, v) => {
        t[k] = v;
        return true;
      },
    });
    HTMLCanvasElement.prototype.getContext = (() =>
      fake) as unknown as HTMLCanvasElement['getContext'];
    try {
      const { a } = timelineWithExtra();
      /* 每一格都是 1001 × 777（奇數） */
      updateProject((d) => {
        d.sheets[0].W = 1001;
        d.sheets[0].H = 777;
        for (const f of d.sheets[0].tl?.frames ?? []) {
          f.W = 1001;
          f.H = 777;
        }
      });
      expect(a).toBeGreaterThan(0);
      const s = activeSheet();
      const plan = animPlanFor(s, 'video', true);
      raster.svgToCanvas.mockImplementation(async () => document.createElement('canvas'));
      video.canEncodeMp4.mockResolvedValue(true);
      let seen: { width: number; height: number; fps: number; frameCount: number } | null = null;
      video.encodeMp4.mockImplementation(
        async (o: {
          width: number;
          height: number;
          fps: number;
          frameCount: number;
          renderFrame: (i: number) => Promise<unknown>;
        }) => {
          seen = { width: o.width, height: o.height, fps: o.fps, frameCount: o.frameCount };
          for (let i = 0; i < o.frameCount; i++) await o.renderFrame(i);
          return new Blob(['mp4'], { type: 'video/mp4' });
        },
      );
      const r = await buildVideo(s, {
        sheets: [s],
        font: 'sans',
        labels: [],
        uris: new Map(),
        transparent: false,
      });
      const n = plan.ps.length;
      expect(seen).toEqual({ width: 1000, height: 776, fps: 20, frameCount: n + 20 });
      /* 只畫取樣的那幾格（最後停的 1 秒重複最後一格，不再畫） */
      expect(raster.svgToCanvas).toHaveBeenCalledTimes(n);
      expect(r).toMatchObject({ ext: 'mp4', method: 'mp4', width: 1000, height: 776 });
      expect(r.seconds).toBeCloseTo((n + 20) / 20, 6);
    } finally {
      HTMLCanvasElement.prototype.getContext = getContext;
    }
  });
});

describe('GIF／影片的每一格是一次貼上去的', () => {
  it('先畫在暫存的畫布、最後一次貼到輸出的畫布（即時錄影不會錄到只有背景、還沒畫角色的半成品格，7.13）', async () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    const calls = new Map<HTMLCanvasElement, string[]>();
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      const list = calls.get(this) ?? [];
      calls.set(this, list);
      const props: Record<string | symbol, unknown> = {};
      return new Proxy(props, {
        get: (t, k) => (k in t ? t[k] : (..._a: unknown[]) => list.push(String(k))),
        set: (t, k, v) => {
          t[k] = v;
          return true;
        },
      });
    } as unknown as HTMLCanvasElement['getContext'];
    try {
      timelineWithExtra();
      updateProject((d) => {
        d.sheets[0].bg = 'bg-a';
      });
      const s = activeSheet();
      raster.svgToCanvas.mockImplementation(async () => document.createElement('canvas'));
      const plan = animPlanFor(s, 'video', true);
      const input = {
        sheets: [s],
        font: 'sans' as const,
        labels: [],
        uris: new Map(),
        transparent: false,
      };
      const painter = new AnimPainter(s, input, plan, {});
      const target = document.createElement('canvas');
      const ctx = target.getContext('2d') as CanvasRenderingContext2D;
      await painter.paint(ctx, 0.5);
      expect(calls.get(target)).toEqual(['drawImage']);
      painter.close();
    } finally {
      HTMLCanvasElement.prototype.getContext = getContext;
      raster.svgToCanvas.mockReset();
    }
  });
});

describe('角色庫、標籤庫、頭像框：時間軸的每一格、分頁庫', () => {
  afterEach(() => {
    raster.svgToCanvas.mockReset();
  });

  it('依分頁分組看每一格（原作 libSheetUsageMap）；分頁庫也算在用（用量與「只看未使用」，原作 libBinUsageCount）', () => {
    const { c } = timelineWithExtra();
    const cEntry = p().sheets[0].tl?.frames[1].chars.find((x) => x.id === c)?.lib as number;
    const u = charLibUsage(p().sheets);
    expect(u.sheetsOf(cEntry)).toEqual([0]);
    /* 再開一張分頁放一位 d，刪掉那張（封存進分頁庫） */
    addSheet(false);
    const d = addChar(() => 0.5);
    const dEntry = activeSheet().chars.find((x) => x.id === d)?.lib as number;
    const dVar = activeSheet().chars.find((x) => x.id === d)?.vari as number;
    deleteSheet(1);
    const bin = p().sheetLib.map((x) => x.sheet);
    const u2 = charLibUsage(p().sheets, bin);
    expect(u2.entry.get(dEntry) ?? 0).toBe(0);
    expect(u2.entryBin.get(dEntry)).toBe(1);
    expect(u2.variantBin.get(dVar)).toBe(1);
    expect(u2.sheetsOf(dEntry)).toEqual([]);
  });

  it('關係庫：分頁庫也算在用', () => {
    start();
    addSheet(false);
    const t = addType();
    const ty = activeSheet().types.find((x) => x.id === t);
    deleteSheet(1);
    const u = relLibUsage(
      p().sheets,
      p().sheetLib.map((x) => x.sheet),
    );
    expect(u.entry.get(ty?.lib as number) ?? 0).toBe(0);
    expect(u.entryBin.get(ty?.lib as number)).toBe(1);
    expect(u.variantBin.get(ty?.vari as number)).toBe(1);
  });

  it('標籤庫的依分頁分組：只在別格掛著標籤的角色也算', () => {
    const { c } = timelineWithExtra();
    updateProject((d) => {
      d.labels.push({
        id: 900,
        text: '路人',
        color: 'auto',
        hidden: false,
        noPull: false,
        zone: false,
        frame: '',
      });
    });
    switchFrame(1);
    updateChar(c, (x) => {
      x.labels = [900];
    });
    switchFrame(0);
    expect(labelUsage(p().sheets, p().library).bySheet[0].has(900)).toBe(true);
  });

  it('頭像框「幾位在戴」：每一格（同一位角色算一次）、分頁庫也算（原作 frameUsage）', () => {
    const { a, c } = timelineWithExtra();
    updateProject((d) => {
      d.frames = [{ id: 'fr1', name: '金框' }];
    });
    switchFrame(1);
    updateChar(c, (x) => {
      x.frame = 'fr1';
    });
    updateChar(a, (x) => {
      x.frame = 'fr1';
    });
    switchFrame(0);
    expect(frameUsage(p()).get('fr1')).toBe(2);
    addSheet(false);
    const d = addChar(() => 0.5);
    updateChar(d, (x) => {
      x.frame = 'fr1';
    });
    deleteSheet(1);
    expect(frameUsage(p()).get('fr1')).toBe(3);
  });
});

describe('時間軸的其他影格：刪除關係類型、讀原作的檔', () => {
  it('刪除關係類型：每一格那種線一起刪；一步復原', () => {
    const [a, b] = start();
    const t = addType();
    startLink(t);
    linkClick(a);
    linkClick(b);
    setUi({ link: null });
    convertToTimeline();
    copyFrameAt(0);
    switchFrame(0);
    deleteType(t);
    const s = activeSheet();
    expect(s.rels).toHaveLength(0);
    expect(s.tl?.frames[1].rels).toHaveLength(0);
    undo();
    expect(activeSheet().tl?.frames[1].rels).toHaveLength(1);
  });

  it('刪除關係類型的確認數字：每一格的線都算（同一條線在兩格＝2 條，7.13）', () => {
    const [a, b] = start();
    const t = addType();
    startLink(t);
    linkClick(a);
    linkClick(b);
    setUi({ link: null });
    expect(typeLineCount(activeSheet(), t)).toBe(1);
    convertToTimeline();
    copyFrameAt(0);
    addFrameAfter();
    switchFrame(0);
    /* 第 1、2 格各一條（第 3 格保持＝不算） */
    expect(typeLineCount(activeSheet(), t)).toBe(2);
  });

  it('空白專案的判斷：有時間軸分頁（目前影格是空的）就不是空白（原作 loadProject 的 pristine）', () => {
    const s = emptySheet(1, 1, { W: 1000, H: 800 });
    useProject.getState().replace({ ...initialProject(), sheets: [s], nextId: 10 });
    expect(isBlankProject(p())).toBe(true);
    convertToTimeline();
    addFrameAfter();
    expect(activeSheet().chars).toHaveLength(0);
    expect(isBlankProject(p())).toBe(false);
  });
});

describe('時間軸的預覽與模式跟著分頁', () => {
  it('切換、新增、刪除分頁＝預覽與影格列的模式結束（原作 switchSheet）', () => {
    timelineWithExtra();
    const ui = () => {
      const u = useUi.getState();
      return [u.tlPos, u.tlPlaying, u.tlMode];
    };
    setUi({ tlPos: 0.5, tlPlaying: true, tlMode: 'copy' });
    addSheet(false);
    expect(ui()).toEqual([null, false, null]);
    setUi({ tlPos: 0.5, tlPlaying: false, tlMode: 'del' });
    switchSheet(0);
    expect(ui()).toEqual([null, false, null]);
    setUi({ tlPos: 0.5 });
    deleteSheet(1);
    expect(ui()).toEqual([null, false, null]);
  });
});

describe('分頁庫', () => {
  it('複製：時間照原本那一筆（原作 sheetLibCopy）', () => {
    start();
    addSheet(false);
    deleteSheet(1);
    const src = p().sheetLib[0];
    copySheetLibItem(src.id);
    const lib = p().sheetLib;
    expect(lib).toHaveLength(2);
    expect(lib[1].savedAt).toBe(src.savedAt);
    expect(lib[1].id).not.toBe(src.id);
  });
});
