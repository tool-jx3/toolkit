/**
 * scenario-cards：規格附件逐字／逐值重跑（匯入整理 I01～I08、選取建卡 S01～S11、複製文字 C01～C18、搜尋 Q01～Q08），
 * 以及 3.0 類型一覽、F33 讀取時的整理、F35 匯出檔名、F21 內文欄高度、F26 排序、F28 捲動距離、代表色對比。
 * 依第 7 節裁定修正的案例：S07（標題以碼位截斷，不留半個字）、Q07（第一次 Enter 選第 1 個）比的是修正後的結果。
 * 「CCFOLIA 資料」（D01～D18、K01）依裁定不移植，不比。
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/core/color';
import { TYPE_COLORS } from '@/tools/scenario-cards/colors';
import {
  applyProjectData,
  bodyHeight,
  CARD_TYPES,
  type Card,
  type CardType,
  cardFromSelection,
  cardText,
  cycleType,
  DEFAULT_EXPORT_NAME,
  duplicateOf,
  exportFileName,
  findMatches,
  INITIAL_PREFS,
  moveCard,
  normalizeImport,
  type ProjectData,
  pageScrollDistance,
  projectNameFromFile,
  restorePrefs,
  restoreWorkspace,
  SEARCH_START,
  type SearchCursor,
  sanitizeCards,
  searchCountText,
  searchStep,
  sortProjectNames,
  TYPE_INFO,
  takeCodePoints,
} from '@/tools/scenario-cards/logic';
import tokensCss from '@/ui/tokens.css?raw';
import EX_RAW from '../../../docs/refactor/specs/scenario-cards.examples.json?raw';

/* ---------- 附件的型別 ---------- */

type ZhType =
  | '場景'
  | '探索地點'
  | '資料'
  | 'NPC 資訊'
  | '技能成功'
  | '備忘'
  | '道具'
  | '規則'
  | 'HO1'
  | 'HO2'
  | 'HO3'
  | 'HO4';

interface ZhCard {
  類型: ZhType;
  標題: string;
  成功時標題: string;
  內文: string;
}

const ZH: Record<ZhType, CardType> = {
  場景: 'scene',
  探索地點: 'location',
  資料: 'document',
  'NPC 資訊': 'npc',
  技能成功: 'skill',
  備忘: 'memo',
  道具: 'item',
  規則: 'rule',
  HO1: 'ho1',
  HO2: 'ho2',
  HO3: 'ho3',
  HO4: 'ho4',
};

const toCard = (c: ZhCard): Card => ({
  id: 'x',
  type: ZH[c.類型],
  title: c.標題,
  extra: c.成功時標題,
  body: c.內文,
});

interface ImportCase {
  編號: string;
  檔名: string;
  檔案內容: string;
  預期內文: string;
  '預期專案名稱（匯入前專案名稱空白時）': string;
}

interface SelectionCase {
  編號: string;
  內文: string;
  選取: [number, number];
  選取的文字: string;
  選取類型: ZhType;
  預期: (ZhCard & { 不建立卡片?: undefined }) | { 不建立卡片: true; 提示: string };
}

interface CopyCase {
  編號: string;
  卡片: ZhCard;
  預期輸出: string;
}

interface SearchCase {
  編號: string;
  內文: string;
  關鍵字: string;
  輸入關鍵字後的計數: string;
  步驟: { 操作: string; 計數: string; 選取: [number, number] | '不變'; 提示?: string }[];
}

/* 附件裡有孤立的代理碼元（S07 的 \ud840），Vite 的 JSON 外掛不收，改讀原文再 JSON.parse */
const ATT = JSON.parse(EX_RAW) as {
  匯入整理: ImportCase[];
  選取建立卡片: SelectionCase[];
  複製文字: CopyCase[];
  CCFOLIA資料: { 編號: string; 卡片: ZhCard; 預期: Record<string, string> }[];
  搜尋: SearchCase[];
};

/* ---------- 3.0 類型一覽 ---------- */

