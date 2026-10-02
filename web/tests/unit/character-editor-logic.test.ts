/**
 * 角色資料編輯器（character-editor）的純邏輯：
 * - 附件 character-editor.examples.json 的 34 組：逐步執行（讀入 → 差異清單 → 勾選 → 套用），
 *   差異清單（順序、欄位、列名、兩側的值、標示變更的部分）與最後的輸出全文逐字相符；
 *   E06 依規格第 7 節裁定比修正後的預期（狀態標籤空白不再把「現在値」當成標籤）。
 * - 規格 3.2～3.4 的數值規則：身分、初始空白列、逐列重新判定、色碼欄、數字欄、排序、引用插入。
 */
import { describe, expect, it } from 'vitest';
import { type CcfoliaCharacter, serializeCharacterClipboard } from '@/ccfolia';
import {
  applyImportDiffs,
  type CharacterItem,
  colorCodeText,
  computeImportDiffs,
  displayValue,
  groupDiffs,
  type ImportDiff,
  type ImportResult,
  type ItemPart,
  initialCharacter,
  insertReference,
  isInitialBlankList,
  itemKey,
  moveItem,
  numberFieldValue,
  readCharacterJson,
  readEditScreenText,
  reconcileKeys,
  referenceLabels,
  referenceToken,
  removeAt,
  settleColorCode,
  typeColorCode,
} from '@/tools/character-editor/logic';
import CE from '../../../docs/refactor/specs/character-editor.examples.json';
import {
  CURRENT_OUTPUT,
  type DiffRecord,
  type Example,
  examplesOf,
  expectedFor,
  findExample,
  type ItemRecord,
  REASON_KINDS,
  rowMatches,
} from '../helpers/characterEditorExamples';

const EXAMPLES = examplesOf(CE);
const byId = (id: string) => findExample(EXAMPLES, id);

const PART_NAMES: Record<'status' | 'params', Record<ItemPart, string>> = {
  status: { label: '標籤', value: '目前值', max: '最大值' },
  params: { label: '標籤', value: '值', max: '最大值' },
};

/** 差異 → 附件的紀錄格式 */
function toRecord(d: ImportDiff): DiffRecord {
  if (d.kind === 'field')
    return { 欄位: d.field, 目前: displayValue(d.current), 匯入: displayValue(d.incoming) };
  const names = PART_NAMES[d.list];
  const side = (item: CharacterItem | null): ItemRecord | null => {
    if (!item) return null;
    const changed = d.changed.map((p) => names[p]);
    return d.list === 'status'
      ? {
          標籤: item.label,
          目前值: String(item.value),
          最大值: String(item.max),
          標示變更: changed,
        }
      : { 標籤: item.label, 值: String(item.value), 標示變更: changed };
  };
  return {
    欄位: d.list,
    列名: d.title === null ? { 空白標籤: true } : d.title,
    目前: side(d.current),
    匯入: side(d.incoming),
  };
}

