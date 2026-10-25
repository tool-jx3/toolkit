/**
 * 閱覽 HTML（3.9、F232）：範圍內的頁面＋左側目錄（可遮住標題、可收起）＋附錄＋彈出視窗、註解、複製按鈕、嵌入的字型；
 * 2026-10：登場人物（變數）欄與全文替換（F258）、情報區塊與手冊按一下複製（F259）；
 * 不分頁的一張（F285、F286）、目錄跳到那一頁的開頭（F288）。
 * 純字串（不依賴 DOM），方便測試。
 */
import { googleFontCssUrl } from '@/core/fonts';
import { allBlocks, gapPull, popIsBlocks, spKey } from './model/blocks';
import { copyBodyText, procCopyText } from './model/count';
import { POPUP_DEFAULT_LABEL } from './model/doc';
import { bodyWidthMm, fnum } from './model/image';
import { ccfoliaText } from './model/npc/ccfolia';
import { pimgBox, pimgShapes, pimgsOn } from './model/pageImg';
import { pagePaper } from './model/paper';
import { exportOutText } from './model/table';
import { blockComments, escapeHtml as esc } from './model/text';
import { tocEntries, tocEntriesFor, tocOf } from './model/toc';
import type { Block, Doc } from './model/types';
import { type VarItem, varShown, varView, wrapVarsHtml } from './model/vars';
import {
  appendixHtml,
  bgClass,
  blockHtml,
  copiesBody,
  newPrintLinks,
  pageSettingAt,
  pimgFlowHtml,
  popupContentHtml,
  popupsWithContent,
  type RenderCtx,
  shapesHtml,
  staticPageHtml,
} from './render/html';
import { fontCss, PAPER_CSS } from './render/paperCss';

export const EXPORT_TEXT = {
  untitled: '劇本',
  toc: '目錄',
  showHeads: '顯示標題',
  hideHeads: '遮住標題',
  showToc: '顯示目錄',
  hideToc: '收起目錄',
  close: '關閉',
  closeEsc: '關閉（Esc）',
  note: '註解',
  copied: '已複製',
  noContent: '（沒有內容）',
  /** 沒有內容的彈出視窗的視窗標題（原作「くわしく」；7.5 的 S3） */
  popTitle: POPUP_DEFAULT_LABEL,
};

/** 不分頁的一張（2026-10，上游 v3.7.0；F285、F286） */
export const EXPORT_TEXT_FLOW = {
  appendix: '附錄',
  backToBody: '↩ 回到本文',
  upToc: '↑ 回到目錄',
  upChapter: '↑ 回到本章目錄',
  back: '↩ 返回',
  start: '開頭',
};

/** 2026-10：登場人物欄、按一下複製的提示（只在用到時放進匯出檔） */
export const EXPORT_TEXT_VARS = {
  vars: '登場人物（變數）',
  copiedBody: '已複製內文',
};

/** 匯出檔記住登場人物的值的 localStorage 鍵（後面接劇本名稱；3.9、D4） */
export const VARS_KEY_PREFIX = 'trpg-toolkit:scenario-editor:vars:';

/** 遮住的標題：長度 2～14 個 ■ */
export const maskText = (s: string): string => '■'.repeat(Math.max(2, Math.min(14, s.length)));

/** <script type="text/plain"> 的內容：只把結束標籤無害化 */
export const scriptSafe = (t: string): string => String(t).replace(/<\/(script)/gi, '<\\/$1');

export interface ExportInput {
  doc: Doc;
  /** 每頁的段落（分頁結果） */
  pages: readonly (readonly string[])[];
  /** 範圍（0 起算，含兩端） */
  from: number;
  to: number;
  /** 不分頁的一張（F285）；沒有＝逐頁（A4） */
  flow?: boolean;
}

