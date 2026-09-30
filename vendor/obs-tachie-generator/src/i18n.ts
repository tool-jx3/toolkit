import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react'

/**
 * TRPG Toolkit 合輯共用 i18n 的 React 端接點（做法同 vendor/ccfolia-character-editor/src/i18n.ts）。
 *
 * 引擎本體（assets/i18n.js）與字典（i18n.obs-tachie.js）在 index.html 以一般 script
 * 載入，於模組執行前就已經掛在 window 上；這裡只是把它包成有型別的介面。
 */
declare global {
  interface Window {
    T: (key: string, ...args: (string | number)[]) => string
    I18N: {
      locale: string
      onChange: (listener: (locale: string) => void) => void
      mountSwitcher: (select: HTMLSelectElement | null) => void
    }
  }
}

/** 取字典裡的譯文。未登錄的 key 會原樣回傳（引擎的行為）。 */
export const t = (key: string, ...args: (string | number)[]): string =>
  typeof window !== 'undefined' && window.T ? window.T(key, ...args) : key

/**
 * 含粗體、程式碼等標記的句子。譯文裡的 `{0}`、`{1}`… 換成對應的 React 節點，
 * 讓各語言可以自由調整語序，而標記本身仍寫在程式碼裡（字典只放純文字）。
 *
 * 例：`tRich('key', <b>…</b>)`，字典值 `'這裡只登錄{0}。'`。
 */
export function tRich(key: string, ...nodes: ReactNode[]): ReactNode[] {
  const out: ReactNode[] = []
  t(key)
    .split(/(\{\d+\})/)
    .forEach((part, i) => {
      const m = /^\{(\d+)\}$/.exec(part)
      if (m) out.push(createElement(Fragment, { key: i }, nodes[Number(m[1])]))
      else if (part !== '') out.push(part)
    })
  return out
}

/**
 * 留在畫面上的訊息。**存 key 而非譯文**，算繪時才用 {@link msgText} 取值，切換語言後就會跟著換。
 * - `args` 可以再放一則訊息（例如「已設定圖片（{0}）」的 {0} 是另一個 key），同樣在算繪時才取值。
 * - `text` 是下層拋出、無法對應 key 的原始訊息（例如瀏覽器的例外），有它時優先顯示。
 */
export interface Msg {
  key: string
  args?: Array<string | number | Msg>
  text?: string
}

/** 把 {@link Msg} 換成目前語言的字串。 */
export function msgText(m: Msg): string {
  if (m.text != null) return m.text
  return t(m.key, ...(m.args ?? []).map((a) => (typeof a === 'object' ? msgText(a) : a)))
}

/**
 * 帶 i18n key 的例外。`message` 是拋出當下的譯文（給主控台看），
 * 畫面則改用 `msg` 在算繪時取值，切換語言後不會停在舊語言。
 */
export class LocalizedError extends Error {
  readonly msg: Msg
  constructor(key: string, ...args: Array<string | number>) {
    super(t(key, ...args))
    this.name = 'LocalizedError'
    this.msg = { key, args }
  }
}

/** 把 catch 到的任意值換成訊息：LocalizedError 用它的 key，其他 Error 用原始訊息，都沒有就用 fallbackKey。 */
export function errorMsg(e: unknown, fallbackKey: string): Msg {
  if (e instanceof LocalizedError) return e.msg
  if (e instanceof Error && e.message) return { key: fallbackKey, text: e.message }
  return { key: fallbackKey }
}

/* 引擎的 onChange 沒有解除訂閱的介面，因此只掛一個監聽器，再由這裡分派給
 * 各元件。元件卸載時從 subscribers 移除，不會殘留。 */
const subscribers = new Set<() => void>()
let bridged = false

function subscribe(notify: () => void): () => void {
  if (!bridged) {
    bridged = true
    window.I18N?.onChange(() => {
      for (const fn of subscribers) fn()
    })
  }
  subscribers.add(notify)
  return () => {
    subscribers.delete(notify)
  }
}

const snapshot = () =>
  typeof window !== 'undefined' && window.I18N ? window.I18N.locale : 'zh-TW'

/**
 * 目前語言。語言一變就重繪呼叫它的元件。
 *
 * 大部分字串是在算繪時才用 t() 取值，所以只要最上層的 App 訂閱就會整棵重繪；
 * 用 useMemo 快取了譯文的地方（OutputPanel 產生的 CSS 註解）要把語言放進相依陣列。
 */
export function useLocale(): string {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
