/**
 * 編輯畫面才有的紙面樣式（頁首小列、選取、放不下的標記、註解卡片）。列印、PDF、匯出不含。
 */
export const EDITOR_CSS = `
.se-stage{--iz:1}
.se-stage .pgwrap{margin:0 0 calc(10px * var(--iz))}
.se-stage .pg{box-shadow:0 2px 14px rgba(0,0,0,.35)}
.pghead{display:flex;align-items:center;gap:calc(8px * var(--iz));height:calc(26px * var(--iz));font-family:var(--font-ui,sans-serif);
  font-size:calc(12px * var(--iz));color:var(--text-muted,#888);padding:0 2px;white-space:nowrap;overflow:hidden}
.pghead-n{font-weight:700;color:var(--accent,#d3a534);letter-spacing:.08em}
.pghead-ck{display:flex;align-items:center;gap:.35em;cursor:pointer}
.pghead-ck input{width:1.1em;height:1.1em;margin:0;accent-color:var(--accent,#d3a534)}
.pghead-sp{flex:1}
.pghead-b{font:inherit;color:var(--text,#ddd);background:var(--surface-2,#333);border:1px solid var(--border,#555);border-radius:4px;padding:.1em .6em;cursor:pointer}
.pghead-b:hover{border-color:var(--accent,#d3a534)}
.pghead-b:focus-visible,.pghead-ck input:focus-visible{outline:2px solid var(--focus,#6af);outline-offset:1px}
.se-stage .bp[data-id]{cursor:pointer}
.se-stage .bp.is-sel{outline:2px solid rgba(211,165,52,.9);outline-offset:1px;background:rgba(211,165,52,.2)}
.se-stage .bp.is-flash{animation:se-flash .7s ease-out}
@keyframes se-flash{0%{background:rgba(211,165,52,.6)}100%{background:transparent}}
@media (prefers-reduced-motion:reduce){.se-stage .bp.is-flash{animation:none}}
.se-stage .bp.npc-over{outline:2px dashed #c0392b;outline-offset:2px;position:relative}
.npc-over-lb{position:absolute;right:2mm;top:-1mm;transform:translateY(-100%);background:#c0392b;color:#fff;font:700 10pt/1.4 var(--font-ui,sans-serif);padding:0 2mm;border-radius:1mm;letter-spacing:.05em}
.se-stage .cmt.is-open{background:rgba(168,51,31,.14)}
`;