const VIEW_CSS = `
body{margin:0;background:#1a1a1c;font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif}
#nav{position:fixed;left:0;top:0;bottom:0;width:250px;box-sizing:border-box;background:#14161b;color:#dde2ec;overflow:auto;padding:56px 12px 18px;z-index:9}
#nav h1{font-size:14px;letter-spacing:.14em;color:#d3a534;margin:0 0 12px}
.nv{display:flex;align-items:baseline;gap:6px;color:#c8cfdd;text-decoration:none;padding:5px 7px;border-radius:4px;font-size:13px;line-height:1.4}
.nv:hover{background:#212734;color:#fff}
.nv i{margin-left:auto;font-style:normal;color:#d3a534;font-size:11px}
.nv.l0{font-weight:700;color:#d3a534}.nv.l1{font-weight:700}.nv.l2{padding-left:20px}.nv.l3{padding-left:34px;font-size:12px;color:#8d97ac}
.nv .nvt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body.tocmask .nv .nvt{color:#5b6478;letter-spacing:.05em}
#tocMask{display:block;width:100%;margin:0 0 10px;border:1px solid #2f3747;border-radius:5px;background:#1a1f29;color:#c8cfdd;padding:5px 8px;font:inherit;font-size:11px;cursor:pointer;letter-spacing:.06em}
#tocMask:hover{border-color:#d3a534;color:#fff}
#doc{margin-left:250px;padding:26px 0 60px;display:flex;flex-direction:column;align-items:center}
.pagebox{margin:0 0 20px}
.pg{box-shadow:0 3px 20px rgba(0,0,0,.55);scroll-margin-top:20px}
.b{scroll-margin-top:30px}
#tocBtn{position:fixed;left:10px;top:10px;z-index:12;width:38px;height:38px;padding:0;border:0;border-radius:8px;background:#23201c;cursor:pointer;opacity:.85;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
#tocBtn:hover{opacity:1;background:#a8331f}
#tocBtn i{display:block;width:18px;height:2px;background:#f7f3ea;border-radius:1px;transition:transform .18s ease,opacity .18s ease}
body:not(.notoc) #tocBtn i:nth-child(1){transform:translateY(6px) rotate(45deg)}
body:not(.notoc) #tocBtn i:nth-child(2){opacity:0}
body:not(.notoc) #tocBtn i:nth-child(3){transform:translateY(-6px) rotate(-45deg)}
body.notoc #nav{display:none}
body.notoc #doc{margin-left:0}
.fwin{position:fixed;z-index:50;display:flex;flex-direction:column;box-sizing:border-box;background:#fbf7ef;color:#23201c;border-radius:8px;box-shadow:0 10px 36px rgba(0,0,0,.42),0 0 0 1px rgba(35,32,28,.28);overflow:hidden;resize:both;min-width:240px;min-height:140px;max-width:96vw;max-height:94vh}
.fw-h{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:5px 5px 5px 14px;background:#23201c;color:#f7f3ea;cursor:move;touch-action:none;user-select:none;-webkit-user-select:none}
.fw-t{flex:1;min-width:0;font-size:13px;font-weight:700;letter-spacing:.08em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fw-x{flex:0 0 auto;border:0;background:transparent;color:#f7f3ea;font-size:19px;line-height:1;width:32px;height:28px;border-radius:4px;cursor:pointer}
.fw-x:hover,.fw-x:focus-visible{background:#a8331f;outline:none}
.fw-b{flex:1;min-height:0;overflow:auto;padding:16px 20px 20px;line-height:1.9;font-size:14px;font-family:"Noto Serif TC",serif}
.fw-t .tvar{color:inherit;border-bottom:1px dashed currentColor}
.fw-t .tvar.unset{color:#9a8e74;border-bottom:1px dotted #b9ab8c}
@media (max-width:700px){.fwin{left:0!important;right:0;top:auto!important;bottom:0;width:auto!important;height:56vh!important;max-width:none;resize:none;border-radius:12px 12px 0 0}.fw-h{cursor:default}}
.popbody{display:none}
.appx{display:none}
#cmtRail{position:fixed;right:14px;top:80px;width:250px;display:none;z-index:40}
#cmtRail.on{display:block}
.cmt-card{background:#fbf7ef;color:#23201c;border:1px solid #a8331f;border-radius:7px;padding:11px 13px;box-shadow:0 6px 26px rgba(0,0,0,.45);font-size:13px;line-height:1.8}
.cmt-h{color:#a8331f;font-size:11px;letter-spacing:.1em;margin:0 0 5px;font-weight:700}
.cmt-b{white-space:pre-wrap}
.cmt-x{margin-top:8px;padding:3px 10px;font:inherit;font-size:11px;cursor:pointer;border:0;border-radius:4px;background:#23201c;color:#f7f3ea}
.copybtn{position:absolute;right:0;top:-1.6em;border:0;border-radius:3px;background:#23201c;color:#f7f3ea;padding:1px 9px;font:inherit;font-size:11px;cursor:pointer;opacity:.55;letter-spacing:.04em;z-index:2}
.copybtn:hover{opacity:1;background:#a8331f}
.bp-table>.b,.bp-npc>.b{position:relative}
.pg-hit{animation:pghit 1.6s ease}
@keyframes pghit{0%{background:rgba(211,165,52,.45)}100%{background:transparent}}
@media (prefers-reduced-motion:reduce){.pg-hit{animation:none}}
@media (max-width:1200px){#cmtRail{right:8px;width:200px}}
@media (max-width:1000px){#nav{position:static;width:auto;height:auto;bottom:auto}#doc{margin-left:0;overflow-x:auto;align-items:flex-start}}
@media print{#nav,#tocBtn,.fwin,.copybtn,#cmtRail{display:none!important}#doc{margin:0;padding:0;display:block}.pagebox{margin:0}.pg{box-shadow:none}.appx{display:block}.cmt{border-bottom:0}.cmt-n{display:none}@page{size:A4;margin:0}}
`;

/** 登場人物欄（F258） */
const VAR_CSS = `
#vx{margin:0 0 14px;padding:0 0 12px;border-bottom:1px solid #2f3747}
#vx h2{font-size:11px;letter-spacing:.2em;color:#8d97ac;margin:0 0 8px;font-weight:400}
#vx label{display:flex;align-items:center;gap:8px;margin:0 0 5px;font-size:12px}
#vx label b{flex:0 0 auto;min-width:34px;color:#d3a534;font:11px ui-monospace,monospace}
#vx input{flex:1;min-width:0;border:0;border-bottom:1px solid #4a5468;background:transparent;color:#fff;padding:3px 2px;font:inherit;font-size:13px}
#vx input::placeholder{color:#8d97ac}
#vx input:focus{outline:0;border-bottom-color:#d3a534}
#vx input:focus-visible{outline:2px solid #d3a534;outline-offset:1px}
#vx small{display:block;font-size:11px;color:#8d97ac;margin:-3px 0 6px 42px}
`;

