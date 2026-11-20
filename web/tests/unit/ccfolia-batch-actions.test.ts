/**
 * CCFOLIA 角色批次產生器的操作（規格 1.3～1.8、1.10）：改讀法與記住、確定、手動修改與固定、貼上、重來、提醒、復原。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addPiece,
  addSheetExport,
  assignedPlaces,
  clearPasted,
  copyPiece,
  deletePiece,
  deleteShelfImage,
  editPiece,
  fillSample,
  keepAndContinue,
  loadProject,
  movePiece,
  rebuild,
  renamePiece,
  resetAll,
  setColumnKind,
  setLabelKind,
  setMode,
  setText,
  warningsOf,
} from '@/tools/ccfolia-batch/actions';
import { piecesOf, viewsOf } from '@/tools/ccfolia-batch/derived';
import { defaultDoc } from '@/tools/ccfolia-batch/model';
import { HISTORY_LIMIT, PROJECT_VERSION, useDoc, useUi } from '@/tools/ccfolia-batch/store';
import { S } from '@/tools/ccfolia-batch/strings';
import { wordKey } from '@/tools/ccfolia-batch/words';

const doc = () => useDoc.getState().data;
const names = () => piecesOf(doc()).map((c) => c.name);

beforeEach(() => {
  useDoc.getState().replace(defaultDoc());
  useDoc.temporal.getState().clear();
  useUi.setState({ selected: -1, status: {} });
});

describe('讀法與欄的用途', () => {
  it('改讀法：記住、套到之後的 NPC、和自動相同時不記、重來時保留', () => {
    setText('A\n警戒值 6\n\nB\n警戒值 8');
    expect(piecesOf(doc())[0].status).toEqual([{ label: '警戒值', value: 6, max: 6 }]);
    setLabelKind(wordKey('警戒值'), 'param', 'status');
    expect(doc().labels).toEqual({ [wordKey('警戒值')]: 'param' });
    expect(piecesOf(doc()).map((c) => c.params)).toEqual([
      [{ label: '警戒值', value: '6' }],
      [{ label: '警戒值', value: '8' }],
    ]);
    resetAll();
    expect(doc().memo).toBe('');
    expect(doc().labels).toEqual({ [wordKey('警戒值')]: 'param' });
    setLabelKind(wordKey('警戒值'), 'status', 'status');
    expect(doc().labels).toEqual({});
  });

  it('改欄的用途', () => {
    setMode('table');
    setText('名稱\t護甲\nA\t2');
    expect(piecesOf(doc())[0].params).toEqual([{ label: '護甲', value: '2' }]);
    setColumnKind('護甲', 'status', 'param');
    expect(piecesOf(doc())[0].status).toEqual([{ label: '護甲', value: 2, max: 2 }]);
    setColumnKind('護甲', 'param', 'param');
    expect(doc().columns).toEqual({});
  });
});

describe('確定與手動修改', () => {
  it('確定：留成已確定、輸入欄清空、可以接著輸入；復原回到輸入', () => {
    setText('A\nHP 1');
    expect(keepAndContinue()).toBe(true);
    expect(doc().memo).toBe('');
    expect(doc().kept.map((c) => [c.name, c.from, c.line])).toEqual([['A', 'kept', null]]);
    setText('乙 ×2\nHP 2');
    expect(names()).toEqual(['A', '乙A', '乙B']);
    expect(keepAndContinue()).toBe(true);
    expect(doc().kept).toHaveLength(3);
    expect(useUi.getState().status.list?.text).toBe(
      '已確定（加了 2 個，共 3 個）。輸入欄已清空，可以接著輸入下一位 NPC。',
    );
    useDoc.temporal.getState().undo();
    expect(doc().memo).toBe('乙 ×2\nHP 2');
  });

  it('手動修改：第一次修改時固定、上下移、複製、刪除、加一個、從輸入重做', () => {
    fillSample();
    expect(names()).toEqual(['艾莉絲', '鮑伯', '黑影A', '黑影B', '黑影C']);
    editPiece(1, (c) => {
      c.memo = '改過';
    });
    expect(doc().edited).not.toBeNull();
    /* 固定之後改輸入不影響清單 */
    setText('X\nHP 1');
    expect(names()).toEqual(['艾莉絲', '鮑伯', '黑影A', '黑影B', '黑影C']);
    movePiece(0, 1);
    expect(names().slice(0, 2)).toEqual(['鮑伯', '艾莉絲']);
    copyPiece(0);
    expect(names().slice(0, 3)).toEqual(['鮑伯', '鮑伯', '艾莉絲']);
    expect(piecesOf(doc())[1]).toMatchObject({ memo: '改過', from: 'hand', line: null });
    deletePiece(0);
    addPiece();
    expect(piecesOf(doc()).at(-1)).toMatchObject({
      name: '新的棋子',
      status: [{ label: 'HP', value: 0, max: 0 }],
    });
    expect(useUi.getState().selected).toBe(piecesOf(doc()).length - 1);
    rebuild();
    expect(names()).toEqual(['X']);
  });

  it('改名稱：原本靠名稱對到的圖照樣用', () => {
    useDoc.getState().update((d) => {
      d.images.push({ id: 'i1', name: '艾莉絲', asset: 'a1', type: 'image/png', size: 9 });
    });
    setText('艾莉絲\nHP 1');
    renamePiece(0, '艾莉絲（變身後）');
    const [v] = viewsOf(doc());
    expect([v.piece.name, v.piece.imageName, v.portrait?.id]).toEqual([
      '艾莉絲（變身後）',
      '艾莉絲',
      'i1',
    ]);
  });

  it('刪除圖片：指定了它的地方變成沒有圖', () => {
    useDoc.getState().update((d) => {
      d.images.push({ id: 'i1', name: 'x', asset: 'a1', type: 'image/png', size: 9 });
    });
    setText('A\nHP 1');
    editPiece(0, (c) => {
      c.image = 'i1';
      c.faces.push({ label: '笑', imageId: 'i1', imageName: '' });
    });
    expect(assignedPlaces(doc(), 'i1')).toEqual(['A', 'A的差分「笑」']);
    deleteShelfImage('i1');
    expect(doc().images).toEqual([]);
    expect(piecesOf(doc())[0]).toMatchObject({ image: 'none', faces: [{ imageId: null }] });
    expect(useUi.getState().status.shelf?.text).toBe('已刪除；指定了這張圖的地方變成「沒有圖」。');
  });
});

