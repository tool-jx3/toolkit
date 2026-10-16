/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 第五批「版本與動畫」的資料層：時間軸分頁（轉換、新增、複製、刪除、保持↔關鍵、自動打關鍵、換順序、切影格不記一步、
 * 改畫布尺寸一起平移、讀原作的檔）、分頁庫（刪除分頁時封存、不進復原、讀原作的檔）、資產回收、資料版本 4 → 5。
 * 範例是研究員用原作做、存、讀回確認的（研究筆記附錄 B）：
 * - `fixtures/relation-chart-b5-timeline.json`（b45-timeline-notes 的 project.json）：「第一章（時間軸）」4 格——第 2 格
 *   保持角色／圖表／背景、改字幕；第 3 格移動宿敵、刪掉神秘人、加新角色、字幕「第三幕：決戰」、2.5 秒；第 4 格全保持；
 *   背景層鎖住；速度 1.5 倍。
 * - `fixtures/relation-chart-b5-sheetlib.json`（b45-notes-lore 的 project.json，分頁庫的背景圖換成 1 × 1 的 PNG）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redo, undo } from '@/tools/relation-chart/editor/undo';
import { convertLegacy } from '@/tools/relation-chart/logic/legacy';
import {
  emptySheet,
  initialProject,
  normalizeProject,
  projectAssetIds,
} from '@/tools/relation-chart/model/normalize';
import {
  allChars,
  frameDur,
  frameView,
  laneKeyIdx,
  posAt,
  secondsAt,
  tlDuration,
} from '@/tools/relation-chart/model/timeline';
import type { Project, Sheet, Timeline } from '@/tools/relation-chart/model/types';
import {
  addChar,
  addSheet,
  deleteChars,
  deleteSheet,
  fitCanvas,
  resizeCanvasTo,
  updateChar,
} from '@/tools/relation-chart/state/actions';
import { addNote, updateNote } from '@/tools/relation-chart/state/noteActions';
import { applyLegacy, remapLegacyRefs } from '@/tools/relation-chart/state/project';
import {
  activeSheet,
  DATA_VERSION,
  setUi,
  updateProject,
  useProject,
} from '@/tools/relation-chart/state/store';
import {
  addFrameAfter,
  convertFromTimeline,
  convertToTimeline,
  copyFrameAt,
  cycleTlSpeed,
  deleteFrameAt,
  moveFrameTo,
  setFrameDur,
  setTlLane,
  switchFrame,
  toggleFrameKey,
} from '@/tools/relation-chart/state/tlActions';

const FS = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string, enc: 'utf8') => string;
};
const DIR = `${(globalThis as { process?: { cwd: () => string } }).process?.cwd()}/tests/unit/fixtures/`;
const fixture = (name: string) =>
  JSON.parse(readFileSync(`${DIR}${name}`, 'utf8')) as Record<string, unknown>;

function loadLegacy(data: Record<string, unknown>): Project {
  const conv = convertLegacy(data);
  const refs = remapLegacyRefs(conv, new Map(), new Map(), new Map());
  useProject.getState().replace(initialProject());
  applyLegacy(conv, 'replace', refs.font, [], []);
  useProject.temporal.getState().clear();
  return useProject.getState().data;
}

const p = (): Project => useProject.getState().data;
const tl = (): Timeline => activeSheet().tl as Timeline;
const steps = () => useProject.temporal.getState().pastStates.length;
/** 第 k 格看到的角色座標（id → [x, y]） */
const posOf = (s: Sheet, k: number) =>
  Object.fromEntries(frameView(s, k).chars.map((c) => [c.id, [c.x, c.y]]));
const notesOf = (s: Sheet, k: number) => frameView(s, k).notes.map((n) => n.text);

/** 一張分頁、三位角色（a、b、c） */
function start(): number[] {
  const s = emptySheet(1, 1, { W: 1000, H: 800 });
  useProject.getState().replace({ ...initialProject(), sheets: [s], nextId: 10 });
  const ids = [addChar(() => 0.5), addChar(() => 0.2), addChar(() => 0.8)];
  useProject.temporal.getState().clear();
  return ids;
}