describe('3.0 類型一覽', () => {
  it('十二種類型的順序、記號、頁首標示、前後綴', () => {
    expect(
      CARD_TYPES.map((t) => {
        const i = TYPE_INFO[t];
        return [i.label, i.marker, i.header, i.prefix, i.suffix];
      }),
    ).toEqual([
      ['場景', '◆', '場景描寫', '', ''],
      ['探索地點', '▼', '探索地點', '【', '】'],
      ['資料', '■', '資料', '資料：「', '」'],
      ['NPC 資訊', '◇', 'NPC 資訊', '', ''],
      ['技能成功', '●', '技能成功', '《', '》成功：'],
      ['備忘', '・', '備忘', '', ''],
      ['道具', '◈', '道具', '', ''],
      ['規則', '※', '規則', '', ''],
      ['HO1', '◎', 'HO1 秘匿', 'HO1 秘匿：', ''],
      ['HO2', '〓', 'HO2 秘匿', 'HO2 秘匿：', ''],
      ['HO3', '△', 'HO3 秘匿', 'HO3 秘匿：', ''],
      ['HO4', '❖', 'HO4 秘匿', 'HO4 秘匿：', ''],
    ]);
    expect(CARD_TYPES.filter((t) => TYPE_INFO[t].ho)).toEqual(['ho1', 'ho2', 'ho3', 'ho4']);
  });

  it('附件 D01～D18 的類型標示與記號（CCFOLIA 資料本身依裁定不移植）', () => {
    for (const d of ATT.CCFOLIA資料) {
      const t = TYPE_INFO[ZH[d.卡片.類型]];
      expect([t.header, t.marker], d.編號).toEqual([d.預期.類型標示, d.預期.記號]);
    }
  });

  it('類型循環（F16）', () => {
    expect(cycleType('scene', 1)).toBe('location');
    expect(cycleType('ho4', 1)).toBe('scene');
    expect(cycleType('scene', -1)).toBe('ho4');
    expect(cycleType('skill', -1)).toBe('npc');
  });
});

/* ---------- 3.1 匯入整理 ---------- */

describe('3.1 匯入整理（附件 I01～I08）', () => {
  it.each(ATT.匯入整理.map((c) => [c.編號, c] as const))('%s', (_, c) => {
    expect(normalizeImport(c.檔案內容)).toBe(c.預期內文);
    expect(projectNameFromFile(c.檔名)).toBe(c['預期專案名稱（匯入前專案名稱空白時）']);
  });

  it('只有空白的行不算空行；全形空白、Tab、BOM 都會被去掉', () => {
    expect(normalizeImport('﻿　\tA\n\n\n\n \nB　')).toBe('A\n\n \nB');
    expect(normalizeImport('\r\n\r\n\r\n')).toBe('');
  });

  it('專案名稱：只去掉最後一個副檔名，沒有副檔名時照原樣（去頭尾空白）', () => {
    expect(projectNameFromFile('  劇本 .txt')).toBe('劇本');
    expect(projectNameFromFile('劇本')).toBe('劇本');
    expect(projectNameFromFile('a.b.c')).toBe('a.b');
    expect(projectNameFromFile('.txt')).toBe('');
  });
});

/* ---------- 3.2 選取 → 卡片 ---------- */

describe('3.2 選取 → 卡片（附件 S01～S11）', () => {
  it.each(ATT.選取建立卡片.map((c) => [c.編號, c] as const))('%s', (id, c) => {
    const [start, end] = c.選取;
    expect(c.內文.slice(start, end), '附件的選取位置').toBe(c.選取的文字);
    const r = cardFromSelection(c.內文, start, end, ZH[c.選取類型]);
    if ('不建立卡片' in c.預期 && c.預期.不建立卡片) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe(id === 'S09' ? 'none' : 'empty');
      return;
    }
    const want = c.預期 as ZhCard;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    /* S07：第 7 節裁定以碼位截斷——這個標題只有 42 個字，不截斷（舊版在第 80 個碼元切出半個字） */
    const title = id === 'S07' ? `A${'𠀋'.repeat(41)}` : want.標題;
    expect({
      type: r.card.type,
      title: r.card.title,
      extra: r.card.extra,
      body: r.card.body,
    }).toEqual({ type: ZH[want.類型], title, extra: want.成功時標題, body: want.內文 });
  });

  it('S07 的舊版結果確實是切斷的（修正的對象）', () => {
    const s07 = ATT.選取建立卡片.find((c) => c.編號 === 'S07') as SelectionCase;
    const old = (s07.預期 as ZhCard).標題;
    expect(old.length).toBe(80);
    expect(old.charCodeAt(79)).toBe(0xd840);
  });

  it('標題最多 80 個字（碼位）：擴充 B 區漢字與表情符號不會被切成半個', () => {
    const long = `${'𠀋'.repeat(85)}\n內文`;
    const r = cardFromSelection(long, 0, long.length, 'scene');
    expect(r.ok && Array.from(r.card.title).length).toBe(80);
    expect(r.ok && r.card.title).toBe('𠀋'.repeat(80));
    expect(takeCodePoints('😀a😀', 2)).toBe('😀a');
    const s06 = ATT.選取建立卡片.find((c) => c.編號 === 'S06') as SelectionCase;
    expect(Array.from((s06.預期 as ZhCard).標題).length).toBe(80);
  });

  it('CR／CRLF 的選取也照 LF 分行；起訖顛倒也可以', () => {
    const r = cardFromSelection('  標題\r\n內文一\r內文二  ', 0, 18, 'memo');
    expect(r).toEqual({
      ok: true,
      card: { type: 'memo', title: '標題', extra: '', body: '內文一\n內文二' },
    });
    expect(cardFromSelection('甲乙', 2, 0, 'rule')).toEqual({
      ok: true,
      card: { type: 'rule', title: '甲乙', extra: '', body: '' },
    });
  });
});

