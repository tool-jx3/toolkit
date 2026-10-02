/**
 * G5 共用層：CCFOLIA 角色資料（ccfolia/characterData.ts、editScreen.ts）。
 * 對照 character-editor 規格 2.1～2.3、3.1、3.5 與附件 character-editor.examples.json 的逐字輸出。
 * 「全部覆寫」的差異套用屬於 character-editor 工具；這裡只在「剛開頁＋一次全部覆寫」的範例上
 * 模擬它（結果＝匯入清單，或匯入清單是空的時保留初始空白列），用來驗證讀取、修正與輸出逐字相符。
 */
import { describe, expect, it } from 'vitest';
import {
  type CcfoliaCharacter,
  CHARACTER_DEFAULT_COLOR,
  CHARACTER_DEFAULT_SIZE,
  CHARACTER_DEFAULTS,
  CHARACTER_EDITOR_FIELDS,
  CHARACTER_FIELDS,
  CHARACTER_FILE_EXT,
  characterFileName,
  isCharacterColor,
  normalizeCharacter,
  parseCharacterClipboard,
  parseCharacterEditScreen,
  serializeCharacterClipboard,
  toCharacterClipboard,
} from '@/ccfolia';
import CE from '../../../docs/refactor/specs/character-editor.examples.json';

interface Step {
  動作: string;
  輸入?: string;
  結果?: { 類型: string; 原因?: string };
}
interface Example {
  編號: string;
  步驟: Step[];
  預期輸出?: string;
}
const EXAMPLES = (CE as unknown as { 範例: Example[] }).範例;
const byId = (id: string) => EXAMPLES.find((e) => e.編號 === id)!;

/** 剛開頁的角色（規格 F37） */
const initial = (): CcfoliaCharacter =>
  normalizeCharacter({
    name: '新角色',
    status: [{ label: '', value: 0, max: 0 }],
    params: [{ label: '', value: '' }],
  });

/** 同一清單裡有沒有同名（非空白）的標籤：有的話差異套用另有規則（屬工具），不在這裡模擬 */
const hasDuplicateLabels = (list: { label: string }[]) => {
  const seen = new Set<string>();
  for (const { label } of list) {
    if (!label.trim()) continue;
    if (seen.has(label)) return true;
    seen.add(label);
  }
  return false;
};

/** 剛開頁時「全部覆寫」的結果 */
function overwriteFromInitial(imported: CcfoliaCharacter, includeColor: boolean) {
  const cur = initial();
  return {
    ...cur,
    name: imported.name,
    memo: imported.memo,
    initiative: imported.initiative,
    externalUrl: imported.externalUrl,
    width: imported.width,
    commands: imported.commands,
    color: includeColor ? imported.color : cur.color,
    status: imported.status.length ? imported.status : cur.status,
    params: imported.params.length ? imported.params : cur.params,
  };
}

function importStep(step: Step): { character: CcfoliaCharacter; includeColor: boolean } {
  if (step.動作 === '讀入編輯畫面複製文字') {
    const r = parseCharacterEditScreen(step.輸入!);
    if (!r.ok) throw new Error('解析失敗');
    return { character: r.character, includeColor: false };
  }
  const r = parseCharacterClipboard(step.輸入!);
  if (!r.ok) throw new Error(r.error);
  return { character: r.character, includeColor: isCharacterColor(r.raw.color) };
}