/** 情報區塊、手冊、「按一下複製」的特殊區塊按一下複製（F259、F305） */
const COPY_CSS = `
.t-info,.t-handout,.t-proc.bx-copy{cursor:copy;transition:box-shadow .12s}
.t-info:hover,.t-handout:hover,.t-proc.bx-copy:hover,.t-info:focus-visible,.t-handout:focus-visible,.t-proc.bx-copy:focus-visible{box-shadow:0 0 0 2px rgba(211,165,52,.55);outline:0}
#cpToast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:60;background:#23201c;color:#f7f3ea;border-radius:999px;padding:7px 16px;font:13px system-ui,sans-serif;opacity:0;pointer-events:none;transition:opacity .2s}
#cpToast.on{opacity:1}
@media print{#cpToast{display:none!important}}
`;

const SCRIPT = `(function(){
var T=${JSON.stringify(EXPORT_TEXT)};
var wins={},zTop=50,drag=null,wseq=0;
function front(w){w.style.zIndex=String(++zTop);}
function openWin(key,src,title,opener){
  var w=wins[key];
  if(w){front(w);w.querySelector('.fw-x').focus();return;}
  var tid='fwt'+(++wseq);
  w=document.createElement('section');w.className='fwin';
  w.setAttribute('role','dialog');w.setAttribute('aria-modal','false');w.setAttribute('aria-labelledby',tid);
  w.innerHTML='<div class="fw-h"><b class="fw-t"></b><button type="button" class="fw-x"></button></div><div class="fw-b"></div>';
  var t=w.querySelector('.fw-t'),x=w.querySelector('.fw-x'),b=w.querySelector('.fw-b');
  t.id=tid;x.setAttribute('aria-label',T.close);x.title=T.closeEsc;x.textContent='\u00d7';
  var st=src&&src.querySelector('.pw-t'),sb=src&&src.querySelector('.pw-b');
  if(st)t.innerHTML=st.innerHTML;else t.textContent=title;
  if(sb)b.innerHTML=sb.innerHTML;else b.innerHTML='<p>'+T.noContent+'</p>';
  var k=Object.keys(wins).length,W=Math.min(480,innerWidth-24),H=Math.min(Math.round(innerHeight*0.7),600);
  w.style.width=W+'px';w.style.height=H+'px';
  w.style.left=Math.max(12,innerWidth-W-24-k*28)+'px';w.style.top=Math.max(12,Math.min(innerHeight-160,60+k*28))+'px';
  w._key=key;w._op=opener;wins[key]=w;document.body.appendChild(w);front(w);x.focus();
}
function closeWin(w){delete wins[w._key];w.remove();if(w._op&&document.contains(w._op))w._op.focus();}
document.addEventListener('pointerdown',function(e){
  var w=e.target.closest&&e.target.closest('.fwin');if(!w)return;front(w);
  var h=e.target.closest('.fw-h');if(!h||e.target.closest('.fw-x')||innerWidth<=700)return;
  drag={w:w,x:e.clientX-w.offsetLeft,y:e.clientY-w.offsetTop};try{h.setPointerCapture(e.pointerId);}catch(er){}e.preventDefault();
});
document.addEventListener('pointermove',function(e){
  if(!drag)return;var w=drag.w;
  w.style.left=Math.max(80-w.offsetWidth,Math.min(innerWidth-80,e.clientX-drag.x))+'px';
  w.style.top=Math.max(0,Math.min(innerHeight-40,e.clientY-drag.y))+'px';
});
document.addEventListener('pointerup',function(){drag=null;});
document.addEventListener('pointercancel',function(){drag=null;});
function copyText(s){
  if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(s).catch(function(){fallback(s);});
  fallback(s);return Promise.resolve();
}
function fallback(s){var ta=document.createElement('textarea');ta.value=s;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}ta.remove();}
function store(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function load(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function setTocMask(on){
  document.body.classList.toggle('tocmask',!!on);
  var b=document.getElementById('tocMask');if(b)b.textContent=on?T.showHeads:T.hideHeads;
  var ns=document.querySelectorAll('#nav .nvt');
  for(var i=0;i<ns.length;i++){var src=ns[i].getAttribute('data-t')||'';ns[i].textContent=on?new Array(Math.max(2,Math.min(14,src.length))+1).join('\\u25a0'):src;}
  store('trpg-tocmask',on?'1':'0');
}
function setNoToc(off){
  document.body.classList.toggle('notoc',!!off);
  var tb=document.getElementById('tocBtn'),lb=off?T.showToc:T.hideToc;
  if(tb){tb.title=lb;tb.setAttribute('aria-label',lb);}
}
document.addEventListener('click',function(e){
  var t=e.target;if(!t||!t.closest)return;
  var pb=t.closest('[data-popopen]');
  if(pb){e.preventDefault();var pid=pb.getAttribute('data-popopen');openWin(pid,document.getElementById('pop'+pid),T.popTitle,pb);return;}
  var pm=t.closest('[data-popmake]');
  if(pm){e.preventDefault();openWin('m:'+pm.getAttribute('data-popmake'),null,pm.getAttribute('data-popmake'),pm);return;}
  var fx=t.closest('.fw-x');
  if(fx){closeWin(fx.closest('.fwin'));return;}
  if(t.id==='tocMask'){setTocMask(!document.body.classList.contains('tocmask'));return;}
  if(t.closest('#tocBtn')){var off=!document.body.classList.contains('notoc');setNoToc(off);store('trpg-notoc',off?'1':'0');return;}
  var cm=t.closest('[data-cmt]');
  if(cm){var p=cm.getAttribute('data-cmt').split(':');var src2=document.getElementById('cm'+p[0]+'-'+p[1]);var rail=document.getElementById('cmtRail');
    if(src2&&rail){rail.innerHTML='<div class="cmt-card"><div class="cmt-h">'+T.note+' '+(+p[1]+1)+'</div><div class="cmt-b"></div><button class="cmt-x" type="button">'+T.close+'</button></div>';rail.querySelector('.cmt-b').textContent=src2.textContent;rail.classList.add('on');}
    return;}
  if(t.className==='cmt-x'){document.getElementById('cmtRail').classList.remove('on');return;}
  var cb=t.closest('.copybtn');
  if(cb){var d=document.getElementById(cb.getAttribute('data-for'));if(d){copyText(d.textContent);var o=cb.textContent;cb.textContent=T.copied;setTimeout(function(){cb.textContent=o;},1400);}return;}
});
document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  var a=document.activeElement,w=a&&a.closest&&a.closest('.fwin');
  if(!w){for(var k in wins){if(!w||+wins[k].style.zIndex>+w.style.zIndex)w=wins[k];}}
  if(w){e.preventDefault();closeWin(w);}
});
if(load('trpg-notoc')==='1')setNoToc(true);
if(!document.body.classList.contains('fx'))document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest&&e.target.closest('a[href^="#b"]');if(!a)return;
  var el=document.getElementById(a.getAttribute('href').slice(1));if(!el)return;
  var pg=el.closest('.pg');if(!pg)return;
  e.preventDefault();
  var y=pg.getBoundingClientRect().top+scrollY-20,hy=el.getBoundingClientRect().top+scrollY;
  if(hy-y>innerHeight*0.75)y=hy-innerHeight*0.35;
  scrollTo(0,Math.max(0,y));
  var h=el.closest('.bp')||el;h.classList.remove('pg-hit');void h.offsetWidth;h.classList.add('pg-hit');
  if(history.replaceState)history.replaceState(null,'',a.getAttribute('href'));
});
setTocMask(load('trpg-tocmask')!=='0');
})();`;

