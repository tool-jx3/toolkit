/**
 * CoC 房規表產生器的規則清單（6 版、7 版、各版通用三組，名稱與說明全部自寫；用語照台灣 CoC 玩家的說法）。
 *
 * - 規則：`rule(id, 分類, 名稱, 說明, 選項, 規則書的值, 常見的值, 開頁就放進表)`；說明可以是 null。
 * - 每條規則的選項最後一律自動加上「※ 有修改（見注記）」。
 * - 帶數字的選項：`num(id, 標籤（{n} 換成數字）, 預設, 最小, 最大, 數字欄的名稱)`。
 * - id 是存檔的鍵，上線後不要改（規則與選項的 id 和原作相同，方便對照；名稱、說明、選項文字是本站自己寫的）。
 *
 * 規格：docs/refactor/specs/house-rules.md 3.1。
 */

export type SectionId = '6' | '7' | 'common';

export type CategoryId =
  | 'check'
  | 'sanity'
  | 'combat'
  | 'damage'
  | 'growth'
  | 'creation'
  | 'table'
  | 'dice'
  | 'play'
  | 'char'
  | 'share';

export interface NumberSpec {
  def: number;
  min: number;
  max: number;
  /** 數字欄的無障礙名稱 */
  label: string;
}

export interface RuleOption {
  id: string;
  /** 按鈕與輸出的文字；帶數字的選項用 {n} 代表數字 */
  label: string;
  /** 符號選項（○ × ※）的完整說明（提示與無障礙名稱） */
  long?: string;
  /** ○ × ※ 這類符號選項 */
  sym?: boolean;
  num?: NumberSpec;
}

export interface RuleDef {
  id: string;
  cat: CategoryId;
  name: string;
  hint: string | null;
  opts: readonly RuleOption[];
  /** 照規則書的值 */
  raw: string;
  /** 線上團常見的值 */
  pop: string;
  /** 開頁（與套用預設集時）就放進表 */
  core: boolean;
}

export interface SectionDef {
  id: SectionId;
  /** 區塊標題（編輯畫面、目錄、輸出） */
  title: string;
  cats: readonly CategoryId[];
  rules: readonly RuleDef[];
}

/* ---------- 共用的選項 ---------- */

export const OPT_O: RuleOption = { id: 'o', label: '○', long: '採用', sym: true };
export const OPT_X: RuleOption = { id: 'x', label: '×', long: '不採用', sym: true };
export const OPT_M: RuleOption = { id: 'm', label: '※', long: '有修改（見注記）', sym: true };
/** 自訂規則的「自由填寫」 */
export const OPT_TEXT: RuleOption = { id: 'text', label: '✎', long: '自由填寫' };

const RAW: RuleOption = { id: 'raw', label: '照規則書' };
const OK: RuleOption = { id: 'ok', label: '可以' };
const CONSULT: RuleOption = { id: 'consult', label: '先商量' };
const NG: RuleOption = { id: 'ng', label: '不行' };
const OX = [OPT_O, OPT_X];

const o = (id: string, label: string): RuleOption => ({ id, label });
const num = (
  id: string,
  label: string,
  def: number,
  min: number,
  max: number,
  fieldLabel: string,
): RuleOption => ({ id, label, num: { def, min, max, label: fieldLabel } });

function rule(
  id: string,
  cat: CategoryId,
  name: string,
  hint: string | null,
  opts: readonly RuleOption[],
  raw: string,
  pop: string,
  core = false,
): RuleDef {
  return { id, cat, name, hint, opts: [...opts, OPT_M], raw, pop, core };
}

export const CATEGORY_NAMES: Record<CategoryId, string> = {
  check: '檢定與技能',
  sanity: '理智與瘋狂',
  combat: '戰鬥',
  damage: '傷害與治療',
  growth: '成長與獎勵',
  creation: '建立調查員',
  table: '其他房規',
  dice: '擲骰',
  play: '遊戲進行',
  char: '參加的調查員',
  share: '團錄與分享',
};