/** 依附件的步驟執行（模擬工具的流程：讀入 → 差異確認 → 套用） */
function run(ex: Example) {
  const { steps, output } = expectedFor(ex);
  let current: CcfoliaCharacter = initialCharacter();
  let draft: { incoming: CcfoliaCharacter; diffs: ImportDiff[]; selected: Set<string> } | null =
    null;
  for (const step of steps) {
    switch (step.動作) {
      case '讀入 JSON':
      case '讀入本機檔案':
      case '讀入編輯畫面複製文字': {
        const input =
          step.輸入 === CURRENT_OUTPUT ? serializeCharacterClipboard(current) : step.輸入!;
        const r: ImportResult =
          step.動作 === '讀入編輯畫面複製文字'
            ? readEditScreenText(input)
            : readCharacterJson(input);
        const want = step.結果!;
        if (want.類型 === '錯誤') {
          expect(r).toEqual({ ok: false, error: REASON_KINDS[want.原因!] });
          break;
        }
        if (!r.ok) throw new Error(`${ex.編號}：讀入失敗 ${r.error}`);
        const diffs = computeImportDiffs(current, r.incoming, { includeColor: r.includeColor });
        if (want.類型 === '沒有差異') {
          expect(diffs).toEqual([]);
          break;
        }
        expect(diffs.map(toRecord), `${ex.編號} 的差異清單`).toEqual(want.差異清單);
        draft = { incoming: r.incoming, diffs, selected: new Set() };
        break;
      }
      case '勾選': {
        if (!draft) throw new Error('沒有差異確認');
        for (const pick of step.項目!) {
          const d = draft.diffs.find((x) => rowMatches(toRecord(x), pick));
          if (!d) throw new Error(`${ex.編號}：找不到要勾的列 ${JSON.stringify(pick)}`);
          draft.selected.add(d.id);
        }
        break;
      }
      case '覆寫勾選的項目':
        if (!draft) throw new Error('沒有差異確認');
        current = applyImportDiffs(current, draft.incoming, draft.diffs, draft.selected);
        draft = null;
        break;
      case '全部覆寫':
        if (!draft) throw new Error('沒有差異確認');
        current = applyImportDiffs(
          current,
          draft.incoming,
          draft.diffs,
          draft.diffs.map((d) => d.id),
        );
        draft = null;
        break;
      case '關閉差異視窗（不套用）':
        draft = null;
        break;
      default:
        throw new Error(`未知的動作 ${step.動作}`);
    }
  }
  expect(serializeCharacterClipboard(current), `${ex.編號} 的輸出`).toBe(output);
}

describe('附件 34 組：差異清單與輸出逐字相符', () => {
  it('附件有 34 組（JSON 20、編輯畫面 12、檔案 2）', () => {
    expect(EXAMPLES).toHaveLength(34);
    expect(EXAMPLES.filter((e) => e.編號.startsWith('J'))).toHaveLength(20);
    expect(EXAMPLES.filter((e) => e.編號.startsWith('E'))).toHaveLength(12);
    expect(EXAMPLES.filter((e) => e.編號.startsWith('F'))).toHaveLength(2);
  });

  for (const ex of EXAMPLES) {
    it(`${ex.編號}：${ex.說明}`, () => run(ex));
  }
});

describe('開頁狀態（F37）', () => {
  it('新角色、先攻 0、各一列空白、棋子大小 4、#888888（附件 J11 的預期輸出）', () => {
    expect(serializeCharacterClipboard(initialCharacter())).toBe(byId('J11').預期輸出);
  });
});

