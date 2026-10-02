/**
 * 紙面的樣式（編輯畫面、列印、PDF、閱覽 HTML 共用）。數值見規格 3.2、3.6；
 * 看得到的字都是真的文字（不用 ::before 的 content），PDF 才能把它們變成真正的文字。
 */
import { SPACE } from '../model/blocks';
import type { Doc } from '../model/types';

/** 預設的明體堆疊（新版先用 Noto Serif TC） */
export const SERIF_STACK =
  '"Noto Serif TC","Hiragino Mincho ProN","Yu Mincho",YuMincho,"PMingLiU","Noto Serif JP",serif';

const BASE_CSS = `
.pg{--paper:#f7f3ea;position:relative;box-sizing:border-box;width:210mm;height:297mm;background:var(--paper);color:#23201c;overflow:hidden;
  font-family:${SERIF_STACK};font-weight:400;line-height:normal;text-align:left;letter-spacing:normal;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg *,.pg *::before,.pg *::after{box-sizing:border-box}
.pg-appx{height:auto;min-height:297mm}
.pg-bg,.pg-img{position:absolute;inset:0;z-index:0;pointer-events:none}
.pg-body{position:relative;z-index:1;height:100%;overflow:hidden}
.pg-body.cols2{column-count:2;column-gap:7mm;column-rule:1px solid rgba(35,32,28,.18);column-fill:auto}
.bp{padding:0}
.bp.span{column-span:all}
.b{margin:0 0 2mm;white-space:pre-wrap;word-break:normal;line-break:strict;overflow-wrap:anywhere}
.bp.top:not(.bp-cover){padding-top:0}
.bp.i1>.b{margin-left:4mm}.bp.i2>.b{margin-left:8mm}.bp.i3>.b{margin-left:12mm}.bp.i4>.b{margin-left:16mm}
.bp.clr{clear:both}

.t-title{font-size:2.6em;text-align:center;letter-spacing:.16em;line-height:1.35;font-weight:600}
.t-subtitle{font-size:1.15em;text-align:center;letter-spacing:.34em;color:#6d6353}
.t-h1{font-size:1.6em;letter-spacing:.12em;background:#23201c;color:#f7f3ea;padding:1.6mm 4mm;font-weight:600}
.t-h2{font-size:1.3em;letter-spacing:.06em;padding:0 0 1mm 3.5mm;border-left:3.5px solid #a8331f;border-bottom:1px solid rgba(35,32,28,.25)}
.t-h3{font-size:1.08em;font-weight:700;color:#5c4a33}
.h3mk{color:#a8331f;font-size:.85em}
.t-desc{line-height:1.9}
.t-dialog{line-height:1.85;color:#1c2b3c}
.spk{display:block;font-size:.78em;font-weight:700;letter-spacing:.12em;color:#5c4a33;margin:0 0 .1em;line-height:1.3}
.t-note{font-size:.86em;line-height:1.75;color:#5f5849;background:rgba(35,32,28,.05);border-left:2px solid rgba(35,32,28,.35);padding:2mm 3mm}
.t-scene{text-align:right;font-size:.88em;font-weight:700;text-decoration:underline;text-underline-offset:.28em;line-height:1.8;letter-spacing:.06em;break-after:avoid}
.t-cover{text-align:center;font-size:2.9em;letter-spacing:.22em;line-height:1.5;font-weight:600;break-after:avoid}
.t-colophon{font-size:.76em;line-height:2;color:#5f5849;letter-spacing:.04em;border-top:1px solid rgba(35,32,28,.45);padding-top:3.5mm}
.t-hr{border-top:1px solid rgba(35,32,28,.5);padding:0;height:0;overflow:visible;text-align:center;font-size:.78em;color:#5f5849;letter-spacing:.2em;line-height:0}
.t-hr.hastx{height:auto;line-height:1.4;border-top:0;display:flex;align-items:center}
.hrl{flex:1 1 0;height:0;border-top:1px solid rgba(35,32,28,.5)}
.hrtx{padding:0 3mm;white-space:pre-wrap}
.t-vr{border-left:2px solid rgba(35,32,28,.55);padding-left:3mm;line-height:1.9;min-height:8mm}
.bp-colbr{break-before:column;padding:0!important}
.t-colbr{height:0;margin:0!important;padding:0;font-size:0;line-height:0}

/* 規則框 */
.t-proc{line-height:1.8;padding:2.5mm 3.5mm}
.t-proc.bx-sm{font-size:.95em}
.t-proc.bx-l-solid{border:1.3px solid var(--bxl)}
.t-proc.bx-l-dash{border:1.3px dashed var(--bxc)}
.t-proc.bx-l-none{border:0;padding-left:0;padding-right:0}
.t-proc.bx-bar{border-left:5px solid var(--bxc);padding-left:3.5mm}
.t-proc.bx-fill{background:var(--bxf)}
.blb{display:block;font-size:.75em;letter-spacing:.28em;font-weight:700;margin-bottom:1mm;white-space:pre-wrap}
.t-proc .blb{color:var(--bxc)}

/* 巢狀書式 */
.b.hasrich{white-space:normal}
.rp,.pop-p{white-space:pre-wrap;margin:0 0 1.2mm}
.rp:last-child,.pop-p:last-child{margin-bottom:0}
.rh{font-weight:700;font-size:.92em;letter-spacing:.06em;color:var(--bxc,#a8331f);margin:1.8mm 0 .8mm;padding-left:.6em;border-left:2.5px solid var(--bxc,#a8331f)}
.rh:first-child{margin-top:0}
.rhs{font-weight:700;font-size:.9em;letter-spacing:.04em;margin:1.4mm 0 .5mm}
.rhs:first-child{margin-top:0}
.rn{white-space:pre-wrap;font-size:.84em;line-height:1.7;color:#5f5849;border-left:2px solid rgba(35,32,28,.3);padding:.2mm 0 .2mm 2mm;margin:1.2mm 0}
.rn:first-child{margin-top:0}.rn:last-child{margin-bottom:0}
.rin{border:1.2px dashed var(--bxc,#a8331f);background:var(--bxf,rgba(168,51,31,.05));border-radius:1mm;padding:1.8mm 2.5mm;margin:1.8mm 0}
.rin .blb{font-size:.72em;margin-bottom:.8mm;color:var(--bxc,#a8331f)}
.rt{white-space:pre-wrap;line-height:1.85;color:#1c2b3c;margin:0 0 1.2mm}
.t-proc .rt .spk{color:var(--bxc)}
.rtbl{width:100%;border-collapse:collapse;font-size:.9em;margin:1.2mm 0;white-space:normal}
.rtbl th,.rtbl td{border:1px solid rgba(35,32,28,.4);padding:.8mm 1.5mm;text-align:left;line-height:1.6;white-space:pre-wrap}
.rtbl th{background:rgba(35,32,28,.07);font-weight:700}
.t-proc .rtbl th{background:var(--bxf,rgba(35,32,28,.07))}
.rh1{font-size:1.25em;font-weight:700;letter-spacing:.08em;color:#f7f3ea;background:#23201c;padding:1mm 2.5mm;margin:3mm 0 1.6mm}
.rh2{font-size:1.12em;letter-spacing:.05em;margin:2.6mm 0 1.4mm;padding:0 0 .6mm 2.5mm;border-left:3px solid #a8331f;border-bottom:1px solid rgba(35,32,28,.25)}
.rh3{font-size:1.02em;font-weight:700;color:#5c4a33;margin:2mm 0 1mm}
.rh1:first-child,.rh2:first-child,.rh3:first-child{margin-top:0}
ul.ls{list-style:none;margin:1.2mm 0;padding:0;white-space:normal}
ul.ls:first-child{margin-top:0}ul.ls:last-child{margin-bottom:0}
ul.ls li{display:flex;gap:.5em;line-height:1.85;margin:0 0 .6mm}
ul.ls li.lv1{padding-left:1.6em}ul.ls li.lv2{padding-left:3.2em}ul.ls li.lv3{padding-left:4.8em}
ul.ls .mk{flex:0 0 auto;color:#a8331f;min-width:1.1em}
ul.ls-num .mk{color:#5c4a33;font-variant-numeric:tabular-nums}
ul.ls-box .mk{color:#23201c}
.t-proc ul.ls .mk{color:var(--bxc)}
ul.ls .tx{flex:1;min-width:0;white-space:pre-wrap}

/* 註解（列印與 PDF 不顯示底線與編號） */
.cmt{border-bottom:1px dotted rgba(168,51,31,.75);cursor:help}
.cmt-n{font-size:.6em;color:#a8331f;vertical-align:super;line-height:0;margin-left:.1em;font-weight:700}
.pv-print .cmt{border-bottom:0}.pv-print .cmt-n{display:none}
@media print{.cmt{border-bottom:0}.cmt-n{display:none}}

ruby{ruby-position:over}
ruby rt{font-size:.5em;font-weight:inherit;letter-spacing:0;line-height:1.1;text-align:center}

/* 圖片 */
.t-image{text-align:center}
.bp.bp-image{break-inside:avoid}
.t-image img{display:block;margin:0 auto;max-width:100%}
.t-imgcap{font-size:.78em;color:#5f5849;margin-top:1.2mm;line-height:1.6;text-align:center}
.t-imgph{border:1.5px dashed rgba(35,32,28,.4);color:#8a7d63;padding:6mm 2mm;font-size:.85em}
.bp.bp-image.free{position:absolute;margin:0!important;padding:0!important;z-index:3}
.bp.bp-image.free .t-image{margin:0}
.bp.bp-image.free img{width:100%!important}
.bp.bp-image.fl-l{float:left;clear:left;margin:0 4mm 2mm 0;padding-top:1mm}
.bp.bp-image.fl-r{float:right;clear:right;margin:0 0 2mm 4mm;padding-top:1mm}
.bp.bp-image.fl-l .t-image,.bp.bp-image.fl-r .t-image{margin:0}
.bp.bp-image.fl-l img,.bp.bp-image.fl-r img{width:100%!important}
.imgshape{pointer-events:none;visibility:hidden}

/* 表格 */
.t-table{white-space:normal}
table.tbl{border-collapse:collapse;width:100%;font-size:.92em;line-height:1.7;margin:0}
table.tbl th,table.tbl td{border:1px solid rgba(35,32,28,.45);padding:1.2mm 2mm;text-align:left;vertical-align:top;white-space:pre-wrap}
table.tbl th{background:rgba(35,32,28,.08);font-weight:700;color:#3a332b}
.tbl-cap{font-size:1.05em;font-weight:700;letter-spacing:.1em;color:#3a332b;margin:0 0 1.5mm;padding:0 0 0 .2em;min-height:1.4em;white-space:pre-wrap}
.cd-wrap{display:flex;flex-direction:column;gap:3.2mm;padding-top:.5em}
.cd{position:relative;border:1.2px solid rgba(35,32,28,.55);border-radius:1mm;padding:3.6mm 3mm 2.4mm}
.cw.w-cd-t{position:absolute;top:-.72em;left:2.5mm;background:var(--paper,#f7f3ea);padding:0 1.4mm;max-width:calc(100% - 6mm);z-index:1;line-height:1.25}
.cd-t{font-weight:700;font-size:.92em;letter-spacing:.06em;color:#3a332b;white-space:pre-wrap;line-height:1.25}
.cd-b{min-width:0}
.cd-k{font-size:.74em;letter-spacing:.1em;color:#8a7d63;margin:1.2mm 0 .3mm;white-space:pre-wrap}
.cd-k:first-child{margin-top:0}
.cd-v{line-height:1.85;white-space:pre-wrap;min-height:1.2em}
.tl-box{border:1.2px solid rgba(35,32,28,.6);border-radius:1mm;overflow:hidden}
.tl-sec{padding:2mm 3mm 2.5mm;border-top:1.2px solid rgba(35,32,28,.45)}
.tl-sec:first-child{border-top:0}
.tl-h{display:flex;align-items:baseline;gap:.2em;margin:0 0 1.2mm}
.tl-no{font-weight:700;min-width:1.4em;text-align:right;white-space:pre-wrap}
.tl-co{color:#6d6353}
.tl-ttl{flex:0 1 auto;min-width:8em;max-width:100%;font-weight:700;letter-spacing:.05em;white-space:pre-wrap;padding:0 .8em .6mm 0;border-bottom:1.1px solid rgba(35,32,28,.55);border-right:1.1px solid rgba(35,32,28,.55)}
.cw.w-tl-body{padding-left:1.6em}
.tl-body{margin:0 0 .8mm;line-height:1.85;white-space:pre-wrap}
.tl-body:last-child{margin-bottom:0}
.cellblk{margin:0}
.cellblk>.bp:first-child{padding-top:0;margin-top:0}
.cellblk>.bp:last-child>.b{margin-bottom:0}
.w-cd-t .cellblk,.w-tl-no .cellblk,.w-tl-ttl .cellblk{margin:0}
.w-cd-t .bp,.w-tl-no .bp,.w-tl-ttl .bp{padding:0;margin:0}
.w-cd-t .b,.w-tl-no .b,.w-tl-ttl .b{margin:0;line-height:1.3}

/* 彈出視窗 */
.t-popup{white-space:normal;display:flex;gap:2mm;align-items:center;flex-wrap:wrap}
button.pop-btn{font:inherit;font-size:.95em;cursor:pointer;width:auto;background:#23201c;color:#f7f3ea;border:0;border-radius:2mm;padding:1.2mm 4mm;letter-spacing:.06em;margin:0}
button.pop-btn:hover{background:#a8331f}
.pop-ic{font-size:.9em}
.pop-empty{color:#8a7d63;margin:0}

/* 目錄 */
.bp.bp-toc{break-inside:auto}
.toc-h{font-size:1.7em;text-align:center;letter-spacing:.4em;margin:6mm 0 7mm;font-weight:600}
.toc-list{line-height:2.05;font-size:.98em;white-space:normal}
.toc-line{display:flex;align-items:baseline;gap:2mm;text-decoration:none;color:#23201c}
.toc-line .lb{flex:0 0 auto}
.toc-line .dots{flex:1;border-bottom:1px dotted rgba(35,32,28,.45);transform:translateY(-3px)}
.toc-line .dots.plain{border:0}
.toc-line .pn{flex:0 0 auto;font-variant-numeric:tabular-nums}
.toc-l0,.toc-l1{font-weight:700}
.toc-l1{margin-top:2mm}
.toc-l2{padding-left:5mm}
.toc-l3{padding-left:10mm;font-size:.9em;color:#5f5849}

/* 流程圖 */
.t-flow{white-space:normal;break-inside:avoid}
.fwc{position:relative;margin:0 auto}
.fwsvg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.fwn{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1.45;font-size:.86em;white-space:pre-wrap;overflow:hidden}
.fwn-a,.fwn-b{width:100%;min-width:0}
.fwn.two{justify-content:flex-start}
.fwn.two .fwn-a,.fwn.two .fwn-b{flex:1;display:flex;align-items:center;justify-content:center}
.fwn.two .fwn-b{font-size:.92em}
.fwn.k-diamond{padding-left:11%!important;padding-right:11%!important;font-size:.78em}
.fwn.k-io{padding-left:9%!important;padding-right:9%!important}
.fw-empty{color:#8a7d63;font-size:.85em}

/* NPC 卡 */
.t-npc{white-space:normal;border:1.3px solid rgba(35,32,28,.55);background:rgba(35,32,28,.03);padding:3mm 4mm 3.5mm;font-size:1em}
.npc-head{display:flex;align-items:flex-end;gap:1mm 3mm;border-bottom:1.3px solid #a8331f;padding-bottom:1.2mm;margin:0 0 2mm;flex-wrap:wrap}
.npc-nameblk{display:flex;flex-direction:column;align-items:flex-start;min-width:0;flex:0 1 auto}
.npc-kana{font-size:.62em;color:#6d6353;letter-spacing:.14em;line-height:1.3;padding:0 0 0 .1em;min-width:22mm;min-height:1.3em}
.npc-name{font-size:1.2em;font-weight:700;min-width:3em}
.npc-role{font-size:.82em;color:#6d6353;flex:1 1 auto;min-width:0;padding-bottom:.15em}
.npc-tag{display:inline-block;font-size:.62em;letter-spacing:.1em;color:#f7f3ea;background:#a8331f;padding:.6mm 2mm;border-radius:2mm;white-space:nowrap;margin-left:auto;align-self:flex-end}
.npc-arwrap{display:flex;gap:4mm;align-items:flex-start}
.npc-arbody{flex:1 1 auto;min-width:0}
.npc-art{align-self:stretch;display:flex;flex-direction:column;align-items:center;gap:1.5mm}
.npc-art img{max-width:100%;max-height:150mm;object-fit:contain;display:block;border:1px solid rgba(35,32,28,.25)}
.npc-grid{display:grid;gap:.6mm;margin:0 0 2mm;font-size:.86em}
.npc-grid.c8{grid-template-columns:repeat(8,1fr)}
.npc-grid.c3{grid-template-columns:repeat(3,1fr)}
.npc-cell{border:1px solid rgba(35,32,28,.35);text-align:center}
.npc-cell .k{display:block;font-size:.72em;color:#6d6353;background:rgba(35,32,28,.06);padding:.3mm 0}
.npc-cell .v{display:block;min-height:1.3em;padding:.5mm 0}
.npc-row{display:flex;flex-wrap:wrap;gap:1.5mm 4mm;margin:0 0 2mm;font-size:.86em}
.npc-row .fld{display:flex;align-items:baseline;gap:1mm}
.npc-row .fld .k{color:#6d6353;font-size:.85em;white-space:nowrap}
.npc-row .fld .v{min-width:2em;border-bottom:1px solid rgba(35,32,28,.4);padding:0 .5mm}
.npc-sub{font-size:.74em;letter-spacing:.18em;color:#a8331f;font-weight:700;margin:2mm 0 1mm}
.npc-table{width:100%;border-collapse:collapse;font-size:.84em;margin:0 0 1.5mm}
.npc-table th,.npc-table td{border:1px solid rgba(35,32,28,.35);padding:.8mm 1.2mm;text-align:center}
.npc-table th{background:rgba(35,32,28,.07);font-weight:700}
.npc-table td.tl{text-align:left}
.npc-skilltable{table-layout:fixed}
.npc-skilltable th:nth-child(2),.npc-skilltable td:nth-child(2){width:23%}
.npc-skilltable th:nth-child(3),.npc-skilltable td:nth-child(3){width:9%}
.npc-skilltable th:nth-child(4),.npc-skilltable td:nth-child(4){width:13%}
.npc-memo{white-space:pre-wrap;border:1px solid rgba(35,32,28,.35);background:rgba(255,255,255,.5);padding:1.5mm 2.5mm;min-height:5mm;font-size:.92em;line-height:1.7}
.npc-ph{color:rgba(35,32,28,.3)}
.dxgrid{display:grid;grid-template-columns:6.6em repeat(3,minmax(0,1fr));margin:0 0 2mm;font-size:.86em}
.dxrow{display:contents}
.dxab,.dxsk{display:grid;grid-template-columns:3.5em minmax(0,1fr) 2.6em;align-items:end;column-gap:.4em;min-width:0;border-bottom:1px solid rgba(35,32,28,.25);padding:.9mm .6mm .5mm}
.dxab{grid-template-columns:2.6em minmax(0,1fr) 2.6em;background:rgba(35,32,28,.05)}
.dxab .k{font-weight:700;color:#23201c;white-space:nowrap}
.dxsk .k{color:#6d6353;font-size:.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxsp{min-width:0}
.dxargv{border-bottom:1px dotted rgba(35,32,28,.3);padding:0 .3mm;display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9em}
.dxvalv{border-bottom:1px solid rgba(35,32,28,.3);padding:0 .3mm;display:block;text-align:center}
.dxsyn{display:inline-block;font-size:.9em;padding:0 1mm;margin-right:1mm;border-bottom:1.6px solid var(--kc);color:var(--kc);font-weight:700}
.npc-dxeff td.dxeffn{border-left:2.2px solid var(--kc,transparent)}
.dxkind{display:block;font-size:.68em;letter-spacing:.04em;color:var(--kc);font-weight:700;line-height:1.3}
.dxcbs{display:flex;flex-direction:column;gap:1.4mm}
.dxcb{border:1px solid rgba(35,32,28,.35);border-left:2.2px solid #23201c;padding:1mm 1.6mm}
.dxcb-h{font-weight:700;font-size:.95em;border-bottom:1px dotted rgba(35,32,28,.3);padding-bottom:.4mm}
.dxcb-g{display:grid;grid-template-columns:repeat(4,1fr);gap:.4mm 1.4mm;margin-top:.8mm}
.dxcb-c{display:flex;align-items:baseline;gap:.8mm;min-width:0}
.dxcb-c .k,.dxcb-f .k{flex:0 0 auto;font-size:.68em;color:#6d6353}
.dxcb-c .v{flex:1;min-width:0;font-size:.9em}
.dxcb-f{display:flex;align-items:baseline;gap:.8mm;margin-top:.6mm;border-top:1px dotted rgba(35,32,28,.25);padding-top:.5mm}

/* 頁尾 */
.pg-foot{position:absolute;z-index:2;bottom:7mm;left:0;right:0;text-align:center;font-size:8.5pt;color:#6d6353;letter-spacing:.2em;display:flex;align-items:baseline;justify-content:center;gap:1.2em;padding:0 12mm}
.pg-foot .ft{letter-spacing:.1em}
.pg-foot .pn{font-variant-numeric:tabular-nums}

/* 背景花紋（新版提供素色與紙紋；其他是舊原稿的花紋，照樣顯示） */
.bg-grid{background-image:linear-gradient(rgba(35,32,28,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(35,32,28,.10) 1px,transparent 1px);background-size:5mm 5mm}
.bg-rule{background-image:linear-gradient(rgba(35,32,28,.13) 1px,transparent 1px);background-size:100% 8mm}
.bg-dot{background-image:radial-gradient(rgba(35,32,28,.18) 1px,transparent 1.2px);background-size:4mm 4mm}
.bg-paper{background-image:radial-gradient(rgba(120,95,50,.10) 1px,transparent 2px),radial-gradient(rgba(90,70,35,.07) 2px,transparent 4px);background-size:7mm 7mm,13mm 13mm;background-position:0 0,4mm 6mm}
.bg-vignette{background:radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(60,45,20,.20) 100%)}
.bg-band{background:linear-gradient(90deg,rgba(35,32,28,.85) 0 7mm,rgba(168,51,31,.75) 7mm 9mm,transparent 9mm)}
.bg-parch{background:linear-gradient(160deg,rgba(190,160,105,.22),transparent 45%),radial-gradient(90% 70% at 20% 15%,rgba(150,115,60,.18),transparent 60%),radial-gradient(80% 60% at 85% 90%,rgba(120,90,45,.16),transparent 60%)}
.bg-fog{background:radial-gradient(70% 45% at 15% 10%,rgba(40,60,80,.14),transparent 70%),radial-gradient(60% 40% at 90% 80%,rgba(40,60,80,.12),transparent 70%)}
`;

