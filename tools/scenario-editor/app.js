/* 劇本排版台（TRPG Toolkit 收錄版）主程式
 * 上游：sedn14636361/trpg-scenario-editor v3.3.0（commit a6387e0；日文原名即字典 ja 的 app.title），CC0 1.0。
 * 收錄版的改動：介面文字改走 ../../assets/i18n.js 的字典（i18n.scenario-editor.js），
 * 註解譯成繁體中文，NPC 卡的各系統資料表拆到 npc-data.js。
 * 原稿的標記語法、存檔格式（IndexedDB／localStorage 的名稱與 key、JSON）與上游相同。 */
/* ================= 紙面的 CSS（編輯畫面與匯出 HTML 共用） ================= */
const DOC_CSS = `
.page{--paper:#f7f3ea;position:relative;width:210mm;height:297mm;background:var(--paper);color:#23201c;overflow:hidden;
  font-family:"Hiragino Mincho ProN","Yu Mincho",YuMincho,"Noto Serif JP","PMingLiU","Noto Serif TC",serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.page-bg,.page-img{position:absolute;inset:0;z-index:0;pointer-events:none}
.page-body{position:relative;z-index:1;height:100%;overflow:hidden}
/* 段落做成「透明外框 .blkpad」與「內容 .blk」兩層。
   位在欄頂端的區塊，margin-top 會被瀏覽器截掉而使間距改變，
   所以上方間距改由外框的 padding 負責。padding 不會被截掉，
   因此不論在欄首還是欄中，標題上方的間距都一樣寬。 */
.blkpad{padding:0}
.blk{margin:0 0 2mm;white-space:pre-wrap;word-break:normal;line-break:strict;overflow-wrap:anywhere}
/* 以頁為單位的分欄。column-fill:auto 會先把左欄填滿再流到右欄 */
.page-body.cols2{column-count:2;column-gap:7mm;column-rule:1px solid rgba(35,32,28,.18);column-fill:auto}
/* 跨欄、以全寬放置的區塊（標題、NPC 表等） */
.blkpad.span{column-span:all}
.blk:focus{outline:none}

.t-title{font-size:2.6em;text-align:center;letter-spacing:.16em;line-height:1.35;margin:0 0 3mm;font-weight:600}
.t-subtitle{font-size:1.15em;text-align:center;letter-spacing:.34em;color:#6d6353;margin:0 0 9mm}
.t-h1{font-size:1.6em;letter-spacing:.12em;background:#23201c;color:#f7f3ea;padding:1.6mm 4mm;margin:0 0 3.5mm;font-weight:600}
.t-h2{font-size:1.3em;letter-spacing:.06em;margin:0 0 2.5mm;padding:0 0 1mm 3.5mm;border-left:3.5px solid #a8331f;border-bottom:1px solid rgba(35,32,28,.25)}
.t-h3{font-size:1.08em;font-weight:700;color:#5c4a33;margin:0 0 2mm}
.t-h3::before{content:"◆ ";color:#a8331f;font-size:.85em}
.t-desc{line-height:1.9;margin:0 0 2.2mm}
.t-dialog{line-height:1.85;color:#1c2b3c}
.t-dialog .sp{display:block;font-size:.78em;font-weight:700;letter-spacing:.12em;
  color:#5c4a33;margin:0 0 .1em;line-height:1.3}
.t-note{font-size:.86em;line-height:1.75;color:#5f5849;background:rgba(35,32,28,.05);border-left:2px solid rgba(35,32,28,.35);padding:2mm 3mm;margin:0 0}
/* 處理系（把技能檢定、特殊規則整理在一起的框）。
   框線形狀、左側粗線、底色、字級、顏色都可以各自選擇。
   顏色放進 --bxc（線與小標）和 --bxf（底色），一次套用。 */
.t-proc{line-height:1.8;padding:2.5mm 3.5mm;margin:0 0}
.t-proc.bx-sm{font-size:.95em}
.t-proc.bx-l-solid{border:1.3px solid var(--bxl)}
.t-proc.bx-l-dash{border:1.3px dashed var(--bxc)}
.t-proc.bx-l-none{border:0;padding-left:0;padding-right:0}
.t-proc.bx-bar{border-left:5px solid var(--bxc);padding-left:3.5mm}
.t-proc.bx-fill{background:var(--bxf)}
.t-lb{display:block;font-size:.75em;letter-spacing:.28em;font-weight:700;margin-bottom:1mm;outline:none;white-space:pre-wrap}
.t-proc .t-lb{color:var(--bxc)}
.t-lb:empty::before{content:attr(data-ph);color:#b9ad97;font-weight:400;letter-spacing:.04em}
/* 加了註解的文字。為了不妨礙閱讀，只加淡淡的底線與小小的編號 */
.cmt{border-bottom:1px dotted rgba(168,51,31,.75);cursor:help;outline:none}
.cmt:hover,.cmt:focus{background:rgba(168,51,31,.10)}
.cmt-n{font-size:.6em;color:#a8331f;vertical-align:super;line-height:0;margin-left:.1em;font-weight:700}
@media print{ .cmt{border-bottom:0} .cmt-n{display:none} }
/* 框內的小標與巢狀書式 */
.bx-p{white-space:pre-wrap;margin:0 0 1.2mm}
.bx-p:last-child{margin-bottom:0}
.bx-h{font-weight:700;font-size:.92em;letter-spacing:.06em;color:var(--bxc,#a8331f);margin:1.8mm 0 .8mm;
  padding-left:.6em;border-left:2.5px solid var(--bxc,#a8331f)}
.bx-h:first-child{margin-top:0}
/* 小一號的小標，以及框內的注釋 */
.bx-hs{font-weight:700;font-size:.9em;letter-spacing:.04em;margin:1.4mm 0 .5mm}
.bx-hs:first-child{margin-top:0}
.bx-note{white-space:pre-wrap;font-size:.84em;line-height:1.7;color:#5f5849;
  border-left:2px solid rgba(35,32,28,.3);padding:.2mm 0 .2mm 2mm;margin:1.2mm 0}
.bx-note:first-child{margin-top:0}
.bx-note:last-child{margin-bottom:0}
.bx-in{border:1.2px dashed var(--bxc,#a8331f);background:var(--bxf,rgba(168,51,31,.05));border-radius:1mm;
  padding:1.8mm 2.5mm;margin:1.8mm 0}
.bx-in .t-lb{font-size:.72em;margin-bottom:.8mm;color:var(--bxc,#a8331f)}
/* 條列 */
/* 巢狀書式。為了放在內文中也不走樣，
   清單與表格把 white-space 改回一般值 */
.blk.hasrich{white-space:normal}
.blk.hasrich .bx-p{white-space:pre-wrap}
.bx-t{white-space:pre-wrap;line-height:1.85;color:#1c2b3c;margin:0 0 1.2mm}
.bx-t .sp{display:block;font-size:.78em;font-weight:700;letter-spacing:.12em;
  color:#5c4a33;margin:0 0 .1em;line-height:1.3}
.bx-tbl{width:100%;border-collapse:collapse;font-size:.9em;margin:1.2mm 0;white-space:normal}
.bx-tbl th,.bx-tbl td{border:1px solid rgba(35,32,28,.4);padding:.8mm 1.5mm;text-align:left;line-height:1.6;
  white-space:pre-wrap}
.bx-tbl th{background:rgba(35,32,28,.07);font-weight:700}
.pop-p{white-space:pre-wrap;margin:0 0 1.2mm}
/* 另開視窗裡的標題。配合紙面的標題，但稍微收斂一點 */
.bx-h1{font-size:1.25em;font-weight:700;letter-spacing:.08em;color:#f7f3ea;background:#23201c;
  padding:1mm 2.5mm;margin:3mm 0 1.6mm}
.bx-h1:first-child{margin-top:0}
.bx-h2{font-size:1.12em;letter-spacing:.05em;margin:2.6mm 0 1.4mm;padding:0 0 .6mm 2.5mm;
  border-left:3px solid #a8331f;border-bottom:1px solid rgba(35,32,28,.25)}
.bx-h2:first-child{margin-top:0}
.bx-h3{font-size:1.02em;font-weight:700;color:#5c4a33;margin:2mm 0 1mm}
.bx-h3::before{content:"◆ ";color:#a8331f;font-size:.85em}
.bx-h3:first-child{margin-top:0}
ul.ls{list-style:none;margin:1.2mm 0;padding:0;white-space:normal}
ul.ls:first-child{margin-top:0}
ul.ls:last-child{margin-bottom:0}
ul.ls li{display:flex;gap:.5em;line-height:1.85;margin:0 0 .6mm}
ul.ls li.lv1{padding-left:1.6em}
ul.ls li.lv2{padding-left:3.2em}
ul.ls li.lv3{padding-left:4.8em}
ul.ls .mk{flex:0 0 auto;color:#a8331f;min-width:1.1em}
ul.ls-num .mk{color:#5c4a33;font-variant-numeric:tabular-nums}
ul.ls-box .mk{color:#23201c}
.t-proc ul.ls .mk{color:var(--bxc)}
.t-proc .bx-t .sp{color:var(--bxc)}
.t-proc .bx-tbl th{background:var(--bxf,rgba(35,32,28,.07))}
ul.ls .tx{flex:1;min-width:0;white-space:pre-wrap}
.fw-empty{color:#8a7d63;font-size:.85em}
/* 流程圖：箱子可自由擺放，再用線連起來。
   形狀與線用 SVG，文字用疊在上面的 HTML。容器實際尺寸與 viewBox 保持相同比例，
   所以放大縮小時線的粗細與文字位置都不會跑掉。 */
.t-flow{white-space:normal;break-inside:avoid}
/* 寬度照指定值保持。若配合狹窄的空間縮小，
   只有 SVG（形狀與線）會縮，以 mm 定位的文字會被留在原地而錯位 */
.fwc{position:relative;margin:0 auto}
.fwsvg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.fwsvg .fwe-t{font-size:2.6px;fill:#a8331f}
.fwn{position:absolute;display:flex;flex-direction:column;align-items:center;
  justify-content:center;text-align:center;line-height:1.45;font-size:.86em;
  white-space:pre-wrap;overflow:hidden;box-sizing:border-box}
.fwn-a,.fwn-b{width:100%;min-width:0}
.fwn.two{justify-content:flex-start}
.fwn.two .fwn-a{flex:1;display:flex;align-items:center;justify-content:center}
.fwn.two .fwn-b{flex:1;display:flex;align-items:center;justify-content:center;font-size:.92em}
/* 菱形內側較窄，所以左右稍微收緊、字也小一點 */
.fwn.k-diamond{padding-left:11%!important;padding-right:11%!important;font-size:.78em}
.fwn.k-io{padding-left:9%!important;padding-right:9%!important}

/* 場景轉換：靠右、比內文小一點，粗體加底線 */
/* 封面：放大置於頁面中央附近 */
.t-cover{text-align:center;font-size:2.9em;letter-spacing:.22em;line-height:1.5;font-weight:600;
  margin:0 0 8mm;break-after:avoid}
/* 版權頁：字小，上方加分隔線 */
.t-colophon{font-size:.76em;line-height:2;color:#5f5849;letter-spacing:.04em;
  border-top:1px solid rgba(35,32,28,.45);padding-top:3.5mm;margin:0 0 0}
/* 橫線：畫一條橫線。輸入文字的話，會當成小標放在線的中段 */
.t-hr{border-top:1px solid rgba(35,32,28,.5);margin:0 0;padding:0;height:0;overflow:visible;
  text-align:center;font-size:.78em;color:#5f5849;letter-spacing:.2em;line-height:0}
.t-hr:not(:empty){height:auto;line-height:1.4;border-top:0;display:block;
  background:linear-gradient(rgba(35,32,28,.5),rgba(35,32,28,.5)) 0 50%/100% 1px no-repeat}
.t-hr .hrtx{background:var(--paper,#f7f3ea);padding:0 3mm}
/* 直線：在欄旁立一條直線，文字放在右側 */
.t-vr{border-left:2px solid rgba(35,32,28,.55);padding-left:3mm;margin:0 0;line-height:1.9;min-height:8mm}
.t-scene{text-align:right;font-size:.88em;font-weight:700;text-decoration:underline;
  text-underline-offset:.28em;line-height:1.8;margin:0 0 3mm;letter-spacing:.06em;break-after:avoid}

/* NPC 表 */
.t-npc{white-space:normal;border:1.3px solid rgba(35,32,28,.55);background:rgba(35,32,28,.03);padding:3mm 4mm 3.5mm;margin:0 0;font-size:1em}
@media print{.npc-noprint{display:none !important}}
.npc-sysbar{display:flex;flex-wrap:wrap;gap:2mm 4mm;align-items:flex-end;font-size:.78em;color:#6d6353;margin:0 0 2mm}
.npc-sysbar label{display:flex;flex-direction:column;align-items:flex-start;gap:.6mm;line-height:1.2}
.npc-sysbar select{font-family:inherit;font-size:1em;background:#fff;border:1px solid rgba(35,32,28,.35);border-radius:3px;padding:.8mm 2mm}
.npc-head{display:flex;align-items:flex-end;gap:1mm 3mm;border-bottom:1.3px solid #a8331f;padding-bottom:1.2mm;margin:0 0 2mm;flex-wrap:wrap}
/* 名字一帶。讀音放在名字上方，左端對齊，像注音（ruby）一樣縮小 */
.npc-nameblk{display:flex;flex-direction:column;align-items:flex-start;gap:0;min-width:0;flex:0 1 auto}
.npc-kana{font-size:.62em;color:#6d6353;letter-spacing:.14em;line-height:1.3;
  border:0;background:transparent;padding:0 0 0 .1em;margin:0;width:auto;min-width:22mm}
input.npc-kana{border-bottom:1px dotted rgba(35,32,28,.28)}
.npc-name{padding-left:0;margin:0}
.npc-role{font-size:.82em;color:#5f5849;flex:1 1 auto;min-width:0;padding-bottom:.15em}
/* 附立繪的表。內容靠左，立繪放右邊 */
.npc-arwrap{display:flex;gap:4mm;align-items:flex-start}
.npc-arbody{flex:1 1 auto;min-width:0}
.npc-art{align-self:stretch;display:flex;flex-direction:column;align-items:center;gap:1.5mm}
.npc-art img{max-width:100%;max-height:150mm;object-fit:contain;display:block;
  border:1px solid rgba(35,32,28,.25)}
input.npc-artw{width:3.4em;font-family:inherit;font-size:1em;background:#fff !important;color:#23201c !important;
  border:1px solid rgba(35,32,28,.4);border-radius:3px;padding:.4mm 1.2mm;text-align:center}
.npc-artbar{display:flex;flex-wrap:wrap;gap:1mm 2mm;align-items:center;justify-content:center;
  font-size:.72em;color:#6d6353;width:100%}
.npc-artbar label{display:inline-flex;gap:.6mm;align-items:center}
.t-npc .npc-artbar button{font:inherit;font-size:1em;cursor:pointer;width:auto;background:#efe7d8;color:#5c4a33;
  border:1px solid rgba(35,32,28,.3);border-radius:1mm;padding:.3mm 2mm}
.t-npc .npc-artbar button:hover{background:#e2d5bd;color:#23201c}
/* 自己加的分頁 */
.npc-tabttl{flex:1;min-width:0;font-size:.9em}
.npc-tabdel{font:inherit;font-size:.85em;cursor:pointer;background:transparent;color:#8a7d63;
  border:1px solid rgba(35,32,28,.3);border-radius:3px;padding:0 1.6mm;line-height:1.6}
.npc-tabdel:hover{background:#a8331f;color:#fff;border-color:#a8331f}
.npc-tabadd{margin:1.5mm 0 0}
.npc-tabadd button{font:inherit;font-size:.8em;cursor:pointer;background:transparent;color:#6d6353;
  border:1px dashed rgba(35,32,28,.4);border-radius:3px;padding:.8mm 3mm}
.npc-tabadd button:hover{border-color:#a8331f;color:#a8331f}
.npc-tag{display:inline-block;font-size:.62em;letter-spacing:.1em;color:#f7f3ea;background:#a8331f;padding:.6mm 2mm;border-radius:2mm;white-space:nowrap;margin-left:auto;align-self:flex-end}
.npc-name{font-size:1.2em;font-weight:700;min-width:3em;outline:none}
.npc-role{font-size:.82em;color:#6d6353;min-width:3em;outline:none}
.npc-grid{display:grid;gap:.6mm;margin:0 0 2mm;font-size:.86em}
.npc-grid.c8{grid-template-columns:repeat(8,1fr)}
/* DX3rd：血統（Breed）三選一 */
.t-npc .dxseg{display:inline-flex;gap:.6mm}
.t-npc .dxseg button{font:inherit;font-size:.86em;padding:0 1.4mm;cursor:pointer;
  border:1px solid rgba(35,32,28,.4);background:transparent;border-radius:.6mm;color:#5f5849}
.t-npc .dxseg button.on{background:#23201c;color:#f7f3ea;border-color:#23201c}
/* 症候群（Syndrome）加上所選顏色的底線，排成一行 */
.t-npc .dxsyns{display:inline-flex;gap:1mm;flex-wrap:nowrap;min-width:0;flex:1}
.t-npc select.dxsynsel{min-width:0;flex:1 1 0;border-bottom:1.6px solid var(--kc,rgba(35,32,28,.35))}
.t-npc .dxsyn{display:inline-block;font-size:.9em;padding:0 1mm;margin-right:1mm;
  border-bottom:1.6px solid var(--kc);color:var(--kc);font-weight:700}
.t-npc .dxhead .fld{min-width:0}
.t-npc .dxhead .fld:nth-child(2){flex:1 1 46%;min-width:0}
/* 效果（Effect）：把種類的顏色標在列的左端與種類名稱上 */
.t-npc .npc-dxeff td.dxeffn{border-left:2.2px solid var(--kc,transparent)}
.t-npc .dxkind{display:block;font-size:.68em;letter-spacing:.04em;color:var(--kc);font-weight:700;line-height:1.3}
.t-npc select.dxkindsel{width:100%;font-size:.76em;color:#6d6353;margin-bottom:.3mm}
/* 組合技（Combo）：不做成表格，而是縱向堆疊，內部再分欄 */
.t-npc .dxcbs{display:flex;flex-direction:column;gap:1.4mm}
.t-npc .dxcb{border:1px solid rgba(35,32,28,.35);border-left:2.2px solid #23201c;padding:1mm 1.6mm}
.t-npc .dxcb-h{font-weight:700;font-size:.95em;border-bottom:1px dotted rgba(35,32,28,.3);padding-bottom:.4mm}
.t-npc .dxcb-g{display:grid;grid-template-columns:repeat(4,1fr);gap:.4mm 1.4mm;margin-top:.8mm}
.t-npc .dxcb-pick{display:flex;flex-wrap:wrap;gap:.8mm;align-items:center;margin:.4mm 0 .6mm}
.t-npc select.dxpick{flex:1 1 34%;min-width:0;font-size:.9em}
.t-npc .dxcb-pb{flex:0 0 auto;display:inline-flex;gap:.6mm}
.t-npc .dxcb-pb button{font:inherit;font-size:.8em;padding:0 1.2mm;cursor:pointer;
  border:1px solid rgba(35,32,28,.4);background:rgba(35,32,28,.05);border-radius:.6mm;color:#5f5849}
.t-npc .dxcb-pb button:disabled{opacity:.4;cursor:default}
@media print{ .t-npc .dxcb-pb{display:none !important} }
.t-npc .dxcb-c{display:flex;align-items:baseline;gap:.8mm;min-width:0}
.t-npc .dxcb-c .k{flex:0 0 auto;font-size:.68em;color:#6d6353}
.t-npc .dxcb-c .v{flex:1;min-width:0;font-size:.9em}
.t-npc .dxcb-f{display:flex;align-items:baseline;gap:.8mm;margin-top:.6mm;
  border-top:1px dotted rgba(35,32,28,.25);padding-top:.5mm}
.t-npc .dxcb-f .k{flex:0 0 auto;font-size:.68em;color:#6d6353}
.t-npc .dxcb-f input{flex:1;min-width:0}
@media (max-width:620px){ .t-npc .dxcb-g{grid-template-columns:repeat(3,1fr)} }
.t-npc .npc-mini{font:inherit;font-size:.72em;padding:0 .8mm;margin-left:.6mm;cursor:pointer;
  border:1px solid rgba(35,32,28,.4);background:rgba(35,32,28,.05);border-radius:.6mm;color:#5f5849}
.t-npc .npc-rowct{font-size:.72em;color:#8a7f6b;margin-left:1mm}
@media print{ .t-npc .npc-mini,.t-npc .npc-rowct{display:none !important} }
.npc-cell{border:1px solid rgba(35,32,28,.35);text-align:center}
.npc-cell .k{display:block;font-size:.72em;color:#6d6353;background:rgba(35,32,28,.06);padding:.3mm 0}
.npc-cell .v{display:block;min-height:1.3em;padding:.5mm 0;outline:none}
.npc-row{display:flex;flex-wrap:wrap;gap:1.5mm 4mm;margin:0 0 2mm;font-size:.86em}
.npc-row .fld{display:flex;align-items:baseline;gap:1mm}
.npc-row .fld .k{color:#6d6353;font-size:.85em;white-space:nowrap}
.npc-row .fld .v{min-width:2em;border-bottom:1px solid rgba(35,32,28,.4);padding:0 .5mm;outline:none}
.npc-sub{font-size:.74em;letter-spacing:.18em;color:#a8331f;font-weight:700;margin:2mm 0 1mm}
.npc-table{width:100%;border-collapse:collapse;font-size:.84em;margin:0 0 1.5mm}
.npc-table th,.npc-table td{border:1px solid rgba(35,32,28,.35);padding:.8mm 1.2mm;text-align:center}
.npc-table th{background:rgba(35,32,28,.07);font-weight:700}
.npc-table td[contenteditable]{outline:none}
.npc-table td.tl{text-align:left}
.npc-memo{white-space:pre-wrap;border:1px solid rgba(35,32,28,.35);background:rgba(255,255,255,.5);padding:1.5mm 2.5mm;min-height:5mm;font-size:.92em;line-height:1.7;outline:none}
.npc-memo:empty:before{content:attr(data-ph);color:rgba(35,32,28,.32)}
.npc-ph{color:rgba(35,32,28,.3)}

/* 輸入欄：附候選清單。可以選擇，也可以手動輸入。
   為了壓過編輯畫面那邊深色表單的 CSS（input[type=text]{background:#0e1219…}），
   同時寫出元素名稱與 class 以提高權重。 */
.t-npc input.npc-i,.t-npc select.npc-s{
  font:inherit;color:#23201c;background:transparent;border:0;border-radius:0;padding:0 .4mm;
  width:100%;min-width:0;text-align:center;outline:none;box-shadow:none;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.t-npc select.npc-s{font-size:.95em}
.t-npc input.npc-i:focus,.t-npc select.npc-s:focus{background:rgba(211,165,52,.25)}
.t-npc input.npc-i::placeholder{color:rgba(35,32,28,.32)}
.t-npc input.npc-i.isauto{}
.t-npc input.npc-i.tl{text-align:left}
.t-npc input.npc-i.npc-name{font-size:1.2em;font-weight:700;width:9em;flex:0 0 auto;text-align:left;
  border-bottom:1px solid rgba(35,32,28,.25)}
.t-npc input.npc-i.npc-role{font-size:.82em;color:#6d6353;width:auto;flex:1 1 12em;text-align:left;
  border-bottom:1px solid rgba(35,32,28,.25)}
/* .t-npc input.npc-i 的 font:inherit 會抵銷 .npc-kana 的小字，
   所以輸入欄這邊也寫上同樣的大小 */
.t-npc input.npc-i.npc-kana{width:9em;flex:0 0 auto;text-align:left;
  font-size:.62em;color:#6d6353;letter-spacing:.14em;line-height:1.3;padding:0 0 0 .1em}
.t-npc .npc-row input.npc-i{width:5.5em;border-bottom:1px solid rgba(35,32,28,.4)}
.t-npc select.npc-s.isauto{}
.npc-grid.c3{grid-template-columns:repeat(3,1fr)}
/* 雙重十字（Double Cross）：在能力值右側排出參照該能力的技能。
   不畫直線，只用細橫線構成表格。
   為了讓位數不錯開，能力值與技能用格線（grid）的欄來決定位置。
   即使是有種類自由輸入欄的技能（運轉・藝術・知識・情報），
   數值欄也會和其他技能在同一個位置、同一條下緣。 */
.dxgrid{display:grid;grid-template-columns:6.6em repeat(3,minmax(0,1fr));
  margin:0 0 2mm;font-size:.86em}
.dxrow{display:contents}
.dxab,.dxsk{display:grid;grid-template-columns:3.5em minmax(0,1fr) 2.6em;
  align-items:end;column-gap:.4em;min-width:0;
  border-bottom:1px solid rgba(35,32,28,.25);padding:.9mm .6mm .5mm}
.dxab{grid-template-columns:2.6em minmax(0,1fr) 2.6em;background:rgba(35,32,28,.05)}
.dxab .k{font-weight:700;color:#23201c;white-space:nowrap}
.dxsk .k{color:#6d6353;font-size:.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxsp{min-width:0}
.t-npc input.npc-i.dxabv,.t-npc input.npc-i.dxval{width:100%;border-bottom:1px solid rgba(35,32,28,.4);text-align:center}
.t-npc input.npc-i.dxarg{width:100%;border-bottom:1px dotted rgba(35,32,28,.4);font-size:.9em;text-align:left}
.dxargv{border-bottom:1px dotted rgba(35,32,28,.3);padding:0 .3mm;display:block;
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9em}
.dxvalv{border-bottom:1px solid rgba(35,32,28,.3);padding:0 .3mm;display:block;text-align:center}
@media (max-width:560px){ .dxgrid{grid-template-columns:5.4em repeat(3,minmax(0,1fr))} }
/* 技能表把寬度寫死。直接對 td 套 flex 會讓它失去儲存格的作用，
   各列的高度與位置會錯開，所以在裡面夾一層 div，改讓它 flex。 */
.npc-skilltable{table-layout:fixed}
.npc-skilltable th:nth-child(1),.npc-skilltable td:nth-child(1){width:auto}
.npc-skilltable th:nth-child(2),.npc-skilltable td:nth-child(2){width:23%}
.npc-skilltable th:nth-child(3),.npc-skilltable td:nth-child(3){width:9%}
.npc-skilltable th:nth-child(4),.npc-skilltable td:nth-child(4){width:13%}
.npc-skilltable td{vertical-align:middle;height:1.9em}
.t-npc td.skillcell{padding-top:.6mm;padding-bottom:.6mm}
.t-npc .skwrap{display:flex;gap:1mm;align-items:center;flex-wrap:nowrap;min-width:0}
.t-npc .skwrap select.npc-cat{flex:0 0 6.5em;font-size:.85em;color:#6d6353;min-width:0}
.t-npc .skwrap select.npc-skname{flex:1 1 auto;min-width:0}
.t-npc input.npc-i.npc-arg{flex:0 0 5.5em;min-width:0;border-bottom:1px solid rgba(35,32,28,.4)}
.t-npc .refcell select.npc-s{width:100%;min-width:0}
.npc-skilltable td>input.npc-i{width:100%;min-width:0;text-align:center}
.t-npc .npc-res .v{display:flex;flex-direction:row;align-items:center;gap:1mm;padding:.5mm 1mm}
.t-npc .npc-res select.npc-s{min-width:0}
.t-npc .npc-res select.npc-s:first-child{flex:0 0 34%;font-size:.82em;color:#6d6353}
.t-npc .npc-res select.npc-s:last-child{flex:1 1 auto}

/* 點標題就能開合的區塊 */
.npc-acc{margin:2mm 0 0}
.t-npc .npc-acc-h{display:flex;align-items:center;gap:1.5mm;width:100%;
  background:rgba(35,32,28,.05);border-left:2.5px solid #a8331f;padding:1mm 2mm;margin:0 0 1mm}
.t-npc button.npc-acc-t{display:flex;align-items:center;gap:1.5mm;text-align:left;cursor:pointer;
  font:inherit;font-size:.74em;letter-spacing:.18em;font-weight:700;color:#a8331f;
  background:transparent;border:0;border-radius:0;padding:0;margin:0;width:auto}
.t-npc .npc-acc-h:hover{background:rgba(168,51,31,.12)}
.npc-acc-mark{font-size:.9em;letter-spacing:0}
.npc-rowbtn{margin-left:2mm;display:inline-flex;gap:1.5mm}
.t-npc .npc-rowbtn button{font:inherit;font-size:.8em;letter-spacing:.02em;font-weight:400;cursor:pointer;
  background:#efe7d8;color:#5c4a33;border:1px solid rgba(35,32,28,.3);border-radius:1mm;padding:.3mm 2mm;width:auto}
.t-npc .npc-rowbtn button:hover{background:#e2d5bd;color:#23201c}
.t-npc .npc-rowbtn button:disabled{opacity:.4;cursor:default}
.t-npc .npc-rowbtn button:disabled:hover{background:transparent;color:inherit}
.t-npc button.npc-ccf{font:inherit;font-size:.95em;cursor:pointer;background:#23201c;color:#f7f3ea;
  border:0;border-radius:2mm;padding:1mm 3mm;letter-spacing:.04em;width:auto}
.t-npc button.npc-ccf:hover{background:#a8331f;color:#fff}
.t-npc button.npc-open{background:#5c4a33}
.blk.t-npc.npc-over{outline:2px dashed var(--vermilion);outline-offset:2px}
.blk.t-npc.npc-over::after{content:var(--npc-over-msg);
  display:block;margin-top:1.5mm;font-size:.7em;color:#a8331f;letter-spacing:.04em}
@media print{ .blk.t-npc.npc-over{outline:none} .blk.t-npc.npc-over::after{display:none} }
.t-npc .npc-sysbar select{color:#23201c}
@media print{
  .t-npc input.npc-i,.t-npc select.npc-s{border-bottom-color:transparent !important;background:transparent !important}
  .t-npc input.npc-i::placeholder{color:transparent}
  .npc-rowbtn{display:none !important}
  /* 開著的視窗、註解卡片、選擇器都不印到紙上 */
  #cmtRail,#npcDlg,#popDlg,#flowDlg,#tblDlg,#ccfDlg,#ccfInDlg,#ytDlg,#prevDlg,#outDlg,#helpDlg,#fontDlg,#prjDlg,#saveBar{display:none !important}
  .t-npc select.dxpick,.t-npc select.dxkindsel,.t-npc .dxseg{display:none !important}
  .t-npc .skwrap select.npc-cat{display:none !important}
  .t-npc .npc-res select.npc-s:first-child{display:none !important}
  .t-npc .npc-acc-h{background:transparent;border-left-color:#a8331f}
  .t-npc button.npc-acc-t{color:#a8331f}
  .npc-tabdel,.npc-tabadd{display:none !important}
  .npc-acc-mark{display:none !important}
}

/* 背景花紋 */
.bg-grid{background-image:linear-gradient(rgba(35,32,28,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(35,32,28,.10) 1px,transparent 1px);background-size:5mm 5mm}
.bg-rule{background-image:linear-gradient(rgba(35,32,28,.13) 1px,transparent 1px);background-size:100% 8mm}
.bg-dot{background-image:radial-gradient(rgba(35,32,28,.18) 1px,transparent 1.2px);background-size:4mm 4mm}
.bg-paper{background-image:radial-gradient(rgba(120,95,50,.10) 1px,transparent 2px),radial-gradient(rgba(90,70,35,.07) 2px,transparent 4px);background-size:7mm 7mm,13mm 13mm;background-position:0 0,4mm 6mm}
.bg-vignette{background:radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(60,45,20,.20) 100%)}
.bg-band{background:linear-gradient(90deg,rgba(35,32,28,.85) 0 7mm,rgba(168,51,31,.75) 7mm 9mm,transparent 9mm)}
.bg-parch{background:linear-gradient(160deg,rgba(190,160,105,.22),transparent 45%),radial-gradient(90% 70% at 20% 15%,rgba(150,115,60,.18),transparent 60%),radial-gradient(80% 60% at 85% 90%,rgba(120,90,45,.16),transparent 60%)}
.bg-fog{background:radial-gradient(70% 45% at 15% 10%,rgba(40,60,80,.14),transparent 70%),radial-gradient(60% 40% at 90% 80%,rgba(40,60,80,.12),transparent 70%)}
.pgnum{position:absolute;z-index:2;bottom:7mm;left:0;right:0;text-align:center;font-size:8.5pt;color:#6d6353;letter-spacing:.2em;
  display:flex;align-items:baseline;justify-content:center;gap:1.2em;padding:0 12mm}
.pgnum .ft{letter-spacing:.1em}
.pgnum .pn{font-variant-numeric:tabular-nums}

/* 目錄頁 */
.toc-h{font-size:1.7em;text-align:center;letter-spacing:.4em;margin:6mm 0 7mm;font-weight:600}
.toc-list{line-height:2.05;font-size:.98em}
.toc-line .dots.plain{border:0}
.toc-line{display:flex;align-items:baseline;gap:2mm;text-decoration:none;color:#23201c}
.toc-line .lb{flex:0 0 auto}
.toc-line .dots{flex:1;border-bottom:1px dotted rgba(35,32,28,.45);transform:translateY(-3px)}
.toc-line .pn{flex:0 0 auto;font-variant-numeric:tabular-nums}
.toc-l1{font-weight:700;margin-top:2mm}
.toc-l2{padding-left:5mm}
.toc-l3{padding-left:10mm;font-size:.9em;color:#5f5849}

@page{size:A4;margin:0}
@media print{
  html,body{background:#fff !important}
  .app-chrome,#side,#tabs,#panels,#srcPane,#pagesPane,#propPane,.splitter{display:none !important}
  #main{display:block !important}
  #propPane,#splitProp{display:none !important}
  #canvasWrap{overflow:visible !important;padding:0 !important;background:#fff !important}
  #stageBox{width:auto !important;height:auto !important}
  #stage{transform:none !important}
  .pagebox{margin:0 !important;width:210mm !important}
  .pagehead{display:none !important}
  .page{box-shadow:none !important;outline:none !important;break-after:page;page-break-after:always}
  .pagebox:last-child .page{break-after:auto;page-break-after:auto}
}

.blk.t-break{height:0;margin:0;padding:0;overflow:hidden}
/* 圖片區塊。不要在欄中途被切開 */
.t-image{margin:0 0;text-align:center}
.blkpad.p-image{break-inside:avoid;page-break-inside:avoid}
/* 圖片文繞圖。接近 Word 的「矩形」配置，內文會流到圖片旁邊 */
/* 在雙欄排版中，圖片若貼齊欄的邊緣，看起來會撞到欄間的直線。
   圖片和文字不同，會一路塗滿到邊緣，所以左右留一點內側間距。 */
/* 原本只在雙欄時於左右加入間距，但圖片寬度改以 mm 決定後，
   實際尺寸會被那段間距吃掉（＝分欄時大小會變）。所以不加間距。 */
.page-body.cols2 > .blkpad.p-image.span:not(.free){padding-left:0;padding-right:0}
/* 自由配置：可以放在紙面上任何地方。文字不會避開，適合裝飾或角落的插圖 */
.blkpad.p-image.free{position:absolute;margin:0 !important;padding:0 !important;z-index:3}
/* 讓文字避開自由配置圖片用的隱形浮動框 */
.imgshape{pointer-events:none;visibility:hidden}
.blkpad.p-image.free .t-image{margin:0}
.blkpad.p-image.free img{width:100% !important}
.blkpad.p-image.fl-l{float:left;clear:left;margin:0 4mm 2mm 0;padding-top:1mm}
.blkpad.p-image.fl-r{float:right;clear:right;margin:0 0 2mm 4mm;padding-top:1mm}
/* 位移用 float 的 margin 來實現。只在單欄時使用
   （在分欄中，過大的 margin-top 會超出外框而與文字重疊） */
.blkpad.p-image.fl-l .t-image,.blkpad.p-image.fl-r .t-image{margin:0}
.blkpad.p-image.fl-l img,.blkpad.p-image.fl-r img{width:100%!important}
.blkpad.clearfl{clear:both}
/* 放在左側面板的編輯用表單。讓與紙面相同外觀的元件在窄寬度下也能使用 */
.pcells{display:flex;flex-direction:column;gap:3px;max-height:230px;overflow:auto;
  background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:4px}
.pcrow{display:flex;gap:3px}
.pcells textarea{flex:1;min-width:0;font:inherit;font-size:11px;line-height:1.5;resize:vertical;
  min-height:2.2em;padding:3px 4px;border-radius:3px}
.pcells textarea.hd{font-weight:700;color:var(--brass)}
.pcells textarea.cur{border-color:var(--brass);box-shadow:0 0 0 1px var(--brass)}
.pradio{display:inline-flex;gap:4px;align-items:center;font-size:11px;color:var(--text);flex:1;cursor:pointer}
#propBody textarea{width:100%;box-sizing:border-box;font:inherit;font-size:12px;line-height:1.6;resize:vertical}
/* 處理系的色票。把方形色票與名稱排在一起，可以直接點選 */
#propBody .bxcols{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
/* 自己做的樣板清單。名稱按鈕右側小小地放上覆寫、改名、刪除 */
#propBody .tpllist{display:flex;flex-direction:column;gap:4px;margin-top:6px}
#propBody .tplrow{display:flex;gap:3px}
#propBody .tplrow>button:first-child{flex:1;min-width:0;text-align:left;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#propBody .tplrow>button.x{flex:0 0 auto;width:26px;padding:4px 0;font-size:11px}
#propBody .bxcols button{display:flex;align-items:center;justify-content:center;gap:5px;padding:4px 2px}
#propBody .bxcols button i{width:11px;height:11px;flex:0 0 auto;border-radius:2px;
  background:var(--sw);box-shadow:0 0 0 1px rgba(255,255,255,.35) inset}
/* 讓跳轉到的位置閃一下，好知道來到了哪裡 */
@keyframes jumpfade{from{box-shadow:0 0 0 3px rgba(211,165,52,.55)}to{box-shadow:0 0 0 3px rgba(211,165,52,0)}}
#stage .blk.jumped{animation:jumpfade .7s ease-out}
.colsw{flex:1;height:22px;border:1px solid rgba(255,255,255,.25);border-radius:4px;padding:0;min-width:0}
.colsw:hover{border-color:var(--brass)}
#stage .copybtn,#printAppendix .copybtn,#pagesBody .copybtn{display:none !important}
/* 紙面上的按鈕。若維持編輯畫面 button 的預設色，
   會和紙面文字同樣深而看不清楚 */
.copybtn{position:absolute;right:0;top:-1.6em;border:0;border-radius:3px;
  background:#23201c !important;color:#f7f3ea !important;
  padding:1px 9px;font:inherit;font-size:11px;cursor:pointer;opacity:.75;letter-spacing:.04em;width:auto}
.copybtn:hover{opacity:1;background:#a8331f !important;color:#f7f3ea !important}
/* 指定範圍列印時，把範圍外的頁面藏起來。
   少了這個，doPrint(a,b) 的範圍指定就完全不會生效 */
@media print{ .pagebox.pgskip{display:none !important} }
/* ---- 表格 ---- */
.t-table{white-space:normal}
table.tbl{border-collapse:collapse;width:100%;font-size:.92em;line-height:1.7;margin:0}
table.tbl th,table.tbl td{border:1px solid rgba(35,32,28,.45);padding:1.2mm 2mm;text-align:left;
  vertical-align:top;outline:none;white-space:pre-wrap}
table.tbl th{background:rgba(35,32,28,.08);font-weight:700;color:#3a332b}
table.tbl td:empty::before,table.tbl th:empty::before{content:attr(data-ph);color:#b9ad97}
/* 可以直接在紙面上修改的儲存格。只在操作時淡淡地顯示外框 */
/* 操作儲存格時的外觀。不用框線，而是和一般文章相同的淡淡底色 */
#stage [data-tname]:hover,#popBlocks [data-tname]:hover{background:rgba(211,165,52,.10)}
#stage [data-tname]:focus,#popBlocks [data-tname]:focus{background:rgba(211,165,52,.20);outline:none}
#stage .tl-body:empty::before,#stage .cd-v:empty::before,#stage .tl-ttl:empty::before,
#stage .tl-no:empty::before,#stage .cd-t:empty::before,
#popBlocks .tl-body:empty::before,#popBlocks .cd-v:empty::before{content:attr(data-ph);color:#b9ad97}
/* 表格的標題。像「〇〇表」那樣放在表格上方 */
.tbl-cap{font-size:1.05em;font-weight:700;letter-spacing:.1em;color:#3a332b;margin:0 0 1.5mm;
  padding:0 0 0 .2em;outline:none;min-height:1.4em}
/* 標題框式表格：一列一個框。左上是標題，內容佔滿框的寬度 */
/* 標題會突出到框線上方，所以要替最上面那個框預留空間
   （不預留的話，標題會和表格名稱或前一段重疊） */
.cd-wrap{display:flex;flex-direction:column;gap:3.2mm;padding-top:.5em}
.cd{position:relative;border:1.2px solid rgba(35,32,28,.55);border-radius:1mm;padding:3.6mm 3mm 2.4mm}
/* 標題連同容器一起浮到框線上方。裡面的文字（.cd-t）維持原本的排列。
   這樣不論在編輯畫面還是匯出檔，都會出現在同一個位置 */
.cellwrap.w-cd-t{position:absolute;top:-.72em;left:2.5mm;background:var(--paper,#f7f3ea);
  padding:0 1.4mm;max-width:calc(100% - 6mm);z-index:1;line-height:1.25}
.cd-t{font-weight:700;font-size:.92em;letter-spacing:.06em;color:#3a332b;
  outline:none;white-space:pre-wrap;line-height:1.25}
.cd-t:empty::before{content:attr(data-ph);color:#b9ad97;font-weight:400}
.cd-b{min-width:0}
.cd-k{font-size:.74em;letter-spacing:.1em;color:#8a7d63;margin:1.2mm 0 .3mm;white-space:pre-wrap}
.cd-k:first-child{margin-top:0}
.cd-v{line-height:1.85;outline:none;white-space:pre-wrap;min-height:1.2em}
.cd-v:empty::before{content:attr(data-ph);color:#b9ad97}
/* 條列式表格：一個框內用橫線分隔，每段以「編號：小標／內文」排列 */
.tl-box{border:1.2px solid rgba(35,32,28,.6);border-radius:1mm;overflow:hidden}
.tl-sec{padding:2mm 3mm 2.5mm;border-top:1.2px solid rgba(35,32,28,.45)}
.tl-sec:first-child{border-top:0}
.tl-h{display:flex;align-items:baseline;gap:.2em;margin:0 0 1.2mm}
.tl-no{font-weight:700;min-width:1.4em;text-align:right;outline:none;white-space:pre-wrap}
.tl-co{color:#6d6353}
.tl-ttl{flex:0 1 auto;min-width:8em;max-width:100%;font-weight:700;letter-spacing:.05em;outline:none;
  white-space:pre-wrap;padding:0 .8em .6mm 0;
  border-bottom:1.1px solid rgba(35,32,28,.55);border-right:1.1px solid rgba(35,32,28,.55)}
/* 內文的縮排由容器負責。這樣放進儲存格的段落
   也會和該儲存格的文字左端完全對齊 */
.cellwrap.w-tl-body{padding-left:1.6em}
.tl-body{margin:0 0 .8mm;line-height:1.85;outline:none;white-space:pre-wrap}
.tl-body:last-child{margin-bottom:0}
.tl-no:empty::before,.tl-ttl:empty::before,.tl-body:empty::before{content:attr(data-ph);color:#b9ad97;font-weight:400}
/* 儲存格的內容是一串段落。從儲存格最上方開始，不留多餘的間距。
   這裡要同時作用於編輯畫面與匯出 HTML，所以放在紙面的 CSS 裡 */
.cellblk{margin:0}
.cellblk>.blkpad:first-child{padding-top:0;margin-top:0}
.cellblk>.blkpad:last-child>.blk{margin-bottom:0}
/* 編號、標題、小標的儲存格，要看起來像一行標題。
   寫在段落那邊的間距之後，讓這邊勝出 */
.w-cd-t .cellblk,.w-tl-no .cellblk,.w-tl-ttl .cellblk{margin:0}
.w-cd-t .blkpad,.w-tl-no .blkpad,.w-tl-ttl .blkpad{padding:0;margin:0}
.w-cd-t .blk,.w-tl-no .blk,.w-tl-ttl .blk{margin:0;line-height:1.3}
.w-cd-t .cl-p,.w-tl-no .cl-p,.w-tl-ttl .cl-p{margin:0}
/* ---- 另開視窗 ---- */
.t-popup{white-space:normal;display:flex;gap:2mm;align-items:center;flex-wrap:wrap}
button.pop-btn{font:inherit;font-size:.95em;cursor:pointer;width:auto;background:#23201c;color:#f7f3ea;
  border:0;border-radius:2mm;padding:1.2mm 4mm;letter-spacing:.06em}
button.pop-btn:hover{background:#a8331f}
button.pop-btn::before{content:"▤ ";font-size:.9em}
.pop-empty{color:#8a7d63}
/* 縮排。寫在標題 3 底下等處時，從欄的左端一層層往內縮 */
.blkpad.i1>.blk{margin-left:4mm}
.blkpad.i2>.blk{margin-left:8mm}
.blkpad.i3>.blk{margin-left:12mm}
.blkpad.i4>.blk{margin-left:16mm}
/* 位於頁首的東西，去掉上方間距。
   標題出現在紙面開頭時，上面若空著一段會顯得不穩。
   只有封面想放在紙面中段，所以維持原樣。 */
.blkpad.pagetop:not(.p-cover){padding-top:0}
.t-image img{display:block;margin:0 auto;max-width:100%}
.t-imgcap{font-size:.78em;color:#5f5849;margin-top:1.2mm;line-height:1.6;text-align:center}
.t-imgph{border:1.5px dashed rgba(35,32,28,.4);color:#8a7d63;padding:6mm 2mm;font-size:.85em}
.blkpad.p-toc{break-inside:auto}
/* 換欄：在雙欄的頁面，從這裡送到下一欄。單欄時什麼都不會發生 */
.blkpad.p-colbr{break-before:column;padding:0!important}
.t-colbr{height:0;margin:0!important;padding:0;font-size:0;line-height:0}
ruby{ruby-position:over}
ruby rt{font-size:.5em;font-weight:inherit;letter-spacing:0;line-height:1.1;text-align:center}
.srctext ruby rt{display:none}
`;


/* ================= 表格與彈出視窗的資料 ================= */
/* 表格的內容只用「每個儲存格的段落串列」（cb）來保存。
   不使用 cells（字串的二維陣列）。表格的形狀由 rows 與 ncol 決定。
   每個儲存格一定至少有一個段落，所以在紙面上隨時都能在那裡輸入。 */
function newTable(){
  return { head:true, rowhead:false, capOn:true, out:'', outMode:'roll', look:'grid',
           name:'', dice:'', rows:4, ncol:2, cb:{},
           seed:[[T('tbl.seedItem'),T('tbl.seedContent')],['',''],['',''],['','']] };
}
/* 該儲存格的段落串列（沒有的話就建立一個空的描述文） */
function cellBlocks(t, ri, ci, make){
  if(!t.cb || typeof t.cb!=='object' || Array.isArray(t.cb)) t.cb = {};
  const k = ri+','+ci;
  if(!Array.isArray(t.cb[k])){ if(!make) return []; t.cb[k] = [newBlock('desc','')]; }
  if(make && !t.cb[k].length) t.cb[k].push(newBlock('desc',''));
  return t.cb[k];
}
/* 把儲存格當成「一個字串」讀取時的規則。
   把可輸入段落的內文用換行串起來回傳（用於輸出文字、標題語、欄名、字數） */
const CELL_TEXT_SKIP = ['break','colbr','toc','table','npc','image','cover','colophon','flow','popup'];
function cellRead(t, ri, ci){
  return cellBlocks(t,ri,ci).filter(x=>!CELL_TEXT_SKIP.includes(x.type))
    .map(x=>String(x.text||'')).filter(x=>x!=='').join('\n');
}
function cellsRead(t){
  const out=[];
  for(let r=0;r<tblRows(t);r++){ const row=[];
    for(let c=0;c<tblCols(t);c++) row.push(cellRead(t,r,c));
    out.push(row); }
  return out;
}
/* 用單行欄位修改時，只看第一個可輸入的段落 */
function cellHead(t, ri, ci){
  const b = cellBlocks(t,ri,ci).find(x=>PLAIN_EDIT_TYPES.includes(x.type));
  return b ? String(b.text||'') : '';
}
function cellWrite(t, ri, ci, txt){
  const L = cellBlocks(t,ri,ci,true);
  const i = L.findIndex(x=>PLAIN_EDIT_TYPES.includes(x.type));
  const v = String(txt==null?'':txt);
  if(i>=0) setBlockText(L[i], v);
  else L.unshift(newBlock('desc', v));
}
function tblRows(t){ return Math.max(1, +t.rows||1); }
function tblCols(t){ return Math.max(1, +t.ncol||1); }
/* 重建儲存格的排列（增減列或欄之後，配合形狀整理） */
function tblFit(t){
  const R=tblRows(t), C=tblCols(t);
  if(!t.cb || typeof t.cb!=='object' || Array.isArray(t.cb)) t.cb = {};
  Object.keys(t.cb).forEach(k=>{
    const rc=k.split(',').map(Number);
    if(!(rc[0]>=0 && rc[0]<R && rc[1]>=0 && rc[1]<C)) delete t.cb[k];
  });
  for(let r=0;r<R;r++) for(let c=0;c<C;c++) cellBlocks(t,r,c,true);
}
function ensureTable(b){
  const d=newTable();
  const t = b.tbl && typeof b.tbl==='object' ? b.tbl : (b.tbl=d);
  t.head = t.head!==false;
  t.rowhead = !!t.rowhead;
  t.capOn = t.capOn!==false;      // 表格名稱要不要顯示在紙面上
  t.out = String(t.out||'');
  t.outMode = ['free','simple','roll'].includes(t.outMode) ? t.outMode : 'roll';
  t.outOpen = !!t.outOpen;
  t.look = (t.look==='list'||t.look==='card') ? t.look : 'grid';
  t.name = String(t.name||'');
  t.dice = String(t.dice||'');
  /* 放進儲存格的段落。以 "列,欄" 為鍵保存 */
  if(!t.cb || typeof t.cb!=='object' || Array.isArray(t.cb)) t.cb = {};
  Object.keys(t.cb).forEach(k=>{
    if(!Array.isArray(t.cb[k])) delete t.cb[k];
    else t.cb[k].forEach(fixBlock);
  });
  /* 從舊的保存方式（cells）轉移過來。把字串變成該儲存格的第一個段落 */
  const old = Array.isArray(t.cells) ? t.cells : (Array.isArray(t.seed) ? t.seed : null);
  if(old && old.length){
    t.rows = old.length;
    t.ncol = Math.max(1, Math.max.apply(null, old.map(r=>Array.isArray(r)?r.length:1)));
    old.forEach((r,ri)=>{
      const row = Array.isArray(r)?r:[];
      for(let ci=0; ci<t.ncol; ci++){
        const v = String(row[ci]==null?'':row[ci]);
        const L = cellBlocks(t,ri,ci,true);
        if(v!==''){
          const i = L.findIndex(x=>PLAIN_EDIT_TYPES.includes(x.type));
          if(i>=0 && !String(L[i].text||'')) L[i].text = v;            // 有空段落就放進去
          else if(!L.some(x=>String(x.text||'')===v))                  // 只有還沒有相同文字時才加入
            L.unshift(newBlock('desc', v));
        }
      }
    });
    delete t.cells; delete t.seed;
  }
  t.rows = Math.max(1, +t.rows||1);
  t.ncol = Math.max(1, +t.ncol||1);
  tblFit(t);
  return t;
}
/* 新建的彈出視窗裡，先放一個空段落當作開始書寫的入口
   （既有的彈出視窗已經有 b.pop，不會經過這裡＝內容不變） */
function newPopup(){ return { label:T('pop.defaultLabel'), body:'', only:false, blocks:[newBlock('desc','')] }; }
/* 是否為以區塊串列保存內容的彈出視窗。
   舊的存檔資料仍是文章（body），那種就照以前的方式處理 */
function popIsBlocks(p){ return Array.isArray((p||{}).blocks); }
function ensurePopup(b){
  const p = b.pop && typeof b.pop==='object' ? b.pop : (b.pop=newPopup());
  p.label = String(p.label||T('pop.defaultLabel'));
  p.body  = String(p.body||'');
  p.only  = !!p.only;                  // 只從儲存格指向，不顯示在紙面上
  if(Array.isArray(p.blocks)) p.blocks.forEach(fixBlock);
  return p;
}
/* 不放進紙面流程的段落（儲存格專用的彈出視窗）。內容仍會出現在匯出檔與附錄中 */
function isOnlyPopup(b){ return b && b.type==='popup' && !!(b.pop||{}).only; }
/* 彈出視窗的內容。以空行分段，用 | 分隔的連續多行會做成簡單的表格 */
function popupBodyHTML(text){
  const out = richTextHTML(text, {pTag:'pop-p', heads:true});
  return out || '<p class="pop-empty">'+T('pop.emptyText')+'</p>';
}
/* 以區塊串列保存的彈出視窗內容。排版方式與紙面相同，只是不分頁 */
function popBlocksHTML(list, edit){
  const bs = (list||[]).filter(b=>b && b.type!=='break' && b.type!=='colbr' && !isFreeImg(b));
  if(!bs.length) return '<p class="pop-empty">'+T('pop.emptyBlocks')+'</p>';
  let prevType=null, first=true;
  return bs.map(b=>{
    const pull = gapPull(prevType, b.type); prevType = b.type;
    const top = first ? ' pagetop' : ''; first = false;
    return blockStaticHTML(b, 1, pull, top, '', edit);
  }).join('');
}
/* 彈出視窗的內容。以區塊保存就用區塊，否則照以前的方式排文章 */
function popInnerViewHTML(pop){
  return popIsBlocks(pop) ? popBlocksHTML(pop.blocks) : popupBodyHTML((pop||{}).body||'');
}

/* ================= 書式的定義 ================= */
const TYPES = [
  /* g =「書寫」分頁中的分類。依常用程度排序 */
  {k:'desc',     get n(){return T('type.desc');},    s:'0', g:'group.body'},
  {k:'dialog',   get n(){return T('type.dialog');},    s:'4', g:'group.body'},
  {k:'note',     get n(){return T('type.note');},      s:'5', g:'group.body'},
  {k:'proc',     get n(){return T('type.proc');},    s:'6', g:'group.body'},
  {k:'flow',     get n(){return T('type.flow');},    s:'F', g:'group.insert'},
  {k:'h1',       get n(){return T('type.h1');},   s:'1', g:'group.heading'},
  {k:'h2',       get n(){return T('type.h2');},   s:'2', g:'group.heading'},
  {k:'h3',       get n(){return T('type.h3');},   s:'3', g:'group.heading'},
  {k:'title',    get n(){return T('type.title');},  s:'T', g:'group.heading'},
  {k:'subtitle', get n(){return T('type.subtitle');},      s:'S', g:'group.heading'},
  {k:'scene',    get n(){return T('type.scene');},s:'8', g:'group.heading'},
  {k:'hr',       get n(){return T('type.hr');},      s:'H', g:'group.divider'},
  {k:'vr',       get n(){return T('type.vr');},      s:'V', g:'group.divider'},
  {k:'break',    get n(){return T('type.break');},  s:'B', g:'group.divider'},
  {k:'colbr',    get n(){return T('type.colbr');},      s:'D', g:'group.divider'},
  {k:'image',    get n(){return T('type.image');},      s:'G', g:'group.insert'},
  {k:'npc',      get n(){return T('type.npc');}, s:'9', g:'group.insert'},
  {k:'table',    get n(){return T('type.table');},        s:'X', g:'group.insert'},
  {k:'popup',    get n(){return T('type.popup');},      s:'W', g:'group.insert'},
  {k:'toc',      get n(){return T('type.toc');},      s:'M', g:'group.insert'},
  {k:'cover',    get n(){return T('type.cover');},      s:'C', g:'group.insert'},
  {k:'colophon', get n(){return T('type.colophon');},      s:'K', g:'group.insert'}
];
const TYPE_GROUPS = ['group.body','group.heading','group.divider','group.insert'];
/* 段落上下的間距（mm）。只要改這裡，整個紙面都會生效。
   t 當作外框的 padding，b 當作內容的 margin-bottom。
   上方用 padding 保存，是因為放在欄首時 margin 會被截掉。 */
const SPACE = {
  cover:{t:38,b:8},  title:{t:8,b:3},   subtitle:{t:0,b:9},
  h1:{t:7,b:3.5},    h2:{t:5.5,b:2.5},  h3:{t:4,b:2},
  desc:{t:0,b:2.2},  dialog:{t:0,b:2.2},note:{t:2.5,b:2.5},
  proc:{t:3,b:3},                       scene:{t:4.5,b:3},
  hr:{t:4,b:4},      vr:{t:3,b:3},      npc:{t:3.5,b:3.5},
  image:{t:3,b:3},   table:{t:3,b:3},   popup:{t:2.5,b:2.5},
  flow:{t:4,b:4},
  toc:{t:0,b:2},     colophon:{t:8,b:0},break:{t:0,b:0}, colbr:{t:0,b:0}
};
const SP = k => SPACE[k] || {t:0,b:2};
/* 框的標題語。預設是這個，但可以在紙面上改寫 */
const LABEL_DEF = {get proc(){return T('label.skill');}};
const LABEL_PICKS = ['label.skill','label.resonance','label.action','label.act','label.sanity','label.fs','label.check','label.rule','label.staging','label.gm'];
function blockLabel(b){
  return b.lb!=null ? String(b.lb) : (LABEL_DEF[b.type]||'');
}
/* ---- 規則框（框）的外觀 ----
   技能檢定與特殊規則的內部結構相同，所以合併成一種書式，
   只讓外觀可以選擇。
   ln  框線形狀（實線・虛線・無）
   bar 左側粗線
   fill 底色
   sm  文字稍微縮小
   col 線與小標的顏色 */
const BX_COLS = [
  /* c=小標與虛線、粗線的顏色，l=實線的顏色（稍淡），f=底色 */
  {k:'aka',  get n(){return T('bxcol.aka');},  c:'#a8331f', l:'rgba(168,51,31,.6)',  f:'rgba(168,51,31,.05)'},
  {k:'sumi', get n(){return T('bxcol.sumi');},  c:'#23201c', l:'rgba(35,32,28,.55)',  f:'rgba(35,32,28,.045)'},
  {k:'ai',   get n(){return T('bxcol.ai');},  c:'#2b4a6f', l:'rgba(43,74,111,.6)',  f:'rgba(43,74,111,.05)'},
  {k:'koke', get n(){return T('bxcol.koke');},  c:'#4a6141', l:'rgba(74,97,65,.6)',   f:'rgba(74,97,65,.05)'},
  {k:'kin',  get n(){return T('bxcol.kin');},c:'#8a6a2f', l:'rgba(138,106,47,.6)', f:'rgba(138,106,47,.055)'},
  {k:'hai',  get n(){return T('bxcol.hai');},  c:'#5f5849', l:'rgba(95,88,73,.6)',   f:'rgba(95,88,73,.05)'}
];
const BX_COL = k => BX_COLS.find(x=>x.k===k) || BX_COLS[0];
/* 樣板。原封不動地照搬原本兩種書式的外觀 */
const BX_TPL = {
  skill: {ln:'dash',  bar:false, fill:true, sm:true,  col:'aka',  get lb(){return T('label.skill');}},
  rule:  {ln:'solid', bar:true,  fill:true, sm:false, col:'sumi', get lb(){return T('label.rule');}}
};
function ensureProc(b){
  const d = BX_TPL.skill;
  const x = (b.bx && typeof b.bx==='object') ? b.bx : (b.bx={});
  x.ln   = ['solid','dash','none'].includes(x.ln) ? x.ln : d.ln;
  x.bar  = !!x.bar;
  x.fill = x.fill!==false;
  x.sm   = !!x.sm;
  x.col  = BX_COLS.some(c=>c.k===x.col) ? x.col : d.col;
  return x;
}
/* ---- 自己做的樣板 ----
   把框的外觀（框線・粗線・底色・字級・顏色）與標題語取個名字記下來。
   會放進原稿的 JSON 裡一起帶著走，同時也讓這個瀏覽器記住，
   所以交給別人也會跟著過去，新的劇本也能使用。
   樣板只是複製外觀，所以在沒有該樣板的環境打開，紙面也不會亂掉。 */
const BXT_KEY = 'trpg-bxtpl-v1';
function bxTplClean(t){
  if(!t || typeof t!=='object') return null;
  const n = String(t.n||'').trim(); if(!n) return null;
  return { id: String(t.id||'').trim() || uid(),
    n: n.slice(0,24),
    ln: ['solid','dash','none'].includes(t.ln) ? t.ln : 'dash',
    bar: !!t.bar, fill: t.fill!==false, sm: !!t.sm,
    col: BX_COLS.some(c=>c.k===t.col) ? t.col : 'aka',
    lb: String(t.lb==null?'':t.lb).slice(0,24) };
}
function userTpls(){
  /* 讀取途中 S 可能還不存在（會從 normalize 裡被呼叫） */
  if(typeof S!=='object' || !S) return [];
  if(!Array.isArray(S.bxTpl)) S.bxTpl = [];
  return S.bxTpl;
}
function loadUserTpls(){
  try{ const v = localStorage.getItem(BXT_KEY);
    if(v) return JSON.parse(v).map(bxTplClean).filter(Boolean); }catch(e){}
  return [];
}
function saveUserTpls(){
  try{ localStorage.setItem(BXT_KEY, JSON.stringify(userTpls())); }catch(e){}
}
/* 開啟原稿時，與這個瀏覽器記住的樣板比對。
   同名的保留原稿那一份，沒有的就加進來 */
function mergeUserTpls(){
  const mine = loadUserTpls();
  const list = userTpls();
  const have = new Set(list.map(t=>t.n));
  mine.forEach(t=>{ if(!have.has(t.n)){ list.push(t); have.add(t.n); } });
  saveUserTpls();
}
function findUserTpl(id){ return userTpls().find(t=>t.id===id) || null; }
function applyBxTpl(b, key){
  const t = BX_TPL[key] || findUserTpl(key); if(!t) return;
  b.bx = {ln:t.ln, bar:t.bar, fill:t.fill, sm:t.sm, col:t.col};
  /* 標題語只有在還沒寫任何東西、或仍是其他樣板的預設值時才替換。
      像「共鳴檢定」這種自己改寫過的不會被清掉。 */
  const cur  = b.lb==null ? '' : String(b.lb).trim();
  const defs = Object.keys(BX_TPL).map(k=>BX_TPL[k].lb).concat(tAll('label.skill'), tAll('label.rule'))
    .concat(userTpls().map(x=>String(x.lb||'').trim())).filter(Boolean);
  if(!cur || defs.includes(cur)){ if(t.lb!=null && String(t.lb).trim()) b.lb = t.lb; }
}
/* 讓紙面、匯出檔、成品預覽視窗外觀一致的共用組裝部分 */
function procClass(b){
  const x = ensureProc(b);
  return ' bx-l-'+x.ln + (x.bar?' bx-bar':'') + (x.fill?' bx-fill':'') + (x.sm?' bx-sm':'');
}
function procStyle(b){
  const c = BX_COL(ensureProc(b).col);
  return '--bxc:'+c.c+';--bxl:'+c.l+';--bxf:'+c.f+';';
}
/* 上方間距與前一個區塊的下方間距若同時生效，縫隙會太寬。
   比照一般 margin「只留較大的那個」，把重疊的部分扣掉。 */
function gapPull(prevType, myType){
  if(!prevType) return 0;
  return Math.min(SP(prevType).b, SP(myType).t);
}
const SPACE_CSS = Object.keys(SPACE).map(k=>
  '.blkpad.p-'+k+'{padding-top:'+SPACE[k].t+'mm}\n.t-'+k+'{margin-bottom:'+SPACE[k].b+'mm}').join('\n');
document.getElementById('doccss').textContent = DOC_CSS + '\n' + SPACE_CSS;
const TYPE_NAME = k => (TYPES.find(t=>t.k===k)||{n:k}).n;
/* 花紋會降低文字的易讀性，所以只保留素色 */
const BGS = [ {k:'none',get n(){return T('bg.none');}} ];
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
/* ================= 注音（ruby） =================
   依循青空文庫的標記法。但不使用自動判斷本文字，而是必須加上｜。
   因為雙重十字的效果名稱寫成《Concentrate》，
   若自動判斷，會把一串片假名誤認為本文字而加上注音。
   ｜彼方《kanata》 → 加上注音。半形的 | 也一樣。
   只有《…》的部分，會照一般文字原樣輸出。 */
const RUBY_RE = /[｜|]([^｜|《》\n]+)《([^《》\n]+)》/g;
/* 只用來檢查是否使用了注音的樣式。RUBY_RE 為了取代而帶有 /g，
   用 test() 的話 lastIndex 會殘留，使下一次判斷變成 false。
   實際上就曾因此讓標題、主標題、對話文、場景轉換的注音時有時無。
   判斷時改用這個不帶狀態的版本。 */
const RUBY_HAS = /[｜|][^｜|《》\n]+《[^《》\n]+》/;
function hasRuby(t){ return RUBY_HAS.test(String(t==null?'':t)); }
/* 註解（comment）。在段落中「第幾個字到第幾個字」掛上注。
   內文本身不混入任何東西，所以複製時註解不會跟著過去。 */
/* 內文改變時，註解所在的位置也跟著移動。
   註解是以「第幾個字到第幾個字」保存，
   文字增減時若不修正，就會前後錯位。
   改變的地方用「與之前相同的開頭」與「與之前相同的結尾」夾出來找到 */
function shiftComments(b, oldT, newT){
  const cs = Array.isArray(b.cm) ? b.cm.filter(c=>c && c.b>c.a) : [];
  const ms = blockMarks(b);
  if((!cs.length && !ms.length) || oldT===newT) return;
  const n = Math.min(oldT.length, newT.length);
  let p=0; while(p<n && oldT.charCodeAt(p)===newT.charCodeAt(p)) p++;
  let q=0; while(q < n-p && oldT.charCodeAt(oldT.length-1-q)===newT.charCodeAt(newT.length-1-q)) q++;
  const delA = p, delZ = oldT.length - q;        // 消失的範圍（原本的算法）
  const insZ = newT.length - q;                  // 插入文字的結尾（新的算法）
  const d = insZ - delZ;
  const mv = (x, end) => x<=delA ? x : (x>=delZ ? x+d : (end ? insZ : delA));
  if(cs.length) b.cm = cs.map(c=>({a:mv(c.a,false), b:mv(c.b,true), t:c.t})).filter(c=>c.b>c.a);
  if(ms.length) b.mk = tidyMarks(ms.map(c=>({a:mv(c.a,false), b:mv(c.b,true), col:c.col, bold:c.bold})));
}
/* 替換內文的唯一入口。註解的錯位在這裡吸收 */
function setBlockText(b, txt){
  const old = String(b.text||''), nw = String(txt==null?'':txt);
  if(old===nw) return;
  shiftComments(b, old, nw);
  b.text = nw;
}
function blockComments(b){
  return Array.isArray(b.cm) ? b.cm.filter(c=>c && c.b>c.a) : [];
}
/* 文字的裝飾。與註解一樣以「第幾個字到第幾個字」保存。
   目前只有顏色，但預留之後加上粗體等的空間 */
function blockMarks(b){
  return Array.isArray(b.mk) ? b.mk.filter(c=>c && c.b>c.a && (c.col||c.bold)) : [];
}
/* 把相同裝飾的重疊整平，整理成乾淨的排列 */
function tidyMarks(list){
  const a = list.filter(c=>c && c.b>c.a && (c.col||c.bold)).sort((x,y)=>x.a-y.a || x.b-y.b);
  const out=[];
  a.forEach(c=>{
    const p = out[out.length-1];
    if(p && p.col===c.col && !!p.bold===!!c.bold && c.a<=p.b){ p.b = Math.max(p.b, c.b); return; }
    out.push({a:c.a, b:c.b, col:c.col||'', bold:!!c.bold});
  });
  return out;
}
/* 先拿掉該範圍上的裝飾（只切掉重疊的部分） */
function clearMarkRange(b, a, z){
  const out=[];
  blockMarks(b).forEach(c=>{
    if(c.b<=a || c.a>=z){ out.push(c); return; }
    if(c.a < a) out.push({a:c.a, b:a, col:c.col, bold:c.bold});
    if(c.b > z) out.push({a:z, b:c.b, col:c.col, bold:c.bold});
  });
  b.mk = tidyMarks(out);
}
/* 把內文的一部分（第 a～z 個字）連同注音與註解一起畫出來。
   即使巢狀書式把內文切開，為了不讓註解的位置與編號錯亂，
   直接以原本的文字位置指定範圍來畫。 */
function rubyRange(b, a, z){
  const t = String(b.text||'');
  a = Math.max(0, Math.min(t.length, a));
  z = Math.max(a, Math.min(t.length, z));
  const cs = blockComments(b).slice().sort((x,y)=>x.a-y.a);
  const ms = blockMarks(b);
  if(!cs.length && !ms.length) return rubyHTML(t.slice(a,z));
  /* 註解與裝飾可能重疊，所以在兩者的分界處都切開，再逐段包起來 */
  const cut = new Set([a,z]);
  cs.forEach(c=>{ cut.add(c.a); cut.add(c.b); });
  ms.forEach(c=>{ cut.add(c.a); cut.add(c.b); });
  const pts = [...cut].filter(x=>x>=a && x<=z).sort((x,y)=>x-y);
  let out='';
  for(let i=0;i<pts.length-1;i++){
    const s0=pts[i], e0=pts[i+1]; if(e0<=s0) continue;
    let h = rubyHTML(t.slice(s0,e0));
    const mk = ms.find(c=>c.a<=s0 && c.b>=e0);
    if(mk){
      const st = (mk.col?'color:'+mk.col+';':'') + (mk.bold?'font-weight:700;':'');
      if(st) h = '<span style="'+st+'">'+h+'</span>';
    }
    const ci = cs.findIndex(c=>c.a<=s0 && c.b>=e0);
    if(ci>=0){
      const tail = cs[ci].b<=e0;
      h = '<span class="cmt" data-cmt="'+b.id+':'+ci+'" tabindex="0">'+h
        + (tail?'<sup class="cmt-n">'+(ci+1)+'</sup>':'')+'</span>';
    }
    out += h;
  }
  return out;
}
function rubyHTMLwithComments(b){ return rubyRange(b, 0, String(b.text||'').length); }
function rubyHTML(t){
  return esc(String(t)).replace(RUBY_RE,
    (m,base,rt)=>'<ruby>'+base+'<rp>（</rp><rt>'+rt+'</rt><rp>）</rp></ruby>');
}
/* 給目錄、頁面一覽、NPC 名等不顯示注音的地方用的純文字 */
function rubyPlain(t){
  return String(t).replace(RUBY_RE,(m,base)=>base);
}
const uid = () => Math.random().toString(36).slice(2,9);
/* cols: 1=全寬（跨欄） / 2=在欄內流動 */
const newBlock = (t='desc',x='')=>({id:uid(),type:t,
  cols:(t==='npc'||t==='title'||t==='subtitle'||t==='image'||t==='cover'||t==='colophon'||t==='hr')?1:2,
  text:x, mt:null, mb:null, img:null, w:70, cap:''});
const newPage  = (cols)=>({id:uid(),bg:{preset:'none',img:null,fit:'cover',opa:35},cols:cols||1});

/* ================= NPC 卡（書式：NPC 卡） ================= */
/* 各系統的資料表（能力值・技能・共鳴感情・症候群…）與只依賴它們的小函式，
   放在 npc-data.js（在本檔之前載入）。 */

const EMO_SKILL_ROWS = 1;   // 技能欄的初始列數（技能至少一項。可用＋按鈕增加）
function newNpcData(){
  return {
    sys:'emoklore', name:'', kana:'', role:'', memo:'', memoOpen:true,
    art:null, artW:30, tabs:[],
    emoklore:{ ab:{body:'',dex:'',mind:'',sense:'',int:'',cha:'',soc:'',luck:''}, hp:'', mp:'',
      skills:Array.from({length:EMO_SKILL_ROWS},()=>({n:'',cat:'',arg:'',ref:'',lv:'',v:''})),
      base:{}, baseOpen:false, kyomei:'1', kyodo:'',
      res:{omote:{attr:'',name:''}, ura:{attr:'',name:''}, root:{attr:'',name:''}} },
    dx3rd:{ breed:'', syn:'', syns:['','',''], enc:'', ab:{body:'',sense:'',mind:'',soc:''}, act:'', hp:'', stock:'',
      skills:{melee:'',ranged:'',dodge:'',percept:'',will:'',rc:'',negotiate:'',procure:'',drive:'',ride:'',art:'',know:'',info:''},
      sarg:{ride:'',art:'',know:'',info:''},
      effects:[{kind:'',n:'',lv:'',timing:'',skill:'',dif:'',tgt:'',rng:'',enc:'',lim:''},
               {kind:'',n:'',lv:'',timing:'',skill:'',dif:'',tgt:'',rng:'',enc:'',lim:''}],
      combos:[] },
    coc:{ ver:'7', ab:{str:'',con:'',pow:'',dex:'',app:'',siz:'',int:'',edu:''},
      sub:{hp:'',mp:'',san:'',idea:'',luck:'',know:'',build:'',db:'',mov:''},
      skills:[{n:'',cat:'',arg:'',v:'',free:false},{n:'',cat:'',arg:'',v:'',free:false},
              {n:'',cat:'',arg:'',v:'',free:false},{n:'',cat:'',arg:'',v:'',free:false},
              {n:'',cat:'',arg:'',v:'',free:false},{n:'',cat:'',arg:'',v:'',free:false}],
      weapons:[{n:'',v:'',dmg:''}] }
  };
}
/* 替既有資料補上缺少的鍵與預設值（讀取舊版 JSON 也不會壞掉） */
function ensureNpc(b){
  const d = newNpcData();
  if(!b.npc){ b.npc = d; return b.npc; }
  const np = b.npc;
  np.sys = np.sys || d.sys;
  ['name','kana','role','memo'].forEach(k=>{ if(typeof np[k]!=='string') np[k]=''; });
  if(typeof np.art!=='string') np.art = null;
  np.artW = Math.max(15, Math.min(50, parseInt(np.artW,10)||30));
  np.tabs = Array.isArray(np.tabs)
    ? np.tabs.map(t=>({id:t.id||uid(), title:String(t.title||''), text:String(t.text||''), open:t.open!==false}))
    : [];

  np.emoklore = Object.assign(d.emoklore, np.emoklore||{});
  np.emoklore.ab = Object.assign(d.emoklore.ab, np.emoklore.ab||{});
  /* 把舊格式（共鳴感情是字串）轉成 {屬性, 感情名} */
  np.emoklore.res = np.emoklore.res || {};
  EMO_RES_SLOTS.forEach(([slot])=>{
    const cur = np.emoklore.res[slot];
    if(typeof cur === 'string') np.emoklore.res[slot] = {attr:'', name:cur};
    else np.emoklore.res[slot] = Object.assign({attr:'',name:''}, cur||{});
    /* 屬性是空的，但能從感情名查出屬性時就補上 */
    const r = np.emoklore.res[slot];
    if(!r.attr && r.name){
      const hit = EMO_EMOTIONS.find(a=>a.items.indexOf(r.name)>=0);
      if(hit) r.attr = hit.k;
    }
  });
  np.emoklore.skills = Array.isArray(np.emoklore.skills) && np.emoklore.skills.length
    ? np.emoklore.skills.map(s=>Object.assign({n:'',cat:'',arg:'',ref:'',lv:'',v:''}, s)) : d.emoklore.skills;
  while(np.emoklore.skills.length < EMO_SKILL_ROWS) np.emoklore.skills.push({n:'',cat:'',arg:'',ref:'',lv:'',v:''});
  if(typeof np.emoklore.base !== 'object' || !np.emoklore.base) np.emoklore.base = {};
  np.emoklore.baseOpen = !!np.emoklore.baseOpen;
  if(typeof np.emoklore.kyomei!=='string') np.emoklore.kyomei = String(np.emoklore.kyomei||'1');
  if(typeof np.emoklore.kyodo !=='string') np.emoklore.kyodo  = String(np.emoklore.kyodo||'');
  if(typeof np.memoOpen !== 'boolean') np.memoOpen = true;

  np.dx3rd = Object.assign(d.dx3rd, np.dx3rd||{});
  np.dx3rd.ab = Object.assign(d.dx3rd.ab, np.dx3rd.ab||{});
  np.dx3rd.skills = Object.assign(d.dx3rd.skills, np.dx3rd.skills||{});
  np.dx3rd.sarg = Object.assign(d.dx3rd.sarg, np.dx3rd.sarg||{});
  /* 為了讓組合技可以指向效果，替效果加上不會消失的 ID */
  np.dx3rd.effects = Array.isArray(np.dx3rd.effects)
    ? np.dx3rd.effects.map(f=>Object.assign({id:'',kind:'',n:'',lv:'',timing:'',skill:'',dif:'',tgt:'',rng:'',enc:'',lim:''}, f))
    : d.dx3rd.effects;
  np.dx3rd.effects.forEach(f=>{ if(!f.id) f.id = uid(); });
  /* 組合技的欄位配合 Yutosheet 的實物，
     定為 組合技名／組合／技能／命中／攻擊力／對象／射程／侵蝕值／條件／效果。
     從以前猜測的欄位（時機／難度／骰子／C 值／達成值修正）轉換過來。 */
  np.dx3rd.combos = Array.isArray(np.dx3rd.combos)
    ? np.dx3rd.combos.map(f=>{
        const o = Object.assign({n:'',cmb:'',pick:[],extra:'',timing:'',skill:'',hit:'',atk:'',tgt:'',rng:'',enc:'',cond:'',eff:''}, f);
        if(!o.hit && f.dice) o.hit = String(f.dice) + (f.cv?'@'+f.cv:'');
        ['dif','dice','cv','mod'].forEach(k=>{ delete o[k]; });
        o.pick = Array.isArray(o.pick) ? o.pick.map(x=>String(x||'')) : [];
        o.extra = String(o.extra||'');
        return o;
      })
    : [];
  /* 舊資料：症候群原本是自由填寫的一行。
     若以「／」「・」「、」分隔寫成，就移到選擇式的欄位。 */
  np.dx3rd.syns = Array.isArray(np.dx3rd.syns) ? np.dx3rd.syns.slice(0,3) : ['','',''];
  while(np.dx3rd.syns.length<3) np.dx3rd.syns.push('');
  if(!np.dx3rd.syns.some(Boolean) && String(np.dx3rd.syn||'').trim()){
    const parts = String(np.dx3rd.syn).split(/[／\/・、,＋+]/).map(x=>x.trim()).filter(Boolean);
    parts.slice(0,3).forEach((t,i)=>{
      const hit = DX3RD_SYN.find(x=>x.n===t || x.n.replace('＝','=')===t.replace('＝','='));
      if(hit) np.dx3rd.syns[i] = hit.k;
    });
    if(np.dx3rd.syns.some(Boolean) && !np.dx3rd.breed){
      const n = np.dx3rd.syns.filter(Boolean).length;
      np.dx3rd.breed = n>=3?'tri':n===2?'cross':'pure';
    }
  }

  const rawCoc = np.coc || {};
  np.coc = Object.assign(d.coc, rawCoc);
  np.coc.ver = np.coc.ver==='6' ? '6' : '7';
  np.coc.ab = Object.assign(d.coc.ab, np.coc.ab||{});
  np.coc.sub = Object.assign(d.coc.sub, np.coc.sub||{});
  /* 舊資料：武器原本只有一個容器，改移到陣列。
     為了和預設的空陣列區分，以讀入前的內容（rawCoc）判斷。 */
  if(!Array.isArray(rawCoc.weapons)){
    const w = rawCoc.weapon;
    np.coc.weapons = (w && (w.n||w.v||w.dmg)) ? [{n:w.n||'',v:w.v||'',dmg:w.dmg||''}] : [{n:'',v:'',dmg:''}];
  }
  np.coc.weapons = np.coc.weapons.map(w=>Object.assign({n:'',v:'',dmg:''}, w)).slice(0,12);
  delete np.coc.weapon;
  np.coc.skills = Array.isArray(np.coc.skills)
    ? np.coc.skills.map(s=>Object.assign({n:'',cat:'',arg:'',v:'',free:false}, s)).slice(0,12) : d.coc.skills;
  return np;
}
function getNpcField(np, path){ return path.split('.').reduce((o,k)=> (o==null?undefined:o[k]), np); }
function setNpcField(b, path, val){
  const np = ensureNpc(b);
  /* 自己加的分頁內文，在陣列中用 id 查找 */
  if(path.indexOf('tabtext.')===0){
    const t = np.tabs.find(x=>x.id===path.slice(8));
    if(t) t.text = val;
    return;
  }
  const parts = path.split('.');
  let obj = np;
  for(let i=0;i<parts.length-1;i++) obj = obj[parts[i]];
  obj[parts[parts.length-1]] = val;
}

/* ---- 自動計算（只用有依據的公式） ----
   Emoklore HP=身體+10 / MP=精神+知力 …官方角色卡上顯示的公式
   Emoklore 目標值=技能 Lv+參照能力  …與填寫完成的實際角色卡中 9 項技能比對一致
   DX3rd 行動值=感覺×2+精神          …在填寫完成的實際角色卡上實測（2×2+7=11）
   CoC   耐久／MP／理智等            …依據 KADOKAWA 官方的說明（第 6 版與第 7 版公式不同）
   ※DX3rd 的 HP 最大值會加上效果的加成，CoC 的 DB／體格則因表格未公開，所以不自動化 */
function computeNpcAuto(np){
  const A = {};
  const n = v => { const x = parseFloat(String(v==null?'':v).trim()); return isNaN(x) ? null : x; };
  if(np.sys==='emoklore'){
    const e = np.emoklore, ab = e.ab;
    const body=n(ab.body), mind=n(ab.mind), intel=n(ab.int);
    A['emoklore.hp'] = body!=null ? body+10 : '';
    A['emoklore.mp'] = (mind!=null && intel!=null) ? mind+intel : '';
    e.skills.forEach((sk,i)=>{ A['emoklore.skills.'+i+'.v'] = emoSkillTarget(sk, ab); });
    EMO_BASE_SKILLS.forEach(def=>{ A['emoklore.base.'+emoNorm(def.n)] = emoBaseTarget(def, ab); });
  } else if(np.sys==='dx3rd'){
    const d = np.dx3rd, sense=n(d.ab.sense), mind=n(d.ab.mind);
    A['dx3rd.act'] = (sense!=null && mind!=null) ? sense*2+mind : '';
    /* 組合技：把由所選效果決定的部分自動算出。
       侵蝕值為合計（已在實際角色卡上確認：多一個效果，差值就是該效果的侵蝕值）。
       技能・對象・射程・時機無法加總，
       所以把所選效果中的值直接排出來當候選（混有不同值時以「／」串接）。 */
    const byId = {};
    (d.effects||[]).forEach(f=>{ if(f.id) byId[f.id]=f; });
    (d.combos||[]).forEach((cb,i)=>{
      const picked = (cb.pick||[]).map(id=>byId[id]).filter(Boolean);
      if(!picked.length){
        ['enc','skill','tgt','rng','timing'].forEach(k=>{ A['dx3rd.combos.'+i+'.'+k]=''; });
        return;
      }
      let sum=0, any=false;
      picked.forEach(f=>{ const v=n(f.enc); if(v!=null){ sum+=v; any=true; } });
      A['dx3rd.combos.'+i+'.enc'] = any ? sum : '';
      ['skill','tgt','rng','timing'].forEach(k=>{
        const vals=[];
        picked.forEach(f=>{
          const t=String(f[k]||'').trim();
          if(!t || /^[—\-―ー]$/.test(t)) return;
          if(vals.indexOf(t)<0) vals.push(t);
        });
        A['dx3rd.combos.'+i+'.'+k] = vals.join('／');
      });
    });
  } else {
    const c = np.coc, ab = c.ab;
    const con=n(ab.con), siz=n(ab.siz), pow=n(ab.pow), intel=n(ab.int), edu=n(ab.edu);
    if(c.ver==='6'){
      A['coc.sub.hp']   = (con!=null&&siz!=null) ? Math.ceil((con+siz)/2) : '';
      A['coc.sub.mp']   = pow!=null ? pow : '';
      A['coc.sub.san']  = pow!=null ? pow*5 : '';
      A['coc.sub.idea'] = intel!=null ? intel*5 : '';
      A['coc.sub.luck'] = pow!=null ? pow*5 : '';
      A['coc.sub.know'] = edu!=null ? edu*5 : '';
      A['coc.sub.mov']  = 8;
    } else {
      A['coc.sub.hp']  = (con!=null&&siz!=null) ? Math.floor((con+siz)/10) : '';
      A['coc.sub.mp']  = pow!=null ? Math.floor(pow/5) : '';
      A['coc.sub.san'] = pow!=null ? pow : '';
      /* 第 7 版的移動力會因 STR／DEX／SIZ 的比較與年齡而改變，所以不自動計算 */
    }
  }
  return A;
}
/* 有手動輸入就回傳手動值，沒有就回傳自動計算值 */
function npcEff(np, A, path){
  const s = String(getNpcField(np,path) ?? '').trim();
  if(s !== '') return s;
  const a = A[path];
  return (a==null || a==='') ? '' : String(a);
}

/* ---- 元件 ---- */
function npcIn(path, val, o){
  o = o || {};
  return '<input class="npc-i '+(o.cls||'')+'" type="text" data-npcfield="'+path+'" value="'+esc(val||'')+'"'
    + (o.list?' list="'+o.list+'"':'') + (o.ph?' placeholder="'+esc(o.ph)+'"':'') + '>';
}
/* 自動計算欄：手動輸入為空時，以淡色字顯示計算值。把欄位清空就會回到自動 */
function npcAutoIn(path, stored, computed, o){
  o = o || {};
  const isAuto = String(stored ?? '').trim()==='';
  const shown = isAuto ? (computed===''||computed==null?'':String(computed)) : stored;
  return '<input class="npc-i npc-auto '+(isAuto?'isauto':'')+'" type="text" data-npcfield="'+path+'" value="'+esc(shown)+'"'
    + (o.list?' list="'+o.list+'"':'') + (o.ph?' placeholder="'+esc(o.ph)+'"':'') + '>';
}
function npcCell(label, inner){
  return '<div class="npc-cell"><span class="k">'+esc(label)+'</span><span class="v">'+inner+'</span></div>';
}
function npcFld(label, inner){
  return '<span class="fld"><span class="k">'+esc(label)+'</span>'+inner+'</span>';
}
function roText(v, ph){ /* 閱覽 HTML 用的唯讀顯示 */
  const t = String(v==null?'':v).trim();
  return t ? esc(t) : '<span class="npc-ph">'+esc(ph||'')+'</span>';
}

/* 參照能力的下拉選單。為了能只替換該列，獨立成一個函式 */
function emoRefSelectHTML(sk, i, ab){
  const def  = emoDefOf(sk.n);
  const list = (def && def.refs.length) ? def.refs : Object.keys(EMO_AB_LABEL);
  const auto = emoPickRef(def, ab);
  const autoLabel = auto ? EMO_AB_LABEL[auto]+(emoDiv(def,auto)>1?'÷'+emoDiv(def,auto):'') : '—';
  const manual = String(sk.ref||'').trim();
  return '<select class="npc-s'+(manual?'':' isauto')+'" data-npcfield="emoklore.skills.'+i+'.ref">'
    + '<option value=""'+(manual?'':' selected')+'>'+esc(autoLabel)+'</option>'
    + list.map(r=>'<option value="'+r+'"'+(manual===r?' selected':'')+'>'
        + EMO_AB_LABEL[r] + (emoDiv(def,r)>1?'÷'+emoDiv(def,r):'') + '</option>').join('')
    + '</select>';
}
function emokloreHTML(np, A, edit, mode){
  const e = np.emoklore, ab = e.ab;
  const abCells = EMOKLORE_AB.map(([k,l])=>npcCell(l,
    edit ? npcIn('emoklore.ab.'+k, ab[k], {list:'dl-emo-ab'}) : roText(ab[k])
  )).join('');

  /* 共鳴感情：先選屬性→再選該屬性的感情，是分段式的下拉選單。
     表・裏・根源的屬性並不固定，所以每一格都可以先從屬性選起。 */
  const resCells = EMO_RES_SLOTS.map(([slot,label,hint])=>{
    const r = e.res[slot] || {attr:'',name:''};
    const attrDef = emoAttrOf(r.attr);
    if(!edit){
      const txt = r.name ? r.name + (attrDef?'（'+attrDef.label+'）':'') : '';
      return '<div class="npc-cell"><span class="k">'+esc(label)+'</span><span class="v">'+roText(txt,'—')+'</span></div>';
    }
    const attrSel = '<select class="npc-s" data-npcfield="emoklore.res.'+slot+'.attr">'
      + '<option value="">'+T('npc.pickAttr')+'</option>'
      + EMO_EMOTIONS.map(a=>'<option value="'+a.k+'"'+(r.attr===a.k?' selected':'')+'>'+esc(a.label)+'</option>').join('')
      + '</select>';
    /* 屬性未選時也能從全部感情中選，選了屬性就只列出該屬性 */
    const nameSel = '<select class="npc-s" data-npcfield="emoklore.res.'+slot+'.name">'
      + '<option value="">'+T('npc.pickEmotion')+'</option>'
      + (attrDef
          ? attrDef.items.map(x=>'<option value="'+esc(x)+'"'+(r.name===x?' selected':'')+'>'+esc(x)+'</option>').join('')
          : EMO_EMOTIONS.map(a=>'<optgroup label="'+esc(a.label)+'">'
              + a.items.map(x=>'<option value="'+esc(x)+'"'+(r.name===x?' selected':'')+'>'+esc(x)+'</option>').join('')
              + '</optgroup>').join(''))
      + '</select>';
    return '<div class="npc-cell npc-res"><span class="k" title="'+esc(hint)+'">'+esc(label)+'</span>'
      + '<span class="v">'+attrSel+nameSel+'</span></div>';
  }).join('');

  /* 習得技能：類別不另立一欄，而是在技能格中以「類別→技能」分段選擇。
     基本技能另有專區，所以從候選中排除。 */
  const skillCell = (sk,i)=>{
    const def = emoDefOf(sk.n);
    const cands = EMO_SKILLS.filter(d=>d.kind!=='base' && (!sk.cat || d.cat===sk.cat));
    const catSel = '<select class="npc-s npc-cat" data-npcfield="emoklore.skills.'+i+'.cat">'
      + '<option value="">'+T('npc.cat')+'</option>'
      + EMO_CATS.map(c=>'<option value="'+esc(c)+'"'+(sk.cat===c?' selected':'')+'>'+esc(c)+'</option>').join('')
      + '</select>';
    /* 填入種類後，選項的顯示也換成〈専門知識:歴史〉這樣的寫法 */
    const label = d => (d.arg && d.n===sk.n && String(sk.arg||'').trim())
      ? d.n.replace('○○', String(sk.arg).trim()) : d.n;
    const nameSel = '<select class="npc-s npc-skname" data-npcfield="emoklore.skills.'+i+'.n">'
      + '<option value="">'+T('npc.pickSkill')+'</option>'
      + cands.map(d=>'<option value="'+esc(d.n)+'"'+(sk.n===d.n?' selected':'')+'>'+esc(label(d))+'</option>').join('')
      + ((sk.n && !cands.some(d=>d.n===sk.n)) ? '<option value="'+esc(sk.n)+'" selected>'+esc(sk.n)+'</option>' : '')
      + '</select>';
    const argIn = (def && def.arg)
      ? npcIn('emoklore.skills.'+i+'.arg', sk.arg, {cls:'npc-arg', ph:T('npc.argPh')}) : '';
    return '<div class="skwrap">'+catSel + nameSel + argIn+'</div>';
  };
  const rows = e.skills.map((sk,i)=>({sk:sk,i:i}))
    .filter(r=>edit || String(r.sk.n||'').trim())
    .map(({sk,i})=>{
      const ref = emoSkillRef(sk, ab);
      return '<tr data-row="'+i+'">'
      + '<td class="tl skillcell">'+(edit ? skillCell(sk,i) : roText(emoSkillName(sk),'—'))+'</td>'
      + '<td class="refcell">'+(edit ? emoRefSelectHTML(sk,i,ab) : roText(ref?EMO_AB_LABEL[ref]:'','—'))+'</td>'
      + '<td>'+(edit ? npcIn('emoklore.skills.'+i+'.lv', sk.lv, {list:'dl-emo-lv', ph:'Lv'}) : roText(sk.lv))+'</td>'
      + '<td>'+(edit
          ? npcAutoIn('emoklore.skills.'+i+'.v', sk.v, A['emoklore.skills.'+i+'.v'])
          : roText(npcEff(np,A,'emoklore.skills.'+i+'.v')))+'</td>'
      + '</tr>';
    }).join('');

  /* 基本技能：每個人一開始就有的技能。判定值由參照能力自動算出 */
  const baseRows = EMO_BASE_SKILLS.map(def=>{
    const key = emoNorm(def.n), path = 'emoklore.base.'+key;
    return '<tr>'
      + '<td class="tl">'+esc(def.n)+'</td>'
      + '<td>'+esc(emoRefLabel(def))+'</td>'
      + '<td>'+(edit ? npcAutoIn(path, e.base[key], A[path]) : roText(npcEff(np,A,path)))+'</td>'
      + '</tr>';
  }).join('');
  const baseTable = '<table class="npc-table"><tr><th>'+T('npc.emo.baseSkill')+'</th><th>'+T('npc.refAbility')+'</th><th>'+T('npc.targetValue')+'</th></tr>'
    + baseRows + '</table>';

  return ''
    + '<div class="npc-grid c8">'+abCells+'</div>'
    + '<div class="npc-row">'
      + npcFld('HP', edit?npcAutoIn('emoklore.hp', e.hp, A['emoklore.hp']):roText(npcEff(np,A,'emoklore.hp')))
      + npcFld('MP', edit?npcAutoIn('emoklore.mp', e.mp, A['emoklore.mp']):roText(npcEff(np,A,'emoklore.mp')))
      + npcFld(T('npc.emo.kyomei'), edit?npcIn('emoklore.kyomei', e.kyomei, {list:'dl-emo-kyomei',ph:'1'})
                                  :roText(e.kyomei))
    + '</div>'
    + '<div class="npc-sub">'+T('npc.emo.res')+'</div>'
    + '<div class="npc-grid c3">'+resCells+'</div>'
    + '<div class="npc-sub">'+T('npc.emo.skills')
      + (edit ? '<span class="npc-rowbtn"><button type="button" data-emoadd>'+T('npc.addRow')+'</button>'
              + '<button type="button" data-emodel>'+T('npc.delEmptyRows')+'</button></span>' : '')
    + '</div>'
    + '<table class="npc-table npc-skilltable"><tr><th>'+T('npc.skill')+'</th><th>'+T('npc.refAbility')+'</th><th>Lv</th><th>'+T('npc.targetValue')+'</th></tr>'+rows+'</table>'
    /* 基本技能是固定的一覽，所以不放在紙面上，只在詳細視窗裡顯示 */
    + (mode==='modal' ? npcAccordion(T('npc.emo.baseSkill'), 'emoklore.baseOpen', e.baseOpen, baseTable, edit) : '');
}

/* 在表格標題加上「增加／減少列」。
   path 是陣列所在的位置（例 'coc.skills'）。可以減到 0 列。 */
function npcRowsHead(title, path, count, max, edit){
  if(!edit) return '<div class="npc-sub">'+esc(title)+'</div>';
  return '<div class="npc-sub">'+esc(title)
    + '<span class="npc-rowbtn">'
    + '<button type="button" data-rowadd="'+path+'"'+(count>=max?' disabled':'')+'>'+T('common.rowAdd')+'</button>'
    + '<button type="button" data-rowdel="'+path+'"'+(count<=0?' disabled':'')+'>'+T('common.rowDel')+'</button>'
    + '<span class="npc-rowct">'+(max>=99 ? count+T('npc.rowUnit') : count+'／'+max)+'</span></span></div>';
}
/* 點標題就能開合的區塊。在編輯畫面一律顯示標題，
   列印與閱覽 HTML 則只在展開時連同內容一起輸出（收合時什麼都不輸出） */
function npcAccordion(title, path, open, inner, edit, rawHead){
  if(!edit) return (open && String(inner||'').trim())
    ? '<div class="npc-sub">'+(rawHead?title:esc(title))+'</div>'+inner : '';
  return '<div class="npc-acc">'
    + '<div class="npc-acc-h'+(open?' open':'')+'">'
      + '<button type="button" class="npc-acc-t" data-acc="'+path+'">'
        + '<span class="npc-acc-mark">'+(open?'▼':'▶')+'</span>'
        + (rawHead?'':esc(title))

      + '</button>'
      + (rawHead?title:'')
    + '</div>'
    + (open ? '<div class="npc-acc-b">'+inner+'</div>' : '')
    + '</div>';
}

function dx3rdHTML(np, A, edit){
  const d = np.dx3rd;
  /* 依能力值分組，把參照該能力的技能掛在底下排列（與 Yutosheet 相同的排列） */
  const groups = DX3RD_AB.map(([abk,abl])=>{
    const defs = DX3RD_SKILL_DEFS.filter(x=>x.ab===abk);
    const cells = defs.map(def=>{
      const val = d.skills[def.k], arg = (d.sarg||{})[def.k];
      const label = def.arg ? def.n+':' : def.n;
      /* 沒有種類的技能也在相同位置放一個空格。
         不這樣做的話，數值欄會往前一欄靠，每列的位數就會錯開 */
      const argCell = def.arg
        ? (edit ? npcIn('dx3rd.sarg.'+def.k, arg, {cls:'dxarg', ph:T('npc.argPh')})
                : '<span class="dxargv">'+roText(arg,'○○')+'</span>')
        : '<span class="dxsp"></span>';
      return '<span class="dxsk"><span class="k">'+esc(label)+'</span>'
        + argCell
        + (edit ? npcIn('dx3rd.skills.'+def.k, val, {cls:'dxval', list:'dl-dx-sk'}) : '<span class="dxvalv">'+roText(val)+'</span>')
        + '</span>';
    }).join('');
    return '<div class="dxrow">'
      + '<span class="dxab"><span class="k">'+esc(abl)+'</span><span class="dxsp"></span>'
        + (edit ? npcIn('dx3rd.ab.'+abk, d.ab[abk], {cls:'dxabv', list:'dl-dx-ab'}) : '<span class="dxvalv">'+roText(d.ab[abk])+'</span>')
      + '</span>' + cells + '</div>';
  }).join('');

  /* 效果（Effect）。把種類（症候群）的顏色標在列的左端與名稱上。
     限制欄配合 Yutosheet 放在最後。 */
  const F = ['lv','timing','skill','dif','tgt','rng','enc','lim'];
  const PH = {lv:'Lv',timing:T('npc.dx.timing'),skill:T('npc.skill'),dif:T('npc.dx.dif'),tgt:T('npc.dx.tgt'),rng:T('npc.dx.rng'),enc:T('npc.dx.enc'),lim:T('npc.dx.lim')};
  const kindSel = (f,i)=>'<select class="npc-s dxkindsel" data-npcfield="dx3rd.effects.'+i+'.kind">'
    + '<option value="">'+T('npc.argPh')+'</option>'
    + DX3RD_KIND.map(x=>'<option value="'+x.k+'"'+(f.kind===x.k?' selected':'')+'>'+esc(x.n)+'</option>').join('')
    + '</select>';
  const rows = d.effects.map((f,i)=>({f:f,i:i}))
    .filter(r=>edit||String(r.f.n||'').trim()).map(({f,i})=>{
      const kd = dxKindOf(f.kind);
      return '<tr class="dxeff"'+(kd?' style="--kc:'+kd.c+'"':'')+'>'
        + '<td class="tl dxeffn">'
        + (edit
            ? kindSel(f,i) + npcIn('dx3rd.effects.'+i+'.n', f.n, {cls:'tl', ph:T('npc.dx.name')})
            : (kd?'<span class="dxkind">'+esc(kd.n)+'</span>':'') + roText(f.n,'—'))
        + '</td>'
        + F.map(k=>'<td>'
            + (edit ? npcIn('dx3rd.effects.'+i+'.'+k, f[k], {ph:PH[k]}) : roText(f[k],'—'))
            + '</td>').join('')
        + '</tr>';
    }).join('');

  /* 組合技（Combo）。欄位太多所以不做成表格，而是一筆一筆縱向堆疊，裡面的項目再分欄排列。
     欄位配合 Yutosheet 的實物。 */
  /* 可以自動算出的欄位（侵蝕值・技能・對象・射程・時機），
     與行動值一樣做成「顯示自動值，但可手動覆寫」的形式 */
  const CB      = [['timing',T('npc.dx.timing'),1],['skill',T('npc.skill'),1],['hit',T('npc.dx.hit'),0],['atk',T('npc.dx.atk'),0],
                   ['tgt',T('npc.dx.tgt'),1],['rng',T('npc.dx.rng'),1],['enc',T('npc.dx.enc'),1]];
  const effOpts = (d.effects||[]).filter(f=>String(f.n||'').trim());
  /* 組合的部分，排出從已填寫的效果中挑選的下拉選單。
     武器等不在效果表中的東西寫在「其他」。 */
  const cbPick = (cb,i)=>{
    const sels = (cb.pick||[]).map((id,j)=>
      '<select class="npc-s dxpick" data-npcfield="dx3rd.combos.'+i+'.pick.'+j+'">'
      + '<option value="">'+T('npc.dx.pickDash')+'</option>'
      + effOpts.map(f=>{ const kd=dxKindOf(f.kind);
          return '<option value="'+esc(f.id)+'"'+(id===f.id?' selected':'')+'>'
            + esc(f.n + (f.lv?' Lv'+f.lv:'') + (kd?'（'+kd.n+'）':'')) + '</option>'; }).join('')
      + ((id && !effOpts.some(f=>f.id===id)) ? '<option value="'+esc(id)+'" selected>'+T('npc.dx.goneEffect')+'</option>' : '')
      + '</select>').join('');
    return '<div class="dxcb-pick">'
      + (sels || '<span class="hint" style="margin:0">'+T('npc.dx.addEffectHint')+'</span>')
      + '<span class="dxcb-pb"><button type="button" data-cbadd="'+i+'">'+T('npc.dx.addEffect')+'</button>'
      + '<button type="button" data-cbdel="'+i+'"'+((cb.pick||[]).length?'':' disabled')+'>−</button></span>'
      + '</div>'
      + '<div class="dxcb-f"><span class="k">'+T('npc.dx.other')+'</span>'
      + npcIn('dx3rd.combos.'+i+'.extra', cb.extra, {cls:'tl', ph:T('npc.dx.otherPh')})+'</div>';
  };
  /* 閱讀時「組合」欄的文字。有選的話就組出來，沒有的話就照原樣輸出匯入的文字 */
  const cbText = cb=>{
    const names = (cb.pick||[]).map(id=>{
      const f=(d.effects||[]).find(x=>x.id===id); return f ? String(f.n||'').trim() : ''; }).filter(Boolean);
    const ex = String(cb.extra||'').trim();
    if(names.length) return names.map(x=>'〈'+x+'〉').join('＋') + (ex?'＋'+ex:'');
    return String(cb.cmb||'').trim() || ex;
  };
  const cbFoot = (cb,i,k,l,ph)=> (edit || String(cb[k]||'').trim())
      ? '<div class="dxcb-f"><span class="k">'+esc(l)+'</span>'
        + (edit ? npcIn('dx3rd.combos.'+i+'.'+k, cb[k], {cls:'tl', ph:ph}) : roText(cb[k],'—'))
        + '</div>' : '';
  const combos = d.combos.map((cb,i)=>({cb:cb,i:i}))
    .filter(r=>edit||String(r.cb.n||'').trim()).map(({cb,i})=>
      '<div class="dxcb">'
      + '<div class="dxcb-h">'
        + (edit ? npcIn('dx3rd.combos.'+i+'.n', cb.n, {cls:'tl', ph:T('npc.dx.comboName')}) : rubyHTML(cb.n||'—'))
      + '</div>'
      + (edit ? '<div class="dxcb-f"><span class="k">'+T('npc.dx.combo')+'</span></div>' + cbPick(cb,i)
              : (cbText(cb) ? '<div class="dxcb-f"><span class="k">'+T('npc.dx.combo')+'</span>'
                              + rubyHTML(cbText(cb)) + '</div>' : ''))
      + '<div class="dxcb-g">'
      + CB.map(([k,l,auto])=>'<span class="dxcb-c"><span class="k">'+esc(l)+'</span>'
          + '<span class="v">'
          + (edit ? (auto ? npcAutoIn('dx3rd.combos.'+i+'.'+k, cb[k], A['dx3rd.combos.'+i+'.'+k], {ph:'—'})
                          : npcIn('dx3rd.combos.'+i+'.'+k, cb[k], {ph:'—'}))
                  : roText(auto ? npcEff(np,A,'dx3rd.combos.'+i+'.'+k) : cb[k], '—'))
          + '</span></span>').join('')
      + '</div>'
      + cbFoot(cb,i,'cond',T('npc.dx.cond'),T('npc.dx.condPh'))
      + cbFoot(cb,i,'eff',T('npc.dx.eff'),T('npc.dx.effPh'))
      + '</div>').join('');

  /* 症候群的數量由血統決定（Pure 1・Cross 2・Tri 3） */
  const nSyn = dxBreedN(d.breed) || 1;
  const breedSeg = edit
    ? '<span class="dxseg">'+DX3RD_BREEDS.map(([k,l])=>
        '<button type="button" data-dxbreed="'+k+'"'+(d.breed===k?' class="on"':'')+'>'+l+'</button>').join('')+'</span>'
    : roText((DX3RD_BREEDS.find(x=>x[0]===d.breed)||[])[1], '—');
  const synSels = edit
    ? '<span class="dxsyns">'+[0,1,2].slice(0,nSyn).map(i=>{
        const cur = d.syns[i]||'', c = dxSynOf(cur);
        return '<select class="npc-s dxsynsel"'+(c?' style="--kc:'+c.c+'"':'')
          + ' data-npcfield="dx3rd.syns.'+i+'">'
          + '<option value="">'+T('npc.pick')+'</option>'
          + DX3RD_SYN.map(x=>'<option value="'+x.k+'"'+(cur===x.k?' selected':'')+'>'+esc(x.n)+'</option>').join('')
          + '</select>';
      }).join('')+'</span>'
    : (dxSynText(d)
        ? (d.syns||[]).slice(0,nSyn).map(k=>dxSynOf(k)).filter(Boolean).map(x=>
            '<span class="dxsyn" style="--kc:'+x.c+'">'+esc(x.n)+'</span>').join('')
        : roText('','—'));
  return ''
    + '<div class="npc-row dxhead">'
      + npcFld(T('npc.dx.breed'), breedSeg)
      + npcFld(T('npc.dx.syn'), synSels)
      + npcFld(T('npc.dx.encFixed'), edit?npcIn('dx3rd.enc', d.enc, {list:'dl-dx-enc'}):roText(d.enc))
    + '</div>'
    + '<div class="npc-sub">'+T('npc.dx.abSkills')+'</div>'
    + '<div class="dxgrid">'+groups+'</div>'
    + '<div class="npc-row">'
      + npcFld(T('npc.dx.act'), edit?npcAutoIn('dx3rd.act', d.act, A['dx3rd.act']):roText(npcEff(np,A,'dx3rd.act')))
      + npcFld(T('npc.dx.hpMax'), edit?npcIn('dx3rd.hp', d.hp, {list:'dl-dx-hp'}):roText(d.hp))
      + npcFld(T('npc.dx.stock'), edit?npcIn('dx3rd.stock', d.stock, {list:'dl-dx-sk'}):roText(d.stock))
    + '</div>'
    + npcRowsHead(T('npc.dx.effects'), 'dx3rd.effects', d.effects.length, 99, edit)
    + (rows ? '<table class="npc-table npc-dxeff"><tr><th>'+T('npc.dx.name')+'</th><th>Lv</th><th>'+T('npc.dx.timing')+'</th><th>'+T('npc.skill')+'</th>'
        + '<th>'+T('npc.dx.dif')+'</th><th>'+T('npc.dx.tgt')+'</th><th>'+T('npc.dx.rng')+'</th><th>'+T('npc.dx.enc')+'</th><th>'+T('npc.dx.lim')+'</th></tr>'+rows+'</table>' : '')
    + ((!edit && !combos) ? ''
        : npcRowsHead(T('npc.dx.combos'), 'dx3rd.combos', d.combos.length, 99, edit)
          + (combos ? '<div class="dxcbs">'+combos+'</div>' : ''));
}

function cocHTML(np, A, edit){
  const c = np.coc, v6 = c.ver==='6';
  const LIST = v6 ? COC6_LIST : COC7_LIST;
  const abCells = COC_AB.map(([k,l])=>npcCell(l,
    edit ? npcIn('coc.ab.'+k, c.ab[k], {list:LIST[k]}) : roText(c.ab[k])
  )).join('');
  /* 第 6 版有靈感／知識，沒有體格。第 7 版則相反 */
  const subDefs = v6
    ? [['hp',T('npc.coc.hp'),1],['mp','MP',1],['san',T('npc.coc.san'),1],['idea',T('npc.coc.idea'),1],['luck',T('npc.coc.luck'),1],['know',T('npc.coc.know'),1],['db','DB',0],['mov','MOV',1]]
    : [['hp',T('npc.coc.hp'),1],['mp','MP',1],['san',T('npc.coc.san'),1],['luck',T('npc.coc.luck'),0],['build',T('npc.coc.build'),0],['db','DB',0],['mov','MOV',0]];
  const subCells = subDefs.map(([k,l,auto])=>npcCell(l,
    edit
      ? (auto ? npcAutoIn('coc.sub.'+k, c.sub[k], A['coc.sub.'+k], {list:(k==='mov'?'dl-mov':'')})
              : npcIn('coc.sub.'+k, c.sub[k], {list:(k==='db'?'dl-db':k==='build'?'dl-build':k==='mov'?'dl-mov':'dl-coc-sk')}))
      : roText(npcEff(np,A,'coc.sub.'+k))
  )).join('');
  /* 技能以「選類別→選其中的技能」分段選擇。種類可自由輸入（例：芸術/製作:絵画） */
  /* 技能格。雖是類別→技能的分段式，但清單中沒有的技能可以用「自己輸入」直接打。
     種類（專業領域）欄只在該技能需要時才顯示。 */
  const skillCell = (sk,i)=>{
    const catSel = '<select class="npc-s npc-cat" data-npcfield="coc.skills.'+i+'.cat">'
      + '<option value="">'+T('npc.cat')+'</option>'
      + cocCats(c.ver).map(x=>'<option value="'+esc(x)+'"'+(sk.cat===x?' selected':'')+'>'+esc(x)+'</option>').join('')
      + '</select>';
    const cands = cocSkillsOf(c.ver, sk.cat);
    const nameBox = sk.free
      ? npcIn('coc.skills.'+i+'.n', sk.n, {cls:'npc-skname', ph:T('npc.coc.skillNamePh')})
        + '<button type="button" class="npc-mini" data-cocfree="'+i+'" data-v="0" title="'+T('npc.coc.pickFromList')+'">'+T('npc.coc.list')+'</button>'
      : '<select class="npc-s npc-skname" data-npcfield="coc.skills.'+i+'.n">'
        + '<option value="">'+T('npc.pickSkill')+'</option>'
        + cands.map(x=>'<option value="'+esc(x)+'"'+(sk.n===x?' selected':'')+'>'+esc(x)+'</option>').join('')
        + ((sk.n && cands.indexOf(sk.n)<0) ? '<option value="'+esc(sk.n)+'" selected>'+esc(sk.n)+'</option>' : '')
        + '<option value="__free__">'+T('npc.coc.writeOwn')+'</option>'
        + '</select>';
    const argBox = cocNeedsArg(c.ver, sk.n)
      ? npcIn('coc.skills.'+i+'.arg', sk.arg, {cls:'npc-arg', ph:T('npc.argPh')}) : '';
    return '<div class="skwrap">'+catSel + nameBox + argBox + '</div>';
  };
  const rows = c.skills.map((s,i)=>({s:s,i:i})).filter(r=>edit||String(r.s.n||'').trim()).map(({s,i})=>'<tr>'
    + '<td class="tl skillcell">'+(edit?skillCell(s,i):roText(withArg(s.n,s.arg),'—'))+'</td>'
    + '<td>'+(edit?npcIn('coc.skills.'+i+'.v', s.v, {list:'dl-coc-sk',ph:'%'}):roText(s.v))+'</td>'
    + '</tr>').join('');
  const wrows = c.weapons.map((w,i)=>({w:w,i:i}))
    .filter(r=>edit || String(r.w.n||'').trim() || String(r.w.dmg||'').trim()).map(({w,i})=>'<tr>'
    + '<td class="tl">'+(edit?npcIn('coc.weapons.'+i+'.n', w.n, {cls:'tl',ph:T('npc.coc.weaponName')}):roText(w.n,'—'))+'</td>'
    + '<td>'+(edit?npcIn('coc.weapons.'+i+'.v', w.v, {list:'dl-coc-sk',ph:'%'}):roText(w.v))+'</td>'
    + '<td>'+(edit?npcIn('coc.weapons.'+i+'.dmg', w.dmg, {list:'dl-dmg',ph:T('npc.coc.dmg')}):roText(w.dmg))+'</td>'
    + '</tr>').join('');
  return ''
    + '<div class="npc-grid c8">'+abCells+'</div>'
    + '<div class="npc-grid" style="grid-template-columns:repeat('+subDefs.length+',1fr)">'+subCells+'</div>'
    + npcRowsHead(T('npc.coc.mainSkills'), 'coc.skills', c.skills.length, 12, edit)
    + (rows ? '<table class="npc-table"><tr><th>'+T('npc.skill')+'</th><th>％</th></tr>'+rows+'</table>' : '')
    + ((!edit && !wrows) ? '' :
        npcRowsHead(T('npc.coc.weapons'), 'coc.weapons', c.weapons.length, 12, edit)
      + (wrows ? '<table class="npc-table"><tr><th>'+T('npc.coc.weapons')+'</th><th>'+T('npc.coc.skillPct')+'</th><th>'+T('npc.coc.dmg')+'</th></tr>'+wrows+'</table>' : ''));
}

/* mode: 'page' = 紙面 ／ 'modal' = 詳細視窗 ／ 'static' = 列印・匯出 */
function npcInnerHTML(b, edit, mode){
  mode = mode || (edit ? 'page' : 'static');
  const np = edit ? ensureNpc(b) : (b.npc || newNpcData());
  const A = computeNpcAuto(np);
  const sys = np.sys || 'emoklore';
  const sysLabel = {emoklore:T('npc.sys.emoklore'), dx3rd:T('npc.sys.dx3rd'), coc:T('npc.sys.coc')}[sys];
  const bar = (edit && mode==='modal') ? '<div class="npc-sysbar npc-noprint">'
      + '<label><span>'+T('npc.system')+'</span><select data-npcsys>'
        + '<option value="emoklore"'+(sys==='emoklore'?' selected':'')+'>'+T('npc.sys.emoklore')+'</option>'
        + '<option value="dx3rd"'+(sys==='dx3rd'?' selected':'')+'>'+T('npc.sys.dx3rd')+'</option>'
        + '<option value="coc"'+(sys==='coc'?' selected':'')+'>'+T('npc.sys.coc')+'</option>'
      + '</select></label>'
      + (sys==='coc' ? '<label><span>'+T('npc.ver')+'</span><select data-npcver>'
        + '<option value="7"'+(np.coc.ver!=='6'?' selected':'')+'>'+T('npc.ver7')+'</option>'
        + '<option value="6"'+(np.coc.ver==='6'?' selected':'')+'>'+T('npc.ver6')+'</option>'
      + '</select></label>' : '')
      + '<button type="button" class="npc-ccf" data-ccf>'+T('npc.copyCcf')+'</button>'
      + (np.art ? '' : '<button type="button" class="npc-ccf" data-npcart>'+T('npc.addArt')+'</button>')
      + '<button type="button" class="npc-ccf" data-tprev>'+T('common.preview')+'</button>'
      + '<button type="button" class="npc-ccf npc-open" data-npcopen>'+T('npc.openModal')+'</button>'
    + '</div>' : '';
  const tag = '<span class="npc-tag">'+esc(sysLabel)+(sys==='coc'?(np.coc.ver==='6'?T('npc.tag6'):T('npc.tag7')):'')+'</span>';
  const body = sys==='emoklore' ? emokloreHTML(np,A,edit,mode) : sys==='dx3rd' ? dx3rdHTML(np,A,edit) : cocHTML(np,A,edit);
  const art = np.art
    ? '<div class="npc-art" style="flex:0 0 '+(np.artW||30)+'%"><img src="'+np.art+'" alt="">'
      + ((edit && mode==='modal') ? '<div class="npc-artbar npc-noprint">'
          + '<label><span>'+T('npc.artWidth')+'</span><input class="npc-artw" type="number" min="15" max="50" step="1" value="'+(np.artW||30)+'" data-npcartw><span>%</span></label>'
          + '<button type="button" data-npcart>'+T('npc.artChange')+'</button>'
          + '<button type="button" data-npcartdel>'+T('npc.artRemove')+'</button>'
        + '</div>' : '')
      + '</div>' : '';
  const openW = np.art ? '<div class="npc-arwrap"><div class="npc-arbody">' : '';
  const closeW = np.art ? '</div>'+art+'</div>' : '';
  return bar
    + openW
    + '<div class="npc-head">'
      + '<div class="npc-nameblk">'
        + (edit ? npcIn('kana', np.kana, {cls:'npc-kana',ph:T('npc.kanaPh')})
                : (String(np.kana||'').trim() ? '<span class="npc-kana">'+esc(np.kana)+'</span>' : '<span class="npc-kana"></span>'))
        + (edit ? npcIn('name', np.name, {cls:'npc-name',ph:T('npc.namePh')}) : '<span class="npc-name">'+roText(np.name,T('npc.nameEmpty'))+'</span>')
      + '</div>'
      + (edit ? npcIn('role', np.role, {cls:'npc-role',ph:T('npc.rolePh')}) : '<span class="npc-role">'+roText(np.role,'')+'</span>')
      + tag
    + '</div>'
    + body
    + npcAccordion(T('npc.memo'), 'memoOpen', accOpen(np,'memoOpen',mode), 
        '<div class="npc-memo"'+(edit?' contenteditable="true" data-npcfield="memo" data-ph="'+T('npc.memoPh')+'"':'')+'>'+esc(np.memo||'')+'</div>',
        edit)
    + npcTabsHTML(np, edit, mode)
    + closeW;
}
/* 展開後在頁面上放不下的分頁，在紙面上保持收合，
   只在詳細視窗裡展開。這個暫時的狀態放在這裡。 */
const npcModalOpen = new Set();
function accRead(np, path){
  if(path==='memoOpen') return np.memoOpen!==false;
  if(path.indexOf('tab.')===0) return !!(np.tabs.find(t=>t.id===path.slice(4))||{}).open;
  return !!np.emoklore[path.split('.')[1]];
}
function accWrite(np, path, v){
  if(path==='memoOpen'){ np.memoOpen = v; return; }
  if(path.indexOf('tab.')===0){ const t=np.tabs.find(x=>x.id===path.slice(4)); if(t) t.open=v; return; }
  np.emoklore[path.split('.')[1]] = v;
}
function accOpen(np, path, mode){
  const base = (path==='memoOpen') ? (np.memoOpen!==false)
             : (path.indexOf('tab.')===0) ? !!(np.tabs.find(t=>t.id===path.slice(4))||{}).open
             : !!np.emoklore[path.split('.')[1]];
  if(mode==='modal' && npcModalOpen.has(path)) return true;
  return base;
}
/* 自己加的分頁。標題與內容都可以自由填寫 */
function npcTabsHTML(np, edit, mode){
  const list = (np.tabs||[]).map(t=>{
    const head = edit
      ? '<input class="npc-i npc-tabttl" type="text" data-npctab="'+t.id+'" value="'+esc(t.title)+'" placeholder="'+T('npc.tabNamePh')+'">'
        + '<button type="button" class="npc-tabdel" data-npctabdel="'+t.id+'" title="'+T('npc.tabDel')+'">×</button>'
      : esc(t.title||T('npc.tabNoName'));
    const inner = '<div class="npc-memo"'
      + (edit?' contenteditable="true" data-npcfield="tabtext.'+t.id+'" data-ph="'+T('common.writeHere')+'"':'')
      + '>'+esc(t.text||'')+'</div>';
    return npcAccordion(head, 'tab.'+t.id, accOpen(np,'tab.'+t.id,mode), inner, edit, true);
  }).join('');
  const add = edit ? '<div class="npc-tabadd npc-noprint"><button type="button" data-npctabadd>'+T('npc.tabAdd')+'</button></div>' : '';
  return list + add;
}
/* ================= CCFOLIA 棋子輸出 =================
   格式依據 CCFOLIA 官方的 Clipboard API 文件。
   { kind:"character", data:Partial<Character> }
   status[].value/max 是數值，params[].value 是字串。
   判定指令的語法依據 BCDice 官方的說明。
     Emoklore    (技能Lv)DA(能力值)  … 骰數=Lv，目標值=Lv+能力值。基本技能為 b
     DX3rd       (個數)DX@(臨界值)
     CoC 第 6 版 CCB<=(技能值)   ／ CoC 第 7 版  CC<=(技能值)                          */
function npcToCcfolia(bk){
  const np = ensureNpc(bk);
  const A  = computeNpcAuto(np);
  const V  = p => npcEff(np, A, p);
  const N  = p => { const x = parseFloat(V(p)); return isNaN(x) ? 0 : x; };
  const status = [], params = [], cmds = [];
  const put = (label, v) => { const t = String(v==null?'':v).trim(); if(t!=='') params.push({label:label, value:t}); };
  let initiative = 0;

  if(np.sys==='emoklore'){
    /* 與規則書附錄角色卡相同的排列：
       共鳴放在狀態、強度與能力值放在參數，判定用 {共鳴}DM<={強度} 這樣以變數參照。 */
    const hp=N('emoklore.hp'), mp=N('emoklore.mp');
    status.push({label:'HP', value:hp, max:hp});
    status.push({label:'MP', value:mp, max:mp});
    /* 參數只放能力值的 8 項（技能會排在聊天面板裡） */
    EMOKLORE_AB.forEach(([k,l])=>put(l, V('emoklore.ab.'+k) || '0'));
    /* 共鳴判定要用的變數。準備好狀態的「共鳴」與參數的「強度」 */
    const kyo = parseInt(V('emoklore.kyomei'),10);
    status.push({label:'共鳴', value:(isNaN(kyo)?1:kyo), max:9});
    put('強度', V('emoklore.kyodo') || '0');
    /* 共鳴判定放在最上面。不寫數值，而是寫成 {共鳴} {強度} 的變數，
       所以只要修改棋子那邊的狀態與參數，就會直接反映在判定上 */
    cmds.push('{共鳴}DM<={強度} 〈∞共鳴〉');
    cmds.push('({共鳴}+1)DM<={強度} 〈∞共鳴〉ルーツ属性一致');
    cmds.push('({共鳴}*2)DM<={強度} 〈∞共鳴〉完全一致');
    /* 先排已習得的技能，基本技能放在後面。
       為了讓聊天面板中常用的指令排在上面。 */
    np.emoklore.skills.forEach((sk,i)=>{
      const nm = emoSkillName(sk).trim(); if(!nm) return;
      const tv = V('emoklore.skills.'+i+'.v'); if(!tv) return;
      const lv = parseInt(V('emoklore.skills.'+i+'.lv'), 10);
      cmds.push(((isNaN(lv)||lv<1)?1:lv) + 'DM<=' + tv + ' ' + nm);
    });
    /* 基本技能。配合角色卡的寫法使用全形的＊ */
    EMO_BASE_SKILLS.forEach(def=>{
      const tv = V('emoklore.base.'+emoNorm(def.n));
      cmds.push('1DM<=' + (tv||'0') + ' 〈＊' + emoNorm(def.n) + '〉');
    });


  } else if(np.sys==='dx3rd'){
    const hp = N('dx3rd.hp');
    if(hp) status.push({label:'HP', value:hp, max:hp});
    status.push({label:'侵蝕率', value:N('dx3rd.enc'), max:100});
    initiative = N('dx3rd.act');
    DX3RD_AB.forEach(([k,l])=>put(l, V('dx3rd.ab.'+k) || '0'));
    put('行動値', V('dx3rd.act'));
    DX3RD_SKILL_DEFS.forEach(def=>{
      const v = V('dx3rd.skills.'+def.k); if(!v) return;
      const nm = def.arg ? withArg(def.n, (np.dx3rd.sarg||{})[def.k]) : def.n;
      cmds.push(v+'dx@10 【'+nm+'】');
    });
    const synTxt = dxSynText(np.dx3rd);
    if(synTxt) put('シンドローム', synTxt);
    np.dx3rd.effects.forEach(f=>{ const nm=String(f.n||'').trim();
      const kd = dxKindOf(f.kind);
      if(nm) cmds.push('// '+(kd?'['+kd.n+'] ':'')+nm+(f.lv?' Lv'+f.lv:'')+(f.timing?' / '+f.timing:'')); });
    (np.dx3rd.combos||[]).forEach((cb,ci)=>{ const nm=String(cb.n||'').trim();
      const en = V('dx3rd.combos.'+ci+'.enc');
      if(nm) cmds.push('// コンボ：'+nm+(cb.hit?' / '+cb.hit:'')+(cb.atk?' / 攻撃力'+cb.atk:'')
                       +(en?' / 侵蝕'+en:'')); });

  } else {
    const v6 = np.coc.ver==='6', cc = v6 ? 'CCB' : 'CC';
    const hp=N('coc.sub.hp'), mp=N('coc.sub.mp'), san=N('coc.sub.san'), luck=N('coc.sub.luck');
    status.push({label:'HP',  value:hp,  max:hp});
    status.push({label:'MP',  value:mp,  max:mp});
    status.push({label:'SAN', value:san, max:san});
    if(!v6) status.push({label:'幸運', value:luck, max:luck});   // 第 7 版的幸運是當作狀態
    initiative = N('coc.ab.dex');
    COC_AB.forEach(([k,l])=>put(l, V('coc.ab.'+k) || '0'));
    /* 第 7 版的棋子有 BLD 與 MOV。第 6 版的棋子沒有這些，
       傷害加成會併入傷害判定的算式（配合提供的實際棋子） */
    if(!v6){ put('BLD', V('coc.sub.build') || '0'); put('MOV', V('coc.sub.mov') || '0'); }

    /* 理智檢定第 6 版是 1d100，第 7 版是 CC */
    cmds.push((v6 ? '1d100<={SAN}' : 'CC<={SAN}') + ' 【正気度ロール】');
    cmds.push(cc+'<='+(V('coc.sub.idea')||'0')+' 【アイデア】');
    cmds.push(v6 ? ('CCB<='+(V('coc.sub.luck')||'0')+' 【幸運】') : 'CC<={幸運} 【幸運】');
    cmds.push(cc+'<='+(V('coc.sub.know')||'0')+' 【知識】');
    np.coc.skills.forEach((sk,i)=>{
      const nm = withArg(String(sk.n||'').trim(), sk.arg), v = V('coc.skills.'+i+'.v');
      if(!nm) return;
      cmds.push(cc+'<='+(v||'0')+' 【'+nm+'】');
    });
    (np.coc.weapons||[]).forEach(w=>{
      const wn = String(w.n||'').trim();
      if(wn) cmds.push(cc+'<='+(String(w.v||'').trim()||'0')+' 【'+wn+'】');
    });
    /* 傷害判定附上傷害加成一起排出（與範例棋子相同的形式） */
    const dbRaw = String(V('coc.sub.db')||'').trim();
    const db = (dbRaw==='' || dbRaw==='0' || dbRaw==='±0') ? '' : (/^[+\-]/.test(dbRaw) ? dbRaw : '+'+dbRaw);
    ['1d3','1d4','1d6'].forEach(d=>cmds.push(d+db+' 【ダメージ判定】'));
    /* 能力值檢定。第 6 版要 ×5，第 7 版直接使用 */
    COC_AB.forEach(([k,l])=>{
      cmds.push(v6 ? ('CCB<={'+l+'}*5 【'+l+' × 5】') : ('CC<={'+l+'}　【'+l+'】'));
    });
  }

  /* 棋子的備忘只放桌上馬上需要的身分資訊（讀音・年齡・立場等）。
     角色卡的「備忘」是給 GM 的筆記，所以不放進棋子。 */
  const memo = [np.kana, np.role].map(x=>String(x||'').trim()).filter(Boolean).join('\n');
  return { kind:'character', data:{
    name: String(np.name||'').trim() || 'NPC',
    memo: memo,
    initiative: initiative,
    externalUrl: '',
    iconUrl: null,
    commands: cmds.join('\n'),
    status: status,
    params: params,
    faces: []
  }};
}
/* ================= 讀入 CCFOLIA 的棋子 =================
   讀取 CCFOLIA Clipboard API 的格式（{kind:"character", data:{…}}），
   倒進 NPC 卡。只貼上 data 的情況也接受。
   指令欄的寫法會因製作工具而異，
   所以常見的格式（含本工具自己的輸出）能讀多少就讀多少，
   讀不懂的部分會告知件數，請使用者手動修正。 */
function ccfParse(text){
  const t = String(text||'').trim();
  if(!t) return null;
  let j = null;
  try{ j = JSON.parse(t); }catch(_){
    /* 前後可能多了不相干的文字，所以重新抓最外層的 { } */
    const a = t.indexOf('{'), z = t.lastIndexOf('}');
    if(a<0 || z<=a) return null;
    try{ j = JSON.parse(t.slice(a, z+1)); }catch(__){ return null; }
  }
  if(!j || typeof j!=='object') return null;
  const d = (j.data && typeof j.data==='object') ? j.data : j;
  return (d && typeof d==='object' && (d.name!=null || d.params || d.status || d.commands)) ? d : null;
}
function ccfMaps(d){
  const P={}, ST={};
  (Array.isArray(d.params)?d.params:[]).forEach(x=>{
    const k=String((x&&x.label)||'').trim(); if(k) P[k]=String((x&&x.value)!=null?x.value:'').trim(); });
  (Array.isArray(d.status)?d.status:[]).forEach(x=>{
    const k=String((x&&x.label)||'').trim(); if(k) ST[k]=x; });
  return {P:P, ST:ST};
}
/* 從參數的組成判斷是哪個系統的棋子 */
function ccfSys(d){
  const {P,ST} = ccfMaps(d);
  const has = o => k => Object.prototype.hasOwnProperty.call(o,k);
  const hp=has(P), hs=has(ST);
  if(hp('肉体') && hp('感覚')) return 'dx3rd';
  if(hs('侵蝕率')) return 'dx3rd';
  if(hp('身体') || hp('五感') || hp('運勢')) return 'emoklore';
  if(hp('STR') || hp('CON') || hp('EDU') || hs('SAN')) return 'coc';
  return null;
}
const ccfNum = v => { const t=String(v==null?'':v).trim(); return /^[+-]?\d+(\.\d+)?$/.test(t) ? t : ''; };
const ccfStat = (ST,k) => (ST[k] && ST[k].max!=null) ? ccfNum(ST[k].max) : (ST[k] ? ccfNum(ST[k].value) : '');
/* 像「風見 惺 (Kazami Sei)」這樣，名字後面的圓括號是讀音。
   配合實例（Iachara 的輸出）拆開。括號內即使是日文句子也當成讀音處理。 */
function ccfSplitName(v){
  const t = String(v||'').trim();
  const m = t.match(/^(.+?)[\s　]*[（(]([^（()）]+)[）)]\s*$/);
  if(!m) return {name:t, kana:''};
  return {name:m[1].trim(), kana:m[2].trim()};
}
/* 棋子的備忘。也支援「讀音: …」這種「標題: 值」逐行排列的形式 */
function ccfMemo(v){
  const out = {kana:'', role:[], res:{}};
  String(v||'').split('\n').map(x=>x.trim()).filter(Boolean).forEach(ln=>{
    const m = ln.match(/^([^:：]{1,16})[:：]\s*(.+)$/);
    if(!m){ out.role.push(ln); return; }
    const k = m[1].trim(), val = m[2].trim();
    if(/^(ふりがな|フリガナ|よみ|読み|ヨミ)$/.test(k)){ out.kana = val; return; }
    const mr = k.match(/^共鳴感情[・･]?(表|裏|ルーツ)$/);
    if(mr){ out.res[{'表':'omote','裏':'ura','ルーツ':'root'}[mr[1]]] = val; return; }
    out.role.push(ln);
  });
  return out;
}
/* 把寫成「無我(理想)」這種 感情(屬性) 的共鳴感情拆開 */
function ccfRes(v){
  const t = String(v||'').trim();
  const m = t.match(/^(.+?)[\s　]*[（(]([^（()）]+)[）)]\s*$/);
  const name = (m ? m[1] : t).trim();
  const lab  = m ? m[2].trim() : '';
  let attr = '';
  const byLab = EMO_EMOTIONS.find(a=>a.label===lab);
  if(byLab) attr = byLab.k;
  if(!attr){ const hit = EMO_EMOTIONS.find(a=>a.items.indexOf(name)>=0); if(hit) attr = hit.k; }
  return {name:name, attr:attr};
}
/* 拆出技能名稱附帶的專業領域。冒號或全形括號都有人用
   （本工具＝「藝術:攝影」／Iachara＝「製作（料理）」） */
function ccfArg(v){
  const t = String(v||'').trim();
  let m = t.match(/^([^:：]+)[:：]\s*(.+)$/);
  if(m) return {base:m[1].trim(), arg:m[2].trim()};
  m = t.match(/^(.+?)[\s　]*[（(]([^（()）]+)[）)]\s*$/);
  if(m) return {base:m[1].trim(), arg:m[2].trim()};
  return {base:t, arg:''};
}
/* 目標值是 {SAN} 這種變數參照的行，因為沒有數值，所以略過 */
const ccfVar = v => /^\{/.test(String(v||'').trim());
/* 取出以【…】或〈…〉括起來的技能名稱 */
function ccfName(line){
  let m = line.match(/【([^】]+)】/); if(m) return m[1].trim();
  m = line.match(/〈([^〉]+)〉/);     if(m) return m[1].trim();
  return '';
}
function ccfApply(b, d){
  const np = ensureNpc(b);
  const sys = ccfSys(d);
  const {P,ST} = ccfMaps(d);
  const lines = String(d.commands||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const rep = {name:false, sys:sys||np.sys, skills:0, effects:0, combos:0, unread:0, over:0};

  const nmS = ccfSplitName(d.name);
  if(nmS.name){ np.name = nmS.name; rep.name = true; }
  if(nmS.kana) np.kana = nmS.kana;
  const mm = ccfMemo(d.memo);
  if(mm.kana) np.kana = mm.kana;
  if(mm.role.length) np.role = mm.role.join(' ');

  if(!sys){ rep.sys=null; return rep; }
  np.sys = sys;

  if(sys==='emoklore'){
    const e = np.emoklore;
    EMOKLORE_AB.forEach(([k,l])=>{ if(P[l]!=null && ccfNum(P[l])!=='') e.ab[k]=ccfNum(P[l]); });
    const hp=ccfStat(ST,'HP'), mp=ccfStat(ST,'MP');
    if(hp) e.hp=hp; if(mp) e.mp=mp;
    /* 「強度」是參數，「共鳴」是狀態（目前值即初始共鳴等級） */
    if(ccfNum(P['強度'])!=='') e.kyodo = ccfNum(P['強度']);
    if(ST['共鳴']){ const kv = ccfNum(ST['共鳴'].value); if(kv) e.kyomei = kv; }
    /* 共鳴感情以「共鳴感情・表: 無我(理想)」的形式放在棋子的備忘裡 */
    EMO_RES_SLOTS.forEach(([slot])=>{
      const raw = mm.res[slot]; if(!raw) return;
      const r = ccfRes(raw);
      if(r.name){ e.res[slot] = {attr:r.attr, name:r.name}; }
    });
    const got=[];
    lines.forEach(ln=>{
      /* 像 {共鳴}DM<={強度} 這種只有變數的行，因為沒有數值，所以跳過 */
      const mv = ln.match(/^[^\s]*DM\s*<=\s*([^\s〈【]*)/i);
      if(mv && (ccfVar(mv[1]) || /^\{/.test(ln))) return;
      const m = ln.match(/^(\d+)\s*DM\s*<=\s*([^\s〈【]*)/i);
      const nmx = ccfName(ln);
      if(!m || !nmx){ if(!/^\/\//.test(ln)) rep.unread++; return; }
      const tv = ccfNum(m[2]);
      const base = /[*＊]/.test(nmx);
      const cut  = ccfArg(nmx.replace(/[*＊★☆∞]/g,''));
      const key  = emoNorm(nmx);
      if(base){ if(tv) e.base[emoNorm(nmx)]=tv; return; }
      const def = EMO_SKILL_MAP[key];
      got.push({n:def ? def.n : cut.base, cat:def ? def.cat : '',
                arg:(def && def.arg) ? cut.arg : '', ref:'', lv:m[1], v:tv});
    });
    if(got.length){ e.skills = got.slice(0,24); rep.skills = got.length; }
    while(e.skills.length < EMO_SKILL_ROWS) e.skills.push({n:'',cat:'',arg:'',ref:'',lv:'',v:''});

  } else if(sys==='dx3rd'){
    const x = np.dx3rd;
    DX3RD_AB.forEach(([k,l])=>{ if(ccfNum(P[l])!=='') x.ab[k]=ccfNum(P[l]); });
    if(ccfNum(P['行動値'])!=='') x.act=ccfNum(P['行動値']);
    const hp=ccfStat(ST,'HP'); if(hp) x.hp=hp;
    if(ST['侵蝕率']) { const v=ccfNum(ST['侵蝕率'].value); if(v) x.enc=v; }
    /* 症候群是「Balor／Neumann」的形式。血統也依數量決定 */
    const syn = String(P['シンドローム']||'').trim();
    if(syn){
      const parts = syn.split(/[／\/・、,＋+]/).map(t=>t.trim()).filter(Boolean);
      x.syns=['','',''];
      parts.slice(0,3).forEach((t,i)=>{
        const hit = DX3RD_SYN.find(y=>y.n===t || y.n.replace('＝','=')===t.replace('＝','='));
        if(hit) x.syns[i]=hit.k;
      });
      const n = x.syns.filter(Boolean).length;
      if(n) x.breed = n>=3?'tri':n===2?'cross':'pure';
    }
    const effs=[], combos=[];
    lines.forEach(ln=>{
      const mc = ln.match(/^\/\/\s*コンボ[：:]\s*(.+)$/);
      if(mc){
        const seg = mc[1].split('/').map(t=>t.trim());
        const cb = {n:'',cmb:'',pick:[],extra:'',timing:'',skill:'',hit:'',atk:'',tgt:'',rng:'',enc:'',cond:'',eff:''};
        cb.n = seg[0]||'';
        seg.slice(1).forEach(t=>{
          const ma = t.match(/^攻撃力\s*(.+)$/); if(ma){ cb.atk=ma[1]; return; }
          if(!cb.hit) cb.hit=t;
        });
        if(cb.n) combos.push(cb);
        return;
      }
      const me = ln.match(/^\/\/\s*(.+)$/);
      if(me){
        let t = me[1].trim();
        const f = {kind:'',n:'',lv:'',timing:'',skill:'',dif:'',tgt:'',rng:'',enc:'',lim:''};
        const mk = t.match(/^\[([^\]]+)\]\s*(.*)$/);
        if(mk){ const kd = DX3RD_KIND.find(y=>y.n===mk[1].trim()); if(kd) f.kind=kd.k; t=mk[2].trim(); }
        const parts = t.split('/').map(y=>y.trim());
        t = parts[0]||'';
        if(parts[1]) f.timing = parts[1];
        const ml = t.match(/^(.*?)\s*Lv\s*(\d+)\s*$/i);
        if(ml){ f.n=ml[1].trim(); f.lv=ml[2]; } else { f.n=t; }
        if(f.n) effs.push(f);
        return;
      }
      const ms = ln.match(/^(\d+)\s*dx\s*@?\s*(\d*)/i);
      const nmx = ccfName(ln);
      if(ms && nmx){
        const cut = nmx.split(/[:：]/);
        const base = cut[0].trim(), arg = (cut[1]||'').trim();
        const def = DX3RD_SKILL_DEFS.find(y=>y.n===base);
        if(def){ x.skills[def.k]=ms[1]; if(def.arg && arg) x.sarg[def.k]=arg; rep.skills++; }
        else rep.unread++;
        return;
      }
      rep.unread++;
    });
    if(effs.length){ x.effects = effs; rep.effects = effs.length; }
    if(combos.length){ x.combos = combos; rep.combos = combos.length; }

  } else {
    const c = np.coc;
    const v6 = lines.some(ln=>/^CCB\s*<=/i.test(ln)) && !lines.some(ln=>/^CC\s*<=/i.test(ln));
    c.ver = v6 ? '6' : '7';
    COC_AB.forEach(([k,l])=>{ if(ccfNum(P[l])!=='') c.ab[k]=ccfNum(P[l]); });
    if(ccfNum(P['BLD'])!=='') c.sub.build=ccfNum(P['BLD']);
    if(ccfNum(P['MOV'])!=='') c.sub.mov=ccfNum(P['MOV']);
    ['HP','MP','SAN'].forEach(k=>{ const v=ccfStat(ST,k); if(v) c.sub[k.toLowerCase()]=v; });
    const lk=ccfStat(ST,'幸運'); if(lk) c.sub.luck=lk;
    /* 能力值檢定與固定的判定不是技能，所以分開 */
    const SKIP = ['正気度ロール','アイデア','幸運','知識','ダメージ判定'];
    const abL  = COC_AB.map(([k,l])=>l);
    const got=[];
    lines.forEach(ln=>{
      /* 從傷害判定的行抓出傷害加成（例：1d3+1D4 後面接著傷害判定的標籤） */
      const md = ln.match(/^\d+d\d+\s*([+\-][^\s【]+)?\s*【ダメージ判定】/i);
      if(md){ if(md[1] && !String(c.sub.db||'').trim()) c.sub.db = md[1]; return; }
      const m = ln.match(/^(?:CCB?|1d100)\s*<=\s*([^\s【〈]*)/i);
      const nmx = ccfName(ln);
      if(!m || !nmx){ if(!/^\d+d\d+/i.test(ln)) rep.unread++; return; }
      const v = ccfVar(m[1]) ? '' : ccfNum(m[1]);
      const plain = nmx.replace(/\s*[×xX]\s*5\s*$/,'').trim();
      if(abL.includes(plain)) return;                 // 能力值檢定
      if(SKIP.includes(plain)){
        if(v && plain==='アイデア') c.sub.idea=v;
        if(v && plain==='知識')     c.sub.know=v;
        if(v && plain==='幸運')     c.sub.luck=v;
        return;                                        // 變數參照（CC<={幸運}）不取值
      }
      const all = cocSkillsOf(c.ver, '');
      const catOf = nmv => (COC_SKILLS[c.ver==='6'?'6':'7'].find(g=>g[1].indexOf(nmv)>=0)||['',[]])[0];
      /* 先用完整名稱查清單。避免把「拳擊（Punch）」這種
         連括號在內才是一個技能名的東西拆開。 */
      if(all.indexOf(plain)>=0){
        got.push({n:plain, cat:catOf(plain), arg:'', v:v, free:false});
      }else{
        const cut = ccfArg(plain);
        const inList = all.indexOf(cut.base)>=0;
        got.push(inList
          ? {n:cut.base, cat:catOf(cut.base), arg:(cocNeedsArg(c.ver, cut.base)?cut.arg:''), v:v, free:false}
          : {n:plain, cat:'', arg:'', v:v, free:true});   // 清單中沒有的當作自由輸入
      }
    });
    if(got.length){
      c.skills = got.slice(0,12);
      rep.skills = Math.min(got.length,12);
      if(got.length>12) rep.over = got.length-12;      // 技能欄最多 12 列，所以告知溢出的數量
    }
  }
  return rep;
}
/* ================= 讀入 Yutosheet 的表格 =================
   選取效果表或組合技表複製後，
   會得到每行以「｜」開頭、項目以「 / 」分隔的文字（已用實物確認）。
     組合技：組合技名 / 組合 / 技能 / 命中 / 攻擊力 / 對象 / 射程 / 侵蝕值 / 條件 / 效果
   標題行會跳過。效果欄裡的 &lt;br&gt; 會還原成換行。 */
const YT_HEADS = ['コンボ名','種別','名称','エフェクト名'];
function ytUnesc(v){
  return String(v||'')
    .replace(/&lt;\s*br\s*\/?\s*&gt;/gi, '\n').replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
    .trim();
}
function ytParse(text){
  const rows = [];
  String(text||'').split('\n').forEach(raw=>{
    let ln = String(raw||'').replace(/\t/g,' ').trim();
    if(!ln) return;
    ln = ln.replace(/^[|｜]\s*/,'').replace(/[|｜]\s*$/,'');
    const f = ln.split('/').map(x=>ytUnesc(x));
    if(f.length < 5) return;                       // 太短，不像表格的一列
    if(YT_HEADS.indexOf(f[0])>=0) return;          // 標題行
    if(!f[0]) return;
    rows.push(f);
  });
  return rows;
}
/* 從內容判斷是哪一種表。
   組合技的第 2 欄是排列〈…〉的「組合」，效果表的第 3 欄是 Lv 數字。 */
function ytGuess(rows){
  if(!rows.length) return null;
  let cb=0, ef=0;
  rows.forEach(f=>{
    if(/[〈《]/.test(f[1]||'') && /[+＋]/.test(f[1]||'')) cb++;
    if(/^\d{1,2}$/.test(String(f[2]||'').trim())) ef++;
    if(DX3RD_KIND.some(k=>k.n===String(f[0]||'').trim())) ef++;
  });
  return cb>=ef ? 'combo' : 'effect';
}
function ytApply(b, rows, mode){
  const np = ensureNpc(b);
  if(np.sys!=='dx3rd') np.sys='dx3rd';
  const d = np.dx3rd;
  const at = (f,i)=>String(f[i]==null?'':f[i]).trim();
  if(mode==='combo'){
    const list = rows.map(f=>({
      n:at(f,0), cmb:at(f,1), pick:[], extra:'', timing:'', skill:at(f,2), hit:at(f,3), atk:at(f,4),
      tgt:at(f,5), rng:at(f,6), enc:at(f,7), cond:at(f,8),
      eff: f.length>10 ? f.slice(9).join(' / ').trim() : at(f,9)
    })).filter(x=>x.n);
    if(!list.length) return 0;
    d.combos = list;
    return list.length;
  }
  const list = rows.map(f=>{
    const kd = DX3RD_KIND.find(k=>k.n===at(f,0));
    return {kind: kd?kd.k:'', n:at(f,1), lv:at(f,2), timing:at(f,3), skill:at(f,4),
            dif:at(f,5), tgt:at(f,6), rng:at(f,7), enc:at(f,8), lim:at(f,9)};
  }).filter(x=>x.n);
  if(!list.length) return 0;
  d.effects = list;
  return list.length;
}
let ytId = null, ytMode = 'auto';
function openYt(id){
  ytId = id; ytMode = 'auto';
  document.getElementById('ytText').value='';
  document.getElementById('ytNote').textContent='';
  document.querySelectorAll('[data-ytmode]').forEach(x=>x.classList.toggle('on', x.dataset.ytmode==='auto'));
  document.getElementById('ytDlg').style.display='flex';
  document.getElementById('ytText').focus();
}
function closeYt(){ ytId=null; document.getElementById('ytDlg').style.display='none'; }
document.getElementById('ytCancel').onclick=closeYt;
document.getElementById('ytDlg').addEventListener('click',e=>{ if(e.target.id==='ytDlg') closeYt(); });
document.querySelectorAll('[data-ytmode]').forEach(x=>x.onclick=()=>{
  ytMode = x.dataset.ytmode;
  document.querySelectorAll('[data-ytmode]').forEach(y=>y.classList.toggle('on', y===x));
});
document.getElementById('ytGo').onclick=()=>{
  const note = document.getElementById('ytNote');
  const f = ytId ? findBlock(ytId) : null;
  if(!f || f.b.type!=='npc'){ closeYt(); return; }
  const rows = ytParse(document.getElementById('ytText').value);
  if(!rows.length){ note.textContent=T('yt.noRows');
                    note.style.color='#ff9b83'; return; }
  const mode = (ytMode==='auto') ? ytGuess(rows) : ytMode;
  const n = ytApply(f.b, rows, mode);
  if(!n){ note.textContent=T('yt.nothingRead'); note.style.color='#ff9b83'; return; }
  propId=null; render(); save();
  closeYt();
  const msg = T(mode==='combo'?'yt.loadedCombo':'yt.loadedEffect', n);
  setStatus(msg,'var(--ok)');
  setTimeout(()=>setStatus(msg,'var(--ok)'), 900);
};
addEventListener('keydown', e=>{ if(e.key==='Escape' && ytId) closeYt(); });

/* 讀入用的視窗 */
let ccfInId = null;
function openCcfIn(id){
  ccfInId = id;
  document.getElementById('ccfInText').value='';
  document.getElementById('ccfInNote').textContent='';
  document.getElementById('ccfInDlg').style.display='flex';
  document.getElementById('ccfInText').focus();
}
function closeCcfIn(){ ccfInId=null; document.getElementById('ccfInDlg').style.display='none'; }
document.getElementById('ccfInCancel').onclick=closeCcfIn;
document.getElementById('ccfInDlg').addEventListener('click',e=>{ if(e.target.id==='ccfInDlg') closeCcfIn(); });
document.getElementById('ccfInGo').onclick=()=>{
  const note = document.getElementById('ccfInNote');
  const f = ccfInId ? findBlock(ccfInId) : null;
  if(!f || f.b.type!=='npc'){ closeCcfIn(); return; }
  const d = ccfParse(document.getElementById('ccfInText').value);
  if(!d){ note.textContent=T('ccfin.unreadable');
          note.style.color='#ff9b83'; return; }
  const r = ccfApply(f.b, d);
  if(!r.sys){ note.textContent=T('ccfin.unknownSys');
              note.style.color='#ff9b83'; return; }
  propId=null; render(); save();
  const sysL = {emoklore:T('sys.short.emoklore'),dx3rd:T('sys.short.dx3rd'),coc:T('sys.short.coc')}[r.sys];
  const parts = [T('ccfin.readAs', sysL)];
  if(r.skills)  parts.push(T('ccfin.nSkills', r.skills));
  if(r.effects) parts.push(T('ccfin.nEffects', r.effects));
  if(r.combos)  parts.push(T('ccfin.nCombos', r.combos));
  if(r.over)    parts.push(T('ccfin.nOver', r.over));
  if(r.unread)  parts.push(T('ccfin.nUnread', r.unread));
  closeCcfIn();
  /* 為了不被自動儲存的通知蓋掉，稍微延遲再顯示結果 */
  const msg = parts.join('／'), col = (r.unread||r.over)?'#ff9b83':'var(--ok)';
  setStatus(msg, col);
  setTimeout(()=>setStatus(msg, col), 900);
};
addEventListener('keydown', e=>{ if(e.key==='Escape' && ccfInId) closeCcfIn(); });

async function copyCcfolia(b){
  const text = JSON.stringify(npcToCcfolia(b), null, 1);
  let ok = false;
  try{ await navigator.clipboard.writeText(text); ok = true; }
  catch(_){
    /* 在 file:// 或權限被拒而無法使用 Clipboard API 時的替代方法 */
    try{
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    }catch(__){ ok = false; }
  }
  if(ok){ setStatus(T('status.ccfCopied'),'var(--ok)'); }
  else { showCcfoliaText(text); }
}
function showCcfoliaText(text){
  document.getElementById('ccfText').value = text;
  document.getElementById('ccfDlg').style.display = 'flex';
  const ta = document.getElementById('ccfText'); ta.focus(); ta.select();
  setStatus(T('status.ccfManual'),'#ff9b83');
}



/* ================= 狀態與儲存 ================= */
let S = null;
let sel = new Set();          // 選取中的區塊 ID
let pgSel = new Set();        // 選取中的頁面 ID
let lastPick = null;
let zoomMode = '1';           // 一開始是原尺寸。按下「％」字樣就回到配合視窗（fit）
var pagesView = 'page';       // 頁面一覽欄的顯示（'page' / 'toc'）
let srcView = 'all';          // 'all' = 全部顯示 / 'page' = 以頁為單位顯示
let editingId = null;         // 在區塊編輯模式中正在編輯內容的區塊
let pageMap = [];             // 頁碼 → 該頁所載區塊 ID 的陣列

const KEY='trpg-typeset-v2';
function setStatus(t,c){const e=document.getElementById('status');e.textContent=t;e.style.color=c||'var(--muted)';}
let saveTimer=null;
let unsaved=false;          // 最後一次存成檔案之後是否有變更

/* ================= 復原・重做 =================
   把整份文件的副本一層層疊起來。疊的時機與自動儲存相同（0.7 秒），
   所以打字期間會自然合併成一筆，不會一個字一個字地退回去。 */
const HIST_MAX = 60, HIST_BYTES = 48*1024*1024;
let past=[], future=[], committed=null, histHold=false;
function histTrim(){
  let n=0;
  for(let i=past.length-1;i>=0;i--){
    n += past[i].length;
    if(past.length-i > HIST_MAX || n > HIST_BYTES){ past = past.slice(i+1); return; }
  }
}
/* 把目前的狀態確定到歷程裡。由 save() 呼叫，所以不需要在每個修改的地方埋設 */
function histCommit(){
  if(histHold || !S) return;
  const cur = JSON.stringify(S);
  if(committed===null){ committed=cur; syncUndoBtns(); return; }
  if(cur===committed) return;
  past.push(committed);
  committed = cur;
  future.length = 0;
  histTrim(); syncUndoBtns();
}
function histApply(json){
  histHold=true;
  const keep=[...sel];
  S = JSON.parse(json);
  committed = json;
  sel.clear(); keep.forEach(id=>{ if(findBlock(id)) sel.add(id); });
  editingId=null;
  syncSettings(); render(); save();
  histHold=false;
  syncUndoBtns();
}
function undo(){
  histCommit();                      // 先把還沒確定、打到一半的部分確定下來
  if(!past.length){ setStatus(T('status.cantUndo')); return; }
  future.push(committed);
  histApply(past.pop());
  setStatus(T('status.undone'),'var(--ok)');
}
function redo(){
  if(!future.length){ setStatus(T('status.cantRedo')); return; }
  past.push(committed);
  histApply(future.pop());
  setStatus(T('status.redone'),'var(--ok)');
}
function syncUndoBtns(){
  const u=document.getElementById('btnUndo'), r=document.getElementById('btnRedo');
  if(u) u.disabled = !past.length;
  if(r) r.disabled = !future.length;
}
addEventListener('keydown', e=>{
  if(!(e.ctrlKey||e.metaKey) || e.altKey) return;
  if(prjDlgOn()) return;              // 顯示作品清單期間，不動到背後的原稿
  const k=String(e.key||'').toLowerCase();
  if(k==='z' && !e.shiftKey){ e.preventDefault(); e.stopPropagation(); undo(); }
  else if((k==='z' && e.shiftKey) || k==='y'){ e.preventDefault(); e.stopPropagation(); redo(); }
}, true);

/* ================= 作品的存放處 =================
   原稿（作品）要幾份都可以。每個作品放一份本體，清單用的摘要（標題・更新時間・大小）
   則集中放一份。存放處依下列順序尋找。
     1. window.storage（載入排版台的一方所準備的存放處。有的話照舊優先使用）
     2. IndexedDB
     3. 兩者都沒有的話，就照以前一樣只在 localStorage 放一個作品
   不把 localStorage 當作品的存放處，是因為每個來源只能放約 500 萬字（實測），
   而且在 file:// 下不論 HTML 放在哪裡都共用同一個存放處，作品一多馬上就滿了。

   不讓原稿遺失的規則（每一項都經實測確認後才決定）
     ・本體與清單在同一個交易（transaction）中寫入。避免別的分頁的寫入插進來，讓作品從清單上掉出去
     ・只有開啟該作品的分頁能寫入（Web Locks）。避免兩個分頁寫同一個作品而互相覆蓋
     ・即使一直在打字，也每 3 秒寫一次。關閉瞬間還沒寫完的部分先存到 localStorage
       （重新載入或移到別的頁面時，在那一瞬間才開始的 IndexedDB 寫入不會完成）
     ・每個作品保留過去的版本，刪除的作品在垃圾桶放 30 天
     ・在 Chrome / Edge 也會寫到磁碟上的檔案（瀏覽器的資料消失時也能救回） */
const PRJ_IDX='trpg-prj-index', PRJ_DOC='trpg-prj:', PRJ_GEN='trpg-gen:', PRJ_FH='trpg-fh:', PRJ_CUR='trpg-prj-cur';
const JNL_KEY='trpg-prj-journal:', JNL_META='trpg-prj-journal-meta:';
const SAVE_WAIT=700, SAVE_MAXWAIT=3000;     // 打完 0.7 秒後寫入。一直在打字的話也每 3 秒寫一次
const GEN_MAX=10, GEN_EVERY=10*60*1000;     // 過去的版本最多 10 份。書寫期間每 10 分鐘保留一次
const TRASH_DAYS=30, FILE_EVERY=2000;
const JNL_MAX=4.5e6;       // 關閉瞬間的備份寫到 localStorage。大約只能放 500 萬字（實測）
let prjKV=null;            // 作品的存放處（get/batch）。null 表示只存一個作品的舊方式
let prjId=null;            // 開啟中的作品 ID（還沒有時為 null。這段期間什麼都不寫）
let prjQ=Promise.resolve();// 寫入一次一個依序進行（避免切換途中混在一起）
let savePending=false;     // 是否有打到一半、還沒開始寫進存放處的變更
let pendSince=0;           // 該變更開始的時刻（為了每 3 秒寫一次）
let inflight=null;         // 正在寫進存放處（或沒寫成功）的內容
let saveErr=false;         // 最後一次寫入是否失敗
function parseIdx(v){ try{ const a=v?JSON.parse(v):[]; return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function idbKV(){
  return new Promise((res,rej)=>{
    let q; try{ q=indexedDB.open('trpg-typeset',1); }catch(e){ rej(e); return; }
    q.onupgradeneeded=()=>q.result.createObjectStore('kv');
    q.onerror=()=>rej(q.error); q.onblocked=()=>rej(new Error('blocked'));
    q.onsuccess=()=>{
      const db=q.result;
      const run=(mode,fn)=>new Promise((ok,ng)=>{
        let t; const out={};
        try{ t=db.transaction('kv',mode); fn(t.objectStore('kv'), out); }
        catch(e){ try{ t && t.abort(); }catch(_){} ng(e); return; }
        t.oncomplete=()=>ok(out.v); t.onerror=t.onabort=()=>ng(t.error||new Error('aborted'));
      });
      res({ name:'idb',
        get:k=>run('readonly',(s,o)=>{ const r=s.get(k); r.onsuccess=()=>{ o.v=r.result; }; }),
        keys:()=>run('readonly',(s,o)=>{ const r=s.getAllKeys(); r.onsuccess=()=>{ o.v=r.result; }; }),
        /* 寫入・刪除與清單的改寫在同一個交易中進行。
           重疊的寫入交易即使跨分頁，也會一個一個依序通過（已實測確認），
           所以從讀清單到寫入之間，不會有別的分頁的寫入插進來 */
        batch:(ops,idxFn)=>run('readwrite',(s,o)=>{
          ops.forEach(([k,v])=>{ if(v===undefined) s.delete(k); else s.put(v,k); });
          if(!idxFn) return;
          const r=s.get(PRJ_IDX);
          r.onsuccess=()=>{ const a=parseIdx(r.result); o.v=idxFn(a); s.put(JSON.stringify(a),PRJ_IDX); };
        }) });
    };
  });
}
function wsKV(){
  const W=window.storage;
  const get=async k=>{ const r=await W.get(k); return r && r.value ? r.value : undefined; };
  const del=k=>(W.delete ? W.delete(k) : W.set(k,''));
  /* window.storage 沒有交易，所以清單的改寫用 Web Locks 一次放行一個 */
  const lock=fn=>(navigator.locks && navigator.locks.request) ? navigator.locks.request('trpg-prj-index',fn) : fn();
  return { name:'ws', get,
    batch:(ops,idxFn)=>lock(async()=>{
      for(const [k,v] of ops){ if(v===undefined) await del(k); else await W.set(k,v); }
      if(!idxFn) return;
      const a=parseIdx(await get(PRJ_IDX)), v=idxFn(a);
      await W.set(PRJ_IDX, JSON.stringify(a));
      return v;
    }) };
}
async function prjInit(){
  if(window.storage && window.storage.get && window.storage.set){
    try{ const kv=wsKV(); await kv.get(PRJ_IDX); prjKV=kv; return; }catch(e){}
  }
  try{
    if(window.indexedDB){ const kv=await idbKV(); await kv.get(PRJ_IDX); prjKV=kv; return; }
  }catch(e){}
  prjKV=null;
}
/* 檔案的位置（File System Access 的 handle）無法轉成字串，所以一律放在 IndexedDB */
let fhKV=null;
async function fhStore(){
  if(prjKV && prjKV.name==='idb') return prjKV;
  if(!fhKV && window.indexedDB){ try{ fhKV=await idbKV(); }catch(e){ fhKV=null; } }
  return fhKV;
}
async function prjAll(){ if(!prjKV) return []; try{ return parseIdx(await prjKV.get(PRJ_IDX)); }catch(e){ return []; } }
async function prjList(){ return (await prjAll()).filter(m=>!m.del); }      // 排除垃圾桶裡的
async function prjTrash(){ return (await prjAll()).filter(m=>m.del); }
function metaOf(a,id,make){ let m=a.find(x=>x.id===id); if(!m && make){ m={id:id}; a.push(m); } return m; }
/* 寫入作品本體，並在同一個交易中修正清單的摘要 */
async function prjWrite(id, json, title, extra){
  return prjKV.batch([[PRJ_DOC+id, json]], a=>{
    const m=metaOf(a,id,true);
    Object.assign(m, extra||{}, {title:String(title||T('prj.untitled')), upd:Date.now(), size:json.length});
    return Object.assign({}, m);
  });
}
async function prjMeta(id, patch){
  return prjKV.batch([], a=>{ const m=metaOf(a,id,false); if(m) Object.assign(m,patch); return m && Object.assign({},m); });
}
async function prjRead(id){ return prjKV.get(PRJ_DOC+id); }
/* 刪除時移到垃圾桶。本體與過去的版本都原樣保留 */
async function prjToTrash(id){ return prjMeta(id, {del:Date.now()}); }
async function prjRestore(id){ return prjKV.batch([], a=>{ const m=metaOf(a,id,false); if(m) delete m.del; }); }
/* 把在垃圾桶放滿 30 天的作品真正刪除 */
async function prjPurge(id){
  const m=(await prjAll()).find(x=>x.id===id);
  const ops=[[PRJ_DOC+id, undefined]].concat(((m&&m.gens)||[]).map(g=>[PRJ_GEN+id+':'+g.t, undefined]));
  await prjKV.batch(ops, a=>{ const i=a.findIndex(x=>x.id===id); if(i>=0) a.splice(i,1); });
  try{ const f=await fhStore(); if(f) await f.batch([[PRJ_FH+id, undefined]]); }catch(e){}
}
async function prjPurgeOld(){
  const lim=Date.now()-TRASH_DAYS*864e5;
  for(const m of await prjTrash()) if(m.del<lim){ try{ await prjPurge(m.id); }catch(e){} }
}
/* 找出從清單上掉出去的本體，放回清單（連 v3.2.0 因搶寫清單而掉出去的也一併救回） */
async function prjRepair(){
  if(!prjKV || !prjKV.keys) return 0;
  let n=0;
  const have=new Set((await prjAll()).map(m=>m.id));
  for(const k of await prjKV.keys()){
    if(typeof k!=='string' || !k.startsWith(PRJ_DOC)) continue;
    const id=k.slice(PRJ_DOC.length); if(have.has(id)) continue;
    const raw=await prjKV.get(k); let d=null; try{ d=JSON.parse(raw); }catch(e){}
    await prjKV.batch([], a=>{ if(!metaOf(a,id,false)) a.push({id:id, title:String((d&&d.title)||T('prj.untitled')), upd:Date.now(), size:String(raw||'').length}); });
    n++;
  }
  return n;
}
/* ---- 過去的版本 ----
   把存放處裡的本體原樣複製保留。與上次保留的版本內容相同時就不保留 */
async function genSnap(id, json){
  if(!prjKV || !id) return;
  if(json==null) json=await prjRead(id);
  if(!json) return;
  const m=(await prjAll()).find(x=>x.id===id); if(!m) return;
  const h=strHash(json);
  if(m.genHash===h) return;
  const t=Math.max(Date.now(), ((m.gens||[]).slice(-1)[0]||{t:0}).t+1);
  const gens=(m.gens||[]).concat([{t:t, z:json.length}]);
  const drop=gens.slice(0, Math.max(0, gens.length-GEN_MAX));
  await prjKV.batch([[PRJ_GEN+id+':'+t, json]].concat(drop.map(g=>[PRJ_GEN+id+':'+g.t, undefined])), a=>{
    const mm=metaOf(a,id,false);
    if(mm){ mm.gens=gens.slice(-GEN_MAX); mm.genHash=h; mm.genAt=t; }
  });
}
async function genRead(id,t){ return prjKV.get(PRJ_GEN+id+':'+t); }
function prjRemember(id){ try{ localStorage.setItem(PRJ_CUR, id); }catch(e){} }
function prjLast(){ try{ return localStorage.getItem(PRJ_CUR); }catch(e){ return null; } }

/* ---- 鎖住作品（Web Locks） ----
   開啟作品的分頁持有該作品的鎖。其他分頁無法開啟該作品。
   分頁關閉（即使當掉）時瀏覽器會解開鎖，所以不會一直打不開 */
const LOCKS = !!(navigator.locks && navigator.locks.request);
let lockRel=null;          // 釋放目前作品之鎖的函式
/* 傳入 wait 的話，最多等到該時間（毫秒）讓鎖空出來。
   剛重新載入時，前一頁的鎖可能還沒解開（實測），所以啟動時要等 */
function lockTake(id, wait){
  if(!LOCKS) return Promise.resolve(()=>{});
  return new Promise(res=>{
    let opt={ifAvailable:true}, timer=null;
    if(wait){ const ac=new AbortController(); timer=setTimeout(()=>ac.abort(), wait); opt={signal:ac.signal}; }
    navigator.locks.request('trpg-edit:'+id, opt, l=>{
      clearTimeout(timer);
      if(!l){ res(null); return; }
      return new Promise(r=>res(r));
    }).catch(e=>{ clearTimeout(timer); res(e && e.name==='AbortError' ? null : ()=>{}); });
  });
}
/* 被別的分頁鎖住的作品 ID */
async function lockBusy(){
  if(!LOCKS || !navigator.locks.query) return new Set();
  try{
    const q=await navigator.locks.query();
    return new Set((q.held||[]).map(l=>l.name).filter(n=>n.startsWith('trpg-edit:'))
      .map(n=>n.slice(10)).filter(id=>id!==prjId));
  }catch(e){ return new Set(); }
}
/* 沒有 Web Locks 的瀏覽器無法阻止，所以同一作品在兩個分頁開啟時只做提醒 */
let prjBC=null;
try{
  prjBC=new BroadcastChannel('trpg-typeset');
  prjBC.onmessage=e=>{
    const m=e.data||{}; if(LOCKS || !prjId || m.id!==prjId) return;
    if(m.t==='open') prjBC.postMessage({t:'busy', id:prjId});
    if(m.t==='busy' || m.t==='saved')
      setStatus(T('status.openElsewhere'),'#ff9b83');
  };
}catch(e){ prjBC=null; }
function prjPost(t){ try{ if(prjBC && prjId) prjBC.postMessage({t:t, id:prjId}); }catch(e){} }

/* ---- 通知儲存失敗、檔案儲存已停止的橫條 ---- */
function barPaint(){
  const bar=document.getElementById('saveBar'); if(!bar) return;
  let msg='', btn='';
  if(saveErr){ msg=T('bar.saveFailed'); btn=T('bar.retry'); }
  else if(fileState==='paused'){ msg=T('bar.filePaused'); btn=T('bar.resume'); }
  document.getElementById('saveBarMsg').textContent=msg;
  document.getElementById('saveBarBtn').textContent=btn;
  bar.style.display = msg ? 'flex' : 'none';
}
function saveFail(on){ if(saveErr!==on){ saveErr=on; barPaint(); } }

/* 把目前的 S 寫進存放處。寫入目標固定為呼叫當下的作品 */
function prjFlush(){
  savePending=false; pendSince=0;
  const id=prjId, json=JSON.stringify(S), title=S.title, st=Date.now();
  inflight=json;
  prjQ = prjQ.then(async()=>{
    if(!prjKV){ await legacyWrite(json); if(inflight===json) inflight=null; return; }
    if(!id){ if(inflight===json) inflight=null; return; }  // 作品還沒決定。什麼都不寫
    let m;
    try{ m=await prjWrite(id, json, title, {st:st}); }
    catch(e){
      /* 沒寫成功的內容留在 inflight。用於關閉時的備份，以及關閉前的確認 */
      if(id===prjId){ saveFail(true); setStatus(T('status.autoSaveFailed'),'#ff9b83'); }
      return;
    }
    if(inflight===json) inflight=null;
    if(id===prjId) saveFail(false);
    if(!savePending && inflight==null) jnlClear(id);
    prjPost('saved');
    if(m && Date.now()-(m.genAt||0) >= GEN_EVERY){ try{ await genSnap(id, json); }catch(e){} }
    fileSchedule(id);
    if(id===prjId)
      setStatus(unsaved ? T('status.autoSavedUnsaved') : T('status.autoSaved'), unsaved?'#e8c66a':'var(--ok)');
  });
  return prjQ;
}
function save(){
  unsaved=true;
  savePending=true;
  const now=Date.now();
  if(!pendSince) pendSince=now;
  clearTimeout(saveTimer);
  /* 打完 0.7 秒後寫入。一直打字使等待不斷延長時，也會在變更開始後 3 秒寫入 */
  saveTimer=setTimeout(()=>{ histCommit(); prjFlush(); }, Math.max(0, Math.min(SAVE_WAIT, pendSince+SAVE_MAXWAIT-now)));
}
/* 不等待，把打到一半的部分寫完（切換作品前使用） */
function saveNow(){
  clearTimeout(saveTimer);
  if(savePending){ histCommit(); return prjFlush(); }
  return prjQ;
}
/* 沒有作品存放處時，照以前那樣只存一個作品 */
async function legacyWrite(json){
  if(json.length > 4*1024*1024){
    /* 字型或圖片使內容過大時，自動儲存會放不下 */
    setStatus(T('status.tooBigSkip'),'#ff9b83');
    return;
  }
  let ok=false;
  try{
    if(window.storage && window.storage.set){ await window.storage.set(KEY, json); ok=true; }
  }catch(e){}
  if(!ok){
    try{ localStorage.setItem(KEY, json); ok=true; }
    catch(e2){
      /* 放入圖片時可能超出容量。這種情況下提醒使用者存成檔案 */
      setStatus(T('status.quotaExceeded'),'#ff9b83');
      return;
    }
  }
  setStatus(unsaved ? T('status.autoSavedUnsaved') : T('status.autoSaved'), unsaved?'#e8c66a':'var(--ok)');
}

/* ---- 關閉瞬間的備份（journal） ----
   重新載入或移到別的頁面時，在那一瞬間才開始的 IndexedDB 寫入不會完成（實測）。
   localStorage 會當場寫完，所以把還沒寫完的部分備份在那裡，下次開啟時還原 */
function jnlPending(){ return savePending ? JSON.stringify(S) : inflight; }
function jnlWrite(){
  const json=jnlPending();
  if(json==null) return true;
  if(!prjKV){                                   // 只存一個作品的舊方式。直接寫到原本的位置
    if(json.length > 4*1024*1024) return false;
    try{ localStorage.setItem(KEY, json); return true; }catch(e){ return false; }
  }
  if(!prjId) return true;
  if(json.length > JNL_MAX) return false;
  try{
    localStorage.setItem(JNL_KEY+prjId, json);
    localStorage.setItem(JNL_META+prjId, JSON.stringify({id:prjId, t:Date.now()}));
    return true;
  }catch(e){
    try{ localStorage.removeItem(JNL_KEY+prjId); localStorage.removeItem(JNL_META+prjId); }catch(_){}
    return false;
  }
}
function jnlClear(id){ try{ localStorage.removeItem(JNL_KEY+id); localStorage.removeItem(JNL_META+id); }catch(e){} }
/* 備份比存放處裡的內容新的話，就放回存放處。放回之前的狀態保留在過去的版本裡。
   只在持有該作品的鎖時呼叫（開啟作品時與啟動時） */
async function jnlApply(id){
  let meta=null, json=null;
  try{ meta=JSON.parse(localStorage.getItem(JNL_META+id)||'null'); json=localStorage.getItem(JNL_KEY+id); }catch(e){}
  if(!meta || json==null){ if(meta || json!=null) jnlClear(id); return null; }
  const m=(await prjAll()).find(x=>x.id===id);
  const cur=await prjRead(id);
  let d=null; try{ d=JSON.parse(json); }catch(e){}
  let done=null;
  /* 存放處裡的內容，是否是在做備份的時刻之前複製的（st 是複製該內容的時刻） */
  if(d && cur!==json && !(m && (m.st||m.upd||0) >= meta.t)){
    if(cur && m) await genSnap(id, cur);
    await prjWrite(id, json, d.title, {st:meta.t});
    done=d.title||T('prj.untitled');
  }
  jnlClear(id);            // 放回存放處之後才刪除
  return done;
}
async function jnlRecover(){
  let ids=[];
  try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.startsWith(JNL_META)) ids.push(k.slice(JNL_META.length)); } }catch(e){ return []; }
  const done=[];
  for(const id of ids){
    const rel=await lockTake(id, 3000);
    if(!rel) continue;       // 還在別的分頁開著。那個作品由那邊的分頁繼續寫
    try{ const t=await jnlApply(id); if(t) done.push(t); }catch(e){}
    finally{ rel(); }
  }
  return done;
}
addEventListener('pagehide', ()=>{ jnlWrite(); });
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='hidden'){ jnlWrite(); saveNow(); }
});

/* ---- 也寫到磁碟上的檔案（Chrome / Edge 的 File System Access） ---- */
const FSA = typeof window.showSaveFilePicker==='function';
let fileH=null, fileId=null, fileState=null, fileTimer=null, fileQ=Promise.resolve();
/* 開啟作品時，讀出與該作品綁定的檔案。寫入權限失效的話用橫條通知 */
async function fileLoad(id){
  if(fileTimer){ clearTimeout(fileTimer); fileTimer=null; }
  fileH=null; fileId=id; fileState=null;
  if(FSA && id){
    try{ const f=await fhStore(); fileH = f ? ((await f.get(PRJ_FH+id))||null) : null; }catch(e){ fileH=null; }
    if(fileH){
      let p='granted';
      try{ p=await fileH.queryPermission({mode:'readwrite'}); }catch(e){}
      if(p!=='granted') fileState='paused';
    }
  }
  barPaint();
}
function fileSchedule(id){
  if(!fileH || id!==fileId || id!==prjId || fileState==='paused' || fileTimer) return;
  fileTimer=setTimeout(()=>{ fileTimer=null; fileWrite(); }, FILE_EVERY);
}
/* 把目前的狀態寫進檔案，再讀回來確認是否相同 */
function fileWrite(){
  const id=fileId, h=fileH;
  if(!h || id!==prjId) return fileQ;
  const text=JSON.stringify(S,null,1);
  fileQ = fileQ.then(async()=>{
    try{
      const w=await h.createWritable(); await w.write(text); await w.close();
      const back=await (await h.getFile()).text();
      if(back!==text) throw new Error('mismatch');
      if(id===prjId){ fileState=null; if(!savePending) unsaved=false; barPaint(); }
      try{ await prjMeta(id, {fileAt:Date.now(), fileName:h.name}); }catch(e){}
    }catch(e){
      if(id===prjId){ fileState='paused'; barPaint(); }
    }
  });
  return fileQ;
}
async function fileResume(){
  if(!fileH) return;
  let p='denied';
  try{ p=await fileH.requestPermission({mode:'readwrite'}); }catch(e){}
  if(p!=='granted'){ fileState='paused'; barPaint(); return; }
  fileState=null; barPaint();
  await fileWrite();
  if(fileState!=='paused') setStatus(T('status.savedToFile'),'var(--ok)');
}
/* 讓使用者在編輯途中隨時都能匯出成檔案。
   在 Chrome / Edge 會先請使用者選擇存放位置，之後每次自動儲存也會寫進那個檔案 */
async function saveToFile(){
  const name = (S.title||'scenario').replace(/[\\/:*?"<>|]/g,'_');
  if(FSA && prjKV && prjId){
    await saveNow();
    if(!fileH){
      let h=null;
      try{
        h=await window.showSaveFilePicker({suggestedName:name+'.json',
          types:[{description:T('file.jsonDesc'), accept:{'application/json':['.json']}}]});
      }catch(e){ if(e && e.name==='AbortError') return; h=null; }
      if(h){
        fileH=h; fileId=prjId; fileState=null;
        try{ const f=await fhStore(); if(f) await f.batch([[PRJ_FH+prjId, h]]); }catch(e){}
      }
    } else if(fileState==='paused'){
      await fileResume(); return;
    }
    if(fileH){
      await fileWrite();
      if(fileState!=='paused') setStatus(T('status.savedToFile'),'var(--ok)');
      return;
    }
  }
  dl(new Blob([JSON.stringify(S,null,1)],{type:'application/json'}), name+'.json');
  unsaved=false;
  if(prjKV && prjId) prjMeta(prjId, {fileAt:Date.now()}).catch(()=>{});
  setStatus(T('status.savedToFile'),'var(--ok)');
}
addEventListener('beforeunload', e=>{
  /* 還沒寫完的部分放不進備份、寫入失敗，
     或有尚未存成檔案的變更時，關閉前先確認 */
  const pend=jnlPending();
  if(unsaved || saveErr || (pend!=null && pend.length > (prjKV ? JNL_MAX : 4*1024*1024))){
    e.preventDefault(); e.returnValue='';
  }
});
addEventListener('keydown', e=>{
  if((e.ctrlKey||e.metaKey) && (e.key==='s'||e.key==='S')){ e.preventDefault(); if(!prjDlgOn()) saveToFile(); }
});
/* 把以前只存一個作品的自動儲存（KEY），從各個存放處原封不動地撿回來 */
async function legacyRaws(){
  const out=[];
  try{
    if(window.storage && window.storage.get){
      const r = await window.storage.get(KEY);
      if(r && r.value) out.push({src:'ws', raw:r.value});
    }
  }catch(e){}
  try{ const v = localStorage.getItem(KEY); if(v && !out.some(o=>o.raw===v)) out.push({src:'ls', raw:v}); }catch(e){}
  return out;
}
async function load(){
  for(const o of await legacyRaws()){ try{ return JSON.parse(o.raw); }catch(e){} }
  return null;
}
async function legacyDelete(src){
  if(src==='ls'){ localStorage.removeItem(KEY); return; }
  if(window.storage.delete) await window.storage.delete(KEY); else await window.storage.set(KEY,'');
}
/* 用內容的指紋判斷是否已經接收過。
   避免使用者拒絕刪除時，下次啟動又多做一份同樣的原稿 */
function strHash(s){
  let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193); }
  return (h>>>0).toString(36)+'-'+s.length;
}
/* 把以前的自動儲存接收為作品。
   把寫入的內容讀回來、確認一字不差之後，才詢問是否刪除舊的 */
async function prjMigrate(){
  if(!prjKV) return;
  for(const o of await legacyRaws()){
    let d; try{ d=JSON.parse(o.raw); }catch(e){ continue; }
    if(!d || (!d.pages && !d.blocks)) continue;
    const hash=strHash(o.raw);
    let m=(await prjList()).find(x=>x.legacy===hash), same=false;
    try{
      if(!m){
        m=await prjWrite(uid(), o.raw, d.title||T('prj.untitled'), {legacy:hash});
        same = (await prjRead(m.id))===o.raw;
      } else same = true;       // 之前已接收並確認過（當時拒絕了刪除）
    }catch(e){ same=false; }
    if(!same){
      setStatus(T('status.migrateFailed'),'#ff9b83');
      continue;
    }
    if(confirm(T('confirm.migrated', m.title))){
      try{ await legacyDelete(o.src); }catch(e){}
    }
  }
}
function blank(){
  return {
    title:T('prj.untitled'), padV:18, padH:16, base:10, defCols:1,
    foot:{num:true, text:'', from:1},
    fonts:[], fontBody:'', fontHead:'', bxTpl:[],
    pages:[ {id:uid(), bg:{preset:'bg-paper',img:null,fit:'cover',opa:35}, cols:1} ],
    blocks:[
      newBlock('title',T('prj.untitled')),
      newBlock('subtitle',T('sample.subtitle')),
      newBlock('h1',T('sample.intro')),
      newBlock('desc',T('sample.desc')),
      newBlock('dialog',T('sample.dialog')),
      (function(){ const b=newBlock('proc',T('sample.proc'));
        applyBxTpl(b,'skill'); return b; })()
    ]
  };
}
/* 把舊格式（區塊放在頁面裡的形式）轉成連續的內文＋頁面設定 */
/* 讀取存檔資料時，對單一區塊做的整理。
   舊格式（區塊在頁面裡的形式）與新格式兩邊都會呼叫。
   以前只寫在其中一邊，導致舊格式的條列沒有被轉換而殘留下來。 */
function fixBlock(nb){
  nb.ind = Math.max(0, Math.min(4, parseInt(nb.ind,10)||0));
  if(Array.isArray(nb.mk)) nb.mk = tidyMarks(nb.mk); else if(nb.mk!=null) delete nb.mk;
  if(nb.type==='flow') nb.cols=1;
  /* 舊資料：條列已不再是一種書式，所以改成描述文，並在行首加上記號 */
  if(nb.type==='list'){
    const mk = ['disc','num','box'].includes(nb.mark) ? nb.mark : 'disc';
    let n=0;
    nb.text = String(nb.text||'').split('\n').map(ln=>{
      const m = ln.match(/^([ 　\t]*)(.*)$/);
      if(!m[2].trim()) return ln;
      const lv = Math.min(3, Math.floor(m[1].replace(/　/g,'  ').replace(/\t/g,'  ').length/2));
      if(lv===0) n++;
      const mark = mk==='box' ? '- [ ] ' : (mk==='num' && lv===0) ? (n+'. ') : '- ';
      return m[1] + mark + m[2];
    }).join('\n');
    nb.type='desc'; delete nb.mark;
  }
  if(nb.type==='image'){
    nb.dy = Math.round(+nb.dy||0); nb.dx = Math.round(+nb.dx||0);
    if(!nb.pos) nb.pos = (nb.fl==='l'?'left':nb.fl==='r'?'right':'inline');
    nb.fl = (nb.pos==='left'?'l':nb.pos==='right'?'r':'');
    nb.cols = (nb.pos==='left'||nb.pos==='right') ? 2 : 1;
    nb.fx = +nb.fx||0; nb.fy = +nb.fy||0; nb.pg = Math.max(1, +nb.pg||1);
    if(!nb.w) nb.w=70;
    nb.ar = (+nb.ar>0) ? +nb.ar : 0;                     // 長寬比（高÷寬）。用於閃避框的高度
    nb.wrap = (nb.wrap==='none') ? 'none' : 'square';    // 自由配置時，文字要不要避開
  }
  return nb;
}
/* ================= 改成 markdown 寫法 =================
   把行首記號統一成與 markdown 相同的寫法。
     ・ → -        （條列）
     □ → - [ ]     （選項）
     ＞ → >        （規則框的巢狀）
   舊的記號也照樣讀得懂，但原稿這邊也先改寫一次。
   不這樣做的話，用按鈕加上／拿掉時，新舊記號會混在一起。
   註解與注音的位置是以「第幾個字起」保存，
   所以改寫一定要經過 setBlockText，吸收位置的錯位。 */
const MD_VER = 1;
function mdLine(ln){
  let m;
  if((m = ln.match(/^([ 　\t]*)[□☐][ 　\t]*/))) return m[1] + '- [ ] ' + ln.slice(m[0].length);
  if((m = ln.match(/^([ 　\t]*)[・･][ 　\t]*/))) return m[1] + '- '     + ln.slice(m[0].length);
  if((m = ln.match(/^([ 　\t]*)＞[ 　\t]*/)))    return m[1] + '> '     + ln.slice(m[0].length);
  return ln;
}
function mdText(t){
  const src = String(t==null?'':t);
  if(!/^[ 　\t]*[□☐・･＞]/m.test(src)) return src;      // 沒有需要修正的地方就維持原樣
  return src.split('\n').map(mdLine).join('\n');
}
function mdMigrate(list){
  list.forEach(b=>{
    const nw = mdText(b.text);
    if(nw !== String(b.text||'')) setBlockText(b, nw);
    if(b.type==='popup' && b.pop && !popIsBlocks(b.pop)) b.pop.body = mdText(b.pop.body);
    subLists(b).forEach(mdMigrate);
  });
}
function normalize(d){
  if(!d) return blank();
  const out = {
    mdv: MD_VER,
    title: d.title||T('prj.untitled'),
    padV:+d.padV||18, padH:+d.padH||16, base:+d.base||10,
    defCols: (d.defCols===2?2:1),
    foot: Object.assign({num:true, text:'', from:1}, d.foot||{}),
    fonts: Array.isArray(d.fonts)?d.fonts.filter(f=>f&&f.name&&f.data):[],
    bxTpl: (Array.isArray(d.bxTpl)?d.bxTpl:[]).map(bxTplClean).filter(Boolean),
    fontBody: d.fontBody||'', fontHead: d.fontHead||'',
    pages: [], blocks: []
  };
  const oldStyle = Array.isArray(d.pages) && d.pages.length && Array.isArray(d.pages[0].blocks);
  if(oldStyle){
    d.pages.forEach((p,pi)=>{
      out.pages.push({id:p.id||uid(), bg:Object.assign({preset:'none',img:null,fit:'cover',opa:35}, p.bg||{}), cols:(p.cols===2?2:1)});
      if(p.toc) out.blocks.push(newBlock('toc',''));
      (p.blocks||[]).forEach(b=>{
        const nb = Object.assign(newBlock(), b, {id:b.id||uid()});
        /* 舊資料的 cols 原本是區塊內分兩欄的意思，這裡改成配置方式的意思 */
        nb.cols = (nb.type==='npc'||nb.type==='title'||nb.type==='subtitle'||nb.type==='h1') ? 1 : 2;
        fixBlock(nb);
        out.blocks.push(nb);
      });
      if(pi < d.pages.length-1) out.blocks.push(newBlock('break',''));
    });
  } else {
    (Array.isArray(d.pages)?d.pages:[]).forEach(p=>out.pages.push({
      id:p.id||uid(), bg:Object.assign({preset:'none',img:null,fit:'cover',opa:35}, p.bg||{}), cols:(p.cols===2?2:1)}));
    (Array.isArray(d.blocks)?d.blocks:[]).forEach(b=>{
      const nb = Object.assign(newBlock(), b, {id:b.id||uid()});
      nb.cols = (nb.cols===1?1:2);
      fixBlock(nb);
      out.blocks.push(nb);
    });
  }
  if(!out.pages.length) out.pages.push(newPage(out.defCols));
  if(!out.blocks.length) out.blocks = blank().blocks;
  /* 舊資料：技能判定・特殊規則已合併成單一的「規則框」。
     外觀與標題語用各自的樣板照原樣複製。 */
  /* 彈出視窗裡的區塊，也經過與紙面區塊相同的整理 */
  const fixList = list => list.forEach(b=>{
    if(b.type==='skill' || b.type==='rule'){
      const key = b.type;
      const lb  = (b.lb!=null ? String(b.lb) : (key==='skill'?T('label.skill'):T('label.rule')));
      b.type='proc'; b.lb=null; applyBxTpl(b, key); b.lb=lb;
    }
    if(b.type==='npc'){ b.cols=1; ensureNpc(b); }
    if(b.type==='proc'){ ensureProc(b); }
    if(b.type==='table'){ ensureTable(b); }
    if(b.type==='toc'){ b.cols=1; ensureToc(b); }
    if(b.type==='flow'){ b.cols=1; ensureFlow(b); }
    if(b.type==='popup'){
      const q = ensurePopup(b);
      if(popIsBlocks(q)){
        q.blocks = q.blocks.filter(x=>x && typeof x==='object')
          .map(x=>fixBlock(Object.assign(newBlock(), x, {id:x.id||uid(), cols:(x.cols===1?1:2)})));
        fixList(q.blocks);
      }
    }
  });
  fixList(out.blocks);
  /* 記號的替換只做一次。完成的標記留在文件裡 */
  out.mdv = +d.mdv || 0;
  if(out.mdv < MD_VER){ mdMigrate(out.blocks); out.mdv = MD_VER; }
  return out;
}
/* 區塊存放在紙面（S.blocks），以及以區塊保存內容的彈出視窗裡。
   為了允許巢狀，逐層走訪收集所有的串列 */
/* 該區塊所擁有的其他區塊串列（彈出視窗的內容、表格儲存格的內容） */
function subLists(b){
  const out=[];
  if(b.type==='popup' && popIsBlocks(b.pop)) out.push(b.pop.blocks);
  if(b.type==='table' && b.tbl && b.tbl.cb) Object.keys(b.tbl.cb).forEach(k=>{
    if(Array.isArray(b.tbl.cb[k]) && b.tbl.cb[k].length) out.push(b.tbl.cb[k]);
  });
  return out;
}
function blockLists(){
  const out=[S.blocks];
  const walk=list=>list.forEach(b=>subLists(b).forEach(l=>{ out.push(l); walk(l); }));
  walk(S.blocks);
  return out;
}
/* 儲存格的區塊串列。還沒有的話就建立（make=true 時） */
function cellList(b, ri, ci, make){
  if(!b || b.type!=='table') return null;
  const t = ensureTable(b), k = ri+','+ci;
  if(!Array.isArray(t.cb[k])){ if(!make) return null; t.cb[k]=[]; }
  return t.cb[k];
}
/* 也回傳找到的串列。排序或插入都對這個 list 進行 */
function findBlock(id){
  const ls = blockLists();
  for(const list of ls){
    const i = list.findIndex(b=>b.id===id);
    if(i>=0) return {i:i, b:list[i], list:list};
  }
  return null;
}
/* 該彈出視窗擁有的串列（沒有則為 null） */
function popListOf(b){ return (b && b.type==='popup' && popIsBlocks(b.pop)) ? b.pop.blocks : null; }
/* 擁有該串列的表格儲存格（不是表格儲存格則為 null）。
   刪光儲存格裡的段落之後，用來回到那個儲存格 */
function cellOwnerOf(list){
  let found = null;
  allBlocks().forEach(b=>{
    if(b.type!=='table' || !b.tbl || !b.tbl.cb) return;
    Object.keys(b.tbl.cb).forEach(k=>{ if(b.tbl.cb[k]===list) found = {id:b.id, k:k}; });
  });
  return found;
}
/* 把游標放到儲存格的文字上。有 root 的話就在其中（紙面・彈出視窗），
   沒有的話就到「文字」欄的儲存格欄位 */
function focusCellText(own, root){
  if(!own) return false;
  const el = (root && root.isConnected)
    ? root.querySelector('[data-id="'+own.id+'"] [data-cellkey="'+own.k+'"] [data-btext]')
    : srcQ('.srctext[data-id="'+own.id+'"][data-tsrc="'+own.k+'"]');
  if(!el) return false;
  el.focus();
  const r=document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const s=getSelection(); s.removeAllRanges(); s.addRange(r);
  el.scrollIntoView({block:'nearest'});
  return true;
}
/* 擁有該串列的彈出視窗區塊（紙面的串列則為 null） */
function popOwnerOf(list){
  let found=null;
  const walk=l=>l.forEach(b=>{
    const pl=popListOf(b);
    if(pl===list){ found=b; return; }
    subLists(b).forEach(sub=>{ if(sub!==list) walk(sub); });
  });
  walk(S.blocks);
  return found;
}
/* 動到彈出視窗裡的段落時，就把那個彈出視窗叫出來。
   沒有視窗的話，會搞不清楚自己在改哪裡 */
function openOwnerPopup(id){
  const f = id ? findBlock(id) : null; if(!f || f.list===S.blocks) return;
  const owner = popOwnerOf(f.list); if(!owner) return;
  if(popId===owner.id){
    const w=document.getElementById('popDlg');
    if(w && w.style.display!=='flex'){ w.style.display='flex'; placeFloatWin(w); }
    return;
  }
  openPopup(owner.id);
}
/* 目前選取的段落所在的串列。若在彈出視窗裡，就回傳該彈出視窗的串列。
   排序・複製・刪除等都在這個串列中進行 */
function selList(){
  const id = sel.size ? [...sel][0] : null;
  const f = id ? findBlock(id) : null;
  return f ? f.list : S.blocks;
}
/* 是否為該彈出視窗（或其中的彈出視窗）所擁有的串列。
   用來防止把自己拖進自己裡面 */
function ownsList(b, list){
  return subLists(b).some(sub => sub===list || sub.some(x=>ownsList(x, list)));
}
/* 避免紙面變成空的 */
function keepNotEmpty(){
  if(!S.blocks.length) S.blocks.push(newBlock('desc',''));
  /* 清掉已經空了的儲存格容器 */
  allBlocks().forEach(b=>{
    if(b.type==='table' && b.tbl && b.tbl.cb)
      Object.keys(b.tbl.cb).forEach(k=>{ if(!Array.isArray(b.tbl.cb[k]) || !b.tbl.cb[k].length) delete b.tbl.cb[k]; });
  });
}
/* 紙面下方的文字。頁碼，以及想一直顯示的字（劇本名稱等） */
function footHTML(i){
  const f = (S.foot||{num:true,text:'',from:1});
  const t = String(f.text||'').replace(/\{title\}/g, S.title||'')
                              .replace(/\{page\}/g, String(i + (+f.from||1)))
                              .replace(/\{total\}/g, String(pageMap.length||1));
  const num = f.num!==false ? String(i + (+f.from||1)) : '';
  if(!t && !num) return '';
  return '<div class="pgnum">'
    + (t?'<span class="ft">'+esc(t)+'</span>':'')
    + (num?'<span class="pn">'+esc(num)+'</span>':'')
    + '</div>';
}
function pageSetting(i){
  while(S.pages.length <= i){
    const last = S.pages[S.pages.length-1];
    S.pages.push({id:uid(), bg:JSON.parse(JSON.stringify(last.bg)), cols:last.cols});
  }
  return S.pages[i];
}

/* ================= NPC 卡的詳細視窗 =================
   展開折疊區塊後，有時會放不進頁面。
   這時不打亂紙面，而是改在這個專用視窗中編輯。 */
let npcModalId = null;
function renderNpcModal(){
  const box = document.getElementById('npcDlgBody');
  if(!npcModalId){ box.innerHTML=''; return; }
  const f = findBlock(npcModalId);
  if(!f || f.b.type!=='npc'){ closeNpcModal(); return; }
  box.innerHTML = '<div class="page" style="width:auto;height:auto;box-shadow:none">'
    + '<div class="page-body" style="height:auto;padding:'+S.padH+'mm;font-size:'+S.base+'pt">'
    + '<div class="blk t-npc" data-id="'+f.b.id+'">'+npcInnerHTML(f.b,true,'modal')+'</div>'
    + '</div></div>';
}
function openNpcModal(id, note){
  npcModalId = id;
  document.getElementById('npcDlgNote').textContent = note || '';
  renderNpcModal();
  document.getElementById('npcDlg').style.display='flex';
}
function closeNpcModal(){
  npcModalId=null; npcModalOpen.clear();
  document.getElementById('npcDlg').style.display='none';
  document.getElementById('npcDlgBody').innerHTML='';
}
/* ---- 表格的寬視窗 ----
   左側面板的儲存格太窄，不好寫長文，
   所以準備一個把同樣內容排成大文字欄的視窗。
   列與欄的增減，也可以直接在該列／欄的位置進行。 */
let tblModalId = null;
function tblModalBlk(){
  if(!tblModalId) return null;
  const f = findBlock(tblModalId);
  return (f && f.b.type==='table') ? f.b : null;
}
function tbigGrow(ta){ ta.style.height='auto'; ta.style.height=Math.max(64, ta.scrollHeight+2)+'px'; }
function renderTblModal(){
  const box = document.getElementById('tblDlgBody');
  const b = tblModalBlk();
  if(!b){ box.innerHTML=''; return; }
  const t = ensureTable(b);
  const nc = tblCols(t), nr = tblRows(t);
  const colName = ci => t.look==='list' ? (ci===0?T('tbl.colRoll'):ci===1?T('tbl.colHead'):T('tbl.colContent')+(nc>3?(ci-1):''))
                 : t.look==='card' ? (ci===0?T('tbl.colTitle'):T('tbl.colContent')+(nc>2?ci:''))
                 : (t.head ? (String(cellRead(t,0,ci)||'').trim() || T('tbl.colN', ci+1)) : T('tbl.colN', ci+1));
  let h = '<div class="tbig-name"><span class="hint" style="margin:0;flex:0 0 auto">'+T('tbl.name')+'</span>'
    + '<input type="text" data-tbname value="'+esc(t.name)+'" placeholder="'+T('tbl.namePh')+'"></div>'
    + '<div class="tbig-wrap"><div class="tbig" style="grid-template-columns:34px repeat('+nc+',minmax(200px,1fr))">'
    + '<div></div>';
  for(let ci=0; ci<nc; ci++){
    h += '<div class="cn"><span>'+esc(String(colName(ci)))+'</span>'
       + (nc>1 ? '<button type="button" class="x danger" data-tbdelcol="'+ci+'" title="'+T('tbl.delCol')+'">×</button>' : '')
       + '</div>';
  }
  for(let ri=0; ri<nr; ri++){
    h += '<div class="rn"><span>'+(ri+1)+'</span>'
       + (nr>1 ? '<button type="button" class="x danger" data-tbdelrow="'+ri+'" title="'+T('tbl.delRow')+'">×</button>' : '')
       + '</div>';
    for(let ci=0; ci<nc; ci++){
      const hd = (t.look==='grid' && ((t.head&&ri===0)||(t.rowhead&&ci===0)))
              || (t.look!=='grid' && ci===0);
      h += '<textarea data-tbcell="'+ri+','+ci+'"'+(hd?' class="hd"':'')
         + ' placeholder="'+((t.head&&ri===0&&t.look==='grid')?T('tbl.colHead'):'　')+'">'+esc(cellHead(t,ri,ci))+'</textarea>';
    }
  }
  h += '</div></div>'
    + '<div class="tbig-add"><button type="button" data-tbadd="row">'+T('tbl.addRow')+'</button>'
    + '<button type="button" data-tbadd="col">'+T('tbl.addCol')+'</button></div>';
  box.innerHTML = h;
  box.querySelectorAll('[data-tbcell]').forEach(tbigGrow);
}
function openTblModal(id){
  tblModalId = id;
  renderTblModal();
  tbigRichBar();
  document.getElementById('tblDlg').style.display='flex';
  /* 高度的自動調整，要等視窗顯示出來之後才量得到內容高度 */
  document.querySelectorAll('#tblDlgBody [data-tbcell]').forEach(tbigGrow);
  const first = document.querySelector('#tblDlgBody [data-tbcell]');
  if(first) first.focus();
}
/* 寬視窗的書式按鈕。與彈出視窗相同的操作感，在目前操作的儲存格插入記號。
   儲存格在表格裡，所以不放標題（#），只排出與內文相同的記號 */
let tbigLastCell = null;
function tbigRichBar(){
  const bar = document.getElementById('tblRich');
  const pops = allBlocks().filter(x=>x.type==='popup');
  bar.innerHTML = RICH_MARKS.map(([mk,lb,ti])=>
      '<button type="button" data-tbrich="'+esc(mk)+'" title="'+esc(richTitle(mk,ti))+'">'+richLabelHTML(mk,lb)+'</button>').join('')
    + '<span class="lb">'+T('tbl.putInCell')+'</span>'
    + '<select data-tbblk><option value="">'+T('tbl.pickBlock')+'</option>'
    + POP_ADD.map(k=>{ const t=TYPES.find(x=>x.k===k); return t?'<option value="'+k+'">'+esc(t.n)+'</option>':''; }).join('')
    + '</select>'
    + '<span class="lb">'+T('tbl.popup')+'</span>'
    + '<button type="button" data-tbnewpop title="'+T('tbl.newPopTitle')+'">'
    + T('tbl.newPop')+'</button>'
    + (pops.length
        ? '<span class="lb">'+T('tbl.pointExisting')+'</span><select data-tbpop>'
          + '<option value="">'+T('tbl.pleasePick')+'</option>'
          + pops.map(x=>{ const n=String((x.pop||{}).label||T('pop.defaultLabel')).trim()||T('pop.defaultLabel');
              return '<option value="'+esc(n)+'">'+esc(n)+'</option>'; }).join('')
          + '</select>'
        : '');
}
function tbigCell(){
  return (tbigLastCell && tbigLastCell.isConnected) ? tbigLastCell
       : document.querySelector('#tblDlgBody [data-tbcell]');
}
function tbigInsert(mk){ richApplyTA(tbigCell(), mk); }
/* 在目前操作的儲存格裡放入真正的段落 */
function tbigAddBlock(k){
  const b = tblModalBlk(); if(!b) return;
  const ta = tbigCell(); if(!ta){ setStatus(T('status.clickCell'),'#ff9b83'); return; }
  const rc = ta.dataset.tbcell.split(',').map(Number);
  const L = cellList(b, rc[0], rc[1], true); if(!L) return;
  const nb = newBlock(k, '');
  if(k==='npc') ensureNpc(nb);
  if(k==='proc') ensureProc(nb);
  if(k==='table') ensureTable(nb);
  if(k==='popup') ensurePopup(nb);
  /* 目前選取的段落若在這個儲存格裡，就插在它的正下方。
     沒有選取時，才加到儲存格的最下面 */
  const cur = sel.size===1 ? L.findIndex(x=>x.id===[...sel][0]) : -1;
  if(cur>=0) L.splice(cur+1, 0, nb); else L.push(nb);
  sel.clear(); sel.add(nb.id);
  render(); save();
  if(k==='image'){ imgReplaceId = nb.id; document.getElementById('imgFile').click(); }
  else focusSrc(nb.id, true);
  setStatus(T('status.cellAdded', TYPE_NAME(k)),'var(--ok)');
}
/* 從儲存格建立新的彈出視窗。名稱取自選取的文字，
   建立的彈出視窗放在表格正下方。不顯示在紙面上，只從儲存格指向 */
function tbigNewPopup(){
  const b = tblModalBlk(); if(!b) return;
  const ta = tbigCell(); if(!ta){ setStatus(T('status.clickCell'),'#ff9b83'); return; }
  const picked = ta.value.slice(ta.selectionStart, ta.selectionEnd).replace(/[\r\n]+/g,' ').trim();
  let name = picked || T('pop.defaultLabel');
  if(popupByLabel(name)){
    let n=2; while(popupByLabel(name+n)) n++;
    name = name + n;
  }
  const nb = newBlock('popup','');
  /* 經過 newPopup()。讓「放一個空段落」的規則在這裡也一致 */
  nb.pop = Object.assign(newPopup(), { label:name, only:true });
  const i = S.blocks.findIndex(x=>x.id===b.id);
  S.blocks.splice(i<0?S.blocks.length:i+1, 0, nb);
  /* 已用選取的文字當名稱，所以把那裡換成「＠名稱」 */
  const v = ta.value, a = ta.selectionStart, z = ta.selectionEnd;
  const head = (a===0) || v.charAt(a-1)==='\n';
  const ins = (picked ? '' : (head?'':'\n')) + '＠' + name;
  ta.value = v.slice(0,a) + ins + v.slice(z);
  const t = ensureTable(b);
  const rc = ta.dataset.tbcell.split(',').map(Number);
  cellWrite(t, rc[0], rc[1], ta.value);
  save(); tbigRichBar();
  ta.focus(); ta.setSelectionRange(a+ins.length, a+ins.length);
  openPopup(nb.id);
  setStatus(T('status.popCreated', name),'var(--ok)');
}
(function(){
  const bar = document.getElementById('tblRich');
  bar.addEventListener('mousedown', e=>{ if(e.target.closest('[data-tbrich]')) e.preventDefault(); });
  bar.addEventListener('click', e=>{
    const btn = e.target.closest('[data-tbrich]');
    if(btn){ tbigInsert(btn.dataset.tbrich); return; }
    if(e.target.closest('[data-tbnewpop]')) tbigNewPopup();
  });
  bar.addEventListener('change', e=>{
    const sl = e.target.closest('[data-tbpop]');
    if(sl && sl.value){ tbigInsert('＠'+sl.value); sl.value=''; return; }
    const bk = e.target.closest('[data-tbblk]');
    if(bk && bk.value){ tbigAddBlock(bk.value); bk.value=''; }
  });
  document.getElementById('tblDlgBody').addEventListener('focusin', e=>{
    const ta = e.target.closest('[data-tbcell]'); if(!ta) return;
    tbigLastCell = ta;
    /* 面板書式按鈕的目標，也設成這個儲存格 */
    const rc = ta.dataset.tbcell.split(',').map(Number);
    if(tblModalId){
      lastCell = {id:tblModalId, r:rc[0], c:rc[1]};
      if(!(sel.size===1 && sel.has(tblModalId))){
        sel.clear(); sel.add(tblModalId); lastPick=tblModalId; paintSel();
      }
    }
  });
  /* 離開儲存格時，看看用 ＠名稱 指向的彈出視窗是否還不存在 */
  document.getElementById('tblDlgBody').addEventListener('focusout', e=>{
    if(!e.target.closest('[data-tbcell]') || !tblModalId) return;
    const id = tblModalId;
    setTimeout(()=>{ if(makeMissingPopups(id)) tbigRichBar(); }, 0);
  });
})();
function closeTblModal(){
  tblModalId=null;
  tbigLastCell=null;
  document.getElementById('tblDlg').style.display='none';
  document.getElementById('tblDlgBody').innerHTML='';
  render(); save();
}
document.getElementById('tblDlgClose').onclick=closeTblModal;
document.getElementById('tblDlg').addEventListener('click', e=>{ if(e.target.id==='tblDlg') closeTblModal(); });
(function(){
  const box = document.getElementById('tblDlgBody');
  box.addEventListener('input', e=>{
    const b = tblModalBlk(); if(!b) return;
    const t = ensureTable(b);
    const ta = e.target.closest('[data-tbcell]');
    if(ta){
      slashFireTA(ta, e);
      const [r,c] = ta.dataset.tbcell.split(',').map(Number);
      cellWrite(t, r, c, ta.value);
      tbigGrow(ta); repaginateSoon(); save(); return;
    }
    const nm = e.target.closest('[data-tbname]');
    if(nm){ t.name = nm.value; repaginateSoon(); save(); }
  });
  box.addEventListener('click', e=>{
    const b = tblModalBlk(); if(!b) return;
    const t = ensureTable(b);
    const add = e.target.closest('[data-tbadd]');
    if(add){
      if(add.dataset.tbadd==='row') tblAddRow(t); else tblAddCol(t);
      renderTblModal(); repaginateSoon(); save(); return;
    }
    const dr = e.target.closest('[data-tbdelrow]');
    if(dr){
      if(!tblDelRow(t, +dr.dataset.tbdelrow)) return;
      renderTblModal(); repaginateSoon(); save(); return;
    }
    const dc = e.target.closest('[data-tbdelcol]');
    if(dc){
      if(!tblDelCol(t, +dc.dataset.tbdelcol)) return;
      renderTblModal(); repaginateSoon(); save(); return;
    }
  });
  /* 在儲存格中 Enter 是換行，Tab 是移到下一格 */
  box.addEventListener('keydown', e=>{
    if(e.key!=='Escape') return;
    if(e.target.closest('[data-tbcell]')){ e.stopPropagation(); e.target.blur(); }
  }, true);
})();
addEventListener('keydown', e=>{ if(e.key==='Escape' && tblModalId) closeTblModal(); });

document.getElementById('npcDlgClose').onclick=closeNpcModal;
document.getElementById('npcDlg').addEventListener('click', e=>{ if(e.target.id==='npcDlg') closeNpcModal(); });
addEventListener('keydown', e=>{ if(e.key==='Escape' && npcModalId) closeNpcModal(); });
/* 該 NPC 卡是否放得進頁面。放不下的會在頁面那邊加上標記 */
function npcOverflows(id){
  const el = stage.querySelector('.blk[data-id="'+id+'"]');
  if(!el) return true;                        // 沒有載在任何一頁＝放不下
  const body = el.closest('.page-body'); if(!body) return true;
  const cs=getComputedStyle(body), cr=body.getBoundingClientRect();
  const sc = body.offsetWidth ? cr.width/body.offsetWidth : 1;
  const r = el.getBoundingClientRect();
  return r.right > cr.right - parseFloat(cs.paddingRight)*sc + 1
      || r.bottom > cr.bottom - parseFloat(cs.paddingBottom)*sc + 1;
}

/* ================= 字型 =================
   新增的字型以 data URI 保存，用 @font-face 載入。
   同樣的 CSS 也放進匯出的 HTML，所以在發布對象那邊也會以相同字形顯示。 */
const FONT_FALLBACK = '"Hiragino Mincho ProN","Yu Mincho",YuMincho,"Noto Serif JP","PMingLiU","Noto Serif TC",serif';
function fontCSS(){
  /* 字型名稱來自檔名或字型內部的名稱，
     為了不讓它跳脫匯出 HTML 的 <style>，只保留在 CSS 字串中安全的字元 */
  const safe = v => String(v==null?'':v).replace(/[^0-9A-Za-z \u3000-\u9fff\uff00-\uffef_\-]/g,'');
  const faces = (S.fonts||[]).map(f=>'@font-face{font-family:"'+safe(f.name)+'";src:url('+f.data+');font-display:swap}').join('\n');
  const body = S.fontBody ? '"'+safe(S.fontBody)+'",' : '';
  const head = S.fontHead ? '"'+safe(S.fontHead)+'",' : body;
  return faces
    + '\n.page,#flowCanvas{font-family:'+body+FONT_FALLBACK+'}'
    + '\n.t-title,.t-subtitle,.t-h1,.t-h2,.t-h3,.toc-h{font-family:'+head+FONT_FALLBACK+'}';
}
function applyFonts(){ document.getElementById('userfont').textContent = fontCSS(); }

/* ================= 讀取字型檔 =================
   Windows 的日文字型大多是 .ttc（多個字體裝在一個包裡的形式），
   直接使用的話無法選「哪一個字體」，檔案大小也會隨字體數量膨脹。
   把包打開，只取出需要的字體。 */
function ttcOffsets(buf){
  if(buf.byteLength<12) return null;
  const dv=new DataView(buf);
  if(String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3))!=='ttcf') return null;
  const n=dv.getUint32(8), out=[];
  if(!n || n>500) return null;
  for(let i=0;i<n;i++) out.push(dv.getUint32(12+i*4));
  return out;
}
/* 把包裡的一個字體，重組成單獨的字型檔 */
function sfntFromTTC(buf, faceOff){
  const dv=new DataView(buf), src=new Uint8Array(buf);
  const numTables=dv.getUint16(faceOff+4), recs=[];
  for(let i=0;i<numTables;i++){
    const p=faceOff+12+i*16;
    recs.push({tag:dv.getUint32(p), sum:dv.getUint32(p+4), off:dv.getUint32(p+8), len:dv.getUint32(p+12)});
  }
  const pad=v=>(v+3)&~3;
  let total=12+numTables*16;
  recs.forEach(r=>total+=pad(r.len));
  const out=new ArrayBuffer(total), ov=new DataView(out), o8=new Uint8Array(out);
  ov.setUint32(0, dv.getUint32(faceOff));
  ov.setUint16(4, numTables);
  let es=0; while((1<<(es+1))<=numTables) es++;
  ov.setUint16(6,(1<<es)*16); ov.setUint16(8,es); ov.setUint16(10,numTables*16-(1<<es)*16);
  let cur=12+numTables*16;
  recs.forEach((r,i)=>{
    const p=12+i*16;
    ov.setUint32(p,r.tag); ov.setUint32(p+4,r.sum); ov.setUint32(p+8,cur); ov.setUint32(p+12,r.len);
    o8.set(src.subarray(r.off, r.off+r.len), cur);
    cur+=pad(r.len);
  });
  return out;
}
function sfntTable(buf, base, want){
  const dv=new DataView(buf), n=dv.getUint16(base+4);
  for(let i=0;i<n;i++){
    const p=base+12+i*16;
    const t=String.fromCharCode(dv.getUint8(p),dv.getUint8(p+1),dv.getUint8(p+2),dv.getUint8(p+3));
    if(t===want) return {off:dv.getUint32(p+8), len:dv.getUint32(p+12)};
  }
  return null;
}
/* 字體的名稱。有日文名稱就用日文名稱 */
function sfntName(buf, base){
  const t=sfntTable(buf, base||0, 'name'); if(!t) return '';
  const dv=new DataView(buf);
  const count=dv.getUint16(t.off+2), strOff=t.off+dv.getUint16(t.off+4);
  let best='', score=-1;
  for(let i=0;i<count;i++){
    const p=t.off+6+i*12;
    const pid=dv.getUint16(p), lid=dv.getUint16(p+4), nid=dv.getUint16(p+6);
    const len=dv.getUint16(p+8), off=dv.getUint16(p+10);
    if(nid!==1 && nid!==4) continue;
    let sc=(nid===1?2:1); if(pid===3) sc+=4; if(pid===3&&lid===0x0411) sc+=8;
    if(sc<=score) continue;
    let str='';
    try{
      if(pid===3||pid===0){ for(let k=0;k<len;k+=2) str+=String.fromCharCode(dv.getUint16(strOff+off+k)); }
      else { for(let k=0;k<len;k++) str+=String.fromCharCode(dv.getUint8(strOff+off+k)); }
    }catch(_){ continue; }
    if(str.trim()){ best=str.trim(); score=sc; }
  }
  return best;
}
/* OS/2 的 fsType。表示是否允許嵌入發布物 */
function fsTypeOf(buf, base){
  const t=sfntTable(buf, base||0, 'OS/2'); if(!t) return null;
  try{ return new DataView(buf).getUint16(t.off+8); }catch(_){ return null; }
}
function fsTypeNote(v){
  if(v==null) return '';
  if(v & 0x0002) return T('font.fsNoEmbed');
  if(v & 0x0004) return T('font.fsPreview');
  if(v & 0x0200) return T('font.fsBitmap');
  return '';
}
function abToDataURL(ab, cb){
  const bl=new Blob([ab],{type:'font/otf'});
  const fr=new FileReader(); fr.onload=()=>cb(fr.result); fr.readAsDataURL(bl);
}
/* 匯入的主體。若是 .ttc 就請使用者選擇字體 */
function addFontBuffer(ab, fallbackName){
  const offs=ttcOffsets(ab);
  const finish=(buf, base)=>{
    const nm = sfntName(buf, base||0) || fallbackName;
    const warn = fsTypeNote(fsTypeOf(buf, base||0));
    abToDataURL(buf, url=>{
      const size=Math.round(url.length/1024/1024*10)/10;
      if(url.length > 24*1024*1024){
        alert(T('font.tooBig', size));
        setStatus(T('status.fontFailed'),'#ff9b83'); return;
      }
      const name=fontNameOf(nm);
      S.fonts=(S.fonts||[]).concat([{name:name, data:url}]);
      if(!S.fontBody) S.fontBody=name;
      applyFonts(); buildFontUI(); render(); save();
      setStatus(T('status.fontAdded', name, size)+(warn?'／'+warn:''), warn?'#e8c66a':'var(--ok)');
      if(warn) alert(T('font.warnAlert', name, warn));
    });
  };
  if(!offs){ finish(ab, 0); return; }
  if(offs.length===1){ finish(sfntFromTTC(ab, offs[0]), 0); return; }
  const names=offs.map((o,i)=>(i+1)+'. '+(sfntName(ab,o)||T('font.faceN', i+1)));
  const ans=prompt(T('font.pickFace', offs.length)+names.join('\n'), '1');
  if(ans===null) { setStatus(T('status.importCancelled')); return; }
  const idx=Math.min(Math.max(parseInt(ans,10)||1,1),offs.length)-1;
  setStatus(T('status.extractingFace'));
  setTimeout(()=>finish(sfntFromTTC(ab, offs[idx]), 0), 10);
}
/* 從檔名做出可以在 CSS 中使用的名稱 */
function fontNameOf(filename){
  let base = String(filename||'font').replace(/\.[^.]+$/,'').replace(/["'\\\\]/g,'').trim() || 'font';
  let name = base, i = 2;
  while((S.fonts||[]).some(f=>f.name===name)){ name = base+'-'+i; i++; }
  return name;
}
function buildFontUI(){
  const opts = (extra)=> '<option value="">'+extra+'</option>'
    + (S.fonts||[]).map(f=>'<option value="'+esc(f.name)+'">'+esc(f.name)+'</option>').join('');
  const eb=document.getElementById('fontBody'), eh=document.getElementById('fontHead');
  eb.innerHTML = opts(T('font.defaultMincho')); eb.value = S.fontBody||'';
  eh.innerHTML = opts(T('font.sameAsBody'));   eh.value = S.fontHead||'';
  const list=document.getElementById('fontList');
  list.innerHTML = (S.fonts||[]).length
    ? (S.fonts||[]).map(f=>'<div style="display:flex;gap:6px;align-items:center;margin:2px 0">'
        + '<span style="flex:1;font-family:\''+esc(f.name)+'\','+FONT_FALLBACK+'">'+esc(f.name)+' '+T('font.sample')+'</span>'
        + '<button data-fontdel="'+esc(f.name)+'" style="padding:1px 6px;font-size:11px">'+T('font.del')+'</button></div>').join('')
    : T('font.none');
}
document.getElementById('fontAdd').onclick=()=>document.getElementById('fontFile').click();
document.getElementById('fontFile').onchange=e=>{
  const file=e.target.files[0]; e.target.value='';
  if(!file) return;
  if(file.size > 40*1024*1024){ alert(T('font.over40')); return; }
  setStatus(T('status.fontLoading'));
  const fr=new FileReader();
  fr.onload=()=>addFontBuffer(fr.result, file.name.replace(/\.[^.]+$/,''));
  fr.readAsArrayBuffer(file);
};
/* 從清單中選擇電腦裡安裝的字型。
   Windows 的字型資料夾很難從選擇檔案的畫面找到，所以這才是主要的方法。 */
document.getElementById('fontPick').onclick=async()=>{
  if(typeof queryLocalFonts!=='function'){
    alert(T('font.noLocalFonts'));
    return;
  }
  let list;
  try{ list = await queryLocalFonts(); }
  catch(err){
    alert(T('font.permDenied'));
    return;
  }
  if(!list || !list.length){ alert(T('font.notFound')); return; }
  const fams=[...new Set(list.map(f=>f.family))].sort((a,b)=>a.localeCompare(b,'ja'));
  showFontList(fams, list);
};
function showFontList(fams, list){
  const dlg=document.getElementById('fontDlg');
  const box=document.getElementById('fontDlgList');
  const q=document.getElementById('fontDlgQ');
  const draw=()=>{
    const k=q.value.trim().toLowerCase();
    const hit=fams.filter(f=>!k||f.toLowerCase().includes(k));
    box.innerHTML = hit.length
      ? hit.map(f=>'<button class="fontrow" data-fam="'+esc(f)+'"><span style="font-family:\''+esc(f)+'\'">'+esc(f)+'</span>'
          +'<small style="font-family:\''+esc(f)+'\'">'+T('font.sample2')+'</small></button>').join('')
      : '<div class="hint" style="padding:10px">'+T('font.noMatch')+'</div>';
  };
  q.oninput=draw; q.value=''; draw();
  box.onclick=async ev=>{
    const btn=ev.target.closest('[data-fam]'); if(!btn) return;
    const fam=btn.dataset.fam;
    const faces=list.filter(f=>f.family===fam);
    const face=faces.find(f=>/regular|medium|^$/i.test(f.style||''))||faces[0];
    dlg.close();
    setStatus(T('status.fontReading', fam));
    try{
      const bl=await face.blob();
      addFontBuffer(await bl.arrayBuffer(), fam);
    }catch(err){
      setStatus(T('status.fontCantImport'),'#ff9b83');
      alert(T('font.extractFailed', fam));
    }
  };
  dlg.showModal();
}
document.getElementById('fontDlgX').onclick=()=>document.getElementById('fontDlg').close();
document.getElementById('fontList').onclick=e=>{
  const b=e.target.closest('[data-fontdel]'); if(!b) return;
  const nm=b.dataset.fontdel;
  if(!confirm(T('confirm.fontDelete', nm))) return;
  S.fonts=(S.fonts||[]).filter(f=>f.name!==nm);
  if(S.fontBody===nm) S.fontBody='';
  if(S.fontHead===nm) S.fontHead='';
  applyFonts(); buildFontUI(); render(); save();
};
['fontBody','fontHead'].forEach(id=>document.getElementById(id).addEventListener('change',e=>{
  S[id]=e.target.value; applyFonts(); render(); save();
}));

/* ================= 目錄 ================= */
/* 可以放進目錄的書式。放／不放可以依目錄區塊個別選擇 */
const TOC_PICKS = [
  ['title',    'type.title', 0],
  ['h1',       'type.h1',  1],
  ['h2',       'type.h2',  2],
  ['h3',       'type.h3',  3],
  ['scene',    'type.scene', 3],
  ['subtitle', 'type.subtitle',     2]
];
function newToc(){ return {lb:T('toc.defaultHead'), pick:['h1','h2','h3'], pn:true, dots:true}; }
function ensureToc(b){
  const t = (b.toc && typeof b.toc==='object') ? b.toc : (b.toc = newToc());
  t.lb = (t.lb==null) ? T('toc.defaultHead') : String(t.lb);
  t.pick = Array.isArray(t.pick) ? t.pick.filter(k=>TOC_PICKS.some(x=>x[0]===k)) : ['h1','h2','h3'];
  if(!t.pick.length) t.pick = ['h1','h2','h3'];
  t.pn = t.pn!==false;
  t.dots = t.dots!==false;
  return t;
}
/* 目錄中顯示的文字。可以和標題本身分開設定（b.tl）。
   設了 b.tocOff 的段落，不放進任何目錄 */
function tocTextOf(b){
  const own = String(b.tl==null?'':b.tl).trim();
  if(own) return own;
  return rubyPlain(String(b.text||'').trim().split('\n')[0]);
}
function tocLevelOf(type){
  const e = TOC_PICKS.find(x=>x[0]===type);
  return e ? e[2] : 1;
}
/* 每個標題的收錄方式。'' 依目錄那邊的設定，'on' 一定收錄，'off' 不收錄。
   舊原稿的 b.tocOff（不收錄的真假值）也照樣讀得懂 */
function tocModeOf(b){
  const m = String(b.tocMode||'');
  if(m==='on' || m==='off') return m;
  return b.tocOff ? 'off' : '';
}
/* 在目錄中的縮排層級。0 表示依書式而定（標題 2 就是第 2 層） */
function tocLvOf(b){
  const v = Math.max(0, Math.min(3, parseInt(b.tocLv,10)||0));
  return v || tocLevelOf(b.type);
}
/* 傳入 pick 就只收集那些書式。不傳的話照以前收集標題與主標題。
   但若標題那邊設定了「一定收錄」，則不論書式選擇都會收錄 */
function tocEntries(pick){
  const ok = Array.isArray(pick) ? pick : ['title','h1','h2','h3'];
  const out=[];
  /* 依紙面上的排列順序收集。彈出視窗或儲存格裡的標題無法顯示頁碼，所以不放 */
  S.blocks.forEach(b=>{
    const m = tocModeOf(b);
    if(m==='off') return;
    if(m!=='on' && !ok.includes(b.type)) return;
    if(m==='on' && !TOC_PICKS.some(x=>x[0]===b.type)) return;
    const tx = tocTextOf(b);
    if(!tx) return;
    out.push({id:b.id, lv: tocLvOf(b), text:tx, page: pageOfBlock(b.id)});
  });
  return out;
}
function pageOfBlock(id){
  for(let i=0;i<pageMap.length;i++) if(pageMap[i].indexOf(id)>=0) return i+1;
  return 1;
}
/* pageOfBlock 的規格是把「找不到」當成第 1 頁回傳（目錄與預設頁碼會用到）。
   需要區分是否找到的呼叫端改用這個。 */
function pageOfBlockOrNull(id){
  for(let i=0;i<pageMap.length;i++) if(pageMap[i].indexOf(id)>=0) return i+1;
  return null;
}
function tocInnerHTML(b){
  const t = b ? ensureToc(b) : newToc();
  const e = tocEntries(t.pick);
  const head = String(t.lb||'').trim();
  return (head ? '<div class="toc-h">'+esc(head)+'</div>' : '')
    + '<div class="toc-list'+(t.dots?'':' nodots')+'">' + e.map(x=>
    '<a class="toc-line toc-l'+x.lv+'" href="#b'+x.id+'"><span class="lb">'+esc(rubyPlain(x.text))+'</span>'
    + (t.dots?'<span class="dots"></span>':'<span class="dots plain"></span>')
    + (t.pn?'<span class="pn">'+x.page+'</span>':'')+'</a>'
  ).join('') + '</div>';
}

/* ================= 排頁（自動換頁） ================= */
const stage = document.getElementById('stage');
function blockEl(b, pageCols, prevType){
  const el = document.createElement('div');
  el.className = 'blk t-'+b.type;
  el.dataset.id = b.id;
  if(b.mb!=null) el.style.marginBottom = b.mb+'mm';
  if(b.col) el.style.color = b.col;
  /* 紙面上不放操作用的欄位。顯示與匯出時相同的樣子，
     修改則在左側的「這個段落的內容」進行。 */
  /* 角色卡可以直接在紙面上修改。
     重新排版時 editingOnPage() 會避開輸入中的狀態，所以不會找不到正在打字的位置 */
  /* 沒有使用注音・註解・顏色・巢狀記號的單純段落，
     可以直接在紙面上輸入。與彈出視窗完全相同的處理方式。
     重新排版時 editingOnPage() 會避開輸入中的狀態，所以不會找不到正在打字的位置 */
  if(plainEditable(b)){
    el.setAttribute('contenteditable','true');
    el.setAttribute('spellcheck','false');
    el.dataset.btext = b.id;
    el.dataset.ph = T('blk.emptyPh');
    el.textContent = b.text;
  }
  else if(b.type==='npc'){ el.innerHTML = npcInnerHTML(b, true, 'page'); }
  else if(b.type==='toc'){ el.innerHTML = tocInnerHTML(b); }
  else if(b.type==='break'||b.type==='colbr'){ el.textContent=''; }
  else if(b.type==='image'){
    el.innerHTML = imageInnerHTML(b);
    if(isFreeImg(b) && !(+b.ar>0)){
      const im = el.querySelector('img');
      if(im){ if(im.complete) noteImgRatio(b.id, im); else im.onload = ()=>noteImgRatio(b.id, im); }
    }
  }
  else if(b.type==='table'){ el.innerHTML = tableInnerHTML(b, true); }
  else if(b.type==='popup'){ el.innerHTML = popupInnerHTML(b); }
  else if(b.type==='proc'){
    const lb=blockLabel(b).trim();
    el.className += procClass(b);
    el.style.cssText += procStyle(b);
    el.innerHTML = (lb?'<div class="t-lb">'+esc(lb)+'</div>':'') + richBlockHTML(b);
  }
  /* 描述文・注釋若使用了巢狀記號，也經過那套組裝。
     沒使用的話，畫法與以前完全相同 */
  else if((b.type==='desc'||b.type==='note') && hasRich(b.text)){
    el.classList.add('hasrich'); el.innerHTML = richBlockHTML(b); }
  /* 紙面上也畫出方框的標記（用來量測溢出的文字、修正高度）。
     匯出 HTML 那邊（blockStaticHTML）照舊不畫標記 */
  else if(b.type==='flow'){ el.innerHTML = flowHTML(b, true); }
  else if(b.type==='dialog' && String(b.sp||'').trim()){
    el.innerHTML = '<span class="sp">'+esc(b.sp)+'</span>'+rubyHTMLwithComments(b); }
  else if(blockComments(b).length || blockMarks(b).length || hasRuby(b.text)){
    el.innerHTML = rubyHTMLwithComments(b); }
  else if(b.type==='hr'){
    const tx=String(b.text||'').trim();
    el.innerHTML = tx ? '<span class="hrtx">'+rubyHTMLwithComments(b)+'</span>' : '';
  }
  else { el.textContent = b.text; }
  const w = document.createElement('div');
  w.dataset.id = b.id;
  w.className = 'blkpad p-'+b.type + ((b.cols===1 && pageCols===2)?' span':'')
    + (b.type==='image' && (b.fl==='l'||b.fl==='r') ? ' fl-'+b.fl : '')
    + (b.clr ? ' clearfl' : '')
    + (b.ind ? ' i'+Math.min(4,b.ind) : '');
  const pull = gapPull(prevType, b.type);
  if(b.type==='image' && b.pos==='free'){
    w.classList.add('free');
    w.style.width = fnum(imgWmm(b))+'mm';
    w.style.left = (+b.fx||0)+'mm';
    w.style.top  = (+b.fy||0)+'mm';
    /* 自由配置在排版流程之外，所以不做重疊的調整 */
  }
  else if(b.type==='image' && (b.fl==='l'||b.fl==='r')){
    w.style.width = fnum(imgWmm(b))+'mm';
    const o = imgOff(b, pageCols), mt = o.dy - pull;
    if(mt) w.style.marginTop = (+mt.toFixed(3))+'mm';
    if(o.dx){ if(b.fl==='l') w.style.marginLeft = o.dx+'mm'; else w.style.marginRight = o.dx+'mm'; }
  }
  else if(pull) w.style.marginTop = '-'+pull+'mm';
  if(b.mt!=null) w.style.paddingTop = b.mt+'mm';
  w.appendChild(el);
  return w;
}
/* 圖片的位移。只在單欄的頁面生效。
   上方的位移和間距重疊調整（gapPull）用的是同一個 margin-top，
   分開寫的話其中一個會消失。所以在這裡加總成一個值。 */
function imgOff(b, pageCols){
  const on = (pageCols!==2);
  return {dy: on ? (+b.dy||0) : 0, dx: on ? (+b.dx||0) : 0};
}
function imgOffStyle(b, pageCols, pull){
  const o = imgOff(b, pageCols);
  const mt = o.dy - (pull||0);
  return (mt ? 'margin-top:'+(+mt.toFixed(3))+'mm;' : '')
       + (o.dx ? (b.fl==='l'?'margin-left:':'margin-right:')+o.dx+'mm;' : '');
}
/* ================= 表格 ================= */
function rollTableText(t){
  const rows = cellsRead(t).slice(t.head?1:0).filter(r=>r.some(c=>String(c).trim()));
  const name = String(t.name||'').trim() || '表';
  const dice = String(t.dice||'').trim() || ('1D'+Math.max(1,rows.length));
  const body = rows.map((r,i)=>{
    /* 第 1 欄若是骰值（數字或 1-3 這種範圍），就當成骰值使用，並從內文中拿掉。
       否則從上往下依序分配 1,2,3…。 */
    const first = String(r[0]||'').trim();
    const isNum = /^\d+(\s*[-–〜～]\s*\d+)?$/.test(first);
    const val  = isNum ? first.replace(/\s+/g,'') : String(i+1);
    /* 條列式把「標題」與「內文」用換行串起來。儲存格之間用全形空白隔開 */
    const parts = (isNum ? r.slice(1) : r).map(c=>String(c).trim()).filter(Boolean);
    const rest = parts.join(t.look==='list' ? '\n' : '　');
    return val+':'+rest.replace(/\n/g,'\\n');
  }).join('\n');
  return '/roll-table\n'+name+'\n'+dice+'\n'+body;
}
/* 格線表格 */
/* 當成可以直接閱讀的文章輸出。貼到聊天室當說明用的形式 */
function simpleTableText(t){
  const cs = cellsRead(t);
  const head = t.head ? cs[0] : [];
  const rows = cs.slice(t.head?1:0).filter(r=>r.some(c=>String(c).trim()));
  const name = String(t.name||'').trim();
  const body = rows.map(r=>{
    const cells = r.map(c=>String(c).trim());
    if(t.look==='grid' && head.length>1){
      /* 格線表格排成「標題：內容」 */
      return cells.map((c,i)=>c ? ((head[i]||'').trim() ? (head[i].trim()+'：'+c) : c) : '')
                  .filter(Boolean).join('／');
    }
    /* 條列式・標題框式先放「題名」，再接內容 */
    const t0=cells[0]||'', rest=cells.slice(1).filter(Boolean);
    return (t0?'■'+t0+'\n':'') + rest.join('\n');
  }).filter(x=>x.trim()).join(t.look==='grid' ? '\n' : '\n\n');
  return (name?name+'\n':'') + body;
}
function tblOutText(t){
  if(t.outMode==='free')   return String(t.out||'');
  if(t.outMode==='simple') return simpleTableText(t);
  return rollTableText(t);
}
function tblGridHTML(t, edit){
  const R=tblRows(t), C=tblCols(t);
  let rows='';
  for(let ri=0; ri<R; ri++){
    const isH = t.head && ri===0;
    let tds='';
    for(let ci=0; ci<C; ci++){
      const tag = (isH || (t.rowhead && ci===0)) ? 'th' : 'td';
      const key = edit ? ' data-cellkey="'+ri+','+ci+'"' : '';
      tds += '<'+tag+key+'>'+cellBlkHTML(t, ri, ci, edit)+'</'+tag+'>';
    }
    rows += '<tr>'+tds+'</tr>';
  }
  return '<table class="tbl">'+rows+'</table>';
}
/* 條列式表格。在一個框內用橫線分隔，每段以「編號：標題／內文」排列。
   第 1 欄＝編號，第 2 欄＝標題，第 3 欄以後＝內文。 */
function tblListHTML(t, edit){
  const off = t.head?1:0;
  const R=tblRows(t), C=tblCols(t);
  const idx=[]; for(let r=off;r<R;r++) idx.push(r);
  const secs = idx.map(ri=>{
    const cell=(ci,cls)=> '<div class="cellwrap w-'+cls+'"'+(edit?' data-cellkey="'+ri+','+ci+'"':'')+'>'
      + '<div class="'+cls+'">'+cellBlkHTML(t, ri, ci, edit)+'</div></div>';
    const rest = []; for(let k=2;k<C;k++) rest.push(cell(k,'tl-body'));
    return '<div class="tl-sec">'
      + '<div class="tl-h">'+cell(0,'tl-no')+'<span class="tl-co">：</span>'+cell(1,'tl-ttl')+'</div>'
      + (rest.length?rest.join(''):'')
    + '</div>';
  }).join('');
  return '<div class="tl-box">'+(secs||'<div class="tl-sec"></div>')+'</div>';
}
/* 標題框式表格。每一列做一個框，框的左上顯示該列的題名。
   內容以佔滿框的寬度流動，所以題名短、內容長的表格也好讀。 */
function tblCardHTML(t, edit){
  const off = t.head?1:0;
  const src  = t.head ? cellsRead(t)[0] : [];
  const R=tblRows(t), C=tblCols(t);
  const idx=[]; for(let r=off;r<R;r++) idx.push(r);
  const cards = idx.map(ri=>{
    const cell=(ci,cls)=> '<div class="cellwrap w-'+cls+'"'+(edit?' data-cellkey="'+ri+','+ci+'"':'')+'>'
      + '<div class="'+cls+'">'+cellBlkHTML(t, ri, ci, edit)+'</div></div>';
    const rest = [];
    for(let k=1;k<C;k++){
      const label = String(src[k]||'').trim();
      const many = C>2;
      rest.push((many && label ? '<div class="cd-k">'+esc(label)+'</div>' : '') + cell(k,'cd-v'));
    }
    return '<div class="cd">'+cell(0,'cd-t')+'<div class="cd-b">'+rest.join('')+'</div></div>';
  }).join('');
  return '<div class="cd-wrap">'+(cards||'<div class="cd"></div>')+'</div>';
}
/* 把放進儲存格的區塊，接在文字後面輸出 */
/* 儲存格的內容。把段落串列直接排出來。
   即使內容是空的，也畫一個空段落當作輸入的位置（只在編輯畫面） */
function cellBlkHTML(t, ri, ci, edit){
  let l = (t.cb||{})[ri+','+ci];
  if(!Array.isArray(l) || !l.length){
    if(!edit) return '';
    l = cellBlocks(t, ri, ci, true);
  }
  let prevType=null, first=true;
  return '<div class="cellblk">'+l.map(b=>{
    const pull = gapPull(prevType, b.type); prevType = b.type;
    const top = first ? ' pagetop' : ''; first=false;
    return blockStaticHTML(b, 1, pull, top, '', edit);
  }).join('')+'</div>';
}
/* 表格的內容。紙面上只放成品，修改在右側設定欄與「寬視窗」進行 */
function tableInnerHTML(b, edit){
  const t = b.tbl || newTable();
  const nm = String(t.name||'').trim();
  /* 名稱為空，或關掉了「表格名稱」時，連名稱欄本身都不輸出 */
  const cap = (nm && t.capOn!==false)
    ? '<div class="tbl-cap"'
      + (edit?' contenteditable="true" spellcheck="false" data-tname="1"':'')
      + '>'+(edit?esc(nm):rubyHTML(t.name))+'</div>'
    : '';
  const grid = t.look==='list' ? tblListHTML(t, edit)
             : t.look==='card' ? tblCardHTML(t, edit)
             : tblGridHTML(t, edit);
  return cap + grid;
}

/* ================= 彈出視窗 ================= */
/* 從儲存格或內文中，以名稱指向既有的彈出視窗區塊。
   同名的有好幾個時，指向先出現的那一個 */
function popupByLabel(name){
  const n = String(name||'').trim(); if(!n) return null;
  return allBlocks().find(x => x.type==='popup'
    && String((x.pop||{}).label||T('pop.defaultLabel')).trim() === n) || null;
}
/* 從文章或儲存格中撿出 ＠名稱 */
function popRefNames(text){
  const out=[];
  String(text||'').split('\n').forEach(ln=>{
    const m = ln.match(/^[＠@]\s*(\S[\s\S]*)$/);
    if(m){ const n=m[1].trim(); if(n) out.push(n); }
  });
  return out;
}
/* 增加／刪除一列。儲存格段落的鍵（"列,欄"）也一併重新對應 */
function tblAddRow(t, at){
  const R=tblRows(t), C=tblCols(t), i=(at==null?R:Math.max(0,Math.min(R,at)));
  const cb={};
  Object.keys(t.cb||{}).forEach(k=>{
    const rc=k.split(',').map(Number);
    cb[(rc[0]>=i?rc[0]+1:rc[0])+','+rc[1]] = t.cb[k];
  });
  t.cb=cb; t.rows=R+1; tblFit(t);
}
function tblDelRow(t, at){
  const R=tblRows(t); if(R<=1) return false;
  const i=Math.max(0,Math.min(R-1,at));
  const cb={};
  Object.keys(t.cb||{}).forEach(k=>{
    const rc=k.split(',').map(Number);
    if(rc[0]===i) return;
    cb[(rc[0]>i?rc[0]-1:rc[0])+','+rc[1]] = t.cb[k];
  });
  t.cb=cb; t.rows=R-1; tblFit(t); return true;
}
function tblAddCol(t, at){
  const C=tblCols(t), i=(at==null?C:Math.max(0,Math.min(C,at)));
  const cb={};
  Object.keys(t.cb||{}).forEach(k=>{
    const rc=k.split(',').map(Number);
    cb[rc[0]+','+(rc[1]>=i?rc[1]+1:rc[1])] = t.cb[k];
  });
  t.cb=cb; t.ncol=C+1; tblFit(t);
}
function tblDelCol(t, at){
  const C=tblCols(t); if(C<=1) return false;
  const i=Math.max(0,Math.min(C-1,at));
  const cb={};
  Object.keys(t.cb||{}).forEach(k=>{
    const rc=k.split(',').map(Number);
    if(rc[1]===i) return;
    cb[rc[0]+','+(rc[1]>i?rc[1]-1:rc[1])] = t.cb[k];
  });
  t.cb=cb; t.ncol=C-1; tblFit(t); return true;
}
/* 若指向了還不存在的名稱，就當場建立該名稱的彈出視窗。
   不顯示在紙面上（只從儲存格或內文的 ＠名稱 指向），放在所寫段落的正下方。
   為了不以打到一半的名稱建立，在離開輸入欄時才呼叫 */
function makeMissingPopups(ownerId){
  const f = ownerId ? findBlock(ownerId) : null; if(!f) return 0;
  const b = f.b;
  /* 儲存格的內容是段落串列，所以只看這個段落的內文
     （儲存格裡的段落，會在該段落自己被呼叫時檢查） */
  const texts = [b.text];
  const want=[]; texts.forEach(t=>popRefNames(t).forEach(n=>{ if(want.indexOf(n)<0) want.push(n); }));
  let made=[], at = f.i;
  want.forEach(n=>{
    if(popupByLabel(n)) return;
    const nb = newBlock('popup','');
    nb.pop = Object.assign(newPopup(), { label:n, only:true });
    f.list.splice(++at, 0, nb);
    made.push(n);
  });
  if(made.length){ render(); save();
    setStatus(T('status.popsCreated', made.join('」「')),'var(--ok)'); }
  return made.length;
}
function popRefHTML(name){
  const n = String(name||'').trim();
  const t = popupByLabel(n);
  if(!t) return '<button type="button" contenteditable="false" class="pop-btn pop-miss" data-popmake="'+esc(n)+'">'
              + esc(n)+T('pop.missMake')+'</button>';
  return '<button type="button" contenteditable="false" class="pop-btn" data-popopen="'+t.id+'">'
       + esc(String((t.pop||{}).label||T('pop.defaultLabel')))+'</button>';
}
function popupInnerHTML(b){
  const p = b.pop || newPopup();
  const label = String(p.label||T('pop.defaultLabel')).trim() || T('pop.defaultLabel');
  return '<button type="button" class="pop-btn" data-popopen="'+b.id+'">'+esc(label)+'</button>';
}
/* 框（技能判定・特殊規則）的內容。用行首的記號做出小標與巢狀。
     ■成功   → 小標
     ＞…     → 在裡面放入技能判定的框（在特殊規則中使用） */
/* ================= 巢狀書式 =================
   在內文中，可以用行首的記號放入其他書式。
     ■…        小標
     ＞技能：…  巢狀的規則框
     ・…        條列（中黑點）
     1. …       條列（編號）
     □…        條列（選項）
     「…」      對話文（只有整行都以引號括起來時。
                 寫成 名字「…」 就會成為說話者）
     |項目|内容| 表格
   條列的縮排，以行首兩個空白（全形一個）為一層。
   為了不讓註解位置錯亂，切分時一路帶著「原本的文字位置」。 */
const RICH_MARK = /^[ 　\t]*(?:[■◆]|[◇]|[※＊]|[＞>]|[・･]|[-*+][ \t]|\d+[.．)）]|[□☐]|[＠@]|[|｜])/;
const RICH_TALK = /^\s*(?:([^「『、。！？\s]{1,10})\s*)?[「『][\s\S]*[」』]\s*$/;
/* 可以使用巢狀書式的書式 */
/* 要經過巢狀書式處理的書式。對話文本身就是巢狀書式，所以不放進來
   （放進來的話，會出現按了卻仍殘留記號的不一致） */
const RICH_TYPES = ['desc','note','proc'];
/* 插在行首的記號。排在設定欄（右側）的按鈕上 */
const RICH_MARKS = [
  ['- ',          'rich.disc',  'rich.discTip'],
  ['1. ',         'rich.num', 'rich.numTip'],
  ['- [ ] ',      'rich.box','rich.boxTip'],
  ['  - ',        'rich.indent',  'rich.indentTip'],
  ['■',          'rich.head','rich.headTip'],
  ['◇',          'rich.heads','rich.headsTip'],
  ['※',          'rich.note',  'rich.noteTip'],
  ['> 技能：',     'rich.nest',  'rich.nestTip'],
  ['「」',         'rich.talk','rich.talkTip'],
  ['|項目|内容|', 'rich.table',    'rich.tableTip'],
  ['＠',          'rich.pop',  'rich.popTip']
];
/* ■ 或 ◇ 打起來很麻煩，所以在行首打 /komidashi 這樣的指令
   再按空白鍵，就會當場變成記號。
   變換後的原稿和以前的記號完全相同，
   所以對紙面・匯出 HTML・表格輸出（擲骰表）・字數都沒有任何影響。 */
const SLASH_MARKS = [
  [['midashi','head'],              '■'],
  [['komidashi','sub','subhead'],   '◇'],
  [['chushaku','note'],             '※'],
  [['hantei','roll','skill'],       '> 技能：'],
  [['kaiwa','talk'],                '「」'],
  [['hyou','table'],                '|項目|内容|'],
  [['betsumado','pop','popup'],     '＠'],
  [['kajou','list'],                '- '],
  [['bangou','num'],                '1. '],
  [['sentaku','check'],             '- [ ] '],
  [['sagedan','indent'],            '  - ']
];
const SLASH_MAP = (()=>{ const m={};
  SLASH_MARKS.forEach(([ks,mk])=>ks.forEach(k=>{ m[k]=mk; })); return m; })();
/* 能叫出該記號的指令清單（附在按鈕的說明上） */
function slashHintFor(mk){
  const e = SLASH_MARKS.find(x=>x[1]===mk);
  return e ? e[0].map(k=>'/'+k).join('　') : '';
}
function richTitle(mk, ti){
  const h = slashHintFor(mk);
  return h ? T(ti)+T('rich.slashHint', h) : T(ti);
}
/* 按鈕的內容。指令以灰字顯示在按鈕上（不用滑過去也看得到） */
function richLabelHTML(mk, lb){
  const e = SLASH_MARKS.find(x=>x[1]===mk);
  return esc(T(lb)) + (e ? '<i class="rich-cmd">/'+esc(e[0][0])+'</i>' : '');
}
/* 游標前方若是「行首＋/指令＋空白」，就回傳要替換成的內容。
   back 是要刪除的字數，inside 表示是否把游標放進記號中間（「」的時候） */
function slashHit(text, caret){
  const t = String(text||'');
  caret = Math.max(0, Math.min(t.length, caret));
  const head = Math.max(0, t.lastIndexOf('\n', caret-1) + 1);
  const m = t.slice(head, caret).match(/^([ 　\t]*)\/([A-Za-z][A-Za-z0-9]*)([ 　])$/);
  if(!m) return null;
  const mk = SLASH_MAP[m[2].toLowerCase()];
  if(!mk) return null;
  return {back: m[2].length + 2, mark: mk, inside: mk==='「」'};
}
/* 在可輸入文字的欄位（contenteditable）把指令換成記號。
   因為經過 execCommand，游標位置與「復原」都可以交給瀏覽器處理 */
function slashFire(el, e){
  if(!el || (e && e.isComposing)) return false;
  if(e && e.data!=null && e.data!==' ' && e.data!=='　') return false;
  const rg = selRangeIn(el);
  if(!rg || rg.a!==rg.z) return false;
  const hit = slashHit(el.innerText, rg.a);
  if(!hit) return false;
  const s = getSelection();
  for(let i=0;i<hit.back;i++) s.modify('extend','backward','character');
  document.execCommand('insertText', false, hit.mark);
  if(hit.inside) s.modify('move','backward','character');
  return true;
}
/* textarea（表格的寬視窗・彈出視窗的文章・規則框的內容）也做同樣的事 */
function slashFireTA(ta, e){
  if(!ta || (e && e.isComposing)) return false;
  if(e && e.data!=null && e.data!==' ' && e.data!=='　') return false;
  const caret = ta.selectionStart;
  if(caret!==ta.selectionEnd) return false;
  const hit = slashHit(ta.value, caret);
  if(!hit) return false;
  ta.setRangeText(hit.mark, caret-hit.back, caret, 'end');
  if(hit.inside) ta.selectionStart = ta.selectionEnd = ta.selectionEnd-1;
  return true;
}
/* 行首的記號。更換書式時，先把它拿掉 */
const RICH_HEAD_RE = /^[ 　\t]*(?:[■◆]|[◇]|[※＊]|[＞>]|[・･]|[-*+][ \t]*\[[ xX]?\]|[-*+][ \t]|\d+[.．)）]|[□☐]|[＠@]|#{1,3})[ 　\t]*/;
/* 回傳該記號屬於哪種書式。用於重新加上，以及「再按一次就拿掉」的判斷 */
function markKey(s){
  const m = String(s||'').match(RICH_HEAD_RE); if(!m) return '';
  const c = m[0].trim();
  if(/^[-*+][ \t]*\[/.test(c)) return 'box';    // - [ ] 選項（markdown）
  if(/^[-*+]/.test(c))         return 'disc';   // - 條列（markdown）
  if(/^[■◆]/.test(c)) return 'head';
  if(/^[◇]/.test(c))  return 'heads';
  if(/^[※＊]/.test(c)) return 'note';
  if(/^[＞>]/.test(c)) return 'nest';
  if(/^[・･]/.test(c)) return 'disc';
  if(/^\d/.test(c))    return 'num';
  if(/^[□☐]/.test(c)) return 'box';
  if(/^[＠@]/.test(c)) return 'pop';
  if(/^###/.test(c))   return 'h3';
  if(/^##/.test(c))    return 'h2';
  if(/^#/.test(c))     return 'h1';
  return '';
}
/* 書式按鈕的處理內容。
   有選取文字就改造那個範圍，沒選取就照以前一樣插入記號。
   回傳「替換後的文章」與「重新選取的範圍」。 */
function richApply(text, a, z, mark){
  const t = String(text||'');
  a = Math.max(0, Math.min(t.length, a));
  z = Math.max(a, Math.min(t.length, z));
  if(a===z){
    const head = (a===0) || t.charAt(a-1)==='\n';
    const ins = (head?'':'\n') + mark;
    const c = a + ins.length - (mark==='「」' ? 1 : 0);
    return {text: t.slice(0,a)+ins+t.slice(z), a:c, z:c};
  }
  /* 對話文是把選取的部分整個括起來。已經括起來的話就拿掉 */
  if(mark==='「」'){
    const raw = t.slice(a,z), sv = raw.trim();
    const on = /^[「『][\s\S]*[」』]$/.test(sv);
    const nw = on ? raw.replace(/^(\s*)[「『]([\s\S]*)[」』](\s*)$/,'$1$2$3') : '「'+raw+'」';
    return {text: t.slice(0,a)+nw+t.slice(z), a:a, z:a+nw.length};
  }
  /* 彈出視窗是把選取的文字直接當成彈出視窗的名稱 */
  if(markKey(mark)==='pop'){
    const nm = t.slice(a,z).replace(/[\r\n]+/g,' ').trim();
    const nw = '＠'+nm;
    return {text: t.slice(0,a)+nw+t.slice(z), a:a, z:a+nw.length};
  }
  /* 以下是逐行的書式。把選取範圍擴展到行首與行尾 */
  let ls = t.lastIndexOf('\n', a-1); ls = (ls<0) ? 0 : ls+1;
  let le = t.indexOf('\n', z); if(le<0) le = t.length;
  const lines = t.slice(ls, le).split('\n');
  /* 表格是把選取的每一行用 | 括起來。全部都括好了的話就一起拿掉 */
  if(/^[|｜]/.test(mark)){
    const on = lines.every(l=>!l.trim() || /^\s*[|｜].*[|｜]\s*$/.test(l));
    const out = lines.map(l=> !l.trim() ? l
      : on ? l.replace(/^(\s*)[|｜]/,'$1').replace(/[|｜](\s*)$/,'$1')
           : '|'+l.trim()+'|');
    const nw = out.join('\n');
    return {text: t.slice(0,ls)+nw+t.slice(le), a:ls, z:ls+nw.length};
  }
  const want = markKey(mark);
  const ind  = (mark.match(/^[ 　\t]*/)||[''])[0];
  /* 所有行都已經是同樣書式的話，按下去的意思就是「拿掉」 */
  const on = lines.every(l=>!l.trim()
    || (markKey(l)===want && (l.match(/^[ 　\t]*/)||[''])[0]===ind));
  let n=0;
  const out = lines.map(l=>{
    if(!l.trim()) return l;
    const bd = l.replace(RICH_HEAD_RE,'');
    if(on) return bd;
    n++;
    const mk = want==='num'  ? ind + n + '. '
             : want==='nest' ? (n===1 ? mark : ind+'＞')
             : mark;
    return mk + bd;
  });
  const nw = out.join('\n');
  return {text: t.slice(0,ls)+nw+t.slice(le), a:ls, z:ls+nw.length};
}
/* 對可輸入文字的欄位（textarea）套用書式 */
function richApplyTA(ta, mark){
  if(!ta) return;
  const r = richApply(ta.value, ta.selectionStart, ta.selectionEnd, mark);
  ta.value = r.text;
  ta.focus(); ta.setSelectionRange(r.a, r.z);
  ta.dispatchEvent(new Event('input',{bubbles:true}));
}
function richBtnsHTML(){
  return '<div class="grid3 richbtns">'
    + RICH_MARKS.map(([mk,lb,ti])=>
        '<button data-rich="'+esc(mk)+'" data-richlb="'+esc(T(lb))+'" title="'+esc(richTitle(mk,ti))+'">'+richLabelHTML(mk,lb)+'</button>').join('')
    + '</div>';
}
/* 這段文章是否使用了巢狀書式（沒使用的話照以前的方式畫） */
function hasRich(text){
  const ls = String(text||'').split('\n');
  return ls.some(ln => RICH_MARK.test(ln) || RICH_TALK.test(ln));
}
/* 彈出視窗裡可用的記號。比內文段落多了標題 */
const RICH_MARKS_POP = [['# ','rich.h1','rich.h1Tip'],
                        ['## ','rich.h2','rich.h2Tip'],
                        ['### ','rich.h3','rich.h3Tip']].concat(RICH_MARKS);
function richIndent(sp){
  return Math.min(3, Math.floor(String(sp||'').replace(/　/g,'  ').replace(/\t/g,'  ').length/2));
}
/* 看一行，回傳是哪種書式。ofs 是該行內文開始位置的偏移 */
function richKind(ln, opt){
  let m;
  /* 只有在彈出視窗裡，# 才會變成標題。在內文段落中 # 當成一般文字 */
  if(opt && opt.heads && (m = ln.match(/^(#{1,3})\s*(?=\S)/)))
    return {k:'h', lv:m[1].length, ofs:m[0].length};
  if((m = ln.match(/^[■◆]\s*/)))            return {k:'head', ofs:m[0].length};
  if((m = ln.match(/^[◇]\s*/)))             return {k:'heads', ofs:m[0].length};
  if((m = ln.match(/^[※＊]\s*/)))           return {k:'note', ofs:m[0].length};
  if((m = ln.match(/^[＞>]\s*/)))            return {k:'nest', ofs:m[0].length};
  if((m = ln.match(/^[＠@]\s*(?=\S)/)))      return {k:'pop', ofs:m[0].length};
  /* 選項要比條列先檢查（因為 - [ ] 以 - 開頭）。
     markdown 的 - [ ] / - [x]，以及以前的 □ 都接受 */
  if((m = ln.match(/^([ 　\t]*)(?:[□☐][ \t]*|[-*+][ \t]*\[([ xX]?)\][ \t]*)/)))
    return {k:'li', mk:'box', on:/[xX]/.test(m[2]||''), lv:richIndent(m[1]), ofs:m[0].length};
  /* 條列。markdown 的 - * + 只有後面接空白時才當成記號
     （避免把「-5度」這種句首誤認為記號） */
  if((m = ln.match(/^([ 　\t]*)(?:[・･][ \t]*|[-*+][ \t]+)/)))
    return {k:'li', mk:'disc', lv:richIndent(m[1]), ofs:m[0].length};
  if((m = ln.match(/^([ 　\t]*)(\d+)[.．)）]\s*/))) return {k:'li', mk:'num', lv:richIndent(m[1]), no:m[2], ofs:m[0].length};
  if(/^\s*[|｜].*[|｜]\s*$/.test(ln))         return {k:'tbl', ofs:0};
  if((m = ln.match(RICH_TALK)))              return {k:'talk', sp:(m[1]||''), ofs:(m[1]? ln.indexOf(m[1])+m[1].length : 0)};
  return {k:'p', ofs:0};
}
/* 組裝內文。ranger(a,z) 負責畫出「原本文字位置 a～z」。 */
function richBodyHTML(text, ranger, opt){
  opt = opt || {};
  const src = String(text||'');
  let out='', para=[], nest=null, list=null, tbl=[], note=null;
  const P = opt.pTag || 'bx-p';
  const flushP=()=>{ if(para.length){
      out += '<div class="'+P+'">'+para.map(x=>ranger(x.a,x.z)).join('\n')+'</div>'; para=[]; } };
  const flushN=()=>{ if(nest){
      out += '<div class="bx-in"><div class="t-lb">'+esc(nest.lb)+'</div>'
           + '<div class="bx-p">'+nest.body.map(x=>typeof x==='string'?esc(x):ranger(x.a,x.z)).join('\n')+'</div></div>';
      nest=null; } };
  const flushNote=()=>{ if(note){
      out += '<div class="bx-note">'+note.body.map(x=>ranger(x.a,x.z)).join('\n')+'</div>';
      note=null; } };
  const flushL=()=>{ if(list){
      let n=0;
      out += '<ul class="ls ls-'+list.mk+'">'+list.items.map(it=>{
        if(it.lv===0) n++;
        const mk = it.mk==='num' ? (it.lv===0 ? (it.no||n)+'.' : '‣')
                 : it.mk==='box' ? (it.on?'☑':'□') : (it.lv?'‣':'・');
        return '<li class="lv'+it.lv+'"><span class="mk">'+mk+'</span>'
             + '<span class="tx">'+ranger(it.a,it.z)+'</span></li>';
      }).join('')+'</ul>';
      list=null; } };
  const flushT=()=>{ if(tbl.length){
      out += '<table class="bx-tbl">'+tbl.map((r,i)=>'<tr>'+r.map(c=>
        (i===0?'<th>':'<td>')+ranger(c.a,c.z)+(i===0?'</th>':'</td>')).join('')+'</tr>').join('')+'</table>';
      tbl=[]; } };
  const flushAll=(keep)=>{
    if(keep!=='p') flushP();
    if(keep!=='nest') flushN();
    if(keep!=='li') flushL();
    if(keep!=='note') flushNote();
    if(keep!=='tbl') flushT();
  };

  let at=0;
  src.split('\n').forEach(ln=>{
    const a=at, z=at+ln.length; at = z+1;
    const k = richKind(ln, opt);
    if(k.k==='h'){ flushAll(); out += '<div class="bx-h'+k.lv+'">'+ranger(a+k.ofs, z)+'</div>'; return; }
    if(k.k==='head'){ flushAll(); out += '<div class="bx-h">'+ranger(a+k.ofs, z)+'</div>'; return; }
    if(k.k==='pop'){ flushAll(); out += popRefHTML(src.slice(a+k.ofs, z)); return; }
    if(k.k==='heads'){ flushAll(); out += '<div class="bx-hs">'+ranger(a+k.ofs, z)+'</div>'; return; }
    if(k.k==='note'){
      flushAll('note');
      if(!note) note={body:[]};
      note.body.push({a:a+k.ofs, z:z});
      return;
    }
    if(k.k==='nest'){
      flushAll('nest');
      const body = src.slice(a+k.ofs, z);
      const ci = body.indexOf('：')>=0 ? body.indexOf('：') : body.indexOf(':');
      if(!nest) nest = (ci>0)
          ? {lb: body.slice(0,ci).trim(), body:[{a:a+k.ofs+ci+1, z:z}]}
          : {lb:T('label.skill'), body:[{a:a+k.ofs, z:z}]};
      else nest.body.push({a:a+k.ofs, z:z});
      return;
    }
    if(k.k==='li'){
      flushAll('li');
      if(list && list.mk!==k.mk) flushL();
      if(!list) list={mk:k.mk, items:[]};
      list.items.push({lv:k.lv, mk:k.mk, no:k.no, on:k.on, a:a+k.ofs, z:z});
      return;
    }
    if(k.k==='tbl'){
      flushAll('tbl');
      /* 跳過 |---|---| 這種分隔行 */
      const inner = ln.replace(/^\s*[|｜]/,'').replace(/[|｜]\s*$/,'');
      if(/^[\s|｜\-ー－]*$/.test(inner) && /-{2,}/.test(inner)) return;
      const cells=[]; let p = a + (ln.length - ln.replace(/^\s*/,'').length) + 1;
      inner.split(/[|｜]/).forEach(c=>{
        const cs = p + (c.length - c.replace(/^\s*/,'').length);
        const ce = p + c.replace(/\s*$/,'').length;
        cells.push({a:cs, z:Math.max(cs,ce)});
        p += c.length + 1;
      });
      tbl.push(cells);
      return;
    }
    if(k.k==='talk'){
      flushAll();
      out += '<div class="bx-t">'
           + (k.sp ? '<span class="sp">'+esc(k.sp)+'</span>' : '')
           + ranger(a+k.ofs, z) + '</div>';
      return;
    }
    flushAll('p');
    if(!ln.trim()) flushP(); else para.push({a:a, z:z});
  });
  flushAll();
  return out;
}
/* 區塊用（支援註解）與單純文章用的入口 */
function richBlockHTML(b){
  return richBodyHTML(b.text, (a,z)=>rubyRange(b,a,z));
}
function richTextHTML(text, opt){
  const t = String(text||'');
  return richBodyHTML(t, (a,z)=>rubyHTML(t.slice(a,z)), opt);
}
/* 舊名稱。規則框的內容一律經過這套組裝 */
/* 流程圖。一行是一個方框，行首有 ・ 或 - 的話會當成分支橫向排列 */
/* ================= 流程圖（自由配置） =================
   方框放在喜歡的位置，從方框到方框拉線。分支之後還可以再分支。
   形狀與線用 SVG 畫，文字用 HTML 疊在上面
   （菱形的框線也能畫得漂亮，裡面的文字也能用和內文相同的排法）。
   紙面・列印・匯出 HTML 全部經過這個 flowHTML。 */
const FLOW_KINDS = [
  ['box',     'flow.kind.box'],
  ['round',   'flow.kind.round'],
  ['diamond', 'flow.kind.diamond'],
  ['term',    'flow.kind.term'],
  ['io',      'flow.kind.io']
];
const FLOW_MIN_W = 8, FLOW_MIN_H = 6;
/* 預設為直長形。因為劇本的流程是由上往下延伸 */
function newFlow(){ return {w:105, h:170, nodes:[], edges:[]}; }
function newFlowNode(x, y, t){
  return {id:uid(), x:+x||0, y:+y||0, w:44, h:14,
          t:String(t==null?'':t), t2:'', kind:'box', pad:2, col:''};
}
/* 把舊原稿（一行一個方框，行首的 - ・ 是分支）直接重新配置成圖 */
function flowFromText(text){
  const f = newFlow();
  const rows = [];
  String(text||'').split('\n').forEach(ln=>{
    const t = ln.trim(); if(!t) return;
    const br = t.match(/^[・\-]\s*(.*)$/);
    if(br){
      if(!rows.length || rows[rows.length-1].kind!=='br') rows.push({kind:'br', items:[]});
      rows[rows.length-1].items.push(br[1]);
    } else rows.push({kind:'box', t:t});
  });
  const W = f.w, NH = 13, GAP = 9;
  let y = 5, prev = [];
  rows.forEach(r=>{
    const cur = [];
    if(r.kind==='box'){
      const nw = Math.min(72, W*0.72);
      const n = newFlowNode((W-nw)/2, y, r.t); n.w = nw; n.h = NH;
      f.nodes.push(n); cur.push(n);
    } else {
      const k = r.items.length, g = 4;
      const nw = Math.max(FLOW_MIN_W, (W-8-(k-1)*g)/k);
      r.items.forEach((t,i)=>{
        const n = newFlowNode(4+i*(nw+g), y, t);
        n.w = nw; n.h = NH; n.kind = 'round'; n.col = 'aka';
        f.nodes.push(n); cur.push(n);
      });
    }
    prev.forEach(p=>cur.forEach(c=>f.edges.push({id:uid(), a:p.id, b:c.id, lb:''})));
    prev = cur; y += NH + GAP;
  });
  if(rows.length) f.h = Math.max(60, y - GAP + 5);
  return f;
}
/* 方框的高度維持設定值。只有在裡面的文字溢出時，才延伸溢出的份量。
   實際量測畫在紙面（#stage）上的東西，所以字體或字級改變也對得上。
   不會縮小（一旦撐大的方框若每次刪字都跟著動，會很不穩定）。 */
let flowGrowing = false;
function flowGrowAll(){
  if(flowGrowing || !S) return false;
  flowGrowing = true;
  let changed = false;
  try{
    allBlocks().forEach(b=>{
      if(b.type!=='flow' || !b.flow || !Array.isArray(b.flow.nodes)) return;
      const host = stage.querySelector('.blk[data-id="'+b.id+'"]');
      if(!host) return;
      b.flow.nodes.forEach(n=>{
        const el = host.querySelector('.fwn[data-fnode="'+n.id+'"]');
        if(!el) return;
        const inner = [...el.children].filter(x=>x.classList.contains('fwn-a')||x.classList.contains('fwn-b'));
        if(!inner.length) return;
        let need = 0;
        inner.forEach(x=>{ need += x.scrollHeight; });
        const cs = getComputedStyle(el);
        need += parseFloat(cs.paddingTop||0) + parseFloat(cs.paddingBottom||0);
        /* 菱形內側較窄，所以多估一點 */
        if(n.kind==='diamond') need *= 1.7;
        else if(n.kind==='io') need *= 1.08;
        const mm = need / FLOW_MM;
        if(mm > n.h + 0.3){ n.h = Math.ceil(mm*2)/2; changed = true; }
      });
      if(changed){
        const fl = b.flow;
        let my = 0; fl.nodes.forEach(n=>{ my = Math.max(my, n.y+n.h); });
        if(my > fl.h) fl.h = Math.min(600, Math.ceil(my+4));
        fl.nodes.forEach(n=>flowFit(fl,n));
      }
    });
  }catch(_){}
  flowGrowing = false;
  return changed;
}
function ensureFlow(b){
  let f = b.flow;
  if(!f || typeof f!=='object' || !Array.isArray(f.nodes)) f = b.flow = flowFromText(b.text);
  f.w = Math.max(30, Math.min(400, +f.w||150));
  f.h = Math.max(20, Math.min(600, +f.h||95));
  f.nodes = f.nodes.filter(n=>n && typeof n==='object');
  f.nodes.forEach(n=>{
    if(!n.id) n.id = uid();
    n.x = +n.x||0; n.y = +n.y||0;
    n.w = Math.max(FLOW_MIN_W, +n.w||44);
    n.h = Math.max(FLOW_MIN_H, +n.h||14);
    n.t = String(n.t==null?'':n.t);
    n.t2 = String(n.t2==null?'':n.t2);
    n.kind = FLOW_KINDS.some(k=>k[0]===n.kind) ? n.kind : 'box';
    n.pad = Math.max(0, Math.min(20, +n.pad||0));
    n.col = BX_COLS.some(c=>c.k===n.col) ? n.col : '';
  });
  if(!Array.isArray(f.edges)) f.edges = [];
  const ids = new Set(f.nodes.map(n=>n.id));
  f.edges = f.edges.filter(e=>e && typeof e==='object' && ids.has(e.a) && ids.has(e.b) && e.a!==e.b);
  f.edges.forEach(e=>{ if(!e.id) e.id = uid(); e.lb = String(e.lb==null?'':e.lb); });
  return f;
}
function flowNode(f, id){ return f.nodes.find(n=>n.id===id) || null; }
/* 方框的顏色。沒指定就是墨色 */
function flowCol(n){
  const c = n && n.col ? BX_COL(n.col) : BX_COLS[1];
  return {line:c.c, fill:c.f, soft:c.l};
}
/* 從中心朝向對方的線，與該方框邊緣相交的點 */
function flowClip(n, tx, ty){
  const cx = n.x + n.w/2, cy = n.y + n.h/2;
  const dx = tx - cx, dy = ty - cy;
  if(!dx && !dy) return [cx, cy];
  const hw = n.w/2, hh = n.h/2;
  if(n.kind==='diamond'){
    /* 菱形的邊緣是 |x/hw| + |y/hh| = 1 */
    const s = 1 / (Math.abs(dx)/hw + Math.abs(dy)/hh);
    return [cx + dx*s, cy + dy*s];
  }
  const s = Math.min(dx ? hw/Math.abs(dx) : Infinity, dy ? hh/Math.abs(dy) : Infinity);
  return [cx + dx*s, cy + dy*s];
}
function fnum(v){ return (Math.round(v*100)/100); }
function flowShapeSVG(n){
  const c = flowCol(n);
  const st = ' fill="'+c.fill+'" stroke="'+c.line+'" stroke-width="0.4" vector-effect="non-scaling-stroke"';
  const pts = a => a.map(p=>fnum(p[0])+','+fnum(p[1])).join(' ');
  if(n.kind==='diamond')
    return '<polygon points="'+pts([[n.x+n.w/2,n.y],[n.x+n.w,n.y+n.h/2],[n.x+n.w/2,n.y+n.h],[n.x,n.y+n.h/2]])+'"'+st+'/>';
  if(n.kind==='io'){
    const k = Math.min(n.w*0.18, n.h*0.7);
    return '<polygon points="'+pts([[n.x+k,n.y],[n.x+n.w,n.y],[n.x+n.w-k,n.y+n.h],[n.x,n.y+n.h]])+'"'+st+'/>';
  }
  const r = n.kind==='term' ? Math.min(n.h/2, n.w/2) : n.kind==='round' ? 2 : 0.8;
  return '<rect x="'+fnum(n.x)+'" y="'+fnum(n.y)+'" width="'+fnum(n.w)+'" height="'+fnum(n.h)
       + '" rx="'+fnum(r)+'" ry="'+fnum(r)+'"'+st+'/>';
}
/* 上下兩段的分隔線。不畫在文字那邊的 div，而是畫在與形狀相同的 SVG 上 */
function flowSplitSVG(n){
  if(!n.t2) return '';
  const c = flowCol(n), y = fnum(n.y + n.h/2);
  let x1 = n.x, x2 = n.x + n.w;
  if(n.kind==='diamond'){ x1 = n.x + n.w*0.25; x2 = n.x + n.w*0.75; }
  return '<line x1="'+fnum(x1)+'" y1="'+y+'" x2="'+fnum(x2)+'" y2="'+y
       + '" stroke="'+c.line+'" stroke-width="0.3" vector-effect="non-scaling-stroke"/>';
}
function flowEdgeSVG(f, e){
  const a = flowNode(f, e.a), b = flowNode(f, e.b);
  if(!a || !b) return '';
  const ax = a.x+a.w/2, ay = a.y+a.h/2, bx = b.x+b.w/2, by = b.y+b.h/2;
  const p1 = flowClip(a, bx, by), p2 = flowClip(b, ax, ay);
  const ang = Math.atan2(p2[1]-p1[1], p2[0]-p1[0]);
  const s = 2.2;
  const tip = [p2[0], p2[1]];
  const w1 = [p2[0]-s*Math.cos(ang-0.38), p2[1]-s*Math.sin(ang-0.38)];
  const w2 = [p2[0]-s*Math.cos(ang+0.38), p2[1]-s*Math.sin(ang+0.38)];
  const ex = p2[0]-s*0.8*Math.cos(ang), ey = p2[1]-s*0.8*Math.sin(ang);
  const col = '#a8331f';
  let out = '<line x1="'+fnum(p1[0])+'" y1="'+fnum(p1[1])+'" x2="'+fnum(ex)+'" y2="'+fnum(ey)
    + '" stroke="'+col+'" stroke-width="0.4" vector-effect="non-scaling-stroke"/>'
    + '<polygon points="'+[tip,w1,w2].map(p=>fnum(p[0])+','+fnum(p[1])).join(' ')+'" fill="'+col+'"/>';
  if(String(e.lb||'').trim()){
    const mx = (p1[0]+p2[0])/2, my = (p1[1]+p2[1])/2;
    out += '<text x="'+fnum(mx)+'" y="'+fnum(my-0.8)+'" text-anchor="middle" class="fwe-t">'
         + esc(e.lb)+'</text>';
  }
  return out;
}
function flowHTML(b, edit){
  const f = ensureFlow(b);
  if(!f.nodes.length)
    return '<div class="fw-empty">'+T('flow.empty')+'</div>';
  const W = f.w, H = f.h;
  const svg = '<svg class="fwsvg" viewBox="0 0 '+fnum(W)+' '+fnum(H)+'" xmlns="http://www.w3.org/2000/svg">'
    + f.edges.map(e=>flowEdgeSVG(f,e)).join('')
    + f.nodes.map(n=>flowShapeSVG(n)+flowSplitSVG(n)).join('')
    + '</svg>';
  const txt = f.nodes.map(n=>{
    const c = flowCol(n);
    return '<div class="fwn'+(n.t2?' two':'')+' k-'+n.kind+'"'
      + (edit?' data-fnode="'+n.id+'"':'')
      + ' style="left:'+fnum(n.x)+'mm;top:'+fnum(n.y)+'mm;width:'+fnum(n.w)+'mm;height:'+fnum(n.h)
      + 'mm;padding:'+fnum(n.pad)+'mm;--fwl:'+c.line+'">'
      + '<div class="fwn-a">'+rubyHTML(n.t)+'</div>'
      + (n.t2 ? '<div class="fwn-b">'+rubyHTML(n.t2)+'</div>' : '')
      + '</div>';
  }).join('');
  return '<div class="fwc" style="width:'+fnum(W)+'mm;height:'+fnum(H)+'mm">'+svg+txt+'</div>';
}
/* 舊原稿的圖片沒有長寬比。在能顯示時記住一次，
   讓閃避框的高度算得出來（記住之後重新排版） */
function noteImgRatio(id, im){
  const f = findBlock(id); if(!f || f.b.type!=='image') return;
  if(+f.b.ar > 0 || !im.naturalWidth) return;
  f.b.ar = im.naturalHeight / im.naturalWidth;
  save(); repaginateSoon();
}
/* 圖片的大小不以所在欄的寬度為準，而以紙面為準。
   以欄寬為準的話，單欄與雙欄、全寬與欄內的實際大小就會不同。
   行內與左右繞排以「版心（內文的寬度）」為準，自由配置以紙張的角為準，所以用「紙張寬度」。 */
function pageBodyWmm(){ return Math.max(20, 210 - (+S.padH||16)*2); }
function imgWmm(b){
  const pct = Math.max(1, Math.min(100, +b.w || (isFreeImg(b)?40:70)));
  return (isFreeImg(b) ? 210 : pageBodyWmm()) * pct / 100;
}
function imageInnerHTML(b){
  if(!b.img) return '<div class="t-imgph">'+T('img.unset')+'</div>';
  /* 外框本身有寬度的配置方式（左右繞排・自由配置）時，圖片撐滿外框 */
  const wst = (b.pos==='left'||b.pos==='right'||b.pos==='free'||b.fl==='l'||b.fl==='r')
    ? 'width:100%' : 'width:'+fnum(imgWmm(b))+'mm;max-width:100%';
  /* alt 是屬性，所以維持純文字。看得到的說明則套用注音 */
  return '<img src="'+b.img+'" style="'+wst+'" alt="'+esc(rubyPlain(b.cap||''))+'">'
       + (String(b.cap||'').trim() ? '<div class="t-imgcap">'+rubyHTML(b.cap)+'</div>' : '');
}
/* 圖片太大會無法儲存，所以先縮到長邊 1600px 再匯入 */
function readImageFile(file, cb){
  const fr = new FileReader();
  fr.onload = ()=>{
    const im = new Image();
    im.onload = ()=>{
      const ar = im.naturalWidth ? (im.naturalHeight/im.naturalWidth) : 0;
      const MAX=1600;
      let w=im.naturalWidth, h=im.naturalHeight;
      if(Math.max(w,h)>MAX){ const r=MAX/Math.max(w,h); w=Math.round(w*r); h=Math.round(h*r); }
      try{
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        c.getContext('2d').drawImage(im,0,0,w,h);
        const png = /png|gif|webp|svg/i.test(file.type);
        cb(c.toDataURL(png?'image/png':'image/jpeg', .85), ar);
      }catch(_){ cb(fr.result, ar); }   // 無法轉換的格式就直接使用
    };
    im.onerror = ()=>cb(fr.result, 0);
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}
/* 以換頁區塊分隔，每一段都從新的一頁開始排 */
/* 替放在頁首的區塊加上標記。沒有高度的換欄等會跳過。
   在量測溢出之前加上，所以去掉間距的結果也會反映在換頁上。 */
function markPageTop(body){
  for(const el of body.children){
    if(el.classList.contains('p-colbr')) continue;
    el.classList.add('pagetop');
    return;
  }
}
/* 自由配置的圖片不放進文章流程，而當成「直接放在該頁上的東西」處理。
   不影響段落的排列，所以增寫內文也不會跑掉。 */
function isFreeImg(b){ return b.type==='image' && b.pos==='free'; }
/* 自由配置的圖片是 position:absolute，所以原本文字完全不會避開。
   為了呈現接近 Word「矩形」的效果，在內文最前面插入「隱形的浮動框」，
   讓圖片矩形範圍內的行變短。浮動框是 float，所以
   圖片上方的行維持全寬，只有碰到圖片的行會避開。
   能跨越多個段落生效，正是 float 本身的性質。
   高度由圖片的長寬比算出（讀取時已記住 b.ar）。 */
const FREE_GAP = 3;                                       // 圖片與文字之間的距離（mm）
function freeShapeHTML(b, pageCols){
  if(String(b.wrap||'square')==='none') return '';
  const ar = +b.ar||0; if(!ar) return '';                 // 還不知道長寬比時什麼都不做
  const pw = 210, w = imgWmm(b);          // 與實際繪製的寬度用相同算法
  const h  = w * ar;
  const x0 = +b.fx||0, y0 = +b.fy||0;
  const cl = S.padH, cr = pw - S.padH;                    // 內文的左右
  if(x0 + w <= cl || x0 >= cr) return '';                 // 在版心之外的話，文字不需要避開
  /* 雙欄時浮動框只會進到第一欄，會破壞欄的流動，所以不套用 */
  if(pageCols===2) return '';
  const mid = (cl + cr) / 2;
  const useLeft = (x0 + w/2) <= mid;
  const sw = useLeft ? (Math.min(cr, x0 + w) - cl + FREE_GAP)
                     : (cr - Math.max(cl, x0) + FREE_GAP);
  if(sw <= 0) return '';
  /* 上端的讓位不用 margin，而用 shape-outside 的 inset 做出來。
     float 的排除區域是「margin box」，用 margin-top 往下推的話，
     連圖片上方的行也會避開。用 inset 就只切掉上面那一段。 */
  const top = Math.max(0, y0 - S.padV - FREE_GAP/2);
  const sh  = top + h + FREE_GAP;
  return '<div class="imgshape" aria-hidden="true" style="float:'+(useLeft?'left':'right')
    + ';width:'+sw.toFixed(2)+'mm;height:'+sh.toFixed(2)+'mm'
    + ';shape-outside:inset('+top.toFixed(2)+'mm 0 0 0)"></div>';
}
function freeImgs(pi){ return S.blocks.filter(b=>isFreeImg(b) && (Math.max(1,+b.pg||1)-1)===pi); }
function sections(){
  const out=[[]];
  S.blocks.forEach(b=>{
    if(isFreeImg(b)) return;                     // 不放進流程
    if(isOnlyPopup(b)) return;                   // 只從儲存格指向的彈出視窗
    if(b.type==='break'){ out.push([]); return; }
    out[out.length-1].push(b);
  });
  return out;
}
function makePage(i){
  const st = pageSetting(i);
  const cls = st.bg.preset==='none' ? '' : st.bg.preset;
  const box = document.createElement('div');
  box.className='pagebox'; box.dataset.pi=i;
  const img = st.bg.img
    ? '<div class="page-img" style="background-image:url('+st.bg.img+');opacity:'+(st.bg.opa/100)
      +';background-size:'+(st.bg.fit==='repeat'?'auto':st.bg.fit)+';background-repeat:'+(st.bg.fit==='repeat'?'repeat':'no-repeat')+'"></div>'
    : '';
  box.innerHTML =
    '<div class="pagehead"><span class="num">P.'+(i+1)+'</span>'
    + '<label><input type="checkbox" class="pgsel" data-pi="'+i+'"'+(pgSel.has(st.id)?' checked':'')+'> '+T('page.select')+'</label>'
    + '<span class="sp"></span><span>'+(st.cols===2?T('page.cols2'):T('page.cols1'))+'</span>'
    + '<button data-pcol="'+i+'">'+T('page.toggleCols')+'</button></div>'
    + '<div class="page pv '+cls+'" data-pi="'+i+'">'
      + '<div class="page-bg '+cls+'"></div>'+img
      + '<div class="page-body'+(st.cols===2?' cols2':'')+'" style="padding:'+S.padV+'mm '+S.padH+'mm;font-size:'+S.base+'pt"></div>'
      + footHTML(i)
    + '</div>';
  return {box:box, body:box.querySelector('.page-body')};
}
/* 回傳內容超出頁面版心的第一個位置。
   雙欄時不是往下而是往右超出，所以右端與下端兩邊都要看。
   座標用 offsetLeft/offsetTop 等「不受縮放影響的值」量測。
   getBoundingClientRect 會包含 #stage 的 scale（而且是轉場途中的值），所以不用。 */
function firstOverflow(body){
  const cs = getComputedStyle(body), cr = body.getBoundingClientRect();
  /* 實際量出 #stage 的縮放率，讓 padding 對上同樣的比例。
     offsetTop/offsetLeft 在雙欄時不會回傳跨欄後的位置，所以不能用；
     getComputedStyle 的 padding 是原尺寸，直接相減會把版心讀錯。 */
  const scale = body.offsetWidth ? (cr.width / body.offsetWidth) : 1;
  const right  = cr.right  - parseFloat(cs.paddingRight)  * scale + 1;
  const bottom = cr.bottom - parseFloat(cs.paddingBottom) * scale + 1;
  const kids = body.children;
  for(let i=0;i<kids.length;i++){
    if(kids[i].classList.contains('free')) continue;   // 自由配置在流程之外
    const r = kids[i].getBoundingClientRect();
    if(r.right > right || r.bottom > bottom) return i;
  }
  return -1;
}
function paginate(){
  const scrollY = document.getElementById('canvasWrap').scrollTop;
  stage.innerHTML='';
  pageMap = [];
  let pi = 0;
  sections().forEach((secBlocks, si)=>{
    let rest = secBlocks.slice();
    if(!rest.length && si>0) rest = [];
    do{
      const {box, body} = makePage(pi);
      stage.appendChild(box);
      rest.forEach((b,bi)=>body.appendChild(blockEl(b, pageSetting(pi).cols, bi?rest[bi-1].type:null)));
      markPageTop(body);
      let k = firstOverflow(body);
      if(k === 0) k = 1;                       // 一個都放不下時，硬是放一個（防止無窮迴圈）
      const placed = (k<0) ? rest.length : k;
      for(let i=body.children.length-1; i>=placed; i--) body.children[i].remove();
      pageMap[pi] = rest.slice(0,placed).map(b=>b.id);
      rest = rest.slice(placed);
      pi++;
    } while(rest.length);
  });
  if(S.pages.length > pi) S.pages.length = Math.max(1, pi);
  /* 把直接放在頁面上的圖片，放進各自的頁面。
     讓文字避開的浮動框，不放在內文最前面就不會生效 */
  [...stage.querySelectorAll('.page-body')].forEach((bd,i)=>{
    const cols = pageSetting(i).cols;
    const shapes = freeImgs(i).map(b=>freeShapeHTML(b, cols)).join('');
    if(shapes) bd.insertAdjacentHTML('afterbegin', shapes);
    freeImgs(i).forEach(b=>bd.appendChild(blockEl(b, cols, null)));
  });
  /* 頁尾會用到總頁數，所以等分頁完成後再重新放入 */
  [...stage.querySelectorAll('.page')].forEach((pel,i)=>{
    const old = pel.querySelector('.pgnum'); if(old) old.remove();
    const h = footHTML(i); if(h) pel.insertAdjacentHTML('beforeend', h);
  });
  // 反映選取的外觀
  stage.querySelectorAll('.blk').forEach(el=>{
    const on = sel.has(el.dataset.id);
    el.classList.toggle('pick', on);
    const w = el.parentElement;
    if(w && w.classList.contains('blkpad')) w.classList.toggle('pickwrap', on);
  });
  applyZoom();
  /* 替放不進頁面的 NPC 卡加上標記（等縮放率確定後再量） */
  requestAnimationFrame(()=>{
    S.blocks.forEach(b=>{
      if(b.type!=='npc') return;
      const el = stage.querySelector('.blk[data-id="'+b.id+'"]');
      if(el) el.classList.toggle('npc-over', npcOverflows(b.id));
    });
  });
  buildAppendix();
  document.getElementById('canvasWrap').scrollTop = scrollY;
}
const MM = 96/25.4;
const PAGE_W = 210*MM;
let curZoom = 1;
function fitZoom(){
  const wrap = document.getElementById('canvasWrap');
  const cs = getComputedStyle(wrap);
  const avail = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  return Math.max(.15, Math.min(2, avail / PAGE_W));
}
/* 為了放大後也能捲到紙面左端，讓外側的框擁有「放大後的尺寸」。
   只用 transform 的話框的大小不變，往左超出的部分就捲不回來。 */
function applyZoom(keep){
  const wrap = document.getElementById('canvasWrap');
  const box  = document.getElementById('stageBox');
  const z = zoomMode==='fit' ? fitZoom() : Math.max(.15, Math.min(3, parseFloat(zoomMode)||1));
  const prev = curZoom;
  curZoom = z;
  stage.style.transform = 'none';
  box.style.width='auto'; box.style.height='auto';
  const h = stage.offsetHeight;
  stage.style.transform = 'scale('+z+')';
  box.style.width  = Math.ceil(PAGE_W*z)+'px';
  box.style.height = Math.ceil(h*z)+'px';
  stage.style.setProperty('--iz', (1/z).toFixed(4));
  const zv = document.getElementById('zoomVal');
  if(zv){ zv.textContent = Math.round(z*100)+'%'; zv.classList.toggle('on', zoomMode==='fit'); }
  /* 把原本在指標下方的位置，在放大後也留在同一處 */
  if(keep && prev){
    const r = z/prev;
    wrap.scrollLeft = (wrap.scrollLeft + keep.x)*r - keep.x;
    wrap.scrollTop  = (wrap.scrollTop  + keep.y)*r - keep.y;
  }
}
const ZOOM_STEPS = [.25,.35,.5,.65,.8,1,1.25,1.5,2,2.5,3];
function stepZoom(dir, keep){
  const z = curZoom;
  let n = dir>0 ? ZOOM_STEPS.find(v=>v>z+.001) : [...ZOOM_STEPS].reverse().find(v=>v<z-.001);
  if(n==null) return;
  zoomMode = String(n); applyZoom(keep);
}

/* ================= 左側：內文文字 ================= */
const srcList = document.getElementById('srcList');
/* 文章欄有兩個：左側面板（#srcList），以及彈出視窗裡的（#popSrc）。
   兩者內容結構相同，所以接線・搜尋・上色都對兩邊生效 */
const popSrcEl = () => document.getElementById('popSrc');
function srcOn(type, fn, opt){
  srcList.addEventListener(type, fn, opt);
  const p = popSrcEl(); if(p) p.addEventListener(type, fn, opt);
}
/* 彈出視窗開著的話就先找那邊（以目前在看的欄為優先） */
function srcQ(sel){
  const p = popSrcEl();
  if(p && p.offsetParent) { const e = p.querySelector(sel); if(e) return e; }
  return srcList.querySelector(sel);
}
function srcAll(sel){
  const p = popSrcEl();
  return [...srcList.querySelectorAll(sel)].concat(p ? [...p.querySelectorAll(sel)] : []);
}
function inSrcPane(el){ return !!(el && el.closest && el.closest('#srcList,#popSrc')); }
/* 彈出視窗裡的段落，會同時出現在左側面板的「文字」與彈出視窗的「文字」
   兩邊。在其中一邊打字時，若重新排版會找不到正在打字的位置，
   所以只替換另一邊同一行的文字。
   傳入 ts 就對齊表格儲存格的欄（data-tsrc），沒傳就對齊段落的欄 */
let srcDirty = false;
function mirrorSrcText(id, txt, ts, from){
  if(!id) return;
  const q = '.srctext[data-id="'+id+'"]'
          + (ts!=null ? '[data-tsrc="'+ts+'"]' : ':not([data-tsrc])');
  const v = String(txt==null?'':txt);
  srcAll(q).forEach(x=>{ if(x!==from && x.textContent!==v) x.textContent = v; });
}
/* 彈出視窗以區塊保存內容的話，也接著把那些內容排出來。
   這樣彈出視窗裡的文章也能照以前一樣在這裡書寫 */
function srcRowsHTML(list){
  return (list||[]).map(b=>{
    let h = srcRowHTML(b);
    const sub = popListOf(b);
    if(sub) h += '<div class="srcpop">'
      + '<div class="srcpophd">'+T('src.popContent', esc(String((b.pop||{}).label||T('pop.defaultLabel'))))+'</div>'
      + (sub.length ? srcRowsHTML(sub) : '<div class="srcpopempty">'+T('src.popEmpty')+'</div>')
      + '</div>';
    if(b.type==='table') h += srcTableRowsHTML(b);
    return h;
  }).join('');
}
/* 把表格的內容排到文字欄。
   原本只能在紙面（預覽）上輸入的儲存格文字，這裡也能輸入。
   放進儲存格的區塊，緊接著排在該儲存格文字的下方 */
function srcTableRowsHTML(b){
  const t = ensureTable(b);
  let h = '<div class="srcpop"><div class="srcpophd">'+T('src.tableContent')+'</div>';
  h += srcCellRowHTML(b.id, 'name', T('tbl.name'), String(t.name||''), T('src.noName'), ' st-cellname');
  const R=tblRows(t), C=tblCols(t);
  for(let ri=0; ri<R; ri++) for(let ci=0; ci<C; ci++){
    /* 第一列當標題的表格，改用看得出來的稱呼 */
    const lb = (ri===0 && t.head) ? T('src.headCol', ci+1) : T('src.cell', ri+1, ci+1);
    h += '<div class="srccellhd">'+esc(lb)+'</div>'
       + '<div class="srcpop srccellblk">'+srcRowsHTML(cellBlocks(t,ri,ci,true))+'</div>';
  }
  return h + '</div>';
}
function srcCellRowHTML(id, key, label, val, ph, cls){
  return '<div class="srccell" data-tsrc="'+key+'" data-tid="'+id+'">'
    + '<div class="srccelll">'+esc(label)+'</div>'
    + '<div class="srctext st-cell'+cls+'" data-id="'+id+'" data-tsrc="'+key+'"'
    + ' data-ph="'+ph+'" contenteditable="true" spellcheck="false">'+esc(val)+'</div></div>';
}
/* 文字欄中的該欄若是「表格內容」的欄，就回傳讀寫的介面。
   為了寫回表格內容而不是段落的 text，要經過這裡 */
function tsrcOf(el){
  if(!el || !el.dataset || el.dataset.tsrc==null) return null;
  const f = findBlock(el.dataset.id); if(!f || f.b.type!=='table') return null;
  const t = ensureTable(f.b), k = el.dataset.tsrc;
  /* 儲存格的內容已經改成段落串列，所以這裡只處理表格名稱 */
  if(k!=='name') return null;
  return {b:f.b, t:t, name:true,
    get:()=>String(t.name||''), set:v=>{ t.name = String(v==null?'':v); }};
}
/* 目前游標所在的欄若是「表格內容」的欄，就回傳那個介面 */
function tsrcFocus(){
  const s0=getSelection(); const node=s0 && s0.anchorNode;
  const host=node && (node.nodeType===1?node:node.parentElement);
  const box=host && host.closest && host.closest('.srctext[data-tsrc]');
  return box ? tsrcOf(box) : null;
}
function srcRowHTML(b){
  {
    const editable = !['npc','toc','break','colbr','table','popup'].includes(b.type);
    const ph = b.type==='break' ? '' : T('blk.emptyPh');
    let inner;
    if(b.type==='break')      inner = '<div class="srctext st-break" data-id="'+b.id+'">'+T('src.break')+'</div>';
    else if(b.type==='colbr') inner = '<div class="srctext st-break" data-id="'+b.id+'">'+T('src.colbr')+'</div>';
    else if(b.type==='npc')   inner = '<div class="srctext st-npc" data-id="'+b.id+'">'+T('src.npc')+esc(npcLabel(b))+'</div>';
    else if(b.type==='toc')   inner = '<div class="srctext st-toc" data-id="'+b.id+'">'+T('src.toc')+'</div>';
    else if(b.type==='table')  inner = '<div class="srctext st-toc" data-id="'+b.id+'">'+T('src.table')
        + esc(String((b.tbl||{}).name||'').trim()||T('src.noName'))
        + '<span style="color:var(--muted)">　'+T('src.rowsCols', tblRows(ensureTable(b)), tblCols(ensureTable(b)))+'</span></div>';
    else if(b.type==='popup')  inner = '<div class="srctext st-toc" data-id="'+b.id+'">'+T('src.popup')
        + esc(String((b.pop||{}).label||T('pop.defaultLabel')))
        + (isOnlyPopup(b)?'<span style="color:var(--muted)">　'+T('src.popOnly')+'</span>':'') + '</div>';
    else if(isFreeImg(b)) inner = '<div class="srctext st-image" data-id="'+b.id+'">'
        + (b.img?'<img class="srcthumb" src="'+b.img+'" alt="">':T('src.imgUnset'))
        + '<span>P.'+Math.max(1,+b.pg||1)+'　'+T('src.freeImg')+'</span></div>';
    else if(b.type==='image') inner = '<div class="srctext st-image" data-id="'+b.id+'">'
        + (b.img?'<img class="srcthumb" src="'+b.img+'" alt="">':T('src.imgUnset'))
        + '<span>'+esc(String(b.cap||'').trim()||T('src.noCaption'))+'</span></div>';
    else inner = '<div class="srctext st-'+b.type+'" data-id="'+b.id+'" data-ph="'+ph+'"'
        + (editable?' contenteditable="true" spellcheck="false"':'') + '>'+esc(b.text)+'</div>';
    return '<div class="src'+(sel.has(b.id)?' pick':'')+(editingId===b.id?' editing':'')
      + (b.ind?' i'+Math.min(4,b.ind):'')+'" data-id="'+b.id+'" data-type="'+b.type+'">'
      + '<div class="srchandle" title="'+T('src.handleTip')+'">&#10303;</div>'
      + '<div class="srcgut" data-l="'+esc(TYPE_NAME(b.type))+'"'+(b.cols===1?' data-span="'+T('src.span')+'"':'')+'></div>'
      + inner + '</div>';
  }
}
/* ================= 字數 =================
   用來了解「寫了多少」的數字。裝飾用的記號不算進去。
     ・行首的書式記號（■ ※ ＞ ・ 1. □ ＠ #）
     ・表格的記號（|項目|内容| 的直線）
     ・注音的記號（｜本文字《讀音》→ 只算本文字）
     ・換行與空白
   計算的是內文與表格的內容。頁碼或設定欄不算。 */
function plainCount(txt){
  let t = String(txt||'');
  t = t.replace(/[｜|]([^《]*)《[^》]*》/g, '$1');      // 注音只算本文字
  t = t.split('\n').map(ln=>{
    let l = ln.replace(RICH_HEAD_RE, '');
    if(/^\s*[|｜].*[|｜]\s*$/.test(l)) l = l.replace(/[|｜]/g,' ');
    return l;
  }).join('');
  return t.replace(/\s/g,'').length;
}
function docCharCount(){
  let n = 0;
  const walk = list => list.forEach(b=>{
    if(b.type==='flow'){
      /* 流程圖計算放在圖上的方框文字（b.text 只是當作轉換來源留著） */
      const ff = b.flow;
      if(ff && Array.isArray(ff.nodes))
        ff.nodes.forEach(x=>{ n += plainCount(x.t) + plainCount(x.t2); });
      else n += plainCount(b.text);
    }
    else if(b.type!=='break' && b.type!=='colbr' && b.type!=='toc') n += plainCount(b.text);
    if(b.type==='image') n += plainCount(b.cap);
    if(b.type==='dialog') n += plainCount(b.sp);
    if(b.type==='popup' && b.pop){
      n += plainCount(b.pop.label);
      if(!popIsBlocks(b.pop)) n += plainCount(b.pop.body);
    }
    if(b.type==='table' && b.tbl){
      n += plainCount(b.tbl.name);
    }
    subLists(b).forEach(walk);
  });
  walk(S.blocks);
  return n;
}
let charTimer = null;
function showCharCount(){
  const el = document.getElementById('charCount'); if(!el) return;
  try{ el.textContent = T('count.chars', docCharCount().toLocaleString('ja-JP')); }
  catch(_){ el.textContent = '—'; }
}
function charCountSoon(){
  clearTimeout(charTimer);
  charTimer = setTimeout(showCharCount, 300);
}
/* 把目前的排列，以每頁的區隔輸出 */
function srcPageGroups(){
  const seen = new Set(), groups = [];
  S.blocks.filter(isFreeImg).forEach(b=>seen.add(b.id));
  pageMap.forEach((ids,i)=>{
    const list = ids.map(id=>{ seen.add(id); const f=findBlock(id); return f?f.b:null; }).filter(Boolean);
    groups.push({page:i+1, blocks:list});
  });
  const rest = S.blocks.filter(b=>!seen.has(b.id));   // 換頁等不會出現在紙面上的東西
  if(rest.length) groups.push({page:null, blocks:rest});
  const fi = S.blocks.filter(isFreeImg);
  if(fi.length) groups.push({page:null, label:T('src.freeImg'), blocks:fi});
  return groups;
}
/* 彈出視窗裡的文章欄。只排出開啟中的彈出視窗內容 */
/* force=true 表示「新增／刪除了段落」等排列本身有變化時。
   即使正在打字也要重新排，否則新增的段落不會出現在這個欄裡 */
function renderPopSrc(force){
  const box = popSrcEl(); if(!box) return;
  const f = popId ? findBlock(popId) : null;
  if(!f || f.b.type!=='popup' || !popIsBlocks(f.b.pop)){ box.innerHTML=''; return; }
  if(!force && box.contains(document.activeElement)) return;   // 打字途中不重新排
  box.innerHTML = srcRowsHTML(f.b.pop.blocks);
  box.querySelectorAll('.src').forEach(el=>el.classList.toggle('pick', sel.has(el.dataset.id)));
}
function renderSrc(force){
  renderPopSrc(force);
  srcList.className = 'mode-whole';
  if(srcView==='page' && pageMap.length){
    srcList.innerHTML = srcPageGroups().map(g=>{
      const st = g.page ? (S.pages[g.page-1]||{}) : {};
      const head = g.page
        ? '<div class="srcpage">P.'+g.page+'<span class="cols">'+(st.cols===2?T('page.cols2'):T('page.cols1'))+'</span><span class="ln"></span></div>'
        : '<div class="srcpage">'+(g.label||T('src.offPaper'))+'<span class="ln"></span></div>';
      return head + srcRowsHTML(g.blocks);
    }).join('');
  }else{
    srcList.innerHTML = srcRowsHTML(S.blocks);
  }
  document.getElementById('modeNote').innerHTML = T('src.modeNote')
    + '<button id="modeHelp" title="'+T('src.modeHelp')+'">?</button>';
  const mh=document.getElementById('modeHelp');
  if(mh) mh.onclick=()=>document.getElementById('btnHelp').click();
}
function npcLabel(b){
  const np=b.npc||{}; const nm=String(np.name||'').trim();
  const sys={emoklore:T('sys.short.emoklore'),dx3rd:T('sys.short.dx3rd'),coc:T('sys.short.coc')}[np.sys||'emoklore'];
  return sys+(nm?'：'+nm:'');
}
function render(){ showCharCount(); paginate(); renderSrc(true); buildTOC(); buildBgPages(); syncBlockPanel(); renderProps(); renderNpcModal(); renderPopWin(true);
  /* 流程圖的視窗在復原等造成內容改變時也重畫。
     拖曳途中不重建（會找不到正抓著的東西） */
  if(flowId && !flowDrag && !flowMarquee) renderFlowWin();
  /* 有文字從方框溢出的話，就把高度延伸該份量再重新排版 */
  if(flowGrowAll()) repaginateSoon();
  if(pagesVisible()) buildPages(); }
/* 打字期間只重排頁面那一側（左側保留打好的內容） */
let repagTimer=null, repagPending=false;
function doRepaginate(){
  repagPending=false;
  paginate(); buildTOC(); syncNpcLabels(); showCharCount();
  /* 輸入中重新排版會找不到打字的位置，所以只在沒碰任何地方時才修正。
     讓在紙面或彈出視窗中修改的文字，也同步到左側的文章欄 */
  if(!inSrcPane(document.activeElement)) renderSrc();
  renderPopWin();
  if(pagesVisible()) buildPages();
}
/* 操作 NPC 卡的欄位期間，不重新排頁。
   重新排版會連同紙面的 DOM 整個重建，打字的欄位就會失去焦點。 */
function editingOnPage(){
  const a=document.activeElement;
  const pb=document.getElementById('popBlocks');
  return !!a && (stage.contains(a) || document.getElementById('npcDlgBody').contains(a)
              || (pb && pb.contains(a)));
}
function repaginateSoon(){
  charCountSoon();
  clearTimeout(repagTimer);
  repagTimer=setTimeout(()=>{
    if(editingOnPage()){ repagPending=true; return; }
    doRepaginate();
  }, 260);
}
/* 離開欄位後，執行先前擱著的重新排版 */
addEventListener('focusout', ()=>{
  setTimeout(()=>{
    if(repagPending && !editingOnPage()) doRepaginate();
    /* 在「文字」欄打字後，離開時把兩個欄重新對齊 */
    if(srcDirty && !inSrcPane(document.activeElement)){ srcDirty=false; renderSrc(true); }
  }, 60);
});
/* 在頁面側或面板編輯時，只讓左側清單的標題跟上 */
function syncNpcLabels(){
  S.blocks.forEach(b=>{
    if(b.type==='npc'){
      const el = srcList.querySelector('.src[data-id="'+b.id+'"] .st-npc');
      if(el) el.textContent = T('src.npc')+npcLabel(b);
    }else if(b.type==='image'){
      const el = srcList.querySelector('.src[data-id="'+b.id+'"] .st-image');
      if(el) el.innerHTML = (b.img?'<img class="srcthumb" src="'+b.img+'" alt="">':T('src.imgUnset'))
        + '<span>'+esc(String(b.cap||'').trim()||T('src.noCaption'))+'</span>';
    }
  });
}

/* ---- 輸入 ---- */
/* 只要把游標放進文章裡，就視為選取了該段落。
   讓書式按鈕或縮排直接作用在「正在寫的段落」上。 */
/* 按到段落以外（內文欄的空白處）就取消選取 */
srcOn('mousedown', e=>{
  if(e.button!==0) return;
  if(e.target.closest('.src,.srccell')) return;
  if(sel.size) deselectAll(true);
});
srcOn('focusin', e=>{
  const t = e.target.closest('.srctext[contenteditable="true"]'); if(!t) return;
  const id = t.dataset.id;
  /* 進入儲存格的欄位時，把它當成「最後操作的儲存格」。
     書式按鈕或「在下方新增」的目標就會是該儲存格 */
  const ts0 = tsrcOf(t);
  if(ts0 && !ts0.name) lastCell = {id:ts0.b.id, r:ts0.r, c:ts0.c};
  if(sel.size===1 && sel.has(id)) return;
  sel.clear(); sel.add(id); lastPick=id;
  paintSel(); syncBlockPanel(); jumpPreview(id);
});
/* 離開文章欄時，看看用 ＠名稱 指向的彈出視窗是否還不存在 */
srcOn('focusout', e=>{
  const t = e.target.closest('.srctext[contenteditable="true"]'); if(!t) return;
  setTimeout(()=>makeMissingPopups(t.dataset.id), 0);
});
srcOn('input', e=>{
  const t = e.target.closest('.srctext'); if(!t) return;
  /* /komidashi 這樣的指令，在這裡變成記號（變換後會再來一次輸入事件） */
  if(slashFire(t, e)) return;
  srcDirty = true;
  /* 表格內容的欄，不寫回段落的內文，而是寫回表格的內容 */
  const ts = tsrcOf(t);
  if(ts){
    const v = t.innerText.replace(/\n+$/,'');
    ts.set(v);
    mirrorSrcText(t.dataset.id, v, t.dataset.tsrc, t);
    repaginateSoon(); save(); return;
  }
  const f = findBlock(t.dataset.id); if(!f) return;
  setBlockText(f.b, t.innerText.replace(/\n$/,''));
  mirrorSrcText(f.b.id, f.b.text, null, t);
  repaginateSoon(); save();
});
srcOn('paste', e=>{
  const t = e.target.closest('.srctext[contenteditable=true]'); if(!t) return;
  e.preventDefault();
  const raw = (e.clipboardData||window.clipboardData).getData('text/plain').replace(/\r\n?/g,'\n');
  /* 表格內容的欄不分段，直接放入 */
  if(tsrcOf(t)){ document.execCommand('insertText', false, raw); return; }
  const parts = raw.split(/\n\s*\n+/).map(x=>x.trim()).filter(Boolean);
  const f = findBlock(t.dataset.id); if(!f) return;
  if(parts.length<=1){ document.execCommand('insertText', false, raw); return; }
  /* 貼上以空行分隔的文章時，逐段拆成區塊匯入 */
  const made = parts.map(p=>{
    const [ty, txt, tpl] = guessType(p.split('\n')[0]);
    const rest = p.split('\n').slice(1).join('\n');
    const nb = newBlock(ty, rest ? txt+'\n'+rest : txt);
    if(tpl) applyBxTpl(nb, tpl);
    return nb;
  });
  if(!String(f.b.text||'').trim()){ f.list.splice(f.i,1,...made); }
  else { f.list.splice(f.i+1,0,...made); }
  render(); save();
  setStatus(T('status.pastedParas', made.length),'var(--ok)');
});
function guessType(line){
  const t=String(line||'').trim();
  if(/^###\s/.test(t)) return ['h3', t.replace(/^###\s*/,'')];
  if(/^##\s/.test(t))  return ['h2', t.replace(/^##\s*/,'')];
  if(/^#\s/.test(t))   return ['h1', t.replace(/^#\s*/,'')];
  if(/^[「『]/.test(t)) return ['dialog', t];
  if(/^[※＊*]/.test(t)) return ['note', t.replace(/^[※＊*]\s*/,'')];
  if(/^【?(技能判定|判定)】?/.test(t)) return ['proc', t.replace(/^【?(技能判定|判定)】?[：:\s]*/,''), 'skill'];
  if(/^【?特殊ルール】?/.test(t)) return ['proc', t.replace(/^【?特殊ルール】?[：:\s]*/,''), 'rule'];
  if(/[〈《]\S+[〉》].*(成功|失敗|ロール|判定)/.test(t)) return ['proc', t, 'skill'];
  if(/^[（(【\[]?(シーン|場面)/.test(t) || /(へ|に)(移行|移動|続く)[。．]?$/.test(t)) return ['scene', t];
  return ['desc', t];
}
/* 在假名漢字轉換（輸入法選字）途中按的 Enter 是「確定選字」，
   不是分段的訊號。不分辨清楚的話，會多出一個
   內容與確定文字相同的段落（在 macOS 上特別明顯）。
   有些瀏覽器在確定之後會再送一次 keydown，
   所以確定後的一小段時間也先略過。 */
let imeUntil = 0;
addEventListener('compositionstart', ()=>{ imeUntil = Infinity; }, true);
addEventListener('compositionend',   ()=>{ imeUntil = Date.now() + 60; }, true);
function imeBusy(e){
  if(e && (e.isComposing || e.keyCode===229)) return true;
  return Date.now() < imeUntil;
}
function caretOffset(el){
  const s=getSelection(); if(!s.rangeCount) return 0;
  const r=s.getRangeAt(0), pre=r.cloneRange();
  pre.selectNodeContents(el); pre.setEnd(r.endContainer,r.endOffset);
  return pre.toString().length;
}
function focusSrc(id, atEnd, caretAt){
  const el = srcQ('.srctext[data-id="'+id+'"]'); if(!el) return;
  el.focus();
  const r=document.createRange();
  if(caretAt!=null && putCaret(el, r, caretAt)){ /* 回到原本的位置 */ }
  else { r.selectNodeContents(el); r.collapse(!atEnd); }
  const s=getSelection(); s.removeAllRanges(); s.addRange(r);
  el.scrollIntoView({block:'nearest'});
}
/* 把游標放回以字數計算的位置 */
function putCaret(el, r, n){
  let left=n;
  const walk=document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while((node=walk.nextNode())){
    if(left<=node.length){ r.setStart(node,left); r.collapse(true); return true; }
    left-=node.length;
  }
  return false;
}
/* ================= 守住打字的位置 =================
   按下左側面板或右側設定欄的按鈕時，也不離開正在打字的地方。
   若按下時焦點被搶走，每次都得重新選取段落，手就會停下來。 */
let editSpot = null;
function noteEditSpot(){
  const a = document.activeElement;
  const h = (a && a.closest) ? a.closest('[data-btext],.srctext[data-id]') : null;
  if(!h){ editSpot = null; return; }
  editSpot = {
    id:  h.dataset.btext || h.dataset.id,
    ts:  (h.dataset.tsrc != null) ? h.dataset.tsrc : null,
    off: caretOffset(h),
    root:(h.closest('#stage,#popBlocks,#npcDlgBody')||{}).id || null,
    src: h.classList.contains('srctext')
  };
}
function restoreEditSpot(){
  const sp = editSpot; if(!sp) return false;
  /* 若已經進到某個文字欄裡，就尊重那邊
     （建立新段落的按鈕等，會自己決定要去哪裡） */
  const a = document.activeElement;
  if(a && a.closest && a.closest('[data-btext],.srctext[data-id]')) return false;
  let el = null;
  if(sp.src){
    el = srcQ('.srctext[data-id="'+sp.id+'"]'
            + (sp.ts!=null ? '[data-tsrc="'+sp.ts+'"]' : ':not([data-tsrc])'));
  }else{
    const root = sp.root ? document.getElementById(sp.root) : null;
    el = (root ? root.querySelector('[data-btext="'+sp.id+'"]') : null)
      || document.querySelector('[data-btext="'+sp.id+'"]');
  }
  if(!el) return false;
  el.focus();
  const r = document.createRange();
  if(!putCaret(el, r, sp.off)){ r.selectNodeContents(el); r.collapse(false); }
  const s0 = getSelection(); s0.removeAllRanges(); s0.addRange(r);
  return true;
}
['side','propPane','popProp'].forEach(id=>{
  const box = document.getElementById(id); if(!box) return;
  box.addEventListener('mousedown', e=>{
    if(!e.target.closest('button')) return;
    noteEditSpot();
    if(editSpot) e.preventDefault();       // 不讓焦點被搶走
  }, true);
  box.addEventListener('click', e=>{
    if(!e.target.closest('button')) return;
    if(editSpot) setTimeout(restoreEditSpot, 0);
  });
});
/* Tab 縮排，Shift+Tab 退回。打字途中或選取段落時都有效。
   在輸入文字的欄位中不使用 Tab 原本的功能（移到下一欄），所以改用在這裡。 */
srcOn('keydown', e=>{
  if(e.key!=='Tab') return;
  if(imeBusy(e)) return;
  const box = e.target.closest('.srctext');
  /* 在表格內容的欄中，Tab 不是縮排而是移到下一格（與紙面上儲存格的規則相同） */
  if(box && box.dataset.tsrc!=null && tsrcOf(box)){
    e.preventDefault();
    const pane = box.closest('#srcList,#popSrc') || document;
    const all = [...pane.querySelectorAll('.srctext[data-tsrc]')]
                  .filter(x=>x.dataset.id===box.dataset.id);
    const i = all.indexOf(box); if(i<0) return;
    const nx = all[i+(e.shiftKey?-1:1)]; if(!nx) return;
    nx.focus();
    const r0=document.createRange(); r0.selectNodeContents(nx); r0.collapse(false);
    const s0=getSelection(); s0.removeAllRanges(); s0.addRange(r0);
    return;
  }
  if(box){
    const id = box.dataset.id;
    if(!sel.has(id)){ sel.clear(); sel.add(id); paintSel(); }
  }
  if(!sel.size) return;
  e.preventDefault();
  const keep = document.activeElement && document.activeElement.dataset
             ? document.activeElement.dataset.id : null;
  const off = keepCaret();
  setIndent(e.shiftKey?-1:1, true);
  if(keep) focusSrc(keep, false, off);
}, true);
function keepCaret(){
  const s0=getSelection();
  if(!s0 || !s0.rangeCount) return null;
  const a=s0.anchorNode; if(!a) return null;
  const box=(a.nodeType===1?a:a.parentElement).closest('.srctext');
  if(!box) return null;
  const r=s0.getRangeAt(0).cloneRange();
  r.selectNodeContents(box); r.setEnd(s0.anchorNode, s0.anchorOffset);
  return r.toString().length;
}
srcOn('keydown', e=>{
  if(imeBusy(e)) return;
  const t = e.target.closest('.srctext[contenteditable=true]'); if(!t) return;
  /* 表格名稱的欄。Enter 與 Esc 表示結束輸入（不是分段的訊號） */
  const ts = tsrcOf(t);
  if(ts){
    if(e.key==='Escape'){
      e.preventDefault(); e.__escHandled = true; t.blur();
      editingId=null; sel.clear(); sel.add(ts.b.id); lastPick=ts.b.id;
      render(); return;
    }
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); t.blur(); }
    return;
  }
  const f = findBlock(t.dataset.id); if(!f) return;
  if(e.key==='Escape'){
    /* 第 1 次 Esc，會結束文字編輯並變成選取該段落的狀態。
       要取消選取本身，要在那之後再按一次 Esc。 */
    e.preventDefault(); e.__escHandled = true; t.blur();
    editingId=null; sel.clear(); sel.add(f.b.id); lastPick=f.b.id;
    render(); return;
  }
  if(e.key==='Enter' && !e.shiftKey){
    /* 按 Enter 馬上建立下一個段落，可以直接繼續寫 */
    e.preventDefault();
    const off = caretOffset(t), txt = t.innerText.replace(/\n$/,'');
    f.b.text = txt.slice(0,off);
    /* 換行產生的段落一律是描述文。避免標題或框一直延續下去 */
    const nt = 'desc';
    const nb = newBlock(nt, txt.slice(off)); nb.cols = 2;
    f.list.splice(f.i+1,0,nb);
    editingId = nb.id; sel.clear(); sel.add(nb.id);
    render(); focusSrc(nb.id,false); save(); return;
  }
  if(e.key==='Backspace' && caretOffset(t)===0){
    /* 空段落直接刪除。第一個段落也要能刪
       （彈出視窗裡沒有「刪除」可按） */
    if(!String(f.b.text||'').trim()){
      /* 紙面的內文會留下最後一個（避免紙面變空）。
         儲存格或彈出視窗裡可以是空的，所以最後一個也能刪 */
      if(f.list.length<=1 && f.list===S.blocks){
        setStatus(T('status.cantDelLast'),'#ff9b83'); return; }
      e.preventDefault();
      const own = cellOwnerOf(f.list);
      const nb = f.list[f.i-1] || f.list[f.i+1];
      f.list.splice(f.i,1);
      sel.clear(); if(nb) sel.add(nb.id);
      editingId = nb ? nb.id : null;
      render(); save();
      if(nb) focusSrc(nb.id, true);
      else focusCellText(own, null);
      setStatus(T('status.paraDeleted'),'var(--ok)');
      return;
    }
    if(f.i<=0) return;
    const prev = f.list[f.i-1];
    if(prev.type==='npc'||prev.type==='toc'||prev.type==='break') return;
    e.preventDefault();
    const cut = prev.text.length;
    prev.text += f.b.text;
    f.list.splice(f.i,1);
    editingId = prev.id; sel.clear(); sel.add(prev.id);
    render();
    const pel = srcQ('.srctext[data-id="'+prev.id+'"]');
    if(pel){ pel.focus(); try{
      const r=document.createRange(), tn=pel.firstChild||pel;
      r.setStart(tn, Math.min(cut, tn.length!=null?tn.length:0)); r.collapse(true);
      const s=getSelection(); s.removeAllRanges(); s.addRange(r);
    }catch(_){}}
    save();
  }
});

/* 用 Backspace / Delete 刪除選取中的區塊。打字時不作用 */
addEventListener('keydown', e=>{
  if(e.key!=='Backspace' && e.key!=='Delete') return;
  if(imeBusy(e)) return;
  const a=document.activeElement;
  if(a && (a.isContentEditable || a.tagName==='INPUT' || a.tagName==='TEXTAREA' || a.tagName==='SELECT')) return;
  /* 開著流程圖視窗時，刪除的是那個視窗裡的東西。
     不動紙面的段落（＝流程圖本身）。
     以免以為在操作視窗，結果紙面的段落被刪掉 */
  if(flowId && document.getElementById('flowDlg').style.display==='flex'){
    e.preventDefault(); flowDeleteSel(); return;
  }
  if(!sel.size || editingId) return;
  if(document.querySelector('#prjDlg[style*="flex"],#helpDlg[style*="flex"],#npcDlg[style*="flex"],#ccfDlg[style*="flex"],#tblDlg[style*="flex"],#ccfInDlg[style*="flex"],#ytDlg[style*="flex"]')) return;
  e.preventDefault();
  const ids=[...sel];
  const L = selList();
  const at=Math.min.apply(null, ids.map(id=>L.findIndex(b=>b.id===id)).filter(i=>i>=0).concat([L.length]));
  blockLists().forEach(l=>{ for(let i=l.length-1;i>=0;i--) if(sel.has(l[i].id)) l.splice(i,1); });
  keepNotEmpty();
  sel.clear();
  const next = L[Math.min(at, L.length-1)];
  if(next){ sel.add(next.id); lastPick=next.id; }
  render(); save();
  setStatus(T('status.parasDeleted', ids.length),'var(--ok)');
});

/* ---- 選取（點擊／拖曳範圍／雙擊編輯） ---- */
let dragging=false, dragFrom=null, srcMarquee=null;

/* ================= 從空白處框選，以及拖曳移動 =================
   從頁面的空白處拖曳，可以把框到的段落一起選取。
   抓住選取的段落拖動，可以移到包含其他頁面在內的任何位置。 */
let marquee=null, moveDrag=null;
function ensureOverlay(){
  let ov=document.getElementById('dragOverlay');
  if(!ov){ ov=document.createElement('div'); ov.id='dragOverlay'; document.body.appendChild(ov); }
  return ov;
}
function ensureCaret(){
  let c=document.getElementById('dropCaret');
  if(!c){ c=document.createElement('div'); c.id='dropCaret'; document.body.appendChild(c); }
  return c;
}
/* 把目前畫面上顯示的段落，由上而下排好回傳
   from='stage' 看紙面（預覽），from='src' 看左側的內文清單。
   以抓住的位置為基準，所以在左邊抓就放到左邊的行間，
   在紙面上抓就放到紙面的行間。 */
/* 是否抓住了把手（外框左側的外面） */
/* 段落左側外面的把手帶。寬度會隨紙面的縮放而變，
   所以判斷範圍比實際畫出的帶（6.2mm）稍寬一點 */
function onGrip(el, x){
  if(!el) return false;
  const r = el.getBoundingClientRect();
  return x < r.left && x > r.left - 30;
}
function visibleBlocks(from){
  const root = (from==='pop')    ? document.getElementById('popBlocks')
             : (from==='popsrc') ? document.getElementById('popSrc')
             : (from==='src') ? srcList : stage;
  const q    = (from==='src'||from==='popsrc') ? '.src'
             : (from==='pop') ? '.blkpad[data-id]' : '.blk';
  if(!root) return [];
  return [...root.querySelectorAll(q)].map(el=>({el:el, id:el.dataset.id, r:el.getBoundingClientRect()}))
    .filter(v=>v.id && v.r.height>0);
}
/* 目前指著的是彈出視窗裡面的話，就以那裡為放置目標。
   否則維持抓住位置（紙面或左側文章欄）的基準。 */
/* 指標是否在彈出視窗上（文字欄・紙・設定欄一起看） */
function inPopWin(x, y){
  const w = document.getElementById('popDlg');
  if(!w || w.style.display!=='flex') return false;
  const r = w.getBoundingClientRect();
  return x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
}
function popSeeThru(on){
  const w = document.getElementById('popDlg'); if(!w) return;
  w.classList.toggle('seethru', !!on && w.style.display==='flex');
}
/* 沒在搬運時，依「目前選取的東西」決定。
   沒選取彈出視窗裡的東西，就讓視窗變透明，露出下方的紙面 */
function popSeeThruBySel(){
  const w = document.getElementById('popDlg');
  if(!w || w.style.display!=='flex') return;
  if(moveDrag) return;                    // 搬運途中，依搬運目的地決定
  let inPop = false;
  if(sel.size){
    const f = findBlock([...sel][0]);
    inPop = !!(f && (f.b.id===popId || selInsidePopup(f.b)));
  }
  popSeeThru(!inPop);
}
function dragZone(x, y, from){
  const w = document.getElementById('popDlg');
  if(w && w.style.display==='flex' && popWinList()){
    const inEl = id => { const q=document.getElementById(id);
      if(!q || !q.offsetWidth) return false;
      const r=q.getBoundingClientRect();
      return x>=r.left && x<=r.right && y>=r.top && y<=r.bottom; };
    /* 在視窗的「文字」上，就以該欄的行為基準（與主視窗相同的規則） */
    if(inEl('popSrc')) return 'popsrc';
    if(inEl('popBlockWrap')) return 'pop';
    /* 在標題列或設定欄上，放置目標也設在視窗裡面。
       視窗下面藏著主視窗，放到那邊的話會進到看不見的地方 */
    if(inPopWin(x,y)) return 'pop';
  }
  return (from==='pop'||from==='popsrc') ? 'stage' : from;
}
/* 目前開啟的彈出視窗的內容串列 */
/* 選取的段落是否在目前開啟的彈出視窗裡（含孫層） */
function selInsidePopup(b){
  if(!popId || !b) return false;
  const w = document.getElementById('popDlg');
  if(!w || w.style.display!=='flex') return false;
  const f = findBlock(popId); if(!f || f.b.type!=='popup') return false;
  const lists=[];
  const walk=l=>{ lists.push(l); l.forEach(x=>subLists(x).forEach(walk)); };
  subLists(f.b).forEach(walk);
  const fb = findBlock(b.id);
  return !!fb && lists.indexOf(fb.list)>=0;
}
/* 決定設定欄要放在右側屬性欄還是彈出視窗裡。
   明明在操作彈出視窗裡的段落，設定卻出現在遠遠的右端，會讓人搞不清楚 */
function placeProps(b){
  const box = document.getElementById('propBox');
  const cm  = document.getElementById('blkCommon');
  const inPop = selInsidePopup(b);
  const slot = document.getElementById(inPop ? 'popPropSlot' : 'propSlot');
  const hostR= document.getElementById(inPop ? 'popPropHostR' : 'propHostR');
  if(box.parentElement !== slot) slot.appendChild(box);
  if(cm.parentElement !== hostR) hostR.appendChild(cm);
  const pp = document.getElementById('popProp');
  /* 選取段落就會自動出現。popPropForce 是「沒選取也先顯示出來」的開關 */
  pp.style.display = (inPop || popPropForce) ? 'flex' : 'none';
  if(!inPop && popPropForce)
    document.getElementById('popPropHead').textContent = T('popwin.propHint');
  syncPopBar();
  return inPop;
}
/* 彈出視窗標題列上，顯示／隱藏按鈕的開關外觀 */
let popPropForce = false;
function syncPopBar(){
  const a = document.getElementById('popBtnSide'), b2 = document.getElementById('popBtnProp');
  const sd = document.getElementById('popSide'), pp = document.getElementById('popProp');
  const sc = document.getElementById('popBtnSrc'), sr = document.getElementById('popSrc');
  if(a && sd) a.classList.toggle('on', !sd.classList.contains('hide'));
  if(sc && sr) sc.classList.toggle('on', !sr.classList.contains('hide'));
  if(b2 && pp) b2.classList.toggle('on', pp.style.display!=='none');
}
function popWinList(){
  const f = popId ? findBlock(popId) : null;
  return (f && f.b.type==='popup' && popIsBlocks(f.b.pop)) ? f.b.pop.blocks : null;
}
function nearestBlock(x,y,from){
  const vis=visibleBlocks(from); if(!vis.length) return null;
  let best=null,bestD=Infinity;
  vis.forEach(v=>{
    const cx=Math.max(v.r.left, Math.min(x, v.r.right));
    const cy=Math.max(v.r.top,  Math.min(y, v.r.bottom));
    const d=(cx-x)*(cx-x)+(cy-y)*(cy-y);
    if(d<bestD){ bestD=d; best=v; }
  });
  return best;
}
/* 以「哪個串列的第幾個」回傳放置目標。
   直接以相鄰段落所在的串列作為放置目標 */
/* 指標在表格外框內的話，回傳最近的儲存格。
   儲存格很窄，要求「剛好在儲存格上」的話幾乎放不進去。
   在表格名稱或表格外的空白上會回傳 null，所以也能放到表格的前後 */
function cellSpotAt(x,y){
  /* 在哪個表格的外框內，用「位置」判斷。
     用 elementFromPoint 的話，只要右側屬性欄或其他浮動物件疊在上面
     就會找不到表格（實際上就曾因此發生「金色的線出現了卻放不進儲存格」）。 */
  const inRect = (r) => r.width>0 && r.height>0
    && x>=r.left-2 && x<=r.right+2 && y>=r.top-2 && y<=r.bottom+2;
  const pick = (root) => {
    if(!root) return null;
    let hit=null;
    /* 先看表格外框本身。巢狀的話內側會排在後面 */
    root.querySelectorAll('table.tbl, .tl-box, .cd-wrap').forEach(g=>{
      if(inRect(g.getBoundingClientRect())) hit = g;
    });
    if(hit) return hit;
    /* 即使在外框外，只要在表格區塊裡（標題或空白上），就放進最近的儲存格。
       想放到表格前後時，瞄準段落與段落之間的縫隙 */
    root.querySelectorAll('.blk.t-table').forEach(el=>{
      if(!inRect(el.getBoundingClientRect())) return;
      const g = el.querySelector('table.tbl, .tl-box, .cd-wrap');
      if(g) hit = g;
    });
    return hit;
  };
  /* 彈出視窗在前面時，先看那邊 */
  let grid = null;
  const wrap = document.getElementById('popBlockWrap');
  const dlg  = document.getElementById('popDlg');
  if(dlg && dlg.style.display==='flex' && inPopWin(x,y)){
    if(wrap && wrap.offsetWidth && inRect(wrap.getBoundingClientRect()))
      grid = pick(document.getElementById('popBlocks'));
    /* 在視窗上時，不抓藏在視窗下方的紙面表格。
       視窗浮在紙面上，抓到的話會掉進看不見的儲存格 */
    return grid ? cellSpotIn(grid, x, y) : null;
  }
  if(!grid){
    /* 紙面只處理看得見的範圍（canvasWrap 之內） */
    const cw = document.getElementById('canvasWrap');
    const cr = cw ? cw.getBoundingClientRect() : null;
    if(!cr || (x>=cr.left && x<=cr.right && y>=cr.top && y<=cr.bottom)) grid = pick(stage);
  }
  return cellSpotIn(grid, x, y);
}
/* 從找到的表格外框中，選出最近的儲存格 */
function cellSpotIn(grid, x, y){
  if(!grid) return null;
  /* 表格外框的標記(data-id)，在紙面上加在 .blk，在彈出視窗裡加在 .blkpad。兩邊都看 */
  const blk = grid.closest('[data-id]'); if(!blk) return null;
  const f = findBlock(blk.dataset.id); if(!f || f.b.type!=='table') return null;
  let best=null, bd=Infinity;
  grid.querySelectorAll('[data-cellkey]').forEach(c=>{
    const r=c.getBoundingClientRect(); if(!r.height) return;
    const cx=Math.max(r.left, Math.min(x, r.right)), cy=Math.max(r.top, Math.min(y, r.bottom));
    const d=(cx-x)*(cx-x)+(cy-y)*(cy-y);
    if(d<bd){ bd=d; best=c; }
  });
  if(!best) return null;
  const rc = best.dataset.cellkey.split(',').map(Number);
  return {list: cellList(f.b, rc[0], rc[1], true), el: best};
}
function dropSpotAt(x,y,from){
  const zone = dragZone(x,y,from);
  const cs = cellSpotAt(x,y);
  if(cs && cs.list) return {list:cs.list, index:cs.list.length,
    cell: cs.el.dataset.cellkey.split(',').map(Number)};
  const fall = (zone==='pop'||zone==='popsrc') ? (popWinList()||S.blocks) : S.blocks;
  const best = nearestBlock(x,y,zone);
  if(!best) return {list:fall, index:fall.length};
  const f = findBlock(best.id);
  if(!f) return {list:fall, index:fall.length};
  return {list:f.list, index:(y > best.r.top + best.r.height/2) ? f.i+1 : f.i};
}
function showCaretAt(x,y,from){
  const cs0 = cellSpotAt(x,y);
  const cell0 = cs0 ? cs0.el : null;
  document.querySelectorAll('.dropcell').forEach(q=>q.classList.remove('dropcell'));
  if(cell0){
    cell0.classList.add('dropcell');
    const r=cell0.getBoundingClientRect(); const c=ensureCaret();
    c.style.display='block'; c.style.left=r.left+'px'; c.style.width=r.width+'px';
    c.style.top=(r.bottom-2)+'px';
    return;
  }
  const zone=dragZone(x,y,from);
  const best=nearestBlock(x,y,zone); const c=ensureCaret();
  if(!best && (zone==='pop'||zone==='popsrc')){
    const q=document.getElementById(zone==='popsrc' ? 'popSrc' : 'popBlocks');
    if(q){ const r=q.getBoundingClientRect();
      c.style.display='block'; c.style.left=r.left+'px'; c.style.width=r.width+'px'; c.style.top=(r.top+8)+'px';
      return; } }
  if(!best){ c.style.display='none'; return; }
  const after = y > best.r.top + best.r.height/2;
  c.style.display='block';
  c.style.left=best.r.left+'px';
  c.style.width=best.r.width+'px';
  c.style.top=(after ? best.r.bottom : best.r.top)-1+'px';
}
function hideCaret(){
  const c=document.getElementById('dropCaret'); if(c) c.style.display='none';
  document.querySelectorAll('.dropcell').forEach(x=>x.classList.remove('dropcell'));
}
/* 把選取的段落一起移到指定串列的指定位置。
   紙面到彈出視窗、彈出視窗到紙面、彈出視窗之間都走同一條路 */
function moveBlocksTo(ids, list, index){
  const set=new Set(ids);
  const moving=[];
  ids.forEach(id=>{ const f=findBlock(id); if(f) moving.push(f.b); });
  if(!moving.length){ setStatus(T('status.nothingToMove'),'#ff9b83'); return false; }
  if(!list){ setStatus(T('status.noDropTarget'),'#ff9b83'); return false; }
  /* 彈出視窗無法放進它自己裡面（或孫層裡） */
  if(moving.some(b=>ownsList(b, list))){
    setStatus(T('status.cantDropIntoSelf'),'#ff9b83');
    return false; }
  /* 從原本的串列中抽出。抽出的位置在放置目標之前的話，編號往前補一格 */
  blockLists().forEach(L=>{
    for(let i=L.length-1;i>=0;i--) if(set.has(L[i].id)){
      if(L===list && i<index) index--;
      L.splice(i,1);
    }
  });
  list.splice(Math.max(0,Math.min(index,list.length)), 0, ...moving);
  keepNotEmpty();
  return true;
}
/* 紙面上開始拖曳時不能干擾的東西。
   不放在這裡的話，pointerdown 的 preventDefault
   會搶走文字欄的游標（這就是儲存格「選得到卻打不了字」的原因） */
const NPC_UI_SEL = '[data-tname],[data-btext],[data-cellkey] input,'
  + 'input,textarea,select,[data-rowadd],[data-rowdel],[data-cocfree],[data-dxbreed],[data-cbadd],[data-cbdel],[data-tprev],[data-popopen],[data-popmake],[data-npcfield],[data-npcsys],[data-npcver],[data-ccf],[data-acc],[data-emoadd],[data-emodel],[data-npcopen],[data-npcart],[data-npcartdel],[data-npcartw],[data-npctab],[data-npctabdel],[data-npctabadd],[data-pcol],.pgsel,.pagehead';
stage.addEventListener('pointerdown', e=>{
  if(e.button!==0) return;
  /* 抓住把手時，即使內容是可輸入的段落也能移動 */
  const wrapG = e.target.closest('.blkpad');
  if(wrapG && onGrip(wrapG, e.clientX)){
    const gid = wrapG.dataset.id || (wrapG.querySelector('.blk')||{dataset:{}}).dataset.id;
    if(gid){
      if(!sel.has(gid)){ sel.clear(); sel.add(gid); lastPick=gid; paintSel(); }
      moveDrag={ids:[...sel], x:e.clientX, y:e.clientY, started:false, from:'stage'};
      e.preventDefault(); return;
    }
  }
  if(e.target.closest(NPC_UI_SEL)) return;      // 不干擾 NPC 卡的輸入欄與按鈕
  /* 放進儲存格的段落，標記（data-id）加在外框（.blkpad）上。
     以前只看 .blk，所以按了儲存格裡的段落也選不到 */
  const blk=e.target.closest('.blk[data-id],.blkpad[data-id]');
  if(blk && blk.dataset.id){
    /* 沒選取的段落，也能在抓住的那一刻選取並移動
       （以前要先按一次重新選取，才能移動） */
    if(!sel.has(blk.dataset.id)){
      sel.clear(); sel.add(blk.dataset.id); lastPick=blk.dataset.id; paintSel();
    }
    moveDrag={ids:[...sel], x:e.clientX, y:e.clientY, started:false, from:'stage'};
    e.preventDefault(); return;
  }
  if(!blk && e.target.closest('.page')){
    const ae=document.activeElement;
    if(ae && ae.blur && (ae.isContentEditable || ae.tagName==='INPUT' || ae.tagName==='TEXTAREA')) ae.blur();
    editingId=null;
    marquee={x0:e.clientX, y0:e.clientY, add:(e.ctrlKey||e.metaKey), base:new Set(sel)};
    const ov=ensureOverlay(); ov.style.display='block';
    ov.style.left=e.clientX+'px'; ov.style.top=e.clientY+'px'; ov.style.width='0px'; ov.style.height='0px';
    document.body.classList.add('resizing');
    e.preventDefault();
  }
});
addEventListener('pointermove', e=>{
  if(marquee){
    const x=Math.min(marquee.x0,e.clientX), y=Math.min(marquee.y0,e.clientY);
    const w=Math.abs(e.clientX-marquee.x0), h=Math.abs(e.clientY-marquee.y0);
    const ov=ensureOverlay();
    ov.style.left=x+'px'; ov.style.top=y+'px'; ov.style.width=w+'px'; ov.style.height=h+'px';
    const box={left:x,top:y,right:x+w,bottom:y+h};
    sel.clear(); if(marquee.add) marquee.base.forEach(id=>sel.add(id));
    visibleBlocks().forEach(v=>{
      if(v.r.right>box.left && v.r.left<box.right && v.r.bottom>box.top && v.r.top<box.bottom) sel.add(v.id);
    });
    paintSel();
    return;
  }
  if(moveDrag){
    if(!moveDrag.started){
      if(Math.abs(e.clientX-moveDrag.x)+Math.abs(e.clientY-moveDrag.y) < 6) return;
      moveDrag.started=true; document.body.classList.add('moving');
    }
    showCaretAt(e.clientX, e.clientY, moveDrag.from);
    const zn = dragZone(e.clientX, e.clientY, moveDrag.from);
    const wrap = document.getElementById('popBlockWrap');
    const psrc = document.getElementById('popSrc');
    if(wrap) wrap.classList.toggle('dropok', zn==='pop');
    if(psrc) psrc.classList.toggle('dropok', zn==='popsrc');
    /* 在彈出視窗上（文字欄或紙面都一樣）時維持原狀。
       移到主視窗那一側時，就讓視窗變透明，露出下方的紙面 */
    popSeeThru(!inPopWin(e.clientX, e.clientY));
  }
});
addEventListener('pointerup', e=>{
  if(marquee){
    marquee=null;
    const ov=document.getElementById('dragOverlay'); if(ov) ov.style.display='none';
    document.body.classList.remove('resizing');
    if(sel.size) setStatus(T('status.parasSelected', sel.size));
    return;
  }
  if(moveDrag){
    const started=moveDrag.started, ids=moveDrag.ids, from=moveDrag.from;
    moveDrag=null; hideCaret(); document.body.classList.remove('moving');
    popSeeThru(false);
    const wrap0 = document.getElementById('popBlockWrap');
    if(wrap0) wrap0.classList.remove('dropok');
    const psrc0 = document.getElementById('popSrc');
    if(psrc0) psrc0.classList.remove('dropok');
    if(!started) return;
    const spot = dropSpotAt(e.clientX, e.clientY, from);
    const wasPop = ids.map(id=>{const f=findBlock(id); return f?f.list:null;});
    if(!moveBlocksTo(ids, spot.list, spot.index)){ render(); return; }
    sel.clear(); ids.forEach(id=>sel.add(id));
    render(); save(); paintSel();
    if(ids.length===1) jumpPreview(ids[0]);
    const toPop = spot.list !== S.blocks;
    const fromPop = wasPop.some(l=>l && l!==S.blocks);
    const inCell = !!(spot.cell);
    setStatus((inCell ? T('status.movedToCell', ids.length, spot.cell[0]+1, spot.cell[1]+1)
        : toPop && !fromPop ? T('status.movedToPop', ids.length)
        : !toPop && fromPop ? T('status.movedToPaper', ids.length) : T('status.moved', ids.length)),
      'var(--ok)');
  }
});
/* 在左側內文中，抓住把手也能同樣移動 */
srcOn('pointerdown', e=>{
  if(e.button!==0) return;
  if(!e.target.closest('.srchandle')) return;
  const row=e.target.closest('.src'); if(!row) return;
  if(!sel.has(row.dataset.id)) pickBlock(row.dataset.id, e);
  moveDrag={ids:[...sel], x:e.clientX, y:e.clientY, started:false, from:'src'};
}, true);

function idsBetween(a,b){
  const fa=findBlock(a), fb=findBlock(b);
  if(!fa||!fb||fa.list!==fb.list) return [];
  const L=fa.list, ia=fa.i, ib=fb.i;
  return L.slice(Math.min(ia,ib), Math.max(ia,ib)+1).map(x=>x.id);
}
/* 在左側選了段落，右側紙面也捲到那個位置 */
let jumpTimer=null;
function jumpPreview(id){
  clearTimeout(jumpTimer);
  jumpTimer=setTimeout(()=>doJumpPreview(id), 90);
}
function doJumpPreview(id){
  /* 表格儲存格・彈出視窗內容等，標記(data-id)加在外框(.blkpad)上（本體是 .blk）。兩邊都看 */
  const el = stage.querySelector('.blk[data-id="'+id+'"],.blkpad[data-id="'+id+'"]');
  const wrap = document.getElementById('canvasWrap');
  if(!el){
    /* 換頁這種不出現在紙面上的東西，捲到所在頁面的開頭。
       連這也不知道（彈出視窗裡等，不在紙面任何地方）的時候，
       不回到文件開頭，什麼都不做＝維持前一個畫面 */
    const pi = pageOfBlockOrNull(id);
    if(pi==null) return;
    const pel = stage.querySelectorAll('.pagebox')[pi-1];
    if(pel){ const wr=wrap.getBoundingClientRect(), q=pel.getBoundingClientRect();
      wrap.scrollTop += (q.top - wr.top) - 20; }
    return;
  }
  const wr = wrap.getBoundingClientRect(), r = el.getBoundingClientRect();
  const vis = r.top >= wr.top+8 && r.bottom <= wr.bottom-8;
  if(!vis){
    /* 只有看不到時才移動。放在從上往下三成的位置，前後文都讀得到 */
    const want = Math.min(wrap.clientHeight*0.3, Math.max(0, (wrap.clientHeight - r.height)/2));
    wrap.scrollTop += (r.top - wr.top) - want;
  }
  /* 放大後橫向超出時，橫向也捲過去 */
  if(r.left < wr.left+4) wrap.scrollLeft += (r.left - wr.left) - 12;
  else if(r.right > wr.right-4) wrap.scrollLeft += (r.right - wr.right) + 12;
  el.classList.add('jumped');
  setTimeout(()=>el.classList.remove('jumped'), 700);
}
function paintSel(){
  srcAll('.src').forEach(el=>el.classList.toggle('pick', sel.has(el.dataset.id)));
  /* 選取的顏色不鋪在區塊本體，而是鋪在外框上。
     讓標題 1 這種自帶背景的書式，背景與文字也不會被塗掉。 */
  stage.querySelectorAll('.blk').forEach(el=>{
    const on = sel.has(el.dataset.id);
    el.classList.toggle('pick', on);
    const w = el.parentElement;
    if(w && w.classList.contains('blkpad')) w.classList.toggle('pickwrap', on);
  });
  syncBlockPanel();
  renderProps();          // 點一下就讓右側設定欄出現
  renderPopWin();         // 彈出視窗也重新塗上選取的地方
  popSeeThruBySel();      // 選取的是彈出視窗外的東西時，讓視窗變透明
}
function pickBlock(id, e){
  /* 離開打字的狀態。焦點還留著的話，Backspace 會被拿去刪字 */
  const a=document.activeElement;
  if(a && a.blur && (a.isContentEditable || a.tagName==='INPUT' || a.tagName==='TEXTAREA')) a.blur();
  if(e && e.shiftKey && lastPick){ sel.clear(); idsBetween(lastPick,id).forEach(x=>sel.add(x)); }
  else if(e && (e.metaKey||e.ctrlKey)){ sel.has(id)?sel.delete(id):sel.add(id); lastPick=id; }
  else { sel.clear(); sel.add(id); lastPick=id; }
  paintSel();
  if(sel.size===1) jumpPreview([...sel][0]);
}
srcOn('mousedown', e=>{
  const row = e.target.closest('.src');
  /* 從沒有行的空白處拖曳，就一起選取框到的範圍 */
  if(!row){
    /* 「表格內容」的欄不是段落的行，但它是輸入文字的欄，所以不干擾 */
    if(e.target.closest('.srccell')) return;
    if(e.button!==0) return;
    const ae=document.activeElement;
    if(ae && ae.blur && (ae.isContentEditable || ae.tagName==='INPUT' || ae.tagName==='TEXTAREA')) ae.blur();
    editingId=null;
    srcMarquee={x0:e.clientX, y0:e.clientY, add:(e.ctrlKey||e.metaKey), base:new Set(sel)};
    const ov=ensureOverlay(); ov.style.display='block';
    ov.style.left=e.clientX+'px'; ov.style.top=e.clientY+'px'; ov.style.width='0px'; ov.style.height='0px';
    document.body.classList.add('resizing');
    e.preventDefault();
    return;
  }
  const onGrip = !!e.target.closest('.srchandle,.srcgut');
  const inEditable = !!e.target.closest('.srctext[contenteditable=true]');
  /* 把手與書式名稱欄，在兩種模式下都能用來選取區塊（類似 Notion 的操作） */
  if(!onGrip){
    if(inEditable) return;                            // 編輯文字時不干擾
    if(inEditable && editingId===row.dataset.id) return;
  }
  e.preventDefault();
  const id = row.dataset.id;
  if(!(onGrip && sel.has(id) && sel.size>1)) pickBlock(id, e);
  editingId=null;
  dragging=true; dragFrom=id;
}, true);
srcOn('mouseover', e=>{
  if(!dragging || moveDrag) return;
  const row = e.target.closest('.src'); if(!row) return;
  sel.clear(); idsBetween(dragFrom, row.dataset.id).forEach(x=>sel.add(x));
  paintSel();
});
addEventListener('mousemove', e=>{
  if(!srcMarquee) return;
  const x=Math.min(srcMarquee.x0,e.clientX), y=Math.min(srcMarquee.y0,e.clientY);
  const w=Math.abs(e.clientX-srcMarquee.x0), h=Math.abs(e.clientY-srcMarquee.y0);
  const ov=ensureOverlay();
  ov.style.left=x+'px'; ov.style.top=y+'px'; ov.style.width=w+'px'; ov.style.height=h+'px';
  const box={left:x,top:y,right:x+w,bottom:y+h};
  sel.clear(); if(srcMarquee.add) srcMarquee.base.forEach(id=>sel.add(id));
  srcAll('.src').forEach(el=>{
    const r=el.getBoundingClientRect();
    if(r.right>box.left && r.left<box.right && r.bottom>box.top && r.top<box.bottom) sel.add(el.dataset.id);
  });
  paintSel();
});
addEventListener('mouseup', ()=>{
  dragging=false;
  if(srcMarquee){
    srcMarquee=null;
    const ov=document.getElementById('dragOverlay'); if(ov) ov.style.display='none';
    document.body.classList.remove('resizing');
    if(sel.size) setStatus(T('status.parasSelected', sel.size));
  }
});
srcOn('dblclick', e=>{
  const row = e.target.closest('.src'); if(!row) return;
  const f = findBlock(row.dataset.id); if(!f) return;
  /* 若是彈出視窗本身或彈出視窗裡的段落，就叫出該彈出視窗。
     只按一下就跳出視窗容易誤操作，所以要按兩下 */
  if(f.b.type==='popup' && popIsBlocks(f.b.pop)){
    sel.clear(); sel.add(f.b.id); paintSel();
    openPopup(f.b.id); return;
  }
  if(f.b.type==='flow'){
    sel.clear(); sel.add(f.b.id); paintSel();
    openFlowWin(f.b.id); return;
  }
  if(f.list !== S.blocks && popOwnerOf(f.list)){
    sel.clear(); sel.add(f.b.id); paintSel();
    openOwnerPopup(f.b.id); return;
  }
  if(f.b.type==='image'){
    const cap = document.querySelector('#propBody [data-p="icap"]');
    if(cap) cap.focus();
    return; }
  if(f.b.type==='npc'||f.b.type==='toc'||f.b.type==='break'){
    setStatus(T('status.handleOnPage', TYPE_NAME(f.b.type)),'#ff9b83'); return;
  }
  editingId = f.b.id; sel.clear(); sel.add(f.b.id);
  render(); focusSrc(f.b.id,true);
});
/* 點了右側頁面時，選取該區塊並移到左側對應的位置 */
stage.addEventListener('click', e=>{
  if(e.target.closest(NPC_UI_SEL)) return;
  const blk = e.target.closest('.blk'); if(!blk) return;
  const id = blk.dataset.id;
  if(e.shiftKey && lastPick){ sel.clear(); idsBetween(lastPick,id).forEach(x=>sel.add(x)); }
  else if(e.metaKey||e.ctrlKey){ sel.has(id)?sel.delete(id):sel.add(id); lastPick=id; }
  else { sel.clear(); sel.add(id); lastPick=id; }
  paintSel();
  const row = srcQ('.src[data-id="'+id+'"]');
  if(row) row.scrollIntoView({behavior:'smooth', block:'center'});
});

/* ================= NPC 卡的操作 =================
   讓紙面（右側頁面）與詳細視窗兩邊都能用同樣的操作，一起綁定。 */
function npcOn(type, fn){
  stage.addEventListener(type, fn);
  document.getElementById('npcDlgBody').addEventListener(type, fn);
  document.getElementById('propBody').addEventListener(type, fn);
  document.getElementById('popBlocks').addEventListener(type, fn);
}
/* NPC 卡的某一項改變時，不重畫，只更新自動計算欄（為了保持輸入中的焦點） */
function refreshNpcAutos(blkEl, b){
  const A = computeNpcAuto(b.npc);
  blkEl.querySelectorAll('input.npc-auto[data-npcfield]').forEach(inp=>{
    if(inp === document.activeElement) return;      // 輸入中的欄不動
    const p = inp.dataset.npcfield;
    const isAuto = String(getNpcField(b.npc, p) ?? '').trim()==='';
    inp.classList.toggle('isauto', isAuto);
    if(isAuto){ const a = A[p]; inp.value = (a==null||a==='') ? '' : String(a); }
  });
}
function npcFieldEvent(e){
  const nf = e.target.closest('[data-npcfield]'); if(!nf) return false;
  const el = e.target.closest('.blk'); if(!el) return false;
  const f = findBlock(el.dataset.id); if(!f || f.b.type!=='npc') return false;
  const val = ('value' in nf && nf.tagName!=='DIV') ? nf.value : nf.innerText.replace(/\n$/,'');
  setNpcField(f.b, nf.dataset.npcfield, val);
  if(nf.classList.contains('npc-auto')) nf.classList.toggle('isauto', String(val).trim()==='');
  if(/^emoklore\.ab\./.test(nf.dataset.npcfield)) refreshEmoRefSelects(el, f.b);
  refreshNpcAutos(el, f.b);
  repaginateSoon(); save();
  return true;
}
/* 頁面那邊能編輯的只有 NPC 卡的輸入欄。內文在左側文字中寫 */
npcOn('input', e=>{ npcFieldEvent(e); });
/* 把欄位清空並離開時，回到自動計算值 */
npcOn('focusout', e=>{
  const nf = e.target.closest('input.npc-auto[data-npcfield]'); if(!nf) return;
  const el = e.target.closest('.blk'); if(!el) return;
  const f = findBlock(el.dataset.id); if(!f || f.b.type!=='npc') return;
  setTimeout(()=>refreshNpcAutos(el, f.b), 0);
});
npcOn('change', e=>{
  const sy = e.target.closest('[data-npcsys]');
  if(sy){
    const el = e.target.closest('.blk'); if(!el) return;
    const f = findBlock(el.dataset.id); if(!f) return;
    ensureNpc(f.b).sys = sy.value;
    render(); save();
    return;
  }
  const ve = e.target.closest('[data-npcver]');
  if(ve){
    const el = e.target.closest('.blk'); if(!el) return;
    const f = findBlock(el.dataset.id); if(!f) return;
    ensureNpc(f.b).coc.ver = ve.value;
    render(); save();
    return;
  }
  const nf = e.target.closest('[data-npcfield]');
  const p  = nf ? String(nf.dataset.npcfield||'') : '';
  const el = e.target.closest('.blk');
  npcFieldEvent(e);
  /* 類別或技能名稱改變的話，技能名稱的候選與參照能力的選項也會跟著變。
     在這裡整個重畫的話，移到下一欄的瞬間就會失去焦點與輸入中的值，
     所以只替換那一列。 */
  if(el && /^emoklore\.skills\.\d+\.arg$/.test(p)){
    const f = findBlock(el.dataset.id);
    if(f && !editingOnPage()) { render(); save(); }
    return;
  }
  if(el && /^emoklore\.skills\.\d+\.(n|cat)$/.test(p)){
    const f = findBlock(el.dataset.id); if(!f) return;
    const i = +p.split('.')[2], np = ensureNpc(f.b), sk = np.emoklore.skills[i];
    if(p.endsWith('.n')){
      const def = emoDefOf(sk.n);
      if(def && sk.ref && !def.refs.includes(sk.ref)) sk.ref = '';   // 該技能不能選的參照能力就回到自動
      if(def && !sk.cat) sk.cat = def.cat;                            // 類別是空的就從技能補上
      if(!def || !def.arg) sk.arg = '';                               // 沒有種類的技能就清掉種類
    }else{
      const def = emoDefOf(sk.n);
      if(sk.cat && def && def.cat !== sk.cat){ sk.n=''; sk.arg=''; sk.ref=''; }  // 換了類別就重新選技能
    }
    /* 選項本身改變了，所以重畫。因為是下拉選單的操作，輸入中的文字不會遺失 */
    render(); save(); return;
  }
  /* CoC：換了類別，技能的候選就會改變，所以重畫 */
  if(el && /^coc\.skills\.\d+\.(n|cat)$/.test(p)){
    const f = findBlock(el.dataset.id); if(!f) return;
    const i = +p.split('.')[2], sk = ensureNpc(f.b).coc.skills[i];
    if(!sk) return;
    /* 選了「自己輸入…」的話，只把那一列切換成手動輸入的欄 */
    if(p.endsWith('.n') && sk.n==='__free__'){ sk.n=''; sk.free=true; render(); save(); return; }
    if(p.endsWith('.cat')){
      if(sk.n && cocSkillsOf(f.b.npc.coc.ver, sk.cat).indexOf(sk.n)<0){ sk.n=''; sk.arg=''; }
    }
    /* 換成不需要專業領域的技能時，清掉種類 */
    if(p.endsWith('.n') && !cocNeedsArg(f.b.npc.coc.ver, sk.n)) sk.arg='';
    render(); save(); return;
  }
  /* DX3rd：換了症候群／效果種類，顏色的呈現方式會改變，所以重畫 */
  if(el && /^dx3rd\.(syns\.\d+|effects\.\d+\.kind)$/.test(p)){
    render(); save(); return;
  }
  /* DX3rd：換了組合技的組合，就重算侵蝕值等自動計算 */
  if(el && /^dx3rd\.combos\.\d+\.pick\.\d+$/.test(p)){
    render(); save(); return;
  }
  /* 只選了感情時，補上該感情所屬的屬性 */
  if(el && /^emoklore\.res\.(omote|ura|root)\.name$/.test(p)){
    const f = findBlock(el.dataset.id); if(!f) return;
    const slot = p.split('.')[2], r = ensureNpc(f.b).emoklore.res[slot];
    if(r.name && !r.attr){
      const hit = EMO_EMOTIONS.find(a=>a.items.indexOf(r.name)>=0);
      if(hit){ r.attr = hit.k; render(); save(); return; }
    }
    return;
  }
  /* 共鳴感情：換了屬性，感情的候選就會改變，所以重畫 */
  if(el && /^emoklore\.res\.(omote|ura|root)\.attr$/.test(p)){
    const f = findBlock(el.dataset.id); if(!f) return;
    const slot = p.split('.')[2], r = ensureNpc(f.b).emoklore.res[slot];
    const a = emoAttrOf(r.attr);
    if(!a || a.items.indexOf(r.name)<0) r.name = '';   // 換了屬性就重新選感情
    render(); save(); return;
  }
});
/* 「不重建元素」而只更新參照能力下拉選單的內容。
   若整個元素替換，從技能名稱用 Tab 移過來的瞬間焦點會跑掉，
   輸入就會遺失，所以只改寫 options 的內容。 */
function syncEmoRefSelect(selEl, sk, ab){
  const def  = emoDefOf(sk.n);
  const list = (def && def.refs.length) ? def.refs : Object.keys(EMO_AB_LABEL);
  const auto = emoPickRef(def, ab);
  const autoLabel = auto ? EMO_AB_LABEL[auto]+(emoDiv(def,auto)>1?'÷'+emoDiv(def,auto):'') : '—';
  const manual = String(sk.ref||'').trim();
  const want = [''].concat(list);
  const cur  = Array.prototype.map.call(selEl.options, o=>o.value);
  if(cur.length!==want.length || cur.some((v,k)=>v!==want[k])){
    selEl.innerHTML = want.map(v=>'<option value="'+v+'"></option>').join('');
  }
  selEl.options[0].textContent = autoLabel;
  list.forEach((r,k)=>{ selEl.options[k+1].textContent = EMO_AB_LABEL[r] + (emoDiv(def,r)>1?'÷'+emoDiv(def,r):''); });
  selEl.value = (manual && want.indexOf(manual)>=0) ? manual : '';
  selEl.classList.toggle('isauto', !selEl.value);
}
/* 只把一列的顯示對齊到目前的資料 */
function updateEmoSkillRow(blkEl, np, i){
  const tr = blkEl.querySelector('.npc-skilltable tr[data-row="'+i+'"]'); if(!tr) return;
  const sk = np.emoklore.skills[i];
  const catSel = tr.querySelector('select[data-npcfield$=".cat"]');
  if(catSel && catSel !== document.activeElement) catSel.value = sk.cat || '';
  const refSel = tr.querySelector('select[data-npcfield$=".ref"]');
  if(refSel) syncEmoRefSelect(refSel, sk, np.emoklore.ab);
}
/* 改變能力值時「（自動：〇〇）」的內容也會變，所以更新所有列的參照能力下拉選單 */
function refreshEmoRefSelects(blkEl, b){
  const np = b.npc; if(!np || np.sys!=='emoklore') return;
  np.emoklore.skills.forEach((sk,i)=>updateEmoSkillRow(blkEl, np, i));
}
/* 折疊區塊的開合，以及 Emoklore 技能欄的列數增減 */
npcOn('click', e=>{
  const el = e.target.closest('.blk'); if(!el) return;
  const f = el.dataset.id ? findBlock(el.dataset.id) : null;
  if(!f || f.b.type!=='npc') return;

  const acc = e.target.closest('[data-acc]');
  if(acc){
    e.preventDefault();
    const p = acc.dataset.acc, np = ensureNpc(f.b);
    const inModal = !!e.target.closest('#npcDlgBody');
    const wasOpen = accRead(np, p);
    accWrite(np, p, !wasOpen);
    if(!wasOpen) npcModalOpen.delete(p);
    render(); save();
    /* 在紙面展開後若會放不進頁面，就讓紙面保持收合，
       只在詳細視窗裡展開。為了不打亂紙面的排版。 */
    if(!inModal && !wasOpen && npcOverflows(f.b.id)){
      accWrite(np, p, false);
      npcModalOpen.add(p);
      render(); save();
      openNpcModal(f.b.id, T('npc.modalNote'));
    }
    return;
  }
  if(e.target.closest('[data-npctabadd]')){
    e.preventDefault();
    const np=ensureNpc(f.b);
    np.tabs.push({id:uid(), title:'', text:'', open:true});
    render(); save(); setStatus(T('status.tabAdded'),'var(--ok)');
    return;
  }
  const tdel = e.target.closest('[data-npctabdel]');
  if(tdel){
    e.preventDefault();
    const np=ensureNpc(f.b), t=np.tabs.find(x=>x.id===tdel.dataset.npctabdel);
    if(t && !confirm(T('confirm.tabDelete', t.title||T('npc.tabUnnamed')))) return;
    np.tabs = np.tabs.filter(x=>x.id!==tdel.dataset.npctabdel);
    render(); save();
    return;
  }
  if(e.target.closest('[data-npcart]')){
    e.preventDefault();
    npcArtId = f.b.id;
    document.getElementById('npcArtFile').click();
    return;
  }
  if(e.target.closest('[data-npcartdel]')){
    e.preventDefault();
    if(!confirm(T('confirm.artRemove'))) return;
    ensureNpc(f.b).art = null;
    render(); save(); setStatus(T('status.artRemoved'),'var(--ok)');
    return;
  }
  /* 列的增減（各表格共用的處理）。在 data-rowadd / data-rowdel 寫上陣列的位置 */
  const radd = e.target.closest('[data-rowadd]'), rdel = e.target.closest('[data-rowdel]');
  if(radd || rdel){
    e.preventDefault();
    const path = (radd||rdel).dataset[radd?'rowadd':'rowdel'];
    const np = ensureNpc(f.b);
    const arr = getNpcField(np, path);
    if(!Array.isArray(arr)) return;
    const NEW = {
      'coc.skills':   ()=>({n:'',cat:'',arg:'',v:'',free:false}),
      'coc.weapons':  ()=>({n:'',v:'',dmg:''}),
      'dx3rd.effects':()=>({kind:'',n:'',lv:'',timing:'',skill:'',dif:'',tgt:'',rng:'',enc:'',lim:''}),
      'dx3rd.combos': ()=>({n:'',cmb:'',pick:[],extra:'',timing:'',skill:'',hit:'',atk:'',tgt:'',rng:'',enc:'',cond:'',eff:''})
    }[path];
    const MAX = {'coc.skills':12,'coc.weapons':12,'dx3rd.effects':99,'dx3rd.combos':99}[path] || 12;
    if(radd){ if(arr.length>=MAX){ setStatus(T('status.maxRows', MAX),'#ff9b83'); return; }
      arr.push(NEW ? NEW() : {}); }
    else { if(!arr.length) return; arr.pop(); }
    render(); save(); return;
  }
  /* DX3rd：替組合技的組合增減效果的選擇欄 */
  const cba = e.target.closest('[data-cbadd]'), cbd = e.target.closest('[data-cbdel]');
  if(cba || cbd){
    e.preventDefault();
    const i = +(cba||cbd).dataset[cba?'cbadd':'cbdel'];
    const cb = ensureNpc(f.b).dx3rd.combos[i]; if(!cb) return;
    if(!Array.isArray(cb.pick)) cb.pick = [];
    if(cba){ if(cb.pick.length>=12) return; cb.pick.push(''); }
    else { if(!cb.pick.length) return; cb.pick.pop(); }
    render(); save(); return;
  }
  /* DX3rd：選擇血統。能選的症候群數量會改變，多出來的就清掉 */
  const bd = e.target.closest('[data-dxbreed]');
  if(bd){
    e.preventDefault();
    const d = ensureNpc(f.b).dx3rd, k = bd.dataset.dxbreed;
    d.breed = (d.breed===k) ? '' : k;
    const n = dxBreedN(d.breed);
    if(n) for(let i=n;i<3;i++) d.syns[i]='';
    render(); save(); return;
  }
  /* CoC：切換技能名稱要從清單選擇／自己輸入 */
  const cf = e.target.closest('[data-cocfree]');
  if(cf){
    e.preventDefault();
    const sk = ensureNpc(f.b).coc.skills[+cf.dataset.cocfree];
    if(sk){ sk.free = cf.dataset.v==='1'; render(); save(); }
    return;
  }
  if(e.target.closest('[data-emoadd]')){
    e.preventDefault();
    ensureNpc(f.b).emoklore.skills.push({n:'',cat:'',arg:'',ref:'',lv:'',v:''});
    render(); save(); return;
  }
  if(e.target.closest('[data-emodel]')){
    e.preventDefault();
    const sk = ensureNpc(f.b).emoklore.skills;
    /* 移除所有沒有技能名稱的列。但一定保留一列 */
    const keep = sk.filter(x=>String(x.n||'').trim());
    sk.length = 0;
    (keep.length ? keep : [{n:'',cat:'',arg:'',ref:'',lv:'',v:''}]).forEach(x=>sk.push(x));
    render(); save();
    if(sk.length === EMO_SKILL_ROWS) setStatus(T('status.keepRows', EMO_SKILL_ROWS),'#ff9b83');
    return;
  }
});
/* 連同顏色與字體一起貼上的話，文字在紙面上可能會變白看不見。
   不論哪個輸入欄，貼上時都只保留純文字。

   彈出視窗的接收處有兩層。一個是設在整個視窗（#popDlg）上的這個，
   另一個是它內側的「文字」欄（#popSrc）與「預覽」欄（#popBlocks）的接收處。
   外側這個是捕獲（capture）方向，所以比內側先執行；它只做 preventDefault
   而不停止傳遞，於是內側又放入一次，文字就重複了。
   內側有接收處的地方，就交給內側，這裡什麼都不做。
   （#popSrc 的接收處還有把以空行分隔的文章逐段拆開匯入的功能，
     這邊若先放入，那個功能也會失效） */
function plainPaste(e){
  const t = e.target;
  if(!t || !(t.isContentEditable || t.tagName==='INPUT' || t.tagName==='TEXTAREA')) return;
  if(e.currentTarget && e.currentTarget.id==='popDlg' && t.closest
     && (t.closest('#popBlocks') || t.closest('#popSrc .srctext[contenteditable=true]'))) return;
  const cd = e.clipboardData || window.clipboardData; if(!cd) return;
  const txt = cd.getData('text/plain');
  if(txt==null) return;
  e.preventDefault();
  if(t.isContentEditable) document.execCommand('insertText', false, txt.replace(/\r\n?/g,'\n'));
  else {
    const a=t.selectionStart, b=t.selectionEnd;
    t.value = t.value.slice(0,a) + txt + t.value.slice(b);
    t.selectionStart = t.selectionEnd = a + txt.length;
    t.dispatchEvent(new Event('input',{bubbles:true}));
  }
}
stage.addEventListener('paste', plainPaste, true);
document.getElementById('popBlocks').addEventListener('paste', plainPaste, true);
document.getElementById('npcDlgBody').addEventListener('paste', plainPaste, true);
document.getElementById('popDlg').addEventListener('paste', plainPaste, true);
document.getElementById('tblDlgBody').addEventListener('paste', plainPaste, true);

/* ================= 彈出視窗 ================= */
let popId=null;
/* 按下紙面上彈出視窗的按鈕時，開啟撰寫內容的視窗。
   匯出的 HTML 中內容會當場展開，所以編輯畫面也統一成「按了就看得到」 */
npcOn('click', e=>{
  const btn=e.target.closest('[data-popmake]'); if(!btn) return;
  e.preventDefault();
  const nm = btn.dataset.popmake;
  const host = e.target.closest('.blk'); const hid = host ? host.dataset.id : null;
  if(hid && makeMissingPopups(hid)){ const t=popupByLabel(nm); if(t) openPopup(t.id); }
});
npcOn('click', e=>{
  const btn=e.target.closest('[data-popopen]'); if(!btn) return;
  const f=findBlock(btn.dataset.popopen); if(!f || f.b.type!=='popup') return;
  e.preventDefault();
  openPopup(f.b.id);
});
/* 排在彈出視窗編輯視窗上的書式按鈕。按下後會在游標所在行的開頭插入記號 */
function paintPopRich(){
  document.getElementById('popRich').innerHTML = RICH_MARKS_POP.map(([mk,lb,ti])=>
    '<button data-poprich="'+esc(mk)+'" title="'+esc(richTitle(mk,ti))+'" style="flex:0 0 auto;font-size:11px;padding:3px 8px">'
    + richLabelHTML(mk,lb)+'</button>').join('');
}
paintPopRich();
document.getElementById('popRich').addEventListener('mousedown', e=>{
  if(e.target.closest('[data-poprich]')) e.preventDefault();   // 不讓輸入欄的游標跑掉
});
document.getElementById('popRich').addEventListener('click', e=>{
  const btn = e.target.closest('[data-poprich]'); if(!btn) return;
  richApplyTA(document.getElementById('popEdit'), btn.dataset.poprich);
});
function openPopup(id){
  const f=findBlock(id); if(!f || f.b.type!=='popup') return;
  const p=ensurePopup(f.b);
  popId=id;
  document.getElementById('popTitle').value = p.label || T('pop.defaultLabel');
  document.getElementById('popEdit').value = p.body;
  setPopMode(p);
  const w = document.getElementById('popDlg');
  w.style.display='flex';
  placeFloatWin(w);
  syncBlockPanel(); fitPopPanes(); syncPopBar();
  popSeeThruBySel();
}
/* ---- 浮在畫面中的視窗 ----
   只有第一次顯示時放在正中間。移動過之後就記住那個位置。
   為了不讓它跑到畫面外，每次顯示時都拉回放得下的位置。 */
const fwGeo = {};
function placeFloatWin(w){
  /* 第一次顯示時，放在不會擋住左側文章欄與右側設定欄的地方。
     讓視窗開著時兩邊的面板都能使用 */
  let g = fwGeo[w.id];
  if(!g){
    const sp = document.getElementById('srcPane'), pp = document.getElementById('propPane');
    const a = sp ? sp.getBoundingClientRect() : null;
    const z = pp ? pp.getBoundingClientRect() : null;
    /* 從「文字」的右邊開始放。從左端開始放的話文字欄會被視窗蓋住，
       抓不到段落的把手，就無法搬進視窗 */
    let x0 = a ? a.right+8 : 40;
    /* 彈出視窗有自己的設定欄，所以蓋住主視窗右側的設定欄也沒關係 */
    const x1 = (w.id==='popDlg') ? innerWidth-16
             : (z && z.width>0) ? z.left-8 : innerWidth-40;
    /* 彈出視窗裡並排四個欄，但寬度不夠也不往左延伸。
       蓋住主視窗的文字欄的話，就無法抓紙面的段落搬進這個視窗。
       取而代之，放不下時由視窗這邊把「文字」欄收合起來（fitPopPanes）*/
    g = fwGeo[w.id] = (x1-x0 > 420)
      ? { w: Math.round(x1-x0), h: Math.min(700, innerHeight-(a?a.top:60)-32),
          x: Math.round(x0),    y: Math.round((a?a.top:60)+8) }
      : { w: Math.min(w.id==='popDlg' ? 1180 : 1000, innerWidth-40),
          h: Math.min(680, innerHeight-100), x:null, y:null };
  }
  g.w = Math.max(460, Math.min(g.w, innerWidth-20));
  g.h = Math.max(220, Math.min(g.h, innerHeight-20));
  if(g.x==null) g.x = Math.max(10, (innerWidth  - g.w)/2);
  if(g.y==null) g.y = Math.max(10, (innerHeight - g.h)/2);
  g.x = Math.max(0, Math.min(g.x, innerWidth  - g.w));
  g.y = Math.max(0, Math.min(g.y, innerHeight - g.h));
  w.style.left=g.x+'px'; w.style.top=g.y+'px';
  w.style.width=g.w+'px'; w.style.height=g.h+'px';
}
/* 抓住標題列移動／抓住四邊・四角的任何一處都能調整大小 */
const FW_MIN_W = 460, FW_MIN_H = 220;
function bindFloatWin(winId, barId, gripId){
  const w = document.getElementById(winId);
  const bar = document.getElementById(barId), grip = gripId?document.getElementById(gripId):null;
  let mode=null, dir='', sx=0, sy=0, ox=0, oy=0, ow=0, oh=0;
  const start = (e, m, d)=>{
    if(e.target.closest('button,input,select,textarea')) return;
    const g = fwGeo[winId]; if(!g) return;
    mode=m; dir=d||''; sx=e.clientX; sy=e.clientY; ox=g.x; oy=g.y; ow=g.w; oh=g.h;
    e.preventDefault();
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, {once:true});
  };
  const move = e=>{
    const g = fwGeo[winId]; if(!g || !mode) return;
    const dx = e.clientX-sx, dy = e.clientY-sy;
    if(mode==='move'){
      g.x = Math.max(0, Math.min(ox + dx, innerWidth  - g.w));
      g.y = Math.max(0, Math.min(oy + dy, innerHeight - g.h));
    }else{
      /* 只移動抓住的方向。抓住左・上時位置也一起移動，
         讓對面的邊留在原地（達到最小尺寸後就不再移動） */
      if(dir.indexOf('e')>=0) g.w = Math.max(FW_MIN_W, Math.min(ow + dx, innerWidth  - ox));
      if(dir.indexOf('s')>=0) g.h = Math.max(FW_MIN_H, Math.min(oh + dy, innerHeight - oy));
      if(dir.indexOf('w')>=0){ const n = Math.max(FW_MIN_W, Math.min(ow - dx, ox + ow)); g.x = ox+ow-n; g.w = n; }
      if(dir.indexOf('n')>=0){ const n = Math.max(FW_MIN_H, Math.min(oh - dy, oy + oh)); g.y = oy+oh-n; g.h = n; }
    }
    w.style.left=g.x+'px'; w.style.top=g.y+'px';
    w.style.width=g.w+'px'; w.style.height=g.h+'px';
  };
  const end = ()=>{ mode=null; document.removeEventListener('pointermove', move); };
  bar.addEventListener('pointerdown', e=>start(e,'move'));
  if(grip) grip.addEventListener('pointerdown', e=>start(e,'size','se'));
  /* 視窗上沒有邊緣的抓取處的話，就在這裡補上 */
  ['n','s','w','e','nw','ne','sw'].forEach(d=>{
    if(w.querySelector(':scope > .fw-rz.'+d)) return;
    const h = document.createElement('div');
    h.className = 'fw-rz '+d;
    w.appendChild(h);
    h.addEventListener('pointerdown', e=>start(e,'size',d));
  });
}
bindFloatWin('popDlg','popBar','popGrip');
addEventListener('resize', ()=>{
  const w=document.getElementById('popDlg');
  if(w && w.style.display==='flex') placeFloatWin(w);
});
/* 彈出視窗裡的分隔線。和主視窗一樣，抓住就能改變相鄰欄的寬度。
   dir 表示「要伸縮分隔線哪一側的欄」。
   左側的欄往右拉會變寬，右側的欄往右拉會變窄。 */
function bindPopSplitter(spId, elId, dir, min, def){
  const sp = document.getElementById(spId), el = document.getElementById(elId);
  if(!sp || !el) return;
  let drag=null;
  sp.addEventListener('pointerdown', e=>{
    drag = {x:e.clientX, w:el.offsetWidth};
    document.body.classList.add('resizing');
    sp.classList.add('drag');
    sp.setPointerCapture && sp.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  addEventListener('pointermove', e=>{
    if(!drag) return;
    const main = document.getElementById('popMain');
    /* 以紙面欄（popBlockWrap）不會被壓扁為限 */
    const others = ['popSide','popSrc','popProp'].reduce((a,id)=>{
      if(id===elId) return a;
      const x = document.getElementById(id);
      return a + (x && x.offsetParent && x.style.display!=='none' ? x.offsetWidth+6 : 0);
    }, 0);
    const max = Math.max(min, (main?main.clientWidth:600) - 220 - 6 - others);
    const d = (dir==='left') ? (e.clientX-drag.x) : (drag.x-e.clientX);
    el.style.flex = '0 1 '+Math.max(min, Math.min(drag.w + d, max))+'px';
  });
  addEventListener('pointerup', ()=>{
    if(!drag) return;
    drag=null;
    document.body.classList.remove('resizing');
    sp.classList.remove('drag');
  });
  sp.addEventListener('dblclick', ()=>{ el.style.flex='0 1 '+def+'px'; });
}
bindPopSplitter('splitPopSide','popSide','left', 150, 250);
bindPopSplitter('splitPopSrc', 'popSrc', 'left', 110, 250);
bindPopSplitter('splitPopProp','popProp','right',110, 250);
/* 標題列的顯示／隱藏按鈕 */
document.getElementById('popBtnSide').onclick = ()=>{
  document.getElementById('popSide').classList.toggle('hide');
  popPanesTouched = true;
  syncPopBar();
};
document.getElementById('popBtnSrc').onclick = ()=>{
  document.getElementById('popSrc').classList.toggle('hide');
  popPanesTouched = true;
  syncPopBar();
};
/* 視窗太窄時四個欄排不下。只在第一次開啟時，
   先把最能讓出空間的「文字」欄收起來。
   （同樣的內容也顯示在右側紙面上，所以沒有這欄也能寫）
   使用者自己顯示／隱藏過之後，就尊重那個決定，不再動它 */
let popPanesTouched = false;
function fitPopPanes(){
  if(popPanesTouched) return;
  const main = document.getElementById('popMain');
  if(!main || !main.clientWidth) return;
  /* 面板 250＋文字 250＋紙面 220＋設定 250＋分隔線 18 */
  document.getElementById('popSrc').classList.toggle('hide', main.clientWidth < 988);
}
document.getElementById('popBtnProp').onclick = ()=>{
  const pp = document.getElementById('popProp');
  if(pp.style.display==='none'){
    popPropForce = true;
    pp.style.display = 'flex';
    if(!document.getElementById('popPropSlot').children.length)
      document.getElementById('popPropHead').textContent = T('popwin.propHint');
  }else{
    popPropForce = false;
    pp.style.display = 'none';
  }
  syncPopBar();
};
/* ================= 流程圖的編輯視窗 =================
   圖本身用與紙面完全相同的排法（flowHTML）放大顯示，
   只在上面疊上「抓取的地方」。所以編輯時的樣子不會與紙面不一致。 */
const FLOW_MM = 96/25.4;                 // 1mm 是多少 px
let flowId = null;                       // 目前開啟的流程圖區塊 id
let flowSelSet = new Set();              // 選取中的方框（多個）
let flowSel = null;                      // 其中最後按的那個（設定欄顯示它）
let flowSelEdge = null;                  // 選取中的線
let flowLinkFrom = null;                 // 正在拉線時的起點方框
let flowZoom = 1.2;
let flowDrag = null;
let flowMarquee = null;                  // 在空白處拖曳框選
function flowPick(id, add){
  if(!id){ flowSelSet.clear(); flowSel = null; return; }
  if(add){
    if(flowSelSet.has(id)){ flowSelSet.delete(id); flowSel = [...flowSelSet].pop() || null; return; }
    flowSelSet.add(id); flowSel = id; return;
  }
  if(!flowSelSet.has(id) || flowSelSet.size>1){ flowSelSet.clear(); flowSelSet.add(id); }
  flowSel = id;
}
function flowSelNodes(fl){ return [...flowSelSet].map(id=>flowNode(fl,id)).filter(Boolean); }
/* 流程圖視窗中的 Backspace / Delete。只刪除選取中的方框或線 */
function flowDeleteSel(){
  const b = flowBlk(); if(!b) return;
  const fl = ensureFlow(b);
  if(flowSelSet.size){
    const ids = new Set(flowSelSet);
    fl.nodes = fl.nodes.filter(x=>!ids.has(x.id));
    fl.edges = fl.edges.filter(x=>!ids.has(x.a) && !ids.has(x.b));
    flowPick(null);
    render(); save(); renderFlowWin(true);
    setStatus(T('status.boxesDeleted', ids.size),'var(--ok)'); return;
  }
  if(flowSelEdge){
    fl.edges = fl.edges.filter(x=>x.id!==flowSelEdge);
    flowSelEdge = null;
    render(); save(); renderFlowWin(true);
    setStatus(T('status.lineDeleted'),'var(--ok)'); return;
  }
  setStatus(T('status.pickToDelete'),'#ff9b83');
}
function flowBlk(){ const f = flowId ? findBlock(flowId) : null; return (f && f.b.type==='flow') ? f.b : null; }
function setFlowHint(t){
  const el = document.getElementById('flowHint');
  if(el) el.textContent = t || T('flow.hint');
}
function openFlowWin(id){
  const f = findBlock(id); if(!f || f.b.type!=='flow') return;
  flowId = id; flowPick(null); flowSelEdge = null; flowLinkFrom = null;
  const w = document.getElementById('flowDlg');
  w.style.display = 'flex';
  placeFloatWin(w);
  /* 開啟時，以圖能放進視窗的大小顯示 */
  const fl = ensureFlow(f.b);
  const wrap = document.getElementById('flowCanvasWrap');
  const avail = Math.max(120, (wrap.clientWidth||420) - 40);
  flowZoom = Math.max(0.4, Math.min(1.6, Math.round(avail/(fl.w*FLOW_MM)*20)/20));
  renderFlowWin(true);
}
function closeFlowWin(){
  flowId = null; flowLinkFrom = null;
  document.getElementById('flowDlg').style.display = 'none';
}
/* 為了能抓到線，在看得見的線上疊一條粗的透明線（只在編輯視窗） */
function flowEdgeHitSVG(f, e){
  const a = flowNode(f, e.a), b = flowNode(f, e.b);
  if(!a || !b) return '';
  const p1 = flowClip(a, b.x+b.w/2, b.y+b.h/2), p2 = flowClip(b, a.x+a.w/2, a.y+a.h/2);
  return '<line data-fedge="'+e.id+'" x1="'+fnum(p1[0])+'" y1="'+fnum(p1[1])+'" x2="'+fnum(p2[0])
    + '" y2="'+fnum(p2[1])+'" stroke="'+(e.id===flowSelEdge?'rgba(196,160,74,.85)':'transparent')
    + '" stroke-width="'+(e.id===flowSelEdge?1.2:2.4)+'" style="cursor:pointer" vector-effect="non-scaling-stroke"/>';
}
function flowCanvasSVG(fl){
  return fl.edges.map(e=>flowEdgeSVG(fl,e)).join('')
       + fl.nodes.map(n=>flowShapeSVG(n)+flowSplitSVG(n)).join('')
       + fl.edges.map(e=>flowEdgeHitSVG(fl,e)).join('');
}
function renderFlowWin(force){
  const b = flowBlk();
  /* 正在編輯的流程圖消失時（刪除・重新讀取），視窗也關閉 */
  if(!b){ if(flowId) closeFlowWin(); return; }
  /* 避免已消失的方框仍處於選取狀態 */
  const alive = new Set((b.flow&&b.flow.nodes||[]).map(n=>n.id));
  [...flowSelSet].forEach(id=>{ if(!alive.has(id)) flowSelSet.delete(id); });
  if(flowSel && !alive.has(flowSel)) flowSel = [...flowSelSet].pop() || null;
  const fl = ensureFlow(b);
  const cv = document.getElementById('flowCanvas');
  cv.innerHTML = flowHTML(b, true);
  cv.style.zoom = flowZoom;
  cv.style.fontSize = (+S.base||10)+'pt';
  const svg = cv.querySelector('svg.fwsvg');
  if(svg) svg.innerHTML = flowCanvasSVG(fl);
  cv.querySelectorAll('[data-fnode]').forEach(el=>{
    const on = flowSelSet.has(el.dataset.fnode);
    el.classList.toggle('pick', on);
    if(on) el.insertAdjacentHTML('beforeend',
      '<div class="fwlink" title="'+T('flow.linkTip')+'"></div>'
      + '<div class="fwgrip" title="'+T('flow.gripTip')+'"></div>');
  });
  cv.classList.toggle('linking', !!flowLinkFrom);
  renderFlowProp(force);
}
/* 只反映位置與大小（拖曳途中不重建） */
function flowRepaint(){
  const b = flowBlk(); if(!b) return;
  const fl = ensureFlow(b);
  const cv = document.getElementById('flowCanvas');
  const svg = cv.querySelector('svg.fwsvg');
  if(svg) svg.innerHTML = flowCanvasSVG(fl);
  fl.nodes.forEach(n=>{
    const el = cv.querySelector('[data-fnode="'+n.id+'"]');
    if(!el) return;
    el.style.left = fnum(n.x)+'mm'; el.style.top = fnum(n.y)+'mm';
    el.style.width = fnum(n.w)+'mm'; el.style.height = fnum(n.h)+'mm';
  });
}
function flowPt(e){
  const cv = document.getElementById('flowCanvas');
  const r = cv.getBoundingClientRect();
  return { x:(e.clientX-r.left)/(flowZoom*FLOW_MM), y:(e.clientY-r.top)/(flowZoom*FLOW_MM) };
}
/* 只重新塗上選取的標記（不重建，所以框選途中也很輕快） */
function flowPaintPick(){
  const cv = document.getElementById('flowCanvas');
  cv.querySelectorAll('[data-fnode]').forEach(el=>{
    const on = flowSelSet.has(el.dataset.fnode);
    if(el.classList.contains('pick')===on) return;
    el.classList.toggle('pick', on);
    el.querySelectorAll('.fwlink,.fwgrip').forEach(x=>x.remove());
    if(on) el.insertAdjacentHTML('beforeend',
      '<div class="fwlink" title="'+T('flow.linkTip')+'"></div>'
      + '<div class="fwgrip" title="'+T('flow.gripTip')+'"></div>');
  });
}
function flowShowMarquee(x,y,w,h){
  const cv = document.getElementById('flowCanvas');
  let m = cv.querySelector('.fwmq');
  if(!m){ m = document.createElement('div'); m.className='fwmq'; cv.appendChild(m); }
  m.style.left=fnum(x)+'mm'; m.style.top=fnum(y)+'mm';
  m.style.width=fnum(w)+'mm'; m.style.height=fnum(h)+'mm';
}
function flowHideMarquee(){
  const m = document.querySelector('#flowCanvas .fwmq');
  if(m) m.remove();
}
/* 收在圖的範圍內，不超出 */
function flowFit(fl, n){
  n.w = Math.max(FLOW_MIN_W, Math.min(n.w, fl.w));
  n.h = Math.max(FLOW_MIN_H, Math.min(n.h, fl.h));
  n.x = Math.max(0, Math.min(n.x, fl.w-n.w));
  n.y = Math.max(0, Math.min(n.y, fl.h-n.h));
}
(function initFlowWin(){
  const cv = document.getElementById('flowCanvas');
  cv.addEventListener('pointerdown', e=>{
    if(e.button!==0) return;
    const b = flowBlk(); if(!b) return;
    const fl = ensureFlow(b);
    const nd = e.target.closest('[data-fnode]');
    const ed = e.target.closest('[data-fedge]');
    /* 正在拉線的話，下一個按的方框就是連接目標 */
    if(flowLinkFrom){
      if(nd && nd.dataset.fnode!==flowLinkFrom){
        const to = nd.dataset.fnode;
        if(!fl.edges.some(x=>x.a===flowLinkFrom && x.b===to))
          fl.edges.push({id:uid(), a:flowLinkFrom, b:to, lb:''});
        flowSelEdge = null; flowPick(to);
        setStatus(T('status.lineConnected'),'var(--ok)');
      } else setStatus(T('status.lineCancelled'));
      flowLinkFrom = null;
      render(); save(); renderFlowWin(true);
      e.preventDefault(); return;
    }
    if(nd && e.target.closest('.fwlink')){
      flowLinkFrom = nd.dataset.fnode;
      cv.classList.add('linking');
      setFlowHint(T('flow.pickTarget'));
      e.preventDefault(); return;
    }
    /* 抓住時不重建。重建的話，正在抓的元素會被換掉 */
    if(nd && e.target.closest('.fwgrip')){
      const n = flowNode(fl, nd.dataset.fnode); if(!n) return;
      flowPick(n.id); flowSelEdge = null;
      flowDrag = {mode:'size', id:n.id, p:flowPt(e), w:n.w, h:n.h};
      flowPaintPick(); renderFlowProp(true);
      e.preventDefault(); return;
    }
    if(nd){
      const n = flowNode(fl, nd.dataset.fnode); if(!n) return;
      flowPick(n.id, e.shiftKey || e.ctrlKey || e.metaKey);
      flowSelEdge = null;
      /* 選取的東西一起移動 */
      flowDrag = {mode:'move', p:flowPt(e),
        start: flowSelNodes(fl).map(x=>({id:x.id, x:x.x, y:x.y}))};
      flowPaintPick(); renderFlowProp(true);
      e.preventDefault(); return;
    }
    if(ed){
      flowSelEdge = ed.dataset.fedge; flowPick(null);
      renderFlowWin(true); e.preventDefault(); return;
    }
    /* 抓住空白處就是框選 */
    flowSelEdge = null;
    if(!(e.shiftKey||e.ctrlKey||e.metaKey)) flowPick(null);
    const p0 = flowPt(e);
    flowMarquee = {x0:p0.x, y0:p0.y, x1:p0.x, y1:p0.y,
      keep: new Set(flowSelSet)};
    renderFlowWin(true);
    e.preventDefault();
  });
  addEventListener('pointermove', e=>{
    const b = flowBlk(); if(!b) return;
    const fl = ensureFlow(b);
    if(flowMarquee){
      const p = flowPt(e);
      flowMarquee.x1 = p.x; flowMarquee.y1 = p.y;
      const x0=Math.min(flowMarquee.x0,p.x), x1=Math.max(flowMarquee.x0,p.x);
      const y0=Math.min(flowMarquee.y0,p.y), y1=Math.max(flowMarquee.y0,p.y);
      flowSelSet = new Set(flowMarquee.keep);
      fl.nodes.forEach(n=>{
        if(n.x+n.w>=x0 && n.x<=x1 && n.y+n.h>=y0 && n.y<=y1) flowSelSet.add(n.id);
      });
      flowSel = [...flowSelSet].pop() || null;
      flowPaintPick();
      flowShowMarquee(x0,y0,x1-x0,y1-y0);
      return;
    }
    if(!flowDrag) return;
    const p = flowPt(e);
    if(flowDrag.mode==='move'){
      const dx = p.x-flowDrag.p.x, dy = p.y-flowDrag.p.y;
      flowDrag.start.forEach(s=>{
        const n = flowNode(fl, s.id); if(!n) return;
        n.x = s.x + dx; n.y = s.y + dy;
        /* 每 0.5mm 輕輕吸附一下（按住 Alt 時可自由移動） */
        if(!e.altKey){ n.x = Math.round(n.x*2)/2; n.y = Math.round(n.y*2)/2; }
        flowFit(fl, n);
      });
    }else{
      const n = flowNode(fl, flowDrag.id); if(!n) return;
      n.w = flowDrag.w + (p.x-flowDrag.p.x);
      n.h = flowDrag.h + (p.y-flowDrag.p.y);
      if(!e.altKey){ n.w = Math.round(n.w*2)/2; n.h = Math.round(n.h*2)/2; }
      flowFit(fl, n);
    }
    flowRepaint();
  });
  addEventListener('pointerup', ()=>{
    if(flowMarquee){
      flowMarquee = null; flowHideMarquee();
      renderFlowWin(true);
      if(flowSelSet.size>1) setStatus(T('status.boxesSelected', flowSelSet.size),'var(--ok)');
      return;
    }
    if(!flowDrag) return;
    flowDrag = null;
    render(); save(); renderFlowProp(true);
  });
  document.getElementById('flowBar').addEventListener('click', e=>{
    const ad = e.target.closest('[data-fadd]'); if(!ad) return;
    const b = flowBlk(); if(!b) return;
    const fl = ensureFlow(b);
    /* 放在選取中的方框下方，沒有的話就放在正中央附近 */
    const base = flowSel ? flowNode(fl, flowSel) : null;
    const n = newFlowNode(base ? base.x : (fl.w-44)/2, base ? base.y+base.h+10 : 8, '');
    n.kind = ad.dataset.fadd;
    if(n.kind==='diamond'){ n.w = 40; n.h = 20; }
    if(n.kind==='term'){ n.h = 12; }
    flowFit(fl, n);
    if(n.y + n.h > fl.h) fl.h = Math.min(600, n.y + n.h + 6);
    fl.nodes.push(n);
    if(base) fl.edges.push({id:uid(), a:base.id, b:n.id, lb:''});
    flowPick(n.id); flowSelEdge = null;
    render(); save(); renderFlowWin(true);
    const ta = document.querySelector('#flowProp [data-fp="t"]');
    if(ta){ ta.focus(); }
  });
  document.getElementById('flowClose').onclick = closeFlowWin;
  document.getElementById('flowZoomIn').onclick = ()=>{
    flowZoom = Math.min(3, Math.round((flowZoom+0.2)*10)/10); renderFlowWin(true); };
  document.getElementById('flowZoomOut').onclick = ()=>{
    flowZoom = Math.max(0.4, Math.round((flowZoom-0.2)*10)/10); renderFlowWin(true); };
  bindFloatWin('flowDlg','flowBar','flowGrip');
  /* 與右側設定欄之間的分隔線 */
  const sp = document.getElementById('splitFlowProp');
  const pr = document.getElementById('flowProp');
  let d = null;
  sp.addEventListener('pointerdown', e=>{
    d = {x:e.clientX, w:pr.offsetWidth};
    document.body.classList.add('resizing'); sp.classList.add('drag');
    sp.setPointerCapture && sp.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  addEventListener('pointermove', e=>{
    if(!d) return;
    const main = document.getElementById('flowMain');
    const max = Math.max(150, (main?main.clientWidth:600) - 220 - 6);
    pr.style.flex = '0 1 '+Math.max(150, Math.min(d.w - (e.clientX-d.x), max))+'px';
  });
  addEventListener('pointerup', ()=>{
    if(!d) return;
    d = null; document.body.classList.remove('resizing'); sp.classList.remove('drag');
  });
})();
/* 方框・線・整張圖的設定 */
/* 對齊方式的清單。選取多個時顯示 */
/* 對齊方式的圖示。只有文字的話不容易分辨縱橫，所以在按鈕上附小圖。
   在 16×16 的框裡，畫出基準線（金色）與要對齊的方框（白色） */
function fai(inner){
  return '<svg class="fai" viewBox="0 0 16 16" aria-hidden="true">'+inner+'</svg>';
}
const FA_G = 'fill="none" stroke="var(--brass)" stroke-width="1.4" stroke-linecap="round"';
const FA_B = 'fill="currentColor" opacity=".85"';
const FLOW_ALIGN = [
  ['left','flow.al.left',
    fai('<line x1="2" y1="2" x2="2" y2="14" '+FA_G+'/>'
      + '<rect x="4" y="3.4" width="9" height="3.6" rx="1" '+FA_B+'/>'
      + '<rect x="4" y="9" width="5.5" height="3.6" rx="1" '+FA_B+'/>')],
  ['hcenter','flow.al.hcenter',
    fai('<line x1="8" y1="2" x2="8" y2="14" '+FA_G+'/>'
      + '<rect x="3.5" y="3.4" width="9" height="3.6" rx="1" '+FA_B+'/>'
      + '<rect x="5.2" y="9" width="5.5" height="3.6" rx="1" '+FA_B+'/>')],
  ['right','flow.al.right',
    fai('<line x1="14" y1="2" x2="14" y2="14" '+FA_G+'/>'
      + '<rect x="3" y="3.4" width="9" height="3.6" rx="1" '+FA_B+'/>'
      + '<rect x="6.5" y="9" width="5.5" height="3.6" rx="1" '+FA_B+'/>')],
  ['top','flow.al.top',
    fai('<line x1="2" y1="2" x2="14" y2="2" '+FA_G+'/>'
      + '<rect x="3.4" y="4" width="3.6" height="9" rx="1" '+FA_B+'/>'
      + '<rect x="9" y="4" width="3.6" height="5.5" rx="1" '+FA_B+'/>')],
  ['vcenter','flow.al.vcenter',
    fai('<line x1="2" y1="8" x2="14" y2="8" '+FA_G+'/>'
      + '<rect x="3.4" y="3.5" width="3.6" height="9" rx="1" '+FA_B+'/>'
      + '<rect x="9" y="5.2" width="3.6" height="5.5" rx="1" '+FA_B+'/>')],
  ['bottom','flow.al.bottom',
    fai('<line x1="2" y1="14" x2="14" y2="14" '+FA_G+'/>'
      + '<rect x="3.4" y="3" width="3.6" height="9" rx="1" '+FA_B+'/>'
      + '<rect x="9" y="6.5" width="3.6" height="5.5" rx="1" '+FA_B+'/>')],
  ['wsame','flow.al.wsame',
    fai('<rect x="2" y="3" width="12" height="4" rx="1" '+FA_B+'/>'
      + '<rect x="2" y="9" width="12" height="4" rx="1" fill="none" stroke="var(--brass)" stroke-width="1.2" stroke-dasharray="2 1.6"/>')],
  ['hsame','flow.al.hsame',
    fai('<rect x="3" y="2" width="4" height="12" rx="1" '+FA_B+'/>'
      + '<rect x="9" y="2" width="4" height="12" rx="1" fill="none" stroke="var(--brass)" stroke-width="1.2" stroke-dasharray="2 1.6"/>')],
  ['hgap','flow.al.hgap',
    fai('<rect x="1.6" y="4" width="3" height="8" rx="1" '+FA_B+'/>'
      + '<rect x="6.5" y="4" width="3" height="8" rx="1" '+FA_B+'/>'
      + '<rect x="11.4" y="4" width="3" height="8" rx="1" '+FA_B+'/>'
      + '<line x1="5.1" y1="8" x2="6" y2="8" '+FA_G+'/>'
      + '<line x1="10" y1="8" x2="10.9" y2="8" '+FA_G+'/>')],
  ['vgap','flow.al.vgap',
    fai('<rect x="4" y="1.6" width="8" height="3" rx="1" '+FA_B+'/>'
      + '<rect x="4" y="6.5" width="8" height="3" rx="1" '+FA_B+'/>'
      + '<rect x="4" y="11.4" width="8" height="3" rx="1" '+FA_B+'/>'
      + '<line x1="8" y1="5.1" x2="8" y2="6" '+FA_G+'/>'
      + '<line x1="8" y1="10" x2="8" y2="10.9" '+FA_G+'/>')]
];
/* 框形狀的圖示。讓選了哪種形狀一眼就看得出來 */
const FLOW_KIND_ICON = {
  box:     fai('<rect x="1.5" y="4" width="13" height="8" rx="0.6" '+FA_B+'/>'),
  round:   fai('<rect x="1.5" y="4" width="13" height="8" rx="2.6" '+FA_B+'/>'),
  diamond: fai('<polygon points="8,3 14.5,8 8,13 1.5,8" '+FA_B+'/>'),
  term:    fai('<rect x="1.5" y="4.5" width="13" height="7" rx="3.5" '+FA_B+'/>'),
  io:      fai('<polygon points="4,4 14.5,4 12,12 1.5,12" '+FA_B+'/>')
};
function flowAlign(mode){
  const b = flowBlk(); if(!b) return;
  const fl = ensureFlow(b);
  const ns = flowSelNodes(fl);
  if(ns.length<2){ setStatus(T('status.pick2'),'#ff9b83'); return; }
  const L = Math.min(...ns.map(n=>n.x)), R = Math.max(...ns.map(n=>n.x+n.w));
  /* 收錄版：上緣原本叫 T，會遮住翻譯函式 T()，所以改名為 TP */
  const TP = Math.min(...ns.map(n=>n.y)), B = Math.max(...ns.map(n=>n.y+n.h));
  if(mode==='left')    ns.forEach(n=>n.x=L);
  if(mode==='right')   ns.forEach(n=>n.x=R-n.w);
  if(mode==='hcenter'){ const c=(L+R)/2; ns.forEach(n=>n.x=c-n.w/2); }
  if(mode==='top')     ns.forEach(n=>n.y=TP);
  if(mode==='bottom')  ns.forEach(n=>n.y=B-n.h);
  if(mode==='vcenter'){ const c=(TP+B)/2; ns.forEach(n=>n.y=c-n.h/2); }
  if(mode==='wsame'){ const w=Math.max(...ns.map(n=>n.w)); ns.forEach(n=>n.w=w); }
  if(mode==='hsame'){ const h=Math.max(...ns.map(n=>n.h)); ns.forEach(n=>n.h=h); }
  if(mode==='hgap'){
    const a=[...ns].sort((p,q)=>p.x-q.x);
    const sum=a.reduce((s,n)=>s+n.w,0);
    const gap=(R-L-sum)/(a.length-1);
    let x=L; a.forEach(n=>{ n.x=x; x+=n.w+gap; });
  }
  if(mode==='vgap'){
    const a=[...ns].sort((p,q)=>p.y-q.y);
    const sum=a.reduce((s,n)=>s+n.h,0);
    const gap=(B-TP-sum)/(a.length-1);
    let y=TP; a.forEach(n=>{ n.y=y; y+=n.h+gap; });
  }
  ns.forEach(n=>{ n.x=Math.round(n.x*2)/2; n.y=Math.round(n.y*2)/2;
                  n.w=Math.round(n.w*2)/2; n.h=Math.round(n.h*2)/2; flowFit(fl,n); });
  render(); save(); renderFlowWin(true);
  setStatus(T('status.boxesAligned', ns.length),'var(--ok)');
}
function renderFlowProp(force){
  const box = document.getElementById('flowProp');
  const b = flowBlk();
  if(!b){ box.innerHTML=''; return; }
  /* 打字途中重建的話，游標會跑掉 */
  if(!force && box.contains(document.activeElement)) return;
  const fl = ensureFlow(b);
  const many = flowSelSet.size>1 ? flowSelNodes(fl) : null;
  const n = (!many && flowSel) ? flowNode(fl, flowSel) : null;
  const ed = flowSelEdge ? fl.edges.find(x=>x.id===flowSelEdge) : null;
  const num = (k,v,mn,mx,st)=>'<input type="number" data-fp="'+k+'" value="'+fnum(v)
    + '" min="'+mn+'" max="'+mx+'" step="'+(st||0.5)+'">';
  let h = '';
  if(many){
    h += '<div class="hint" style="margin-bottom:8px">'+T('flow.manySel', many.length)
      + T('flow.manyHint')+'</div>'
      + '<label class="f">'+T('flow.align')+'</label><div class="alignrow">'
      + FLOW_ALIGN.map(a=>'<button data-falign="'+a[0]+'" title="'+esc(T(a[1]))+'">'+a[2]+esc(T(a[1]))+'</button>').join('')
      + '</div>'
      + '<label class="f">'+T('flow.bulkChange')+'</label><div class="kindrow">'
      + FLOW_KINDS.map(k=>'<button data-fkind="'+k[0]+'" title="'+esc(T(k[1]))+'">'+(FLOW_KIND_ICON[k[0]]||'')+esc(T(k[1]))+'</button>').join('')
      + '</div><div class="row" style="margin-top:5px">'
      + '<button class="colsw" data-fcol="" title="'+T('flow.defaultCol')+'" style="background:#23201c"></button>'
      + BX_COLS.map(c=>'<button class="colsw" data-fcol="'+c.k+'" title="'+c.n+'" style="background:'+c.c+'"></button>').join('')
      + '</div>'
      + '<label class="f">'+T('flow.bulkSize')+'</label>'
      + '<div class="grid2"><div><span class="hint">'+T('flow.w')+'</span>'
      + '<input type="number" data-fp="mw" placeholder="'+T('flow.keep')+'" min="'+FLOW_MIN_W+'" max="400" step="0.5"></div>'
      + '<div><span class="hint">'+T('flow.h')+'</span>'
      + '<input type="number" data-fp="mh" placeholder="'+T('flow.keep')+'" min="'+FLOW_MIN_H+'" max="600" step="0.5"></div></div>'
      + '<label class="f">'+T('flow.bulkPad')+'</label>'
      + '<input type="number" data-fp="mpad" placeholder="'+T('flow.keep')+'" min="0" max="20" step="0.5">'
      + '<div class="row" style="margin-top:10px">'
      + '<button data-fdo="mdup">'+T('flow.bulkDup')+'</button>'
      + '<button data-fdo="mdel" class="danger">'+T('flow.bulkDel')+'</button></div>';
  }
  else if(n){
    h += '<label class="f">'+T('flow.text1')+'</label>'
      + '<textarea data-fp="t" rows="2" placeholder="'+T('common.writeHere')+'">'+esc(n.t)+'</textarea>'
      + '<label class="f">'+T('flow.text2')+'</label>'
      + '<textarea data-fp="t2" rows="2" placeholder="'+T('common.optional')+'">'+esc(n.t2)+'</textarea>'
      + '<label class="f">'+T('flow.kind')+'</label><div class="kindrow">'
      + FLOW_KINDS.map(k=>'<button data-fkind="'+k[0]+'" title="'+esc(T(k[1]))+'"'+(n.kind===k[0]?' class="on"':'')+'>'+(FLOW_KIND_ICON[k[0]]||'')+esc(T(k[1]))+'</button>').join('')
      + '</div>'
      + '<label class="f">'+T('common.color')+'</label><div class="row">'
      + '<button class="colsw'+(n.col===''?' on':'')+'" data-fcol="" title="'+T('flow.defaultCol')+'" style="background:#23201c"></button>'
      + BX_COLS.map(c=>'<button class="colsw'+(n.col===c.k?' on':'')+'" data-fcol="'+c.k+'" title="'+c.n+'" style="background:'+c.c+'"></button>').join('')
      + '</div>'
      + '<label class="f">'+T('flow.size')+'</label>'
      + '<div class="grid2"><div><span class="hint">'+T('flow.w')+'</span>'+num('w',n.w,FLOW_MIN_W,400)+'</div>'
      + '<div><span class="hint">'+T('flow.h')+'</span>'+num('h',n.h,FLOW_MIN_H,600)+'</div></div>'
      + '<label class="f">'+T('flow.pos')+'</label>'
      + '<div class="grid2"><div><span class="hint">'+T('flow.fromLeft')+'</span>'+num('x',n.x,0,400)+'</div>'
      + '<div><span class="hint">'+T('flow.fromTop')+'</span>'+num('y',n.y,0,600)+'</div></div>'
      + '<label class="f">'+T('flow.pad')+'</label>'+num('pad',n.pad,0,20,0.5)
      + '<div class="row" style="margin-top:10px">'
      + '<button data-fdo="link">'+T('flow.linkFrom')+'</button>'
      + '<button data-fdo="dup">'+T('common.dup')+'</button>'
      + '<button data-fdo="del" class="danger">'+T('flow.delBox')+'</button></div>';
  } else if(ed){
    h += '<label class="f">'+T('flow.edgeLabel')+'</label>'
      + '<input type="text" data-fp="lb" value="'+esc(ed.lb)+'" placeholder="'+T('flow.edgeLabelPh')+'">'
      + '<div class="hint" style="margin-top:6px">'+T('flow.edgeDir')+'</div>'
      + '<div class="row" style="margin-top:10px">'
      + '<button data-fdo="eflip">'+T('flow.flip')+'</button>'
      + '<button data-fdo="edel" class="danger">'+T('flow.delLine')+'</button></div>';
  } else {
    h += '<div class="hint">'+T('flow.idleHint1')+'<br>'
      + T('flow.idleHint2')+'</div>';
  }
  h += '<div style="border-top:1px solid var(--line);margin:14px 0 0"></div>'
    + '<label class="f">'+T('flow.whole')+'</label>'
    + '<div class="grid2"><div><span class="hint">'+T('flow.w')+'</span>'+num('fw',fl.w,30,400)+'</div>'
    + '<div><span class="hint">'+T('flow.h')+'</span>'+num('fh',fl.h,20,600)+'</div></div>'
    + '<div class="row" style="margin-top:6px"><button data-fdo="fit">'+T('flow.fit')+'</button></div>'
    + '<div class="hint" style="margin-top:6px">'+T('flow.counts', fl.nodes.length, fl.edges.length)
    + T('flow.tooWide')+'</div>';
  box.innerHTML = h;
}
(function initFlowProp(){
  const box = document.getElementById('flowProp');
  const cur = ()=>{
    const b = flowBlk(); if(!b) return null;
    const fl = ensureFlow(b);
    const many = flowSelSet.size>1 ? flowSelNodes(fl) : null;
    return {b:b, fl:fl, many:many,
            n: (!many && flowSel) ? flowNode(fl,flowSel) : null,
            e: flowSelEdge?fl.edges.find(x=>x.id===flowSelEdge):null};
  };
  box.addEventListener('input', e=>{
    const c = cur(); if(!c) return;
    const el = e.target.closest('[data-fp]'); if(!el) return;
    const k = el.dataset.fp, v = el.value;
    if(k==='fw'||k==='fh'){
      c.fl[k==='fw'?'w':'h'] = Math.max(k==='fw'?30:20, +v||0);
      c.fl.nodes.forEach(n=>flowFit(c.fl,n));
      render(); save(); flowRepaint();
      const cv=document.getElementById('flowCanvas');
      cv.querySelector('.fwc').style.width = fnum(c.fl.w)+'mm';
      cv.querySelector('.fwc').style.height = fnum(c.fl.h)+'mm';
      return;
    }
    if(c.e && k==='lb'){ c.e.lb = v; render(); save(); flowRepaint(); return; }
    if(c.many && (k==='mw'||k==='mh'||k==='mpad')){
      if(v==='') return;
      const val = +v||0;
      c.many.forEach(x=>{
        if(k==='mw') x.w = Math.max(FLOW_MIN_W, val);
        if(k==='mh') x.h = Math.max(FLOW_MIN_H, val);
        if(k==='mpad') x.pad = Math.max(0, Math.min(20, val));
        flowFit(c.fl, x);
      });
      render(); save();
      if(k==='mpad') renderFlowWinText(); else flowRepaint();
      return;
    }
    if(!c.n) return;
    if(k==='t' || k==='t2'){ c.n[k] = v; render(); save(); renderFlowWinText(); return; }
    if(['w','h','x','y','pad'].indexOf(k)>=0){
      c.n[k] = +v||0; flowFit(c.fl, c.n);
      render(); save();
      if(k==='pad'){ renderFlowWinText(); } else flowRepaint();
    }
  });
  box.addEventListener('click', e=>{
    const c = cur(); if(!c) return;
    const al = e.target.closest('[data-falign]');
    if(al){ flowAlign(al.dataset.falign); return; }
    const kd = e.target.closest('[data-fkind]');
    if(kd){
      const list = c.many || (c.n?[c.n]:[]);
      list.forEach(x=>{ x.kind = kd.dataset.fkind; });
      if(list.length){ render(); save(); renderFlowWin(true); }
      return;
    }
    const cl = e.target.closest('[data-fcol]');
    if(cl){
      const list = c.many || (c.n?[c.n]:[]);
      list.forEach(x=>{ x.col = cl.dataset.fcol; });
      if(list.length){ render(); save(); renderFlowWin(true); }
      return;
    }
    const dm = e.target.closest('[data-fdo]'); if(!dm) return;
    const k = dm.dataset.fdo;
    if(k==='mdup' && c.many){
      const made = c.many.map(x=>{
        const y = JSON.parse(JSON.stringify(x));
        y.id = uid(); y.x += 4; y.y += 4; flowFit(c.fl, y); return y;
      });
      c.fl.nodes.push(...made);
      flowSelSet = new Set(made.map(x=>x.id)); flowSel = made[made.length-1].id;
      render(); save(); renderFlowWin(true); return;
    }
    if(k==='mdel' && c.many){
      const ids = new Set(c.many.map(x=>x.id));
      c.fl.nodes = c.fl.nodes.filter(x=>!ids.has(x.id));
      c.fl.edges = c.fl.edges.filter(x=>!ids.has(x.a) && !ids.has(x.b));
      flowPick(null);
      render(); save(); renderFlowWin(true);
      setStatus(T('status.boxesDeleted', ids.size),'var(--ok)'); return;
    }
    if(k==='link' && c.n){
      flowLinkFrom = c.n.id;
      document.getElementById('flowCanvas').classList.add('linking');
      setFlowHint(T('flow.pickTarget'));
      return;
    }
    if(k==='dup' && c.n){
      const n2 = JSON.parse(JSON.stringify(c.n));
      n2.id = uid(); n2.x += 4; n2.y += 4; flowFit(c.fl, n2);
      c.fl.nodes.push(n2); flowPick(n2.id);
      render(); save(); renderFlowWin(true); return;
    }
    if(k==='del' && c.n){
      c.fl.nodes = c.fl.nodes.filter(x=>x.id!==c.n.id);
      c.fl.edges = c.fl.edges.filter(x=>x.a!==c.n.id && x.b!==c.n.id);
      flowPick(null);
      render(); save(); renderFlowWin(true);
      setStatus(T('status.boxDeleted'),'var(--ok)'); return;
    }
    if(k==='eflip' && c.e){ const a=c.e.a; c.e.a=c.e.b; c.e.b=a; render(); save(); renderFlowWin(true); return; }
    if(k==='edel' && c.e){
      c.fl.edges = c.fl.edges.filter(x=>x.id!==c.e.id);
      flowSelEdge = null; render(); save(); renderFlowWin(true);
      setStatus(T('status.lineDeleted'),'var(--ok)'); return;
    }
    if(k==='fit'){
      let mx=0, my=0;
      c.fl.nodes.forEach(n=>{ mx=Math.max(mx,n.x+n.w); my=Math.max(my,n.y+n.h); });
      c.fl.w = Math.max(30, Math.min(400, Math.ceil(mx+5)));
      c.fl.h = Math.max(20, Math.min(600, Math.ceil(my+5)));
      render(); save(); renderFlowWin(true); return;
    }
  });
})();
/* 只重畫文字與間距（打字途中重建的話游標會跑掉，
   所以設定欄本身不動） */
function renderFlowWinText(){
  const b = flowBlk(); if(!b) return;
  const fl = ensureFlow(b);
  const cv = document.getElementById('flowCanvas');
  fl.nodes.forEach(n=>{
    const el = cv.querySelector('[data-fnode="'+n.id+'"]');
    if(!el) return;
    el.className = 'fwn'+(n.t2?' two':'')+' k-'+n.kind+(n.id===flowSel?' pick':'');
    el.style.padding = fnum(n.pad)+'mm';
    const a = el.querySelector('.fwn-a'), b2 = el.querySelector('.fwn-b');
    if(a) a.innerHTML = rubyHTML(n.t);
    if(n.t2){
      if(b2) b2.innerHTML = rubyHTML(n.t2);
      else a && a.insertAdjacentHTML('afterend','<div class="fwn-b">'+rubyHTML(n.t2)+'</div>');
    } else if(b2) b2.remove();
  });
  const svg = cv.querySelector('svg.fwsvg');
  if(svg) svg.innerHTML = flowCanvasSVG(fl);
}
/* 彈出視窗裡可以加入的書式。只排出常用的 */
const POP_ADD = ['desc','dialog','note','proc','h2','h3','hr','table','image','popup'];
function setPopMode(p){
  const blk = popIsBlocks(p);
  document.getElementById('popRich').style.display      = blk ? 'none' : 'flex';
  document.getElementById('popTextWrap').style.display  = blk ? 'none' : 'flex';
  document.getElementById('popMain').style.display      = blk ? 'flex' : 'none';
  document.getElementById('popHint').textContent = blk
    ? T('popwin.hintBlocks')
    : T('popwin.hintText');
  if(blk){ renderPopWin(); } else drawPopupPreview();
}
/* 重建視窗裡的內容。排法與紙面相同，只是不分頁 */
/* force=true 表示「新增／刪除了段落」等排列本身有變化時。
   即使正在打字也要重新排，否則新增的段落不會出現在這個視窗
   （之後由呼叫端重新放置游標） */
function renderPopWin(force){
  renderPopSrc(force);
  if(!popId) return;
  const f = findBlock(popId); if(!f || f.b.type!=='popup') return;
  const p = ensurePopup(f.b);
  if(!popIsBlocks(p)) return;
  const host = document.getElementById('popBlocks');
  /* 打字途中重建的話，會找不到打字的位置 */
  if(!force && host.contains(document.activeElement)) return;
  host.innerHTML = popBlocksHTML(p.blocks, true);
  host.querySelectorAll('.blkpad[data-id]').forEach(w=>{
    const on = sel.has(w.dataset.id);
    w.classList.toggle('pickwrap', on);
    const el = w.querySelector('.blk');
    if(el) el.classList.toggle('pick', on);
  });
}
/* 點了視窗裡的段落，就和點紙面時一樣選取 */
/* 在空段落按 Backspace，就刪除該段落並移到前一個段落。
   視窗裡沒有「刪除」可按，所以讓使用者能順著打字的流程刪除 */
npcOn('keydown', e=>{
  if(e.key!=='Backspace') return;
  if(imeBusy(e)) return;
  const t = e.target.closest('[data-btext]'); if(!t) return;
  if(t.innerText.replace(/\n/g,'').trim() !== '') return;   // 還有內容時不刪除
  const f = findBlock(t.dataset.btext); if(!f) return;
  /* 紙面的內文會留下最後一個。儲存格或彈出視窗裡可以是空的 */
  if(f.list.length<=1 && f.list===S.blocks){
    setStatus(T('status.cantDelLast'),'#ff9b83'); return; }
  e.preventDefault();
  const root = t.closest('#popBlocks,#stage,#npcDlgBody') || document;
  const own = cellOwnerOf(f.list);
  const prev = f.list[f.i-1] || f.list[f.i+1];
  f.list.splice(f.i,1);
  sel.clear(); if(prev) sel.add(prev.id);
  render(); save();
  if(prev){
    const el = root.isConnected ? root.querySelector('[data-btext="'+prev.id+'"]') : null;
    if(el){ el.focus();
      const r=document.createRange(); r.selectNodeContents(el); r.collapse(false);
      const sl=getSelection(); sl.removeAllRanges(); sl.addRange(r); }
    else focusSrc(prev.id, true);
  }
  /* 儲存格變空的話，把游標放回該儲存格的文字 */
  else focusCellText(own, root);
  setStatus(T('status.paraDeleted'),'var(--ok)');
});
/* 把在視窗上打的字，直接寫回段落 */
npcOn('input', e=>{
  const t = e.target.closest('[data-btext]'); if(!t) return;
  if(slashFire(t, e)) return;
  const f = findBlock(t.dataset.btext); if(!f) return;
  setBlockText(f.b, t.innerText.replace(/\n$/,''));
  /* 「文字」欄裡若也顯示同一個段落，那邊的文字也一起對齊 */
  mirrorSrcText(t.dataset.btext, f.b.text);
  repaginateSoon(); save();
});
document.getElementById('popBlocks').addEventListener('pointerdown', e=>{
  if(e.button!==0) return;
  if(e.target.closest(NPC_UI_SEL)) return;
  const blk=e.target.closest('.blkpad[data-id]'); if(!blk) return;
  /* 可輸入文字的段落，只能從把手移動（本體是給文字游標用的） */
  if(e.target.closest('[data-btext],[data-tname],input,textarea,select,button')
     && !onGrip(blk, e.clientX)) return;
  if(!sel.has(blk.dataset.id)){
    sel.clear(); sel.add(blk.dataset.id); lastPick=blk.dataset.id;
    paintSel(); renderPopWin();
  }
  moveDrag={ids:[...sel], x:e.clientX, y:e.clientY, started:false, from:'pop'};
  e.preventDefault();
});
document.getElementById('popBlocks').addEventListener('click', e=>{
  /* 點到輸入文字的欄（儲存格・表格名稱・段落內文）時，什麼都不做。
     在這裡重新選取的話，會重建視窗，連點到的儲存格本身都被重建，
     焦點還會跳到左側文章欄，於是變成「選得到卻打不了字」的狀態。 */
  if(e.target.closest(NPC_UI_SEL)) return;
  if(e.target.closest('[data-popopen],[data-tprev],button')) return;
  const el = e.target.closest('.blkpad[data-id]'); if(!el) return;
  sel.clear(); sel.add(el.dataset.id); lastPick = el.dataset.id;
  paintSel(); syncBlockPanel(); renderProps(); renderPopWin();
  focusSrc(el.dataset.id, true);
});
/* 在視窗裡進入文字欄時，視為選取了該段落（與紙面相同的處理）。
   不重建，所以打字的位置不會移動 */
npcOn('focusin', e=>{
  if(!e.target.closest('[data-tname],[data-btext]')) return;
  const el = e.target.closest('.blkpad[data-id]'); if(!el) return;
  const id = el.dataset.id;
  if(sel.size===1 && sel.has(id)) return;
  sel.clear(); sel.add(id); lastPick = id;
  srcAll('.src').forEach(x=>x.classList.toggle('pick', sel.has(x.dataset.id)));
  syncBlockPanel(); renderProps();
});
/* 在視窗的標題欄修改名稱。儲存格的 ＠名稱 是以名稱指向，
   所以改名後，指向該彈出視窗的儲存格或內文中的 ＠名稱 也要改寫 */
document.getElementById('popTitle').addEventListener('input', ()=>{
  const f = popId ? findBlock(popId) : null; if(!f || f.b.type!=='popup') return;
  const p = ensurePopup(f.b);
  const old = String(p.label||T('pop.defaultLabel'));
  const nw  = document.getElementById('popTitle').value;
  if(nw.trim() && nw!==old) renamePopRefs(old, nw);
  p.label = nw;
  repaginateSoon(); save();
});
/* 把 ＠名稱 的指向，依改名的內容改寫 */
function renamePopRefs(oldName, newName){
  const a = String(oldName||'').trim(), b = String(newName||'').trim();
  if(!a || !b || a===b) return;
  const fix = t => String(t||'').split('\n').map(ln=>{
    const m = ln.match(/^([＠@]\s*)([\s\S]*)$/);
    return (m && m[2].trim()===a) ? (m[1]+b) : ln;
  }).join('\n');
  allBlocks().forEach(x=>{
    if(RICH_TYPES.includes(x.type)) x.text = fix(x.text);
  });
}
function drawPopupPreview(){
  document.getElementById('popView').innerHTML = popupBodyHTML(document.getElementById('popEdit').value);
}
document.getElementById('popEdit').addEventListener('input', e=>{
  slashFireTA(document.getElementById('popEdit'), e);
  const f = popId?findBlock(popId):null;
  if(f && f.b.type==='popup'){ ensurePopup(f.b).body = document.getElementById('popEdit').value; save(); }
  drawPopupPreview();
});
function closePopup(){
  popId=null; document.getElementById('popDlg').style.display='none';
  if(tblModalId) tbigRichBar();
  render();                      // 設定欄由 placeProps() 移回右側
}
document.getElementById('popClose').onclick=closePopup;
addEventListener('keydown', e=>{ if(e.key==='Escape' && popId) closePopup(); });

/* 在紙面上修改儲存格時，直接寫回表格的內容。
   重新排版時 editingOnPage() 會避開輸入中的狀態，所以不會找不到打字的位置 */
npcOn('input', e=>{
  const nm = e.target.closest('[data-tname]'); if(nm){
    const b = tcellBlock(nm); if(!b) return;
    ensureTable(b).name = nm.innerText.replace(/\n+$/,'');
    repaginateSoon(); save();
  }
});
/* 按儲存格裡的按鈕（彈出視窗・輸出等）時，
   焦點移到儲存格而換成「原本的文字」，按鈕在按下之前就消失了。
   在 pointerdown 只阻止焦點的移動（click 之後會照常觸發） */
npcOn('pointerdown', e=>{
  if(e.target.closest('[data-popopen],[data-popmake],[data-tprev],.copybtn')) e.preventDefault();
});
/* 操作中的儲存格先恢復成原本的文字。離開後再回到排好的樣子 */
/* 該儲存格所屬的表格區塊。
   紙面上 id 加在 .blk，彈出視窗裡則加在外框的 .blkpad，
   所以為了兩邊都查得到，看「擁有 id 的最近父元素」 */
function blkOf(el){
  const h = el && el.closest ? el.closest('[data-id]') : null;
  return h ? findBlock(h.dataset.id) : null;
}
function tcellBlock(cell){
  const f = blkOf(cell);
  return (f && f.b.type==='table') ? f.b : null;
}
/* 最後操作的儲存格。為了讓書式按鈕或「在下方新增」作用到這個儲存格裡而記下來 */
let lastCell = null;
function cellTarget(){
  if(!lastCell) return null;
  const f = findBlock(lastCell.id);
  if(!f || f.b.type!=='table') { lastCell=null; return null; }
  const t = ensureTable(f.b);
  if(lastCell.r>=tblRows(t) || lastCell.c>=tblCols(t)){ lastCell=null; return null; }
  /* 重新選了別的段落，就優先對那個段落操作 */
  if(sel.size===1 && !sel.has(f.b.id)) return null;
  return {b:f.b, r:lastCell.r, c:lastCell.c};
}
/* 進入儲存格裡的段落時，把那裡記成「最後操作的儲存格」。
   書式按鈕或「在下方新增」的目標就會是該儲存格 */
npcOn('focusin', e=>{
  const nm0 = e.target.closest('[data-tname]');
  if(nm0){ const b0 = tcellBlock(nm0);
    if(b0 && !(sel.size===1 && sel.has(b0.id))){
      sel.clear(); sel.add(b0.id); lastPick=b0.id; paintSel(); }
    return; }
  const cw = e.target.closest('[data-cellkey]'); if(!cw) return;
  const owner = tcellBlock(cw); if(!owner) return;
  const rc = cw.dataset.cellkey.split(',').map(Number);
  lastCell = {id:owner.id, r:rc[0], c:rc[1]};
});
/* 在表格名稱的欄中，Enter 結束輸入，Esc 也結束輸入 */
npcOn('keydown', e=>{
  if(imeBusy(e)) return;
  const nm = e.target.closest('[data-tname]'); if(!nm) return;
  if(e.key==='Escape' || e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); nm.blur(); }
});
/* 在段落中按 Enter 到下一個段落，Shift+Enter 是一般換行。
   「文字」欄・紙面・彈出視窗・儲存格裡，任何地方都是同樣的規則 */
npcOn('keydown', e=>{
  if(e.key!=='Enter' || e.shiftKey) return;
  if(imeBusy(e)) return;
  const t = e.target.closest('[data-btext]'); if(!t) return;
  const f = findBlock(t.dataset.btext); if(!f) return;
  e.preventDefault();
  const off = caretOffset(t), txt = t.innerText.replace(/\n$/,'');
  setBlockText(f.b, txt.slice(0,off));
  const nb = newBlock('desc', txt.slice(off)); nb.cols = f.b.cols;
  f.list.splice(f.i+1, 0, nb);
  sel.clear(); sel.add(nb.id);
  const root = t.closest('#stage,#popBlocks,#npcDlgBody');
  render(); save();
  /* 游標留在按下的地方。只有放不了游標的書式才到「文字」欄 */
  if(!focusCellBlock(nb.id, root)) focusSrc(nb.id, false);
});
/* 在段落開頭按 Backspace：有內容的話就與前一個段落接起來（與「文字」欄相同） */
npcOn('keydown', e=>{
  if(e.key!=='Backspace') return;
  if(imeBusy(e)) return;
  const t = e.target.closest('[data-btext]'); if(!t) return;
  if(!t.innerText.replace(/\n/g,'').trim()) return;      // 空的時候交給刪除那邊處理
  if(caretOffset(t)!==0) return;
  const f = findBlock(t.dataset.btext); if(!f || f.i<=0) return;
  const prev = f.list[f.i-1];
  if(!plainEditable(prev)) return;                       // 不與無法輸入的段落相接
  e.preventDefault();
  const cut = String(prev.text||'').length;
  const root = t.closest('#stage,#popBlocks,#npcDlgBody');
  setBlockText(prev, String(prev.text||'') + t.innerText.replace(/\n$/,''));
  f.list.splice(f.i,1);
  sel.clear(); sel.add(prev.id); editingId = prev.id;
  render(); save();
  const el = (root && root.isConnected) ? root.querySelector('[data-btext="'+prev.id+'"]') : null;
  if(el){ el.focus();
    const r=document.createRange();
    if(!putCaret(el, r, cut)){ r.selectNodeContents(el); r.collapse(false); }
    const sl=getSelection(); sl.removeAllRanges(); sl.addRange(r); }
  else focusSrc(prev.id, true);
});
/* 在寬視窗中編寫表格 */
npcOn('click', e=>{
  const btn=e.target.closest('[data-tbig]'); if(!btn) return;
  const el=e.target.closest('.blk'); if(!el) return;
  const f=findBlock(el.dataset.id); if(!f || f.b.type!=='table') return;
  e.preventDefault();
  openTblModal(f.b.id);
});
/* 查看成品。顯示拿掉所有操作欄、與匯出時相同的樣子 */
npcOn('click', e=>{
  const btn=e.target.closest('[data-tprev]'); if(!btn) return;
  const el=e.target.closest('.blk'); if(!el) return;
  const f=findBlock(el.dataset.id); if(!f) return;
  e.preventDefault();
  openBlockPreview(f.b);
});
document.getElementById('prevClose').onclick=()=>document.getElementById('prevDlg').style.display='none';
document.getElementById('prevDlg').addEventListener('click',e=>{
  if(e.target.id==='prevDlg') document.getElementById('prevDlg').style.display='none'; });
addEventListener('keydown',e=>{ if(e.key==='Escape') document.getElementById('prevDlg').style.display='none'; });

/* 匯入立繪 */
let npcArtId = null;
document.getElementById('npcArtFile').onchange = e=>{
  const file = e.target.files[0]; e.target.value='';
  if(!file || !npcArtId) return;
  const f = findBlock(npcArtId); if(!f || f.b.type!=='npc'){ npcArtId=null; return; }
  setStatus(T('status.artLoading'));
  readImageFile(file, data=>{
    ensureNpc(f.b).art = data;
    npcArtId = null;
    render(); save();
    setStatus(T('status.artAdded'),'var(--ok)');
  });
};
/* 立繪的寬度 */
npcOn('change', e=>{
  const w = e.target.closest('[data-npcartw]'); if(!w) return;
  const el = e.target.closest('.blk'); if(!el) return;
  const f = findBlock(el.dataset.id); if(!f || f.b.type!=='npc') return;
  const v = Math.max(15, Math.min(50, Math.round(+w.value||30)));
  w.value = v;
  ensureNpc(f.b).artW = v;
  render(); save();
});
/* 自己加的分頁的標題 */
npcOn('input', e=>{
  const t = e.target.closest('[data-npctab]'); if(!t) return;
  const el = e.target.closest('.blk'); if(!el) return;
  const f = findBlock(el.dataset.id); if(!f || f.b.type!=='npc') return;
  const tab = ensureNpc(f.b).tabs.find(x=>x.id===t.dataset.npctab);
  if(tab){ tab.title = t.value; repaginateSoon(); save(); }
});
/* 開啟詳細視窗 */
npcOn('click', e=>{
  const btn=e.target.closest('[data-npcopen]'); if(!btn) return;
  const el=e.target.closest('.blk'); if(!el) return;
  e.preventDefault();
  openNpcModal(el.dataset.id, '');
});
/* 複製 CCFOLIA 棋子 */
npcOn('click', e=>{
  const btn = e.target.closest('[data-ccf]'); if(!btn) return;
  const el = e.target.closest('.blk'); if(!el) return;
  const f = findBlock(el.dataset.id); if(!f || f.b.type!=='npc') return;
  e.preventDefault();
  copyCcfolia(f.b);
});
/* 「不重建元素」而只更新參照能力下拉選單的內容。
   若整個元素替換，從技能名稱用 Tab 移過來的瞬間焦點會跑掉，
   輸入就會遺失，所以只改寫 options 的內容。 */
/* ================= 側邊面板 ================= */
document.getElementById('tabs').addEventListener('click',e=>{
  const b=e.target.closest('button[data-t]'); if(!b) return;
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('on',p.dataset.p===b.dataset.t));
});
document.getElementById('btnSide').onclick=()=>document.getElementById('side').classList.toggle('hide');
document.getElementById('viewAll').onclick=()=>setSrcView('all');
document.getElementById('viewPage').onclick=()=>setSrcView('page');
function setSrcView(v){
  srcView=v;
  document.getElementById('viewAll').classList.toggle('on', v==='all');
  document.getElementById('viewPage').classList.toggle('on', v==='page');
  renderSrc();
}
let imgReplaceId=null;
/* 在彈出視窗裡沒有意義的書式。
   換頁・換欄在沒有頁面的地方無效，封面・版權頁・目錄會牽涉頁碼，
   所以不排在彈出視窗的面板上 */
const POP_SKIP = ['break','colbr','cover','colophon','toc'];
/* 書式按鈕的內容。主視窗左側面板與彈出視窗的面板共用同一套 */
function typeBtnsHTML(skip){
  const no = skip || [];
  return TYPE_GROUPS.map(g=>{
    const list = TYPES.filter(t=>t.g===g && no.indexOf(t.k)<0);
    if(!list.length) return '';
    return '<div class="tgrp"><b>'+esc(T(g))+'</b><div>'
      + list.map(t=>'<button class="tk" data-k="'+t.k+'" title="Ctrl+Shift+'+t.s
          +T('type.btnTip', t.s)+'">'
          +t.n+'<small>Ctrl+Shift+'+t.s+'</small></button>').join('')
      + '</div></div>';
  }).join('');
}
const tb=document.getElementById('typeBtns');
tb.innerHTML = typeBtnsHTML();
tb.addEventListener('click',e=>{const b=e.target.closest('button[data-k]');if(b)setType(b.dataset.k);});
/* 彈出視窗自己的面板。書式呼叫與主視窗相同的 setType，
   段落的操作則只是去按主視窗上相同的按鈕。
   同樣的處理寫在兩個地方，就會只改了其中一邊而忘了另一邊 */
(function initPopSide(){
  const ps = document.getElementById('popTypeBtns');
  ps.innerHTML = typeBtnsHTML(POP_SKIP);
  ps.addEventListener('click',e=>{const b=e.target.closest('button[data-k]');if(b)setType(b.dataset.k);});
  document.getElementById('popSide').addEventListener('click',e=>{
    const b=e.target.closest('button[data-popact]'); if(!b || b.disabled) return;
    const o=document.getElementById(b.dataset.popact); if(o && !o.disabled) o.click();
  });
})();
/* 彈出視窗面板上的按鈕，照抄主視窗相同按鈕的「可按／不可按」 */
function syncPopSideBtns(){
  document.querySelectorAll('#popSide [data-popact]').forEach(b=>{
    const o=document.getElementById(b.dataset.popact);
    if(o) b.disabled = !!o.disabled;
  });
}
/* 有選取段落就 改成該書式。沒選取就 新增一個。
   只有圖片沒有內容就沒意義，所以會開啟選擇檔案。 */
/* 在儲存格裡建立段落。選取建立好的段落並捲到那裡 */
/* 在儲存格裡的段落上，就地（紙面或彈出視窗）放置游標。
   放得了就回傳 true。放不了的書式（規則框或表格等，無法直接在紙面上打字的）回傳 false */
function focusCellBlock(id, root){
  if(!root) return false;
  const el = root.querySelector('[data-btext="'+id+'"]');
  if(!el) return false;
  el.focus();
  const r=document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const s=getSelection(); s.removeAllRanges(); s.addRange(r);
  el.scrollIntoView({block:'nearest'});
  return true;
}
/* 傳入 root 的話，就把建立的段落的游標放在其中。
   為了修正在紙面按 Enter 卻跳到左側文字欄，
   看起來像「段落沒有建立」的問題 */
function addToCell(spot, k, root){
  const L = cellList(spot.b, spot.r, spot.c, true); if(!L) return false;
  const nb = newBlock(k, '');
  if(k==='npc') ensureNpc(nb);
  if(k==='proc') applyBxTpl(nb,'skill');
  if(k==='table') ensureTable(nb);
  if(k==='popup') ensurePopup(nb);
  if(k==='break'||k==='colbr'||k==='toc'||k==='cover'||k==='colophon'){
    setStatus(T('status.cantInCell', TYPE_NAME(k)),'#ff9b83'); return true; }
  L.push(nb);
  sel.clear(); sel.add(nb.id);
  render(); save();
  if(k==='image'){ imgReplaceId = nb.id; document.getElementById('imgFile').click(); }
  else if(!focusCellBlock(nb.id, root)) focusSrc(nb.id, true);
  setStatus(T('status.addedToCell', spot.r+1, spot.c+1, TYPE_NAME(k)),'var(--ok)');
  return true;
}
function setType(k){
  /* 若正在操作表格的儲存格，不是把表格本身改掉，而是放進那個儲存格裡 */
  const spot = cellTarget();
  if(spot && k!=='table'){ if(addToCell(spot, k)) return; }
  if(!sel.size){ addTyped(k); return; }
  if(k==='image' && [...sel].every(id=>{const f=findBlock(id);return f&&f.b.type==='image';})){
    pickImageFile(); return;
  }
  sel.forEach(id=>{const f=findBlock(id); if(!f) return;
    f.b.type=k;
    if(k==='npc'){ f.b.cols=1; ensureNpc(f.b); }
    if(k==='proc'){ if(!f.b.bx) applyBxTpl(f.b,'skill'); else ensureProc(f.b); }
    if(k==='break'||k==='toc'||k==='image'){ f.b.cols=1; }
    if(k==='colbr'){ f.b.cols=2; f.b.text=''; }   // 不放在欄的流動中就無法換到下一欄
    if(k==='flow'){ f.b.cols=1; }                 // 流程圖是直長形，所以設成全寬
    if(k==='break'){
      const L=f.list, i=L.indexOf(f.b);
      const nx=L[i+1];
      if(!nx || nx.type==='break') L.splice(i+1,0,newBlock('desc',''));
    }
    if(k==='popup'){ ensurePopup(f.b); }
    if(k==='image' && !f.b.img){ imgReplaceId=f.b.id; document.getElementById('imgFile').click(); }
  });
  editingId=null; render(); save();
}
/* 新段落的去處。開著彈出視窗且什麼都沒選取的話，就放進那個彈出視窗裡。
   開著視窗卻加到紙面最後面，大多不是使用者的本意 */
function homeList(){
  if(sel.size || !popId) return null;
  const dlg = document.getElementById('popDlg');
  if(!dlg || dlg.style.display!=='flex') return null;
  const f = findBlock(popId);
  return (f && f.b.type==='popup' && popIsBlocks(f.b.pop)) ? f.b.pop.blocks : null;
}
/* 什麼都沒選取時，當作新段落加在最後面 */
function addTyped(k){
  if(k==='image'){ imgReplaceId=null; document.getElementById('imgFile').click(); return; }
  if(k==='toc' && S.blocks.some(b=>b.type==='toc')
     && !confirm(T('confirm.tocExists'))) return;
  const nb=newBlock(k,'');
  if(k==='npc'){ nb.cols=1; ensureNpc(nb); }
  if(k==='proc'){ applyBxTpl(nb,'skill'); }
  if(k==='break'||k==='toc'||k==='flow') nb.cols=1;
  if(k==='colbr') nb.cols=2;
  if(k==='popup'){ ensurePopup(nb); }
  /* 正在操作彈出視窗裡的段落時，就加到該彈出視窗裡。
     即使什麼都沒選取，只要開著彈出視窗就加到裡面 */
  const L = homeList() || selList();
  L.push(nb);
  let focusId = nb.id;
  if(k==='toc'){ const br=newBlock('break',''), st=newBlock('desc','');
    L.push(br, st); focusId=st.id; }
  if(k==='break'){ const st=newBlock('desc',''); L.push(st); focusId=st.id; }
  sel.clear(); sel.add(focusId);
  render(); focusSrc(focusId,false); save();
  setStatus(T('status.typeAdded', TYPE_NAME(k)),'var(--ok)');
}
/* 切換書式用 Ctrl+Shift。Ctrl+Alt 也照舊有效
   （有些組合會被瀏覽器搶走，所以留一條退路）。
   即使正在打字，也能改變選取段落的書式。 */
document.addEventListener('keydown',e=>{
  if(!((e.ctrlKey||e.metaKey) && (e.shiftKey || e.altKey))) return;
  /* 按住 Shift 時 e.key 會變成「!」「"」等，
     所以從按鍵的位置（e.code）重新取得數字與英文字母 */
  const code = String(e.code||'');
  let k = String(e.key||'').toUpperCase();
  if(/^Digit[0-9]$/.test(code))      k = code.slice(5);
  else if(/^Key[A-Z]$/.test(code))   k = code.slice(3);
  const brR = (e.key===']' || code==='BracketRight');
  const brL = (e.key==='[' || code==='BracketLeft');
  /* 縮放。也能用 Ctrl+Shift+↑↓ 調整 */
  if(e.shiftKey && !e.altKey && (code==='ArrowUp' || code==='ArrowDown')){
    e.preventDefault(); stepZoom(code==='ArrowUp'?1:-1); return; }
  /* 整個區塊的複製・貼上用 Ctrl+Alt+Shift。
     C 與 V 和書式（封面・直線）的鍵相同，所以用按法區分 */
  if(e.altKey && e.shiftKey && k==='C'){ e.preventDefault(); blkCopyDo(); return; }
  if(e.altKey && e.shiftKey && k==='V'){ e.preventDefault(); blkPasteDo(); return; }
  const t=TYPES.find(x=>x.s===k);
  if(t){ e.preventDefault(); setType(t.k); return; }
  if(k==='P'){ e.preventDefault(); togglePages(); return; }
  if(k==='R'){ e.preventDefault(); insertRuby(); return; }
  if(brR){ e.preventDefault(); setIndent(1); return; }
  if(brL){ e.preventDefault(); setIndent(-1); }
});
document.getElementById('colSpan').onclick=()=>setCols(1);
document.getElementById('colFlow').onclick=()=>setCols(2);
function setCols(n){
  if(!sel.size) return;
  let forced=0;
  sel.forEach(id=>{const f=findBlock(id); if(!f) return;
    if(f.b.type==='npc'||f.b.type==='flow'){ f.b.cols=1; forced++; return; }  // 直長形，所以一定是全寬
    f.b.cols=n;
  });
  render(); save();
  if(forced && n===2) setStatus(T('status.fullWidthOnly'),'#ff9b83');
}
/* 表格・角色卡・彈出視窗的內容結構比較複雜，所以在左側操作。
   紙面上只放成品，操作欄集中在這裡。 */
let propId = null;
/* 設定欄固定在紙面的旁邊（右側）。
   左側是「頁面・整份文件」與「建立・排列段落」，
   右側是「選取段落本身的內容與外觀」，這樣劃分。
   （原本可以選左右，但同樣的項目出現在兩個地方會不一致，所以統一成一邊） */
/* 各段落的設定只顯示在紙面旁邊（以前可以選左右，
   但同樣的項目出現在兩個地方會不一致，所以統一成一邊） */
function setPropSide(){
  const box = document.getElementById('propBox');
  const host = document.getElementById('propSlot');
  if(box.parentElement !== host) host.appendChild(box);
  renderProps();
  savePanes();
  if(zoomMode==='fit') applyZoom();
}
/* 顯示不出來時的退路。按下一定會顯示在右側 */
document.getElementById('btnProp').onclick=()=>{
  const pane=document.getElementById('propPane');
  const hidden = pane.classList.contains('hide');
  if(hidden){
    propForce = true;
    if(!pane.style.flex || pane.offsetWidth<60) pane.style.flex='0 0 268px';
    renderProps();
    if(!sel.size) setStatus(T('status.propHint'));
  }else{
    propForce = false; pane.classList.add('hide');
    document.getElementById('splitProp').classList.add('hide');
  }
  document.getElementById('btnProp').classList.toggle('on', !pane.classList.contains('hide'));
  savePanes(); if(zoomMode==='fit') applyZoom();
};
let propForce = false;
function renderProps(){
  const box = document.getElementById('propBox'), body = document.getElementById('propBody');
  const first = sel.size===1 ? findBlock([...sel][0]) : null;
  const b = first ? first.b : null;
  const pane = document.getElementById('propPane');
  const spl  = document.getElementById('splitProp');
  const common = document.getElementById('blkCommon');
  const inPop = placeProps(b);
  /* 一個段落都沒選取的話，右側就關閉（也可以用「設定欄」按鈕讓它保持開啟） */
  if(!b && !sel.size){
    propId=null; box.style.display='none'; body.innerHTML='';
    common.classList.add('hide');
    if(propForce){
      pane.classList.remove('hide'); spl.classList.remove('hide');
      body.innerHTML='<div class="hint" style="padding:4px 0">'
        + T('prop.pickHint')+'</div>';
      box.style.display='';
      document.getElementById('propTtlR').textContent=T('prop.title');
    }else{
      pane.classList.add('hide'); spl.classList.add('hide');
    }
    document.getElementById('btnProp').classList.toggle('on', !pane.classList.contains('hide'));
    if(zoomMode==='fit') applyZoom();
    return;
  }
  common.classList.remove('hide');
  /* 多選時不顯示各書式的欄位，只顯示共通的設定 */
  if(!b){
    common.classList.add('top');
    propId=null; box.style.display='none'; body.innerHTML='';
    pane.classList.remove('hide'); spl.classList.remove('hide');
    if(pane.offsetWidth < 60) pane.style.flex='0 0 268px';
    document.getElementById('propTtlR').textContent = T('prop.nParas', sel.size);
    document.getElementById('btnProp').classList.toggle('on', !pane.classList.contains('hide'));
    if(zoomMode==='fit') applyZoom();
    return;
  }
  if(inPop){
    /* 顯示在彈出視窗裡的期間，右側的屬性欄先關起來 */
    pane.classList.add('hide'); spl.classList.add('hide');
  }
  else {
    pane.classList.remove('hide'); spl.classList.remove('hide');
    /* 寬度被壓扁的話就恢復（以防上次記錄是 0） */
    if(pane.offsetWidth < 60) pane.style.flex='0 0 268px';
  }
  document.getElementById('btnProp').classList.toggle('on', !pane.classList.contains('hide'));
  /* 打字途中重建的話游標會跑掉 */
  if(propId===b.id && body.contains(document.activeElement)) return;
  propId = b.id;
  const ttl = b.type==='table' ? T('prop.tableTitle') : b.type==='npc' ? T('prop.npcTitle')
            : b.type==='popup' ? T('prop.popTitle') : b.type==='image' ? T('prop.imgTitle')
            : b.type==='proc' ? T('prop.procTitle') : T('prop.typeTitle', TYPE_NAME(b.type));
  document.getElementById('propTtl').textContent = ttl;
  document.getElementById('propTtlR').textContent = ttl;
  document.getElementById('popPropHead').textContent = ttl;
  const h = propsHTML(b);
  body.innerHTML = h;
  box.style.display = h ? '' : 'none';
  common.classList.toggle('top', !h);
  body.querySelectorAll('[data-cell]').forEach(pcellGrow);
}
/* 面板上的儲存格也依寫的份量（最多 6 行）縱向延伸 */
function pcellGrow(ta){
  ta.style.height='auto';
  ta.style.height=Math.min(120, Math.max(24, ta.scrollHeight+2))+'px';
}
/* 設定欄。不帶入紙面的元件，而是配合面板的外觀來寫 */
/* 設定欄的操作。為了避免每次重建時重複堆疊，事件只綁一次。
   目前在操作哪個區塊，從 propId 查。 */
function propBlk(){ const f = propId ? findBlock(propId) : null; return f ? f.b : null; }
(function(){
  const body = document.getElementById('propBody');
  const re   = ()=>{ render(); save(); };
  const soft = ()=>{ repaginateSoon(); save(); };
  /* 按按鈕也不讓內文的游標離開 */
  body.addEventListener('mousedown', e=>{ if(e.target.closest('[data-rich]')) e.preventDefault(); });
  body.addEventListener('click', e=>{
    const b = propBlk(); if(!b) return;
    const rb = e.target.closest('[data-rich]');
    if(rb){ insertRichMark(rb.dataset.rich, rb.dataset.richlb || rb.textContent.trim(), b); return; }
    const el = e.target.closest('[data-p]');
    if(!el || el.tagName==='INPUT' || el.tagName==='TEXTAREA' || el.tagName==='SELECT') return;
    const k = el.dataset.p, v = el.dataset.v;
    /* 選取儲存格中的段落時的「刪除這一列／欄」。
       即使沒有選取表格本身，也從該段落所在的儲存格追溯到表格來刪除 */
    if(k==='cellrowdel' || k==='cellcoldel'){
      const f = findBlock(b.id);
      const own = f ? cellOwnerOf(f.list) : null;
      const tf = own ? findBlock(own.id) : null;
      if(!tf || tf.b.type!=='table') return;
      const tt = ensureTable(tf.b);
      const rc = own.k.split(',').map(Number);
      const done = (k==='cellrowdel') ? tblDelRow(tt, rc[0]) : tblDelCol(tt, rc[1]);
      if(!done){ setStatus(T('status.cantReduce'),'#ff9b83'); return; }
      propCur=null; propId=null;
      sel.clear(); sel.add(tf.b.id);
      re(); return;
    }
    const t  = b.type==='table' ? ensureTable(b) : null;
    const np = b.type==='npc'   ? ensureNpc(b)   : null;
    if(t){
      if(k==='look'){ if(t.look!==v){ t.look=v;
          if(v==='list'||v==='card'){
            while(tblCols(t) < (v==='list'?3:2)) tblAddCol(t);
            const h0=String(cellHead(t,0,0)).trim(), h1=String(cellHead(t,0,1)).trim();
            if(t.head && ((!h0&&!h1)||(tAll('tbl.seedItem').includes(h0)&&tAll('tbl.seedContent').includes(h1)))){
              const def = (v==='list'?[T('tbl.colRoll'),T('tbl.colHead'),T('tbl.colContent')]:[T('tbl.colTitle'),T('tbl.colContent')]);
              def.forEach((x,i)=>{ if(i<tblCols(t)) cellWrite(t,0,i,x); });
            }
          }
          propId=null; re(); } return; }
      if(k==='capon'){ t.capOn=!t.capOn; propId=null; re(); return; }
      if(k==='head'){ t.head=!t.head; propId=null; re(); return; }
      if(k==='rowhead'){ t.rowhead=!t.rowhead; propId=null; re(); return; }
      if(k==='row'){ if(+v>0) tblAddRow(t); else tblDelRow(t, tblRows(t)-1);
        propId=null; re(); return; }
      if(k==='col'){ if(+v>0) tblAddCol(t); else tblDelCol(t, tblCols(t)-1);
        propId=null; re(); return; }
      if(k==='delrow'){ if(!propCur||propCur.id!==b.id){ setStatus(T('status.clickRowCell'),'#ff9b83'); return; }
        if(!tblDelRow(t, propCur.r)){ setStatus(T('status.cantReduce'),'#ff9b83'); return; }
        propCur=null; propId=null; re(); return; }
      if(k==='delcol'){ if(!propCur||propCur.id!==b.id){ setStatus(T('status.clickColCell'),'#ff9b83'); return; }
        if(!tblDelCol(t, propCur.c)){ setStatus(T('status.cantReduce'),'#ff9b83'); return; }
        propCur=null; propId=null; re(); return; }
      if(k==='big'){ openTblModal(b.id); return; }
      if(k==='cellblk'){ return; }        // 選完之後由 change 接手
      if(k==='make'){ t.out=tblOutText(t); propId=null; re(); setStatus(T('status.remade'),'var(--ok)'); return; }
      if(k==='copy'){ const txt = t.outMode==='free'?String(t.out||''):tblOutText(t);
        if(!txt.trim()){ setStatus(T('status.noOutput'),'#ff9b83'); return; }
        copyPlain(txt).then(ok=>setStatus(ok?T('status.outCopied'):T('status.copyFailed'), ok?'var(--ok)':'#ff9b83'));
        return; }
    }
    if(np){
      if(k==='ver'){ np.coc.ver=v; propId=null; re(); return; }
      if(k==='art'){ npcArtId=b.id; document.getElementById('npcArtFile').click(); return; }
      if(k==='artdel'){ if(!confirm(T('confirm.artRemove'))) return;
        np.art=null; propId=null; re(); return; }
      if(k==='open'){ openNpcModal(b.id,''); return; }
      if(k==='ccf'){ copyCcfolia(b); return; }
      if(k==='ccfin'){ openCcfIn(b.id); return; }
      if(k==='ytin'){ openYt(b.id); return; }
    }
    if(b.type==='proc'){
      const x = ensureProc(b);
      if(k==='tpl'){ applyBxTpl(b, v); propId=null; re(); return; }
      if(k==='tplnew'){
        const nm = prompt(T('tpl.namePrompt'),
                          String(blockLabel(b)||'').trim() || T('tpl.mine'));
        if(nm===null || !nm.trim()) return;
        const t = bxTplClean(Object.assign({}, x, {id:uid(), n:nm.trim(), lb:String(b.lb==null?'':b.lb)}));
        if(!t) return;
        const dup = userTpls().find(y=>y.n===t.n);
        if(dup){ if(!confirm(T('confirm.tplExists', t.n))) return;
          Object.assign(dup, t, {id:dup.id}); }
        else userTpls().push(t);
        saveUserTpls(); propId=null; re();
        setStatus(T('status.tplSaved', t.n),'var(--ok)'); return;
      }
      if(k==='tplup'){
        const t = findUserTpl(v); if(!t) return;
        if(!confirm(T('confirm.tplOverwrite', t.n))) return;
        Object.assign(t, {ln:x.ln, bar:x.bar, fill:x.fill, sm:x.sm, col:x.col, lb:String(b.lb==null?'':b.lb)});
        saveUserTpls(); propId=null; re();
        setStatus(T('status.tplOverwritten', t.n),'var(--ok)'); return;
      }
      if(k==='tplren'){
        const t = findUserTpl(v); if(!t) return;
        const nm = prompt(T('tpl.nameLabel'), t.n);
        if(nm===null || !nm.trim()) return;
        const lb = prompt(T('tpl.lbPrompt'), t.lb||'');
        if(lb===null) return;
        t.n = nm.trim().slice(0,24); t.lb = lb.slice(0,24);
        saveUserTpls(); propId=null; re();
        setStatus(T('status.tplFixed'),'var(--ok)'); return;
      }
      if(k==='tpldel'){
        const t = findUserTpl(v); if(!t) return;
        if(!confirm(T('confirm.tplDelete', t.n))) return;
        S.bxTpl = userTpls().filter(y=>y.id!==t.id);
        saveUserTpls(); propId=null; re();
        setStatus(T('status.tplDeleted'),'var(--ok)'); return;
      }
      if(k==='bxln'){ x.ln=v; propId=null; re(); return; }
      if(k==='bxbar'){ x.bar=!x.bar; propId=null; re(); return; }
      if(k==='bxfill'){ x.fill=!x.fill; propId=null; re(); return; }
      if(k==='bxsm'){ x.sm=!x.sm; propId=null; re(); return; }
      if(k==='bxcol'){ x.col=v; propId=null; re(); return; }
    }
    if(b.type==='image'){
      if(k==='ipos'){ sel.clear(); sel.add(b.id); setImgFlow(v); propId=null; renderProps(); return; }
      if(k==='isnap'){ sel.clear(); sel.add(b.id); imgSnap(v); propId=null; renderProps(); return; }
      if(k==='iwrap'){ b.wrap = (v==='none') ? 'none' : 'square'; propId=null; re(); return; }
      if(k==='ipick'){ imgReplaceId=b.id; document.getElementById('imgFile').click(); return; }
    }
    if(k==='addsub'){
      b.text = String(b.text||'').replace(/\n*$/,'') + (b.text?'\n':'') + T('tpl.subHeadLine');
      propId=null; render(); save();
      const ta=body.querySelector('textarea[data-p="btext"]'); if(ta){ ta.focus(); ta.selectionStart=ta.selectionEnd=ta.value.length; }
      return; }
    if(k==='addnest'){
      b.text = String(b.text||'').replace(/\n*$/,'') + (b.text?'\n':'') + T('tpl.nestLine');
      propId=null; render(); save();
      const ta=body.querySelector('textarea[data-p="btext"]'); if(ta){ ta.focus(); ta.selectionStart=ta.selectionEnd=ta.value.length; }
      return; }
    if(k==='popedit'){ openPopup(b.id); return; }
    if(k==='ponly' && b.type==='popup'){ const pp0=ensurePopup(b); pp0.only=!pp0.only; propId=null; re(); return; }
    if(k==='flowopen'){ openFlowWin(b.id); return; }
    if(k==='tocpick'){
      const t = ensureToc(b);
      const i = t.pick.indexOf(v);
      if(i>=0){ if(t.pick.length>1) t.pick.splice(i,1); else { setStatus(T('status.keepOne'),'#ff9b83'); return; } }
      else t.pick.push(v);
      propId=null; re(); return;
    }
    if(k==='tocpn'){   const t=ensureToc(b); t.pn=!t.pn;     propId=null; re(); return; }
    if(k==='tocdots'){ const t=ensureToc(b); t.dots=!t.dots; propId=null; re(); return; }
    if(k==='tocmode'){ b.tocMode = v||''; delete b.tocOff;   propId=null; re(); return; }
    if(k==='toclv'){   b.tocLv = +v||0;                       propId=null; re(); return; }
    if(k==='prev'){ openBlockPreview(b); return; }
  });
  body.addEventListener('input', e=>{
    const b = propBlk(); if(!b) return;
    const el = e.target.closest('[data-p],[data-cell]'); if(!el) return;
    /* 在儲存格的欄與規則框的「內容」中，也把指令換成記號 */
    if(el.tagName==='TEXTAREA' && (el.dataset.cell!=null || el.dataset.p==='btext'))
      slashFireTA(el, e);
    const t  = b.type==='table' ? ensureTable(b) : null;
    const np = b.type==='npc'   ? ensureNpc(b)   : null;
    const pp = b.type==='popup' ? ensurePopup(b) : null;
    if(el.dataset.cell!=null){
      if(!t) return;
      const [r,c]=el.dataset.cell.split(',').map(Number);
      cellWrite(t, r, c, el.value);
      pcellGrow(el);
      if(t.outMode!=='free'){ const ta=body.querySelector('textarea[data-p="out"]'); if(ta) ta.value=tblOutText(t); }
      soft(); return;
    }
    const k=el.dataset.p, v=el.value;
    if(k==='lb'){ b.lb=v; soft(); return; }
    if(t){
      if(k==='tname'){ t.name=v; soft(); return; }
      if(k==='dice'){ t.dice=v; soft(); return; }
      if(k==='out'){ t.out=v; if(t.outMode!=='free') t.outMode='free'; save(); return; }
    }
    if(b.type==='flow' && (k==='flowW'||k==='flowH')){
      const fl = ensureFlow(b);
      if(k==='flowW') fl.w = Math.max(30, Math.min(400, +v||150));
      else            fl.h = Math.max(20, Math.min(600, +v||95));
      fl.nodes.forEach(n=>flowFit(fl,n));
      soft();
      if(flowId===b.id) renderFlowWin();
      return;
    }
    if(np && (k==='name'||k==='kana'||k==='role')){ np[k]=v; soft(); return; }
    if(k==='toclb'){  ensureToc(b).lb = v; soft(); return; }
    if(k==='tocown'){ b.tl = v; soft(); return; }
    if(k==='btext'){ b.text=v; soft(); return; }
    if(k==='dsp'){ b.sp=v; soft(); return; }
    if(b.type==='image'){
      if(k==='iw'||k==='iwn'){
        const n=Math.max(1,Math.min(100,Math.round(+v||0)));
        b.w=n;
        const r1=body.querySelector('[data-p="iw"]'), r2=body.querySelector('[data-p="iwn"]');
        if(r1&&r1!==el) r1.value=n; if(r2&&r2!==el) r2.value=n;
        soft(); return; }
      if(k==='icap'){ b.cap=v; soft(); return; }
    }
    if(pp && k==='plabel'){
      if(v.trim()) renamePopRefs(pp.label, v);
      pp.label=v;
      if(popId===b.id) document.getElementById('popTitle').value = v;
      soft(); return; }
  });
  body.addEventListener('change', e=>{
    const b = propBlk(); if(!b) return;
    const el=e.target.closest('[data-p]'); if(!el) return;
    const k=el.dataset.p;
    const t  = b.type==='table' ? ensureTable(b) : null;
    const np = b.type==='npc'   ? ensureNpc(b)   : null;
    if(t && k==='cellblk'){
      const v=el.value; el.value='';
      if(!v) return;
      const spot = cellTarget();
      if(!spot){ setStatus(T('status.clickCellFirst'),'#ff9b83'); return; }
      addToCell(spot, v); return;
    }
    if(t && k==='om'){ t.outMode=el.value; if(t.outMode!=='free') t.out=tblOutText(t); propId=null; render(); save(); return; }
    if(np && k==='sys'){ np.sys=el.value; propId=null; render(); save(); return; }
    if(np && k==='artw'){ np.artW=Math.max(15,Math.min(50,Math.round(+el.value||30))); render(); save(); return; }
    if(b.type==='image'){
      const num=k=>Math.round(+el.value||0);
      if(k==='ifx'){ b.fx=num(); render(); save(); return; }
      if(k==='ify'){ b.fy=num(); render(); save(); return; }
      if(k==='ipg'){ b.pg=Math.max(1,Math.min(Math.max(1,pageMap.length),num())); el.value=b.pg; render(); save(); return; }
      if(k==='idy'){ b.dy=num(); render(); save(); return; }
      if(k==='idx'){ b.dx=num(); render(); save(); return; }
    }
  });
  body.addEventListener('focusin', e=>{
    const b = propBlk(); if(!b) return;
    const c=e.target.closest('[data-cell]'); if(!c) return;
    const [r,cc]=c.dataset.cell.split(',').map(Number);
    propCur={id:b.id, r:r, c:cc};
    body.querySelectorAll('[data-cell]').forEach(x=>x.classList.toggle('cur', x===c));
  });
})();
let propCur = null;
/* 查看成品（左側面板與紙面都使用同一個視窗） */
function openBlockPreview(b){
  prevBlk = b;             // 收錄版：切換語言時用來重畫這個視窗
  const lbp = b.type==='proc' ? blockLabel(b).trim() : '';
  const inner = b.type==='npc'   ? npcInnerHTML(b,false,'static')
              : b.type==='table' ? tableInnerHTML(b)
              : b.type==='popup' ? popupViewHTML(b.pop)
              : b.type==='proc'  ? (lbp?'<div class="t-lb">'+esc(lbp)+'</div>':'')+richBlockHTML(b)
              : rubyHTML(b.text);
  document.getElementById('prevTitle').textContent = T('prev.title', TYPE_NAME(b.type));
  document.getElementById('prevBody').innerHTML =
    '<div class="page" style="width:auto;height:auto;box-shadow:none;min-height:0">'
    + '<div class="page-body" style="height:auto;padding:'+S.padH+'mm;font-size:'+S.base+'pt">'
    + '<div class="blkpad p-'+b.type+'"><div class="blk t-'+b.type
    + (b.type==='proc'?procClass(b)+'" style="'+procStyle(b):'')+'">'+inner+'</div></div>'
    + '</div></div>';
  document.getElementById('prevDlg').style.display='flex';
}
/* 巢狀書式的按鈕。能使用的書式，設定欄上一定會顯示 */
function propsRich(b){
  return pRow(T('prop.richLabel'), richBtnsHTML(),
    T('prop.richHint1')
    + T('prop.richHint2'));
}
/* 各書式的欄位。即使這裡是空的書式，共通設定（下方的 #blkCommon）也會顯示 */
function propsHTML(b){
  const h = (RICH_TYPES.includes(b.type) && b.type!=='proc') ? propsRich(b)
    : b.type==='dialog' ? pRow(T('prop.speaker'),
        '<input type="text" data-p="dsp" value="'+esc(b.sp||'')+'" placeholder="'+T('common.optional')+'">')
    : b.type==='table'  ? propsTable(b)
    : b.type==='npc'    ? propsNpc(b)
    : b.type==='popup'  ? propsPopup(b)
    : b.type==='proc'   ? propsProc(b) + propsRich(b)
    : b.type==='image'  ? propsImage(b)
    : b.type==='flow'   ? propsFlow(b)
    : b.type==='toc'    ? propsToc(b)
    : '';
  return h + propsTocItem(b) + propsCellOwner(b);
}
/* 目錄區塊的設定。收錄什麼、標題語、格式 */
function propsToc(b){
  const t = ensureToc(b);
  const e = tocEntries(t.pick);
  return pRow(T('prop.tocHead'),
      '<input type="text" data-p="toclb" value="'+esc(t.lb)+'" placeholder="'+T('toc.defaultHead')+'">',
      T('prop.tocHeadHint'))
    + pRow(T('prop.tocPick'),
      '<div class="row">'
      + TOC_PICKS.map(k=>'<button data-p="tocpick" data-v="'+k[0]+'"'
          + (t.pick.includes(k[0])?' class="on"':'')+'>'+esc(T(k[1]))+'</button>').join('')
      + '</div>',
      T('prop.tocPickHint', e.length))
    + pRow(T('prop.tocStyle'),
      '<div class="row">'
      + '<button data-p="tocpn"'+(t.pn?' class="on"':'')+'>'+T('prop.tocPn')+'</button>'
      + '<button data-p="tocdots"'+(t.dots?' class="on"':'')+'>'+T('prop.tocDots')+'</button></div>')
    + '<div class="hint" style="margin-top:8px">'+T('prop.tocNote1')
    + '<b>'+T('prop.tocNote2')+'</b>'+T('prop.tocNote3')+'</div>'
    + '<div class="row" style="margin-top:8px"><button data-p="prev">'+T('common.preview')+'</button></div>';
}
/* 顯示在標題那邊的「目錄中的寫法」。只在會收錄進目錄的書式時顯示 */
function propsTocItem(b){
  if(!TOC_PICKS.some(x=>x[0]===b.type)) return '';
  const m = tocModeOf(b);
  const lv0 = tocLevelOf(b.type);
  const cur = Math.max(0, Math.min(3, parseInt(b.tocLv,10)||0));
  return pRow(T('prop.tocOwn'),
      '<input type="text" data-p="tocown" value="'+esc(String(b.tl||''))+'" placeholder="'
      + esc(rubyPlain(String(b.text||'').trim().split('\n')[0]) || T('prop.tocOwnPh'))+'">',
      T('prop.tocOwnHint'))
    + pRow(T('prop.tocMode'),
      '<div class="row">'
      + '<button data-p="tocmode" data-v=""'+(m===''?' class="on"':'')+'>'+T('prop.tocModeDef')+'</button>'
      + '<button data-p="tocmode" data-v="on"'+(m==='on'?' class="on"':'')+'>'+T('prop.tocModeOn')+'</button>'
      + '<button data-p="tocmode" data-v="off"'+(m==='off'?' class="on"':'')+'>'+T('prop.tocModeOff')+'</button></div>',
      T('prop.tocModeHint'))
    + pRow(T('prop.tocLv'),
      '<div class="row">'
      + '<button data-p="toclv" data-v="0"'+(cur===0?' class="on"':'')+'>'+T('prop.tocLvAuto', lv0)+'</button>'
      + [1,2,3].map(i=>'<button data-p="toclv" data-v="'+i+'"'+(cur===i?' class="on"':'')+'>'+T('prop.tocLvN', i)+'</button>').join('')
      + '</div>',
      T('prop.tocLvHint'));
}
/* 流程圖。一行是一個方框，行首加上 - 或 ・ 的行，連續寫就會成為橫向排列的分支。
   這個寫法原本在任何地方都沒有說明，所以在這裡放上欄位與指引 */
function propsFlow(b){
  const fl = ensureFlow(b);
  return pRow(T('prop.flow'),
      '<div class="row"><button data-p="flowopen" class="on" style="flex:1">'+T('prop.flowOpen')+'</button></div>',
      T('prop.flowHint1')
      + T('prop.flowHint2')
      + T('prop.flowHint3')
      + T('prop.flowCounts', fl.nodes.length, fl.edges.length))
    + pRow(T('prop.flowSize'),
      '<div class="grid2"><div><span class="hint">'+T('flow.w')+'</span>'
      + '<input type="number" data-p="flowW" value="'+fnum(fl.w)+'" min="30" max="400" step="1"></div>'
      + '<div><span class="hint">'+T('flow.h')+'</span>'
      + '<input type="number" data-p="flowH" value="'+fnum(fl.h)+'" min="20" max="600" step="1"></div></div>',
      T('prop.flowWide'))
    + '<div class="row" style="margin-top:8px"><button data-p="prev">'+T('common.preview')+'</button></div>';
}
/* 這個段落在表格儲存格裡時，段落本身的設定維持不變，
   只在下方加上「這個儲存格所在表格」的列・欄刪除。
   若切換成表格本身的設定，段落那邊（注音・顏色等）就無法操作了 */
function propsCellOwner(b){
  const f = findBlock(b.id);
  const own = f ? cellOwnerOf(f.list) : null;
  const tf = own ? findBlock(own.id) : null;
  if(!tf || tf.b.type!=='table') return '';
  const rc = own.k.split(',').map(Number);
  const nm = String((tf.b.tbl||{}).name||'').trim();
  return pRow(T('prop.cellOwner'),
      '<div class="hint">'+(nm?T('prop.cellOwnerTable', esc(nm)):'')+T('prop.cellOwnerRC', rc[0]+1, rc[1]+1)+'</div>'
    + '<div class="grid2" style="margin-top:6px">'
      + '<button data-p="cellrowdel" class="danger">'+T('tbl.delRow')+'</button>'
      + '<button data-p="cellcoldel" class="danger">'+T('tbl.delCol')+'</button></div>',
    T('prop.cellOwnerHint'));
}
function pRow(label, inner, hint){
  return '<label class="f">'+esc(label)+'</label>'+inner
    + (hint?'<div class="hint">'+hint+'</div>':'');
}
function pSeg(name, cur, opts){
  return '<div class="row">'+opts.map(([v,t])=>
    '<button data-p="'+name+'" data-v="'+esc(v)+'"'+(cur===v?' class="on"':'')+'>'+esc(t)+'</button>').join('')+'</div>';
}
function propsProc(b){
  const subs = String(b.text||'').split('\n').filter(x=>/^[■◆]/.test(x.trim())).length;
  const x = ensureProc(b);
  const same = t => t && t.ln===x.ln && t.bar===x.bar && t.fill===x.fill && t.sm===x.sm && t.col===x.col;
  const mine = userTpls();
  return pRow(T('prop.tpl'),
      '<div class="grid2"><button data-p="tpl" data-v="skill"'+(same(BX_TPL.skill)?' class="on"':'')+'>'+T('label.skill')+'</button>'
    + '<button data-p="tpl" data-v="rule"'+(same(BX_TPL.rule)?' class="on"':'')+'>'+T('label.rule')+'</button></div>'
    + (mine.length ? '<div class="tpllist">' + mine.map(t=>
        '<div class="tplrow"><button data-p="tpl" data-v="'+esc(t.id)+'"'+(same(t)?' class="on"':'')
        + ' title="'+esc((t.lb||T('prop.tplNoLb'))+T('prop.tplApply'))+'">'+esc(t.n)+'</button>'
        + '<button class="x" data-p="tplup" data-v="'+esc(t.id)+'" title="'+T('prop.tplUp')+'">↑</button>'
        + '<button class="x" data-p="tplren" data-v="'+esc(t.id)+'" title="'+T('prop.tplRen')+'">✎</button>'
        + '<button class="x danger" data-p="tpldel" data-v="'+esc(t.id)+'" title="'+T('prop.tplDel')+'">×</button>'
        + '</div>').join('') + '</div>' : '')
    + '<div class="row" style="margin-top:6px"><button data-p="tplnew">'+T('prop.tplNew')+'</button></div>',
      T('prop.tplHint')
      + (mine.length?T('prop.tplHint2'):''))
    + pRow(T('prop.lb'),
      '<input type="text" data-p="lb" list="dl-lb" value="'+esc(blockLabel(b))+'" placeholder="'+T('prop.lb')+'">',
      T('prop.lbHint'))
    + pRow(T('prop.bxln'), pSeg('bxln', x.ln, [['solid',T('prop.solid')],['dash',T('prop.dash')],['none',T('prop.none')]])
    + '<div class="row" style="margin-top:6px">'
      + '<button data-p="bxbar"'+(x.bar?' class="on"':'')+'>'+T('prop.bxbar')+'</button>'
      + '<button data-p="bxfill"'+(x.fill?' class="on"':'')+'>'+T('prop.bxfill')+'</button>'
      + '<button data-p="bxsm"'+(x.sm?' class="on"':'')+'>'+T('prop.bxsm')+'</button></div>')
    + pRow(T('common.color'), '<div class="bxcols">'
      + BX_COLS.map(c=>'<button data-p="bxcol" data-v="'+c.k+'"'+(x.col===c.k?' class="on"':'')
          + ' title="'+c.n+'" style="--sw:'+c.c+'"><i></i>'+c.n+'</button>').join('')
      + '</div>')
    + pRow(T('prop.body'),
      '<textarea data-p="btext" rows="7" placeholder="'+T('common.writeHere')+'">'+esc(b.text||'')+'</textarea>')
    + '<div class="grid2" style="margin-top:6px">'
      + '<button data-p="addsub">'+T('prop.addSub')+'</button>'
      + '<button data-p="addnest">'+T('prop.addNest')+'</button></div>'
    + '<div class="hint">'+T('prop.procHint1')+' <code>'+T('prop.procHintEx1')+'</code>、'
      + T('prop.procHint2')+' <code>'+T('prop.procHintEx2')+'</code> '+T('prop.procHint3')
      + (subs?T('prop.subCount', subs):'')+'</div>'
    + '<div class="row" style="margin-top:8px"><button data-p="prev">'+T('common.preview')+'</button></div>';
}
function propsImage(b){
  const pos = b.pos || (b.fl==='l'?'left':b.fl==='r'?'right':'inline');
  const free = pos==='free';
  return pRow(T('prop.imgPos'),
      pSeg('ipos', pos, [['inline',T('prop.inline')],['left',T('prop.floatL')],['right',T('prop.floatR')]])
    + '<div class="row" style="margin-top:6px">'
      + '<button data-p="ipos" data-v="free"'+(free?' class="on"':'')+'>'+T('prop.free')+'</button></div>',
      free ? T('prop.freeHint') : '')
    + pRow(T('prop.imgSize'),
      '<div class="row" style="align-items:center;gap:6px">'
      + '<input type="range" data-p="iw" min="5" max="100" value="'+(b.w||70)+'" style="flex:1">'
      + '<input type="number" data-p="iwn" min="1" max="100" value="'+(b.w||70)+'" style="width:64px;flex:0 0 auto"></div>')
    + (free
        ? pRow(T('prop.wrap'),
            pSeg('iwrap', (b.wrap==='none'?'none':'square'), [['square',T('prop.wrapSquare')],['none',T('prop.wrapNone')]]),
            (b.wrap==='none')
              ? T('prop.wrapNoneHint')
              : ((+b.ar>0) ? T('prop.wrapSqHint')
                           : T('prop.wrapNoAr')))
        + pRow(T('prop.freePos'),
            '<div class="grid2"><div><span class="hint">'+T('flow.fromLeft')+'</span><input type="number" data-p="ifx" value="'+(+b.fx||0)+'"></div>'
          + '<div><span class="hint">'+T('flow.fromTop')+'</span><input type="number" data-p="ify" value="'+(+b.fy||0)+'"></div></div>'
          + '<label class="f">'+T('prop.freePage')+'</label>'
          + '<input type="number" data-p="ipg" min="1" value="'+Math.max(1,+b.pg||1)+'">'
          + '<div class="grid2" style="margin-top:6px"><button data-p="isnap" data-v="top">'+T('prop.snapTop')+'</button>'
          + '<button data-p="isnap" data-v="bottom">'+T('prop.snapBottom')+'</button></div>'
          + '<div class="grid2" style="margin-top:6px"><button data-p="isnap" data-v="left">'+T('prop.snapLeft')+'</button>'
          + '<button data-p="isnap" data-v="right">'+T('prop.snapRight')+'</button></div>')
        : (pos==='left'||pos==='right')
          ? pRow(T('prop.offset'),
              '<div class="grid2"><div><span class="hint">'+T('prop.down')+'</span><input type="number" data-p="idy" value="'+(+b.dy||0)+'"></div>'
            + '<div><span class="hint">'+T('prop.inward')+'</span><input type="number" data-p="idx" value="'+(+b.dx||0)+'"></div></div>',
              T('prop.offsetHint'))
          : '')
    + pRow(T('prop.caption'),'<input type="text" data-p="icap" value="'+esc(b.cap||'')+'" placeholder="'+T('common.optional')+'">')
    + '<div class="grid2" style="margin-top:8px"><button data-p="ipick">'+T('prop.repick')+'</button>'
    + '<button data-p="prev">'+T('common.preview')+'</button></div>';
}
function propsTable(b){
  const t = ensureTable(b);
  const R=tblRows(t), C=tblCols(t);
  const rowsA=[]; for(let ri=0;ri<R;ri++){ const tds=[];
    for(let ci=0;ci<C;ci++) tds.push('<textarea data-cell="'+ri+','+ci+'" rows="1"'
      + ((t.head&&ri===0)||(t.rowhead&&ci===0)?' class="hd"':'')
      + ' placeholder="'+((t.head&&ri===0)?T('tbl.colHead'):'　')+'">'+esc(cellHead(t,ri,ci))+'</textarea>');
    rowsA.push('<div class="pcrow">'+tds.join('')+'</div>'); }
  const grid = '<div class="pcells">' + rowsA.join('') + '</div>';
  /* 標題的說法會隨外觀改變，所以每次都附上說明 */
  const headHint = t.look==='list'
      ? T('prop.headHintList')
      : t.look==='card'
        ? T('prop.headHintCard')
        : T('prop.headHintGrid');
  const rowOn = (t.look==='grid');
  return pRow(T('prop.titles'),
      '<div class="row">'
      + '<button data-p="capon" class="'+(t.capOn?'on':'')+'" title="'+T('tbl.capTip')+'">'+T('tbl.name')+'</button>'
      + '<button data-p="head" class="'+(t.head?'on':'')+'" title="'+T('tbl.headTip')+'">'+T('tbl.colHeadBtn')+'</button>'
      + '<button data-p="rowhead" class="'+(t.rowhead && rowOn?'on':'')+'"'
      + (rowOn?'':' disabled')+' title="'+T('tbl.rowHeadTip')+'">'+T('tbl.rowHeadBtn')+'</button>'
      + '</div>',
      headHint + (rowOn?'':'<br><b>'+T('tbl.rowHeadBtn')+'</b>'+T('tbl.rowHeadOnlyGrid')))
    + (t.capOn
        ? pRow(T('tbl.name'),'<input type="text" data-p="tname" value="'+esc(t.name)+'" placeholder="'+T('tbl.namePh')+'">',
            T('tbl.nameHint'))
        : '')
    + pRow(T('prop.look'), pSeg('look', t.look, [['grid',T('tbl.look.grid')],['list',T('tbl.look.list')],['card',T('tbl.look.card')]]),
        t.look==='list' ? T('tbl.lookListHint')
        : t.look==='card' ? T('tbl.lookCardHint') : '')
    + pRow(T('prop.tblSize'),
        '<div class="grid2"><button data-p="row" data-v="1">'+T('common.rowAdd')+'</button><button data-p="row" data-v="-1">'+T('common.rowDel')+'</button></div>'
      + '<div class="grid2" style="margin-top:6px"><button data-p="col" data-v="1">'+T('common.colAdd')+'</button><button data-p="col" data-v="-1">'+T('common.colDel')+'</button></div>'
      + '<div class="grid2" style="margin-top:6px"><button data-p="delrow" class="danger">'+T('tbl.delRow')+'</button>'
      + '<button data-p="delcol" class="danger">'+T('tbl.delCol')+'</button></div>',
        T('tbl.delHint'))
    + pRow(T('tbl.cells'), grid + '<div class="row" style="margin-top:6px"><button data-p="big" class="on">'+T('tbl.bigWin')+'</button></div>',
        T('tbl.bigHint'))
    + pRow(T('tbl.putInCell'),
        '<select data-p="cellblk"><option value="">'+T('tbl.pickBlock')+'</option>'
        + POP_ADD.map(k=>{ const t=TYPES.find(x=>x.k===k); return t?'<option value="'+k+'">'+esc(t.n)+'</option>':''; }).join('')
        + '</select>',
        (lastCell && lastCell.id===b.id
          ? T('tbl.targetCell', lastCell.r+1, lastCell.c+1)
            + T('tbl.targetHint')
          : T('tbl.targetNone')
            + T('tbl.targetHint2')))
    + pRow(T('prop.output'),
        '<div class="row"><label class="pradio"><input type="radio" name="tom" data-p="om" value="roll"'+(t.outMode==='roll'?' checked':'')+'>roll-table</label>'
      + '<label class="pradio"><input type="radio" name="tom" data-p="om" value="simple"'+(t.outMode==='simple'?' checked':'')+'>'+T('prop.omSimple')+'</label>'
      + '<label class="pradio"><input type="radio" name="tom" data-p="om" value="free"'+(t.outMode==='free'?' checked':'')+'>'+T('prop.omFree')+'</label></div>'
      + (t.outMode==='roll' ? '<div class="row" style="margin-top:6px"><input type="text" data-p="dice" value="'+esc(t.dice)+'" placeholder="1D6" style="flex:0 0 5.5em"><button data-p="make">'+T('prop.remake')+'</button></div>' : '')
      + (t.outMode==='simple' ? '<div class="row" style="margin-top:6px"><button data-p="make">'+T('prop.remake')+'</button></div>' : '')
      + '<textarea data-p="out" rows="4" style="margin-top:6px" placeholder="'+T('prop.outPh')+'">'+esc(t.outMode==='free'?t.out:tblOutText(t))+'</textarea>')
    + '<div class="grid2" style="margin-top:8px"><button data-p="copy" class="on">'+T('prop.copyOut')+'</button>'
    + '<button data-p="prev">'+T('common.preview')+'</button></div>'
    /* 儲存格的文字也能放入與內文相同的記號。目標是目前操作中的儲存格 */
    + propsRich(b);
}
function propsNpc(b){
  const np = ensureNpc(b);
  const sys = np.sys||'emoklore';
  return pRow(T('npc.system'),
      '<select data-p="sys">'
      + [['emoklore',T('npc.sys.emoklore')],['dx3rd',T('npc.sys.dx3rd')],['coc',T('npc.sys.coc')]]
        .map(([v,t])=>'<option value="'+v+'"'+(sys===v?' selected':'')+'>'+t+'</option>').join('')
      + '</select>'
      + (sys==='coc' ? '<div class="row" style="margin-top:6px">'
          + '<button data-p="ver" data-v="7" class="'+(np.coc.ver!=='6'?'on':'')+'">'+T('npc.ver7')+'</button>'
          + '<button data-p="ver" data-v="6" class="'+(np.coc.ver==='6'?'on':'')+'">'+T('npc.ver6')+'</button></div>' : ''))
    + pRow(T('npc.kanaPh'),'<input type="text" data-p="kana" value="'+esc(np.kana||'')+'" placeholder="'+T('prop.kanaEx')+'">')
    + pRow(T('npc.namePh'),'<input type="text" data-p="name" value="'+esc(np.name||'')+'" placeholder="'+T('prop.nameEx')+'">')
    + pRow(T('prop.age'),'<input type="text" data-p="role" value="'+esc(np.role||'')+'" placeholder="'+T('prop.roleEx')+'">')
    + pRow(T('prop.art'),
        '<div class="row"><button data-p="art">'+(np.art?T('npc.artChange'):T('prop.artAdd'))+'</button>'
        + (np.art?'<button data-p="artdel" class="danger">'+T('npc.artRemove')+'</button>':'')+'</div>'
        + (np.art?'<div class="row" style="margin-top:6px;align-items:center"><span class="hint" style="flex:0 0 auto">'+T('npc.artWidth')+'</span>'
            + '<input type="number" data-p="artw" min="15" max="50" value="'+(np.artW||30)+'" style="width:66px;flex:0 0 auto">'
            + '<span class="hint" style="flex:0 0 auto">%</span></div>':''),
        np.art?T('prop.artHint'):'')
    + '<label class="f">'+T('prop.body')+'</label>'
    + '<div class="row"><button data-p="open" class="on">'+T('prop.openSheet')+'</button></div>'
    + '<div class="hint">'+T('prop.npcHint')+'</div>'
    + '<div class="grid2" style="margin-top:8px"><button data-p="ccf">'+T('prop.ccf')+'</button>'
    + '<button data-p="ccfin">'+T('prop.ccfIn')+'</button></div>'
    + (sys==='dx3rd' ? '<div class="row" style="margin-top:6px">'
        + '<button data-p="ytin">'+T('prop.ytIn')+'</button></div>' : '')
    + '<div class="hint">'+T('prop.ccfInHint1')
    + T('prop.ccfInHint2')
    + '<b>'+T('prop.ccfInHint3')+'</b>'+T('prop.ccfInHint4')+'</div>'
    + '<div class="row" style="margin-top:8px"><button data-p="prev">'+T('common.preview')+'</button></div>';
}
function propsPopup(b){
  const p = ensurePopup(b);
  return pRow(T('prop.popName'),'<input type="text" data-p="plabel" value="'+esc(p.label||'')+'" placeholder="'+T('pop.defaultLabel')+'">',
      T('prop.popNameHint', esc(String(p.label||T('pop.defaultLabel')))))
    + '<label class="f">'+T('prop.body')+'</label>'
    + '<div class="row"><button data-p="popedit" class="on">'+T('prop.openPop')+'</button></div>'
    + '<div class="hint">'
    + (popIsBlocks(p)
        ? T('prop.popHintBlocks')
        : T('prop.popHintText'))
    + '</div>'
    + '<label class="f">'+T('prop.imgPos')+'</label>'
    + '<div class="row"><button data-p="ponly"'+(p.only?' class="on"':'')+'>'+T('prop.notOnPaper')+'</button></div>'
    + '<div class="hint">'+T('prop.popOnlyHint', esc(p.label||T('pop.defaultLabel')))+'</div>'
    + '<div class="row" style="margin-top:8px"><button data-p="prev">'+T('common.preview')+'</button></div>';
}
function syncBlockPanel(){
  const info=document.getElementById('selInfo');
  /* 剛讀取或復原後，已消失區塊的 ID 可能還留在選取裡 */
  [...sel].forEach(id=>{ if(!findBlock(id)) sel.delete(id); });
  const first = sel.size?findBlock([...sel][0]):null;
  if(!sel.size) info.innerHTML=T('sel.hint');
  else if(sel.size===1) info.textContent=T('sel.current')+TYPE_NAME(first.b.type)+'／'+(first.b.cols===1?T('src.span'):T('sel.inCol'));
  else info.textContent=T('sel.many', sel.size);
  document.querySelectorAll('#typeBtns button,#popTypeBtns button')
    .forEach(b=>b.classList.toggle('on', !!first && b.dataset.k===first.b.type));
  const psi = document.getElementById('popSideInfo');
  if(psi) psi.innerHTML = !sel.size ? T('sel.hint')
    : (sel.size===1 ? T('sel.current')+TYPE_NAME(first.b.type) : T('sel.many', sel.size));
  document.getElementById('colSpan').classList.toggle('on', !!first && first.b.cols===1);
  document.getElementById('colFlow').classList.toggle('on', !!first && first.b.cols===2);
  const pidx = selPageIdx();
  const pcols = pidx ? [...new Set(pidx.map(i=>(S.pages[i]||{}).cols===2?2:1))] : [];
  document.getElementById('pcol1').classList.toggle('on', pcols.length===1 && pcols[0]===1);
  document.getElementById('pcol2').classList.toggle('on', pcols.length===1 && pcols[0]===2);
  document.getElementById('pcolNote').textContent = pidx
    ? T('pcol.target')+pidx.map(i=>i+1).join('、')
    : T('pcol.note');
  document.getElementById('mergeBlk').disabled = sel.size<2;
  document.getElementById('imgClearFloat').classList.toggle('on', !!first && !!first.b.clr);
  const lv = first ? (first.b.ind||0) : 0;
  document.getElementById('indOut').disabled = !first || lv===0;
  document.getElementById('indIn').disabled  = !first || lv>=4;
  document.getElementById('indNote').textContent = first
    ? (lv ? T('ind.now', lv) : T('ind.none'))
    : T('ind.note');
  document.getElementById('mTop').value = first && first.b.mt!=null ? first.b.mt : '';
  document.getElementById('mBot').value = first && first.b.mb!=null ? first.b.mb : '';
  syncPopSideBtns();
}
['mTop','mBot'].forEach(id=>document.getElementById(id).addEventListener('change',e=>{
  const v = e.target.value===''?null:+e.target.value;
  sel.forEach(x=>{const f=findBlock(x); if(f) f.b[id==='mTop'?'mt':'mb']=v;});
  render(); save();
}));
/* 用 ｜…《》 包住選取的文字，並把游標放進《》裡。
   ｜不切換日文輸入就不好打，所以做成可以用按鈕或快捷鍵插入。 */
function insertRuby(){
  const sl = getSelection();
  const node = sl && sl.anchorNode;
  const host = node && (node.nodeType===1?node:node.parentElement);
  const box = host && host.closest('.srctext[contenteditable="true"]');
  if(!box){ setStatus(T('status.rubyPick'),'#ff9b83'); return; }
  const base = String(sl).replace(/[\n｜|《》]/g,'');   // 不把已經有的記號捲進來
  document.execCommand('insertText', false, '｜'+base+'《》');
  try{ sl.modify('move','backward','character'); }catch(_){}
  box.dispatchEvent(new Event('input',{bubbles:true}));
  setStatus(base?T('status.rubyWrite'):T('status.rubyForm'),'var(--ok)');
}
document.getElementById('btnRuby').onclick=insertRuby;
document.getElementById('mvUp').onclick=()=>moveBlk(-1);
document.getElementById('mvDn').onclick=()=>moveBlk(1);
function moveBlk(d){
  const ids=[...sel]; if(!ids.length) return;
  const L = selList();
  const idx=ids.map(id=>L.findIndex(b=>b.id===id)).filter(i=>i>=0).sort((a,b)=>a-b);
  if(!idx.length) return;
  const order = d<0?idx:idx.slice().reverse();
  for(const i of order){
    const j=i+d; if(j<0||j>=L.length) return;
    L.splice(j,0,L.splice(i,1)[0]);
  }
  render(); save();
}
/* 把選取的段落合併成一個。書式沿用第一個的 */
document.getElementById('mergeBlk').onclick=()=>{
  if(sel.size<2) return;
  const L = selList();
  const idx=[...sel].map(id=>L.findIndex(b=>b.id===id)).filter(i=>i>=0).sort((a,b)=>a-b);
  if(idx.length<2){ setStatus(T('status.sameList'),'#ff9b83'); return; }
  const bad = idx.filter(i=>['npc','toc','break','colbr'].includes(L[i].type));
  if(bad.length){ setStatus(T('status.cantMerge'),'#ff9b83'); return; }
  const head = L[idx[0]];
  head.text = idx.map(i=>String(L[i].text||'')).filter(x=>x.trim()).join('\n');
  for(let k=idx.length-1;k>=1;k--) L.splice(idx[k],1);
  sel.clear(); sel.add(head.id); editingId=null;
  render(); save(); setStatus(T('status.merged', idx.length),'var(--ok)');
};
document.getElementById('dupBlk').onclick=()=>{
  const L = selList();
  const idx=[...sel].map(id=>L.findIndex(b=>b.id===id)).filter(i=>i>=0).sort((a,b)=>b-a);
  idx.forEach(i=>L.splice(i+1,0,fixBlock(Object.assign(JSON.parse(JSON.stringify(L[i])),{id:uid()}))));
  render(); save();
};
document.getElementById('addBlk').onclick=()=>{
  const spot = cellTarget();
  if(spot){ addToCell(spot, 'desc'); return; }
  const L = homeList() || selList();
  const at = sel.size ? Math.max(...[...sel].map(id=>L.findIndex(b=>b.id===id))) : L.length-1;
  const nb = newBlock('desc','');
  L.splice(at+1,0,nb);
  sel.clear(); sel.add(nb.id);
  render(); focusSrc(nb.id,false); save();
};
document.getElementById('delBlk').onclick=()=>{
  if(!sel.size) return;
  if(!confirm(T('confirm.delParas', sel.size))) return;
  blockLists().forEach(L=>{ for(let i=L.length-1;i>=0;i--) if(sel.has(L[i].id)) L.splice(i,1); });
  keepNotEmpty();
  sel.clear(); editingId=null; render(); save();
};

/* ================= 目錄 ================= */
function buildTOC(){
  const box=document.getElementById('tocList'); if(!box) return;
  const e=tocEntries();
  if(pagesVisible() && pagesView==='toc')
    document.getElementById('pagesNote').textContent = T('pages.nItems', e.length);
  box.innerHTML = e.length ? e.map(x=>
    '<button class="tocitem lv'+x.lv+'" data-go="'+x.id+'">'+esc(x.text)+'<span class="pg">P.'+x.page+'</span></button>'
  ).join('') : '<div class="hint">'+T('toc.emptyHint')+'</div>';
  box.onclick=ev=>{
    const b=ev.target.closest('[data-go]'); if(!b) return;
    sel.clear(); sel.add(b.dataset.go); paintSel();
    const row=srcList.querySelector('.src[data-id="'+b.dataset.go+'"]');
    if(row) row.scrollIntoView({behavior:'smooth',block:'center'});
    const pel=stage.querySelector('.blk[data-id="'+b.dataset.go+'"]');
    if(pel) pel.scrollIntoView({behavior:'smooth',block:'center'});
  };
}
document.getElementById('tocMake').onclick=()=>{
  if(S.blocks.some(b=>b.type==='toc')){ if(!confirm(T('confirm.tocExists'))) return; }
  const at = sel.size ? Math.max(...[...sel].map(id=>S.blocks.findIndex(b=>b.id===id))) : 0;
  const nb = newBlock('toc',''); nb.cols=1;
  S.blocks.splice(at+1,0,nb, newBlock('break',''), newBlock('desc',''));
  render(); save(); setStatus(T('status.tocMade'),'var(--ok)');
};

/* ================= 頁面（分欄與背景） ================= */
const bgWrap=document.getElementById('bgPresets');
function paintBgPresets(){
  bgWrap.innerHTML=BGS.map(b=>'<button class="swatch" data-bg="'+b.k+'"><div class="page '+(b.k==='none'?'':b.k)
    +'" style="width:100%;height:100%;position:absolute;inset:0"><div class="page-bg '+(b.k==='none'?'':b.k)
    +'" style="position:absolute;inset:0"></div></div><span>'+b.n+'</span></button>').join('');
}
paintBgPresets();
let bgPick='none', bgImg=null;
bgWrap.onclick=e=>{const b=e.target.closest('[data-bg]');if(!b)return;bgPick=b.dataset.bg;
  bgWrap.querySelectorAll('.swatch').forEach(x=>x.classList.toggle('on',x===b));};
document.getElementById('bgFile').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  if(f.size>2.5*1024*1024 && !confirm(T('confirm.bigBg'))) return;
  const r=new FileReader(); r.onload=()=>{bgImg=r.result; setStatus(T('status.imgLoaded'),'var(--ok)');}; r.readAsDataURL(f);
};
function buildBgPages(){
  const box=document.getElementById('bgPages');
  box.innerHTML=S.pages.map((p,i)=>'<label><input type="checkbox" class="bgpg" value="'+i+'"'+(pgSel.has(p.id)?' checked':'')
    +'> P.'+(i+1)+'　<span style="color:var(--muted)">'+(p.cols===2?T('page.c2'):T('page.c1'))+'／'
    +((BGS.find(b=>b.k===p.bg.preset)||{}).n||'')+(p.bg.img?T('page.plusImg'):'')+'</span></label>').join('');
  box.onchange=e=>{
    const c=e.target.closest('.bgpg'); if(!c) return;
    const pg=S.pages[+c.value]; if(!pg) return;
    c.checked ? pgSel.add(pg.id) : pgSel.delete(pg.id);
    syncPageChecks();
  };
}
function syncPageChecks(){
  stage.querySelectorAll('.pgsel').forEach(c=>{ const p=S.pages[+c.dataset.pi]; if(p) c.checked = pgSel.has(p.id); });
}
document.getElementById('bgAll').onclick=()=>{S.pages.forEach(p=>pgSel.add(p.id));buildBgPages();syncPageChecks();};
document.getElementById('bgNone').onclick=()=>{pgSel.clear();buildBgPages();syncPageChecks();};
function targetPages(){
  const idx=S.pages.map((p,i)=>pgSel.has(p.id)?i:-1).filter(i=>i>=0);
  return idx.length?idx:null;
}
document.getElementById('pcol1').onclick=()=>setPageCols(1);
document.getElementById('pcol2').onclick=()=>setPageCols(2);
/* 分欄以頁為單位。作用在選取段落所在的頁面。
   若在「頁面」分頁選了頁面，則以那邊為優先。 */
function selPageIdx(){
  const chosen = targetPages();
  if(chosen) return chosen;
  const set=new Set();
  sel.forEach(id=>{ const i=pageOfBlock(id); if(i) set.add(i-1); });
  if(!set.size && pageMap.length) set.add(0);
  return set.size ? [...set].sort((a,b)=>a-b) : null;
}
function setPageCols(n){
  const idx=selPageIdx();
  if(!idx) return;
  idx.forEach(i=>{ if(S.pages[i]) S.pages[i].cols=n; });
  render(); save();
  setStatus(T('status.pageCols', 'P.'+idx.map(i=>i+1).join('、'), n),'var(--ok)');
}
stage.addEventListener('click', e=>{
  const pc=e.target.closest('[data-pcol]');
  if(pc){ const p=pageSetting(+pc.dataset.pcol); p.cols = p.cols===2?1:2; render(); save(); return; }
  const cb=e.target.closest('.pgsel');
  if(cb){ const p=S.pages[+cb.dataset.pi]; if(!p) return;
    cb.checked ? pgSel.add(p.id) : pgSel.delete(p.id); buildBgPages(); }
});
/* 刪除頁面＝刪除載在該頁上的段落 */
document.getElementById('pgDel').onclick=()=>{
  const idx=targetPages();
  if(!idx) return alert(T('alert.pickPageToDel'));
  const ids=new Set();
  idx.forEach(i=>(pageMap[i]||[]).forEach(x=>ids.add(x)));
  /* 讓該頁結束的換頁也一起刪除 */
  idx.forEach(i=>{
    const last=(pageMap[i]||[]).slice(-1)[0];
    const at = last ? S.blocks.findIndex(b=>b.id===last) : -1;
    const nx = at>=0 ? S.blocks[at+1] : null;
    if(nx && nx.type==='break') ids.add(nx.id);
  });
  if(!ids.size) return alert(T('alert.noParaOnPage'));
  if(!confirm(T('confirm.pageDelete', 'P.'+idx.map(i=>i+1).join('、'), ids.size))) return;
  S.blocks = S.blocks.filter(b=>!ids.has(b.id));
  if(!S.blocks.length) S.blocks.push(newBlock('desc',''));
  idx.slice().sort((a,b)=>b-a).forEach(i=>{ if(S.pages.length>1 && S.pages[i]) S.pages.splice(i,1); });
  pgSel.clear(); sel.clear(); editingId=null;
  render(); save(); setStatus(T('status.pagesDeleted', idx.length),'var(--ok)');
};
document.getElementById('bgApply').onclick=()=>{
  const idx=targetPages(); if(!idx) return alert(T('alert.pickPageToApply'));
  idx.forEach(i=>{
    S.pages[i].bg.preset=bgPick;
    if(bgImg) S.pages[i].bg.img=bgImg;
    S.pages[i].bg.fit=document.getElementById('bgFit').value;
    S.pages[i].bg.opa=+document.getElementById('bgOpa').value;
  });
  render(); save(); setStatus(T('status.bgApplied', idx.length),'var(--ok)');
};
document.getElementById('bgClear').onclick=()=>{
  const idx=targetPages(); if(!idx) return alert(T('alert.pickPageToClear'));
  idx.forEach(i=>S.pages[i].bg={preset:'none',img:null,fit:'cover',opa:35});
  render(); save();
};

/* ================= 設定・輸入輸出 ================= */
['footNum','footText','footFrom'].forEach(id=>{
  document.getElementById(id).addEventListener('change',e=>{
    S.foot = S.foot || {num:true,text:'',from:1};
    if(id==='footNum')  S.foot.num  = e.target.checked;
    if(id==='footText') S.foot.text = e.target.value;
    if(id==='footFrom') S.foot.from = Math.max(0, parseInt(e.target.value,10)||1);
    render(); save();
  });
});
document.getElementById('footText').addEventListener('input',e=>{
  S.foot=S.foot||{num:true,text:'',from:1}; S.foot.text=e.target.value; repaginateSoon(); save();
});
['docTitle','padV','padH','baseSize'].forEach(id=>{
  document.getElementById(id).addEventListener('change',e=>{
    if(id==='docTitle') S.title=e.target.value;
    /* 欄位留空就離開的話，+'' 會變成 0，變成間距 0mm・內文 0pt。
       先收在範圍內，欄位的顯示也一併修正 */
    const clamp=(v,lo,hi,def)=>{ const x=parseFloat(String(v).trim());
      return isNaN(x) ? def : Math.max(lo, Math.min(hi, x)); };
    if(id==='padV'){ S.padV = clamp(e.target.value, 5, 40, 18); e.target.value = S.padV; }
    if(id==='padH'){ S.padH = clamp(e.target.value, 5, 40, 16); e.target.value = S.padH; }
    if(id==='baseSize'){ S.base = clamp(e.target.value, 6, 20, 10); e.target.value = S.base; }
    render(); save();
  });
});
document.getElementById('btnUndo').onclick=undo;
document.getElementById('btnRedo').onclick=redo;
document.getElementById('zoomIn').onclick =()=>stepZoom(1);
document.getElementById('zoomOut').onclick=()=>stepZoom(-1);
document.getElementById('zoomVal').onclick =()=>{zoomMode='fit';applyZoom();};
addEventListener('resize',()=>{if(zoomMode==='fit')applyZoom();});

/* ---- 預覽的縮放與移動 ---- */
const cw = document.getElementById('canvasWrap');
/* 用 Ctrl+滾輪，在保持指標位置的情況下縮放 */
cw.addEventListener('wheel', e=>{
  if(e.ctrlKey||e.metaKey){
    e.preventDefault();
    const r = cw.getBoundingClientRect();
    stepZoom(e.deltaY<0?1:-1, {x:e.clientX-r.left, y:e.clientY-r.top});
  }else if(e.shiftKey){
    e.preventDefault();
    cw.scrollLeft += (e.deltaY||e.deltaX);
  }
}, {passive:false});
/* 用中鍵拖曳，或按住 Space 拖曳來移動紙面。
   從空白處拖曳是用來框選的，所以那個保留下來。 */
let panning=null, spaceHeld=false;
cw.addEventListener('pointerdown', e=>{
  const useMiddle = e.button===1;
  const useSpace  = e.button===0 && spaceHeld;
  if(!useMiddle && !useSpace) return;
  e.preventDefault();
  panning={x:e.clientX, y:e.clientY, l:cw.scrollLeft, t:cw.scrollTop, id:e.pointerId};
  cw.setPointerCapture(e.pointerId);
  cw.classList.add('panning');
});
cw.addEventListener('pointermove', e=>{
  if(!panning || e.pointerId!==panning.id) return;
  cw.scrollLeft = panning.l - (e.clientX-panning.x);
  cw.scrollTop  = panning.t - (e.clientY-panning.y);
});
function endPan(e){
  if(!panning) return;
  try{ cw.releasePointerCapture(panning.id); }catch(_){}
  panning=null; cw.classList.remove('panning');
}
cw.addEventListener('pointerup', endPan);
cw.addEventListener('pointercancel', endPan);
addEventListener('keydown', e=>{
  if(e.code==='Space' && !e.repeat){
    const a=document.activeElement;
    const typing = a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
    if(typing) return;
    spaceHeld=true; cw.classList.add('panready'); e.preventDefault();
  }
  if((e.ctrlKey||e.metaKey) && !e.altKey){
    if(e.key==='0'){ e.preventDefault(); zoomMode='fit'; applyZoom(); }
    else if(e.key==='+'||e.key==='='){ e.preventDefault(); stepZoom(1); }
    else if(e.key==='-'){ e.preventDefault(); stepZoom(-1); }
  }
});
addEventListener('keyup', e=>{
  if(e.code==='Space'){ spaceHeld=false; cw.classList.remove('panready'); }
});
addEventListener('blur', ()=>{ spaceHeld=false; cw.classList.remove('panready'); });
document.getElementById('btnSave').onclick=saveToFile;
document.getElementById('btnOpen').onclick=()=>document.getElementById('jsonFile').click();

/* ---- 插入與設定圖片 ---- */
/* 重新選擇目前選取的圖片（沒有的話就新增）。
   入口是右側設定欄的「重新選擇圖片」，以及書式按鈕的「圖片」 */
function pickImageFile(){
  const f = sel.size?findBlock([...sel][0]):null;
  imgReplaceId = (f && f.b.type==='image') ? f.b.id : null;
  document.getElementById('imgFile').click();
}
document.getElementById('imgFile').onchange=e=>{
  const file=e.target.files[0]; e.target.value='';
  if(!file) return;
  setStatus(T('status.imgLoading'));
  readImageFile(file, (data, ar)=>{
    if(imgReplaceId){
      const f=findBlock(imgReplaceId); if(f){ f.b.img=data; if(ar) f.b.ar=ar; }
      imgReplaceId=null;
    }else{
      const at = sel.size ? Math.max(...[...sel].map(id=>S.blocks.findIndex(b=>b.id===id))) : S.blocks.length-1;
      const nb = newBlock('image',''); nb.img=data; nb.cols=1; if(ar) nb.ar=ar;
      S.blocks.splice(at+1,0,nb);
      sel.clear(); sel.add(nb.id);
    }
    render(); save();
    setStatus(T('status.imgInserted'),'var(--ok)');
  });
};
/* 變成沒有選取任何段落的狀態。
   什麼都沒選取時，書式按鈕的作用不是轉換而是「加在最後」。 */
function deselectAll(quiet){
  const a=document.activeElement;
  if(a && a.blur && (a.isContentEditable||a.tagName==='INPUT'||a.tagName==='TEXTAREA')) a.blur();
  sel.clear(); editingId=null; lastPick=null;
  paintSel(); syncBlockPanel();
  if(!quiet) setStatus(T('status.deselected'));
}
document.getElementById('btnDesel').onclick=()=>deselectAll();
/* 區塊本身的備份。表格和 NPC 卡都連同內容一起複製 */
let blkClip = null;
function blkCopyDo(quiet){
  if(!sel.size){ if(!quiet) setStatus(T('status.pickToCopy'),'#ff9b83'); return null; }
  const L = selList();
  const idx=[...sel].map(id=>L.findIndex(b=>b.id===id)).filter(i=>i>=0).sort((a,b)=>a-b);
  if(!idx.length) return null;
  blkClip = idx.map(i=>JSON.parse(JSON.stringify(L[i])));
  document.getElementById('blkPaste').disabled = false;
  setStatus(T('status.parasCopied', blkClip.length),'var(--ok)');
  return blkClip;
}
/* 整理要貼上的一組。連巢狀（彈出視窗的內容・表格儲存格的內容）都
   一路走訪，重新配發標記(id)。不重新配發的話，以為在修改複製的那一份，
   實際上改到的卻是原本的區塊（因為 findBlock 會回傳先找到的那個） */
function blkPrepPaste(b){
  fixBlock(b);
  b.id = uid();
  if(b.type==='table') ensureTable(b);
  if(b.type==='popup') ensurePopup(b);
  if(b.type==='npc')   ensureNpc(b);
  if(b.type==='proc')  ensureProc(b);
  if(b.type==='flow'){
    /* 圖的方框與線也配發新的標記。避免修改複製的那份時連原本的也跟著變 */
    const ff = ensureFlow(b), map = {};
    ff.nodes.forEach(n=>{ const o=n.id; n.id = uid(); map[o] = n.id; });
    ff.edges.forEach(e=>{ e.id = uid(); e.a = map[e.a]||e.a; e.b = map[e.b]||e.b; });
  }
  subLists(b).forEach(L=>L.forEach(blkPrepPaste));
  return b;
}
function blkPasteDo(){
  if(!blkClip || !blkClip.length){ setStatus(T('status.nothingToPaste'),'#ff9b83'); return; }
  const L = selList();
  const at = sel.size ? Math.max(...[...sel].map(id=>L.findIndex(b=>b.id===id))) : L.length-1;
  const made = blkClip.map(b=>blkPrepPaste(JSON.parse(JSON.stringify(b))));
  L.splice(at+1,0,...made);
  sel.clear(); made.forEach(b=>sel.add(b.id));
  render(); save(); setStatus(T('status.parasPasted', made.length),'var(--ok)');
}
/* 目前是否在輸入文字的欄位（在那裡的 Ctrl+C／V 交給瀏覽器） */
function inTextField(){
  const a = document.activeElement;
  if(!a) return false;
  if(a.tagName==='INPUT' || a.tagName==='TEXTAREA') return true;
  return !!(a.closest && a.closest('[contenteditable=true]'));
}
function hasTextSelection(){
  const s = getSelection();
  return !!(s && !s.isCollapsed && String(s).length);
}
/* 讓單純的 Ctrl+C／Ctrl+V 也能複製整個段落。
   分界只看「有沒有選取文字」。
   彈出視窗裡或紙面上的段落，一選取就會變成可以輸入的欄位，
   若以「是否在文字欄」來分，在那裡就完全無法複製（實際上就是這樣）。 */
const BLK_CLIP_TAG = '\u0000trpg-blocks\u0000';
/* copy 事件中的 setData，在沒有選取文字時什麼都不會寫進剪貼簿（實測）。
   放進看不見的欄位再用 execCommand 複製，沒選取也能寫入 */
let clipBusy = false;
function writeClipText(t){
  if(clipBusy) return false;
  clipBusy = true;
  const back = document.activeElement;
  const ta = document.createElement('textarea');
  ta.value = t;
  ta.setAttribute('style','position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0');
  document.body.appendChild(ta);
  let ok = false;
  try{ ta.focus(); ta.select(); ok = document.execCommand('copy'); }catch(_){}
  ta.remove();
  if(back && back.focus) try{ back.focus(); }catch(_){}
  clipBusy = false;
  return ok;
}
addEventListener('copy', e=>{
  if(clipBusy || hasTextSelection()) return;
  const arr = blkCopyDo(true);
  if(!arr || !arr.length) return;
  e.preventDefault();
  const json = BLK_CLIP_TAG + JSON.stringify(arr);
  /* 含有圖片會太大，這種時候只留下備份 */
  if(json.length < 2000000) writeClipText(json);
});
addEventListener('paste', e=>{
  if(clipBusy) return;
  let txt = '';
  try{ txt = (e.clipboardData||window.clipboardData).getData('text/plain')||''; }catch(_){}
  /* 若是段落的備份，即使游標在文字欄裡，也貼這邊的 */
  if(txt.indexOf(BLK_CLIP_TAG)!==0) return;
  try{ const a = JSON.parse(txt.slice(BLK_CLIP_TAG.length));
    if(Array.isArray(a) && a.length) blkClip = a; }catch(_){}
  if(!blkClip || !blkClip.length) return;
  e.preventDefault();
  blkPasteDo();
});
/* 在無法寫入剪貼簿的情況下（沒選取文字就複製時、環境的限制）
   也能貼上，按鍵這邊也要接住。在文字欄裡時交給瀏覽器
   （那邊由上面的 paste 只在是段落備份時攔截） */
addEventListener('keydown', e=>{
  if(!(e.ctrlKey||e.metaKey) || e.altKey || e.shiftKey) return;
  const code = String(e.code||'');
  if(code!=='KeyV' && String(e.key||'').toUpperCase()!=='V') return;
  if(inTextField() || hasTextSelection()) return;
  if(!blkClip || !blkClip.length) return;
  e.preventDefault();
  blkPasteDo();
});
document.getElementById('blkCopy').onclick=blkCopyDo;
document.getElementById('blkPaste').onclick=blkPasteDo;
/* Esc：正在打字的話就回到段落選取，只是選取著的話也取消那個選取 */
addEventListener('keydown', e=>{
  if(e.key!=='Escape') return;
  if(npcModalId || popId) return;
  if(document.querySelector('#prjDlg[style*="flex"],#helpDlg[style*="flex"],#ccfDlg[style*="flex"],#tblDlg[style*="flex"],#ccfInDlg[style*="flex"],#ytDlg[style*="flex"]')) return;
  if(e.__escHandled) return;                       // 用在解除編輯的那一次不算
  const a=document.activeElement;
  if(a && (a.isContentEditable||a.tagName==='INPUT'||a.tagName==='TEXTAREA')) return;
  if(sel.size){ e.preventDefault(); deselectAll(); }
});
const TEXT_COLORS = [
  ['color.default','' ],['color.aka','#a8331f'],['color.ai','#1c3f6e'],['color.green','#2f5d40'],
  ['color.purple','#5b3a7e'],['color.kin','#8a6a1f'],['color.hai','#6d6353']
];
function paintColBtns(){
  document.getElementById('colBtns').innerHTML = TEXT_COLORS.slice(1).map(([n,c])=>
    '<button class="colsw" data-col="'+c+'" title="'+T(n)+'" style="background:'+c+'"></button>').join('');
}
paintColBtns();
document.getElementById('colBtns').onclick=e=>{
  const b=e.target.closest('[data-col]'); if(b) setTextColor(b.dataset.col);
};
document.getElementById('colPick').addEventListener('input',e=>setTextColor(e.target.value));
document.getElementById('colClear').onclick=()=>setTextColor('');
/* 在左側內文選取的範圍加上註解 */
document.getElementById('cmtAdd').onclick=()=>{
  const s0=getSelection();
  const node=s0 && s0.anchorNode;
  const host=node && (node.nodeType===1?node:node.parentElement);
  const box=host && host.closest('#srcList .srctext[contenteditable="true"],#popSrc .srctext[contenteditable="true"]');
  if(!box || !s0.rangeCount || s0.isCollapsed){
    setStatus(T('status.cmtPick'),'#ff9b83'); return; }
  if(box.dataset.tsrc!=null){
    setStatus(T('status.cmtNoCell'),'#ff9b83'); return; }
  const f=findBlock(box.dataset.id); if(!f) return;
  const r=s0.getRangeAt(0);
  const pre=document.createRange(); pre.selectNodeContents(box); pre.setEnd(r.startContainer, r.startOffset);
  const a=pre.toString().length, z=a+String(r).length;
  const txt=prompt(T('prompt.cmt', String(r).slice(0,30)),'');
  if(txt===null || !txt.trim()) return;
  f.b.cm = blockComments(f.b).concat([{a:a,b:z,t:txt.trim()}]).sort((x,y)=>x.a-y.a);
  render(); save(); setStatus(T('status.cmtAdded'),'var(--ok)');
};
document.getElementById('cmtDel').onclick=()=>{
  let n=0;
  sel.forEach(id=>{const f=findBlock(id); if(f && blockComments(f.b).length){ f.b.cm=[]; n++; }});
  if(!n){ setStatus(T('status.cmtPickPara'),'#ff9b83'); return; }
  render(); save(); setStatus(T('status.cmtDeleted'),'var(--ok)');
};
/* 在紙面上按下註解，就顯示在右側欄外 */
function showCmt(id, i, el){
  const f=findBlock(id); if(!f) return;
  const c=blockComments(f.b)[i]; if(!c) return;
  const rail=document.getElementById('cmtRail');
  rail.innerHTML='<div class="cmt-card"><div class="cmt-h">'+T('cmt.note')+' '+(i+1)+'</div>'
    + '<div class="cmt-b">'+esc(c.t)+'</div>'
    + '<button class="cmt-x" type="button">'+T('common.close')+'</button></div>';
  rail.classList.add('on');
  const wrap=document.getElementById('canvasWrap');
  const wr=wrap.getBoundingClientRect(), q=el.getBoundingClientRect();
  rail.style.top = Math.max(8, Math.round(q.top - wr.top)) + 'px';
  rail.querySelector('.cmt-x').onclick=()=>rail.classList.remove('on');
}
stage.addEventListener('click', e=>{
  const m=e.target.closest('[data-cmt]');
  if(!m){ document.getElementById('cmtRail').classList.remove('on'); return; }
  e.preventDefault(); e.stopPropagation();
  const [id,i]=m.dataset.cmt.split(':');
  showCmt(id, +i, m);
}, true);
/* 目前在內文中選取了文字的話，回傳該範圍與段落 */
function selectedTextRange(){
  const s0=getSelection();
  const node=s0 && s0.anchorNode;
  const host=node && (node.nodeType===1?node:node.parentElement);
  const box=host && host.closest('#srcList .srctext[contenteditable="true"],#popSrc .srctext[contenteditable="true"]');
  if(!box || !s0.rangeCount || s0.isCollapsed) return null;
  /* 表格內容的欄無法擁有「第幾個字到第幾個字」的裝飾，所以不回傳範圍 */
  if(box.dataset.tsrc!=null) return null;
  const f=findBlock(box.dataset.id); if(!f) return null;
  const r=s0.getRangeAt(0);
  if(!box.contains(r.startContainer) || !box.contains(r.endContainer)) return null;
  const pre=document.createRange(); pre.selectNodeContents(box); pre.setEnd(r.startContainer, r.startOffset);
  const a=pre.toString().length, z=a+String(r).length;
  return (z>a) ? {b:f.b, a:a, z:z, box:box} : null;
}
/* 有選取文字就只改那個範圍，沒選取就改整個段落的顏色 */
function setTextColor(c){
  if(tsrcFocus()){
    setStatus(T('status.colorNoCell'),'#ff9b83');
    return;
  }
  const rg = selectedTextRange();
  if(rg){
    clearMarkRange(rg.b, rg.a, rg.z);
    if(c) rg.b.mk = tidyMarks(blockMarks(rg.b).concat([{a:rg.a, b:rg.z, col:c, bold:false}]));
    const id=rg.b.id, a=rg.a, z=rg.z;
    render(); save(); selectSrcRange(id, a, z);
    setStatus(c?T('status.colorSel'):T('status.colorSelReset'),'var(--ok)');
    return;
  }
  if(!sel.size){ setStatus(T('status.colorPick'),'#ff9b83'); return; }
  sel.forEach(id=>{const f=findBlock(id); if(f) f.b.col = c || null;});
  render(); save();
  setStatus(c?T('status.colorPara'):T('status.colorParaReset'),'var(--ok)');
}
function setIndent(d, quiet){
  if(!sel.size){ if(!quiet) setStatus(T('status.indentPick'),'#ff9b83'); return; }
  sel.forEach(id=>{const f=findBlock(id); if(!f) return;
    f.b.ind = Math.max(0, Math.min(4, (f.b.ind||0)+d));});
  render(); save();
}
/* 把巢狀書式插在目前游標所在那一行的開頭。
   沒有碰到內文時，就在選取段落的最後新增一行。 */
/* 把目前選取的範圍以字數回傳 */
function selRangeIn(el){
  const s=getSelection(); if(!s.rangeCount) return null;
  const r=s.getRangeAt(0);
  if(!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
  const p1=r.cloneRange(); p1.selectNodeContents(el); p1.setEnd(r.startContainer,r.startOffset);
  const p2=r.cloneRange(); p2.selectNodeContents(el); p2.setEnd(r.endContainer,r.endOffset);
  return {a:p1.toString().length, z:p2.toString().length};
}
/* 重新選取以字數計算的範圍 */
function selectSrcRange(id, a, z, tsrc){
  const el = srcQ('.srctext[data-id="'+id+'"]'
    + (tsrc!=null ? '[data-tsrc="'+tsrc+'"]' : ':not([data-tsrc])')); if(!el) return;
  el.focus();
  const r=document.createRange(), r2=document.createRange();
  if(putCaret(el, r, a) && putCaret(el, r2, z)){
    r.setEnd(r2.startContainer, r2.startOffset);
  } else { r.selectNodeContents(el); r.collapse(false); }
  const s=getSelection(); s.removeAllRanges(); s.addRange(r);
  el.scrollIntoView({block:'nearest'});
}
function insertRichMark(mark, label, blk){
  const sl = getSelection();
  const node = sl && sl.anchorNode;
  const host = node && (node.nodeType===1?node:node.parentElement);
  const box  = host && host.closest('.srctext[contenteditable="true"]');
  if(box){
    /* 若是表格內容的欄，就直接改寫該儲存格的文字 */
    const ts = tsrcOf(box);
    if(ts){
      const rg0 = selRangeIn(box) || {a:caretOffset(box), z:caretOffset(box)};
      const r0 = richApply(ts.get(), rg0.a, rg0.z, mark);
      ts.set(r0.text);
      render(); save();
      selectSrcRange(ts.b.id, r0.a, r0.z, box.dataset.tsrc);
      setStatus(T(rg0.a===rg0.z?'status.markInserted':'status.markChanged', label),'var(--ok)');
      return;
    }
    const f = findBlock(box.dataset.id);
    const rg = selRangeIn(box) || {a:caretOffset(box), z:caretOffset(box)};
    if(f){
      const r = richApply(String(f.b.text||''), rg.a, rg.z, mark);
      setBlockText(f.b, r.text);
      render(); save();
      selectSrcRange(f.b.id, r.a, r.z);
      setStatus(T(rg.a===rg.z?'status.markInserted':'status.markChanged', label),'var(--ok)');
    }
    return;
  }
  /* 沒有碰到內文時，在該段落的最後新增一行 */
  const tgt = blk || (sel.size===1 ? (findBlock([...sel][0])||{}).b : null);
  /* 選取的是表格的話，加在最後操作的儲存格文字的最後
     （在紙面上的儲存格打字途中按下按鈕時，也會來到這裡） */
  if(tgt && tgt.type==='table'){
    const sp = cellTarget();
    if(sp){
      const t2 = ensureTable(sp.b);
      const cur = String(cellHead(t2, sp.r, sp.c)||'');
      const r2 = richApply(cur, cur.length, cur.length, mark);
      cellWrite(t2, sp.r, sp.c, r2.text);
      render(); save();
      selectSrcRange(sp.b.id, r2.a, r2.z, sp.r+','+sp.c);
      setStatus(T('status.markInCell', label, sp.r+1, sp.c+1),'var(--ok)');
      return;
    }
    setStatus(T('status.markPickCell'),'#ff9b83'); return;
  }
  if(tgt && RICH_TYPES.includes(tgt.type)){
    tgt.text = String(tgt.text||'').replace(/\n*$/,'') + (tgt.text?'\n':'') + mark;
    render(); save(); focusSrc(tgt.id, true);
    setStatus(T('status.markInserted', label),'var(--ok)');
    return;
  }
  setStatus(T('status.markPickLine'),'#ff9b83');
}

document.getElementById('indIn').onclick =()=>setIndent(1);
document.getElementById('indOut').onclick=()=>setIndent(-1);
function setImgFlow(v){
  let n=0;
  sel.forEach(id=>{const f=findBlock(id); if(!f || f.b.type!=='image') return;
    const b=f.b;
    b.pos = v;
    b.fl  = (v==='left'?'l':v==='right'?'r':'');
    b.cols = (v==='left'||v==='right') ? 2 : 1;
    if(v==='free'){
      if(b.fx==null) b.fx=0; if(b.fy==null) b.fy=0;
      if(!b.pg) b.pg = pageOfBlock(b.id) || 1;   // 沿用目前所在的頁面
      b.cols=1;
    }
    n++;});
  if(!n){ setStatus(T('status.imgPick'),'#ff9b83'); return; }
  render(); save();
  setStatus({inline:T('status.imgInline'),left:T('status.imgLeft'),right:T('status.imgRight'),free:T('status.imgFree')}[v],'var(--ok)');
}
/* 靠到紙面的邊緣。紙是 A4（210×297mm），放在往內留出間距的位置 */
function imgSnap(which){
  const f = sel.size?findBlock([...sel][0]):null;
  if(!f || f.b.type!=='image' || f.b.pos!=='free'){ setStatus(T('status.imgPickFree'),'#ff9b83'); return; }
  const b=f.b;
  /* 自由配置以紙（A4）的角為基準。寬度也以相對紙寬的％計算 */
  const PW = 210, PH = 297;
  const imgW = imgWmm(b);
  const el = stage.querySelector('.blk[data-id="'+b.id+'"] img');
  const ratio = el && el.naturalWidth ? el.naturalHeight/el.naturalWidth : 1;
  const imgH = imgW * ratio;
  if(which==='bottom') b.fy = Math.max(0, Math.round(PH - imgH - S.padV));
  if(which==='top')    b.fy = S.padV;
  if(which==='right')  b.fx = Math.max(0, Math.round(PW - imgW - S.padH));
  if(which==='left')   b.fx = S.padH;
  render(); save(); setStatus(T('status.imgSnapped'),'var(--ok)');
}
/* 相當於 Word 的「解除文繞圖」。從這裡以下不會進到圖片旁邊 */
document.getElementById('imgClearFloat').onclick=()=>{
  if(!sel.size){ setStatus(T('status.clrPick'),'#ff9b83'); return; }
  let n=0;
  sel.forEach(id=>{const f=findBlock(id); if(f && f.b.type!=='image'){ f.b.clr = !f.b.clr; n++; }});
  if(!n){ setStatus(T('status.clrPickNormal'),'#ff9b83'); return; }
  render(); save(); setStatus(T('status.clrToggled'),'var(--ok)');
};
document.getElementById('jsonFile').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  e.target.value='';        // 讓同一個檔案再選一次也能讀取
  r.onload=async()=>{
    let d=null;
    try{ d=JSON.parse(r.result); if(!d || (!d.pages&&!d.blocks)) d=null; }catch(_){ d=null; }
    if(!d){ alert(T('alert.badFile')); return; }
    /* 讀入的原稿不覆蓋目前的作品，而是新增為一個新作品。
       只有在沒有作品存放處、只能擁有一個作品時，才詢問是否可以替換 */
    if(!prjKV && !confirm(T('confirm.replaceOnly'))) return;
    await prjNew(d, prjKV ? T('status.loadedAsNew') : T('status.loaded'));
  };
  r.readAsText(f);
};
document.getElementById('btnReset').onclick=async()=>{
  if(!confirm(T('confirm.reset'))) return;
  /* 把清除前的狀態留在過去的版本（可以從作品清單的「過去的版本」救回） */
  if(prjKV && prjId){ await saveNow(); try{ await genSnap(prjId); }catch(e){} }
  S=blank(); sel.clear(); pgSel.clear(); editingId=null; syncSettings(); render(); save();
};
function syncSettings(){
  applyFonts(); buildFontUI();
  document.getElementById('docTitle').value=S.title||'';
  document.getElementById('padV').value=S.padV;
  document.getElementById('padH').value=S.padH;
  document.getElementById('baseSize').value=S.base;
  const f=S.foot||{num:true,text:'',from:1};
  document.getElementById('footNum').checked = f.num!==false;
  if(document.getElementById('footText')!==document.activeElement)
    document.getElementById('footText').value = f.text||'';
  document.getElementById('footFrom').value = f.from||1;
}
function dl(blob,name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}

/* ================= 匯出閱覽 HTML ================= */
/* 組出只供閱讀的頁面。匯出與頁面一覽共用 */
/* 彈出視窗的內容不會出現在紙面上，所以列印與匯出時集中放在書末。
   不增加內文的頁數，最後以「附錄」接續。 */
function popupBlocks(){
  return allBlocks().filter(b=>b.type==='popup' && (popIsBlocks(b.pop)
    ? (b.pop.blocks||[]).length : String((b.pop||{}).body||'').trim()));
}
function allBlocks(){ const o=[]; blockLists().forEach(l=>o.push.apply(o,l)); return o; }
function popupViewHTML(pop){ return popInnerViewHTML(pop); }
function appendixHTML(){
  const list = popupBlocks();
  if(!list.length) return '';
  const st = S.pages[S.pages.length-1] || {bg:{preset:'none',img:null,fit:'cover',opa:35}, cols:1};
  const cls = st.bg.preset==='none'?'':st.bg.preset;
  const body = '<div class="blkpad p-h1 pagetop span"><div class="blk t-h1">'+T('export.appendix')+'</div></div>'
    + list.map(b=>{
        const p=b.pop||{};
        return '<div class="blkpad p-h2"><div class="blk t-h2">'+esc(p.label||T('pop.defaultLabel'))+'</div></div>'
             + (popIsBlocks(p)
                 ? popBlocksHTML(p.blocks)
                 : '<div class="blkpad p-desc"><div class="blk t-desc" style="white-space:normal">'
                   + popupBodyHTML(p.body)+'</div></div>');
      }).join('');
  return '<div class="page '+cls+'"><div class="page-bg '+cls+'"></div>'
    + '<div class="page-body" style="padding:'+S.padV+'mm '+S.padH+'mm;font-size:'+S.base+'pt;height:auto;min-height:100%">'
    + body + '</div></div>';
}
function buildAppendix(){
  const box=document.getElementById('printAppendix'); if(!box) return;
  const h=appendixHTML();
  box.innerHTML = h ? '<div class="pagebox">'+h+'</div>' : '';
}
/* 組出一個成品段落。與編輯畫面的 blockEl 成對，
   為了讓紙面的匯出・彈出視窗・附錄都輸出相同的東西，集中在這一處。
   cols 是該頁的欄數，pull 是與前一段落間距的收緊量，top 是頁首的標記。 */
/* 是否為可以在視窗上直接修改的段落。含有裝飾或巢狀的，
   直接改會把組裝弄壞，所以交給左側的文章欄 */
const PLAIN_EDIT_TYPES = ['desc','note','h1','h2','h3','title','subtitle','scene','vr','dialog'];
function plainEditable(b){
  if(!PLAIN_EDIT_TYPES.includes(b.type)) return false;
  if(b.type==='dialog' && String(b.sp||'').trim()) return false;
  if(blockComments(b).length || blockMarks(b).length) return false;
  if(hasRuby(b.text)) return false;
  if((b.type==='desc'||b.type==='note') && hasRich(b.text)) return false;
  return true;
}
function blockStaticHTML(b, cols, pull, top, anchor, edit){
  if(edit && plainEditable(b)){
    const ow0='<div class="blkpad p-'+b.type+((b.cols===1 && cols===2)?' span':'')+top
           + (b.clr?' clearfl':'') + (b.ind?' i'+Math.min(4,b.ind):'')+'" data-id="'+b.id+'"'
           + ((b.mt!=null||pull) ? ' style="'+(b.mt!=null?'padding-top:'+b.mt+'mm;':'')
                                  +(pull?'margin-top:-'+pull+'mm;':'')+'"' : '')+'>';
    const st0=(b.mb!=null?'margin-bottom:'+b.mb+'mm;':'')+(b.col?'color:'+b.col+';':'');
    return ow0+'<div class="blk t-'+b.type+'" style="'+st0+'" data-btext="'+b.id+'"'
         + ' contenteditable="true" spellcheck="false" data-ph="'+T('blk.emptyPh')+'">'+esc(b.text)+'</div></div>';
  }
    const st2=(b.mb!=null?'margin-bottom:'+b.mb+'mm;':'')+(b.col?'color:'+b.col+';':'');
    const cl='blk t-'+b.type;
    const free = (b.type==='image' && b.pos==='free');
    const flc = free ? ' free' : (b.type==='image' && (b.fl==='l'||b.fl==='r')) ? ' fl-'+b.fl : '';
    const ost = free
        ? 'width:'+fnum(imgWmm(b))+'mm;left:'+(+b.fx||0)+'mm;top:'+(+b.fy||0)+'mm;'
        : flc
          ? 'width:'+fnum(imgWmm(b))+'mm;'+imgOffStyle(b, cols, pull)
            + (b.mt!=null?'padding-top:'+b.mt+'mm;':'')
          : (b.mt!=null?'padding-top:'+b.mt+'mm;':'')
            + (pull?'margin-top:-'+pull+'mm;':'');
    const ow='<div class="blkpad p-'+b.type+((b.cols===1 && cols===2)?' span':'')+top+flc+(b.clr?' clearfl':'')
           + (b.ind?' i'+Math.min(4,b.ind):'')+'" data-id="'+b.id+'"'
           + (ost?' style="'+ost+'"':'')+'>';
    if(b.type==='break') return '';
    if(b.type==='colbr')  return ow+'<div class="'+cl+'"></div></div>';
    if(b.type==='npc')  return ow+'<div class="'+cl+'" style="'+st2+'">'
      + '<button type="button" class="copybtn" data-for="ccf'+b.id+'">'+T('prop.ccf')+'</button>'
      + npcInnerHTML(b,false,'static')+'</div></div>';
    if(b.type==='toc')  return ow+'<div class="'+cl+'" style="'+st2+'">'+tocInnerHTML(b)+'</div></div>';
    if(b.type==='image')return ow+'<div class="'+cl+'" style="'+st2+'">'+imageInnerHTML(b)+'</div></div>';
    if(b.type==='table')return ow+'<div class="'+cl+'" style="'+st2+'">'
      + '<button type="button" class="copybtn" data-for="out'+b.id+'">'+T('prop.copyOut')+'</button>'
      + tableInnerHTML(b, edit)+'</div></div>';
    if(b.type==='popup')return ow+'<div class="'+cl+'" style="'+st2+'">'+popupInnerHTML(b)+'</div></div>';
    if(b.type==='proc'){
      const lb=blockLabel(b).trim();
      return ow+'<div'+anchor+' class="'+cl+procClass(b)+'" style="'+procStyle(b)+st2+'">'
        + (lb?'<div class="t-lb">'+esc(lb)+'</div>':'') + richBlockHTML(b) + '</div></div>';
    }
    if((b.type==='desc'||b.type==='note') && hasRich(b.text))
      return ow+'<div'+anchor+' class="'+cl+' hasrich" style="'+st2+'">'+richBlockHTML(b)+'</div></div>';
    if(b.type==='flow') return ow+'<div class="'+cl+'" style="'+st2+'">'+flowHTML(b)+'</div></div>';
    if(b.type==='hr'){
      const tx=String(b.text||'').trim();
      return ow+'<div class="'+cl+'" style="'+st2+'">'
        + (tx ? '<span class="hrtx">'+rubyHTMLwithComments(b)+'</span>' : '') + '</div></div>';
    }
    const spk = (b.type==='dialog' && String(b.sp||'').trim())
      ? '<span class="sp">'+esc(b.sp)+'</span>' : '';
    return ow+'<div'+anchor+' class="'+cl+'" style="'+st2+'">'+spk+rubyHTMLwithComments(b)+'</div></div>';
}
function pageStaticHTML(i, withAnchor){
  const ids = pageMap[i]||[];
  const st = S.pages[i] || S.pages[S.pages.length-1];
  const cls = st.bg.preset==='none'?'':st.bg.preset;
  const img = st.bg.img?'<div class="page-img" style="background-image:url('+st.bg.img+');opacity:'+(st.bg.opa/100)
    +';background-size:'+(st.bg.fit==='repeat'?'auto':st.bg.fit)+';background-repeat:'+(st.bg.fit==='repeat'?'repeat':'no-repeat')+'"></div>':'';
  let topDone=false, prevType=null;
  const body = ids.map(id=>{
    const f=findBlock(id); if(!f) return '';
    const b=f.b;
    const pull = gapPull(prevType, b.type); prevType = b.type;
    let top='';
    if(!topDone && b.type!=='break' && b.type!=='colbr'){ top=' pagetop'; topDone=true; }
    const anchor = (withAnchor && ['title','h1','h2','h3'].includes(b.type)) ? ' id="b'+b.id+'"' : '';
    return blockStaticHTML(b, st.cols, pull, top, anchor);
  }).join('');
  const freeShape = freeImgs(i).map(b=>freeShapeHTML(b, st.cols)).join('');
  const freeHTML = freeImgs(i).map(b=>
      '<div class="blkpad p-image span free" style="width:'+fnum(imgWmm(b))+'mm;left:'+(+b.fx||0)+'mm;top:'+(+b.fy||0)+'mm">'
      + '<div class="blk t-image">'+imageInnerHTML(b)+'</div></div>').join('');
  return '<div class="page '+cls+'" id="p'+(i+1)+'">'
    + '<div class="page-bg '+cls+'"></div>'+img
    + '<div class="page-body'+(st.cols===2?' cols2':'')+'" style="padding:'+S.padV+'mm '+S.padH+'mm;font-size:'+S.base+'pt">'+freeShape+body+freeHTML+'</div>'
    + footHTML(i) + '</div>';
}
/* ================= 選擇輸出的範圍 ================= */
let outMode='export';
function openOut(mode){
  outMode=mode;
  const n=pageMap.length;
  document.getElementById('outTitle').textContent = mode==='print' ? T('out.printTitle') : T('out.exportTitle');
  document.getElementById('outAll').textContent = T('out.allPages', n);
  document.getElementById('outFrom').max=n; document.getElementById('outTo').max=n;
  if(!document.getElementById('outFrom').value) document.getElementById('outFrom').value=1;
  if(!document.getElementById('outTo').value || +document.getElementById('outTo').value>n)
    document.getElementById('outTo').value=n;
  document.getElementById('outTocRow').style.display = mode==='export' ? '' : 'none';
  document.getElementById('outDlg').style.display='flex';
}
function closeOut(){ document.getElementById('outDlg').style.display='none'; }
document.getElementById('outCancel').onclick=closeOut;
document.getElementById('outDlg').addEventListener('click',e=>{ if(e.target.id==='outDlg') closeOut(); });
document.getElementById('btnPrint').onclick=()=>openOut('print');
document.getElementById('btnExport').onclick=()=>openOut('export');
function outRange(){
  const n=pageMap.length;
  if(document.querySelector('input[name="outsc"]:checked').value==='all') return [0, n-1];
  let a=Math.max(1, Math.min(n, +document.getElementById('outFrom').value||1));
  let b=Math.max(1, Math.min(n, +document.getElementById('outTo').value||n));
  if(a>b){ const t=a; a=b; b=t; }
  return [a-1, b-1];
}
document.getElementById('outGo').onclick=()=>{
  const [a,bb]=outRange();
  closeOut();
  if(outMode==='print') doPrint(a,bb); else doExport(a,bb);
};
/* 列印時，先替範圍外的頁面加上標記隱藏起來再呼叫 */
function doPrint(a,b){
  const boxes=[...stage.querySelectorAll('.pagebox')];
  boxes.forEach((el,i)=>el.classList.toggle('pgskip', i<a || i>b));
  const after=()=>{ boxes.forEach(el=>el.classList.remove('pgskip')); removeEventListener('afterprint',after); };
  addEventListener('afterprint', after);
  setTimeout(()=>window.print(), 30);
  setTimeout(after, 4000);
}

/* ================= 匯出閱覽 HTML ================= */
function doExport(a,b){
  const idx=[]; for(let i=a;i<=b;i++) idx.push(i);
  const pages = idx.map(i=>'<div class="pagebox">'+pageStaticHTML(i,true)+'</div>').join('\n');
  /* 目錄一律放入。標題可能會洩漏劇情，所以讓閱讀者可以遮起來 */
  const nav = tocEntries().filter(x=>x.page>=a+1 && x.page<=b+1)
    .map(x=>'<a class="nv l'+x.lv+'" href="#b'+x.id+'">'
      + '<span class="nvt" data-t="'+esc(x.text)+'">'+esc(x.text)+'</span>'
      + '<i>'+x.page+'</i></a>').join('');
  const pops = popupBlocks();
  const popData = pops.map(pb=>'<div class="popbody" id="pop'+pb.id+'" hidden>'
      + '<h3>'+esc((pb.pop||{}).label||T('pop.defaultLabel'))+'</h3>'+popupViewHTML(pb.pop)+'</div>').join('');
  /* 把表格的輸出文字，以及 NPC 卡的 CCFOLIA 棋子，事先放好，按下時就能使用 */
  /* <script type="text/plain"> 的內容不會被當成 HTML 解讀，
     所以若做一般的跳脫，&quot; 會直接變成文字留下來。
     只讓結束標籤變得無害。 */
  const sesc = t => String(t).replace(/<\/(script)/gi, '<\\/$1');
  const dataBits = allBlocks().map(x=>{
    if(x.type==='table'){
      const t=x.tbl||newTable();
      const txt = String(t.out||'').trim() || rollTableText(t);
      return '<script type="text/plain" class="outdata" id="out'+x.id+'">'+sesc(txt)+'<\/script>';
    }
    if(x.type==='npc'){
      return '<script type="text/plain" class="outdata" id="ccf'+x.id+'">'
        + sesc(JSON.stringify(npcToCcfolia(x), null, 1))+'<\/script>';
    }
    return '';
  }).join('');
  const appx = appendixHTML() ? '<div class="pagebox appx">'+appendixHTML()+'</div>' : '';
  const cmtData = allBlocks().flatMap(x=>blockComments(x).map((c,i)=>
    '<script type="text/plain" class="outdata" id="cm'+x.id+'-'+i+'">'+sesc(c.t)+'<\/script>')).join('');
  const extraCss = `
#popOv{position:fixed;inset:0;background:rgba(0,0,0,.66);display:none;align-items:center;justify-content:center;padding:20px;z-index:50}
#popOv.on{display:flex}
/* 彈出視窗。關閉按鈕放在內容框的外面（右上）。
   放在裡面的話會和內文重疊，閱讀長文時會礙事 */
#popWrap{position:relative;display:flex;flex-direction:column;align-items:flex-end;gap:6px;max-width:min(820px,94vw)}
#popBox{background:#fbf7ef;color:#23201c;border-radius:8px;width:min(820px,94vw);max-height:80vh;overflow:auto;padding:22px 26px;
  box-shadow:0 8px 40px rgba(0,0,0,.5);line-height:1.9;font-size:14px}
#popBox h3{margin:0 0 12px;color:#a8331f;font-size:16px;letter-spacing:.08em}
#popBox p{margin:0 0 10px;white-space:pre-wrap}
#popX{flex:0 0 auto;border:0;background:#23201c;color:#f7f3ea;border-radius:4px;
  padding:5px 14px;cursor:pointer;font:inherit;font-size:12px;opacity:.9}
#popX:hover{opacity:1;background:#a8331f}
.popbody{display:none}
.appx{display:none}
#cmtRail{position:fixed;right:14px;top:80px;width:250px;display:none;z-index:40}
#cmtRail.on{display:block}
.cmt-card{background:#fbf7ef;color:#23201c;border:1px solid #a8331f;border-radius:7px;padding:11px 13px;
  box-shadow:0 6px 26px rgba(0,0,0,.45);font-size:13px;line-height:1.8}
.cmt-h{color:#a8331f;font-size:11px;letter-spacing:.1em;margin:0 0 5px;font-weight:700}
.cmt-b{white-space:pre-wrap}
.cmt-x{margin-top:8px;padding:3px 10px;font:inherit;font-size:11px;cursor:pointer;border:0;border-radius:4px;
  background:#23201c;color:#f7f3ea}
@media (max-width:1200px){ #cmtRail{right:8px;width:200px} }
/* 目錄的顯示／隱藏。做成三條線的按鈕，展開時變成×的形狀 */
#tocBtn{position:fixed;left:10px;top:10px;z-index:12;width:38px;height:38px;padding:0;border:0;
  border-radius:8px;background:#23201c;cursor:pointer;opacity:.85;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
#tocBtn:hover{opacity:1;background:#a8331f}
#tocBtn i{display:block;width:18px;height:2px;background:#f7f3ea;border-radius:1px;
  transition:transform .18s ease,opacity .18s ease}
body:not(.notoc) #tocBtn i:nth-child(1){transform:translateY(6px) rotate(45deg)}
body:not(.notoc) #tocBtn i:nth-child(2){opacity:0}
body:not(.notoc) #tocBtn i:nth-child(3){transform:translateY(-6px) rotate(-45deg)}
body.notoc #nav{display:none}
body.notoc #doc{margin-left:0}
body.notoc #tocBtn{left:10px}
.copybtn{position:absolute;right:0;top:-1.6em;border:0;border-radius:3px;background:#23201c;color:#f7f3ea;
  padding:1px 9px;font:inherit;font-size:11px;cursor:pointer;opacity:.55;letter-spacing:.04em}
.copybtn:hover{opacity:1;background:#a8331f}
.blkpad.p-table,.blkpad.p-npc{position:relative}
@media print{ #popOv,#tocBtn,.copybtn,#cmtRail{display:none !important} .appx{display:block} #nav{display:none}
  .cmt{border-bottom:0} .cmt-n{display:none} }`;
  const js = `
<script>
(function(){
  var ov=document.getElementById('popOv'), inn=document.getElementById('popIn');
  function copyText(s){
    if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s);
    var ta=document.createElement('textarea'); ta.value=s; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(e){} ta.remove();
    return Promise.resolve();
  }
  document.addEventListener('click',function(e){
    var t=e.target;
    var pb=t.closest&&t.closest('[data-popopen]');
    if(pb && ov){ var src=document.getElementById('pop'+pb.getAttribute('data-popopen'));
      inn.innerHTML = src ? src.innerHTML : ${JSON.stringify(T('export.noContent'))}; ov.classList.add('on'); return; }
    if(t.id==='popOv'||t.id==='popX'){ ov.classList.remove('on'); return; }
    if(t.id==='tocMask'){ setTocMask(!document.body.classList.contains('tocmask')); return; }
    var tbtn = t.closest && t.closest('#tocBtn');
    if(tbtn){
      document.body.classList.toggle('notoc');
      var off = document.body.classList.contains('notoc');
      try{ localStorage.setItem('trpg-notoc', off?'1':'0'); }catch(_){}
      var lb = off ? ${JSON.stringify(T('export.showToc'))} : ${JSON.stringify(T('export.hideToc'))};
      tbtn.title = lb; tbtn.setAttribute('aria-label', lb);
      return;
    }
    var cm=t.closest&&t.closest('[data-cmt]');
    if(cm){ var p=cm.getAttribute('data-cmt').split(':');
      var src=document.getElementById('cm'+p[0]+'-'+p[1]);
      var rail=document.getElementById('cmtRail');
      if(src&&rail){ rail.innerHTML='<div class="cmt-card"><div class="cmt-h">'+${JSON.stringify(T('cmt.note'))}+' '+(+p[1]+1)+'</div>'
        + '<div class="cmt-b"></div><button class="cmt-x" type="button">'+${JSON.stringify(T('common.close'))}+'</button></div>';
        rail.querySelector('.cmt-b').textContent = src.textContent;
        rail.classList.add('on'); }
      return; }
    if(t.className==='cmt-x'){ document.getElementById('cmtRail').classList.remove('on'); return; }
    var cb=t.closest&&t.closest('.copybtn');
    if(cb){ var d=document.getElementById(cb.getAttribute('data-for'));
      if(d){ copyText(d.textContent); var o=cb.textContent; cb.textContent=${JSON.stringify(T('export.copied'))};
        setTimeout(function(){cb.textContent=o;},1400); }
      return; }
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&ov) ov.classList.remove('on'); });
  try{ if(localStorage.getItem('trpg-notoc')==='1'){ document.body.classList.add('notoc');
    var tb=document.getElementById('tocBtn');
    if(tb){ tb.title=${JSON.stringify(T('export.showToc'))}; tb.setAttribute('aria-label',${JSON.stringify(T('export.showToc'))}); } } }catch(_){}
  /* 目錄的遮字。預設是遮住的狀態（防雷）。閱讀者可以自行切換 */
  function setTocMask(on){
    document.body.classList.toggle('tocmask', !!on);
    var b=document.getElementById('tocMask');
    if(b) b.textContent = on ? ${JSON.stringify(T('export.showHeads'))} : ${JSON.stringify(T('export.hideHeads'))};
    var ns=document.querySelectorAll('#nav .nvt');
    for(var i=0;i<ns.length;i++){
      var src=ns[i].getAttribute('data-t')||'';
      ns[i].textContent = on ? new Array(Math.max(2,Math.min(14,src.length))+1).join('■') : src;
    }
    try{ localStorage.setItem('trpg-tocmask', on?'1':'0'); }catch(_){}
  }
  window.setTocMask = setTocMask;
  try{ setTocMask(localStorage.getItem('trpg-tocmask')!=='0'); }catch(_){ setTocMask(true); }
})();
<\/script>`;
  const html = '<!DOCTYPE html><html lang="'+esc((I18N.locales[I18N.locale]||{}).lang||I18N.locale)+'"><head><meta charset="utf-8">'
+ '<meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(S.title||T('export.untitled'))+'</title>'
+ '<style>'+DOC_CSS+'\n'+SPACE_CSS+'\n'+fontCSS()+`
body{margin:0;background:#1a1a1c;font-family:"Hiragino Kaku Gothic ProN","Yu Gothic UI","Microsoft JhengHei","PingFang TC","Noto Sans TC",system-ui,sans-serif}
#nav{position:fixed;left:0;top:0;bottom:0;width:250px;background:#14161b;color:#dde2ec;overflow:auto;padding:48px 12px 18px;z-index:9}
#nav h1{font-size:14px;letter-spacing:.14em;color:#d3a534;margin:0 0 12px}
.nv{display:flex;align-items:baseline;gap:6px;color:#c8cfdd;text-decoration:none;padding:5px 7px;border-radius:4px;font-size:13px;line-height:1.4}
.nv:hover{background:#212734;color:#fff}
.nv i{margin-left:auto;font-style:normal;color:#d3a534;font-size:11px}
.nv.l0{font-weight:700;color:#d3a534}.nv.l1{font-weight:700}.nv.l2{padding-left:20px}.nv.l3{padding-left:34px;font-size:12px;color:#8d97ac}
.nv .nvt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 防雷。遮住期間會把內容的文字本身換成 ■，
   所以就算複製貼上，標題也不會外洩 */
body.tocmask .nv .nvt{color:#5b6478;letter-spacing:.05em}
#tocMask{display:block;width:100%;margin:0 0 10px;border:1px solid #2f3747;border-radius:5px;
  background:#1a1f29;color:#c8cfdd;padding:5px 8px;font:inherit;font-size:11px;cursor:pointer;letter-spacing:.06em}
#tocMask:hover{border-color:#d3a534;color:#fff}
#doc{margin-left:250px;padding:26px 0 60px;display:flex;flex-direction:column;align-items:center}
.pagebox{margin:0 0 20px}
.page{box-shadow:0 3px 20px rgba(0,0,0,.55);scroll-margin-top:20px}
.blk{scroll-margin-top:30px}
@media (max-width:1000px){#nav{position:static;width:auto;height:auto;bottom:auto}#doc{margin-left:0}}
@media print{#nav{display:none}#doc{margin:0;padding:0;display:block}.pagebox{margin:0}.page{box-shadow:none}}
`+extraCss+`
</style></head><body class="tocmask">
`+'<button id="tocBtn" type="button" title="'+T('export.hideToc')+'" aria-label="'+T('export.hideToc')+'">'
+ '<i></i><i></i><i></i></button>'
+ '<nav id="nav"><h1>'+esc(S.title||T('export.toc'))+'</h1>'
+ '<button id="tocMask" type="button">'+T('export.showHeads')+'</button>'
+ nav+'</nav>'
+ '<main id="doc">'+pages+appx+'</main>'
+ '<div id="popOv"><div id="popWrap"><button id="popX" type="button">'+T('common.close')+'</button>'
  + '<div id="popBox"><div id="popIn"></div></div></div></div>'
+ '<div id="cmtRail"></div>'
+ popData + dataBits + cmtData + js + '</body></html>';
  dl(new Blob([html],{type:'text/html'}), (S.title||'scenario').replace(/[\\/:*?"<>|]/g,'_')+'.html');
  setStatus(T('status.exported', a+1, b+1),'var(--ok)');
}

/* ================= NPC 卡的輸入候選 ================= */
function fillList(id, values){
  const el = document.getElementById(id); if(!el) return;
  el.innerHTML = values.map(v=>'<option value="'+esc(v)+'"></option>').join('');
}
function rangeList(a,b,step){ const o=[]; for(let v=a; v<=b; v+=(step||1)) o.push(String(v)); return o; }
function initNpcLists(){
  fillList('dl-lb', LABEL_PICKS.map(k=>T(k)));
  fillList('dl-emo-ab', rangeList(1,6));
  fillList('dl-emo-lv', ['1','2','3']);
  fillList('dl-emo-kyomei', rangeList(1,9));
  fillList('dl-dx-ab',  rangeList(1,12));
  fillList('dl-dx-sk',  rangeList(0,20));
  fillList('dl-dx-enc', rangeList(0,100,5));
  fillList('dl-dx-hp',  rangeList(10,80,5));
  fillList('dl-coc6a',  rangeList(3,18));
  fillList('dl-coc6b',  rangeList(8,18));
  fillList('dl-coc6e',  rangeList(6,21));
  fillList('dl-coc7a',  rangeList(15,90,5));
  fillList('dl-coc7b',  rangeList(40,90,5));
  fillList('dl-coc-sk', rangeList(0,100,5));
  fillList('dl-db',     ['-2','-1','0','+1D4','+1D6','+2D6','+3D6']);
  fillList('dl-build',  ['-2','-1','0','1','2','3','4']);
  fillList('dl-mov',    rangeList(5,12));
  fillList('dl-dmg',    ['1D3','1D4','1D6','1D8','1D10','2D6','1D3+DB','1D4+DB','1D6+DB']);
}
document.getElementById('ccfClose').onclick=()=>{document.getElementById('ccfDlg').style.display='none';};
document.getElementById('ccfDlg').addEventListener('click', e=>{ if(e.target.id==='ccfDlg') e.currentTarget.style.display='none'; });


/* ================= 說明 =================
   畫面上的說明都集中在這裡。角色卡或紙面上不放註記。 */
const HELP = [
 ['start','help.start.title', 'help.start.body'],

 ['keys','help.keys.title', 'help.keys.body'],

 ['layout','help.layout.title', 'help.layout.body'],

 ['blocks','help.blocks.title', 'help.blocks.body'],

 ['ruby','help.ruby.title', 'help.ruby.body'],

 ['image','help.image.title', 'help.image.body'],

 ['font','help.font.title', 'help.font.body'],

 ['npc','help.npc.title', 'help.npc.body'],

 ['ccfolia','help.ccfolia.title', 'help.ccfolia.body'],

 ['export','help.export.title', 'help.export.body']
];
function buildHelp(){
  const nav=document.getElementById('helpNav'), body=document.getElementById('helpBody');
  nav.innerHTML = HELP.map((h,i)=>'<button data-help="'+h[0]+'"'+(i===0?' class="on"':'')+'>'+esc(T(h[1]))+'</button>').join('');
  body.innerHTML = T(HELP[0][2]);
  nav.onclick=e=>{
    const b=e.target.closest('[data-help]'); if(!b) return;
    nav.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
    const h=HELP.find(x=>x[0]===b.dataset.help);
    body.innerHTML=h?T(h[2]):''; body.scrollTop=0;
  };
}
document.getElementById('btnHelp').onclick=()=>{
  if(!document.getElementById('helpNav').children.length) buildHelp();
  document.getElementById('helpDlg').style.display='flex';
};
document.getElementById('helpClose').onclick=()=>{document.getElementById('helpDlg').style.display='none';};
document.getElementById('helpDlg').addEventListener('click', e=>{ if(e.target.id==='helpDlg') e.currentTarget.style.display='none'; });
addEventListener('keydown', e=>{ if(e.key==='Escape' && document.getElementById('helpDlg').style.display==='flex') document.getElementById('helpDlg').style.display='none'; });


/* ================= 窗格寬度的調整 =================
   抓住分隔線拖動，就能改變工具面板・內文・頁面的寬度。
   寬度記在這個瀏覽器裡（不是原稿的內容，所以不放進 JSON）。 */
const PANE_KEY='trpg-panes-v1';
function loadPanes(){
  try{ const v=localStorage.getItem(PANE_KEY); if(v) return JSON.parse(v); }catch(e){}
  return null;
}
function savePanes(){
  try{ localStorage.setItem(PANE_KEY, JSON.stringify({
    side: document.getElementById('side').offsetWidth,
    src : document.getElementById('srcPane').offsetWidth,
    pages: document.getElementById('pagesPane').offsetWidth,
    pagesOpen: pagesVisible(),
    prop: document.getElementById('propPane').offsetWidth || 268
  })); }catch(e){}
}
function applyPanes(v){
  if(v && v.prop) document.getElementById('propPane').style.flex='0 0 '+v.prop+'px';
  setPropSide();
  if(!v) return;
  const side=document.getElementById('side'), src=document.getElementById('srcPane');
  const pgs=document.getElementById('pagesPane');
  if(v.side>0) side.style.flex='0 0 '+clampPane(v.side,180,520)+'px';
  if(v.src>0)  src.style.flex ='0 0 '+clampPane(v.src,220,Math.max(220, innerWidth-460))+'px';
  if(v.pages>0) pgs.style.flex='0 0 '+clampPane(v.pages,130,420)+'px';
  if(v.pagesOpen) togglePages(true);
}
function clampPane(v,min,max){ return Math.max(min, Math.min(max, v)); }

(function initSplitters(){
  let drag=null;
  function down(e, which){
    if(innerWidth<=820) return;                 // 上下排列時不移動
    const side=document.getElementById('side'), src=document.getElementById('srcPane');
    const pgs=document.getElementById('pagesPane');
    drag = {which:which, x:e.clientX, side:side.offsetWidth, src:src.offsetWidth, pages:pgs.offsetWidth,
            prop:document.getElementById('propPane').offsetWidth};
    document.body.classList.add('resizing');
    e.target.classList.add('drag');
    e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e){
    if(!drag) return;
    const d = e.clientX - drag.x;
    const side=document.getElementById('side'), src=document.getElementById('srcPane');
    const pgs=document.getElementById('pagesPane');
    if(drag.which==='side'){
      side.style.flex='0 0 '+clampPane(drag.side+d, 180, 520)+'px';
    }else if(drag.which==='pages'){
      const max = Math.max(130, innerWidth - side.offsetWidth - src.offsetWidth - 240);
      pgs.style.flex='0 0 '+clampPane(drag.pages+d, 130, max)+'px';
      buildPages();
    }else if(drag.which==='prop'){
      /* 右側的設定欄，把手越往左拉就越寬 */
      const max = Math.max(190, innerWidth - side.offsetWidth - src.offsetWidth - 240);
      document.getElementById('propPane').style.flex='0 0 '+clampPane(drag.prop-d, 190, max)+'px';
    }else{
      const max = Math.max(240, innerWidth - side.offsetWidth - 240);
      src.style.flex='0 0 '+clampPane(drag.src+d, 240, max)+'px';
    }
    if(zoomMode==='fit') applyZoom();
  }
  function up(e){
    if(!drag) return;
    drag=null;
    document.body.classList.remove('resizing');
    document.querySelectorAll('.splitter').forEach(x=>x.classList.remove('drag'));
    savePanes();
    if(zoomMode==='fit') applyZoom();
  }
  document.getElementById('splitSide').addEventListener('pointerdown', e=>down(e,'side'));
  document.getElementById('splitSrc') .addEventListener('pointerdown', e=>down(e,'src'));
  document.getElementById('splitPages').addEventListener('pointerdown', e=>down(e,'pages'));
  document.getElementById('splitProp').addEventListener('pointerdown', e=>down(e,'prop'));
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  /* 按兩下分隔線，就回到預設的寬度 */
  document.getElementById('splitSide').addEventListener('dblclick', ()=>{
    document.getElementById('side').style.flex='0 0 290px'; savePanes(); if(zoomMode==='fit') applyZoom();
  });
  document.getElementById('splitSrc').addEventListener('dblclick', ()=>{
    document.getElementById('srcPane').style.flex=''; savePanes(); if(zoomMode==='fit') applyZoom();
  });
  document.getElementById('splitPages').addEventListener('dblclick', ()=>{
    document.getElementById('pagesPane').style.flex='0 0 200px'; buildPages(); savePanes(); if(zoomMode==='fit') applyZoom();
  });
  document.getElementById('splitProp').addEventListener('dblclick', ()=>{
    document.getElementById('propPane').style.flex='0 0 268px'; savePanes(); if(zoomMode==='fit') applyZoom();
  });
})();
/* 視窗大小改變時，重新收好以免超出 */
addEventListener('resize', ()=>{
  const side=document.getElementById('side'), src=document.getElementById('srcPane');
  if(innerWidth>820 && src.style.flex){
    const max = Math.max(240, innerWidth - side.offsetWidth - 240);
    const cur = src.offsetWidth;
    if(cur > max) src.style.flex='0 0 '+max+'px';
  }
});

/* 輸出內文（不含書式名稱或記號，只有文章）。
   跨段落的拖曳選取因瀏覽器的規格而無法做到，
   所以讓在區塊編輯模式中選取的段落能直接複製。 */
function blockPlainText(b){
  {
    if(b.type==='break') return '';
    if(b.type==='toc')   return '';
    if(b.type==='image') return String(b.cap||'').trim();
    if(b.type==='npc'){
      const np=b.npc||{};
      return [String(np.name||'').trim(), String(np.role||'').trim(), String(np.memo||'').trim()]
        .filter(Boolean).join('\n');
    }
    return String(b.text||'');
  }
}
/* 有選取段落就是那個範圍，沒有選取就是全文 */
function copyTargetText(){
  const list = sel.size ? S.blocks.filter(b=>sel.has(b.id)) : S.blocks;
  return list.map(blockPlainText).filter(x=>String(x).trim()!=='').join('\n\n');
}
async function copyPlain(text){
  try{ await navigator.clipboard.writeText(text); return true; }
  catch(_){
    try{
      const ta=document.createElement('textarea'); ta.value=text;
      ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      const ok=document.execCommand('copy'); ta.remove(); return ok;
    }catch(__){ return false; }
  }
}
/* 在區塊編輯模式中選取段落的狀態下按 Ctrl+C，會複製該段落的文章 */
addEventListener('copy', e=>{
  if(!sel.size) return;
  const s=getSelection();
  if(s && String(s).trim()) return;          // 有選取文字時以那邊為優先
  e.preventDefault();
  e.clipboardData.setData('text/plain', copyTargetText());
  setStatus(T('status.textCopied', sel.size),'var(--ok)');
});
document.getElementById('btnCopyAll').onclick=async()=>{
  const n = sel.size;
  const ok = await copyPlain(copyTargetText());
  setStatus(ok ? (n ? T('status.textCopied', n) : T('status.allCopied')) : T('status.copyFailed'),
            ok?'var(--ok)':'#ff9b83');
};



/* ================= 頁面一覽 =================
   把從封面到版權頁的所有頁面縮小排列。按下就移到那個位置。 */
const PAGE_W_PX = 210*(96/25.4);
function pageLabel(i){
  const ids = pageMap[i]||[];
  const types = ids.map(id=>{const f=findBlock(id); return f?f.b.type:'';});
  if(types.indexOf('cover')>=0)    return T('type.cover');
  if(types.indexOf('colophon')>=0) return T('type.colophon');
  if(types.indexOf('toc')>=0)      return T('type.toc');
  return '';
}
function pageHeadline(i){
  const ids = pageMap[i]||[];
  for(const id of ids){
    const f=findBlock(id); if(!f) continue;
    const b=f.b;
    if(['cover','title','h1','h2','h3','scene'].includes(b.type) && String(b.text||'').trim())
      return rubyPlain(String(b.text).trim().split('\n')[0]);
  }
  for(const id of ids){
    const f=findBlock(id); if(!f) continue;
    const t=String(f.b.text||'').trim();
    if(t) return rubyPlain(t.split('\n')[0]);
  }
  /* 沒有文字的頁面，以放在上面的東西的名稱來表示 */
  for(const id of ids){
    const f=findBlock(id); if(!f) continue;
    if(f.b.type==='toc')   return T('type.toc');
    if(f.b.type==='npc')   return T('type.npc')+(f.b.npc&&f.b.npc.name?'：'+f.b.npc.name:'');
    if(f.b.type==='image') return String(f.b.cap||'').trim() || T('type.image');
  }
  return ids.length ? T('pages.noText') : T('pages.empty');
}
function buildPages(){
  const box=document.getElementById('pagesBody');
  if(!pagesVisible() || pagesView!=='page') return;
  const w = +document.getElementById('pagesZoom').value;
  const scale = w / PAGE_W_PX;
  box.innerHTML = pageMap.map((ids,i)=>{
    const st = S.pages[i] || S.pages[S.pages.length-1];
    const tag = pageLabel(i);
    return '<div class="pthumb" data-page="'+i+'" style="width:'+w+'px">'
      + '<div class="pthumb-box" style="width:'+w+'px;height:'+Math.round(297*(96/25.4)*scale)+'px">'
        + '<div class="pthumb-scale" style="transform:scale('+scale+')">'+pageStaticHTML(i,false)+'</div>'
      + '</div>'
      + '<div class="pthumb-cap"><span class="no">P.'+(i+1)+'</span>'
        + (tag?'<span class="tag">'+esc(tag)+'</span>':'')
        + '<span class="cols">'+(st.cols===2?T('page.c2'):T('page.c1'))+'</span></div>'
      + '<div class="pthumb-ttl">'+esc(pageHeadline(i))+'</div>'
      + '</div>';
  }).join('');
  document.getElementById('pagesNote').textContent = T('pages.nPages', pageMap.length);
}
function pagesVisible(){ return !document.getElementById('pagesPane').classList.contains('hide'); }
function togglePages(on){
  const pane=document.getElementById('pagesPane');
  const show = (on===undefined) ? pane.classList.contains('hide') : on;
  pane.classList.toggle('hide', !show);
  document.getElementById('btnPages').classList.toggle('on', show);
  if(show) setPagesView(pagesView);
  savePanes();
  if(zoomMode==='fit') applyZoom();
}
function setPagesView(v){
  pagesView=v;
  document.getElementById('pgvPage').classList.toggle('on', v==='page');
  document.getElementById('pgvToc').classList.toggle('on', v==='toc');
  document.getElementById('pagesBody').style.display = v==='page' ? '' : 'none';
  document.getElementById('tocPane').style.display  = v==='toc'  ? '' : 'none';
  document.getElementById('pagesZoom').style.display = v==='page' ? '' : 'none';
  if(v==='page') buildPages(); else buildTOC();
  document.getElementById('pagesNote').textContent =
    v==='page' ? T('pages.nPages', pageMap.length) : T('pages.nItems', tocEntries().length);
}
document.getElementById('pgvPage').onclick=()=>setPagesView('page');
document.getElementById('pgvToc').onclick=()=>setPagesView('toc');
document.getElementById('btnPages').onclick=()=>togglePages();
document.getElementById('pagesHide').onclick=()=>togglePages(false);
document.getElementById('pagesZoom').addEventListener('input', buildPages);
document.getElementById('pagesBody').addEventListener('click', e=>{
  const th=e.target.closest('[data-page]'); if(!th) return;
  const i=+th.dataset.page;
  document.querySelectorAll('.pthumb').forEach(x=>x.classList.toggle('cur', x===th));
  const pageEl = stage.querySelector('.pagebox[data-pi="'+i+'"]');
  if(pageEl) pageEl.scrollIntoView({behavior:'smooth', block:'start'});
  const first=(pageMap[i]||[])[0];
  if(first){
    sel.clear(); sel.add(first); lastPick=first; paintSel();
    const row=srcList.querySelector('.src[data-id="'+first+'"]');
    if(row) row.scrollIntoView({behavior:'smooth', block:'center'});
  }
});

/* ---- 建立封面頁與版權頁 ---- */
document.getElementById('mkCover').onclick=()=>{
  const has=S.blocks.find(b=>b.type==='cover');
  if(has){
    sel.clear(); sel.add(has.id); paintSel();
    const row=srcList.querySelector('.src[data-id="'+has.id+'"]');
    if(row) row.scrollIntoView({behavior:'smooth',block:'center'});
    setStatus(T('status.coverExists'),'#ff9b83'); return;
  }
  const c=newBlock('cover', S.title||T('prj.untitled')); c.cols=1;
  const br=newBlock('break',''); br.cols=1;
  S.blocks.unshift(c, br);
  sel.clear(); sel.add(c.id);
  render(); save(); setStatus(T('status.coverMade'),'var(--ok)');
};
document.getElementById('mkColophon').onclick=()=>{
  const has=S.blocks.find(b=>b.type==='colophon');
  if(has){
    sel.clear(); sel.add(has.id); paintSel();
    const row=srcList.querySelector('.src[data-id="'+has.id+'"]');
    if(row) row.scrollIntoView({behavior:'smooth',block:'center'});
    setStatus(T('status.colophonExists'),'#ff9b83'); return;
  }
  const NL=String.fromCharCode(10);
  const br=newBlock('break',''); br.cols=1;
  const k=newBlock('colophon', (S.title||T('prj.untitled'))+NL+T('colophon.author')+NL+T('colophon.publisher')); k.cols=1;
  S.blocks.push(br, k);
  sel.clear(); sel.add(k.id);
  render(); save(); setStatus(T('status.colophonMade'),'var(--ok)');
};

/* ================= 切換作品 ================= */
/* 把原稿重新顯示到畫面上。復原的歷程在每個作品都從頭開始 */
function prjShow(d){
  S = normalize(d);
  lastCell = null;
  mergeUserTpls();          // 加入這個瀏覽器記住的樣板
  pgSel.clear(); sel.clear(); editingId=null;
  syncSettings(); render();
  past.length=0; future.length=0; committed=null;
  histCommit();                       // 把這裡當作歷程的起點
  unsaved=false;
}
/* 把目前的作品寫完（也寫到檔案），再釋放鎖 */
async function prjLeave(){
  await saveNow();
  if(fileTimer){ clearTimeout(fileTimer); fileTimer=null; await fileWrite(); }
  await fileQ;
  if(lockRel){ lockRel(); lockRel=null; }
}
const PRJ_BUSY='prj.busy';
async function prjOpen(id, wait){
  if(id===prjId) return true;
  const rel=await lockTake(id, wait);
  if(!rel){ setStatus(T(PRJ_BUSY),'#ff9b83'); return false; }
  try{ await jnlApply(id); }catch(e){}   // 關閉瞬間的備份若還留著，就在開啟前先放回存放處
  let d=null;
  try{ const raw=await prjRead(id); d = raw ? JSON.parse(raw) : null; }catch(e){ d=null; }
  if(!d){ rel(); setStatus(T('status.prjUnreadable'),'#ff9b83'); return false; }
  await prjLeave();                   // 先把打到一半的部分寫進目前的作品，再移過去
  prjId=id; lockRel=rel; prjRemember(id);
  saveFail(false);
  prjShow(d);
  prjPost('open');
  await fileLoad(id);
  genSnap(id).catch(()=>{});          // 把開啟時的狀態保留在過去的版本
  setStatus(T('status.prjOpened', S.title||T('prj.untitled')),'var(--ok)');
  return true;
}
/* 建立新作品並開啟。沒有 d 的話就是範例原稿 */
async function prjNew(d, msg){
  const id=uid();
  const rel=(await lockTake(id)) || (()=>{});
  await prjLeave();
  prjId=id; lockRel=rel; prjRemember(id);
  saveFail(false);
  prjShow(d||null);
  savePending=true; await prjFlush();   // 建立後馬上寫進存放處（讓它出現在清單上）
  await fileLoad(id);
  setStatus(msg||T('status.prjCreated'),'var(--ok)');
}
function prjSorted(a){ return a.slice().sort((x,y)=>(y.upd||0)-(x.upd||0)); }
let prjPick=null;           // 清單上選取的作品（在過去的版本中則是版本的時刻）
let prjView='list';         // 'list' / 'gens'（過去的版本） / 'trash'（垃圾桶）
let prjGenOf=null;          // 正在查看過去版本的作品
const prjDlg=document.getElementById('prjDlg');
function prjDlgOn(){ return prjDlg.style.display==='flex'; }
function prjWhen(t){
  if(!t) return '';
  const d=new Date(t), p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'/'+p(d.getMonth()+1)+'/'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}
function prjWhenShort(t){
  const d=new Date(t), p=n=>String(n).padStart(2,'0');
  return (d.getMonth()+1)+'/'+d.getDate()+' '+p(d.getHours())+':'+p(d.getMinutes());
}
function prjSize(n){
  n=+n||0;
  return n>=1024*1024 ? T('prj.sizeMB', Math.round(n/1024/1024*10)/10) : T('prj.sizeKB', Math.max(1,Math.round(n/1024)));
}
function prjRowHTML(key, on, cells){
  return '<div class="prjRow'+(on?' on':'')+'" role="option" tabindex="-1" data-id="'+esc(key)+'" aria-selected="'+on+'">'+cells+'</div>';
}
function prjBtns(){
  const has=!!prjPick, busy=!!(document.querySelector('#prjList .prjRow.on[data-busy]'));
  const set=(id,dis)=>{ document.getElementById(id).disabled=dis; };
  set('prjNew', !prjKV);
  set('prjDup', !prjKV || !has);
  set('prjGens', !prjKV || !has || !document.querySelector('#prjList .prjRow.on[data-gens]'));
  set('prjDel', !prjKV || !has || busy);
  set('prjTrashBtn', !prjKV);
  set('prjOpenBtn', !prjKV || !has || busy);
  set('prjGenRestore', !has);
  set('prjTrashRestore', !has);
  document.getElementById('prjClose').disabled = !!prjKV && !prjId;   // 還沒有開啟中的作品時無法關閉
  prjDlg.querySelectorAll('[data-v]').forEach(x=>{ x.style.display = x.dataset.v===prjView ? 'contents' : 'none'; });
}
async function prjDlgPaint(){
  const box=document.getElementById('prjList'), note=document.getElementById('prjNote');
  note.style.color='';
  if(!prjKV){
    prjView='list';
    note.textContent=T('prj.noStore');
    box.innerHTML='<div class="prjRow on"><span class="t">'+esc(S.title||T('prj.untitled'))+'</span></div>';
    prjBtns(); return;
  }
  await saveNow();                    // 讓目前作品的標題・更新時間反映到清單上
  if(prjView==='gens'){
    const m=(await prjAll()).find(x=>x.id===prjGenOf);
    const gens=((m&&m.gens)||[]).slice().reverse();
    if(!gens.some(g=>String(g.t)===String(prjPick))) prjPick = gens.length ? String(gens[0].t) : null;
    note.textContent=T('prj.gensNote', (m&&m.title)||T('prj.untitled'));
    box.innerHTML = gens.map(g=>prjRowHTML(String(g.t), String(g.t)===String(prjPick),
      '<span class="t">'+prjWhen(g.t)+'</span><span class="z">'+prjSize(g.z)+'</span>')).join('');
  } else if(prjView==='trash'){
    const list=(await prjTrash()).sort((x,y)=>y.del-x.del);
    if(!list.some(x=>x.id===prjPick)) prjPick=(list[0]||{}).id||null;
    note.textContent = list.length ? T('prj.trashNote') : T('prj.trashEmpty');
    box.innerHTML = list.map(m=>{
      const left=Math.max(1, Math.ceil((m.del+TRASH_DAYS*864e5-Date.now())/864e5));
      return prjRowHTML(m.id, m.id===prjPick, '<span class="t">'+esc(m.title||T('prj.untitled'))+'</span>'
        + '<span class="d">'+prjWhen(m.del)+'</span><span class="z">'+T('prj.daysLeft', left)+'</span>');
    }).join('');
  } else {
    const list=prjSorted(await prjList()), busy=await lockBusy();
    if(!list.some(x=>x.id===prjPick)) prjPick = list.some(x=>x.id===prjId) ? prjId : ((list.find(x=>!busy.has(x.id))||list[0]||{}).id||null);
    note.textContent = T('prj.listNote', list.length);
    box.innerHTML = list.map(m=>prjRowHTML(m.id, m.id===prjPick,
        '<span class="t">'+esc(m.title||T('prj.untitled'))+'</span>'
      + (busy.has(m.id)?'<span class="busy">'+T('prj.busyTag')+'</span>':'')
      + '<span class="d">'+prjWhen(m.upd)+'</span>'
      + '<span class="f">'+T('prj.file')+(m.fileAt?prjWhenShort(m.fileAt):T('prj.notSaved'))+'</span>'
      + '<span class="z">'+prjSize(m.size)+'</span>')
      .replace('<div class="prjRow', '<div'+(busy.has(m.id)?' data-busy="1"':'')+((m.gens||[]).length?' data-gens="1"':'')+' class="prjRow')).join('');
  }
  const on=box.querySelector('.prjRow.on'); if(on) on.scrollIntoView({block:'nearest'});
  prjBtns();
}
function prjNoteErr(t){ const n=document.getElementById('prjNote'); n.textContent=t; n.style.color='#ff9b83'; }
function prjDlgShow(){
  prjPick=prjId; prjView='list';
  prjDlg.style.display='flex';
  prjDlgPaint().then(()=>{ const b=document.getElementById('prjOpenBtn'); if(!b.disabled) b.focus(); });
}
function prjDlgHide(){
  if(prjKV && !prjId) return;         // 還沒有開啟中的作品時，請使用者從清單中選擇
  prjDlg.style.display='none';
}
async function prjDlgOpenPick(){
  if(!prjKV || !prjPick || prjView!=='list') return;
  if(prjPick===prjId){ prjDlgHide(); return; }
  if((await lockBusy()).has(prjPick)){ prjNoteErr(T(PRJ_BUSY)); setStatus(T(PRJ_BUSY),'#ff9b83'); return; }
  if(await prjOpen(prjPick)){ prjDlgHide(); return; }
  const why=document.getElementById('status').textContent;   // 打不開的原因（prjOpen 顯示的訊息）
  await prjDlgPaint(); prjNoteErr(why);
}
document.getElementById('btnPrj').onclick=prjDlgShow;
document.getElementById('prjClose').onclick=prjDlgHide;
prjDlg.addEventListener('click', e=>{ if(e.target===prjDlg) prjDlgHide(); });
document.getElementById('prjList').addEventListener('click', e=>{
  const r=e.target.closest('.prjRow[data-id]'); if(!r) return;
  prjPick=r.dataset.id;
  document.querySelectorAll('#prjList .prjRow').forEach(x=>{ const on=x===r; x.classList.toggle('on',on); x.setAttribute('aria-selected',on); });
  prjBtns();
});
document.getElementById('prjList').addEventListener('dblclick', e=>{
  const r=e.target.closest('.prjRow[data-id]'); if(!r) return;
  prjPick=r.dataset.id;
  if(prjView==='list') prjDlgOpenPick();
});
document.getElementById('prjOpenBtn').onclick=prjDlgOpenPick;
document.getElementById('prjNew').onclick=async()=>{ await prjNew(null); prjDlgHide(); };
document.getElementById('prjDup').onclick=async()=>{
  if(!prjPick) return;
  await saveNow();
  let d=null; try{ d=JSON.parse(await prjRead(prjPick)); }catch(e){}
  if(!d){ setStatus(T('status.dupFailed'),'#ff9b83'); return; }
  const title=(d.title||T('prj.untitled'))+T('prj.copySuffix');
  d.title=title;
  const m=await prjWrite(uid(), JSON.stringify(d), title);
  prjPick=m.id;
  setStatus(T('status.created', title),'var(--ok)');
  prjDlgPaint();
};
document.getElementById('prjDel').onclick=async()=>{
  if(!prjPick) return;
  const m=(await prjList()).find(x=>x.id===prjPick); if(!m) return;
  if((await lockBusy()).has(m.id)){ prjNoteErr(T(PRJ_BUSY)); return; }
  if(!confirm(T('confirm.trash', m.title||T('prj.untitled')))) return;
  const wasCur = m.id===prjId;
  if(wasCur){ await prjLeave(); }            // 先寫完再釋放（垃圾桶裡的作品，內容會以最新的狀態保留）
  await prjToTrash(m.id);
  setStatus(T('status.trashed', m.title||T('prj.untitled')),'var(--ok)');
  if(wasCur){
    prjId=null; fileH=null; fileId=null; fileState=null; barPaint();
    const busy=await lockBusy();
    let ok=false;
    for(const x of prjSorted(await prjList())){ if(!busy.has(x.id) && await prjOpen(x.id)){ ok=true; break; } }
    if(!ok) await prjNew(null);
  }
  prjPick=prjId;
  prjDlgPaint();
};
document.getElementById('prjGens').onclick=()=>{ if(!prjPick) return; prjGenOf=prjPick; prjView='gens'; prjPick=null; prjDlgPaint(); };
document.getElementById('prjTrashBtn').onclick=()=>{ prjView='trash'; prjPick=null; prjDlgPaint(); };
prjDlg.querySelectorAll('.prjBack').forEach(b=>b.onclick=()=>{ prjPick = prjView==='gens' ? prjGenOf : prjId; prjView='list'; prjDlgPaint(); });
document.getElementById('prjGenRestore').onclick=async()=>{
  if(!prjPick || !prjGenOf) return;
  let raw=null, d=null;
  try{ raw=await genRead(prjGenOf, prjPick); d=JSON.parse(raw); }catch(e){ d=null; }
  if(!d){ setStatus(T('status.genFailed'),'#ff9b83'); return; }
  const title=(d.title||T('prj.untitled'))+T('prj.genSuffix', prjWhen(+prjPick));
  d.title=title;
  const m=await prjWrite(uid(), JSON.stringify(d), title);
  setStatus(T('status.created', title),'var(--ok)');
  prjView='list'; prjPick=m.id; prjDlgPaint();
};
document.getElementById('prjTrashRestore').onclick=async()=>{
  if(!prjPick) return;
  const id=prjPick;
  await prjRestore(id);
  setStatus(T('status.restored'),'var(--ok)');
  prjView='list'; prjPick=id; prjDlgPaint();
};
document.getElementById('saveBarBtn').onclick=async()=>{
  if(saveErr){
    if(inflight!=null || !savePending) savePending=true;   // 把沒寫成功的部分，以目前的狀態再寫一次
    await saveNow();
  } else if(fileState==='paused') await fileResume();
};
addEventListener('keydown', e=>{
  if(!prjDlgOn()) return;
  /* 顯示清單期間，不把按鍵送到背後的原稿（書式・刪除・複製等）。
     預設的行為（Tab 移動、按鈕的 Enter）不會阻止，所以照樣有效 */
  e.stopPropagation();
  if(e.key==='Escape'){ e.preventDefault(); if(prjView!=='list'){ prjDlg.querySelector('.prjBack').click(); } else prjDlgHide(); return; }
  if(e.target && e.target.closest && e.target.closest('button') && e.key==='Enter') return;
  const rows=[...document.querySelectorAll('#prjList .prjRow[data-id]')];
  const i=rows.findIndex(r=>r.dataset.id===String(prjPick));
  if(e.key==='ArrowDown' || e.key==='ArrowUp'){
    e.preventDefault();
    const n=rows[Math.max(0, Math.min(rows.length-1, i+(e.key==='ArrowDown'?1:-1)))];
    if(n) n.click(), n.scrollIntoView({block:'nearest'});
  } else if(e.key==='Enter'){ e.preventDefault(); if(prjView==='list') prjDlgOpenPick(); }
}, true);

/* ================= 啟動 ================= */
let persistAsked=null;      // 向瀏覽器要求「不要刪除」的結果（Promise）
(async()=>{
  initNpcLists();
  applyPanes(loadPanes());
  bgWrap.querySelector('[data-bg="none"]').classList.add('on');
  await prjInit();
  if(!prjKV){
    /* 無法使用作品的存放處。照以前一樣只用一個作品運作 */
    prjShow(await load());
    setStatus(T('status.singleOnly'),'#e8c66a');
    return;
  }
  /* 要求瀏覽器在容量不足時，不要擅自刪除這份儲存資料 */
  try{ if(navigator.storage && navigator.storage.persist) persistAsked=navigator.storage.persist().catch(()=>false); }catch(e){}
  const notes=[];
  await prjMigrate();
  try{ const n=await prjRepair(); if(n) notes.push(T('status.repaired', n)); }catch(e){}
  try{ const r=await jnlRecover(); if(r.length) notes.push(T('status.recovered', r.join('、'))); }catch(e){}
  try{ await prjPurgeOld(); }catch(e){}
  const list = await prjList();
  if(!list.length && !(await prjTrash()).length){
    /* 第一次使用時。用範例原稿建立第一個作品 */
    await prjNew(null, T('status.ready'));
    return;
  }
  /* 先在背後開啟最後開啟的作品，再讓使用者從清單選擇要開哪一個。
     跳過正在別的分頁編輯的作品。沒有能開的作品時，先顯示一份什麼都不寫的暫時原稿 */
  const last = prjLast();
  const order = [list.find(x=>x.id===last)].concat(prjSorted(list)).filter((x,i,a)=>x && a.indexOf(x)===i);
  let opened=false;
  /* 最後開啟的作品，稍等一下讓前一頁釋放鎖（因為可能剛重新載入） */
  if(order[0] && order[0].id===last && await prjOpen(last, 3000)) opened=true;
  if(!opened){
    const busy = await lockBusy();
    for(const m of order){ if(busy.has(m.id)) continue; if(await prjOpen(m.id)){ opened=true; break; } }
  }
  if(!opened) prjShow(null);
  setStatus(notes.length ? notes.join('。') : T('status.ready'), notes.length ? '#e8c66a' : undefined);
  prjDlgShow();
})();

/* ================= 介面語言（TRPG Toolkit 收錄版追加） =================
   JS 寫在畫面上的文字，在切換語言時全部重畫。
   原稿本身（S）不受影響：建立時依當下語言放入的預設文字，建立後就是使用者的資料。 */
var prevBlk = null;          // 成品預覽視窗正在顯示的段落
let i18nPrev = I18N.locale;  // 切換之前的語言（找回畫面文字對應的 key 時使用）
/* 某個 key 在所有已載入語言中的值。用來辨認「任何語言的預設值」 */
function tAll(key){
  return Object.keys(I18N.messages)
    .map(l=>(I18N.messages[l]||{})[key]).filter(v=>typeof v==='string');
}
/* 畫面上的文字若是「上一個語言」的某個訊息，就換成目前語言的同一則訊息。
   只處理不含參數的訊息；含參數的訊息會在下一次操作時自然更新 */
function reTranslate(el, from){
  if(!el) return;
  const txt = el.textContent, table = I18N.messages[from||i18nPrev] || {};
  if(!txt) return;
  for(const k in table){ if(table[k]===txt){ el.textContent = T(k); return; } }
}
/* NPC 卡放不進頁面時的提示。紙面的 CSS（DOC_CSS）與匯出共用，所以文字不寫在 CSS 裡，
   只在編輯畫面以 CSS 變數提供（匯出檔不會出現這個提示） */
function paintNpcOverMsg(){
  document.documentElement.style.setProperty('--npc-over-msg', JSON.stringify(T('npc.overflow')));
}
/* 只在載入時由 JS 寫一次的介面文字 */
function paintStaticJS(){
  paintNpcOverMsg();
  document.getElementById('popEdit').placeholder = T('popwin.editPh');
  tb.innerHTML = typeBtnsHTML();
  document.getElementById('popTypeBtns').innerHTML = typeBtnsHTML(POP_SKIP);
  paintPopRich(); paintColBtns();
  paintBgPresets();
  bgWrap.querySelectorAll('.swatch').forEach(x=>x.classList.toggle('on', x.dataset.bg===bgPick));
  fillList('dl-lb', LABEL_PICKS.map(k=>T(k)));
}
I18N.resolveLocale();
i18nPrev = I18N.locale;
I18N.mountSwitcher(document.getElementById('localeSelect'));
paintNpcOverMsg();
document.getElementById('popEdit').placeholder = T('popwin.editPh');
/* HTML 裡由 JS 接手的欄位，先放入目前語言的初始文字 */
Object.entries({pcolNote:'pcol.note', indNote:'ind.note', propTtl:'prop.blockContent', propTtlR:'prop.title',
  popPropHead:'prop.title', popHint:'popwin.hintText', flowHint:'flow.hintInit',
  outAll:'out.all', prevTitle:'prev.default', outTitle:'top.export'})
  .forEach(([id,k])=>{ const el=document.getElementById(id); if(el) el.textContent = T(k); });
I18N.onChange(()=>{
  paintStaticJS();
  buildFontUI();
  /* 說明視窗已經建過的話，維持正在看的章節重建 */
  if(document.getElementById('helpNav').children.length){
    const on = document.querySelector('#helpNav button.on');
    const id = on ? on.dataset.help : null;
    buildHelp();
    const b = id ? document.querySelector('#helpNav [data-help="'+id+'"]') : null;
    if(b) b.click();
  }
  barPaint();
  propId = null;             // 讓右側設定欄一定重建
  render();
  if(flowId) renderFlowWin(true);
  else { /* 關著的流程圖視窗：清掉舊語言的內容，下次開啟時會重畫 */
    document.getElementById('flowCanvas').innerHTML = '';
    document.getElementById('flowProp').innerHTML = '';
  }
  if(tblModalId){ renderTblModal(); tbigRichBar(); }
  if(popId){ const f=findBlock(popId); if(f && f.b.type==='popup') setPopMode(ensurePopup(f.b)); }
  if(document.getElementById('outDlg').style.display==='flex') openOut(outMode);
  if(prevBlk && document.getElementById('prevDlg').style.display==='flex') openBlockPreview(prevBlk);
  if(prjDlgOn()) prjDlgPaint();
  /* 其餘由 JS 接手的欄位（包含目前隱藏著的視窗），把上一個語言的訊息換成目前語言 */
  ['status','npcDlgNote','flowHint','ytNote','ccfInNote','prjNote','saveBarMsg','popHint','prevTitle',
   'outTitle','outAll','propTtl','propTtlR','popPropHead','pcolNote','indNote']
    .forEach(id=>reTranslate(document.getElementById(id)));
  i18nPrev = I18N.locale;
});
