/**
 * 角色資料編輯器的介面文字（台灣繁體中文，用詞照 DESIGN.md 第 5 節）。
 * CCFOLIA 介面上的日文字樣（「キャラクター編集」等）照原樣寫，讓使用者對得上畫面。
 */
import type { FieldKey, ImportError, ImportSource, ItemPart, ListKey } from './logic';

/** 貼上區空白時的提示：示範用的最小角色 JSON（F01） */
const SAMPLE_JSON = `{
  "kind": "character",
  "data": {
    "name": "範例角色",
    "initiative": 10,
    "status": [{ "label": "HP", "value": 12, "max": 12 }]
  }
}`;

/** 來源名稱（差異確認與訊息裡用） */
const sourceName = (s: ImportSource): string =>
  s.kind === 'json' ? '角色 JSON' : s.kind === 'edit' ? '編輯畫面的文字' : `檔案「${s.name}」`;

const LIST_TITLES: Record<ListKey, string> = { status: '狀態', params: '參數' };

export const S = {
  /* ---- 讀入區 ---- */
  json: {
    title: '貼上角色 JSON',
    aria: '角色 JSON',
    load: '讀取角色 JSON',
    placeholder: SAMPLE_JSON,
    hint: '貼上 CCFOLIA 的角色 JSON（角色卡網站「輸出成 CCFOLIA 角色」的內容也可以），再按「讀取」。',
  },
  edit: {
    title: '貼上編輯畫面的文字',
    aria: 'CCFOLIA 編輯畫面的文字',
    load: '讀取編輯畫面的文字',
    placeholder:
      '在 CCFOLIA 房間裡打開角色的「キャラクター編集」視窗，按 Ctrl＋A 全選、Ctrl＋C 複製，再貼到這裡。前後混到房間畫面的其他文字也沒關係。',
    hint: '可以讀出名稱、先攻值、備註、棋子大小、參照網址、狀態、參數與聊天面板（不含顏色）。目前只認日文介面的 CCFOLIA。',
  },
  file: {
    title: '檔案',
    aria: '選擇角色 JSON 檔',
    load: '讀取檔案',
    save: '儲存成 JSON 檔',
    hint: '「讀取」打開電腦裡的 .json 檔；「儲存」把下方輸出的角色 JSON 存成檔案。',
    readFailed: (name: string) => `無法讀取「${name}」。`,
    saved: (name: string) => `已下載「${name}」。`,
  },
  load: '讀取',
  save: '儲存',

  source: sourceName,
  /** F10：開啟差異確認時該區的訊息 */
  loaded: (s: ImportSource) => `已讀取${sourceName(s)}，請在差異確認視窗挑選要覆寫的項目。`,
  /** F16：沒有差異 */
  noDiff: (s: ImportSource) => `${sourceName(s)}和目前的角色一模一樣，沒有需要覆寫的項目。`,
  /** F02、F07：讀入失敗 */
  errors: {
    syntax: '這不是正確的 JSON（語法有錯），請確認有沒有完整複製。',
    root: 'JSON 的最外層必須是 { } 包起來的物件。',
    kind: '這不是角色資料：kind 必須是 "character"。',
    data: '角色資料的 data 必須是 { } 包起來的物件。',
    marker:
      '找不到「キャラクター編集」這一行。請在 CCFOLIA 的角色編輯視窗裡全選，把整個視窗的文字複製過來。',
  } satisfies Record<ImportError, string>,

  /* ---- 輸出 ---- */
  output: {
    title: '輸出（角色 JSON）',
    aria: '輸出的角色 JSON',
    hint: '在 CCFOLIA 的房間畫面按 Ctrl＋V 貼上，就會新增這個角色。',
    copy: '複製',
    copied: '已複製。到 CCFOLIA 的房間畫面按 Ctrl＋V 貼上，就會新增這個角色。',
    copyFailed: '無法寫入剪貼簿，已幫你選取上面的全部文字，請按 Ctrl＋C 自行複製。',
  },

  /* ---- 重設 ---- */
  reset: {
    button: '重設',
    title: '重設角色？',
    body: '目前編輯的內容會全部丟掉，回到剛開頁的樣子。兩個貼上區的文字不會清除。',
    cancel: '取消',
    confirm: '確定重設',
  },

  /* ---- 表單 ---- */
  form: {
    basics: '角色資料',
    name: '名稱',
    initiative: '先攻值',
    initiativeHint: 'CCFOLIA 依先攻值排列角色清單。',
    externalUrl: '參照網址',
    externalUrlHint: '通常是角色卡的網址。',
    color: '顏色',
    colorHint: '發言時名稱的顏色。可以打 3 位或 6 位色碼。',
    colorCode: '色碼',
    colorPicker: '名稱顏色',
    chatPreview: '聊天欄顯示',
    chatPreviewAria: '在 CCFOLIA 深色聊天欄裡的樣子',
    memo: '備註',
    memoHint: '顯示在名稱下方的文字，常用來寫 PL 名與簡介。',
    width: '棋子大小',
    widthUnit: '格',
  },

  /** 清單（狀態、參數） */
  lists: {
    status: {
      title: LIST_TITLES.status,
      description: '會變動的數值（HP、MP、SAN…），在盤面上顯示成狀態條。',
      columns: ['標籤', '目前值', '最大值'],
    },
    params: {
      title: LIST_TITLES.params,
      description: '很少變動的數值或文字（能力值、技能…）。',
      columns: ['標籤', '值'],
    },
  } satisfies Record<ListKey, { title: string; description: string; columns: string[] }>,
  add: '新增',
  addTo: (list: ListKey) => `新增${LIST_TITLES[list]}`,
  /** 列的名稱：標籤，空白時用「狀態 2」 */
  rowName: (list: ListKey, label: string, index: number) =>
    label.trim() ? label : `${LIST_TITLES[list]} ${index + 1}`,
  cell: (list: ListKey, index: number, column: string) =>
    `${LIST_TITLES[list]} ${index + 1}：${column}`,
  remove: (name: string) => `刪除「${name}」`,
  drag: (name: string) => `拖曳排序：${name}`,
  dragRole: '拖曳把手',
  dragHint: '按住拖曳到另一列上放開，可以調整順序（也可以聚焦後按 Alt＋↑／↓）。',
  emptyList: (list: ListKey) => `沒有${LIST_TITLES[list]}。按「新增」加一列。`,

  /* ---- 聊天面板 ---- */
  commands: {
    title: '聊天面板',
    description: '一行一個指令（例：CC<=60 【偵查】）。{標籤} 會換成同名狀態或參數的值。',
    aria: '聊天面板',
    refsAria: '插入引用',
    refHint: '插入到聊天面板的游標位置',
    refEmpty: '狀態或參數填了標籤之後，這裡會出現可以一鍵插入的 {標籤} 按鈕。',
  },

  /* ---- 差異確認 ---- */
  diff: {
    title: '差異確認',
    source: (s: ImportSource) => `來源：${sourceName(s)}`,
    selectAll: '全部勾選',
    selectNone: '全部取消勾選',
    applySelected: '覆寫勾選的項目',
    applyAll: '全部覆寫',
    current: '目前',
    incoming: '匯入',
    empty: '（空）',
    blankLabel: '（空白標籤）',
    count: (selected: number, total: number) => `已勾選 ${selected}／${total} 項`,
    groupAria: (list: ListKey) => `${LIST_TITLES[list]}的差異`,
    parts: {
      label: '標籤',
      value: '值',
      max: '最大值',
    } satisfies Record<ItemPart, string>,
    statusValues: '目前值／最大值',
  },
  noDiffDialog: {
    title: '沒有差異',
    ok: '確定',
  },

  /** 差異清單裡一般欄位的名稱 */
  fields: {
    name: '名稱',
    initiative: '先攻值',
    externalUrl: '參照網址',
    color: '顏色',
    memo: '備註',
    width: '棋子大小',
    commands: '聊天面板',
  } satisfies Record<FieldKey, string>,
} as const;

/** 使用說明（頁首「說明」） */
export const USAGE_STEPS = [
  '在左邊貼上角色 JSON、CCFOLIA 編輯畫面的文字，或讀取 .json 檔，按「讀取」。',
  '差異確認視窗會逐項列出「目前 → 匯入」的不同；勾選要覆寫的項目，或直接「全部覆寫」。',
  '在右邊的表單修改名稱、顏色、狀態、參數與聊天面板；狀態與參數可以拖曳左邊的把手調整順序。',
  '按「複製」後到 CCFOLIA 的房間畫面按 Ctrl＋V 貼上，就會新增這個角色；也可以「儲存」成檔案留著下次讀取。',
] as const;

export const USAGE_NOTES = [
  '資料只在這個瀏覽器分頁裡處理，不會上傳，也不會保存；重新整理後會回到新角色。',
  '輸出只包含這裡能編輯的欄位，頭像、差分、座標等貼進 CCFOLIA 時由 CCFOLIA 補上預設值。',
] as const;
