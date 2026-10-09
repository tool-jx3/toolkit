/**
 * CoC 房規表產生器的純邏輯：規則清單、預設集（與原作逐條相同）、讀檔整理、表的模型、純文字與 Markdown
 * （與原作的輸出骨架相同，見 tests/helpers/houseRulesSkeleton.ts）、檔名、修改動作。
 * 原作的對照資料在 tests/unit/fixtures/house-rules-upstream.json（本機開原作頁面產生）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCustom,
  removeCustom,
  runPreset,
  setCustomText,
  setNumber,
  setRuleName,
  setVisible,
  toggleCategory,
  toggleCustomValue,
  toggleOption,
} from '@/tools/house-rules/actions';
import {
  applyPreset,
  blankData,
  buildModel,
  categoryCount,
  fileBase,
  type HouseRulesData,
  hasNotes,
  hasRows,
  initialData,
  sanitizeData,
} from '@/tools/house-rules/model';
import {
  CATEGORY_NAMES,
  EDITION_SECTIONS,
  SECTION_BY_ID,
  SECTIONS,
  type SectionId,
} from '@/tools/house-rules/rules';
import { useRules, useView } from '@/tools/house-rules/store';
import { OUT } from '@/tools/house-rules/strings';
import { mdCell, mdLine, toMarkdown, toText } from '@/tools/house-rules/text';
import { markdownSkeleton, textSkeleton } from '../helpers/houseRulesSkeleton';
import upstream from './fixtures/house-rules-upstream.json';

type PresetRows = Record<string, Record<string, { val: string | null; vis: boolean; n?: number }>>;
const UP = upstream as unknown as {
  presets: Record<'raw' | 'pop' | 'clearAfterPop', PresetRows>;
  cases: {
    name: string;
    state: unknown;
    empty: boolean;
    outputs?: Record<string, string[]>;
    png?: Record<'wide' | 'narrow', [number, number]>;
  }[];
};

const DATE = '2026-10-09';

function rowsOf(d: HouseRulesData): PresetRows {
  const out: PresetRows = {};
  for (const sec of SECTIONS) {
    out[sec.id] = {};
    for (const [id, row] of Object.entries(d.secs[sec.id].rows))
      out[sec.id][id] = {
        val: row.val,
        vis: row.vis,
        ...(row.n !== undefined ? { n: row.n } : {}),
      };
  }
  return out;
}

describe('規則清單（rules.ts）', () => {
  it('三組規則：6 版 37 條、7 版 36 條、各版通用 13 條；id 在同一組裡不重複', () => {
    expect(SECTIONS.map((s) => [s.id, s.rules.length])).toEqual([
      ['6', 37],
      ['7', 36],
      ['common', 13],
    ]);
    for (const s of SECTIONS) expect(new Set(s.rules.map((r) => r.id)).size).toBe(s.rules.length);
  });

  it('規則與原作的 id 一一對應（同一份對照資料的每一條都在、沒有多的）', () => {
    for (const s of SECTIONS)
      expect(s.rules.map((r) => r.id).sort()).toEqual(Object.keys(UP.presets.raw[s.id]).sort());
  });

  it('每條規則：分類在該組裡、規則書與常見的值是選項之一、最後一個選項是 ※', () => {
    for (const s of SECTIONS)
      for (const r of s.rules) {
        expect(s.cats).toContain(r.cat);
        const ids = r.opts.map((o) => o.id);
        expect(ids).toContain(r.raw);
        expect(ids).toContain(r.pop);
        expect(ids.at(-1)).toBe('m');
        expect(new Set(ids).size).toBe(ids.length);
        expect(r.name.trim()).toBe(r.name);
        for (const o of r.opts)
          if (o.num) {
            expect(o.label).toContain('{n}');
            expect(o.num.def).toBeGreaterThanOrEqual(o.num.min);
            expect(o.num.def).toBeLessThanOrEqual(o.num.max);
          }
      }
  });

  it('分類名稱都有；版本對應的區塊', () => {
    for (const s of SECTIONS) for (const c of s.cats) expect(CATEGORY_NAMES[c]).toBeTruthy();
    expect(EDITION_SECTIONS).toEqual({
      '6': ['6', 'common'],
      '7': ['7', 'common'],
      both: ['6', '7', 'common'],
    });
  });
});

describe('預設集（與原作逐條相同）', () => {
  it('照規則書', () => {
    expect(rowsOf(applyPreset(blankData(DATE), 'raw'))).toEqual(UP.presets.raw);
  });
  it('線上團常見', () => {
    expect(rowsOf(applyPreset(blankData(DATE), 'pop'))).toEqual(UP.presets.pop);
  });
  it('全部清空（套在線上團常見之後：值清空、放不放進表不變）', () => {
    const d = applyPreset(applyPreset(blankData(DATE), 'pop'), 'clear');
    expect(rowsOf(d)).toEqual(UP.presets.clearAfterPop);
  });
  it('套用預設集保留改過的名稱、注記（全部清空才清注記）與自己加的規則', () => {
    let d = initialData(DATE);
    d.secs['7'].rows.push = { ...d.secs['7'].rows.push, name: '再試一次', note: '限一次' };
    d.secs['7'].custom.push({
      id: 'c1',
      cat: 'check',
      name: '自訂',
      val: 'x',
      text: '',
      note: 'n',
      vis: false,
    });
    d = applyPreset(d, 'pop');
    expect(d.secs['7'].rows.push).toMatchObject({ name: '再試一次', note: '限一次', val: 'o' });
    expect(d.secs['7'].custom).toHaveLength(1);
    d = applyPreset(d, 'clear');
    expect(d.secs['7'].rows.push).toMatchObject({ name: '再試一次', note: '', val: null });
    expect(d.secs['7'].custom[0]).toMatchObject({ val: 'x', note: 'n', vis: false });
  });
  it('開頁的表：7 版、照規則書、今天的日期、其他欄位空白', () => {
    const d = initialData(DATE);
    expect(d.edition).toBe('7');
    expect(d.info).toEqual({
      title: '',
      kp: '',
      system: '',
      scenario: '',
      date: DATE,
      remarks: '',
    });
    expect(rowsOf(d)).toEqual(UP.presets.raw);
  });
});

describe('讀檔整理（sanitizeData）', () => {
  it('不是物件時是 null；空物件是開頁的表', () => {
    expect(sanitizeData(null)).toBeNull();
    expect(sanitizeData('x')).toBeNull();
    expect(sanitizeData([])).toBeNull();
    expect(sanitizeData({}, DATE)).toEqual(initialData(DATE));
  });

  it('原作的存檔內容（state）可以直接讀：值、注記、改名、自訂規則都照讀', () => {
    const c = UP.cases.find((x) => x.name === 'pop-both');
    const d = sanitizeData(c?.state, DATE);
    expect(d?.edition).toBe('both');
    expect(d?.secs['7'].rows.chase.name).toBe('追逐戰');
    expect(d?.secs['6'].rows.reroll).toMatchObject({ val: 'each', n: 5 });
    expect(d?.secs.common.custom.map((x) => x.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  });

  it('壞掉的欄位用預設值：不認得的版本、選項、規則、分類；數字夾到範圍；長度截斷', () => {
    const d = sanitizeData(
      {
        edition: 8,
        info: { title: 'x'.repeat(300), kp: 5, date: '2026/10/09', remarks: 'r' },
        secs: {
          '6': {
            rows: {
              cmd: { val: 'nope', note: 'n', vis: true },
              reroll: { val: 'each', n: 1000, vis: true },
              skillcap: { val: 'cap', n: '12.6', vis: 'yes' },
              unknown: { val: 'o', vis: true },
              special: { val: null, vis: false, name: '  特殊成功  ' },
            },
            custom: [
              { id: 'a', cat: 'dice', name: '別區的分類', val: 'o' },
              { id: 'b', cat: 'check', name: '好的', val: 'zzz', note: 3 },
              { id: 'b', cat: 'check', name: '重複的 id', val: 'text', text: 't' },
              'bad',
            ],
          },
          common: { rows: 'bad', custom: 'bad' },
        },
      },
      DATE,
    );
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.edition).toBe('7');
    expect(d.info.title).toHaveLength(120);
    expect(d.info.kp).toBe('');
    expect(d.info.date).toBe(DATE);
    expect(d.info.remarks).toBe('r');
    expect(d.secs['6'].rows.cmd).toMatchObject({ val: 'ccb', note: 'n', vis: true });
    expect(d.secs['6'].rows.reroll).toMatchObject({ val: 'each', n: 99 });
    expect(d.secs['6'].rows.skillcap).toMatchObject({ val: 'cap', n: 13, vis: true });
    expect(d.secs['6'].rows).not.toHaveProperty('unknown');
    /* 和原本的名稱一樣（去頭尾空白後）時不算改名 */
    expect(d.secs['6'].rows.special).toEqual({ val: null, note: '', vis: false });
    expect(d.secs['6'].custom.map((c) => c.name)).toEqual(['好的', '重複的 id']);
    expect(d.secs['6'].custom[0]).toMatchObject({ val: null, note: '', vis: true });
    expect(d.secs['6'].custom[1].id).not.toBe('b');
    expect(d.secs.common).toEqual(initialData(DATE).secs.common);
  });

  it('自訂規則每區最多 200 條', () => {
    const custom = Array.from({ length: 250 }, (_, i) => ({
      id: `c${i}`,
      cat: 'dice',
      name: `${i}`,
    }));
    const d = sanitizeData({ secs: { common: { custom } } }, DATE);
    expect(d?.secs.common.custom).toHaveLength(200);
  });
});