describe('項目的身分與初始空白列（3.2.2）', () => {
  it('標籤去頭尾空白後是空的 → 位置；否則標籤原文', () => {
    expect(itemKey({ label: 'HP' }, 3)).toBe('label:HP');
    expect(itemKey({ label: ' HP ' }, 3)).toBe('label: HP ');
    expect(itemKey({ label: '' }, 2)).toBe('index:2');
    expect(itemKey({ label: ' 　' }, 0)).toBe('index:0');
  });

  it('初始空白列：剛好 1 項、空白標籤、0／0（參數是空字串）', () => {
    expect(isInitialBlankList([{ label: '', value: 0, max: 0 }], 'status')).toBe(true);
    expect(isInitialBlankList([{ label: ' ', value: 0, max: 0 }], 'status')).toBe(true);
    expect(isInitialBlankList([{ label: '', value: 1, max: 0 }], 'status')).toBe(false);
    expect(
      isInitialBlankList(
        [
          { label: '', value: 0, max: 0 },
          { label: '', value: 0, max: 0 },
        ],
        'status',
      ),
    ).toBe(false);
    expect(isInitialBlankList([{ label: '', value: '' }], 'params')).toBe(true);
    expect(isInitialBlankList([{ label: '', value: '0' }], 'params')).toBe(false);
    expect(isInitialBlankList([], 'params')).toBe(false);
  });

  it('同名只認第一個；後面同名的完全不參與（J07）', () => {
    const r = readCharacterJson(byId('J07').步驟[0].輸入!);
    if (!r.ok) throw new Error();
    const diffs = computeImportDiffs(initialCharacter(), r.incoming, { includeColor: false });
    expect(diffs.filter((d) => d.kind === 'item').map((d) => d.id)).toEqual([
      'status:label:HP',
      'status:label:MP',
    ]);
  });

  it('初始空白列只跟匯入的第 1 項配對，其他附加在後面（J02：只勾 SAN）', () => {
    const r = readCharacterJson(byId('J02').步驟[0].輸入!);
    if (!r.ok) throw new Error();
    const cur = initialCharacter();
    const diffs = computeImportDiffs(cur, r.incoming, { includeColor: r.includeColor });
    const next = applyImportDiffs(cur, r.incoming, diffs, ['status:label:SAN']);
    expect(next.status).toEqual([
      { label: '', value: 0, max: 0 },
      { label: 'SAN', value: 55, max: 99 },
    ]);
  });

  it('套用時「同身分」依當下的清單重新判定（J20：刪掉前面的項目後位置改變）', () => {
    const cur: CcfoliaCharacter = {
      ...initialCharacter(),
      params: [
        { label: 'A', value: '1' },
        { label: '', value: '2' },
        { label: '', value: '3' },
      ],
    };
    const r = readCharacterJson(
      '{"kind":"character","data":{"params":[{"label":"","value":"9"}]}}',
    );
    if (!r.ok) throw new Error();
    const diffs = computeImportDiffs(cur, r.incoming, { includeColor: false }).filter(
      (d) => d.kind === 'item',
    );
    expect(diffs.map((d) => d.id)).toEqual([
      'params:label:A',
      'params:index:1',
      'params:index:2',
      'params:index:0',
    ]);
    /* 只套用「刪掉 index:1」：刪的是第 2 項（值 2） */
    expect(applyImportDiffs(cur, r.incoming, diffs, ['params:index:1']).params).toEqual([
      { label: 'A', value: '1' },
      { label: '', value: '3' },
    ]);
    /* 先刪 A 再刪 index:1：那時的第 2 項是值 3 */
    expect(
      applyImportDiffs(cur, r.incoming, diffs, ['params:label:A', 'params:index:1']).params,
    ).toEqual([{ label: '', value: '2' }]);
  });

  it('匯入側沒有的項目：目前清單找不到同身分時不動', () => {
    const cur: CcfoliaCharacter = {
      ...initialCharacter(),
      status: [{ label: 'HP', value: 1, max: 1 }],
    };
    const inc: CcfoliaCharacter = { ...initialCharacter(), status: [] };
    const diffs = computeImportDiffs(cur, inc, { includeColor: false });
    const del = diffs.find((d) => d.id === 'status:label:HP')!;
    const after = applyImportDiffs(cur, inc, [del], [del.id]);
    expect(after.status).toEqual([]);
    /* 再套用一次（已經刪掉了）不會出錯、不變 */
    expect(applyImportDiffs(after, inc, [del], [del.id]).status).toEqual([]);
  });

  it('項目上的其他欄位不比較，但套用時整個換成匯入的項目（含其他欄位，J15）', () => {
    const cur: CcfoliaCharacter = {
      ...initialCharacter(),
      status: [{ label: 'HP', value: 5, max: 9, note: '舊' }],
    };
    const same = readCharacterJson(
      '{"kind":"character","data":{"name":"新角色","status":[{"label":"HP","value":5,"max":9,"note":"新"}],"params":[{"label":"","value":""}]}}',
    );
    if (!same.ok) throw new Error();
    expect(computeImportDiffs(cur, same.incoming, { includeColor: false })).toEqual([]);
    const changed = readCharacterJson(
      '{"kind":"character","data":{"name":"新角色","status":[{"note":"新","label":"HP","value":4,"max":9}],"params":[{"label":"","value":""}]}}',
    );
    if (!changed.ok) throw new Error();
    const diffs = computeImportDiffs(cur, changed.incoming, { includeColor: false });
    expect(diffs.map((d) => (d.kind === 'item' ? d.changed : d.id))).toEqual([['value']]);
    const out = applyImportDiffs(cur, changed.incoming, diffs, [diffs[0].id]);
    expect(out.status).toEqual([{ note: '新', label: 'HP', value: 4, max: 9 }]);
    expect(Object.keys(out.status[0])).toEqual(['note', 'label', 'value', 'max']);
  });
});