beforeEach(() => {
  let t = 1e12;
  vi.spyOn(Date, 'now').mockImplementation(() => (t += 10));
  setUi({ sel: [], panel: null, focus: null, readonly: false, tlPos: null });
});

describe('時間軸分頁：轉換', () => {
  it('一般 → 時間軸：現有內容成為第 1 格（頂層＝目前影格，frames[0] 只是佔位）；一步復原', () => {
    const [a] = start();
    const before = JSON.stringify(activeSheet().chars);
    convertToTimeline();
    const s = activeSheet();
    expect(s.tl?.frames).toHaveLength(1);
    expect(s.tl?.frames[0]).toMatchObject({
      no: 1,
      hold: [],
      dur: null,
      chars: [],
      W: 1000,
      H: 800,
    });
    expect(JSON.stringify(s.chars)).toBe(before);
    expect(s.chars.some((c) => c.id === a)).toBe(true);
    expect(steps()).toBe(1);
    undo();
    expect(activeSheet().tl).toBeNull();
  });

  it('時間軸 → 一般：只留目前這一格；只在別格出現的角色連看法一起清', () => {
    const [a, b] = start();
    convertToTimeline();
    addFrameAfter();
    const d = addChar(() => 0.1);
    updateProject((pp) => {
      pp.sheets[0].views = { [a]: { [d]: '在第 2 格才出現' }, [d]: { [a]: '你好' } };
    });
    switchFrame(0);
    expect(activeSheet().chars.some((c) => c.id === d)).toBe(false);
    convertFromTimeline();
    const s = activeSheet();
    expect(s.tl).toBeNull();
    expect(s.chars.map((c) => c.id).sort()).toEqual([a, b, s.chars[2].id].sort((x, y) => x - y));
    expect(s.views[d]).toBeUndefined();
    expect(s.views[a]?.[d]).toBeUndefined();
  });
});

