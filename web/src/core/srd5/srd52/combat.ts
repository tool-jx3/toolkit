/**
 * SRD 5.2.1 的戰鬥規則（Playing the Game → Combat、Damage and Healing；Rules Glossary → Concentration），
 * 本站翻譯、改成程式可讀的數值。出處與授權見同資料夾的 LICENSE.txt。先攻與戰鬥追蹤（combat-tracker）用。
 */

/** 死亡豁免：d20 擲出這個值以上成功 */
export const DEATH_SAVE_DC = 10;
/** 成功或失敗累積到幾次：成功 → 穩定（Stable），失敗 → 死亡 */
export const DEATH_SAVE_LIMIT = 3;

/** 專注檢定的 DC：10 或所受傷害的一半（無條件捨去），取較高者，最高 30 */
export function concentrationDc(damage: number): number {
  return Math.min(30, Math.max(10, Math.floor(Math.max(0, damage) / 2)));
}

/** 介面上的規則摘要（翻譯、有修改） */
export const COMBAT_RULES = {
  initiative:
    '先攻（Initiative）是敏捷檢定，由高到低行動，每輪的順序不變。同一群相同的生物由 GM 擲一次、共用同一個先攻值。',
  tempHp:
    '臨時生命值（Temporary Hit Points）：受到傷害時先扣臨時 HP，剩下的才扣 HP。臨時 HP 不能相加——又獲得時選要留舊的或換新的；治療不會回復臨時 HP。',
  zeroHp:
    '降到 0 HP：怪物在 0 HP 時死亡（GM 也可以讓牠像角色一樣處理）。角色降到 0 HP 時昏迷並開始擲死亡豁免；降到 0 HP 後剩下的傷害達到 HP 上限時當場死亡（大量傷害）。',
  deathSaves:
    '死亡豁免（Death Saving Throw）：0 HP 的角色在回合開始時擲 d20，10 以上成功、其他失敗；累積 3 次成功變成穩定（Stable），3 次失敗死亡。擲出 1 算兩次失敗，擲出 20 回復 1 HP。0 HP 時受到傷害算一次失敗（重擊算兩次），傷害達到 HP 上限時死亡。回復任何 HP 或變成穩定時，成功與失敗都歸零。',
  concentration:
    '專注（Concentration）：受到傷害時要通過體質豁免，DC 為 10 或傷害的一半（無條件捨去）取較高者，最高 30。',
} as const;
