import '@testing-library/jest-dom/vitest'
import dictSource from '../../../../tools/obs-tachie/i18n.obs-tachie.js?raw'

/* 【TRPG Toolkit 收錄時新增】（做法同 vendor/ccfolia-character-editor/src/test/setup.ts）
 * 上游的測試以畫面上的日文標籤找元素，也會比對輸出 CSS 裡的日文註解。收錄版把
 * 這些日文移進了字典（tools/obs-tachie/i18n.obs-tachie.js），因此在這裡把字典的
 * ja 注入 window.T。上游測試的斷言一行都不用改就能通過，順便隨時驗證
 * 「ja 的譯文與上游原文逐字相同」。
 *
 * 以 Vite 的 ?raw 與 new Function 讀取字典，不必動用 node:fs / node:vm。 */
let messages: Record<string, string> = {}
new Function('I18N', dictSource)({
  register: (dictionaries: Record<string, Record<string, string>>) => {
    messages = dictionaries.ja
  },
})

;(globalThis as unknown as { T: (key: string, ...args: Array<string | number>) => string }).T = (
  key,
  ...args
) => {
  const value = messages[key]
  if (value === undefined) return key
  return args.length
    ? value.replace(/\{(\d+)\}/g, (match, index) => String(args[Number(index)] ?? match))
    : value
}
