/**
 * 魔法脈繪製工具的資料與 store（規格 3.6、F04～F07、F10～F14、F49）：整理讀進來的資料、專案檔往返、
 * 畫的流程與復原（草稿也能一點一點退回、復原時回到改到的畫布與畫法）、畫布的管理、圖形庫、讀入原作的資料。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '@/core/storage';
import { defaultDoc, nextName, projectData, sanitizeDoc } from '@/tools/floria-veins/model/doc';
import { parseLegacy } from '@/tools/floria-veins/model/legacy';
import { sampleDoc } from '@/tools/floria-veins/model/sample';
import { DATA_VERSION, type Pt, TOOL_ID, UNIT } from '@/tools/floria-veins/model/types';
import {
  activeNow,
  addCanvas,
  addLegacyCanvas,
  cancelDraft,
  cellAt,
  clickAt,
  commit,
  DEFAULT_PREFS,
  deleteActive,
  docNow,
  draftNow,
  duplicateActive,
  loadSample,
  moveActive,
  placeStamp,
  prefsNow,
  redo,
  replaceDoc,
  resetAll,
  resizeCanvas,
  saveStamp,
  selectCanvas,
  setMode,
  shift,
  stepBackDraft,
  undo,
  useDoc,
  usePrefs,
} from '@/tools/floria-veins/store';

const U = UNIT;
const P = (x: number, y: number): Pt => [x * U, y * U];

beforeEach(() => {
  useDoc.getState().replace(defaultDoc());
  useDoc.temporal.getState().clear();
  usePrefs.getState().replace({ ...DEFAULT_PREFS, active: 'c-1' });
});

describe('整理讀進來的資料', () => {
  it('看不懂的整份是 null；看不懂的畫布、線、塗色、格子略過', () => {
    expect(sanitizeDoc(null)).toBeNull();
    expect(sanitizeDoc({ canvases: [] })).toBeNull();
    expect(sanitizeDoc({ canvases: [{ size: 99 }] })).toBeNull();
    const d = sanitizeDoc({
      canvases: [
        {
          id: 'a',
          name: 'X',
          size: 6,
          lines: [
            { a: [0, 0], b: [1200, 0], color: '#00A000' },
            { a: [0, 0], b: [100, 0] },
            { a: [0, 0], b: [99999, 0] },
            'junk',
          ],
          fills: [
            {
              pts: [
                [0, 0],
                [1200, 0],
                [0, 1200],
                [0, 0],
              ],
              color: 'red',
            },
            { pts: [[0, 0]] },
          ],
          damage: [
            [1, 1],
            [1, 1],
            [6, 0],
            [0.5, 1],
          ],
        },
        { id: 'a', size: 11 },
      ],
      stamps: [
        {
          name: 's',
          figures: [
            {
              pts: [
                [0, 0],
                [1200, 0],
              ],
              closed: false,
            },
          ],
        },
        { name: 'bad' },
      ],
      draft: { canvasId: 'a', kind: 'line', figures: [], current: [[0, 0]], cells: [] },
    });
    expect(d?.canvases).toHaveLength(2);
    const [a, b] = d?.canvases ?? [];
    expect(a.lines).toEqual([{ a: [0, 0], b: [1200, 0], color: '#00a000' }]);
    expect(a.fills).toEqual([
      {
        pts: [
          [0, 0],
          [1200, 0],
          [0, 1200],
        ],
        color: '#00c0ff',
      },
    ]);
    expect(a.damage).toEqual([[1, 1]]);
    /* 重複的 id 換一個 */
    expect(b.id).not.toBe('a');
    expect(b.name).toBe('');
    expect(d?.stamps).toHaveLength(1);
    /* 專案檔不帶草稿；自動儲存的保留 */
    expect(d?.draft).toBeNull();
    const kept = sanitizeDoc(
      {
        canvases: [{ id: 'a', size: 6 }],
        draft: { canvasId: 'a', kind: 'line', figures: [], current: [[0, 0]], cells: [] },
      },
      { keepDraft: true },
    );
    expect(kept?.draft?.current).toEqual([[0, 0]]);
  });

  it('新畫布的名字接在用過的最大號碼後面', () => {
    const list = [
      { ...defaultDoc().canvases[0], name: 'PC1' },
      { ...defaultDoc().canvases[0], name: 'PC 3' },
      { ...defaultDoc().canvases[0], name: '隨從1' },
    ];
    expect(nextName(list, 'PC')).toBe('PC4');
    expect(nextName(list, '隨從')).toBe('隨從2');
    expect(nextName([], 'PC')).toBe('PC1');
  });

  it('專案檔（版本 1）往返；別的工具的專案檔、壞掉的 JSON 讀不進來', () => {
    const doc = { ...sampleDoc(), draft: null };
    const text = serializeProject(TOOL_ID, DATA_VERSION, projectData(doc));
    const p = parseProject(text, TOOL_ID);
    expect(p.version).toBe(1);
    expect(sanitizeDoc(p.data)).toEqual(doc);
    expect(() => parseProject(serializeProject('tile-map', 1, doc), TOOL_ID)).toThrow();
    expect(() => parseProject('{', TOOL_ID)).toThrow();
    /* 專案檔不帶草稿 */
    expect(
      projectData({
        ...doc,
        draft: {
          canvasId: 'x',
          kind: 'line',
          erase: false,
          figures: [],
          current: [P(1, 1)],
          cells: [],
        },
      }).draft,
    ).toBeNull();
  });

  it('範例：原作的 6 張加上空白的 PC1，共 7 張', () => {
    const s = sampleDoc();
    expect(s.canvases.map((c) => `${c.name}:${c.size}`)).toEqual([
      'PC1:11',
      'PC2:11',
      'PC3:11',
      'PC4:11',
      'BOSS:11',
      '隨從1:6',
      '隨從2:6',
    ]);
  });
});