/* 兩版共用寫法的規則 */
const sanCritFumble = rule(
  'sancf',
  'sanity',
  '理智檢定的大成功／大失敗',
  '例如大成功時理智損失取最小值、大失敗時取最大值。',
  [o('on', '適用'), o('off', '不適用')],
  'off',
  'on',
  true,
);
const initiative = rule(
  'init',
  'combat',
  '行動順序',
  null,
  [o('dex', '依 DEX 高低'), o('dice', '擲骰決定')],
  'dex',
  'dex',
  true,
);
const aidCount = rule(
  'aidcount',
  'damage',
  '治療的嘗試次數',
  '同一次受傷可以試幾次急救或醫學。',
  [o('1', '1 次'), o('2', '2 次'), o('3', '3 次'), o('inf', '不限')],
  '1',
  '1',
  true,
);
const aidMedicine = rule(
  'aidmed',
  'damage',
  '急救與醫學並用',
  '同一次受傷能不能急救和醫學都用。',
  OX,
  'o',
  'o',
  true,
);
const statMethod = rule(
  'statmethod',
  'creation',
  '屬性的決定方式',
  null,
  [o('dice', '擲骰'), o('point', '點數分配')],
  'dice',
  'dice',
);
const reroll = rule(
  'reroll',
  'creation',
  '屬性重擲',
  null,
  [
    o('inf', '不限次數'),
    num('each', '整組不限、單項 {n} 次', 1, 0, 99, '單項重擲的次數'),
    num('total', '合計 {n} 次', 3, 0, 99, '合計重擲的次數'),
    o('none', '不能重擲'),
  ],
  'none',
  'inf',
  true,
);
const swap = rule('swap', 'creation', '屬性互換', null, OX, 'x', 'x', true);
const age = rule('age', 'creation', '年齡修正', null, OX, 'o', 'o');
const growAmount = rule(
  'growamount',
  'growth',
  '成長的增加量',
  null,
  [o('d10', '1D10')],
  'd10',
  'd10',
);
const instantGrowth = (pop: string) =>
  rule(
    'instant',
    'growth',
    '當場成長',
    '不等團結束，在團中當場讓技能成長的房規。',
    [o('init', '初始值成功時'), o('crit', '大成功時'), OPT_X],
    'x',
    pop,
    true,
  );
const skillCap = (def: number) =>
  rule(
    'skillcap',
    'creation',
    '技能上限',
    '建立調查員時，一個技能最多能點到多少。',
    [num('cap', '{n}% 為止', def, 1, 999, '技能上限（%）'), o('none', '沒有上限')],
    'none',
    'cap',
    true,
  );
const insight = rule('insight', 'sanity', '瘋狂中的洞見', null, OX, 'o', 'o');
const indefinite = rule('indef', 'sanity', '不定性瘋狂', null, OX, 'o', 'o', true);
const knockout = (hint: string | null) =>
  rule('knockout', 'combat', '擊昏攻擊', hint, OX, 'o', 'o');
const burst = rule('burst', 'combat', '連射', null, OX, 'o', 'o');

/* ---------- 6 版 ---------- */