/** 按一下情報區塊、手冊時（比對註解之後、複製按鈕之前） */
const COPY_CLICK = `  var cp=t.closest('.t-info,.t-handout,.t-proc.bx-copy');
  if(cp&&!t.closest('a,button,input')&&!String(window.getSelection?window.getSelection():'').trim()){copyBlock(cp);return;}
`;

const copyJs = (
  vars: boolean,
) => `var CT=${JSON.stringify(EXPORT_TEXT_VARS.copiedBody)},toast=document.getElementById('cpToast'),toastT=0;
function copyBlock(el){var pad=el.closest('[data-id]');var src=pad&&document.getElementById('cp'+pad.getAttribute('data-id'));if(!src)return;
  copyText(${vars ? 'VT(src.textContent)' : 'src.textContent'});
  if(toast){toast.textContent=CT;toast.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){toast.classList.remove('on');},1400);}}
document.addEventListener('keydown',function(e){if(e.key!=='Enter'&&e.key!==' ')return;var t=e.target;if(!t||!t.classList||!(t.classList.contains('t-info')||t.classList.contains('t-handout')||t.classList.contains('bx-copy')))return;e.preventDefault();copyBlock(t);});
`;

/** 登場人物欄：讀出記住的值、替換全文的 .tvar 與目錄的原文、每次輸入就寫回（F258） */
const varJs = (list: readonly VarItem[], key: string) => {
  const v = list.map((x) => ({ n: x.n, def: x.def }));
  const re = `\\{(${list.map((x) => x.n).join('|')})\\}`;
  const json = (x: unknown) => JSON.stringify(x).replace(/</g, '\\u003c');
  return `var V=${json(v)},VK=${json(key)},VR=new RegExp(${json(re)},'g'),val={},by={};
try{val=JSON.parse(localStorage.getItem(VK)||'{}')||{};}catch(e){val={};}
if(typeof val!=='object')val={};
for(var vi=0;vi<V.length;vi++)by[V[vi].n]=V[vi];
function vval(n){return String(val[n]==null?'':val[n]).trim();}
function shown(n){return vval(n)||(by[n]&&by[n].def)||n;}
function VT(s){return String(s).replace(VR,function(m,n){return by[n]?shown(n):m;});}
var nts=document.querySelectorAll('#nav .nvt[data-t]');
for(var ni=0;ni<nts.length;ni++)nts[ni].setAttribute('data-t0',nts[ni].getAttribute('data-t'));
function updVars(){
  var ss=document.querySelectorAll('.tvar[data-v]');
  for(var si=0;si<ss.length;si++){var n=ss[si].getAttribute('data-v');if(!by[n])continue;ss[si].textContent=shown(n);ss[si].classList.toggle('unset',!vval(n));}
  for(var ti=0;ti<nts.length;ti++)nts[ti].setAttribute('data-t',VT(nts[ti].getAttribute('data-t0')));
  setTocMask(document.body.classList.contains('tocmask'));
}
var vins=document.querySelectorAll('#vx input[data-v]');
for(var ii=0;ii<vins.length;ii++)vins[ii].value=val[vins[ii].getAttribute('data-v')]||'';
document.addEventListener('input',function(e){var t=e.target;if(!t||!t.closest||!t.closest('#vx'))return;var n=t.getAttribute('data-v');if(!n)return;val[n]=t.value;store(VK,JSON.stringify(val));updVars();});
updVars();
`;
};

/* ---------- 不分頁的一張（2026-10，上游 v3.7.0～v3.13.0；F285、F286） ---------- */

