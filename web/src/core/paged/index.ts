/**
 * core/paged：書頁的排版與輸出（劇本排版台、CoC 劇本排版工具共用）。
 *
 * - units：mm／pt／px 換算、紙張大小、縮放階段、檔名
 * - paginate：依瀏覽器實際排版量溢出的自動分頁（項目不切開）
 * - print：用看不見的 iframe 列印（可另存 PDF）
 * - pdf：讀排好的版面直接產生 PDF（pdf-lib＋fontkit；文字是真的文字、只嵌入用到的字）。
 *   pdf-lib 很大，所以不從這裡匯出：要用時 `await import('@/core/paged/pdf')`（按下載時才載入）。
 */
export * from './paginate';
export * from './print';
export * from './units';