const R6: RuleDef[] = [
  rule(
    'cmd',
    'check',
    '檢定指令',
    'BCDice 的 CC 是 01 大成功、100 大失敗；CCB 是 01～05 大成功、96～100 大失敗。',
    [o('cc', 'CC'), o('ccb', 'CCB'), o('mix', '平時 CC、戰鬥 CCB')],
    'ccb',
    'ccb',
    true,
  ),
  rule(
    'special',
    'check',
    '特殊成功',
    '擲出技能值五分之一以下時的特別成功。',
    [OPT_O, OPT_X, o('impale', '只用於貫穿')],
    'o',
    'o',
    true,
  ),
  rule('fumbletable', 'check', '大失敗表', '大失敗時另外擲表，決定發生什麼事。', OX, 'x', 'x'),

  sanCritFumble,
  rule(
    'tempmad',
    'sanity',
    '臨時性瘋狂的症狀',
    '症狀要擲表決定，還是 KP 也可以直接指定。',
    [o('either', '擲表或由 KP 指定'), o('roll', '只能擲表')],
    'either',
    'either',
    true,
  ),
  indefinite,
  insight,
  rule(
    'mythosgrow',
    'sanity',
    '克蘇魯神話技能的成長',
    '成長檢定能不能讓克蘇魯神話技能上升。',
    OX,
    'x',
    'x',
  ),

  initiative,
  rule(
    'atkdodge',
    'combat',
    '攻擊與閃避',
    '同一輪裡能不能攻擊之後又閃避。',
    [o('both', '兩個都能做'), o('one', '只能擇一')],
    'both',
    'both',
    true,
  ),
  rule(
    'parrydodge',
    'combat',
    '閃避與招架',
    '同一輪裡能不能閃避之後又招架。',
    [o('both', '兩個都能做'), o('one', '只能擇一')],
    'both',
    'both',
  ),
  rule('dodgespot', 'combat', '閃避的補充規則', null, OX, 'x', 'x'),
  rule('impale', 'combat', '貫穿', '穿刺武器擲出特殊成功時加重傷害。', OX, 'o', 'o', true),
  knockout('用徒手或鈍器把對手打昏的攻擊。'),
  rule('readyfire', 'combat', '射擊準備', null, OX, 'o', 'o'),
  burst,
  rule('grapple', 'combat', '擒抱（2010）', null, OX, 'x', 'x'),
  rule('martial', 'combat', '武術（2010）', null, OX, 'x', 'x'),

  aidCount,
  aidMedicine,
  rule('autoko', 'damage', '自動昏迷', 'HP 降到一定程度以下時自動昏迷。', OX, 'o', 'o'),
  rule('shock', 'damage', '休克', '一次受到大量傷害時要過 CON 檢定。', OX, 'o', 'o'),
  rule('dying', 'damage', '瀕死與死亡', null, [RAW, o('grace', '有搶救的緩衝時間')], 'raw', 'raw'),

  rule(
    'growcheck',
    'growth',
    '技能成長檢定',
    '成功過的技能做記號，團結束後擲成長。',
    [RAW],
    'raw',
    'raw',
    true,
  ),
  growAmount,
  instantGrowth('init'),
  rule('interlude', 'growth', '幕間成長（2010）', null, OX, 'x', 'x'),

  statMethod,
  reroll,
  swap,
  rule(
    'occpts',
    'creation',
    '職業技能點數',
    null,
    [o('edu20', 'EDU×20'), o('byocc', '依職業的公式')],
    'edu20',
    'edu20',
  ),
  rule('hobpts', 'creation', '興趣技能點數', null, [o('int10', 'INT×10')], 'int10', 'int10'),
  skillCap(90),
  age,
  rule('occspec', 'creation', '職業特記', null, OX, 'o', 'o'),
  rule(
    'traits',
    'creation',
    '特徵表',
    null,
    [o('one', '1 個'), o('two', '2 個'), o('none', '不使用')],
    'none',
    'two',
    true,
  ),

  rule(
    'critticket',
    'table',
    '大成功券',
    '擲出大成功時拿到一張券，之後可以用在別的檢定上。',
    OX,
    'x',
    'x',
  ),
];

/* ---------- 7 版 ---------- */