describe('時間軸分頁：影格', () => {
  it('新增影格（延續上一格）：插在目前影格後面、四條軌道全部保持、切過去、畫面和前一格一樣；編號 2', () => {
    start();
    convertToTimeline();
    const v0 = JSON.stringify(activeSheet().chars);
    addFrameAfter();
    expect(tl().frames.map((f) => f.no)).toEqual([1, 2]);
    expect(tl().active).toBe(1);
    expect(tl().frames[1].hold).toEqual(['chars', 'notes', 'charts', 'bg']);
    expect(JSON.stringify(activeSheet().chars)).toBe(v0);
    /* 保持中的軌道不存資料 */
    expect(tl().frames[0].chars).toHaveLength(3);
    expect(tl().frames[1].chars).toHaveLength(0);
  });

  it('切影格不記一步、不清空復原紀錄；畫面存回原本那一格', () => {
    const [a] = start();
    convertToTimeline();
    addFrameAfter();
    updateChar(a, (c) => {
      c.x = 123;
    });
    const n = steps();
    switchFrame(0);
    expect(steps()).toBe(n);
    expect(tl().active).toBe(0);
    expect(activeSheet().chars.find((c) => c.id === a)?.x).not.toBe(123);
    switchFrame(1);
    expect(activeSheet().chars.find((c) => c.id === a)?.x).toBe(123);
    expect(steps()).toBe(n);
    /* 復原到別的影格的變更時切到那一格（7.4 第 3 項） */
    switchFrame(0);
    undo();
    expect(tl().active).toBe(1);
    expect(activeSheet().chars.find((c) => c.id === a)?.x).not.toBe(123);
  });

  it('自動打關鍵影格：在保持格拖角色＝角色軌道變成關鍵影格（其他軌道照舊保持）；之前的格不受影響', () => {
    const [a] = start();
    convertToTimeline();
    const x0 = activeSheet().chars.find((c) => c.id === a)?.x;
    addFrameAfter();
    updateChar(a, (c) => {
      c.x = 777;
    });
    expect(tl().frames[1].hold).toEqual(['notes', 'charts', 'bg']);
    const s = activeSheet();
    expect(posOf(s, 0)[a][0]).toBe(x0);
    expect(posOf(s, 1)[a][0]).toBe(777);
    /* 便利貼：新增一張＝便利貼軌道變成關鍵影格 */
    addNote(4, () => 0.5);
    expect(tl().frames[1].hold).toEqual(['charts', 'bg']);
  });

  it('鎖住的軌道不會自動打關鍵影格（原作）', () => {
    const [a] = start();
    convertToTimeline();
    addFrameAfter();
    setTlLane('locked', 'chars', true);
    updateChar(a, (c) => {
      c.x = 5;
    });
    expect(tl().frames[1].hold).toContain('chars');
  });

  it('改了來源關鍵影格，後面保持的格跟著變（不存複本）', () => {
    const [a] = start();
    convertToTimeline();
    addFrameAfter();
    addFrameAfter();
    switchFrame(0);
    updateChar(a, (c) => {
      c.y = 42;
    });
    const s = activeSheet();
    expect(posOf(s, 1)[a][1]).toBe(42);
    expect(posOf(s, 2)[a][1]).toBe(42);
  });

  it('複製影格：插在後面、全部關鍵影格、同一批 id（補間靠 id 對應）、秒數不帶；切過去', () => {
    const [a] = start();
    convertToTimeline();
    setFrameDur(0, 2.5);
    copyFrameAt(0);
    expect(tl().frames).toHaveLength(2);
    expect(tl().active).toBe(1);
    expect(tl().frames[1]).toMatchObject({ no: 2, hold: [], dur: null });
    expect(activeSheet().chars.some((c) => c.id === a)).toBe(true);
    switchFrame(0);
    expect(tl().frames[1].chars).toHaveLength(3);
  });

  it('刪除關鍵影格：下一格在保持的軌道先定格（後面的畫面不變）；只剩 1 格不能刪', () => {
    const [a] = start();
    convertToTimeline();
    addFrameAfter();
    updateChar(a, (c) => {
      c.x = 600;
    });
    addFrameAfter(); /* 第 3 格：全保持，跟第 2 格 */
    addFrameAfter(); /* 第 4 格 */
    switchFrame(0);
    const s0 = activeSheet();
    const want3 = posOf(s0, 2);
    expect(want3[a][0]).toBe(600);
    deleteFrameAt(1);
    const s = activeSheet();
    expect(s.tl?.frames.map((f) => f.no)).toEqual([1, 3, 4]);
    expect(posOf(s, 1)).toEqual(want3);
    expect(s.tl?.frames[1].hold).toEqual(['notes', 'charts', 'bg']);
    expect(posOf(s, 2)[a][0]).toBe(600);
    expect(deleteFrameAt(0)).toBe(true);
    expect(deleteFrameAt(0)).toBe(true);
    expect(deleteFrameAt(0)).toBe(false);
    expect(tl().frames).toHaveLength(1);
    expect(tl().frames[0].hold).toEqual([]);
  });

  it('保持 ↔ 關鍵影格：定格目前看到的內容；改回保持＝丟掉自己的內容、畫面變回前一個關鍵影格；第 1 格不能改', () => {
    const [a] = start();
    convertToTimeline();
    const x0 = activeSheet().chars.find((c) => c.id === a)?.x;
    addFrameAfter();
    toggleFrameKey(1, 'chars');
    expect(tl().frames[1].hold).toEqual(['notes', 'charts', 'bg']);
    updateChar(a, (c) => {
      c.x = 321;
    });
    toggleFrameKey(1, 'chars');
    expect(tl().frames[1].hold).toEqual(['chars', 'notes', 'charts', 'bg']);
    expect(activeSheet().chars.find((c) => c.id === a)?.x).toBe(x0);
    toggleFrameKey(0, 'chars');
    expect(tl().frames[0].hold).toEqual([]);
    /* 每一步都能復原 */
    undo();
    expect(activeSheet().chars.find((c) => c.id === a)?.x).toBe(321);
  });

  it('換順序：換到第 1 格的影格先定格；目前影格跟著自己；一步復原', () => {
    const [a] = start();
    convertToTimeline();
    addFrameAfter();
    updateChar(a, (c) => {
      c.x = 400;
    });
    addFrameAfter(); /* 第 3 格保持、看到 400 */
    const n = steps();
    moveFrameTo(2, 0);
    const s = activeSheet();
    expect(s.tl?.frames.map((f) => f.no)).toEqual([3, 1, 2]);
    expect(s.tl?.frames[0].hold).toEqual([]);
    expect(s.tl?.active).toBe(0);
    expect(posOf(s, 0)[a][0]).toBe(400);
    expect(steps()).toBe(n + 1);
    undo();
    expect(tl().frames.map((f) => f.no)).toEqual([1, 2, 3]);
  });

  it('速度鈕、每格秒數、眼睛與鎖都能復原（7.4 第 3 項）', () => {
    start();
    convertToTimeline();
    addFrameAfter();
    cycleTlSpeed();
    expect(tl().speed).toBe(1.5);
    for (let i = 0; i < 5; i++) cycleTlSpeed();
    expect(tl().speed).toBe(1);
    setFrameDur(0, 2.5);
    setFrameDur(1, 1000);
    expect(tl().frames.map((f) => f.dur)).toEqual([2.5, 600]);
    setTlLane('hidden', 'notes', true);
    expect(tl().hidden).toEqual(['notes']);
    undo();
    expect(tl().hidden).toEqual([]);
    undo();
    undo();
    expect(tl().frames.map((f) => f.dur)).toEqual([null, null]);
    redo();
    expect(tl().frames[0].dur).toBe(2.5);
  });

  it('唯讀瀏覽：只能切影格，其他影格列的動作都不動（7.4 第 10 項）', () => {
    start();
    convertToTimeline();
    addFrameAfter();
    setUi({ readonly: true });
    addFrameAfter();
    cycleTlSpeed();
    deleteFrameAt(0);
    expect(tl().frames).toHaveLength(2);
    expect(tl().speed).toBe(1);
    switchFrame(0);
    expect(tl().active).toBe(0);
    setUi({ readonly: false });
  });

  it('秒數與播放速度：預設 1 ÷ 0.85 秒、最後再除以速度；位置 ↔ 秒', () => {
    start();
    convertToTimeline();
    addFrameAfter();
    addFrameAfter();
    setFrameDur(1, 2.5);
    cycleTlSpeed(); /* 1.5 倍 */
    const t = tl();
    expect(frameDur(t, 0)).toBeCloseTo(1 / 0.85 / 1.5, 6);
    expect(frameDur(t, 1)).toBeCloseTo(2.5 / 1.5, 6);
    expect(tlDuration(t)).toBeCloseTo((1 / 0.85 + 2.5) / 1.5, 6);
    expect(posAt(t, secondsAt(t, 1.4))).toBeCloseTo(1.4, 6);
    expect(posAt(t, 99)).toBe(2);
  });
});

