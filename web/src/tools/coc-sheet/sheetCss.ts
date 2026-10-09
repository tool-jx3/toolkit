/**
 * 角色卡紙面（A4 兩頁）的樣式：畫面上的預覽、列印用的 iframe、匯出 PNG（SVG foreignObject）都用這一份。
 * 所有規則都在 `.cs-sheet` 底下；字型只用電腦上的字型（匯出 PNG 時讀不到網頁字型，三種輸出才會一致）。
 * 尺寸用 mm（列印時與紙張一致）。
 */
export const SHEET_ROOT_CLASS = 'cs-sheet';

export const SHEET_CSS = `
.cs-sheet{--ink:#1d2126;--line:#3b4149;--rule:#8a9098;--soft:#e7eaee;--soft2:#f3f5f7;--band:#2f4656;--muted:#646b73;--dim:#c3c7cc;--lh:5.9mm}
.cs-sheet .cs-page{box-sizing:border-box;width:210mm;height:297mm;padding:8mm 9mm;background:#fff;color:var(--ink);display:flex;flex-direction:column;gap:2.2mm;overflow:hidden;position:relative;font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei","Heiti TC","Noto Sans CJK TC","Source Han Sans TC",sans-serif;font-size:8pt;line-height:1.25;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-align:left}
.cs-sheet .cs-page *{box-sizing:border-box}
.cs-sheet .cs-box{border:.3mm solid var(--line);border-radius:1.6mm;overflow:hidden;display:flex;flex-direction:column;min-width:0;min-height:0;background:#fff}
.cs-sheet .cs-head{flex:none;background:var(--band);color:#fff;font-size:8.5pt;font-weight:700;letter-spacing:.18em;padding:.7mm 2.4mm .8mm;white-space:nowrap;overflow:hidden;text-overflow:clip}
.cs-sheet .cs-head small{font-size:6.5pt;font-weight:400;letter-spacing:.05em;opacity:.85;margin-left:1.5mm}
.cs-sheet .cs-title{font-size:10.5pt;letter-spacing:.3em}
.cs-sheet .cs-body{flex:1;min-height:0;padding:1.4mm 2.4mm}
.cs-sheet .cs-lab{font-weight:700;color:var(--muted);font-size:6.8pt;white-space:nowrap}
.cs-sheet .cs-fit{display:block;white-space:nowrap;overflow:hidden;text-overflow:clip;min-width:0}
.cs-sheet .cs-u{border-bottom:.2mm solid var(--rule)}
/* ---------- 第 1 頁：上排（基本資料、屬性、頭像） ---------- */
.cs-sheet .cs-top{display:grid;grid-template-columns:minmax(0,1fr) 86mm 36.4mm;gap:2.2mm;height:44.8mm;flex:none}
.cs-sheet .cs-info .cs-body{display:flex;flex-direction:column;justify-content:space-between;padding:1.2mm 2.4mm 1.6mm}
.cs-sheet .cs-irow{display:flex;gap:2.4mm;align-items:baseline}
.cs-sheet .cs-ifield{display:flex;align-items:baseline;gap:1.4mm;flex:1;min-width:0}
.cs-sheet .cs-ifield .cs-v{flex:1;font-size:9pt;padding:0 .6mm .3mm;min-height:4.2mm}
.cs-sheet .cs-stats .cs-body{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:1mm 2mm;padding:1.2mm 2mm}
.cs-sheet .cs-stat{display:flex;align-items:center;gap:1.2mm;min-width:0}
.cs-sheet .cs-stat-name{flex:1;display:flex;flex-direction:column;align-items:center;line-height:1.05}
.cs-sheet .cs-stat-name b{font-size:10pt;letter-spacing:.04em}
.cs-sheet .cs-stat-name i{font-style:normal;font-size:5.8pt;color:var(--muted);font-weight:700}
.cs-sheet .cs-mov .cs-stat-name b{font-size:8pt;letter-spacing:0}
/* 一般／困難／極限：左邊大框，右邊上下兩個小框 */
.cs-sheet .cs-roll{display:grid;grid-template-columns:var(--rw) var(--sw);grid-template-rows:1fr 1fr;width:calc(var(--rw) + var(--sw));height:var(--rh);flex:none;font-variant-numeric:tabular-nums}
.cs-sheet .cs-roll>span{display:flex;align-items:center;justify-content:center;border:.25mm solid var(--line);margin:0 0 -.25mm -.25mm;line-height:1;overflow:hidden;white-space:nowrap}
.cs-sheet .cs-roll>.cs-r{grid-row:1/3;border-radius:1.2mm 0 0 1.2mm;margin-left:0;font-weight:700}
.cs-sheet .cs-roll>.cs-h{border-top-right-radius:1mm}
.cs-sheet .cs-roll>.cs-x{border-bottom-right-radius:1mm;margin-bottom:0}
.cs-sheet .cs-stat .cs-roll{--rw:9.6mm;--sw:6.4mm;--rh:10mm}
.cs-sheet .cs-stat .cs-r{font-size:12pt}.cs-sheet .cs-stat .cs-r.n3{font-size:9.5pt}.cs-sheet .cs-stat .cs-r.n4{font-size:7.5pt}
.cs-sheet .cs-stat .cs-h,.cs-sheet .cs-stat .cs-x{font-size:7pt}.cs-sheet .cs-stat .n3:not(.cs-r){font-size:6pt}.cs-sheet .cs-stat .n4:not(.cs-r){font-size:5pt}
.cs-sheet .cs-oval{display:flex;align-items:center;justify-content:center;border:.25mm solid var(--line);border-radius:3mm;width:12mm;height:10mm;font-size:12pt;font-weight:700;flex:none;font-variant-numeric:tabular-nums;overflow:hidden;white-space:nowrap}
.cs-sheet .cs-portrait{padding:0}
.cs-sheet .cs-portrait-frame{width:100%;height:100%;position:relative;background:#fff}
.cs-sheet .cs-portrait-frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
/* ---------- 第 1 頁：狀態（自訂欄、生命值、理智、幸運、魔法值） ---------- */
.cs-sheet .cs-status{display:grid;grid-template-columns:38mm minmax(0,1fr);gap:2.2mm;height:47.6mm;flex:none}
.cs-sheet .cs-tracks{display:grid;grid-template-rows:25.4mm minmax(0,1fr);gap:2.2mm;min-width:0}
.cs-sheet .cs-trow{display:grid;gap:2.2mm;min-width:0}
.cs-sheet .cs-trow-1{grid-template-columns:8.4fr 17.6fr}
.cs-sheet .cs-trow-2{grid-template-columns:20.6fr 7.4fr}
.cs-sheet .cs-thead{display:flex;align-items:center;gap:1.6mm;font-size:6.3pt;font-weight:700;color:var(--muted);padding:.6mm 1.6mm;border-bottom:.2mm solid var(--rule);background:var(--soft2);white-space:nowrap;overflow:hidden}
.cs-sheet .cs-thead-2{justify-content:space-between;background:#fff;padding:.5mm 1.6mm}
.cs-sheet .cs-thead .cs-tname{color:var(--ink);font-size:7.6pt;letter-spacing:.12em;margin-right:auto}
.cs-sheet .cs-thead .cs-mini{display:inline-flex;align-items:center;justify-content:center;min-width:7mm;height:3.6mm;border:.25mm solid var(--line);border-radius:.8mm;background:#fff;color:var(--ink);font-size:7pt;padding:0 .6mm;font-variant-numeric:tabular-nums}
.cs-sheet .cs-check{display:inline-flex;align-items:center;justify-content:center;width:2.7mm;height:2.7mm;border:.25mm solid var(--line);border-radius:.4mm;background:#fff;color:var(--ink);font-size:6.5pt;line-height:1;flex:none;font-weight:700}
.cs-sheet .cs-check.off{border-color:transparent;background:transparent}
.cs-sheet .cs-track{flex:1;display:grid;grid-template-columns:repeat(var(--cols),1fr);grid-auto-rows:1fr;padding:.6mm 1mm;font-size:6.4pt;font-variant-numeric:tabular-nums;color:var(--ink);min-height:0}
.cs-sheet .cs-track>span{display:flex;align-items:center;justify-content:center;min-width:0;white-space:nowrap}
.cs-sheet .cs-track>span>i{font-style:normal;display:inline-flex;align-items:center;justify-content:center;width:3.5mm;height:3.1mm;border-radius:50%}
.cs-sheet .cs-track>span.cs-over{color:var(--dim)}
.cs-sheet .cs-track>span.cs-now>i{border:.3mm solid var(--ink);font-weight:700}
.cs-sheet .cs-track>.cs-tlabel{grid-column:span var(--span);font-weight:700;color:var(--muted);font-size:6pt}
.cs-sheet .cs-lines{background-image:linear-gradient(to bottom,transparent calc(100% - .2mm),var(--rule) 0);background-size:100% var(--lh);line-height:var(--lh);height:calc(var(--n) * var(--lh));overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;font-size:8.4pt}
.cs-sheet .cs-custom .cs-body{padding:.6mm 2.2mm 0}
.cs-sheet .cs-custom .cs-lines{--lh:4.85mm;font-size:7.8pt}
/* ---------- 第 1 頁：技能 ---------- */
.cs-sheet .cs-skills{flex:none;height:110mm}
.cs-sheet .cs-sgrid{flex:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(15,1fr);grid-auto-flow:column;column-gap:0;padding:0;min-height:0}
.cs-sheet .cs-sk{display:flex;align-items:center;gap:1mm;padding:0 1.4mm;min-width:0;border-left:.2mm solid var(--soft)}
.cs-sheet .cs-sk:nth-child(-n+15){border-left:0}
.cs-sheet .cs-sk.cs-odd{background:var(--soft2)}
.cs-sheet .cs-skl{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;line-height:1.1;font-size:6.6pt;font-weight:700;overflow:hidden;max-height:100%}
.cs-sheet .cs-skl .cs-base{font-weight:400;color:var(--muted)}
.cs-sheet .cs-skl .cs-cat{font-size:5.6pt}
.cs-sheet .cs-skl .cs-spec{font-size:6.8pt;border-bottom:.2mm solid var(--rule);min-height:3.4mm;white-space:nowrap;overflow:hidden}
.cs-sheet .cs-skl .cs-cus{font-size:6.8pt;border-bottom:.2mm solid var(--rule);min-height:4mm;display:flex;align-items:flex-end;white-space:nowrap;overflow:hidden}
.cs-sheet .cs-sk .cs-roll{--rw:7mm;--sw:4.8mm;--rh:6.1mm;background:#fff}
.cs-sheet .cs-sk .cs-r{font-size:9pt}.cs-sheet .cs-sk .cs-r.n3{font-size:7.4pt}.cs-sheet .cs-sk .cs-r.n4{font-size:6pt}
.cs-sheet .cs-sk .cs-h,.cs-sheet .cs-sk .cs-x{font-size:5.8pt}.cs-sheet .cs-sk .n3:not(.cs-r){font-size:5pt}.cs-sheet .cs-sk .n4:not(.cs-r){font-size:4.4pt}
/* ---------- 第 1 頁：武器、戰鬥 ---------- */
.cs-sheet .cs-bottom{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 34mm;gap:2.2mm}
.cs-sheet .cs-wtable{flex:1;display:flex;flex-direction:column;padding:.6mm 2.2mm 1.4mm;min-height:0}
.cs-sheet .cs-wrow{display:grid;grid-template-columns:28fr 7fr 7fr 7fr 19fr 10fr 9fr 7fr 6fr;gap:1.4mm;align-items:end;flex:1;min-height:0}
.cs-sheet .cs-wrow.cs-whead{flex:none;font-size:6.2pt;font-weight:700;color:var(--muted);padding-bottom:.4mm}
.cs-sheet .cs-wrow.cs-whead>span{text-align:center;white-space:nowrap;overflow:hidden}
.cs-sheet .cs-wrow.cs-whead>span:first-child{text-align:left}
.cs-sheet .cs-wrow>.cs-wc{border-bottom:.2mm solid var(--rule);font-size:8pt;padding:0 .4mm .4mm;text-align:center;min-height:4.4mm}
.cs-sheet .cs-wrow>.cs-wc:first-child{text-align:left}
.cs-sheet .cs-wrow>.cs-num{font-variant-numeric:tabular-nums}
.cs-sheet .cs-combat .cs-body{display:flex;flex-direction:column;justify-content:space-around;padding:1.2mm 2mm}
.cs-sheet .cs-citem{display:flex;align-items:center;gap:1.6mm}
.cs-sheet .cs-citem .cs-lab{flex:1;text-align:center;white-space:normal;line-height:1.15}
.cs-sheet .cs-combat .cs-oval{width:13mm}
.cs-sheet .cs-combat .cs-oval.n4{font-size:9pt}.cs-sheet .cs-combat .cs-oval.n5{font-size:7.5pt}
.cs-sheet .cs-combat .cs-roll{--rw:8.4mm;--sw:5.6mm;--rh:9mm}
.cs-sheet .cs-combat .cs-r{font-size:11pt}.cs-sheet .cs-combat .cs-r.n3{font-size:9pt}
.cs-sheet .cs-combat .cs-h,.cs-sheet .cs-combat .cs-x{font-size:6.5pt}
/* ---------- 第 2 頁 ---------- */
.cs-sheet .cs-story{flex:none}
.cs-sheet .cs-story .cs-body{display:grid;grid-template-columns:1fr 1fr;gap:0 6mm;padding:1.4mm 3mm 2mm}
.cs-sheet .cs-scol{display:flex;flex-direction:column;gap:2mm;min-width:0}
.cs-sheet .cs-scol .cs-lines .cs-lab{font-size:8pt;color:var(--ink);margin-right:2mm}
.cs-sheet .cs-mid{display:grid;grid-template-columns:2fr 1fr;gap:2.2mm;flex:none}
.cs-sheet .cs-gear .cs-body{display:grid;grid-template-columns:1fr 1fr;gap:0 6mm;padding:1mm 3mm 1.6mm}
.cs-sheet .cs-lcol{display:flex;flex-direction:column;min-width:0}
.cs-sheet .cs-line{height:var(--lh);line-height:var(--lh);border-bottom:.2mm solid var(--rule);font-size:8.4pt;padding:0 .6mm}
.cs-sheet .cs-assets .cs-body{padding:1mm 3mm 1.6mm;display:flex;flex-direction:column}
.cs-sheet .cs-line .cs-lab{margin-right:2mm;color:var(--ink);font-size:7.4pt}
.cs-sheet .cs-memo{flex:1;min-height:0}
.cs-sheet .cs-memo .cs-body{padding:1mm 3mm 1.6mm;position:relative}
.cs-sheet .cs-memo-text{columns:2;column-gap:6mm;column-fill:auto;position:relative}
.cs-sheet .cs-memo .cs-gap{position:absolute;top:1mm;bottom:1.6mm;left:calc(50% - 3mm);width:6mm;background:#fff}
.cs-sheet .cs-flag{display:inline-flex;align-items:center;gap:.7mm}
`;

/** 畫面上的預覽：頁面陰影、兩頁之間的間隔（不印出來） */
export const SCREEN_CSS = `
.cs-screen .cs-page{box-shadow:0 1px 6px rgba(0,0,0,.35)}
.cs-screen .cs-page+.cs-page{margin-top:8mm}
`;