const R7: RuleDef[] = [
  rule(
    'push',
    'check',
    '孤注一擲',
    '檢定失敗後換個做法再擲一次；再失敗會有更糟的後果。',
    OX,
    'o',
    'o',
    true,
  ),
  rule(
    'luckspend',
    'check',
    '消耗幸運',
    '花掉幸運值，把擲出的數字降到成功的範圍。',
    OX,
    'x',
    'o',
    true,
  ),
  rule(
    'fumble7',
    'check',
    '大失敗的範圍',
    '規則書：技能值未滿 50 時 96～100、50 以上時只有 100。',
    [RAW, o('f100', '只有 100'), o('f96', '96～100')],
    'raw',
    'raw',
  ),
  rule(
    'difficulty',
    'check',
    '難度等級',
    '一般、困難、極限三種難度怎麼用。',
    [RAW, o('regular', '只用一般難度')],
    'raw',
    'raw',
  ),

  sanCritFumble,
  rule(
    'tempmad',
    'sanity',
    '瘋狂發作的內容',
    '瘋狂發作要擲表決定，還是 KP 也可以直接指定。',
    [o('either', '擲表或由 KP 指定'), o('roll', '只能擲表')],
    'either',
    'either',
    true,
  ),
  indefinite,
  rule('latent', 'sanity', '潛在瘋狂', null, OX, 'o', 'o'),
  rule('delusion', 'sanity', '妄想與幻覺', null, OX, 'o', 'o'),
  rule('phobia', 'sanity', '恐懼症與狂躁症', null, OX, 'o', 'o'),
  insight,
  rule('numb', 'sanity', '對神話的麻木', null, OX, 'o', 'o'),

  initiative,
  rule('readyfire', 'combat', '預備射擊', '已經舉好槍的人以 DEX＋50 的順序先開槍。', OX, 'o', 'o'),
  knockout(null),
  burst,
  rule('impale', 'combat', '貫穿', '穿刺武器擲出極限成功時加重傷害。', OX, 'o', 'o', true),
  rule('chase', 'combat', '追逐', null, OX, 'o', 'o'),

  aidCount,
  aidMedicine,
  rule('majorwound', 'damage', '重傷', '一次受到 HP 上限一半以上的傷害就算重傷。', OX, 'o', 'o'),
  rule('luckdeath', 'damage', '用幸運逃過死亡', null, OX, 'x', 'x'),

  rule(
    'growcheck',
    'growth',
    '技能成長檢定',
    '成功過的技能做記號，在成長階段擲成長。',
    [RAW],
    'raw',
    'raw',
    true,
  ),
  growAmount,
  instantGrowth('x'),
  rule(
    'luckrecover',
    'growth',
    '幸運恢復',
    '成長階段能不能恢復幸運。',
    [OPT_O, OPT_X, o('used', '用過幸運才恢復')],
    'o',
    'used',
  ),

  statMethod,
  reroll,
  swap,
  rule('exceptional', 'creation', '真正出眾的調查員', null, OX, 'x', 'x'),
  rule('occpts', 'creation', '職業技能點數', null, [o('byocc', '依職業的公式')], 'byocc', 'byocc'),
  rule('hobpts', 'creation', '興趣技能點數', null, [o('int2', 'INT×2')], 'int2', 'int2'),
  skillCap(80),
  age,
  rule('exppack', 'creation', '經驗包', null, OX, 'x', 'x'),
  rule(
    'talent',
    'creation',
    '天賦',
    null,
    [o('one', '1 個'), o('two', '2 個'), o('none', '不使用')],
    'none',
    'none',
  ),
];

/* ---------- 各版通用 ---------- */