/** 整個畫面是一張紙，目錄在紙的左邊用細線隔開；紙面間距的花紋改放在畫面或本文欄（同原作） */
const FLOW_CSS = `
body.fx{background:#f7f3ea}
.fx-paper.pg{display:block;width:auto;height:auto;min-height:100vh;overflow:visible;box-shadow:none}
.fx-paper .pg-bg.bg-aged{position:fixed}
.fx-paper .pg-bg.bg-frame::before{display:none}
.fx-paper.bg-frame .fx-body.pg-body{padding:9mm 8mm!important;border:1px solid rgba(122,91,50,.55);box-shadow:inset 0 0 0 2px var(--paper,#f7f3ea),inset 0 0 0 2.5px rgba(122,91,50,.35)}
.fx-paper .pg-bg.bg-corner{position:fixed;left:240px;--cs:11mm;--co:3mm}
body.fx.notoc .fx-paper .pg-bg.bg-corner{left:0}
@media (max-width:1000px){.fx-paper .pg-bg.bg-corner{left:0}}
@media (max-width:700px){.fx-paper .pg-bg.bg-corner{display:none}}
#nav.fx-nav{position:fixed;left:0;top:0;bottom:0;width:240px;box-sizing:border-box;background:transparent;color:#23201c;border-right:1px solid rgba(35,32,28,.16);padding:58px 16px 24px 20px;z-index:9;overflow:auto}
#nav.fx-nav h1{color:#a8331f;font-size:15px;letter-spacing:.16em;margin:0 0 14px}
.fx .nv{color:#3a342a}
.fx .nv:hover{background:rgba(35,32,28,.06);color:#000}
.fx .nv.l0{color:#a8331f}.fx .nv.l3{color:#6f6450}
body.fx.tocmask .nv .nvt{color:#a99d82}
.fx #tocMask{background:transparent;border:1px solid rgba(35,32,28,.25);color:#3a342a}
.fx #tocMask:hover{border-color:#a8331f;color:#a8331f}
.fx #tocBtn{background:transparent;opacity:.75}
.fx #tocBtn i{background:#23201c}
.fx #tocBtn:hover{background:rgba(35,32,28,.08);opacity:1}
.fx #doc{display:block;margin-left:240px;padding:44px 32px 100vh}
body.fx.notoc #doc{margin-left:0}
.fx-body.pg-body{height:auto;overflow:visible;margin:0 auto;padding:0}
.fx-body .b{scroll-margin-top:28px}
.fx-pg{position:relative;display:flow-root}
.fx .toc-line .pn,.fx .toc-line .dots,.fx .nv i{display:none}
.fx-appx{margin-top:16mm;padding-top:8mm;border-top:1px dashed rgba(35,32,28,.3)}
.fx-back,.fx-up{float:right;font-size:11px;font-weight:400;letter-spacing:.04em;color:inherit;text-decoration:none;border:1px solid currentColor;border-radius:999px;padding:0 9px;margin:3px 0 0 8px;opacity:.55;font-family:system-ui,sans-serif}
.fx-back:hover,.fx-up:hover,.fx-back:focus-visible,.fx-up:focus-visible{opacity:1}
.fx-back{color:#a8331f;opacity:.85}
.fx .pop-btn::after{content:" →"}
#fxBack{position:fixed;right:22px;bottom:22px;z-index:20;display:none;align-items:center;gap:8px;background:#23201c;color:#f7f3ea;border:0;border-radius:999px;padding:9px 16px;font:13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);cursor:pointer}
#fxBack.on{display:flex}
#fxBack small{color:#d3a534;font-size:11px}
.fx-hit{animation:fxhit 1.6s ease}
@keyframes fxhit{0%{background:rgba(211,165,52,.45)}100%{background:transparent}}
@media (prefers-reduced-motion:reduce){.fx-hit{animation:none}}
.fx #vx{border-bottom-color:rgba(35,32,28,.16)}
.fx #vx h2,.fx #vx small{color:#7a6d52}
.fx #vx label b{color:#a8331f}
.fx #vx input{color:#23201c;border-bottom-color:rgba(35,32,28,.35)}
.fx #vx input::placeholder{color:#8a7d63}
.fx #vx input:focus{border-bottom-color:#a8331f}
@media (max-width:1000px){#nav.fx-nav{position:static;width:auto;border-right:0;border-bottom:1px solid rgba(35,32,28,.16)}.fx #doc{margin-left:0;padding:28px 18px 100vh}}
@media print{#fxBack,.fx-up,.fx-back{display:none!important}.fx #doc{margin:0;padding:0}.fx-paper .pg-bg{display:none}.fx-body.pg-body{zoom:1!important}}
`;

