/**
 * character-editor 規格附件（docs/refactor/specs/character-editor.examples.json）的讀取與預期值。
 * 單元測試（純邏輯）與 e2e（實際畫面）共用：E06 依規格第 7 節裁定換成修正後的預期
 * （狀態標籤空白時不再把「現在値」當成標籤），其他 33 組照附件逐字比對。
 * 附件本身由呼叫端讀進來（單元測試用 JSON import、e2e 用 readFileSync），這裡只處理內容。
 */
export type ItemRecord = Record<string, string | string[]>;
export type RowTitle = string | { 空白標籤: true };

export interface DiffRecord {
  欄位: string;
  列名?: RowTitle;
  目前: string | ItemRecord | null;
  匯入: string | ItemRecord | null;
}

export interface ExampleStep {
  動作: string;
  輸入?: string;
  檔名?: string;
  項目?: { 欄位: string; 列名?: RowTitle }[];
  結果?: {
    類型: '差異確認' | '沒有差異' | '錯誤';
    來源?: string | { 檔案: string };
    原因?: string;
    差異清單?: DiffRecord[];
  };
}

export interface Example {
  編號: string;
  說明: string;
  步驟: ExampleStep[];
  預期輸出: string;
}

/** 附件的範例清單（傳入整份附件 JSON） */
export const examplesOf = (attachment: unknown): Example[] =>
  (attachment as { 範例: Example[] }).範例;

/** 依編號取範例 */
export const findExample = (examples: readonly Example[], id: string): Example => {
  const ex = examples.find((e) => e.編號 === id);
  if (!ex) throw new Error(`附件沒有 ${id}`);
  return ex;
};

/** 附件「原因」→ 錯誤種類（logic.ts 的 ImportError） */
export const REASON_KINDS: Record<string, 'syntax' | 'root' | 'kind' | 'data' | 'marker'> = {
  語法錯誤: 'syntax',
  最外層不是物件: 'root',
  'kind 不是 character': 'kind',
  'data 不是物件': 'data',
  找不到編輯畫面的開頭標記: 'marker',
};

/** 附件「讀入 JSON」的特殊輸入：讀入當下輸出區的全文（J10） */
export const CURRENT_OUTPUT = '（當下輸出區的全文）';

/** E06 修正後的狀態差異（初始空白列配對第 1 項的空白標籤狀態，HP 附加在後面） */
const E06_STATUS: DiffRecord[] = [
  {
    欄位: 'status',
    列名: { 空白標籤: true },
    目前: { 標籤: '', 目前值: '0', 最大值: '0', 標示變更: ['目前值', '最大值'] },
    匯入: { 標籤: '', 目前值: '3', 最大值: '5', 標示變更: ['目前值', '最大值'] },
  },
  {
    欄位: 'status',
    列名: 'HP',
    目前: null,
    匯入: { 標籤: 'HP', 目前值: '12', 最大值: '14', 標示變更: ['標籤', '目前值', '最大值'] },
  },
];

/** 比對用的預期：步驟（含差異清單）與最後的輸出全文（E06 換成修正後的預期） */
export function expectedFor(ex: Example): { steps: ExampleStep[]; output: string } {
  if (ex.編號 !== 'E06') return { steps: ex.步驟, output: ex.預期輸出 };
  const steps = structuredClone(ex.步驟);
  const result = steps[0].結果;
  if (!result?.差異清單) throw new Error('E06 的格式不符');
  const at = result.差異清單.findIndex((r) => r.欄位 === 'status');
  const rest = result.差異清單.filter((r) => r.欄位 !== 'status');
  rest.splice(at, 0, ...E06_STATUS);
  result.差異清單 = rest;
  const out = JSON.parse(ex.預期輸出);
  out.data.status = [
    { label: '', value: 3, max: 5 },
    { label: 'HP', value: 12, max: 14 },
  ];
  return { steps, output: JSON.stringify(out, null, 2) };
}

/** 差異列的比對鍵（欄位＋列名），勾選步驟用 */
export const rowMatches = (rec: DiffRecord, pick: { 欄位: string; 列名?: RowTitle }): boolean =>
  rec.欄位 === pick.欄位 &&
  (pick.列名 === undefined || JSON.stringify(rec.列名) === JSON.stringify(pick.列名));
