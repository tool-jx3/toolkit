/**
 * 室內平面圖：棋子方格（2026-10，原作 v1.07；規格 F220～F222、3.9、D34）。
 *
 * - 地圖設定：方格大小 0.5／1／1.5／2／3 m（1／2／3／4／6 格）、顏色、不透明度；存進專案檔、分享連結，讀得到原作的 `tokenGrid`。
 * - 匯出：範圍（四周留白、樓層名稱、間隔、GM 字帶）對齊「格線的單位」與方格大小的最小公倍數，所以圖的左上角在方格線上、
 *   寬高是方格的整數倍；匯出資訊寫「每格幾 px」。
 */
import { describe, expect, it } from 'vitest';
import { exportLayout, exportUnit } from '@/tools/floor-plan/draw/export';
import { isAsset } from '@/tools/floor-plan/model/assets';
import { TOKEN_GRID_SIZES } from '@/tools/floor-plan/model/catalog';
import { compatCounts } from '@/tools/floor-plan/model/compat';
import { exportOptions, tokenGridPx } from '@/tools/floor-plan/model/exportPlan';
import { emptyFloor } from '@/tools/floor-plan/model/geometry';
import { type NormalizeReport, normalizeProject } from '@/tools/floor-plan/model/normalize';
import { encodeMapHash, packProject, readMapHash } from '@/tools/floor-plan/model/share';
import type { Floor, Project, Room } from '@/tools/floor-plan/model/types';
import { instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';

const room = (id: string, x: number, y: number, w: number, h: number): Room => ({
  id,
  x,
  y,
  w,
  h,
  name: id,
  cat: 'living',
});

const baseOpts = {
  theme: 'clean' as const,
  px: 48,
  showSize: 'none' as const,
  hideNames: false,
  playerView: true,
  hideClues: false,
  grid: false,
  transparent: false,
};

const project = (patch: Partial<Project> = {}): Project => ({
  name: '測試',
  theme: 'clean',
  showSize: 'none',
  showNames: true,
  floors: [{ ...emptyFloor('1F'), rooms: [room('a', 0, 0, 10, 8)] }],
  active: 0,
  ...patch,
});

const norm = (raw: unknown, report?: NormalizeReport) => normalizeProject(raw, isAsset, report);

describe('棋子方格：匯出範圍對齊方格', () => {
  it('對齊的單位＝格線的單位（沒有 1、有 2）與方格大小的最小公倍數', () => {
    expect(TOKEN_GRID_SIZES).toEqual([1, 2, 3, 4, 6]);
    expect(exportUnit(false)).toBe(1);
    expect(exportUnit(true)).toBe(2);
    expect(exportUnit(false, 0)).toBe(1);
    const table = (grid: boolean) => TOKEN_GRID_SIZES.map((t) => exportUnit(grid, t));
    expect(table(false)).toEqual([1, 2, 3, 4, 6]);
    /* 開了格線（2 格的粗線）：1→2、2→2、3→6、4→4、6→6 */
    expect(table(true)).toEqual([2, 2, 6, 4, 6]);
  });

  it('一層：套房（開頁的範本）每種方格大小，原點與寬高都是方格的整數倍', () => {
    const [f] = instantiateTemplate('studio') as Floor[];
    const base = exportLayout([f], baseOpts);
    expect([base.pxWidth, base.pxHeight]).toEqual([1200, 1008]);
    const seen: Record<number, string> = {};
    for (const t of TOKEN_GRID_SIZES) {
      const L = exportLayout([f], { ...baseOpts, tokenGrid: t });
      const fr = L.frames[0];
      expect(fr.x % t).toBeCloseTo(0, 9);
      expect(fr.y % t).toBeCloseTo(0, 9);
      expect(L.width % t).toBe(0);
      expect(L.height % t).toBe(0);
      expect(L.pxWidth).toBe(L.width * 48);
      expect(L.tokenGrid).toBe(t);
      expect(L.tokenPx).toBe(t * 48);
      /* 範圍只會變大，不會切到東西 */
      expect(fr.w).toBeGreaterThanOrEqual(base.frames[0].w);
      expect(fr.h).toBeGreaterThanOrEqual(base.frames[0].h);
      seen[t] = `${L.pxWidth}×${L.pxHeight}`;
    }
    /* 套房 25 × 21 格：方格 1 格不變（25 × 21）；2 格 26 × 22；3 格 27 × 21；4 格 28 × 24；6 格 30 × 24 */
    expect(seen).toEqual({
      1: '1200×1008',
      2: '1248×1056',
      3: '1296×1008',
      4: '1344×1152',
      6: '1440×1152',
    });
  });

  it('每個範本、每種方格大小、格線開關、PL／GM、單層與排成一張：全部是單位的整數倍、左上角在格線上', () => {
    const bad: string[] = [];
    let n = 0;
    for (const t of TEMPLATES) {
      const floors = instantiateTemplate(t.id) as Floor[];
      for (const tg of TOKEN_GRID_SIZES)
        for (const grid of [false, true])
          for (const playerView of [true, false]) {
            const unit = exportUnit(grid, tg);
            const o = {
              ...baseOpts,
              grid,
              playerView,
              tokenGrid: tg,
              gmBadge: playerView ? null : 'GM 用',
            };
            const ok = (v: number) => Math.abs(v / unit - Math.round(v / unit)) < 1e-9;
            const check = (label: string, L: ReturnType<typeof exportLayout>) => {
              n++;
              for (const r of L.frames)
                if (![r.x, r.y, r.w, r.h].every(ok)) bad.push(`${label} ${JSON.stringify(r)}`);
              if (![L.width, L.height, L.badgeH, L.gap, L.titleH].every(ok))
                bad.push(`${label} ${L.width}×${L.height}`);
              if (L.width % tg || L.height % tg) bad.push(`${label} 不是方格的倍數`);
              if (L.pxWidth !== L.width * 48 || L.pxHeight !== L.height * 48)
                bad.push(`${label} px ${L.pxWidth}×${L.pxHeight}`);
            };
            const tag = `${t.id} t=${tg} grid=${grid} pl=${playerView}`;
            for (const f of floors) check(`${tag} ${f.name}`, exportLayout([f], o));
            check(`${tag} all`, exportLayout(floors, o));
          }
    }
    expect(n).toBeGreaterThan(800);
    expect(bad).toEqual([]);
  });

  it('好幾層排成一張：樓層名稱、間隔、字帶都是單位的倍數，每一層的內容區（名稱列下面）左上角也在格線上', () => {
    const a = { ...emptyFloor('1F'), rooms: [room('a', 1, 1, 10, 4)] };
    const b = { ...emptyFloor('2F'), rooms: [room('b', 3, 0, 7, 5)] };
    for (const tg of TOKEN_GRID_SIZES)
      for (const grid of [false, true]) {
        const unit = exportUnit(grid, tg);
        const L = exportLayout([a, b], { ...baseOpts, tokenGrid: tg, grid, gmBadge: 'GM 用' });
        expect(L.titleH % unit).toBe(0);
        expect(L.gap % unit).toBe(0);
        expect(L.badgeH % unit).toBe(0);
        expect(L.titleH).toBeGreaterThanOrEqual(2);
        expect(L.gap).toBeGreaterThanOrEqual(1);
        for (const fr of L.frames) {
          expect(Math.abs((fr.y + L.titleH) % unit)).toBe(0);
          expect(Math.abs(fr.x % unit)).toBe(0);
        }
      }
  });

  it('沒有棋子方格時，版面和以前完全一樣（含 0、undefined）', () => {
    const [f] = instantiateTemplate('studio') as Floor[];
    const a = exportLayout([f], baseOpts);
    expect(exportLayout([f], { ...baseOpts, tokenGrid: 0 })).toEqual(a);
    expect(a.tokenGrid).toBe(0);
    expect(a.tokenPx).toBe(0);
    for (const grid of [false, true]) {
      const L = exportLayout([f], { ...baseOpts, grid });
      expect(L.frames[0].w % exportUnit(grid)).toBe(0);
    }
  });

  it('自動縮小時，每格 px 用實際的倍率；沒有縮小時是方格大小 × 每格 px', () => {
    const big = { ...emptyFloor('1F'), rooms: [room('a', 0, 0, 400, 10)] };
    const L = exportLayout([big], { ...baseOpts, px: 96, tokenGrid: 2 });
    expect(L.scale).toBeLessThan(96);
    expect(L.tokenPx).toBeCloseTo(2 * L.scale, 9);
    expect(tokenGridPx(2, L.scale)).toBeCloseTo(2 * L.scale, 2);
    /* 顯示用：小數 2 位 */
    expect(tokenGridPx(3, 48)).toBe(144);
    expect(tokenGridPx(2, 38.4)).toBe(76.8);
    expect(tokenGridPx(0, 48)).toBe(0);
  });

  it('exportOptions 把地圖的棋子方格設定帶進匯出', () => {
    const p = project({ tokenGrid: 3, tokenGridColor: '#ff0000', tokenGridOpacity: 0.7 });
    const exp = {
      range: 'current' as const,
      view: 'pl' as const,
      clues: 'show' as const,
      px: 48 as const,
      grid: false,
      transparent: false,
    };
    const o = exportOptions(p, exp, 'clean', 48);
    expect([o.tokenGrid, o.tokenGridColor, o.tokenGridOpacity]).toEqual([3, '#ff0000', 0.7]);
    const o2 = exportOptions(project(), exp, 'clean', 48);
    expect([o2.tokenGrid, o2.tokenGridColor, o2.tokenGridOpacity]).toEqual([
      0,
      undefined,
      undefined,
    ]);
  });
});

describe('棋子方格：存檔欄位', () => {
  it('讀進來：大小只認 1／2／3／4／6（其他當作沒有）；顏色轉小寫；不透明度夾在 0.1～1', () => {
    for (const t of TOKEN_GRID_SIZES)
      expect(norm(project({ tokenGrid: t as never }))?.tokenGrid).toBe(t);
    for (const bad of [0, 5, 7, -2, 2.5, '2x', null, 'abc'])
      expect(norm({ ...project(), tokenGrid: bad })).not.toHaveProperty('tokenGrid');
    expect(norm({ ...project(), tokenGrid: '3' })?.tokenGrid).toBe(3);
    const p = norm({
      ...project(),
      tokenGrid: 2,
      tokenGridColor: '#FF8800',
      tokenGridOpacity: 0.65,
    });
    expect([p?.tokenGrid, p?.tokenGridColor, p?.tokenGridOpacity]).toEqual([2, '#ff8800', 0.65]);
    expect(norm({ ...project(), tokenGrid: 2, tokenGridOpacity: 5 })?.tokenGridOpacity).toBe(1);
    expect(norm({ ...project(), tokenGrid: 2, tokenGridOpacity: 0 })?.tokenGridOpacity).toBe(0.1);
    expect(norm({ ...project(), tokenGrid: 2, tokenGridOpacity: 'x' })).not.toHaveProperty(
      'tokenGridOpacity',
    );
    expect(norm({ ...project(), tokenGrid: 2, tokenGridColor: 'nope' })).not.toHaveProperty(
      'tokenGridColor',
    );
    /* 預設值不寫進去 */
    const d = norm({ ...project(), tokenGrid: 2 }) as unknown as Record<string, unknown>;
    expect(Object.keys(d)).toContain('tokenGrid');
    expect(Object.keys(d)).not.toContain('tokenGridColor');
    expect(Object.keys(d)).not.toContain('tokenGridOpacity');
  });

  it('沒有棋子方格的專案，整理後的欄位和以前完全一樣', () => {
    const p = norm(project()) as unknown as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(
      ['active', 'floors', 'name', 'showNames', 'showSize', 'theme'].sort(),
    );
  });

  it('原作 v1.07 以後的地圖檔：tokenGrid 照讀，不再算「略過的設定」', () => {
    const legacy = {
      app: 'indoor-map-maker',
      v: 1,
      tool: 'v1.07',
      name: '舊檔',
      theme: 'clean',
      showSize: 'jo',
      showNames: true,
      tokenGrid: 4,
      floors: [
        {
          id: 'f',
          name: '1F',
          rooms: [room('a', 0, 0, 4, 4)],
          walls: [],
          openings: [],
          items: [],
          texts: [],
        },
      ],
      active: 0,
    };
    const report: NormalizeReport = { droppedItems: 0 };
    const p = norm(legacy, report);
    expect(p?.tokenGrid).toBe(4);
    expect(p?.tokenGridColor).toBeUndefined();
    expect(report.compat && compatCounts(report.compat).settings).toBe(0);
    /* 原作用 0 表示不顯示；不認得的值也當作沒有，兩種都不算略過 */
    for (const v of [0, 5, undefined]) {
      const r: NormalizeReport = { droppedItems: 0 };
      expect(norm({ ...legacy, tokenGrid: v }, r)).not.toHaveProperty('tokenGrid');
      expect(r.compat && compatCounts(r.compat).settings).toBe(0);
    }
  });

  it('分享連結：完整連結與 PL 用連結都帶著棋子方格（不是秘密），往返後相同', () => {
    const p = project({ tokenGrid: 6, tokenGridColor: '#00aa55', tokenGridOpacity: 0.5 });
    const packed = packProject(p);
    expect([packed.tokenGrid, packed.tokenGridColor, packed.tokenGridOpacity]).toEqual([
      6,
      '#00aa55',
      0.5,
    ]);
    for (const mode of ['full', 'pl'] as const) {
      const h = encodeMapHash(p, mode);
      const r = readMapHash(h.hash);
      expect(r.kind).toBe('ok');
      if (r.kind !== 'ok') return;
      const back = norm(r.raw);
      expect([back?.tokenGrid, back?.tokenGridColor, back?.tokenGridOpacity]).toEqual([
        6,
        '#00aa55',
        0.5,
      ]);
    }
    /* 沒設定時連結裡沒有這些欄位（連結不會變長） */
    const plain = packProject(project());
    expect(Object.keys(plain)).not.toContain('tokenGrid');
    expect(Object.keys(plain)).not.toContain('tokenGridColor');
  });
});