describe('差異清單的分組與顯示（F11、3.2.3）', () => {
  it('一般欄位 → 狀態 → 參數 → 聊天面板；沒有的群組不出現', () => {
    const r = readCharacterJson(byId('J01').步驟[0].輸入!);
    if (!r.ok) throw new Error();
    const groups = groupDiffs(computeImportDiffs(initialCharacter(), r.incoming, r));
    expect(groups.map((g) => [g.list, g.diffs.map((d) => d.id)])).toEqual([
      [null, ['name', 'initiative', 'externalUrl', 'color', 'memo', 'width']],
      ['status', ['status:label:HP', 'status:label:MP', 'status:label:SAN']],
      ['params', ['params:label:STR', 'params:label:教育']],
      [null, ['commands']],
    ]);
    const only = readCharacterJson('{"kind":"character","data":{"name":"A"}}');
    if (!only.ok) throw new Error();
    expect(groupDiffs(computeImportDiffs(initialCharacter(), only.incoming, only))).toHaveLength(1);
  });

  it('值的顯示：空字串是「空」，數字照 JavaScript 轉成文字', () => {
    expect(displayValue('')).toBeNull();
    expect(displayValue(null)).toBeNull();
    expect(displayValue(0)).toBe('0');
    expect(displayValue(1e21)).toBe('1e+21');
    expect(displayValue(-1.5)).toBe('-1.5');
    expect(displayValue('a\nb')).toBe('a\nb');
  });

  it('列名：匯入側的標籤 → 目前側的標籤 → 空白標籤（null）；只有空白字元照原樣', () => {
    const cur: CcfoliaCharacter = {
      ...initialCharacter(),
      status: [
        { label: 'HP', value: 1, max: 1 },
        { label: '', value: 1, max: 1 },
      ],
    };
    const inc: CcfoliaCharacter = {
      ...initialCharacter(),
      status: [
        { label: ' ', value: 9, max: 9 },
        { label: '', value: 2, max: 2 },
      ],
    };
    const titles = computeImportDiffs(cur, inc, { includeColor: false }).map((d) =>
      d.kind === 'item' ? d.title : d.id,
    );
    expect(titles).toEqual(['HP', null, ' ']);
  });
});

describe('顏色是否列入比較（F04）', () => {
  it('JSON：只有 # 加 6 位十六進位（大小寫都可）才列入，照原樣匯入', () => {
    const ok = readCharacterJson('{"kind":"character","data":{"color":"#AbCdEf"}}');
    expect(ok.ok && ok.includeColor).toBe(true);
    for (const c of ['""', '"red"', '"#abc"', '"#11223344"', 'null', '123']) {
      const r = readCharacterJson(`{"kind":"character","data":{"color":${c}}}`);
      expect(r.ok && r.includeColor, c).toBe(false);
    }
    const none = readCharacterJson('{"kind":"character","data":{}}');
    expect(none.ok && none.includeColor).toBe(false);
  });

  it('編輯畫面複製文字：一律不列入（E12）', () => {
    const r = readEditScreenText(byId('E12').步驟[2].輸入!);
    expect(r.ok && r.includeColor).toBe(false);
  });

  it('沒列入比較時，就算匯入的顏色不同也沒有顏色那一列', () => {
    const cur = { ...initialCharacter(), color: '#3366cc' };
    const inc = { ...initialCharacter(), color: '#888888' };
    expect(computeImportDiffs(cur, inc, { includeColor: false })).toEqual([]);
    expect(computeImportDiffs(cur, inc, { includeColor: true }).map((d) => d.id)).toEqual([
      'color',
    ]);
  });
});

