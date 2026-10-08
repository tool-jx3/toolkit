/**
 * CoC 擲骰工具的介面文字（繁中；用詞照 DESIGN.md 第 5 節）。
 */
import { DICE_LIMITS, type DiceParseError } from '@/core/coc';

export const S = {
  tabsLabel: '功能',
  tabs: { roll: '擲骰', damage: '傷害計算' },

  skill: {
    title: '技能檢定',
    bonus: '獎勵骰／懲罰骰',
    bonusHint: '＋是獎勵骰（取較小的十位數）、−是懲罰骰（取較大的），各最多 2 顆。',
    bonusOption: (v: number) =>
      v > 0 ? `獎勵骰 ${v} 顆` : v < 0 ? `懲罰骰 ${-v} 顆` : '不加獎勵骰或懲罰骰',
    value: '技能值',
    valuePlaceholder: '不填也可以擲',
    valueHint: '填了會判定成功等級；不填就只擲 1D100。按 Enter 擲骰。',
    valueUp: '技能值：增加',
    valueDown: '技能值：減少',
    roll: '擲 1D100',
    rollAria: '技能檢定：擲骰',
  },

  custom: {
    title: '自訂擲骰',
    expr: '算式',
    placeholder: '例：1D6+1D4+2',
    hint: '可以用全形文字。按下面的按鈕加骰，面數相同的會合併（1D6 再加 1D6 → 2D6）。按 Enter 擲骰。',
    clear: '清除算式',
    roll: '擲骰',
    rollAria: '自訂擲骰：擲骰',
    quickLabel: '加骰',
    quickAria: (token: string) => `算式加上 ${token}`,
    errors: {
      empty: '請先輸入算式。例：2D6+1D4+3',
      syntax: '看不懂這個算式。寫法例：2D6+1D4+3（「骰子數 D 面數」或整數，用 + 或 - 連接）',
      zero: '骰子數與面數都要 1 以上。',
      'too-many': `一次最多擲 ${DICE_LIMITS.maxDice} 顆骰子。`,
      'too-large': `面數最多 ${DICE_LIMITS.maxSides}、常數最多 ${DICE_LIMITS.maxConstant}。`,
    } satisfies Record<DiceParseError, string>,
  },

  result: {
    region: '擲骰結果',
    empty: '按「擲骰」開始。',
    rolling: '…',
    announce: (total: number, level: string | null) =>
      level ? `結果 ${total}，${level}` : `結果 ${total}`,
    tensDie: (face: string, used: boolean) => `十位骰 ${face}${used ? '' : '（未採用）'}`,
    onesDie: (face: string) => `個位骰 ${face}`,
    die: (face: number, sides: number) => `D${sides}：${face}`,
    diceList: '骰子',
    toDamage: '帶入傷害計算',
    toDamageHint: '把這次的結果加到「傷害計算」的擲骰結果最後',
    toDamageDone: '已帶入傷害計算',
  },

  log: {
    title: '擲骰紀錄',
    count: (n: number) => `${n} 筆`,
    show: '顯示紀錄',
    hide: '收起紀錄',
    clearAll: '全部刪除',
    confirmTitle: '刪除所有擲骰紀錄？',
    confirmDescription: '刪除之後無法復原。',
    confirmLabel: '刪除',
    empty: '還沒有擲骰紀錄。',
    note: '新的在最上面，最多保留最新的 200 筆，存在這個瀏覽器裡。',
    /** 技能檢定寫進紀錄時的開頭：「技能值[50] BD/PD[0] ＞ 45 ＞ 45 ＞ 一般成功」 */
    skillPrefix: '技能值',
  },

  damage: {
    title: '傷害計算',
    armor: '護甲',
    armorHint: '每一筆傷害先扣掉護甲（最少扣到 0）再加總。',
    rolls: 'BCDice 的傷害擲骰結果',
    rollsHint: '從 CCFOLIA 的聊天欄複製擲骰結果貼上；每一行以「＞ 數字」結尾的數字算一筆。',
    placeholder: [
      '例：',
      '調查員 - 今天 21:04',
      'x3 1D10+2 手槍 #1',
      '(1D10+2) ＞ 3[3]+2 ＞ 5',
      '',
      '#2',
      '(1D10+2) ＞ 7[7]+2 ＞ 9',
      '',
      '#3',
      '(1D10+2) ＞ 4[4]+2 ＞ 6',
    ].join('\n'),
    calculate: '計算',
    total: (n: number) => `傷害合計：${n}`,
    found: (values: readonly number[]) => `共 ${values.length} 筆：${values.join('、')}`,
    afterArmor: (armor: number, each: readonly number[]) =>
      `扣掉護甲 ${armor} 之後：${each.join('、')}`,
    command: '改 HP 的指令',
    commandHint: '點一下複製，貼到 CCFOLIA 的聊天欄送出。',
    commandAria: (cmd: string) => `複製指令 ${cmd}`,
    copied: '已複製指令！',
    copyFailed: '無法寫入剪貼簿，請手動選取指令複製。',
    errors: {
      armor: '請輸入正確的護甲值',
      'no-rolls': '找不到傷害擲骰結果',
    },
  },

  undo: '復原',
  redo: '重做',
  keysGroup: '編輯',
  rollGroup: '擲骰',
  enterSkill: '技能值欄：技能檢定',
  enterCustom: '算式欄：自訂擲骰',
  project: {
    fileName: 'CoC 擲骰',
    resetLabel: '重設輸入',
    resetTitle: '重設所有輸入？',
    resetDescription:
      '技能值、獎勵骰／懲罰骰、算式、護甲與傷害擲骰結果會回到預設值（可以用「復原」回來）。擲骰紀錄不會刪除。',
  },

  usage: [
    '技能檢定：選獎勵骰／懲罰骰、填技能值後按「擲 1D100」，會顯示十位骰、個位骰、結果與成功等級（大成功、極限成功、困難成功、一般成功、失敗、大失敗）。有獎勵骰或懲罰骰時，沒有採用的十位骰會變暗。',
    '成功等級：出 1 是大成功；技能值未滿 50 時 96 以上、50 以上時只有 100 是大失敗；技能值的 1/5 以下是極限成功、1/2 以下是困難成功。',
    '自訂擲骰：在算式欄輸入「骰子數 D 面數」與整數的加減（例：2D6+1D4+3），按 Enter 或「擲骰」。下面的按鈕可以快速加骰，面數相同的會合併。',
    '技能檢定與自訂擲骰共用同一個結果區與擲骰紀錄；紀錄存在這個瀏覽器裡，最多保留最新的 200 筆。',
    '傷害計算：從 CCFOLIA 貼上 BCDice 的傷害擲骰結果、填護甲後按「計算」，每一筆扣掉護甲再加總，並產生「:HP-總和」的指令，點一下就能複製。',
    '設定會自動儲存；「專案」選單可以把目前的輸入與擲骰紀錄存成專案檔。',
  ],
};
