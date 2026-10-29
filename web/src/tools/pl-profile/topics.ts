/**
 * 地雷表的內建主題（規格 F22、3.2）。
 *
 * 2026-10-29 依驗證結果重寫：舊的清單和未授權的原作太像，主控另外請沒看過任何原作與舊清單的人寫了新的分類、主題與用語
 * （規格 D4 的主控裁定）；這裡照那份內容原樣使用，文字、順序、分類都不改。
 *
 * 主題的 key 是存檔、分享連結與 KP 對照表用的識別碼：**公開之後不要改**（文字可以改）。
 * 分類的 key 也一樣（自訂主題記住它放在哪個分類）。
 */

export interface TopicDef {
  key: string;
  label: string;
}

export interface CategoryDef {
  key: string;
  name: string;
  /** 成人向：預設不顯示（地雷表分頁的開關打開才出現） */
  adult?: boolean;
  topics: readonly TopicDef[];
}

export const CATEGORIES: readonly CategoryDef[] = [
  {
    key: 'scares',
    name: '恐怖元素',
    topics: [
      { key: 'ghosts', label: '鬼魂與靈異現象' },
      { key: 'folk-taboos', label: '民俗禁忌與儀式' },
      { key: 'dark-tight-spaces', label: '黑暗或狹窄的空間' },
      { key: 'dolls', label: '人偶與假人' },
      { key: 'swarming-bugs', label: '成群的蟲' },
      { key: 'being-chased', label: '被怪物追著跑' },
      { key: 'jump-scares', label: '突然的驚嚇與音效' },
      { key: 'incomprehensible-beings', label: '人類無法理解的存在' },
    ],
  },
  {
    key: 'body',
    name: '身體與血肉',
    topics: [
      { key: 'blood-wounds', label: '血與傷口的描寫' },
      { key: 'vomit-excrement', label: '嘔吐與排泄物' },
      { key: 'corpses-decay', label: '屍體與腐爛' },
      { key: 'needles-surgery', label: '針、注射與手術' },
      { key: 'disease-parasites', label: '疾病、感染與寄生' },
      { key: 'body-transformation', label: '身體異化、變成非人' },
      { key: 'dismemberment', label: '肢解與斷肢' },
      { key: 'torture-experiments', label: '拷問與人體實驗' },
      { key: 'cannibalism', label: '食人' },
    ],
  },
  {
    key: 'death',
    name: '死亡與失去',
    topics: [
      { key: 'npc-death', label: 'NPC 死亡' },
      { key: 'mass-casualties', label: '大量死傷（戰爭、災難、屠殺）' },
      { key: 'animal-death', label: '動物或寵物死去' },
      { key: 'child-death', label: '孩童死亡' },
      { key: 'loved-one-death', label: 'PC 的親友死去' },
      { key: 'pc-kills', label: 'PC 親手殺人' },
      { key: 'pc-death', label: 'PC 死亡' },
      { key: 'character-loss', label: '撕卡（角色永久退場）' },
    ],
  },
  {
    key: 'mind',
    name: '心靈與自我',
    topics: [
      { key: 'pc-madness', label: 'PC 陷入瘋狂' },
      { key: 'hallucinations', label: '幻覺、分不清真假' },
      { key: 'memory-tampering', label: '失憶或記憶被竄改' },
      { key: 'mind-control', label: '被操控或洗腦' },
      { key: 'identity-doubt', label: '懷疑自己是誰（替身、複製人）' },
      { key: 'no-right-answer', label: '沒有正解的抉擇' },
      { key: 'past-trauma', label: 'PC 的過去創傷被挖出' },
      { key: 'self-harm-suicide', label: '自殘與自殺' },
    ],
  },
  {
    key: 'real-world',
    name: '現實議題',
    topics: [
      { key: 'politics-religion', label: '現實的政治與宗教' },
      { key: 'discrimination', label: '歧視與偏見' },
      { key: 'real-events', label: '影射真實的災難或事件' },
      { key: 'drugs-addiction', label: '毒品與成癮' },
      { key: 'bullying', label: '霸凌' },
      { key: 'domestic-violence', label: '家暴與失能家庭' },
      { key: 'child-abuse', label: '虐待兒童' },
      { key: 'sexual-violence', label: '性騷擾與性暴力' },
    ],
  },
  {
    key: 'relationships',
    name: '角色之間',
    topics: [
      { key: 'assigned-relations', label: '劇本指定的 PC 關係' },
      { key: 'romance-with-npc', label: 'PC 和 NPC 的戀愛' },
      { key: 'romance-between-pcs', label: 'PC 之間的戀愛' },
      { key: 'same-sex-romance', label: '同性角色之間的感情戲' },
      { key: 'obsessive-love', label: '病嬌、執著的愛' },
      { key: 'npc-betrayal', label: '信任的 NPC 背叛' },
      { key: 'pc-secrets', label: 'PC 之間互有祕密' },
      { key: 'pvp', label: 'PC 互相對抗（PvP）' },
    ],
  },
  {
    key: 'play',
    name: '跑團方式',
    topics: [
      { key: 'combat', label: '戰鬥' },
      { key: 'puzzles', label: '解謎' },
      { key: 'heavy-roleplay', label: '大量角色扮演與即興對戲' },
      { key: 'free-exploration', label: '自由探索、自己找目標' },
      { key: 'hidden-rolls', label: 'KP／GM 暗骰' },
      { key: 'strict-rules', label: '嚴格照規則判定' },
      { key: 'table-talk', label: '場外閒聊' },
      { key: 'long-sessions', label: '一次跑四小時以上' },
      { key: 'late-night', label: '跑到深夜' },
      { key: 'recording', label: '錄影、直播或公開團錄' },
    ],
  },
  {
    key: 'adult',
    name: '成人向',
    adult: true,
    topics: [
      { key: 'flirting-innuendo', label: '曖昧與性暗示' },
      { key: 'nudity', label: '裸體的描寫' },
      { key: 'intimacy-fade-out', label: '親密場面（一筆帶過）' },
      { key: 'intimacy-explicit', label: '親密場面（具體描寫）' },
      { key: 'sex-industry', label: '性產業' },
    ],
  },
];

/** key → 主題與它的分類 */
export const TOPIC_INDEX: ReadonlyMap<string, { topic: TopicDef; category: CategoryDef }> = new Map(
  CATEGORIES.flatMap((c) => c.topics.map((t) => [t.key, { topic: t, category: c }])),
);

export const CATEGORY_INDEX: ReadonlyMap<string, CategoryDef> = new Map(
  CATEGORIES.map((c) => [c.key, c]),
);

export const isBuiltinCategory = (key: string): boolean => CATEGORY_INDEX.has(key);
export const isAdultCategory = (key: string): boolean => CATEGORY_INDEX.get(key)?.adult === true;
