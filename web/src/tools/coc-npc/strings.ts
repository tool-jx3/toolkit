/**
 * CoC NPC 產生器的介面文字（繁中；用詞照 DESIGN.md 第 5 節）。
 * `OUT` 是會寫進輸出（CCFOLIA 角色 JSON、聊天面板）的字，改了會影響使用者在指令裡的 {名稱} 參照。
 */
import { DICE_LIMITS, type DiceParseError } from '@/core/coc';

/** 輸出用的字（與舊版的繁中輸出相同） */
export const OUT = {
  /** 7 版的體格（params 與聊天面板的 //體格=） */
  build: '體格',
  /** 7 版的移動力標籤 */
  mov7: 'MOV',
  /** 6 版的移動力標籤 */
  mov6: '移動力',
  /** 聊天面板第一行的 SAN 檢定名稱 */
  sanRoll: '理智檢定',
  /** 名稱空白時的替代名稱（清單與 CCFOLIA 輸出） */
  unnamed: '無名氏',
  /** 新增 NPC 時的預設名稱 */
  defaultName: '新 NPC',
};

export const S = {
  list: {
    title: 'NPC 清單',
    aria: 'NPC 清單',
    add: '新增 NPC',
    addShort: '新增',
    badge: (edition: number) => `${edition} 版`,
    remove: (name: string) => `刪除「${name}」`,
    current: (name: string) => `編輯中：${name}`,
  },
  basic: {
    title: '基本資料',
    name: '名稱',
    namePlaceholder: 'NPC 名稱',
    edition: '版本',
    editionHint: '切換時 HP、MP、SAN、DB 等衍生值會重新計算（屬性的值不會換算）。',
    editions: { 7: '7 版', 6: '6 版' } as Record<7 | 6, string>,
  },
  abilities: {
    title: '屬性',
    description:
      '在算式欄寫骰子算式（例：3D6、2D6+6），按骰子鈕擲那一項，或按「全部擲骰」。7 版的結果會自動 ×5。',
    expr: (stat: string) => `${stat} 的算式`,
    value: (stat: string) => `${stat} 的值`,
    roll: (stat: string) => `${stat} 擲骰`,
    rollAll: '全部擲骰',
    errors: {
      empty: '',
      syntax: '看不懂這個算式（例：3D6、2D6+6；7 版不用寫 ×5）',
      zero: '骰子數與面數都要 1 以上',
      'too-many': `一次最多擲 ${DICE_LIMITS.maxDice} 顆骰子`,
      'too-large': `面數最多 ${DICE_LIMITS.maxSides}、常數最多 ${DICE_LIMITS.maxConstant}`,
    } satisfies Record<DiceParseError, string>,
    rolledWithErrors: (stats: readonly string[]) =>
      `${stats.join('、')} 的算式看不懂，沒有擲；其他的已經擲好。`,
  },
  derived: {
    title: '衍生值',
    description: '由屬性自動計算，也可以直接改（改屬性或版本時會重新計算）。',
    san: '輸出 SAN',
    sanHint: '關掉時 CCFOLIA 的狀態、聊天面板都不放 SAN 與理智檢定。',
    hp: 'HP',
    mp: 'MP',
    sanValue: 'SAN',
    db: 'DB',
    build: '體格',
    movPlaceholder: '—',
    movHint: '空白時不輸出。',
  },
  skills: {
    title: '技能',
    check: '檢定指令',
    checkHint:
      '6 版聊天面板的檢定指令：CC 是 1% 規則（1 大成功、100 大失敗），CCB 是 5% 規則（1～5 大成功、96～100 大失敗）。',
    name: (i: number) => `技能 ${i}：名稱`,
    value: (i: number) => `技能 ${i}：成功率`,
    namePlaceholder: '技能名稱',
    remove: (i: number) => `刪除技能 ${i}`,
    add: '新增技能',
    empty: '還沒有技能。',
    hint: '名稱空白的技能不輸出。',
  },
  commands: {
    title: '指令／傷害',
    name: (i: number) => `指令 ${i}：名稱`,
    expr: (i: number) => `指令 ${i}：算式`,
    namePlaceholder: '名稱',
    exprPlaceholder: '1D6+2+DB',
    remove: (i: number) => `刪除指令 ${i}`,
    add: '新增指令',
    empty: '還沒有指令。',
    hint: '算式裡的 DB（或 db）會換成 {DB}，在 CCFOLIA 裡參照這個 NPC 的 DB。算式空白的指令不輸出。',
  },
  memo: {
    title: '備註',
    placeholder: '自由填寫（會放進 CCFOLIA 角色的備註）',
  },
  output: {
    kind: '輸出內容',
    json: 'CCFOLIA',
    palette: '聊天面板',
    jsonTitle: '角色 JSON',
    paletteTitle: '聊天面板',
    jsonHint: '複製後在 CCFOLIA 的房間畫面按 Ctrl＋V（Mac 為 ⌘＋V）貼上，就會新增這個角色。',
    paletteHint: '貼到 CCFOLIA 角色的聊天面板（チャットパレット）。',
    copy: '複製',
    copied: '已複製到剪貼簿',
    rollCopy: '擲骰並複製',
    rollCopied: '已全部擲骰並複製到剪貼簿',
    rollCopiedSkipped: (stats: readonly string[]) =>
      `${stats.join('、')} 的算式看不懂，沒有擲；複製的是其他項目擲好之後的內容。`,
    copyFailed: '無法寫入剪貼簿',
    copyFailedHint: '輸出已全選，請按 Ctrl＋C（Mac 為 ⌘＋C）手動複製。',
  },

  undo: '復原',
  redo: '重做',
  keysGroup: '編輯',
  npcGroup: 'NPC',
  rollAllKey: '全部擲骰',
  project: {
    fileName: 'CoC NPC',
    resetLabel: '全部重來',
    resetTitle: '刪除所有 NPC、重新開始？',
    resetDescription: '會只剩一個新的 NPC（可以用「復原」回來）。',
  },

  usage: [
    '左邊的 NPC 清單可以新增、切換、刪除 NPC（至少會留一個）；每個 NPC 有自己的版本（7 版／6 版）。',
    '屬性：在算式欄寫骰子算式（例：3D6、2D6+6），按骰子鈕擲那一項，或按「全部擲骰」（快捷鍵 R）。7 版的結果自動 ×5；也可以直接改數值。',
    '衍生值（HP、MP、SAN、DB、體格）會依屬性自動計算，也可以手動改；不需要 SAN 時把「輸出 SAN」關掉。',
    '技能與指令：名稱空白的技能、算式空白的指令不輸出；指令算式裡的 DB 會換成 {DB}。6 版可以選 CC 或 CCB。',
    '右邊是輸出：「CCFOLIA」是角色 JSON（在 CCFOLIA 房間按 Ctrl＋V 貼上就會新增角色），「聊天面板」是給 BCDice 的指令清單。「擲骰並複製」會先全部擲骰再複製。',
    '內容會自動儲存在這個瀏覽器；「專案」選單可以把所有 NPC 存成專案檔帶到別台電腦。',
  ],
};