describe('剪貼簿 JSON：附件逐字輸出', () => {
  const simple = EXAMPLES.filter(
    (e) =>
      e.步驟.length === 2 &&
      e.步驟[1].動作 === '全部覆寫' &&
      e.步驟[0].結果?.類型 === '差異確認' &&
      e.編號 !== 'E06',
  );

  it('有足夠的範例可比對', () => {
    expect(simple.length).toBeGreaterThanOrEqual(18);
  });

  for (const ex of simple) {
    it(`${ex.編號}：剛開頁讀入後全部覆寫，輸出逐字相符`, () => {
      const { character, includeColor } = importStep(ex.步驟[0]);
      if (hasDuplicateLabels(character.status) || hasDuplicateLabels(character.params)) return;
      const out = serializeCharacterClipboard(overwriteFromInitial(character, includeColor));
      expect(out).toBe(ex.預期輸出);
    });
  }

  it('剛開頁的輸出（J11 的預期輸出）：9 個欄位、2 格縮排、結尾沒有換行', () => {
    const out = serializeCharacterClipboard(initial());
    expect(out).toBe(byId('J11').預期輸出);
    expect(out.endsWith('\n')).toBe(false);
    expect(Object.keys(JSON.parse(out).data)).toEqual([...CHARACTER_EDITOR_FIELDS]);
  });

  it('J10：讀入目前的輸出（附件記為「當下輸出區的全文」）再輸出，完全相同', () => {
    const input = serializeCharacterClipboard(initial());
    const r = parseCharacterClipboard(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(serializeCharacterClipboard(r.character)).toBe(input);
  });

  it('J15：項目上的額外欄位與欄位順序保留', () => {
    const r = parseCharacterClipboard(byId('J15').步驟[0].輸入!);
    if (!r.ok) throw new Error();
    expect(Object.keys(r.character.status[0])).toEqual(['max', 'note', 'label', 'value']);
    expect(Object.keys(r.character.params[0])).toEqual(['value', 'label', 'hint']);
  });

  it('J09：型別不符用預設值；缺的鍵接在最後', () => {
    const r = parseCharacterClipboard(byId('J09').步驟[0].輸入!);
    if (!r.ok) throw new Error();
    const c = r.character;
    expect([c.name, c.memo, c.initiative, c.width, c.externalUrl, c.commands]).toEqual([
      '',
      '',
      0,
      4,
      '',
      '',
    ]);
    expect(c.status).toEqual([
      { label: 'HP', value: 0, max: 12.5 },
      { label: '', value: 0, max: 0 },
      { label: '', value: 0, max: 0 },
      { label: '', value: 0, max: 0 },
    ]);
    expect(c.params).toEqual([
      { label: 'STR', value: '' },
      { value: '無標籤', label: '' },
    ]);
    expect(Object.keys(c.params[1])).toEqual(['value', 'label']);
  });

  it('J04／J05：顏色只有 # 加 6 位十六進位才算數（大小寫照原樣）', () => {
    expect(isCharacterColor('#AABBCC')).toBe(true);
    expect(isCharacterColor('#3366cc')).toBe(true);
    for (const bad of ['', 'red', '#abc', '#11223344', '3366cc', null, 123]) {
      expect(isCharacterColor(bad)).toBe(false);
    }
    expect(normalizeCharacter({ color: '#AABBCC' }).color).toBe('#AABBCC');
    expect(normalizeCharacter({ color: '#abc' }).color).toBe(CHARACTER_DEFAULT_COLOR);
  });
});

describe('剪貼簿 JSON：四種錯誤（依序判斷）', () => {
  it('附件 J11～J14、F02', () => {
    const kinds = { J11: 'syntax', J12: 'root', J13: 'kind', J14: 'data' } as const;
    for (const [id, kind] of Object.entries(kinds)) {
      expect(parseCharacterClipboard(byId(id).步驟[0].輸入!)).toEqual({ ok: false, error: kind });
    }
    expect(parseCharacterClipboard(byId('F02').步驟[0].輸入!)).toEqual({
      ok: false,
      error: 'syntax',
    });
  });

  it('其他邊界：null、字串、數字是 root；kind 必須是字串；data 是 null 或陣列都是 data', () => {
    expect(parseCharacterClipboard('null')).toEqual({ ok: false, error: 'root' });
    expect(parseCharacterClipboard('"x"')).toEqual({ ok: false, error: 'root' });
    expect(parseCharacterClipboard('5')).toEqual({ ok: false, error: 'root' });
    expect(parseCharacterClipboard('{"kind":["character"],"data":{}}')).toEqual({
      ok: false,
      error: 'kind',
    });
    /* 語法錯誤先於其他 */
    expect(parseCharacterClipboard('{"kind":"item"')).toEqual({ ok: false, error: 'syntax' });
    expect(parseCharacterClipboard('{"kind":"character","data":null}')).toEqual({
      ok: false,
      error: 'data',
    });
    expect(parseCharacterClipboard('{"kind":"character"}')).toEqual({ ok: false, error: 'data' });
  });
});

describe('修正（規格 2.3）與欄位', () => {
  it('預設值與欄位順序', () => {
    const c = normalizeCharacter({ extra: 1, name: 'A' });
    expect(Object.keys(c)).toEqual([...CHARACTER_FIELDS, 'extra']);
    expect(c.width).toBe(CHARACTER_DEFAULT_SIZE);
    expect(c.height).toBe(CHARACTER_DEFAULT_SIZE);
    expect(c.color).toBe('#888888');
    expect(c.iconUrl).toBeNull();
    expect(c.owner).toBeNull();
    expect(c.active).toBe(true);
    expect(c.faces).toEqual([]);
  });

  it('預設值是凍結的；normalizeCharacter 每次給新的清單', () => {
    const a = normalizeCharacter({});
    a.status.push({ label: 'HP', value: 1, max: 1 });
    expect(normalizeCharacter({}).status).toEqual([]);
    expect(Object.isFrozen(CHARACTER_DEFAULTS.status)).toBe(true);
  });

  it('"5" 不是數字、Infinity 不算、布林與 null 欄位照型別', () => {
    const c = normalizeCharacter({
      initiative: '5',
      width: Number.POSITIVE_INFINITY,
      active: 'yes',
      secret: true,
      iconUrl: 7,
      owner: 'u1',
      faces: [{ label: '@笑', iconUrl: 'x.png', extra: 1 }, 'bad'],
    });
    expect(c.initiative).toBe(0);
    expect(c.width).toBe(4);
    expect(c.active).toBe(true);
    expect(c.secret).toBe(true);
    expect(c.iconUrl).toBeNull();
    expect(c.owner).toBe('u1');
    expect(c.faces).toEqual([
      { label: '@笑', iconUrl: 'x.png', extra: 1 },
      { iconUrl: null, label: '' },
    ]);
  });

  it('輸出全部 20 個欄位（fields 指定）', () => {
    const out = JSON.parse(
      serializeCharacterClipboard({ name: 'A' }, { fields: CHARACTER_FIELDS }),
    );
    expect(out.kind).toBe('character');
    expect(Object.keys(out.data)).toEqual([...CHARACTER_FIELDS]);
  });

  it('數字照 JavaScript 的 JSON 寫法（J16）', () => {
    const out = serializeCharacterClipboard({
      name: '',
      initiative: -1.5,
      status: [{ label: '護甲', value: 1e21, max: -3 }],
    });
    expect(out).toContain('"value": 1e+21');
    expect(out).toContain('"initiative": -1.5');
  });

  it('toCharacterClipboard 向下相容（原樣、不縮排）', () => {
    expect(toCharacterClipboard({ name: 'A' })).toBe('{"kind":"character","data":{"name":"A"}}');
  });

  it('存檔的檔名（規格 3.5）', () => {
    expect(characterFileName('a/b:c*?"<>|d')).toBe(`a_b_c_d${CHARACTER_FILE_EXT}`);
    expect(characterFileName('  a//\\\\b  ')).toBe('a_b.ccfolia-character.json');
    expect(characterFileName('   ')).toBe('character.ccfolia-character.json');
    expect(characterFileName('')).toBe('character.ccfolia-character.json');
    expect(characterFileName('林曉雨')).toBe('林曉雨.ccfolia-character.json');
  });
});

describe('編輯畫面複製文字（規格 2.2）', () => {
  it('E09：找不到開頭標記是錯誤；E10：只有開頭標記也算成功', () => {
    expect(parseCharacterEditScreen(byId('E09').步驟[0].輸入!)).toEqual({
      ok: false,
      error: 'marker',
    });
    const r = parseCharacterEditScreen(byId('E10').步驟[0].輸入!);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.character.name).toBe('');
      expect(r.character.width).toBe(4);
      expect(r.character.status).toEqual([]);
    }
  });

  it('E01：從最後一個開頭標記開始；x、y 有讀；聊天面板每行去頭尾空白、說明文字略過', () => {
    const r = parseCharacterEditScreen(byId('E01').步驟[0].輸入!);
    if (!r.ok) throw new Error();
    expect(r.character.name).toBe('陳志明');
    expect([r.character.x, r.character.y]).toEqual([12, -7]);
    expect(r.character.commands).toBe('CC<=70 【手槍】\n\nCC<=55 【心理學】\n1d10　手槍傷害');
    expect(r.character.memo).toBe('【PL】小芋\n退休刑警／男／52 歲\n\n口頭禪：「老子當年……」');
  });

  it('E06（修正後）：狀態標籤空白時不把「現在値」當成標籤', () => {
    const ex = byId('E06');
    const r = parseCharacterEditScreen(ex.步驟[0].輸入!);
    if (!r.ok) throw new Error();
    expect(r.character.status).toEqual([
      { label: '', value: 3, max: 5 },
      { label: 'HP', value: 12, max: 14 },
    ]);
    /* 其他欄位與舊版的預期輸出相同 */
    const want = JSON.parse(ex.預期輸出!);
    want.data.status = r.character.status;
    const out = serializeCharacterClipboard(overwriteFromInitial(r.character, false));
    expect(out).toBe(JSON.stringify(want, null, 2));
  });

  it('數字照 JavaScript 的轉換：1e1＝10、0x10＝16、12abc 與空白是預設值', () => {
    const text = [
      'キャラクター編集',
      '名前',
      'A',
      'イニシアティブ',
      '1e1',
      '駒サイズ',
      '0x10',
      'ステータス',
      'ラベル',
      'HP',
      '現在値',
      '12abc',
      '最大値',
      '',
    ].join('\r\n');
    const r = parseCharacterEditScreen(text);
    if (!r.ok) throw new Error();
    expect(r.character.initiative).toBe(10);
    expect(r.character.width).toBe(16);
    /* 空行在清理時被刪掉：最大値後面沒有行 → 0 */
    expect(r.character.status).toEqual([{ label: 'HP', value: 0, max: 0 }]);
  });
});
