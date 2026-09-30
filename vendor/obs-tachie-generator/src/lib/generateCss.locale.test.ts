/* 【TRPG Toolkit 收錄時新增】輸出 CSS 的語言切換。
 *
 * 輸出 CSS 裡給人看的註解跟著產生當下的語言，但選擇器、屬性、Streamkit 的 class 名稱
 * 與整體結構不能因語言而變。這裡以 zh-TW 與 ja 各產生一次，拿掉註解後逐字比對。 */
import { afterEach, describe, expect, it } from 'vitest'
import dictSource from '../../../../tools/obs-tachie/i18n.obs-tachie.js?raw'
import { generateCombinedCss, generateCss, generateStandaloneCss } from './generateCss'
import { DEFAULT_OPTIONS, type GenerateOptions, type TachieUser } from './types'

type Dict = Record<string, string>
let dictionaries: Record<string, Dict> = {}
new Function('I18N', dictSource)({
  register: (d: Record<string, Dict>) => {
    dictionaries = d
  },
})

type TFn = (key: string, ...args: Array<string | number>) => string
const g = globalThis as unknown as { T: TFn }
const original = g.T

function switchLocale(locale: 'zh-TW' | 'ja') {
  const messages = dictionaries[locale]
  g.T = (key, ...args) => {
    const value = messages[key]
    if (value === undefined) return key
    return value.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m))
  }
}

afterEach(() => {
  g.T = original
})

/* 平假名、片假名、半形片假名（以跳脫序列表示，原始碼本身不含假名）。 */
const KANA = /[\u3041-\u3096\u30A1-\u30FA\uFF66-\uFF9D]/
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '/**/')

const USER: TachieUser = {
  id: '123456789012345678',
  name: 'Alice',
  displayName: 'Alice',
  imageUrl: 'data:image/png;base64,AAAA',
}

const opts = (over: Partial<GenerateOptions> = {}): GenerateOptions => ({
  ...DEFAULT_OPTIONS,
  ...over,
  speak: { ...DEFAULT_OPTIONS.speak, ...(over.speak ?? {}) },
  nameLabel: { ...DEFAULT_OPTIONS.nameLabel, ...(over.nameLabel ?? {}) },
})

/* 盡量走過每一段會輸出註解的分支。 */
const CASES: Array<[string, () => string]> = [
  ['預設', () => generateStandaloneCss(USER, opts())],
  ['背景圖片方式（有實際尺寸）', () =>
    generateStandaloneCss(USER, opts({ imageNaturalWidth: 600, imageNaturalHeight: 900 }))],
  ['名字＋實測寬度＋在場時才顯示', () =>
    generateStandaloneCss(
      USER,
      opts({
        hideWhenAway: true,
        dimWhenQuiet: true,
        imageNaturalWidth: 400,
        nameLabel: { ...DEFAULT_OPTIONS.nameLabel, show: true, align: 'center' },
      }),
    )],
  ['合併版', () => generateCombinedCss([USER, { ...USER, id: '42' }], opts())],
  ['多人常駐的注記', () => generateCss([USER, { ...USER, id: '42' }], opts())],
  ['沒有使用者', () => generateCss([], opts())],
]

describe('輸出 CSS 的註解跟著語言，其餘不變', () => {
  for (const [label, make] of CASES) {
    it(`${label}：拿掉註解後 zh-TW 與 ja 逐字相同`, () => {
      switchLocale('ja')
      const ja = make()
      switchLocale('zh-TW')
      const zh = make()
      expect(zh).not.toBe(ja)
      expect(stripComments(zh)).toBe(stripComments(ja))
      expect(KANA.test(zh)).toBe(false)
    })
  }

  it('css.* 的譯文不含會提早結束註解的序列', () => {
    for (const locale of ['zh-TW', 'ja']) {
      for (const [key, value] of Object.entries(dictionaries[locale])) {
        if (key.startsWith('css.')) expect(value).not.toContain('*/')
      }
    }
  })
})