/* ---------- 3.3 複製文字 ---------- */

describe('3.3 複製文字（附件 C01～C18，逐字）', () => {
  it.each(ATT.複製文字.map((c) => [c.編號, c] as const))('%s', (_, c) => {
    expect(cardText(toCard(c.卡片))).toBe(c.預期輸出);
  });

  it('每一種類型標題留空時的第一行', () => {
    const lines = CARD_TYPES.map(
      (type) => cardText({ type, title: '', extra: '', body: '' }).split('\n')[0],
    );
    expect(lines).toEqual([
      '◆場景',
      '▼【探索地點】',
      '■ 資料：「資料」',
      '◇ NPC 資訊',
      '●《技能成功》成功：',
      '・備忘',
      '◈道具',
      '※規則',
      '◎HO1 秘匿：HO1',
      '〓HO2 秘匿：HO2',
      '△HO3 秘匿：HO3',
      '❖HO4 秘匿：HO4',
    ]);
  });

  it('換類型保留第二標題但只有技能成功輸出（F20）', () => {
    const card: Card = { id: 'a', type: 'skill', title: '偵查', extra: '腳印', body: '泥地' };
    expect(cardText(card)).toBe('●《偵查》成功：腳印\n\n泥地');
    expect(cardText({ ...card, type: 'memo' })).toBe('・偵查\n\n泥地');
    expect(cardText({ ...card, type: 'memo' }).includes('腳印')).toBe(false);
  });
});

/* ---------- 3.6 搜尋 ---------- */

/** 依附件的操作推進（回傳每一步的計數與選取） */
function runSearch(c: SearchCase) {
  const matches = findMatches(c.內文, c.關鍵字);
  let cursor: SearchCursor = SEARCH_START;
  const typed = searchCountText(cursor, matches.length);
  const steps = c.步驟.map((s) => {
    let next: SearchCursor | null = null;
    if (s.操作 === '按「搜尋」') next = matches.length ? { index: 0, visited: true } : null;
    else if (s.操作 === '在搜尋欄按 Enter' || s.操作 === '按「下一個」')
      next = searchStep(cursor, matches.length, 1);
    else if (s.操作 === '在搜尋欄按 Shift＋Enter' || s.操作 === '按「上一個」')
      next = searchStep(cursor, matches.length, -1);
    else throw new Error(`未知的操作：${s.操作}`);
    if (next) cursor = next;
    const m = next ? matches[next.index] : null;
    return {
      計數: searchCountText(cursor, matches.length),
      選取: m ? [m.start, m.end] : '不變',
    };
  });
  return { typed, steps };
}