describe('畫與復原', () => {
  it('直線：點兩點、決定；復原一步一步退回草稿', () => {
    clickAt(P(1, 1));
    clickAt(P(4, 2));
    expect(draftNow()?.figures).toHaveLength(1);
    expect(commit()).toEqual({ kind: 'drawn' });
    expect(activeNow().lines).toEqual([{ a: P(1, 1), b: P(4, 2), color: '#0000ff' }]);
    expect(docNow().draft).toBeNull();
    undo();
    expect(activeNow().lines).toEqual([]);
    expect(draftNow()?.figures).toHaveLength(1);
    undo();
    expect(draftNow()?.current).toEqual([P(1, 1)]);
    undo();
    expect(docNow().draft).toBeNull();
    redo();
    redo();
    redo();
    expect(activeNow().lines).toHaveLength(1);
  });

  it('退一點：草稿少一點（一步復原）；取消：草稿丟掉（可以復原）', () => {
    setMode('shape', false);
    clickAt(P(1, 1));
    clickAt(P(3, 1));
    clickAt(P(3, 3));
    expect(stepBackDraft()).toBe(true);
    expect(draftNow()?.current).toEqual([P(1, 1), P(3, 1)]);
    expect(cancelDraft()).toBe(true);
    expect(docNow().draft).toBeNull();
    undo();
    expect(draftNow()?.current).toEqual([P(1, 1), P(3, 1)]);
  });

  it('換畫法時草稿丟掉；復原時回到草稿的畫法', () => {
    setMode('shape', false);
    clickAt(P(1, 1));
    clickAt(P(3, 1));
    setMode('damage', false);
    expect(docNow().draft).toBeNull();
    undo();
    expect(prefsNow().kind).toBe('shape');
    expect(draftNow()?.current).toHaveLength(2);
  });

  it('復原改到的是別張畫布時，畫面切到那一張', () => {
    clickAt(P(0, 1));
    clickAt(P(1, 1));
    commit();
    const second = addCanvas(6) as string;
    expect(prefsNow().active).toBe(second);
    selectCanvas(second);
    undo(); /* 新增畫布 */
    undo(); /* 決定 */
    expect(prefsNow().active).toBe('c-1');
  });

  it('傷害格：決定；刪除時沒有符合的就什麼都不刪', () => {
    setMode('damage', false);
    cellAt([2, 2]);
    cellAt([3, 2]);
    expect(commit()).toEqual({ kind: 'drawn' });
    expect(activeNow().damage).toEqual([
      [2, 2],
      [3, 2],
    ]);
    setMode('damage', true);
    cellAt([9, 9]);
    expect(commit()).toEqual({ kind: 'nothing-to-erase' });
    cellAt([2, 2]);
    expect(commit()).toEqual({ kind: 'erased' });
    expect(activeNow().damage).toEqual([[3, 2]]);
  });

  it('還不能決定時不動；移動到邊緣外不動', () => {
    clickAt(P(0, 0));
    expect(commit()).toEqual({ kind: 'not-ready' });
    clickAt(P(2, 0));
    expect(shift(0, -1)).toBe(false);
    expect(shift(1, 1)).toBe(true);
    expect(draftNow()?.figures[0].pts).toEqual([P(1, 1), P(3, 1)]);
  });
});

