/**
 * core/coc：克蘇魯的呼喚（CoC）規則，G9（coc-dice、coc-npc、coc-sheet）共用的純函式。
 *
 * - random：擲骰用的亂數與注入點（`window.__cocRandom`）
 * - dice：骰子算式（`NdM±常數`，全形正規化）的解析、擲骰與明細
 * - skill：7 版技能檢定（百分骰、獎勵骰／懲罰骰、成功等級）
 * - derived：屬性、DB／體格表（7 版、6 版）、HP／MP／SAN
 * - bcdice：BCDice 擲骰結果「＞ 數字」的解析、扣護甲加總
 *
 * 規格：docs/refactor/specs/coc-dice.md、coc-npc.md 第 3 節。
 */
export * from './bcdice';
export * from './derived';
export * from './dice';
export * from './random';
export * from './skill';