/** 不分頁的一張的腳本：本文配合視窗放大、紙色漸層、「↑ 回到目錄」、跳過去之後的「↩ 返回」 */
const flowJs = (up: Record<string, [string, string]>, bodyMm: number) => {
  const json = (x: unknown) => JSON.stringify(x).replace(/</g, '\\u003c');
  return `(function(){
var F=${json(EXPORT_TEXT_FLOW)},UP=${json(up)},stack=[],btn=document.getElementById('fxBack');
var BODY=document.querySelector('.fx-body'),DOC=document.getElementById('doc');
function fit(){if(!BODY||!DOC)return;var avail=DOC.clientWidth-64;var z=Math.max(1,Math.min(1.5,avail*0.94/(${fnum(bodyMm)}*96/25.4)));BODY.style.zoom=z.toFixed(3);}
fit();addEventListener('resize',fit);
var PAPER=document.querySelector('.fx-paper[data-grad]');
function paint(){
  if(!PAPER)return;var ms=[].slice.call(document.querySelectorAll('.fx-body [data-pc]'));if(!ms.length)return;
  var top=PAPER.getBoundingClientRect().top,H=PAPER.scrollHeight;
  var ys=ms.map(function(m){return m.getBoundingClientRect().top-top;});
  var end=BODY.getBoundingClientRect().bottom-top;
  var st=['linear-gradient(to bottom',ms[0].getAttribute('data-pc')+' 0px'];
  ms.forEach(function(m,k){var a=ys[k],b=(k+1<ys.length)?ys[k+1]:end;st.push(m.getAttribute('data-pc')+' '+Math.round((a+b)/2)+'px');});
  st.push(ms[ms.length-1].getAttribute('data-pc')+' '+Math.max(H,end)+'px');
  PAPER.style.background=st.join(',')+')';
}
paint();addEventListener('resize',paint);addEventListener('load',paint);
Object.keys(UP).forEach(function(id){
  var el=document.getElementById('b'+id);if(!el)return;
  if(!el.getAttribute('data-h'))el.setAttribute('data-h',el.textContent.trim());
  var a=document.createElement('a');a.className='fx-up';a.href='#b'+UP[id][0];a.textContent=UP[id][1];el.appendChild(a);
});
function here(){
  var hs=document.querySelectorAll('.fx-body .t-title[id],.fx-body .t-h1[id],.fx-body .t-h2[id],.fx-body .t-h3[id],.fx-body .t-scene[id]'),lb='';
  for(var i=0;i<hs.length;i++){if(hs[i].getBoundingClientRect().top<=120)lb=hs[i].getAttribute('data-h')||hs[i].textContent.trim();}
  lb=lb||F.start;return lb.length>12?lb.slice(0,12)+'\u2026':lb;
}
function show(){btn.classList.toggle('on',stack.length>0);if(stack.length)btn.querySelector('small').textContent='\uff08'+stack[stack.length-1].lb+'\uff09';}
function flash(el){var h=el.closest('.bp')||el;h.classList.remove('fx-hit');void h.offsetWidth;h.classList.add('fx-hit');}
function jump(id){var el=document.getElementById(id);if(!el)return;stack.push({y:scrollY,lb:here()});if(stack.length>50)stack.shift();el.scrollIntoView({block:'start'});flash(el);show();}
function back(fb){var s=stack.pop();if(s)scrollTo(0,s.y);else if(fb){var r=document.querySelector('[data-popopen="'+fb+'"]');if(r){r.scrollIntoView({block:'center'});flash(r);}}show();}
document.addEventListener('click',function(e){
  var t=e.target;if(!t||!t.closest)return;
  var bk=t.closest('[data-back]');if(bk){e.preventDefault();back(bk.getAttribute('data-back'));return;}
  if(t.closest('#fxBack')){back();return;}
  if(t.closest('[data-popopen],[data-popmake],.fwin'))return;
  var a=t.closest('a[href^="#"]');
  if(a&&a.getAttribute('href').length>1){e.preventDefault();var h=a.getAttribute('href').slice(1),id=h;try{id=decodeURIComponent(h);}catch(er){}jump(document.getElementById(id)?id:h);}
});
})();`;
};

/** 不分頁的一張的本文：範圍內每一頁的段落接成一串（不換頁、不換欄、不分欄、沒有頁尾） */
function flowBodyHtml(
  ctx: RenderCtx,
  pages: readonly (readonly string[])[],
  a: number,
  b: number,
  byId: Map<string, Block>,
): string {
  const doc = ctx.doc;
  let prev: string | null = null;
  let topDone = false;
  let out = '';
  for (let i = a; i <= b; i++) {
    if (ctx.links) ctx.links.page = i;
    let h = '';
    for (const id of pages[i] ?? []) {
      const x = byId.get(id);
      if (!x || x.type === 'break' || x.type === 'colbr') continue;
      const k = spKey(x) ?? x.type;
      const pull = gapPull(prev, k);
      prev = k;
      h += blockHtml(x, ctx, { cols: 1, pull, top: !topDone });
      topDone = true;
    }
    /* 這頁的頁面圖片：這頁的段落包在一個框裡（原點＝本文的開頭），框至少高到圖片的下緣 */
    const onPg = pimgsOn(doc, i, pages.length);
    if (onPg.length) {
      const minH = Math.max(
        ...onPg.map((o) => {
          const bx = pimgBox(o, doc);
          return Math.max(0, bx.y - doc.padV) + bx.h;
        }),
      );
      h = `<div class="fx-pg" style="min-height:${fnum(minH)}mm">${shapesHtml(pimgShapes(onPg, doc, 1, true), true)}${h}${onPg.map((o) => pimgFlowHtml(o, doc)).join('')}</div>`;
    }
    /* 每一頁開頭的段落記下那一頁的紙色（紙色不同時用漸層連起來） */
    if (h) h = h.replace('<div', `<div data-pc="${pagePaper(pageSettingAt(doc, i).bg)}"`);
    out += h;
  }
  if (ctx.links) ctx.links.page = -1;
  return out;
}

