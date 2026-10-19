/**
 * 閱覽 HTML（3.9、F232）：範圍內的頁面＋左側目錄（可遮住標題、可收起）＋附錄＋彈出視窗、註解、複製按鈕、嵌入的字型；
 * 2026-10：登場人物（變數）欄與全文替換（F258）、情報區塊與手冊按一下複製（F259）。
 * 純字串（不依賴 DOM），方便測試。
 */
import { googleFontCssUrl } from '@/core/fonts';
import { allBlocks } from './model/blocks';
import { copyBodyText } from './model/count';
import { ccfoliaText } from './model/npc/ccfolia';
import { exportOutText } from './model/table';
import { blockComments, escapeHtml as esc } from './model/text';
import { tocEntries } from './model/toc';
import type { Block, Doc } from './model/types';
import { type VarItem, varShown, varView, wrapVarsHtml } from './model/vars';
import {
  appendixHtml,
  popupContentHtml,
  popupsWithContent,
  type RenderCtx,
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
  note: '註解',
  copied: '已複製',
  noContent: '（沒有內容）',
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
#popOv{position:fixed;inset:0;background:rgba(0,0,0,.66);display:none;align-items:center;justify-content:center;padding:20px;z-index:50}
#popOv.on{display:flex}
#popWrap{position:relative;display:flex;flex-direction:column;align-items:flex-end;gap:6px;max-width:min(820px,94vw)}
#popBox{background:#fbf7ef;color:#23201c;border-radius:8px;width:min(820px,94vw);box-sizing:border-box;max-height:80vh;overflow:auto;padding:22px 26px;box-shadow:0 8px 40px rgba(0,0,0,.5);line-height:1.9;font-size:14px;font-family:"Noto Serif TC",serif}
#popBox h3{margin:0 0 12px;color:#a8331f;font-size:16px;letter-spacing:.08em}
#popX{flex:0 0 auto;border:0;background:#23201c;color:#f7f3ea;border-radius:4px;padding:5px 14px;cursor:pointer;font:inherit;font-size:12px;opacity:.9}
#popX:hover{opacity:1;background:#a8331f}
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
@media (max-width:1200px){#cmtRail{right:8px;width:200px}}
@media (max-width:1000px){#nav{position:static;width:auto;height:auto;bottom:auto}#doc{margin-left:0;overflow-x:auto;align-items:flex-start}}
@media print{#nav,#tocBtn,#popOv,.copybtn,#cmtRail{display:none!important}#doc{margin:0;padding:0;display:block}.pagebox{margin:0}.pg{box-shadow:none}.appx{display:block}.cmt{border-bottom:0}.cmt-n{display:none}@page{size:A4;margin:0}}
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

/** 情報區塊、手冊按一下複製（F259） */
const COPY_CSS = `
.t-info,.t-handout{cursor:copy;transition:box-shadow .12s}
.t-info:hover,.t-handout:hover,.t-info:focus-visible,.t-handout:focus-visible{box-shadow:0 0 0 2px rgba(211,165,52,.55);outline:0}
#cpToast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:60;background:#23201c;color:#f7f3ea;border-radius:999px;padding:7px 16px;font:13px system-ui,sans-serif;opacity:0;pointer-events:none;transition:opacity .2s}
#cpToast.on{opacity:1}
@media print{#cpToast{display:none!important}}
`;

const SCRIPT = `(function(){
var T=${JSON.stringify(EXPORT_TEXT)};
var ov=document.getElementById('popOv'),inn=document.getElementById('popIn');
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
  if(pb&&ov){var src=document.getElementById('pop'+pb.getAttribute('data-popopen'));inn.innerHTML=src?src.innerHTML:'<p>'+T.noContent+'</p>';ov.classList.add('on');return;}
  var pm=t.closest('[data-popmake]');
  if(pm&&ov){inn.innerHTML='<p>'+T.noContent+'</p>';ov.classList.add('on');return;}
  if(t.id==='popOv'||t.id==='popX'){ov.classList.remove('on');return;}
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
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&ov)ov.classList.remove('on');});
if(load('trpg-notoc')==='1')setNoToc(true);
setTocMask(load('trpg-tocmask')!=='0');
})();`;

/** 按一下情報區塊、手冊時（比對註解之後、複製按鈕之前） */
const COPY_CLICK = `  var cp=t.closest('.t-info,.t-handout');
  if(cp&&!t.closest('a,button,input')&&!String(window.getSelection?window.getSelection():'').trim()){copyBlock(cp);return;}
`;

const copyJs = (
  vars: boolean,
) => `var CT=${JSON.stringify(EXPORT_TEXT_VARS.copiedBody)},toast=document.getElementById('cpToast'),toastT=0;
function copyBlock(el){var pad=el.closest('[data-id]');var src=pad&&document.getElementById('cp'+pad.getAttribute('data-id'));if(!src)return;
  copyText(${vars ? 'VT(src.textContent)' : 'src.textContent'});
  if(toast){toast.textContent=CT;toast.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){toast.classList.remove('on');},1400);}}
document.addEventListener('keydown',function(e){if(e.key!=='Enter'&&e.key!==' ')return;var t=e.target;if(!t||!t.classList||!(t.classList.contains('t-info')||t.classList.contains('t-handout')))return;e.preventDefault();copyBlock(t);});
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
export function exportHtml({ doc, pages, from, to }: ExportInput): string {
  const total = pages.length;
  const a = Math.max(0, Math.min(total - 1, from));
  const b = Math.max(a, Math.min(total - 1, to));
  const pageNo = new Map<string, number>();
  pages.forEach((ids, i) => {
    for (const id of ids) pageNo.set(id, i + 1);
  });
  const ctx: RenderCtx = {
    doc,
    edit: false,
    pageOf: (id) => pageNo.get(id) ?? null,
    total,
    anchors: true,
    copyButtons: true,
  };
  const all = allBlocks(doc);
  const byId = new Map<string, Block>(all.map((x) => [x.id, x]));
  let body = '';
  for (let i = a; i <= b; i++)
    body += `<div class="pagebox">${staticPageHtml(i, pages[i] ?? [], ctx, byId)}</div>\n`;
  const appx = appendixHtml(ctx, all);
  const nav = tocEntries(doc.blocks, ctx.pageOf)
    .filter((x) => x.page >= a + 1 && x.page <= b + 1)
    .map(
      (x) =>
        `<a class="nv l${x.lv}" href="#b${esc(x.id)}"><span class="nvt" data-t="${esc(x.text)}">${esc(maskText(x.text))}</span><i>${x.page}</i></a>`,
    )
    .join('');
  const view = varView(doc);
  const vars = view?.list ?? [];
  const popData = popupsWithContent(all)
    .map(
      (p) =>
        `<div class="popbody" id="pop${esc(p.id)}" hidden><h3>${wrapVarsHtml(esc(p.pop?.label || '詳細'), view)}</h3>${popupContentHtml(p.pop, ctx)}</div>`,
    )
    .join('');
  const copy = all.some((x) => x.type === 'info' || x.type === 'handout');
  const dataBits = all
    .map((x) => {
      if (x.type === 'info' || x.type === 'handout')
        return `<script type="text/plain" class="outdata" id="cp${esc(x.id)}">${scriptSafe(copyBodyText(x))}</script>`;
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
  return (
    `<!DOCTYPE html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${fontLink}` +
    `<style>${PAPER_CSS}\n${fontCss(doc)}\n${VIEW_CSS}${vars.length ? VAR_CSS : ''}${copy ? COPY_CSS : ''}</style></head><body class="tocmask">` +
    `<button id="tocBtn" type="button" title="${EXPORT_TEXT.hideToc}" aria-label="${EXPORT_TEXT.hideToc}"><i></i><i></i><i></i></button>` +
    `<nav id="nav"><h1>${wrapVarsHtml(esc(doc.title || EXPORT_TEXT.toc), view)}</h1>${varPanel}<button id="tocMask" type="button">${EXPORT_TEXT.showHeads}</button>${nav}</nav>` +
    `<main id="doc">${body}${appx ? `<div class="pagebox appx">${appx}</div>` : ''}</main>` +
    `<div id="popOv"><div id="popWrap"><button id="popX" type="button">${EXPORT_TEXT.close}</button><div id="popBox"><div id="popIn"></div></div></div></div>` +
    `<div id="cmtRail"></div>${popData}${dataBits}${cmtData}${copy ? '<div id="cpToast" role="status" aria-live="polite"></div>' : ''}<script>${viewScript({ vars: vars.length ? vars : null, key: VARS_KEY_PREFIX + (doc.title || ''), copy })}</script></body></html>`
  );
}