describe('3.6 搜尋（附件 Q01～Q08）', () => {
  it.each(ATT.搜尋.filter((c) => c.編號 !== 'Q07').map((c) => [c.編號, c] as const))(
    '%s',
    (_, c) => {
      const r = runSearch(c);
      expect(r.typed).toBe(c.輸入關鍵字後的計數);
      expect(r.steps).toEqual(c.步驟.map((s) => ({ 計數: s.計數, 選取: s.選取 })));
    },
  );

  it('Q07（第 7 節裁定修正）：打完關鍵字直接按 Enter 選第 1 個', () => {
    const c = ATT.搜尋.find((x) => x.編號 === 'Q07') as SearchCase;
    const r = runSearch(c);
    expect(r.typed).toBe('1 / 3');
    /* 舊版是 2 / 3、[2, 3] */
    expect(c.步驟[0]).toMatchObject({ 計數: '2 / 3', 選取: [2, 3] });
    expect(r.steps).toEqual([{ 計數: '1 / 3', 選取: [0, 1] }]);
  });

  it('不重疊、位置以 UTF-16 碼元計；空的關鍵字沒有結果', () => {
    expect(findMatches('AAAA', 'AA')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
    expect(findMatches('AAA', 'AA')).toEqual([{ start: 0, end: 2 }]);
    expect(findMatches('𠀋霧', '霧')).toEqual([{ start: 2, end: 3 }]);
    expect(findMatches('abc', '')).toEqual([]);
    expect(searchCountText(SEARCH_START, 0)).toBe('0 / 0');
  });

  it('還沒選取時按上一個選最後一個；之後在 1～N 循環', () => {
    expect(searchStep(SEARCH_START, 3, -1)).toEqual({ index: 2, visited: true });
    expect(searchStep({ index: 2, visited: true }, 3, 1)).toEqual({ index: 0, visited: true });
    expect(searchStep({ index: 0, visited: true }, 3, -1)).toEqual({ index: 2, visited: true });
    expect(searchStep(SEARCH_START, 0, 1)).toBeNull();
  });
});

/* ---------- 卡片清單 ---------- */

const cards = (ids: string): Card[] =>
  ids.split('').map((id) => ({ id, type: 'memo', title: id, extra: '', body: '' }));
const order = (list: Card[]) => list.map((c) => c.id).join('');

describe('卡片清單的操作', () => {
  it('F26：放開時插到目標卡片之前（往下拖、往上拖都一樣）', () => {
    expect(order(moveCard(cards('ABCD'), 'A', 'C'))).toBe('BACD');
    expect(order(moveCard(cards('ABCD'), 'D', 'B'))).toBe('ADBC');
    expect(order(moveCard(cards('ABCD'), 'A', 'B'))).toBe('ABCD');
    expect(order(moveCard(cards('ABCD'), 'B', 'B'))).toBe('ABCD');
    expect(order(moveCard(cards('ABCD'), 'B', 'D', 'after'))).toBe('ACDB');
    expect(order(moveCard(cards('ABCD'), 'X', 'B'))).toBe('ABCD');
  });

  it('F24：副本的標題是「原標題 副本」，其他欄位相同', () => {
    const c: Card = { id: 'a', type: 'skill', title: '偵查', extra: '腳印', body: '泥地' };
    expect(duplicateOf(c, 'b')).toEqual({ ...c, id: 'b', title: '偵查 副本' });
    expect(duplicateOf({ ...c, title: '' }, 'c').title).toBe(' 副本');
  });

  it('F28：捲動距離 max(280, 1.25 × 可見高度)', () => {
    expect(pageScrollDistance(100)).toBe(280);
    expect(pageScrollDistance(400)).toBe(500);
    expect(pageScrollDistance(401)).toBe(501);
  });
});

/* ---------- 專案 ---------- */

const CURRENT: ProjectData = {
  name: '目前的名稱',
  text: '目前的內文',
  cards: cards('Z'),
  filter: 'skill',
  newType: 'npc',
  selectionType: 'rule',
};

describe('專案（F33、F35、F37）', () => {
  it('F33：讀取時套用的內容與整理', () => {
    let n = 0;
    const next = applyProjectData(CURRENT, {
      name: '霧港',
      text: '新內文',
      cards: [
        { id: 'a', type: 'location', title: '燈塔', extra: '', body: '一樓' },
        { type: 'unknown', title: 3 },
        { id: 'a', type: 'ho2' },
        null,
      ],
      filter: 'ho1',
      newType: 'nope',
      selectionType: 'memo',
    });
    expect(next).not.toBeNull();
    const p = next as ProjectData;
    expect(p.name).toBe('霧港');
    expect(p.text).toBe('新內文');
    expect(p.filter).toBe('ho1');
    expect(p.newType).toBe('npc');
    expect(p.selectionType).toBe('memo');
    expect(p.cards.map((c) => [c.type, c.title, c.extra, c.body])).toEqual([
      ['location', '燈塔', '', '一樓'],
      ['memo', '3', '', ''],
      ['ho2', '', '', ''],
      ['memo', '', '', ''],
    ]);
    /* 識別碼缺少或重複時重新產生（清單的 key 不會撞） */
    expect(new Set(p.cards.map((c) => c.id)).size).toBe(4);
    expect(p.cards[0].id).toBe('a');
    expect(sanitizeCards([{}, {}], () => `n${++n}`).map((c) => c.id)).toEqual(['n1', 'n2']);
  });

  it('F33：沒有名稱時保留目前的、篩選認不得時「全部」、不是物件時不套用', () => {
    const p = applyProjectData(CURRENT, { filter: 'xx' }) as ProjectData;
    expect(p).toMatchObject({
      name: '目前的名稱',
      text: '',
      cards: [],
      filter: 'all',
      newType: 'npc',
      selectionType: 'rule',
    });
    expect(applyProjectData(CURRENT, [])).toBeNull();
    expect(applyProjectData(CURRENT, null)).toBeNull();
    expect(applyProjectData(CURRENT, '霧港')).toBeNull();
  });

  it('F35：匯出檔名', () => {
    expect(exportFileName('霧港的燈塔')).toBe('霧港的燈塔.json');
    expect(exportFileName('  a\\b/c:d*e?f"g<h>i|j  ')).toBe('a_b_c_d_e_f_g_h_i_j.json');
    expect(exportFileName('   ')).toBe(`${DEFAULT_EXPORT_NAME}.json`);
  });

  it('F37：自動存檔讀回時整理，格式不對時丟棄', () => {
    expect(restoreWorkspace({ name: 1, text: 'x', cards: 'bad' })).toEqual({
      name: '1',
      text: 'x',
      cards: [],
    });
    expect(restoreWorkspace([])).toBeNull();
    expect(restoreWorkspace('x')).toBeNull();
    expect(restorePrefs({ filter: 'nope', newType: 'ho4' })).toEqual({
      ...INITIAL_PREFS,
      newType: 'ho4',
    });
    expect(restorePrefs(undefined)).toBeNull();
  });

  it('已存專案用繁中排序規則（筆畫：一 1 畫、阿 8 畫、霧 19 畫；CLDR 的中文排序把漢字排在拉丁字母前）', () => {
    expect(sortProjectNames(['霧港', 'abc', '阿里山', 'ABC', '一'])).toEqual([
      '一',
      '阿里山',
      '霧港',
      'abc',
      'ABC',
    ]);
  });
});

/* ---------- F21 內文欄高度 ---------- */

describe('F21：卡片內文欄 4～6 行', () => {
  const base = { lineHeight: 20, paddingY: 12, borderY: 2 };
  it('至少 4 行、最多 6 行，超過出現捲軸', () => {
    expect(bodyHeight({ ...base, scrollHeight: 50, currentHeight: 94 })).toEqual({
      height: 94,
      scroll: false,
    });
    expect(bodyHeight({ ...base, scrollHeight: 112, currentHeight: 94 })).toEqual({
      height: 114,
      scroll: false,
    });
    expect(bodyHeight({ ...base, scrollHeight: 400, currentHeight: 114 })).toEqual({
      height: 134,
      scroll: true,
    });
  });
  it('使用者拉得比 6 行高時維持', () => {
    expect(bodyHeight({ ...base, scrollHeight: 50, currentHeight: 300 })).toEqual({
      height: null,
      scroll: true,
    });
    expect(bodyHeight({ ...base, scrollHeight: 50, currentHeight: 138 }).height).toBe(94);
  });
});

/* ---------- F17 代表色 ---------- */

function tokenBlock(selector: string): Record<string, string> {
  const start = tokensCss.indexOf(`${selector} {`);
  const body = tokensCss.slice(start, tokensCss.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

describe('F17：代表色', () => {
  const dark = tokenBlock(':root');
  const light = { ...dark, ...tokenBlock(":root[data-theme='light']") };
  for (const [theme, tokens] of [
    ['dark', dark],
    ['light', light],
  ] as const) {
    it(`${theme}：12 色互不相同，當文字用在卡片底色上對比至少 4.5:1`, () => {
      const colors = CARD_TYPES.map((t) => TYPE_COLORS[theme][t]);
      expect(new Set(colors).size).toBe(12);
      const bad = CARD_TYPES.flatMap((t) =>
        ['bg', 'surface', 'surface-2']
          .map((bg) => ({ t, bg, ratio: contrastRatio(TYPE_COLORS[theme][t], tokens[bg]) }))
          .filter((x) => x.ratio < 4.5),
      );
      expect(bad).toEqual([]);
    });
  }
});