const RC: RuleDef[] = [
  rule(
    'secret',
    'dice',
    '暗骰',
    '結果要對 PL 保密的檢定怎麼擲。',
    [o('kp', 'KP 代擲'), o('pl', 'PL 擲、結果不公開'), o('none', '不使用')],
    'kp',
    'kp',
    true,
  ),
  rule(
    'retry',
    'dice',
    '同一個檢定重擲',
    null,
    [o('no', '不行'), o('change', '情況改變就可以')],
    'no',
    'no',
    true,
  ),
  rule('combine', 'dice', '組合檢定', '擲一次骰子同時對照兩個技能。', OX, 'x', 'x'),
  rule(
    'timing',
    'dice',
    '檢定的時機',
    null,
    [o('kp', '依 KP 指示'), o('pl', 'PL 可以主動提出')],
    'pl',
    'pl',
  ),
  rule(
    'kpdice',
    'dice',
    'KP 的骰子公開',
    null,
    [o('open', '公開'), o('hidden', '不公開'), o('case', '看情況')],
    'case',
    'case',
  ),

  rule(
    'info',
    'play',
    'PL 之間的情報共享',
    null,
    [o('free', '自由'), o('meet', '調查員碰面以後')],
    'free',
    'free',
    true,
  ),
  rule(
    'meta',
    'play',
    '場外資訊（meta）發言',
    null,
    [OK, o('light', '適度就好'), NG],
    'light',
    'light',
  ),
  rule('pvp', 'play', 'PvP（調查員之間的對立）', null, [OK, CONSULT, NG], 'consult', 'consult'),

  rule(
    'continuing',
    'char',
    '可以參加的調查員',
    null,
    [o('both', '新角色、舊角色都可以'), o('new', '只限新角色'), o('cont', '只限舊角色')],
    'both',
    'both',
    true,
  ),
  rule(
    'lost',
    'char',
    '調查員撕卡',
    null,
    [o('on', '會撕卡'), o('rescue', '有補救措施'), o('off', '不會撕卡')],
    'on',
    'on',
    true,
  ),
  rule(
    'carry',
    'char',
    '從其他劇本帶進來的東西',
    '神器（AF）、特殊技能、咒文等。',
    [OK, CONSULT, NG],
    'consult',
    'consult',
  ),

  rule('stream', 'share', '團錄與直播', null, [OK, CONSULT, NG], 'consult', 'consult'),
  rule(
    'spoiler',
    'share',
    '通關後的劇透',
    null,
    [o('hide', '談論時要防雷'), o('free', '自由')],
    'hide',
    'hide',
  ),
];

export const SECTIONS: readonly SectionDef[] = [
  {
    id: '6',
    title: 'CoC 6 版',
    cats: ['check', 'sanity', 'combat', 'damage', 'growth', 'creation', 'table'],
    rules: R6,
  },
  {
    id: '7',
    title: 'CoC 7 版',
    cats: ['check', 'sanity', 'combat', 'damage', 'growth', 'creation', 'table'],
    rules: R7,
  },
  { id: 'common', title: '各版通用', cats: ['dice', 'play', 'char', 'share'], rules: RC },
];

export const SECTION_BY_ID: Record<SectionId, SectionDef> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s]),
) as Record<SectionId, SectionDef>;

export type Edition = '6' | '7' | 'both';

export const EDITIONS: readonly Edition[] = ['6', '7', 'both'];

/** 每種版本要列的區塊（各版通用一律在最後） */
export const EDITION_SECTIONS: Record<Edition, readonly SectionId[]> = {
  '6': ['6', 'common'],
  '7': ['7', 'common'],
  both: ['6', '7', 'common'],
};

/** 「規則系統」空白時寫進表的名稱 */
export const SYSTEM_AUTO: Record<Edition, string> = {
  '6': 'CoC 6 版',
  '7': 'CoC 7 版',
  both: 'CoC 6 版／7 版',
};

/** 自訂規則可以選的值 */
export const CUSTOM_OPTIONS: readonly RuleOption[] = [OPT_O, OPT_X, OPT_M, OPT_TEXT];
export type CustomValue = 'o' | 'x' | 'm' | 'text';
export const CUSTOM_VALUES: readonly CustomValue[] = ['o', 'x', 'm', 'text'];

/** 選項的文字（帶數字的選項把 {n} 換成數字；沒有數字時用預設值） */
export function optionLabel(op: RuleOption, n?: number | null): string {
  if (!op.num) return op.label;
  return op.label.replace('{n}', String(n ?? op.num.def));
}
