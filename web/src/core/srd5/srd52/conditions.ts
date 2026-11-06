/**
 * SRD 5.2.1 的 15 個狀態（Rules Glossary 的 [Condition]）與「專注」（Concentration），本站翻譯成繁體中文。
 * 出處、授權與本站的變更見同資料夾的 LICENSE.txt（建置時列進 THIRD_PARTY_NOTICES）。
 *
 * 先攻與戰鬥追蹤（combat-tracker）的狀態標記、5e 速查計算（5e-calc）的狀態一覽都用這裡。
 */

/** 狀態的一條效果：粗體的小標題＋說明 */
export interface ConditionEffect {
  title: string;
  text: string;
}

export interface SrdCondition {
  /** 程式用的鍵（英文小寫） */
  key: string;
  /** 繁中名稱 */
  name: string;
  /** 英文原文 */
  en: string;
  effects: readonly ConditionEffect[];
  /** 有等級的狀態（力竭）：最高幾級 */
  maxLevel?: number;
  /** 不是狀態、但戰鬥中常要標記的（專注） */
  marker?: boolean;
}

const SPEED_0: ConditionEffect = { title: '速度 0', text: '你的速度為 0，而且不能提高。' };
const INCAPACITATED: ConditionEffect = { title: '失能', text: '你處於失能（Incapacitated）狀態。' };
const AUTO_FAIL: ConditionEffect = {
  title: '豁免受影響',
  text: '你的力量與敏捷豁免自動失敗。',
};
const AUTO_CRIT: ConditionEffect = {
  title: '自動重擊',
  text: '攻擊者在你 5 呎內時，命中你的攻擊都是重擊（Critical Hit）。',
};