describe('表的模型與輸出', () => {
  it('表頭資訊：空白的不寫；規則系統空白時寫版本；日期寫成 YYYY.MM.DD；標題空白時「房規表」', () => {
    const d = initialData(DATE);
    expect(buildModel(d)).toMatchObject({
      title: OUT.defaultTitle,
      meta: [
        ['規則系統', 'CoC 7 版'],
        ['更新日期', '2026.10.09'],
      ],
      remarks: '',
    });
    d.info = {
      title: '  週五團 ',
      kp: ' 阿明 ',
      system: '',
      scenario: '劇本',
      date: '',
      remarks: ' 備註 \n',
    };
    d.edition = 'both';
    expect(buildModel(d)).toMatchObject({
      title: '週五團',
      meta: [
        ['KP', '阿明'],
        ['規則系統', 'CoC 6 版／7 版'],
        ['適用劇本', '劇本'],
      ],
      remarks: '備註',
    });
    d.edition = '6';
    d.info.system = '自訂系統';
    expect(buildModel(d).meta[1]).toEqual(['規則系統', '自訂系統']);
  });

  it('只列放進表的列；沒有列的分類、區塊不出現；值的種類', () => {
    const d = initialData(DATE);
    const m = buildModel(d);
    expect(m.sections.map((s) => s.title)).toEqual(['CoC 7 版', '各版通用']);
    expect(m.sections[0].cats.map((c) => c.title)).toEqual([
      '檢定與技能',
      '理智與瘋狂',
      '戰鬥',
      '傷害與治療',
      '成長與獎勵',
      '建立調查員',
    ]);
    expect(m.sections[0].cats[0].rows).toEqual([
      { name: '孤注一擲', value: '○', kind: 'o', note: '' },
      { name: '消耗幸運', value: '×', kind: 'x', note: '' },
    ]);
    expect(m.sections[1].tone).toBe('common');
    expect(hasRows(m)).toBe(true);
    expect(hasNotes(m)).toBe(false);
  });

  for (const c of UP.cases) {
    it(`與原作相同的輸出骨架：${c.name}`, () => {
      const d = sanitizeData(c.state, DATE);
      expect(d).not.toBeNull();
      if (!d) return;
      const m = buildModel(d);
      expect(hasRows(m)).toBe(!c.empty);
      if (c.empty || !c.outputs) return;
      for (const [key, skel] of Object.entries(c.outputs)) {
        const [fmt, notes, legend] = key.split('|');
        const opts = { notes: notes === 'notes', legend: legend === 'legend' };
        const out = fmt === 'txt' ? toText(m, opts) : toMarkdown(m, opts);
        expect(fmt === 'txt' ? textSkeleton(out) : markdownSkeleton(out), key).toEqual(skel);
      }
    });
  }

  it('純文字的完整格式', () => {
    const d = initialData(DATE);
    d.info.kp = '阿明';
    d.info.remarks = '第一行\n\n\n\n第二行';
    d.secs['7'].rows.push.note = '只限一次\n要說明理由';
    for (const sec of SECTIONS)
      for (const id of Object.keys(d.secs[sec.id].rows)) d.secs[sec.id].rows[id].vis = false;
    d.secs['7'].rows.push.vis = true;
    d.secs['7'].rows.skillcap = { val: 'cap', n: 75, note: '', vis: true };
    expect(toText(buildModel(d))).toBe(
      [
        '【房規表】',
        'KP：阿明',
        '規則系統：CoC 7 版',
        '更新日期：2026.10.09',
        '',
        '■ CoC 7 版',
        '◆ 檢定與技能',
        '・孤注一擲：○',
        '　└ 只限一次',
        '　　要說明理由',
        '◆ 建立調查員',
        '・技能上限：75% 為止',
        '',
        '■ 其他備註',
        '第一行',
        '',
        '第二行',
        '',
        '○ 採用　× 不採用　※ 有修改（見注記）',
        '',
      ].join('\n'),
    );
    expect(toText(buildModel(d), { notes: false, legend: false })).toBe(
      [
        '【房規表】',
        'KP：阿明',
        '規則系統：CoC 7 版',
        '更新日期：2026.10.09',
        '',
        '■ CoC 7 版',
        '◆ 檢定與技能',
        '・孤注一擲：○',
        '◆ 建立調查員',
        '・技能上限：75% 為止',
        '',
        '■ 其他備註',
        '第一行',
        '',
        '第二行',
        '',
      ].join('\n'),
    );
  });

  it('Markdown 的完整格式與跳脫', () => {
    const d = initialData(DATE);
    d.info.title = '*週五*團';
    for (const sec of SECTIONS)
      for (const id of Object.keys(d.secs[sec.id].rows)) d.secs[sec.id].rows[id].vis = false;
    d.secs['7'].rows.push = { val: 'm', note: 'a|b\nc', vis: true, name: '孤注_一擲' };
    expect(toMarkdown(buildModel(d))).toBe(
      [
        '# \\*週五\\*團',
        '',
        '**規則系統**：CoC 7 版  ',
        '**更新日期**：2026.10.09',
        '',
        '## CoC 7 版',
        '',
        '### 檢定與技能',
        '',
        '| 規則 | 設定 | 注記 |',
        '| --- | :---: | --- |',
        '| 孤注\\_一擲 | ※ | a\\|b<br>c |',
        '',
        '> ○ 採用　× 不採用　※ 有修改（見注記）',
        '',
      ].join('\n'),
    );
    /* 沒有注記或不包含注記時沒有注記欄 */
    expect(toMarkdown(buildModel(d), { notes: false })).toContain(
      '| 規則 | 設定 |\n| --- | :---: |\n',
    );
    expect(mdLine('a<b>[c]`#')).toBe('a\\<b\\>\\[c\\]\\`\\#');
    expect(mdCell('x\r\ny')).toBe('x<br>y');
  });

  it('自訂規則：名稱空白「新規則」、自由填寫空白「—」、未設定「—」', () => {
    const d = initialData(DATE);
    d.secs.common.custom = [
      { id: 'a', cat: 'dice', name: ' ', val: 'text', text: ' 每人一顆 ', note: '', vis: true },
      { id: 'b', cat: 'dice', name: 'B', val: 'text', text: '  ', note: '', vis: true },
      { id: 'c', cat: 'dice', name: 'C', val: null, text: '', note: '', vis: true },
      { id: 'd', cat: 'dice', name: 'D', val: 'm', text: '', note: ' x ', vis: true },
    ];
    const rows = buildModel(d).sections[1].cats[0].rows.slice(2);
    expect(rows).toEqual([
      { name: '新規則', value: '每人一顆', kind: 'text', note: '' },
      { name: 'B', value: '—', kind: 'unset', note: '' },
      { name: 'C', value: '—', kind: 'unset', note: '' },
      { name: 'D', value: '※', kind: 'm', note: 'x' },
    ]);
  });

  it('檔名：標題（空白時「房規表」）＋更新日期（沒填時今天）', () => {
    const d = initialData(DATE);
    expect(fileBase(d)).toBe('房規表_20261009');
    d.info.title = ' 週五 團/房規?  ';
    expect(fileBase(d)).toBe('週五_團房規_20261009');
    d.info.date = '';
    expect(fileBase(d, new Date(2027, 0, 5))).toBe('週五_團房規_20270105');
  });
});