describe('色碼欄（3.4＋第 7 節裁定）', () => {
  it('顯示目前顏色時不含 #，大小寫照目前的值（J04）', () => {
    expect(colorCodeText('#888888')).toBe('888888');
    expect(colorCodeText('#AABBCC')).toBe('AABBCC');
  });

  it('打字：剛好 6 位十六進位才立刻套用（轉小寫）', () => {
    expect(typeColorCode('12AB')).toEqual({ text: '12AB', color: null });
    expect(typeColorCode('12ABEF')).toEqual({ text: '12ABEF', color: '#12abef' });
    expect(typeColorCode('12ABEFG')).toEqual({ text: '12ABEF', color: '#12abef' });
    expect(typeColorCode('12ABEG')).toEqual({ text: '12ABEG', color: null });
    expect(typeColorCode('#12a')).toEqual({ text: '12a', color: null });
  });

  it('貼上「#FF0000」：先去掉 # 再取 6 碼並套用（裁定）', () => {
    expect(typeColorCode('#FF0000')).toEqual({ text: 'FF0000', color: '#ff0000' });
  });

  it('離開欄位：3 位展開、6 位套用（都轉小寫）；其他還原成目前顏色', () => {
    expect(settleColorCode('abc', '#888888')).toBe('#aabbcc');
    expect(settleColorCode('ABC', '#888888')).toBe('#aabbcc');
    expect(settleColorCode('12ABEF', '#888888')).toBe('#12abef');
    for (const bad of ['', '12', '1234', '12345', 'ggg', 'zzzzzz', '#']) {
      expect(settleColorCode(bad, '#AABBCC'), bad).toBe('#AABBCC');
    }
  });
});

describe('數字欄（F18）', () => {
  it('空白（含瀏覽器視為無效的寫法）是 0；照 JavaScript 的數字轉換', () => {
    expect(numberFieldValue('')).toBe(0);
    expect(numberFieldValue('1e2')).toBe(100);
    expect(numberFieldValue('-1.5')).toBe(-1.5);
    expect(numberFieldValue('12.25')).toBe(12.25);
    expect(numberFieldValue('1e999')).toBe(0);
  });
});

describe('清單（F27～F29）', () => {
  it('拖曳排序：A B C D 把 D 放到 A 上 → D A B C；把 A 放到 C 上 → B C A D；放回原位不變', () => {
    const abcd = ['A', 'B', 'C', 'D'];
    expect(moveItem(abcd, 3, 0)).toEqual(['D', 'A', 'B', 'C']);
    expect(moveItem(abcd, 0, 2)).toEqual(['B', 'C', 'A', 'D']);
    expect(moveItem(abcd, 1, 1)).toEqual(abcd);
    expect(moveItem(abcd, 0, 9)).toEqual(abcd);
  });

  it('刪除：可以刪到一列都不剩', () => {
    expect(removeAt(['A'], 0)).toEqual([]);
    expect(removeAt(['A', 'B', 'C'], 1)).toEqual(['A', 'C']);
  });

  it('React key：沒變的項目沿用舊的 key（依物件身分）', () => {
    const a = { label: 'A' };
    const b = { label: 'B' };
    const c = { label: 'C' };
    let n = 0;
    const fresh = () => `new${++n}`;
    expect(reconcileKeys([a, b], ['k1', 'k2'], [b, c, a], fresh)).toEqual(['k2', 'new1', 'k1']);
  });
});

describe('聊天面板的引用（F31、F32）', () => {
  it('只列去頭尾空白後不是空的標籤；標籤照原樣；同名照樣列出', () => {
    expect(
      referenceLabels([
        { label: 'HP' },
        { label: '' },
        { label: '  ' },
        { label: ' SAN ' },
        { label: 'HP' },
      ]),
    ).toEqual(['HP', ' SAN ', 'HP']);
    expect(referenceToken(' SAN ')).toBe('{ SAN }');
  });

  it('插入：游標位置插入；有選取範圍時取代；游標放在插入文字的後面', () => {
    expect(insertReference('CC<=', 'SAN', 4)).toEqual({ text: 'CC<={SAN}', caret: 9 });
    expect(insertReference('1d100<=50', 'SAN', 7, 9)).toEqual({
      text: '1d100<={SAN}',
      caret: 12,
    });
    expect(insertReference('', 'HP', 0)).toEqual({ text: '{HP}', caret: 4 });
    /* 範圍超出時夾在文字內 */
    expect(insertReference('ab', 'X', 10)).toEqual({ text: 'ab{X}', caret: 5 });
  });
});