export const SRD_CONDITIONS: readonly SrdCondition[] = [
  {
    key: 'blinded',
    name: '目盲',
    en: 'Blinded',
    effects: [
      { title: '看不見', text: '你看不見東西，需要視覺的能力檢定自動失敗。' },
      { title: '攻擊受影響', text: '對你的攻擊擲骰具有優勢，你的攻擊擲骰具有劣勢。' },
    ],
  },
  {
    key: 'charmed',
    name: '魅惑',
    en: 'Charmed',
    effects: [
      {
        title: '不能傷害魅惑者',
        text: '你不能攻擊魅惑你的人，也不能以會造成傷害的能力或魔法效果指定他為目標。',
      },
      { title: '社交優勢', text: '魅惑你的人和你進行社交互動時，他的能力檢定具有優勢。' },
    ],
  },
  {
    key: 'deafened',
    name: '耳聾',
    en: 'Deafened',
    effects: [{ title: '聽不見', text: '你聽不見聲音，需要聽覺的能力檢定自動失敗。' }],
  },
  {
    key: 'exhaustion',
    name: '力竭',
    en: 'Exhaustion',
    maxLevel: 6,
    effects: [
      {
        title: '力竭等級',
        text: '這個狀態會累積：每次獲得時力竭等級加 1。力竭等級達到 6 時死亡。',
      },
      { title: 'd20 檢定受影響', text: '進行 d20 檢定時，擲出的結果減去力竭等級的 2 倍。' },
      { title: '速度降低', text: '你的速度減少「力竭等級 × 5」呎。' },
      { title: '移除力竭', text: '完成一次長休移除 1 級力竭；等級降到 0 時這個狀態結束。' },
    ],
  },
  {
    key: 'frightened',
    name: '恐懼',
    en: 'Frightened',
    effects: [
      {
        title: '能力檢定與攻擊受影響',
        text: '恐懼的來源在你的視線內時，你的能力檢定與攻擊擲骰具有劣勢。',
      },
      { title: '無法接近', text: '你不能自願移動到更靠近恐懼來源的位置。' },
    ],
  },
  {
    key: 'grappled',
    name: '被擒抱',
    en: 'Grappled',
    effects: [
      SPEED_0,
      { title: '攻擊受影響', text: '你對擒抱者以外的目標進行的攻擊擲骰具有劣勢。' },
      {
        title: '可被拖著走',
        text: '擒抱者移動時可以拖著或帶著你，但每移動 1 呎要多花 1 呎；你的體型是微型（Tiny）或比擒抱者小兩級以上時不用多花。',
      },
    ],
  },
  {
    key: 'incapacitated',
    name: '失能',
    en: 'Incapacitated',
    effects: [
      { title: '無法行動', text: '你不能執行任何動作、附贈動作或反應。' },
      { title: '無法專注', text: '你的專注中斷。' },
      { title: '無法說話', text: '你不能說話。' },
      { title: '措手不及', text: '擲先攻時處於失能的話，那次擲骰具有劣勢。' },
    ],
  },
  {
    key: 'invisible',
    name: '隱形',
    en: 'Invisible',
    effects: [
      { title: '出其不意', text: '擲先攻時處於隱形的話，那次擲骰具有優勢。' },
      {
        title: '隱蔽',
        text: '需要看見目標的效果對你無效，除非效果的發動者有辦法看見你。你穿戴或攜帶的裝備也一起被隱蔽。',
      },
      {
        title: '攻擊受影響',
        text: '對你的攻擊擲骰具有劣勢，你的攻擊擲骰具有優勢。看得見你的生物不受這一條影響。',
      },
    ],
  },
  {
    key: 'paralyzed',
    name: '麻痺',
    en: 'Paralyzed',
    effects: [
      INCAPACITATED,
      SPEED_0,
      AUTO_FAIL,
      { title: '攻擊受影響', text: '對你的攻擊擲骰具有優勢。' },
      AUTO_CRIT,
    ],
  },
  {
    key: 'petrified',
    name: '石化',
    en: 'Petrified',
    effects: [
      {
        title: '化為無生命的物質',
        text: '你和身上穿戴、攜帶的非魔法物品一起變成堅硬的無生命物質（通常是石頭）。重量變成十倍，停止老化。',
      },
      INCAPACITATED,
      SPEED_0,
      { title: '攻擊受影響', text: '對你的攻擊擲骰具有優勢。' },
      AUTO_FAIL,
      { title: '傷害抗性', text: '你對所有傷害具有抗性。' },
      { title: '免疫中毒', text: '你免疫中毒（Poisoned）狀態。' },
    ],
  },
  {
    key: 'poisoned',
    name: '中毒',
    en: 'Poisoned',
    effects: [{ title: '能力檢定與攻擊受影響', text: '你的攻擊擲骰與能力檢定具有劣勢。' }],
  },
  {
    key: 'prone',
    name: '倒地',
    en: 'Prone',
    effects: [
      {
        title: '移動受限',
        text: '你只能爬行，或花費速度一半（無條件捨去）的移動距離站起來、結束這個狀態。速度為 0 時站不起來。',
      },
      {
        title: '攻擊受影響',
        text: '你的攻擊擲骰具有劣勢。攻擊者在你 5 呎內時，對你的攻擊擲骰具有優勢；在 5 呎外時具有劣勢。',
      },
    ],
  },
  {
    key: 'restrained',
    name: '束縛',
    en: 'Restrained',
    effects: [
      SPEED_0,
      { title: '攻擊受影響', text: '對你的攻擊擲骰具有優勢，你的攻擊擲骰具有劣勢。' },
      { title: '豁免受影響', text: '你的敏捷豁免具有劣勢。' },
    ],
  },
  {
    key: 'stunned',
    name: '震懾',
    en: 'Stunned',
    effects: [INCAPACITATED, AUTO_FAIL, { title: '攻擊受影響', text: '對你的攻擊擲骰具有優勢。' }],
  },
  {
    key: 'unconscious',
    name: '昏迷',
    en: 'Unconscious',
    effects: [
      {
        title: '失去意識',
        text: '你處於失能與倒地狀態，並放下手上拿著的東西。這個狀態結束時你仍然倒地。',
      },
      SPEED_0,
      { title: '攻擊受影響', text: '對你的攻擊擲骰具有優勢。' },
      AUTO_FAIL,
      AUTO_CRIT,
      { title: '不知周遭', text: '你察覺不到周遭發生的事。' },
    ],
  },
  {
    key: 'concentration',
    name: '專注',
    en: 'Concentration',
    marker: true,
    effects: [
      {
        title: '受到傷害',
        text: '受到傷害時要通過體質豁免才能維持專注；DC 為 10 或所受傷害的一半（無條件捨去），取較高者，最高 30。',
      },
      {
        title: '另一個專注效果',
        text: '開始施放另一個需要專注的法術或效果時，原本的專注立刻結束。',
      },
      { title: '失能或死亡', text: '處於失能狀態或死亡時，專注結束。' },
    ],
  },
];

const BY_KEY = new Map(SRD_CONDITIONS.map((c) => [c.key, c]));

/** 用鍵找狀態（找不到時 undefined） */
export function srdCondition(key: string): SrdCondition | undefined {
  return BY_KEY.get(key);
}

/** 「名稱（英文）」：例「倒地（Prone）」 */
export const conditionLabel = (c: Pick<SrdCondition, 'name' | 'en'>): string =>
  `${c.name}（${c.en}）`;

/** 一個狀態的說明（純文字，一條一行；提示與複製用） */
export function conditionText(c: SrdCondition): string {
  return c.effects.map((e) => `${e.title}：${e.text}`).join('\n');
}