describe('時間軸分頁和其他功能', () => {
  it('修改畫布尺寸：所有影格一起平移、尺寸相同的影格一起改（7.4 第 12 項）', () => {
    const [a] = start();
    convertToTimeline();
    addFrameAfter();
    updateChar(a, (c) => {
      c.x = 500;
    });
    addNote(4, () => 0.5);
    switchFrame(0);
    resizeCanvasTo({ x: 100, y: 50, w: 900, h: 700 });
    const s = activeSheet();
    expect(posOf(s, 1)[a]).toEqual([400, frameView(s, 1).chars.find((c) => c.id === a)?.y]);
    expect(s.tl?.frames[1]).toMatchObject({ W: 900, H: 700 });
    const n0 = frameView(s, 1).notes[0];
    switchFrame(1);
    expect(activeSheet().notes[0].x).toBe(n0.x);
    /* 畫布貼合內容：同一個位移 */
    switchFrame(0);
    const before = posOf(activeSheet(), 1)[a][0] - posOf(activeSheet(), 0)[a][0];
    fitCanvas();
    const after = posOf(activeSheet(), 1)[a][0] - posOf(activeSheet(), 0)[a][0];
    expect(after).toBe(before);
  });

  it('刪掉角色：只刪目前影格的；別格還在＝看法留著；角色庫刪條目＝每一格都刪', () => {
    const [a, b] = start();
    updateProject((pp) => {
      pp.sheets[0].views = { [a]: { [b]: '朋友' } };
    });
    convertToTimeline();
    copyFrameAt(0);
    deleteChars([b]);
    const s = activeSheet();
    expect(frameView(s, 0).chars.some((c) => c.id === b)).toBe(true);
    expect(s.views[a]?.[b]).toBe('朋友');
    expect(allChars(s).filter((c) => c.id === a)).toHaveLength(2);
  });

  it('複製時間軸分頁：每一格一起複製（原作只複製目前影格）；同一位角色在各格是同一個新 id', () => {
    const [a] = start();
    convertToTimeline();
    copyFrameAt(0);
    updateChar(a, (c) => {
      c.x = 10;
    });
    addSheet('same');
    const s = activeSheet();
    expect(s.tl?.frames).toHaveLength(2);
    const ids0 = frameView(s, 0).chars.map((c) => c.id);
    const ids1 = frameView(s, 1).chars.map((c) => c.id);
    expect(ids0).toEqual(ids1);
    expect(ids0).not.toContain(a);
    expect(frameView(s, 1).chars[0].x).toBe(10);
    addSheet('fork');
    const f = activeSheet();
    const ent = new Set(allChars(f).map((c) => c.lib));
    expect(ent.size).toBe(3);
  });

  it('資產回收：每一格的背景圖與頭像、分頁庫裡的分頁都算進保留集合', () => {
    start();
    convertToTimeline();
    updateProject((pp) => {
      pp.sheets[0].bg = 'bg-a';
    });
    addFrameAfter();
    updateProject((pp) => {
      pp.sheets[0].bg = 'bg-b';
      pp.sheets[0].chars[0].avatar = { img: 'av-2', src: null, place: null };
    });
    switchFrame(0);
    addSheet(false);
    deleteSheet(0);
    const ids = projectAssetIds(p());
    expect(ids).toEqual(expect.arrayContaining(['bg-a', 'bg-b', 'av-2']));
  });
});

