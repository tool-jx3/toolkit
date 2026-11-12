/**
 * 室內平面圖產生器 2026-11-12 跟進 KIIN「マップ制作スタジオ」v3.0（規格 1.31、3.20、F329～F340、D134～D145）：
 * 事件前後（出現時機、倒下・破損、事件後才停電）、每一種輸出在事件前／事件後與 PL／GM 下看得到什麼（不洩漏）、
 * 專案檔版本 12 與舊版、榻榻米的鋪法、新的素材、日式老宅範本、Z／X 的說明表。
 */
import { describe, expect, it } from 'vitest';
import { exportLayout, renderImage } from '@/tools/floor-plan/draw/export';
import { FURNITURE_DRAW } from '@/tools/floor-plan/draw/furniture';
import { renderStackImage } from '@/tools/floor-plan/draw/stack';
import { drawStageFrame, stageScene } from '@/tools/floor-plan/draw/stage';
import { getTheme } from '@/tools/floor-plan/draw/themes';
import { SHORTCUT_HELP } from '@/tools/floor-plan/editor/keys';
import { ASSET, assetMatches, isAsset } from '@/tools/floor-plan/model/assets';
import { ROOM_PRESETS, THEME_IDS } from '@/tools/floor-plan/model/catalog';
import {
  type ExportSettings,
  exportFileName,
  exportFloors,
  exportJobs,
  exportOptions,
  handoffRoomsOf,
  stackExportOptions,
} from '@/tools/floor-plan/model/exportPlan';
import { visibleFloor } from '@/tools/floor-plan/model/geometry';
import { LIGHT_ITEMS, lightsOf } from '@/tools/floor-plan/model/lights';
import {
  floorUsesMoments,
  momentFloor,
  momentNight,
  momentOf,
  momentOnlyCount,
  momentProject,
  singleMomentProject,
  usesMoments,
} from '@/tools/floor-plan/model/moment';
import { normalizeProject } from '@/tools/floor-plan/model/normalize';
import { groundFloorIndex } from '@/tools/floor-plan/model/ops';
import { encodeMapHash, playerProject, readMapHash } from '@/tools/floor-plan/model/share';
import { buildTimeline, stepState } from '@/tools/floor-plan/model/stage';
import { SURFACES } from '@/tools/floor-plan/model/tabletop';
import { shugiPlan, tatamiCrosses, tatamiMats } from '@/tools/floor-plan/model/tatami';
import { transformProject } from '@/tools/floor-plan/model/transform';
import type { Floor, Item, Project, ThemeId } from '@/tools/floor-plan/model/types';
import { getTemplate, instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';
import { layoutProblems } from '../helpers/floorPlanLayout';
import {
  installRecordingDocument,
  type RecordingCanvas,
  recordingCanvas,
  resetRecordingIds,
} from '../helpers/recordingCanvas';

const EXP: ExportSettings = {
  range: 'current',
  view: 'pl',
  clues: 'show',
  px: 24,
  grid: false,
  transparent: false,
  mode: 'image',
  vttPx: 100,
  noise: true,
};

const item = (id: string, t: string, x: number, y: number, extra: Partial<Item> = {}): Item => {
  const a = ASSET[t];
  return { id, t, x, y, w: a.w, h: a.h, rot: 0, ...extra };
};

function project(id: string, patch: Partial<Project> = {}): Project {
  const floors = instantiateTemplate(id) ?? [];
  return {
    name: id,
    theme: 'clean',
    showSize: 'none',
    showNames: true,
    floors,
    active: groundFloorIndex(floors),
    ...patch,
  };
}

/**
 * 鐘錶行（三層）加上事件前後的東西：一般的、GM 專用的、只在事件前的、倒下、破損、文字、自由線、手畫的牆。
 * 逐指令比較的圖不開夜色（夜色那張畫布是共用的，記錄畫布的內容雜湊會累積；停電另外比匯出的選項）。
 */
function clockWithMoments(patch: Partial<Project> = {}): Project {
  const p = project('clockshop', patch);
  const g = p.floors[1];
  g.items.push(
    item('a-blood', 'blood', 4, 3, { only: 'after' }),
    item('a-gm', 'knife', 6, 4, { only: 'after', gm: true }),
    item('b-photo', 'photo', 3, 12, { only: 'before' }),
    item('b-gm', 'diary', 6, 12, { only: 'before', gm: true }),
  );
  g.items.find((i) => i.t === 'table_round')!.upset = true;
  g.openings.find((o) => o.kind === 'window')!.smashed = true;
  g.texts.push(
    { id: 'a-text', x: 8, y: 3, text: '事件後的字', only: 'after' },
    { id: 'a-gm-text', x: 8, y: 5, text: 'GM 的事件後筆記', only: 'after', gm: true },
  );
  g.lines = [
    { id: 'a-line', kind: 'arrow', x1: 2, y1: 2, cx: 4, cy: 2, x2: 6, y2: 2, only: 'after' },
  ];
  g.walls.push({ id: 'b-wall', x1: 16, y1: 8, x2: 20, y2: 8, kind: 'thin', only: 'before' });
  return p;
}

/**
 * 兩次畫圖逐指令比較：漸層（夜的光）、畫布的編號從 0 數（resetRecordingIds）；第一次畫會順便建好量字寬用的畫布等，
 * 所以先畫一次再重設、畫第二次
 */
function twice(draw: () => RecordingCanvas): string {
  draw();
  resetRecordingIds();
  const c = draw();
  return `${c.width}x${c.height}:${c.hash}`;
}

function hashImage(p: Project, exp: ExportSettings, theme: ThemeId = 'clean'): string {
  return twice(
    () =>
      renderImage(
        exportFloors(p, exp.range),
        exportOptions(p, exp, theme, exp.px),
      ) as unknown as RecordingCanvas,
  );
}

function hashStack(p: Project, exp: ExportSettings): string {
  return twice(
    () =>
      renderStackImage(
        exportFloors(p, exp.range),
        stackExportOptions(p, exp, p.theme, exp.px),
      ) as unknown as RecordingCanvas,
  );
}

const ids = (f: Floor) => [
  ...f.items.map((i) => i.id),
  ...f.texts.map((t) => t.id),
  ...(f.lines ?? []).map((l) => l.id),
  ...f.walls.map((w) => w.id),
];

/* ---------- 資料（F329～F332、F340） ---------- */

describe('事件前後的資料（F329～F332、3.20.1）', () => {
  it('momentFloor：事件前拿掉只在事件後的東西與倒下・破損；事件後拿掉只在事件前的東西', () => {
    const p = clockWithMoments();
    const g = p.floors[1];
    const before = momentFloor(g, 'before');
    const after = momentFloor(g, 'after');
    expect(ids(before)).toContain('b-photo');
    expect(ids(before)).toContain('b-wall');
    for (const id of ['a-blood', 'a-gm', 'a-text', 'a-gm-text', 'a-line'])
      expect(ids(before), id).not.toContain(id);
    expect(before.items.some((i) => i.upset)).toBe(false);
    expect(before.openings.some((o) => o.smashed)).toBe(false);
    for (const id of ['a-blood', 'a-gm', 'a-text', 'a-gm-text', 'a-line'])
      expect(ids(after), id).toContain(id);
    expect(ids(after)).not.toContain('b-photo');
    expect(ids(after)).not.toContain('b-wall');
    expect(after.items.some((i) => i.upset)).toBe(true);
    expect(after.openings.some((o) => o.smashed)).toBe(true);
    /* 整理過的不再整理（畫的時候不會被預設的事件前拿掉事件後的東西） */
    expect(momentFloor(after, 'before')).toBe(after);
    expect(after.shownAt).toBe('after');
    /* 原本的資料不動 */
    expect(g.items.some((i) => i.id === 'a-blood')).toBe(true);
  });

  it('沒有用到事件前後的樓層、地圖原樣傳回（輸出逐指令不變的前提）', () => {
    for (const t of TEMPLATES.filter((x) => x.id !== 'japanese-estate')) {
      const p = project(t.id);
      expect(usesMoments(p), t.id).toBe(false);
      for (const f of p.floors) {
        expect(floorUsesMoments(f), t.id).toBe(false);
        expect(momentFloor(f, 'after')).toBe(f);
      }
      expect(momentProject(p, 'after')).toBe(p);
      expect(singleMomentProject(p, 'after').project).toBe(p);
    }
  });

  it('事件後才停電：事件前沒有夜色、事件後是夜的暗度（0% 時 55%）；沒設時兩種狀態一樣', () => {
    expect(momentNight({ night: 0.3 }, 'before')).toBe(0.3);
    expect(momentNight({ night: 0.3 }, 'after')).toBe(0.3);
    expect(momentNight({ blackout: true }, 'before')).toBeUndefined();
    expect(momentNight({ blackout: true }, 'after')).toBe(0.55);
    expect(momentNight({ blackout: true, night: 0.7 }, 'after')).toBe(0.7);
    expect(momentNight({ blackout: true, night: 0.7 }, 'before')).toBeUndefined();
  });

  it('專案檔版本 12：新的欄位照讀、不認得的值拿掉；版本 11 的檔照讀（逐欄位相同）', () => {
    const raw = {
      name: 'x',
      theme: 'clean',
      showSize: 'none',
      showNames: true,
      active: 0,
      moment: 'after',
      blackout: true,
      floors: [
        {
          id: 'f',
          name: '1F',
          rooms: [
            { id: 'r', x: 0, y: 0, w: 8, h: 8, name: '和室', cat: 'washitsu', tatami: 'shugi' },
            { id: 'r2', x: 8, y: 0, w: 4, h: 4, name: 'x', cat: 'living', tatami: 'nope' },
            { id: 'r3', x: 0, y: 8, w: 4, h: 4, name: 'y', cat: 'living', floor: 'tatami' },
          ],
          walls: [{ id: 'w', x1: 0, y1: 0, x2: 4, y2: 0, kind: 'thin', only: 'before' }],
          openings: [
            {
              id: 'o',
              kind: 'window',
              o: 'h',
              x: 2,
              y: 0,
              len: 2,
              side: 1,
              hinge: 0,
              smashed: true,
              only: 'later',
            },
          ],
          items: [
            { id: 'i', t: 'kotatsu', x: 2, y: 2, w: 2.6, h: 2.6, rot: 0, upset: true },
            { id: 'j', t: 'blood', x: 2, y: 2, w: 2, h: 2, rot: 0, only: 'after', upset: 1 },
          ],
          texts: [{ id: 't', x: 1, y: 1, text: 'a', only: 'before' }],
          lines: [
            { id: 'l', kind: 'rope', x1: 0, y1: 0, cx: 1, cy: 1, x2: 2, y2: 2, only: 'after' },
          ],
        },
      ],
    };
    const p = normalizeProject(raw, isAsset);
    expect(p?.moment).toBe('after');
    expect(p?.blackout).toBe(true);
    const f = p?.floors[0] as Floor;
    expect(f.rooms[0].tatami).toBe('shugi');
    expect(f.rooms[1].tatami).toBeUndefined();
    expect(f.rooms[2].floor).toBe('tatami');
    expect(f.walls[0].only).toBe('before');
    expect(f.openings[0].smashed).toBe(true);
    expect(f.openings[0].only).toBeUndefined();
    expect(f.items[0].upset).toBe(true);
    expect(f.items[1].only).toBe('after');
    expect(f.items[1].upset).toBeUndefined();
    expect(f.texts[0].only).toBe('before');
    expect(f.lines?.[0].only).toBe('after');
    /* 其他值的 moment、blackout 拿掉 */
    const q = normalizeProject({ ...raw, moment: 'before', blackout: 'yes' }, isAsset);
    expect(q && 'moment' in q).toBe(false);
    expect(q && 'blackout' in q).toBe(false);
    /* 版本 11 的檔（沒有新的欄位）：整理後逐欄位相同 */
    for (const t of TEMPLATES.slice(0, 12)) {
      const old = project(t.id);
      expect(normalizeProject(JSON.parse(JSON.stringify(old)), isAsset), t.id).toEqual(old);
    }
  });

  it('只剩一種狀態的地圖（PL 用連結用）：另一種狀態的東西與 `only` 拿掉；事件前不帶倒下・破損・停電；事件後寫 moment', () => {
    const p = clockWithMoments({ blackout: true });
    const b = singleMomentProject(p, 'before');
    const a = singleMomentProject(p, 'after');
    expect(b.removed).toBe(5);
    expect(a.removed).toBe(3);
    const json = (x: Project) => JSON.stringify(x);
    for (const s of ['"only"', 'a-blood', 'a-text', 'a-line', '"upset"', '"smashed"', 'blackout'])
      expect(json(b.project), s).not.toContain(s);
    expect(b.project.night).toBeUndefined();
    expect(b.project.moment).toBeUndefined();
    expect(json(a.project)).not.toContain('"only"');
    expect(json(a.project)).not.toContain('b-photo');
    expect(json(a.project)).toContain('"upset":true');
    expect(a.project.night).toBe(0.55);
    expect(a.project.moment).toBe('after');
    expect(momentOnlyCount(p, 'before')).toBe(5);
    expect(momentOnlyCount(p, 'after')).toBe(3);
  });
});

/* ---------- 每一種輸出看得到什麼（F333、F335；不洩漏） ---------- */

describe('每一種輸出在事件前／事件後與 PL／GM 下看得到的東西（F333～F335、D137）', () => {
  it('匯出 PNG：每個狀態＝只剩那個狀態的地圖（逐指令相同）；兩個狀態的圖一樣大、位置一樣', () => {
    const restore = installRecordingDocument();
    try {
      const p = clockWithMoments();
      for (const view of ['pl', 'gm', 'reveal'] as const)
        for (const range of ['current', 'all', 'each'] as const)
          for (const m of ['before', 'after'] as const) {
            const e = { ...EXP, view, range, moment: m };
            expect(hashImage(p, e), `${view}|${range}|${m}`).toBe(
              hashImage(singleMomentProject(p, m).project, { ...EXP, view, range }),
            );
          }
      const size = (m: 'before' | 'after') =>
        exportJobs(p, { ...EXP, moment: m }).map((j) => {
          const L = exportLayout(j.floors, exportOptions(p, { ...EXP, moment: m }, 'clean', 24));
          return [L.pxWidth, L.pxHeight, L.frames[0].x, L.frames[0].y];
        });
      expect(size('before')).toEqual(size('after'));
    } finally {
      restore();
    }
  });

  it('PL 用的圖：GM 專用的事件後／事件前的東西在兩個狀態都不畫（加了和沒加逐指令相同）', () => {
    const restore = installRecordingDocument();
    try {
      const p = clockWithMoments();
      const q = structuredClone(p);
      const g = q.floors[1];
      g.items.push(
        item('x1', 'magic_circle', 2, 6, { gm: true, only: 'after' }),
        item('x2', 'safe', 9, 13, { gm: true, only: 'before' }),
        item('x3', 'candle', 10, 2, { gm: true, only: 'after' }),
      );
      g.texts.push({ id: 'x4', x: 6, y: 6, text: '祕密', gm: true, only: 'before' });
      for (const m of ['before', 'after'] as const) {
        expect(hashImage(q, { ...EXP, moment: m }), m).toBe(hashImage(p, { ...EXP, moment: m }));
        expect(hashImage(q, { ...EXP, moment: m, range: 'all' }), `all ${m}`).toBe(
          hashImage(p, { ...EXP, moment: m, range: 'all' }),
        );
        /* GM 用就看得到 */
        expect(hashImage(q, { ...EXP, view: 'gm', moment: m })).not.toBe(
          hashImage(p, { ...EXP, view: 'gm', moment: m }),
        );
      }
      /* PL 檢視整理後的樓層 */
      for (const m of ['before', 'after'] as const) {
        const v = visibleFloor(momentFloor(q.floors[1], m), true);
        for (const id of ['x1', 'x2', 'x3', 'x4', 'a-gm', 'b-gm', 'a-gm-text'])
          expect(ids(v as Floor), `${m} ${id}`).not.toContain(id);
      }
    } finally {
      restore();
    }
  });

  it('立體樓層圖、樓層總覽的匯出：每個狀態＝只剩那個狀態的地圖', () => {
    const restore = installRecordingDocument();
    try {
      const p = clockWithMoments();
      for (const range of ['stack', 'board'] as const)
        for (const view of ['pl', 'gm'] as const)
          for (const m of ['before', 'after'] as const)
            expect(hashStack(p, { ...EXP, range, view, moment: m }), `${range}|${view}|${m}`).toBe(
              hashStack(singleMomentProject(p, m).project, { ...EXP, range, view }),
            );
    } finally {
      restore();
    }
  });

  it('PL 用的分享連結只帶一個狀態：另一個狀態的東西、GM 專用的都不在連結裡；完整連結帶全部', () => {
    const p = clockWithMoments({ blackout: true });
    const text = (hash: string) => {
      const r = readMapHash(hash);
      if (r.kind !== 'ok') throw new Error('broken');
      return JSON.stringify(r.raw);
    };
    for (const m of ['before', 'after'] as const) {
      const share = encodeMapHash(p, 'pl', m);
      const s = text(share.hash);
      expect(share.removed.moment, m).toBe(m === 'before' ? 5 : 3);
      expect(s).not.toContain('"only"');
      expect(s).not.toContain('GM 的事件後筆記');
      expect(s).not.toContain('blackout');
      if (m === 'before') {
        expect(s).not.toContain('事件後的字');
        expect(s).not.toContain('"upset"');
        expect(s).not.toContain('"smashed"');
        expect(s).not.toContain('"night"');
        expect(s).not.toContain('"moment"');
      } else {
        expect(s).toContain('事件後的字');
        expect(s).toContain('"upset":true');
        expect(s).toContain('"moment":"after"');
      }
      /* 打開 PL 用連結：整理後就是那個狀態（沒有 `only`），倒下・破損照畫 */
      const r = readMapHash(share.hash);
      const opened = r.kind === 'ok' ? normalizeProject(r.raw, isAsset) : null;
      expect(opened && momentOf(opened)).toBe(m);
      expect(opened?.floors.every((f) => !f.items.some((i) => i.only))).toBe(true);
    }
    /* 預設是地圖目前顯示的狀態 */
    expect(playerProject({ ...p, moment: 'after' }).removed.moment).toBe(3);
    expect(playerProject(p).removed.moment).toBe(5);
    /* 完整連結：全部的狀態、目前的狀態與停電 */
    const full = text(encodeMapHash({ ...p, moment: 'after' }, 'full').hash);
    for (const s of ['"only":"after"', '"only":"before"', '"blackout":true', '"moment":"after"'])
      expect(full, s).toContain(s);
  });

  it('送給地圖演出產生器：房間的範圍兩個狀態相同（房間不分狀態），圖照狀態畫', () => {
    const restore = installRecordingDocument();
    try {
      const p = clockWithMoments();
      const rooms = (m: 'before' | 'after') => {
        const e = { ...EXP, moment: m };
        const [job] = exportJobs(p, e);
        const opts = exportOptions(p, e, 'clean', 24);
        return handoffRoomsOf(job.floors, exportLayout(job.floors, opts), opts);
      };
      expect(rooms('before')).toEqual(rooms('after'));
    } finally {
      restore();
    }
  });

  it('演出：照地圖目前的狀態畫（另一個狀態的東西不在演出的畫面裡）', () => {
    const restore = installRecordingDocument();
    try {
      const p = clockWithMoments();
      const draw = (q: Project) => {
        const tl = buildTimeline(q);
        const sc = stageScene(q, tl, 'plan', { playerView: true, hideClues: false });
        resetRecordingIds();
        const c = recordingCanvas(800, 600);
        drawStageFrame(
          c.getContext('2d'),
          sc,
          {
            theme: getTheme(q.theme),
            zoom: 24,
            showSize: 'none',
            hideNames: false,
            hideClues: false,
            activeLevel: -1,
            planFloor: q.floors[1].id,
            ...(q.night ? { night: q.night } : {}),
          },
          { from: null, to: stepState(tl, 0), alpha: 1 },
        );
        return (c as RecordingCanvas).hash;
      };
      /* 編輯器的演出照目前的狀態整理（stageCanvas、StageExport 傳 momentProject） */
      for (const m of ['before', 'after'] as const) {
        const single = singleMomentProject(p, m).project;
        expect(draw(momentProject(p, m)), m).toBe(draw(momentProject(single, momentOf(single))));
        expect(momentOf(single)).toBe(m);
      }
    } finally {
      restore();
    }
  });

  it('夜的光源：事件後才有的燭台只在事件後亮；PL 檢視不亮 GM 專用的', () => {
    const p = clockWithMoments();
    const g = structuredClone(p.floors[1]);
    g.items.push(item('lamp-a', 'candle', 2.5, 2.5, { only: 'after' }));
    g.items.push(item('lamp-gm', 'candle', 10, 2.5, { only: 'after', gm: true }));
    const lit = (m: 'before' | 'after', pl: boolean) =>
      lightsOf(visibleFloor(momentFloor(g, m), pl)).length;
    expect(lit('after', false) - lit('before', false)).toBe(2);
    expect(lit('after', true) - lit('before', true)).toBe(1);
  });

  it('事件後才停電：匯出（平面、立體）與演出的夜的暗度照狀態；其他設定不變', () => {
    const p = clockWithMoments({ blackout: true });
    expect(exportOptions(p, { ...EXP, moment: 'before' }, 'clean', 24).night).toBeUndefined();
    expect(exportOptions(p, { ...EXP, moment: 'after' }, 'clean', 24).night).toBe(0.55);
    const q = { ...p, night: 0.3 };
    expect(exportOptions(q, { ...EXP, moment: 'after' }, 'clean', 24).night).toBe(0.3);
    expect(stackExportOptions(q, { ...EXP, moment: 'before' }, 'clean', 24).night).toBeUndefined();
    expect(stackExportOptions(q, { ...EXP, moment: 'after' }, 'clean', 24).night).toBe(0.3);
    expect(momentProject(p, 'before').night).toBeUndefined();
    expect(momentProject(p, 'after').night).toBe(0.55);
    /* 沒設停電時兩個狀態的夜一樣 */
    const r = clockWithMoments({ night: 0.4 });
    for (const m of ['before', 'after'] as const)
      expect(exportOptions(r, { ...EXP, moment: m }, 'clean', 24).night).toBe(0.4);
  });

  it('檔名：用到事件前後時加「事件前」「事件後」；沒用到時不變', () => {
    const p = clockWithMoments();
    expect(exportFileName(p, { ...EXP, moment: 'before' }, null)).toBe('clockshop_PL_事件前.png');
    expect(exportFileName({ ...p, moment: 'after' }, EXP, null)).toBe('clockshop_PL_事件後.png');
    expect(exportFileName(p, { ...EXP, view: 'gm', moment: 'after' }, null, { x: 9, y: 7 })).toBe(
      'clockshop_GM_事件後_9x7.png',
    );
    const plain = project('studio');
    expect(exportFileName(plain, { ...EXP, moment: 'after' }, null)).toBe('studio_PL.png');
    expect(exportOptions(plain, { ...EXP, moment: 'after' }, 'clean', 24)).toEqual(
      exportOptions(plain, EXP, 'clean', 24),
    );
  });
});

/* ---------- 榻榻米的鋪法（F334） ---------- */

describe('榻榻米的鋪法（F334、3.20.4）', () => {
  const area = (ms: ReturnType<typeof tatamiMats>) => ms.reduce((s, m) => s + m.w * m.h, 0);

  it('祝儀鋪法：四疊半（小而方或細長）、六疊（長寬比 ≥ 1.25，長的一邊放在長邊）、八疊；四張的角不集中', () => {
    expect(shugiPlan(6, 6).name).toBe('yojohan');
    expect(shugiPlan(4, 7).name).toBe('yojohan');
    expect(shugiPlan(6, 8)).toMatchObject({ name: 'rokujo', cols: 3, rows: 4 });
    expect(shugiPlan(8, 6)).toMatchObject({ name: 'rokujo', cols: 4, rows: 3 });
    expect(shugiPlan(8, 8).name).toBe('hachijo');
    expect(shugiPlan(14, 12).name).toBe('hachijo');
    expect(shugiPlan(7, 6).name).toBe('yojohan');
    for (const [w, h] of [
      [6, 6],
      [6, 8],
      [8, 6],
      [8, 8],
      [7, 6],
      [11, 9],
    ] as const) {
      const ms = tatamiMats({ x: 3, y: 2, w, h }, 'shugi');
      expect(tatamiCrosses(ms), `${w}x${h}`).toEqual([]);
      expect(area(ms)).toBeCloseTo(w * h, 6);
      expect(ms.filter((m) => m.half).length).toBe(shugiPlan(w, h).name === 'yojohan' ? 1 : 0);
    }
  });

  it('不祝儀鋪法：全部同一個方向、角排成十字；長邊每 1.8 m、短邊每 0.9 m 取整', () => {
    const ms = tatamiMats({ x: 0, y: 0, w: 8, h: 6 }, 'fushugi');
    /* 4 m ÷ 1.8 m ≈ 2.2 → 2 張，3 m ÷ 0.9 m ≈ 3.3 → 3 列 */
    expect(ms).toHaveLength(6);
    expect(new Set(ms.map((m) => m.across))).toEqual(new Set([true]));
    expect(tatamiCrosses(ms).length).toBeGreaterThan(0);
    expect(area(ms)).toBeCloseTo(48, 6);
    /* 直的房間：長邊在 y */
    const v = tatamiMats({ x: 0, y: 0, w: 6, h: 8 }, 'fushugi');
    expect(v.every((m) => !m.across)).toBe(true);
    /* 很小的房間至少 1 張 */
    expect(tatamiMats({ x: 0, y: 0, w: 1, h: 1 }, 'fushugi')).toHaveLength(1);
  });

  it('半疊市松：每 0.9 m 一個半張、沒有邊、紋路交錯', () => {
    const ms = tatamiMats({ x: 0, y: 0, w: 6, h: 6 }, 'ryukyu');
    expect(ms).toHaveLength(9);
    expect(ms.every((m) => m.half && !m.edge)).toBe(true);
    expect(ms.filter((m) => m.across)).toHaveLength(5);
    expect(area(ms)).toBeCloseTo(36, 6);
  });

  it('畫法：和室設了鋪法才換畫法（沒設照原本的），地板選了榻榻米的房間也可以鋪；七種樣式都畫得出來', () => {
    const restore = installRecordingDocument();
    try {
      const base = project('studio');
      const f = base.floors[0];
      f.rooms.push({ id: 'tw', x: 30, y: 0, w: 8, h: 8, name: '和室', cat: 'washitsu' });
      const h0 = hashImage(base, EXP);
      for (const layout of ['shugi', 'fushugi', 'ryukyu'] as const) {
        const q = structuredClone(base);
        q.floors[0].rooms[q.floors[0].rooms.length - 1].tatami = layout;
        expect(hashImage(q, EXP), layout).not.toBe(h0);
        for (const theme of THEME_IDS) expect(() => hashImage(q, EXP, theme)).not.toThrow();
      }
      const t = structuredClone(base);
      t.floors[0].rooms[t.floors[0].rooms.length - 1].cat = 'living';
      t.floors[0].rooms[t.floors[0].rooms.length - 1].floor = 'tatami';
      expect(hashImage(t, EXP)).not.toBe(hashImage(project('studio'), EXP));
    } finally {
      restore();
    }
  });
});

/* ---------- 新的素材、區畫（F334） ---------- */

describe('新的素材與區畫（F334、3.20.5）', () => {
  const NEW = [
    'kotatsu',
    'chabudai',
    'tansu',
    'chadansu',
    'oshiire',
    'kamidana',
    'hibachi',
    'morishio',
    'gourd_pond',
    'inari',
    'boards',
    'ofuda',
    'blood_drag',
    'scattered_papers',
    'broken_dishes',
  ];

  it('15 種：都有畫法、名稱、尺寸（格）、分類；七種樣式都畫得出來', () => {
    const restore = installRecordingDocument();
    try {
      for (const id of NEW) {
        const a = ASSET[id];
        expect(a, id).toBeDefined();
        expect(FURNITURE_DRAW[id], id).toBeTypeOf('function');
        expect(Math.min(a.w, a.h), id).toBeGreaterThanOrEqual(0.5);
        expect(Math.max(a.w, a.h), id).toBeLessThanOrEqual(8);
        for (const theme of THEME_IDS) {
          const c = recordingCanvas(200, 200);
          const g = c.getContext('2d');
          const th = getTheme(theme);
          expect(() =>
            FURNITURE_DRAW[id](
              g,
              { ...th.furn, lw: 0.05, wall: th.wall, gap: '#fff', font: th.font },
              a.w,
              a.h,
              {},
            ),
          ).not.toThrow();
        }
      }
      expect(['boards', 'ofuda'].every((id) => ASSET[id].wall && ASSET[id].group === 'wall')).toBe(
        true,
      );
      for (const id of ['blood_drag', 'scattered_papers', 'broken_dishes', 'gourd_pond'])
        expect(ASSET[id].under, id).toBe(true);
      expect(ASSET.kotatsu.w * 0.5).toBeCloseTo(1.3);
      expect(SURFACES.has('kotatsu') && SURFACES.has('chabudai')).toBe(true);
      expect(LIGHT_ITEMS.hibachi?.tone).toBe('fire');
      /* 搜尋：中文名稱、日文的別名、#標籤 */
      expect(assetMatches(ASSET.kotatsu, 'こたつ')).toBe(true);
      expect(assetMatches(ASSET.boards, '事件')).toBe(true);
      expect(assetMatches(ASSET.ofuda, '#恐怖')).toBe(true);
    } finally {
      restore();
    }
  });

  it('日式宅邸的區畫 7 種：座敷、佛間是祝儀鋪法、離屋是半疊市松', () => {
    for (const id of [
      'genkan',
      'nakaroka',
      'zashiki',
      'butsuma',
      'hiroen',
      'hanare',
      'kura',
    ] as const)
      expect(ROOM_PRESETS[id], id).toBeDefined();
    expect(ROOM_PRESETS.zashiki.tatami).toBe('shugi');
    expect(ROOM_PRESETS.butsuma.tatami).toBe('shugi');
    expect(ROOM_PRESETS.hanare.tatami).toBe('ryukyu');
    expect(ROOM_PRESETS.genkan.cat).toBe('doma');
    expect(ROOM_PRESETS.kura.cat).toBe('stone');
  });
});

/* ---------- 範本：日式老宅（F336） ---------- */

describe('範本：日式老宅（事件前後）（F336、D139）', () => {
  const tpl = getTemplate('japanese-estate');

  it('住宅類（也在宗教・古蹟、廢墟・事件）；事件後才停電；事件前後的東西、三種鋪法、新素材', () => {
    expect(tpl?.group).toBe('home');
    expect(tpl?.blackout).toBe(true);
    const [f] = instantiateTemplate('japanese-estate') ?? [];
    expect(f.rooms.filter((r) => r.tatami).map((r) => r.tatami)).toEqual(
      expect.arrayContaining(['shugi', 'fushugi', 'ryukyu']),
    );
    expect(f.items.filter((i) => i.only === 'after').length).toBeGreaterThanOrEqual(10);
    expect(f.items.filter((i) => i.only === 'before')).toHaveLength(1);
    expect(f.items.filter((i) => i.upset).length).toBeGreaterThanOrEqual(5);
    expect(f.openings.filter((o) => o.smashed)).toHaveLength(2);
    expect(f.texts.some((t) => t.only === 'after' && t.gm)).toBe(true);
    for (const t of ['kotatsu', 'chabudai', 'tansu', 'chadansu', 'oshiire', 'kamidana', 'hibachi'])
      expect(
        f.items.some((i) => i.t === t),
        t,
      ).toBe(true);
    for (const t of ['morishio', 'gourd_pond', 'inari', 'boards', 'ofuda', 'blood_drag'])
      expect(
        f.items.some((i) => i.t === t),
        t,
      ).toBe(true);
  });

  it('兩個狀態各自通過格局檢查（放入隱藏線索也是）', () => {
    for (const clues of [false, true]) {
      const fs = instantiateTemplate('japanese-estate', { clues }) ?? [];
      expect(layoutProblems(fs), `raw ${clues}`).toEqual([]);
      for (const m of ['before', 'after'] as const)
        expect(layoutProblems(fs.map((f) => momentFloor(f, m))), `${m} ${clues}`).toEqual([]);
    }
  });

  it('分享連結放得下（完整、PL 用、放入隱藏線索）；整張地圖轉四次回到原樣（事件前後的欄位留著）', () => {
    const p = project('japanese-estate', { blackout: true });
    expect(encodeMapHash(p, 'full').tooLong).toBe(false);
    expect(encodeMapHash(p, 'pl', 'after').tooLong).toBe(false);
    const c = { ...p, floors: instantiateTemplate('japanese-estate', { clues: true }) ?? [] };
    expect(encodeMapHash(c, 'full').tooLong).toBe(false);
    const q = structuredClone(p);
    for (let i = 0; i < 4; i++) transformProject(q, 'rotate');
    expect(q).toEqual(p);
  });
});

/* ---------- 操作（F337～F339） ---------- */

describe('操作（F337）', () => {
  it('快捷鍵一覽多 Z／X', () => {
    const z = SHORTCUT_HELP.find((s) => Array.isArray(s.keys) && s.keys.includes('z'));
    expect(z?.keys).toEqual(['z', 'x']);
  });
});