/** 不分頁的一張的書末：每個有內容的彈出視窗一節（名稱是標題 2＋「↩ 回到本文」） */
function flowAppendixHtml(ctx: RenderCtx, all: readonly Block[]): string {
  const list = popupsWithContent(all);
  if (!list.length) return '';
  const view = varView(ctx.doc);
  let h = `<section class="fx-appx"><div class="bp bp-h1 span"><div class="b t-h1" id="appx">${EXPORT_TEXT_FLOW.appendix}</div></div>`;
  for (const p of list) {
    const id = esc(p.id);
    const label = p.pop?.label || POPUP_DEFAULT_LABEL;
    h += `<div class="fx-pop" id="fxp${id}"><div class="bp bp-h2"><div class="b t-h2" id="apx${id}" data-h="${esc(label)}">${wrapVarsHtml(esc(label), view)}<a class="fx-back" href="#" data-back="${id}">${EXPORT_TEXT_FLOW.backToBody}</a></div></div>`;
    if (popIsBlocks(p)) {
      let prev: string | null = 'h2';
      for (const x of (p.pop?.blocks ?? []).filter(
        (y) => y.type !== 'break' && y.type !== 'colbr',
      )) {
        const k = spKey(x) ?? x.type;
        h += blockHtml(x, ctx, { cols: 1, pull: gapPull(prev, k), top: false });
        prev = k;
      }
    } else
      h += `<div class="bp bp-desc"><div class="b t-desc" style="white-space:normal">${popupContentHtml(p.pop, ctx)}</div></div>`;
    h += '</div>';
  }
  return `${h}</section>`;
}

/** 標題 → 收錄它的目錄（「↑ 回到目錄」連到的目錄；範圍內的目錄，章目錄優先，同原作） */
export function flowUpMap(
  doc: Doc,
  inRange: (id: string) => boolean,
  pageOf: (id: string) => number | null,
): Record<string, [string, string]> {
  const up: Record<string, [string, string]> = {};
  for (const tb of doc.blocks) {
    if (tb.type !== 'toc' || !inRange(tb.id)) continue;
    const ch = tocOf(tb).scope === 'chapter';
    for (const x of tocEntriesFor(tb, doc.blocks, pageOf)) {
      if (!inRange(x.id)) continue;
      if (up[x.id] && !ch) continue;
      up[x.id] = [tb.id, ch ? EXPORT_TEXT_FLOW.upChapter : EXPORT_TEXT_FLOW.upToc];
    }
  }
  return up;
}

/** 閱覽頁的腳本：沒有用到 2026-10 的功能時與以前完全相同 */
export function viewScript(o: {
  vars: readonly VarItem[] | null;
  key: string;
  copy: boolean;
}): string {
  let js = SCRIPT;
  const sub = (a: string, b: string) => {
    if (!js.includes(a)) throw new Error(`viewScript: ${a}`);
    js = js.replace(a, b);
  };
  if (o.vars?.length) sub('copyText(d.textContent);', 'copyText(VT(d.textContent));');
  if (o.copy)
    sub("  var cb=t.closest('.copybtn');", `${COPY_CLICK}  var cb=t.closest('.copybtn');`);
  const tail =
    (o.copy ? copyJs(!!o.vars?.length) : '') + (o.vars?.length ? varJs(o.vars, o.key) : '');
  if (tail)
    sub(
      "setTocMask(load('trpg-tocmask')!=='0');\n",
      `setTocMask(load('trpg-tocmask')!=='0');\n${tail}`,
    );
  return js;
}