describe('分頁庫', () => {
  it('刪除分頁＝封存進分頁庫（新的在前、名稱＝顯示名）；可以復原；分頁庫不跟著復原', () => {
    start();
    addSheet(true);
    updateProject((pp) => {
      pp.sheets[1].name = '草稿';
    });
    deleteSheet(1);
    expect(p().sheets).toHaveLength(1);
    expect(p().sheetLib.map((x) => x.name)).toEqual(['草稿']);
    expect(p().sheetLib[0].sheet.chars).toHaveLength(3);
    undo();
    expect(p().sheets).toHaveLength(2);
    expect(p().sheetLib).toHaveLength(1);
    redo();
    expect(p().sheets).toHaveLength(1);
    expect(p().sheetLib).toHaveLength(1);
    deleteSheet(0);
    expect(p().sheetLib).toHaveLength(1);
    addSheet(false);
    deleteSheet(0);
    expect(p().sheetLib[0].name).toBe('分頁1');
  });

  it('時間軸分頁的顯示名「時間軸分頁 N」', () => {
    start();
    convertToTimeline();
    addSheet(false);
    deleteSheet(0);
    expect(p().sheetLib[0].name).toBe('時間軸分頁 1');
  });
});

describe('讀原作的專案檔（第五批）', () => {
  it('時間軸：4 格的保持、秒數、圖層、速度、每一格的字幕與角色（和原作讀回的紀錄相同）', () => {
    const pp = loadLegacy(fixture('relation-chart-b5-timeline.json'));
    const s = pp.sheets[1];
    expect(s.name).toBe('第一章（時間軸）');
    const t = s.tl as Timeline;
    expect(t.frames.map((f) => f.no)).toEqual([1, 2, 3, 4]);
    expect(t.frames.map((f) => f.hold)).toEqual([
      [],
      ['chars', 'charts', 'bg'],
      [],
      ['chars', 'notes', 'charts', 'bg'],
    ]);
    expect(t.frames.map((f) => f.dur)).toEqual([null, null, 2.5, null]);
    expect(t).toMatchObject({ active: 0, hidden: [], locked: ['bg'], speed: 1.5 });
    expect([0, 1, 2, 3].map((k) => notesOf(s, k))).toEqual([
      ['第一幕：相遇', '故事人物'],
      ['第二幕：誤會', '故事人物'],
      ['第三幕：決戰', '故事人物'],
      ['第三幕：決戰', '故事人物'],
    ]);
    const names = (k: number) => frameView(s, k).chars.map((c) => c.name);
    expect(names(0)).toEqual(['主角', '戀人', '摯友', '宿敵', '導師', '神秘人']);
    expect(names(1)).toEqual(names(0));
    expect(names(2)).toEqual(['主角', '戀人', '摯友', '宿敵', '導師', '新角色']);
    expect(names(3)).toEqual(names(2));
    /* 宿敵在第 3 格往左 100；關係少了神秘人的兩條 */
    const enemy = (k: number) => frameView(s, k).chars.find((c) => c.name === '宿敵');
    expect([enemy(0)?.x, enemy(2)?.x]).toEqual([800, 700]);
    expect(frameView(s, 2).rels).toHaveLength(4);
    /* 同一位角色在每一格是同一個 id（補間靠它對應） */
    expect(enemy(0)?.id).toBe(enemy(2)?.id);
    /* 第 4 格保持＝來源是第 3 格 */
    expect(laneKeyIdx(t, 3, 'chars')).toBe(2);
    /* 「沒有讀進來」的通知不再列時間軸與分頁庫 */
    const conv = convertLegacy(fixture('relation-chart-b5-timeline.json'));
    expect(conv.skipped.join('')).not.toMatch(/時間軸|分頁庫/);
  });

  it('時間軸：存成本工具的專案檔再讀回不失真（每一格看到的畫面相同）', () => {
    const pp = loadLegacy(fixture('relation-chart-b5-timeline.json'));
    const back = normalizeProject(JSON.parse(JSON.stringify(pp))) as Project;
    const s0 = pp.sheets[1];
    const s1 = back.sheets[1];
    for (let k = 0; k < 4; k++)
      expect(JSON.stringify(frameView(s1, k))).toBe(JSON.stringify(frameView(s0, k)));
    expect(back.sheets[1].tl).toEqual(pp.sheets[1].tl);
  });

  it('分頁庫：讀進來（名稱、時間、角色、便利貼、背景圖的參照）；同一份檔「沒有讀進來」不再列分頁庫', () => {
    const data = fixture('relation-chart-b5-sheetlib.json');
    const conv = convertLegacy(data);
    expect(conv.skipped.join('')).not.toMatch(/分頁庫/);
    expect(conv.sheetLib).toHaveLength(1);
    const bg = [...conv.backgrounds.entries()].find(([o]) => o === conv.sheetLib[0].sheet);
    expect(bg?.[1].startsWith('data:image/png;base64,')).toBe(true);
    const pp = loadLegacy(data);
    expect(pp.sheetLib).toHaveLength(1);
    const it0 = pp.sheetLib[0];
    expect(it0.name).toBe('被刪掉的草稿');
    expect(it0.savedAt).toBe(1792132153294);
    expect(it0.sheet.chars).toHaveLength(7);
    expect(it0.sheet.rels).toHaveLength(6);
    expect(it0.sheet.notes.map((n) => n.text)).toEqual(['草稿上的便利貼']);
    /* 角色綁著角色庫的條目（id 換成專案的） */
    const libIds = new Set(pp.library.map((e) => e.id));
    expect(it0.sheet.chars.every((c) => libIds.has(c.lib))).toBe(true);
  });

  it('資料版本 5：第四批的存檔（沒有 tl、sheetLib）讀進來補上預設', () => {
    expect(DATA_VERSION).toBe(5);
    const old = JSON.parse(JSON.stringify(initialProject())) as Record<string, unknown>;
    delete old.sheetLib;
    for (const s of old.sheets as Record<string, unknown>[]) delete s.tl;
    const n = normalizeProject(old) as Project;
    expect(n.sheetLib).toEqual([]);
    expect(n.sheets[0].tl).toBeNull();
  });
});

describe('便利貼的軌道', () => {
  it('便利貼與圖表節點各自一條軌道：保持中的便利貼軌道改字＝變成關鍵影格', () => {
    start();
    convertToTimeline();
    const id = addNote(4, () => 0.5);
    addFrameAfter();
    updateNote(id, (n) => {
      n.text = '第二格';
    });
    expect(tl().frames[1].hold).toEqual(['chars', 'charts', 'bg']);
    const s = activeSheet();
    expect(notesOf(s, 0)).toEqual(['']);
    expect(notesOf(s, 1)).toEqual(['第二格']);
  });
});