describe('畫布的管理', () => {
  it('新增、複製、往後移、改大小（內容清空）、刪除（至少留一張）', () => {
    const b = addCanvas(11) as string;
    expect(docNow().canvases.map((c) => c.name)).toEqual(['PC', 'PC1']);
    clickAt(P(0, 1));
    clickAt(P(1, 1));
    commit();
    const copy = duplicateActive() as string;
    expect(activeNow().name).toBe('PC1的複本');
    expect(activeNow().lines).toHaveLength(1);
    selectCanvas(b);
    expect(moveActive(1)).toBe(true);
    expect(docNow().canvases.map((c) => c.id)).toEqual(['c-1', copy, b]);
    resizeCanvas(b, 6);
    expect(activeNow()).toMatchObject({ size: 6, lines: [] });
    expect(deleteActive()).toBe(true);
    expect(deleteActive()).toBe(true);
    expect(deleteActive()).toBe(false);
    expect(docNow().canvases).toHaveLength(1);
  });

  it('範例與全部重來', () => {
    loadSample();
    expect(docNow().canvases).toHaveLength(7);
    expect(prefsNow().view).toBe('all');
    resetAll();
    expect(docNow()).toEqual(defaultDoc());
    expect(useDoc.temporal.getState().pastStates).toHaveLength(0);
  });

  it('讀入原作的資料：加成新的一張並切過去；開專案檔換掉整份', () => {
    const id = addLegacyCanvas(parseLegacy('GN:6|NM:Mob%201|CL:L:P:0_0-P:1200_0-'));
    expect(prefsNow().active).toBe(id);
    expect(activeNow()).toMatchObject({ name: 'Mob 1', size: 6 });
    replaceDoc(sampleDoc(), { clearHistory: true });
    expect(activeNow().name).toBe('PC1');
  });
});

describe('圖形庫', () => {
  it('存草稿的線、放到別的畫布（超出時移進來）、太大時放不上去', () => {
    setMode('shape', false);
    for (const p of [P(6, 6), P(10, 6), P(10, 10), P(6, 6)]) clickAt(p);
    const id = saveStamp('方塊') as string;
    expect(docNow().stamps[0]).toMatchObject({ name: '方塊', figures: [{ closed: true }] });
    cancelDraft();
    addCanvas(6);
    expect(placeStamp(id)).toBe('ok');
    /* 11×11 上 (6,6)～(10,10) 的方塊，放到 6×6 時整個往左上移 4 格 */
    expect(draftNow()?.figures[0].pts).toEqual([P(2, 2), P(6, 2), P(6, 6)]);
    useDoc.getState().update((d) => {
      d.stamps[0].figures[0].pts = [P(0, 0), P(9, 0)];
    });
    expect(placeStamp(id)).toBe('too-big');
  });
});
