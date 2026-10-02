/**
 * core/sessions：跑團紀錄的資料模型（G6 的跑團紀錄簿 session-log 與團報產生器 session-report 共用）。
 *
 * - model：一團的欄位（`SessionRow`）、系統／狀態／生還的正規值（日文）與繁中顯示名稱、匯入別名、身分分組、
 *   人名拆分與正規化、自己的名字、同團玩家、時間、劇本計數鍵
 * - dates：日期清單整理、主要日期（最晚一天）、彈性日期解讀、本地日期
 * - report：紀錄簿 → 團報產生器的交接資料（localStorage 固定鍵名，格式沿用舊版）
 *
 * 規格：docs/refactor/specs/session-log.md 第 3.1～3.6、3.9 節。
 */
export * from './dates';
export * from './model';
export * from './report';