/** 段落間距（3.2.4）：上＝外框的上內距、下＝內容的下外距 */
export const SPACE_CSS = Object.entries(SPACE)
  .map(([k, v]) => `.bp-${k}{padding-top:${v.t}mm}\n.t-${k}{margin-bottom:${v.b}mm}`)
  .join('\n');

/** 紙面的完整樣式 */
export const PAPER_CSS = `${BASE_CSS}\n${SPACE_CSS}\n`;

/** 嵌入字型的名稱只留在 CSS 字串裡安全的字元 */
export const safeFontName = (v: unknown): string =>
  String(v ?? '').replace(/[^0-9A-Za-z 　-鿿＀-￯_-]/g, '');

/** 嵌入字型的 @font-face 與內文／標題字型 */
export function fontCss(doc: Pick<Doc, 'fonts' | 'fontBody' | 'fontHead'>, scope = '.pg'): string {
  const faces = (doc.fonts ?? [])
    .map(
      (f) =>
        `@font-face{font-family:"${safeFontName(f.name)}";src:url("${String(f.data).replace(/"/g, '%22')}");font-display:swap}`,
    )
    .join('\n');
  const body = doc.fontBody ? `"${safeFontName(doc.fontBody)}",` : '';
  const head = doc.fontHead ? `"${safeFontName(doc.fontHead)}",` : body;
  return `${faces}\n${scope},${scope} .fwc{font-family:${body}${SERIF_STACK}}\n${scope} .t-title,${scope} .t-subtitle,${scope} .t-h1,${scope} .t-h2,${scope} .t-h3,${scope} .toc-h{font-family:${head}${SERIF_STACK}}\n`;
}