describe('修改動作（store）', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    useRules.getState().replace(initialData(DATE));
    useRules.temporal.getState().clear();
    useView.getState().reset();
    step();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  /** 隔開兩次修改（400 ms 內的連續修改算同一步復原） */
  const step = () => vi.advanceTimersByTime(1000);
  const row = (sec: SectionId, id: string) => useRules.getState().data.secs[sec].rows[id];

  it('點選項：選別的＝設定並放進表；再點一次已選的＝未設定（放不放進表不變）', () => {
    expect(row('7', 'fumble7')).toMatchObject({ val: 'raw', vis: false });
    toggleOption('7', 'fumble7', 'f100');
    expect(row('7', 'fumble7')).toMatchObject({ val: 'f100', vis: true });
    toggleOption('7', 'fumble7', 'f100');
    expect(row('7', 'fumble7')).toMatchObject({ val: null, vis: true });
  });

  it('帶數字的選項：還沒有數字時用預設值；數字在同一條規則的數字選項之間共用；改數字夾到範圍', () => {
    toggleOption('6', 'reroll', 'total');
    expect(row('6', 'reroll')).toMatchObject({ val: 'total', n: 3 });
    setNumber('6', 'reroll', 150);
    expect(row('6', 'reroll').n).toBe(99);
    toggleOption('6', 'reroll', 'each');
    expect(row('6', 'reroll')).toMatchObject({ val: 'each', n: 99 });
    setNumber('6', 'reroll', -3.4);
    expect(row('6', 'reroll').n).toBe(0);
    toggleOption('6', 'reroll', 'none');
    setNumber('6', 'reroll', 5);
    expect(row('6', 'reroll').n).toBe(0);
  });

  it('改名：空白或和原本一樣時回到原本的名稱', () => {
    setRuleName('7', 'push', '再擲一次');
    expect(row('7', 'push').name).toBe('再擲一次');
    setRuleName('7', 'push', ' 孤注一擲 ');
    expect(row('7', 'push').name).toBeUndefined();
    setRuleName('7', 'push', 'x');
    setRuleName('7', 'push', '   ');
    expect(row('7', 'push').name).toBeUndefined();
  });

  it('分類全部放進／拿掉（含自己加的）；數量', () => {
    const id = addCustom('7', 'check');
    expect(id).toBeTruthy();
    setVisible('7', id as string, true, false);
    expect(categoryCount(useRules.getState().data, '7', 'check')).toEqual({ shown: 2, total: 5 });
    toggleCategory('7', 'check');
    expect(categoryCount(useRules.getState().data, '7', 'check')).toEqual({ shown: 5, total: 5 });
    toggleCategory('7', 'check');
    expect(categoryCount(useRules.getState().data, '7', 'check')).toEqual({ shown: 0, total: 5 });
  });

  it('自己加的規則：預設 ○、放進表、加在最後；收合的分類展開；自由填寫；刪除；可以復原', () => {
    useView.getState().update((v) => {
      v.collapsed['common:dice'] = true;
    });
    const id = addCustom('common', 'dice') as string;
    expect(useView.getState().data.collapsed['common:dice']).toBeUndefined();
    const custom = () => useRules.getState().data.secs.common.custom;
    expect(custom()).toEqual([
      { id, cat: 'dice', name: '', val: 'o', text: '', note: '', vis: true },
    ]);
    toggleCustomValue('common', id, 'text');
    setCustomText('common', id, '自由');
    expect(custom()[0]).toMatchObject({ val: 'text', text: '自由' });
    toggleCustomValue('common', id, 'text');
    expect(custom()[0].val).toBeNull();
    step();
    removeCustom('common', id);
    expect(custom()).toEqual([]);
    useRules.temporal.getState().undo();
    expect(custom()).toHaveLength(1);
  });

  it('套用預設集是一步復原', () => {
    toggleOption('7', 'push', 'x');
    step();
    runPreset('pop');
    expect(row('7', 'luckspend').val).toBe('o');
    useRules.temporal.getState().undo();
    expect(row('7', 'luckspend').val).toBe('x');
    expect(row('7', 'push').val).toBe('x');
  });

  it('區塊的規則都在存檔裡（每條內建規則都有一列）', () => {
    const d = useRules.getState().data;
    for (const s of SECTIONS)
      expect(Object.keys(d.secs[s.id].rows).sort()).toEqual(
        SECTION_BY_ID[s.id].rules.map((r) => r.id).sort(),
      );
  });
});