describe('貼上與提醒', () => {
  it('貼上的棋子跟在讀到的後面，可以清掉', () => {
    setText('A\nHP 1');
    expect(addSheetExport('nope')).toBe(false);
    expect(
      addSheetExport(JSON.stringify({ kind: 'character', data: { name: 'P', iconUrl: 'x' } })),
    ).toBe(true);
    expect(names()).toEqual(['A', 'P']);
    expect(useUi.getState().status.paste?.text).toContain('已加入 1 個。立繪沒有帶進來');
    clearPasted();
    expect(names()).toEqual(['A']);
  });

  it('讀取的提示、找不到的圖、同名的棋子', () => {
    setText('A\nHP 1\n立繪：沒有這張\n\nA\nHP 2\n\nHP 3');
    expect(warningsOf(doc())).toEqual([
      '第 8 行開始的 NPC 沒有名字。請在第一行寫名字。',
      '圖片庫裡沒有同名的圖：A的立繪「沒有這張」',
      '有同名的棋子（照樣做得出來，但在 CCFOLIA 不容易分辨）：A',
    ]);
  });
});

describe('復原', () => {
  it(`最多 ${HISTORY_LIMIT} 步`, () => {
    const t = useDoc.temporal.getState();
    expect(HISTORY_LIMIT).toBe(150);
    for (let i = 0; i < 160; i++) {
      useDoc.beginGesture();
      setText(`A${i}`);
      useDoc.endGesture();
    }
    expect(useDoc.temporal.getState().pastStates.length).toBe(150);
    t.undo();
    expect(doc().memo).toBe('A158');
  });
});

describe('專案檔', () => {
  it('較新版本的工具存的專案檔：不開、說明原因（目前的內容不動）', async () => {
    setText('A\nHP 1');
    const saved = { ...defaultDoc(), memo: 'B\nHP 2' };
    await expect(loadProject(saved, PROJECT_VERSION + 1, new Map())).rejects.toThrow(
      S.newerProject,
    );
    expect(doc().memo).toBe('A\nHP 1');
    await loadProject(saved, PROJECT_VERSION, new Map());
    expect(doc().memo).toBe('B\nHP 2');
  });
});