/** 閱覽 HTML 的全文 */
export function exportHtml({ doc, pages, from, to, flow = false }: ExportInput): string {
  const total = pages.length;
  const a = Math.max(0, Math.min(total - 1, from));
  const b = Math.max(a, Math.min(total - 1, to));
  const pageNo = new Map<string, number>();
  pages.forEach((ids, i) => {
    for (const id of ids) pageNo.set(id, i + 1);
  });
  const all = allBlocks(doc);
  const ctx: RenderCtx = {
    doc,
    edit: false,
    pageOf: (id) => pageNo.get(id) ?? null,
    total,
    anchors: true,
    copyButtons: true,
    /* 列印用的「→ 附錄」「↩ 回到」、場景轉換連到範圍內的標題（F269、F270） */
    links: newPrintLinks(doc, all, (id) => {
      const p = pageNo.get(id);
      return p != null && p >= a + 1 && p <= b + 1;
    }),
  };
  const byId = new Map<string, Block>(all.map((x) => [x.id, x]));
  let body = '';
  if (!flow)
    for (let i = a; i <= b; i++)
      body += `<div class="pagebox">${staticPageHtml(i, pages[i] ?? [], ctx, byId)}</div>\n`;
  const appx = flow ? '' : appendixHtml(ctx, all);
  const navItem = (href: string, lv: number, text: string, page: number | null) =>
    `<a class="nv l${lv}" href="#${esc(href)}"><span class="nvt" data-t="${esc(text)}">${esc(maskText(text))}</span>${page != null ? `<i>${page}</i>` : ''}</a>`;
  let nav = tocEntries(doc.blocks, ctx.pageOf)
    .filter((x) => x.page >= a + 1 && x.page <= b + 1)
    .map((x) => navItem(`b${x.id}`, x.lv, x.text, x.page))
    .join('');
  const view = varView(doc);
  const vars = view?.list ?? [];
  /*
   * 浮動視窗的內容（按下按鈕時複製一份放進視窗；F268）：視窗裡沒有「→ 附錄」，
   * 標題也不加錨點（附錄裡的才有，id 不重複；7.5 的 S4）
   */
  const winCtx: RenderCtx = { ...ctx, links: undefined, anchors: false };
  const popData = popupsWithContent(all)
    .map(
      (p) =>
        `<div class="popbody" id="pop${esc(p.id)}" hidden><div class="pw-t">${wrapVarsHtml(esc(p.pop?.label || '詳細'), view)}</div><div class="pw-b">${popupContentHtml(p.pop, winCtx)}</div></div>`,
    )
    .join('');
  const copy = all.some(copiesBody);
  const dataBits = all
    .map((x) => {
      if (x.type === 'info' || x.type === 'handout')
        return `<script type="text/plain" class="outdata" id="cp${esc(x.id)}">${scriptSafe(copyBodyText(x))}</script>`;
      /* 「按一下複製」的特殊區塊：裡面的段落的文字也複製（第三批，上游 v3.25.0） */
      if (x.type === 'proc' && copiesBody(x))
        return `<script type="text/plain" class="outdata" id="cp${esc(x.id)}">${scriptSafe(procCopyText(x))}</script>`;
      if (x.type === 'table' && x.tbl)
        return `<script type="text/plain" class="outdata" id="out${esc(x.id)}">${scriptSafe(exportOutText(x.tbl))}</script>`;
      if (x.type === 'npc' && x.npc)
        return `<script type="text/plain" class="outdata" id="ccf${esc(x.id)}">${scriptSafe(ccfoliaText(x.npc))}</script>`;
      return '';
    })
    .join('');
  const cmtData = all
    .flatMap((x) =>
      blockComments(x).map(
        (c, i) =>
          `<script type="text/plain" class="outdata" id="cm${esc(x.id)}-${i}">${scriptSafe(c.t)}</script>`,
      ),
    )
    .join('');
  const title = doc.title || EXPORT_TEXT.untitled;
  const varPanel = vars.length
    ? `<div id="vx"><h2>${EXPORT_TEXT_VARS.vars}</h2>${vars
        .map((v, i) => {
          const note = v.note.trim();
          return `<label><b>${esc(v.n)}</b><input type="text" data-v="${esc(v.n)}" placeholder="${esc(varShown(v))}" autocomplete="off"${note ? ` aria-describedby="vxn${i}"` : ''}></label>${note ? `<small id="vxn${i}">${esc(note)}</small>` : ''}`;
        })
        .join('')}</div>`
    : '';
  const fontLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${esc(googleFontCssUrl('Noto Serif TC', [400, 600, 700]))}">`;
  const script = viewScript({
    vars: vars.length ? vars : null,
    key: VARS_KEY_PREFIX + (doc.title || ''),
    copy,
  });
  const navHtml = (cls: string) =>
    `<nav id="nav"${cls}><h1>${wrapVarsHtml(esc(doc.title || EXPORT_TEXT.toc), view)}</h1>${varPanel}<button id="tocMask" type="button">${EXPORT_TEXT.showHeads}</button>${nav}</nav>`;
  let main: string;
  let flowTail = '';
  if (flow) {
    /* 不分頁的一張（F285）：目錄的最後列出附錄的各節 */
    const pops = popupsWithContent(all);
    if (pops.length)
      nav +=
        navItem('appx', 1, EXPORT_TEXT_FLOW.appendix, null) +
        pops
          .map((p) => navItem(`fxp${p.id}`, 2, p.pop?.label || POPUP_DEFAULT_LABEL, null))
          .join('');
    const idx: number[] = [];
    for (let i = a; i <= b; i++) idx.push(i);
    /* 背景花紋：範圍內最多頁用的那一種；紙色都一樣時用那個顏色，不一樣時用漸層連起來 */
    const count = new Map<string, number>();
    for (const i of idx) {
      const k = pageSettingAt(doc, i).bg.preset || 'none';
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    const top = [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'none';
    const cls = bgClass({ id: '', cols: 1, bg: { preset: top, img: null, fit: 'cover', opa: 35 } });
    const pcs = idx.map((i) => pagePaper(pageSettingAt(doc, i).bg));
    const grad = pcs.some((c) => c !== pcs[0]);
    const bodyMm = bodyWidthMm(doc);
    const inRange = (id: string) => {
      const p = pageNo.get(id);
      return p != null && p >= a + 1 && p <= b + 1;
    };
    main =
      `<div class="pg fx-paper${cls ? ` ${cls}` : ''}" style="--paper:${pcs[0]}"${grad ? ' data-grad="1"' : ''}><div class="pg-bg${cls ? ` ${cls}` : ''}"></div>${navHtml(' class="fx-nav"')}` +
      `<main id="doc"><div class="pg-body fx-body" style="font-size:${doc.base}pt;max-width:${fnum(bodyMm)}mm">${flowBodyHtml(ctx, pages, a, b, byId)}${flowAppendixHtml(ctx, all)}</div></main></div>` +
      `<button id="fxBack" type="button">${EXPORT_TEXT_FLOW.back}<small></small></button>`;
    flowTail = `<script>${flowJs(flowUpMap(doc, inRange, ctx.pageOf), bodyMm)}</script>`;
  } else
    main = `${navHtml('')}<main id="doc">${body}${appx ? `<div class="pagebox appx">${appx}</div>` : ''}</main>`;
  return (
    `<!DOCTYPE html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${fontLink}` +
    `<style>${PAPER_CSS}\n${fontCss(doc)}\n${VIEW_CSS}${vars.length ? VAR_CSS : ''}${copy ? COPY_CSS : ''}${flow ? FLOW_CSS : ''}</style></head><body class="tocmask${flow ? ' fx' : ''}">` +
    `<button id="tocBtn" type="button" title="${EXPORT_TEXT.hideToc}" aria-label="${EXPORT_TEXT.hideToc}"><i></i><i></i><i></i></button>` +
    main +
    `<div id="cmtRail"></div>${popData}${dataBits}${cmtData}${copy ? '<div id="cpToast" role="status" aria-live="polite"></div>' : ''}<script>${script}</script>${flowTail}</body></html>`
  );
}
