/* CoC 劇本排版工具（TRPG Toolkit 收錄版）
 * 上游：https://scenario-tool-jade.vercel.app/coc-typesetter.html（作者不明、未附授權，見 ATTRIBUTION.md）。
 * 收錄版只有繁體中文：介面、說明、語法記號（===換頁===、封面欄位「標題／副標題／作者」、理智檢定的寫法）
 * 與避頭尾標點都改成中文，版面字型換成 Noto Serif TC／Noto Sans TC，範例劇本另寫。 */
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* 內文與設定存在這個 key；收錄版沒有上游 v1 的舊資料可以搬，搬移的程式拿掉了。 */
const STORE_KEY='coc-typesetter:v2';
const UI_KEY='coc-typesetter:ui';   // 手機版的收合狀態，和內文的存檔分開放
const PAPER={A5:[148,210],B5:[182,257],A4:[210,297]};
const THEME_NAME={mono:'黑白（節省印刷成本）',shinkai:'深海（銅綠）',aishu:'藍與朱'};
const DEFAULT_LABEL={kp:'KP 資訊',pl:'公開資訊',note:'補充',warn:'注意'};
const COVER_KEYS=['標題','副標題','作者'];

// 新建時預先準備的概要項目（值是空的）
const BLANK_KEYS=['規則版本','建議人數','遊玩時間','建議技能','撕卡率'];
const blankMeta=()=>({title:'',subtitle:'',author:'',items:BLANK_KEYS.map(key=>({key,value:''}))});

/* 範例劇本（TRPG Toolkit 另寫的原創內容，不是上游的範例） */
const SAMPLE_META={
  title:'不存在的四樓', subtitle:'克蘇魯神話 TRPG 劇本', author:'範例作者',
  items:[
    {key:'規則版本',value:'新克蘇魯神話 TRPG（CoC 7 版）'},
    {key:'建議人數',value:'2～4 人'},
    {key:'遊玩時間',value:'語音團約 3 小時'},
    {key:'撕卡率',value:'中'},
    {key:'建議技能',value:'【偵查】【圖書館使用】【聆聽】【說服】'},
    {key:'舞台',value:'現代台灣・台中的老公寓'}
  ]
};
const SAMPLE_TEXT=`## 前言

本劇本以台中一棟屋齡四十年的老公寓為舞台，是一篇短篇的都市探索劇本。
戰鬥的機會不多，重點在於蒐集線索，查出電梯為什麼會停在「不存在的樓層」。

:::warn
本劇本含有密閉空間、失蹤與身體異變的描寫。
若有參加者對這類題材感到不適，請在開團前先行溝通。
:::

:::note 標記說明
【技能名】代表檢定使用的技能，SANc（成功時/失敗時）代表理智檢定。
:::

## 劇本概要

:::kp 真相
長青大廈是建築師邱文德在 1985 年設計的作品。他晚年沉迷於一份來路不明的手稿，相信「只要角度夠多，就能在樓與樓之間多蓋出一層」。
大廈的三樓與五樓之間確實存在一個夾層，裡面每個牆角都是銳角。某種東西正從那些角落一點一點地滲進我們的世界。
深夜兩點過後，電梯偶爾會把乘客送到這一層。管理員王志明知道這件事，十年來一直用「電梯維修」的告示掩蓋。
:::

調查員因為朋友失聯而來到長青大廈。可以探索的地點有以下三處：

- 一樓管理室（有監視器畫面與住戶名冊）
- 都發局檔案室（可以調閱大廈的建築圖）
- 大廈的電梯（通往真相）

## 導入

調查員的朋友張雅婷住在長青大廈五樓，三天前傳來一張照片後就失去聯絡。照片裡是一條昏暗的走廊，電梯的樓層顯示寫著「4」。

> 長青大廈夾在兩棟新大樓之間，外牆的磁磚掉了好幾塊。
> 一樓大廳的日光燈閃個不停，電梯門上貼著一張泛黃的告示：「夜間維修，請改走樓梯」。
> 電梯按鈕從 1 排到 12，中間沒有 4。

:::pl 資料卡：住戶群組的公告
「各位住戶好，近日有人反映電梯半夜會停在三樓和五樓之間，
管理室已請廠商檢修，深夜請盡量改走樓梯。——管理委員會」
:::

===換頁===

## 探索

### 一樓管理室

大廳旁的小房間，桌上堆滿包裹，牆上掛著十六格的監視器螢幕。

> 管理員王志明戴著老花眼鏡，正在看電視上的政論節目。
> 看見調查員走進來，他下意識地把一本筆記本塞進抽屜。

▼【說服】或【話術】成功
王志明嘆了口氣，承認電梯的「維修」已經持續了十年。「那一層……進去過的人，出來以後就不太一樣了。」

▼【偵查】成功
在三天前凌晨 2 時 14 分的監視器畫面裡，看到雅婷走進電梯。樓層顯示從 3 跳到 5，中間卻停了整整四分鐘。

### 都發局檔案室

市府大樓地下室的檔案室，要先填申請單才能調閱資料。

▼【圖書館使用】成功
調出長青大廈的原始建築圖。圖上的三樓與五樓之間，用鉛筆淡淡地多畫了一層，所有房間的角都小於九十度。
看懂這張圖的調查員進行 SANc（0/1d3）。

:::note
【圖書館使用】失敗時，可以改用【信用評級】或【說服】請承辦人員協助，但要等到隔天早上才拿得到資料。
:::

### 大廈的電梯

老舊的電梯只能載六個人，運轉時會發出沉悶的金屬摩擦聲。

> 凌晨兩點十四分，電梯在三樓與五樓之間停了下來。
> 門打開，外面是一條你從沒見過的走廊。牆壁與天花板相接的地方，角度怎麼看都不對勁。

▼【聆聽】成功
聽見走廊深處有人在叫你的名字。那是雅婷的聲音，但每個字都像是從很窄的縫隙裡擠出來的。

▼【偵查】失敗
沒注意到腳邊的牆角正在滲出藍灰色的黏液，黏液碰到鞋尖的瞬間，一陣寒意直竄背脊。SANc（1/1d4）。

:::kp 找到雅婷
雅婷縮在走廊盡頭的房間裡，半邊身體已經沾滿黏液。調查員若【急救】成功，就能扶著她離開。
失敗的話，雅婷會拒絕離開，只是一直盯著房間的角落，此時進入「結局 B」。
:::

### NPC 資料

**王志明　52 歲・大廈管理員**

| STR | CON | POW | DEX | APP | SIZ | INT | EDU |
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 55 | 60 | 45 | 50 | 45 | 65 | 60 | 55 |

| HP | MP | 理智 | 主要技能 |
|:-:|:-:|:-:|---|
| 12 | 9 | 35 | 【機械維修】60％、【偵查】50％、【話術】45％ |

## 結局

### 結局 A：只剩十二層

救出雅婷，並拆掉電梯控制盤裡那顆沒有標示的按鈕時。

> 電梯發出一聲長長的嘆息，指示燈從 3 直接跳到 5。
> 隔天早上，大廳的告示被撕掉了，日光燈也不再閃爍。

生還獎勵：回復 1d6 點理智。

### 結局 B：第四層還在

沒能帶走雅婷時。調查員離開了長青大廈，但此後無論搭哪裡的電梯，偶爾都會停在不存在的樓層。

生還獎勵：回復 1d3 點理智。此後每次在深夜搭電梯，都要進行 SANc（0/1）。

## 怪物資料

### 角落裡的東西

| 項目 | 內容 |
|---|---|
| 理智喪失 | 看見它從牆角滲出時 SANc（1/1d6） |
| 攻擊 | 觸碰（1d4 傷害，目標的 CON 暫時減少 5） |
| 備註 | 只能從小於九十度的角落出現，無法進入圓形的空間 |
`;

/* ⟦ ⟧ 包住的是暫定文字，插入後會呈選取狀態，直接打字就能取代 */
const SNIPS={
  h2:'## ⟦章節名稱⟧\n',
  h3:'### ⟦探索地點名稱⟧\n',
  desc:'> ⟦寫下要唸給 PL 聽的描述。⟧\n',
  judge:'▼【⟦偵查⟧】成功\n寫下成功時得到的情報。\n',
  kp:':::kp\n⟦寫下只有 KP 知道的資訊。⟧\n:::\n',
  pl:':::pl 資料卡\n⟦寫下要公開給 PL 的資訊。⟧\n:::\n',
  note:':::note\n⟦寫下補充說明。⟧\n:::\n',
  warn:':::warn\n⟦寫下注意事項。⟧\n:::\n',
  table:'**⟦NPC 名稱⟧（年齡・職業）**\n\n| STR | CON | POW | DEX | APP | SIZ | INT | EDU |\n|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|\n| 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 |\n\n| HP | MP | 理智 | 主要技能 |\n|:-:|:-:|:-:|---|\n| 10 | 10 | 50 | 【偵查】60％、【聆聽】50％ |\n',
  pb:'===換頁===\n',
  san:'SANc（⟦0/1d3⟧）'
};
const INLINE_SNIPS=new Set(['san']);
/* 先選取文字再按按鈕時的包法 */
const WRAP={
  h2:t=>'## '+t.replace(/^\s*#+\s*/,''),
  h3:t=>'### '+t.replace(/^\s*#+\s*/,''),
  desc:t=>t.split('\n').map(l=>'> '+l.replace(/^\s*>\s?/,'')).join('\n'),
  judge:t=>'▼【⟦偵查⟧】成功\n'+t.replace(/\n\s*\n/g,'\n'),
  kp:t=>':::kp\n'+t+'\n:::',
  pl:t=>':::pl\n'+t+'\n:::',
  note:t=>':::note\n'+t+'\n:::',
  warn:t=>':::warn\n'+t+'\n:::',
  san:t=>'SANc（'+t+'）'
};
/* 「/」選單。kw 是篩選用的關鍵字：中文同義詞、英文與拼音都收，輸入法切換不方便時也找得到 */
const MENU=[
  {k:'h2',label:'章標題',hint:'##',c:'#23272b',kw:'chapter h2 zhang 章 章節 標題'},
  {k:'h3',label:'探索點・場景標題',hint:'###',c:'#8a8d90',kw:'scene h3 tansuo 探索 場景 地點 小標'},
  {k:'desc',label:'描述（朗讀）',hint:'>',c:'#8aa3c6',kw:'desc miaoshu 描述 描寫 朗讀 旁白'},
  {k:'judge',label:'檢定',hint:'▼',c:'#e3a55a',kw:'judge check jianding 檢定 判定 擲骰'},
  {k:'kp',label:'KP 資訊',hint:':::kp',c:'#a892c9',kw:'kp keeper 守秘人 主持人 資訊'},
  {k:'pl',label:'公開資訊・資料卡',hint:':::pl',c:'#6fa89f',kw:'pl handout ho 公開 資料卡 手札'},
  {k:'note',label:'補充',hint:':::note',c:'#c2bdb3',kw:'note buchong 補充 備註 說明'},
  {k:'warn',label:'注意',hint:':::warn',c:'#d9826f',kw:'warn caution zhuyi 注意 警告'},
  {k:'san',label:'理智檢定',hint:'SANc',c:'#e6a191',kw:'san sanc sc lizhi 理智 瘋狂'},
  {k:'table',label:'資料表（NPC）',hint:'| |',c:'#9aa1a6',kw:'table npc data 資料 表格 數值'},
  {k:'pb',label:'換頁',hint:'===',c:'#c9ccce',kw:'pb page break huanye 換頁 分頁'}
];

/* ============ 狀態與存檔 ============ */
const S={paper:'A5',theme:'mono',cover:true,toc:true,chapter:true,header:true,zoom:'auto'};
let M={title:'',subtitle:'',author:'',items:[]};
const ta=()=>$('#source');

function loadStore(){
  try{ const raw=localStorage.getItem(STORE_KEY); if(raw) return JSON.parse(raw); }catch(e){}
  return null;
}
let saveTimer=null;
function saveStore(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{ try{ localStorage.setItem(STORE_KEY,JSON.stringify({text:ta().value,meta:M,settings:S})); }catch(e){} },300);
}
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove('show'),2600);
}

/* ============ 解析語法 ============ */
const RE_BOX_OPEN=/^:::\s*(kp|pl|note|warn)(?:\s+(.*))?$/i;
const RE_BOX_CLOSE=/^:::\s*$/;
const RE_PB=/^\s*=+\s*換頁\s*=+\s*$/;
const RE_JUDGE=/^\s*▼/;
const RE_DESC=/^\s*>/;
const RE_STRUCT=/^\s*(#{1,6}\s|▼|:::|>|=+\s*換頁)/;
const RE_FENCE=/^\s*(```|~~~)/;
const RE_SKILL_SRC='【[^【】\\n]{1,40}】';
// 理智檢定的寫法：SANc（0/1d3）、SAN 檢定(1/1d6)、SAN值檢定、SC（0/1）、理智檢定（0/1）
const RE_SAN_SRC='(?:SAN(?:值)?\\s*(?:檢定|[cC]heck|[cC])|(?<![A-Za-z])SC|理智檢定)\\s*[（(][^（）()\\n]{1,24}[）)]';
const RE_DECO=new RegExp(RE_SKILL_SRC+'|'+RE_SAN_SRC,'g');

// 取出開頭以「---」包住的封面資訊，只在裡面每行都是「項目: 值」時才算
function splitFrontMatter(src){
  const m=src.match(/^﻿?\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if(!m) return null;
  const meta=[];
  for(const line of m[1].split(/\r?\n/)){
    if(!line.trim()) continue;
    const mm=line.match(/^\s*([^:：]+?)\s*[:：]\s*(.*?)\s*$/);
    if(!mm) return null;
    meta.push({key:mm[1],value:mm[2]});
  }
  if(!meta.length) return null;
  return {meta,body:src.slice(m[0].length)};
}

const inline=s=>marked.parseInline(s||'');
const withLine=(html,n)=>html.replace(/^(\s*<[a-zA-Z][\w-]*)/,`$1 data-line="${n}"`);

function mdWithLines(text,start){
  const toks=marked.lexer(text);
  let ln=start, out='';
  for(const tok of toks){
    if(tok.type!=='space'){
      const arr=[tok]; arr.links=toks.links;
      out+=withLine(marked.parser(arr),ln);
    }
    ln+=(tok.raw.match(/\n/g)||[]).length;
  }
  return out;
}

function blocksToHtml(lines,base){
  const out=[]; let buf=[], bufStart=0, fence=false;
  const flush=()=>{ if(buf.join('').trim()) out.push(mdWithLines(buf.join('\n'),base+bufStart)); buf=[]; };
  const push=(i,l)=>{ if(!buf.length) bufStart=i; buf.push(l); };
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(RE_FENCE.test(line)){ fence=!fence; push(i,line); continue; }
    if(fence){ push(i,line); continue; }
    if(RE_PB.test(line)){ flush(); out.push('<div class="pb"></div>'); continue; }
    const bm=line.match(RE_BOX_OPEN);
    if(bm){
      flush();
      const inner=[]; let depth=1, j=i+1;
      for(;j<lines.length;j++){
        if(RE_BOX_OPEN.test(lines[j])) depth++;
        else if(RE_BOX_CLOSE.test(lines[j]) && --depth===0) break;
        inner.push(lines[j]);
      }
      const type=bm[1].toLowerCase();
      const label=(bm[2]||'').trim()||DEFAULT_LABEL[type];
      out.push(`<div class="box box-${type}" data-line="${base+i}"><div class="box-label">${inline(label)}</div><div class="box-body">${blocksToHtml(inner,base+i+1)}</div></div>`);
      i=j; continue;
    }
    if(RE_DESC.test(line)){
      flush();
      const start=i, inner=[];
      while(i<lines.length && RE_DESC.test(lines[i])){ inner.push(lines[i].replace(/^\s*>\s?/,'')); i++; }
      i--;
      out.push(`<div class="desc" data-line="${base+start}"><div class="desc-label">描述</div><div class="desc-body">${marked.parse(inner.join('\n'))}</div></div>`);
      continue;
    }
    if(RE_JUDGE.test(line)){
      flush();
      const head=line.replace(/^\s*▼\s*/,'');
      const inner=[]; let j=i+1;
      for(;j<lines.length;j++){ const l=lines[j]; if(!l.trim()||RE_STRUCT.test(l)) break; inner.push(l); }
      const body=inner.length?`<div class="judge-body">${marked.parse(inner.join('\n'))}</div>`:'';
      out.push(`<div class="judge" data-line="${base+i}"><div class="judge-head"><span class="judge-mark">▼</span><span>${inline(head)}</span></div>${body}</div>`);
      i=j-1;
      continue;
    }
    push(i,line);
  }
  flush();
  return out.join('\n');
}

function decorate(root){
  const tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(tw.nextNode()) nodes.push(tw.currentNode);
  for(const t of nodes){
    if(t.parentElement && t.parentElement.closest('code,pre,.skill,.san')) continue;
    const s=t.data;
    RE_DECO.lastIndex=0;
    if(!RE_DECO.test(s)) continue;
    RE_DECO.lastIndex=0;
    const frag=document.createDocumentFragment();
    let last=0, m;
    while((m=RE_DECO.exec(s))){
      if(m.index>last) frag.append(s.slice(last,m.index));
      const sp=document.createElement('span');
      sp.className=m[0].startsWith('【')?'skill':'san';
      sp.textContent=m[0];
      frag.append(sp);
      last=m.index+m[0].length;
    }
    if(last<s.length) frag.append(s.slice(last));
    t.replaceWith(frag);
  }
}

function toFragment(html){
  const root=document.createElement('div');
  root.innerHTML=DOMPurify.sanitize(html);
  decorate(root);
  return root;
}

function parseDoc(src){
  src=src.replace(/\r\n?/g,'\n');
  const doc={
    title:M.title, subtitle:M.subtitle, author:M.author,
    overview:M.items.filter(x=>x.key.trim()&&x.value.trim()),
    chars:src.replace(/\s/g,'').length
  };
  doc.root=toFragment(blocksToHtml(src.split('\n'),0));
  doc.headings=[];
  let n=0, ch=0;
  doc.root.querySelectorAll('h2,h3').forEach(h=>{
    h.id='sec-'+(++n);
    const item={level:+h.tagName[1],text:h.textContent.trim(),id:h.id,num:''};
    if(item.level===2){ item.num=String(++ch).padStart(2,'0'); h.dataset.num=item.num; }
    doc.headings.push(item);
  });
  return doc;
}

function specHtml(doc){
  if(!doc.overview.length) return '';
  const items=doc.overview.map(x=>{
    const wide=[...x.value].length>16||doc.overview.length===1;
    return `<div class="spec-item${wide?' wide':''}"><dt>${esc(x.key)}</dt><dd>${inline(x.value)}</dd></div>`;
  }).join('');
  return `<dl class="spec">${items}</dl>`;
}
function coverHtml(doc){
  return toFragment(`<div class="cover-inner">
    <div class="cv-top">TRPG SCENARIO</div>
    <div class="cv-main">
      <h1 class="cv-title">${inline(doc.title||'未命名劇本')}</h1>
      ${doc.subtitle?`<div class="cv-sub">${inline(doc.subtitle)}</div>`:''}
      ${doc.author?`<div class="cv-author">${inline(doc.author)}</div>`:''}
    </div>
    ${specHtml(doc)}
  </div>`).innerHTML;
}
function titleBlock(doc){
  return toFragment(`<div class="titleblock">
    <div class="tb-title">${inline(doc.title||'未命名劇本')}</div>
    ${doc.subtitle?`<div class="tb-sub">${inline(doc.subtitle)}</div>`:''}
    ${doc.author?`<div class="tb-author">作者　${inline(doc.author)}</div>`:''}
    ${specHtml(doc)}
  </div>`).firstElementChild;
}
function tocBlocks(doc){
  const out=[];
  const h=document.createElement('h2'); h.className='toc-title'; h.textContent='目錄'; out.push(h);
  for(const x of doc.headings){
    const a=document.createElement('a');
    a.className='toc-item lv'+x.level+(x.level===2?' kwn':'');
    a.href='#'+x.id; a.dataset.target=x.id;
    a.innerHTML='<span class="n"></span><span class="t"></span><span class="pg">00</span>';
    a.querySelector('.n').textContent=x.num;
    a.querySelector('.t').textContent=x.text;
    out.push(a);
  }
  return out;
}

/* ============ 分頁 ============ */
const SPLITTABLE=new Set(['P','UL','OL','LI','DIV','SECTION','TABLE','TBODY','BLOCKQUOTE','STRONG','EM','A','DEL','DL','DD']);
// 避頭尾：切頁時不讓這些標點出現在頁首的行首（NO_START）或上一頁的行尾（NO_END）
const NO_START='、。，．,.・：；:;？！?!－―…‥」』）)】〕］]｝}〉》”’〗〙﹐﹑﹒﹔﹕﹖﹗';
const NO_END='「『（(【〔［[｛{〈《“‘〖〘';
const isKWN=el=>/^H[1-6]$/.test(el.tagName)||el.classList.contains('kwn');
const isAtomic=el=>/^H[1-6]$/.test(el.tagName)||['HR','IMG'].includes(el.tagName)||el.classList.contains('toc-item');
const isAvoid=el=>el.matches('.desc,.box,.judge,table,pre,blockquote,.titleblock');
const isChrome=n=>n.nodeType===1&&n.matches('.box-label,.desc-label,.judge-head,thead,caption');
const meaningful=n=>n.nodeType===3?!!n.data.trim():!isChrome(n);
function isEmptyBlock(el){
  if(['HR','IMG'].includes(el.tagName)) return false;
  return !el.textContent.trim() && !el.querySelector('img,hr');
}
function fits(body){
  const last=body.lastElementChild;
  if(!last) return true;
  return last.getBoundingClientRect().bottom<=body.getBoundingClientRect().bottom+0.5;
}

function splitText(t,dst,body){
  const s=t.data;
  const probe=document.createTextNode('');
  dst.appendChild(probe);
  let lo=0, hi=s.length;
  while(lo<hi){
    const mid=Math.ceil((lo+hi)/2);
    probe.data=s.slice(0,mid);
    if(fits(body)) lo=mid; else hi=mid-1;
  }
  let k=lo;
  while(k>0 && k<s.length && NO_START.includes(s[k])) k--;
  while(k>0 && NO_END.includes(s[k-1])) k--;
  if(k<=0 || !s.slice(0,k).trim()){ probe.remove(); return false; }
  probe.data=s.slice(0,k);
  t.data=s.slice(k).replace(/^\s+/,'');
  markLastLineJustify(dst);
  return true;
}

// 在頁尾被切斷的段落，只讓最後一行左右對齊。
// text-align-last 對 <br> 前一行也有效，所以把最後一個 <br> 之後的內容另外分成一段。
function markLastLineJustify(dst){
  if(dst.tagName!=='P') return;
  const brs=dst.querySelectorAll(':scope>br');
  if(!brs.length){ dst.classList.add('brk'); return; }
  const lastBr=brs[brs.length-1];
  const tail=document.createElement('p');
  tail.className='brk cont';
  while(lastBr.nextSibling) tail.appendChild(lastBr.nextSibling);
  lastBr.remove();
  dst.classList.add('joined');
  dst.after(tail);
}

// 把 src 的子節點盡量搬進 dst，放不下的留在 src。
function fill(src,dst,body){
  let moved=false;
  while(src.firstChild){
    const n=src.firstChild;
    dst.appendChild(n);
    if(fits(body)){ if(meaningful(n)) moved=true; continue; }
    src.insertBefore(n,src.firstChild);
    if(n.nodeType===3){
      if(splitText(n,dst,body)) moved=true;
    }else if(n.nodeType===1 && SPLITTABLE.has(n.tagName) && !isChrome(n)){
      const part=n.cloneNode(false); part.removeAttribute('id');
      dst.appendChild(part);
      const r=fill(n,part,body);
      if(r==='none'){ while(part.lastChild) n.insertBefore(part.lastChild,n.firstChild); part.remove(); }
      else { afterSplit(n,part); moved=true; }
    }
    return moved?'partial':'none';
  }
  return 'all';
}

function afterSplit(rem,part){
  const tag=rem.tagName;
  while(part.lastChild && (part.lastChild.nodeName==='BR'||(part.lastChild.nodeType===3&&!part.lastChild.data.trim()))) part.lastChild.remove();
  if(tag==='P'||tag==='LI'){
    while(rem.firstChild && (rem.firstChild.nodeName==='BR'||(rem.firstChild.nodeType===3&&!rem.firstChild.data.trim()))) rem.firstChild.remove();
    if(rem.firstChild && rem.firstChild.nodeType===3) rem.firstChild.data=rem.firstChild.data.replace(/^\s+/,'');
    rem.classList.add('cont');
  }
  if(tag==='OL'){
    const start=+(rem.getAttribute('start')||1);
    let done=part.querySelectorAll(':scope>li').length;
    if(rem.firstElementChild && rem.firstElementChild.classList.contains('cont')) done--;
    rem.setAttribute('start',start+done);
  }
  if(tag==='TABLE' && !rem.querySelector(':scope>thead')){
    const th=part.querySelector(':scope>thead');
    if(th) rem.prepend(th.cloneNode(true));
  }
  for(const cls of ['box','desc']){
    if(!rem.classList.contains(cls)) continue;
    const sel=':scope>.'+cls+'-label';
    if(!rem.querySelector(sel)){
      const l=part.querySelector(sel);
      if(l){
        const c=l.cloneNode(true);
        if(cls==='box' && !l.dataset.cont){ c.append('（續）'); c.dataset.cont='1'; }
        rem.prepend(c);
      }
    }
  }
  if(rem.classList.contains('judge')||rem.classList.contains('box')||rem.classList.contains('desc')) rem.classList.add('cont');
}

function splitInto(b,body){
  const part=b.cloneNode(false); part.removeAttribute('id');
  body.appendChild(part);
  const r=fill(b,part,body);
  if(r==='none'){
    while(part.lastChild) b.insertBefore(part.lastChild,b.firstChild);
    part.remove();
    return 'none';
  }
  afterSplit(b,part);
  return r;
}

// 把留在上一頁最後的標題送到下一頁
function carry(from,to){
  const trail=[]; let c=from.lastElementChild;
  while(c && isKWN(c)){ trail.unshift(c); c=c.previousElementSibling; }
  if(!c) return [];
  trail.forEach(x=>to.appendChild(x));
  return trail;
}
const hasRealContent=body=>[...body.children].some(c=>!isKWN(c));

function paginate(blocks,ctx,chapterBreak){
  let body=ctx.newPage();
  const q=blocks.slice();
  let guard=0;
  while(q.length && ++guard<50000){
    const b=q.shift();
    if(b.classList.contains('pb')){ if(body.children.length) body=ctx.newPage(); continue; }
    if(isEmptyBlock(b)) continue;
    if(chapterBreak && b.tagName==='H2' && body.children.length) body=ctx.newPage();
    body.appendChild(b);
    if(fits(body)) continue;
    body.removeChild(b);
    const empty=!body.children.length;

    if(!empty && isAtomic(b)){
      const nb=ctx.newPage(); carry(body,nb); nb.appendChild(b); body=nb; continue;
    }
    if(!empty && isAvoid(b) && hasRealContent(body)){
      const nb=ctx.newPage(); const moved=carry(body,nb); nb.appendChild(b);
      if(fits(nb)){ body=nb; continue; }
      nb.removeChild(b); moved.forEach(x=>body.appendChild(x)); ctx.dropPage();
    }
    const r=isAtomic(b)?'none':splitInto(b,body);
    if(r==='none'){
      if(empty){ body.appendChild(b); body=ctx.newPage(); }   // 一頁放不下的內容（以超出頁面的方式顯示）
      else { const nb=ctx.newPage(); carry(body,nb); body=nb; q.unshift(b); }
    }else{
      body=ctx.newPage(); q.unshift(b);
    }
  }
  if(!body.children.length) ctx.dropPage();
}

function makeBook(doc){
  const stage=$('#stage');
  const book=document.createElement('div');
  book.className='book'; book.dataset.paper=S.paper; book.dataset.theme=S.theme;
  stage.replaceChildren(book);
  const pages=[];
  const ctx=kind=>({
    newPage(){
      const p=document.createElement('div');
      p.className='page'+(kind?' '+kind:'');
      p.innerHTML='<div class="page-head"><span class="ph-title"></span><span class="ph-chap"></span></div><div class="page-body"></div><div class="page-foot"></div>';
      book.appendChild(p); pages.push(p);
      return p.querySelector('.page-body');
    },
    dropPage(){ pages.pop().remove(); }
  });

  if(S.cover){
    const p=document.createElement('div');
    p.className='page cover'; p.innerHTML=coverHtml(doc);
    book.appendChild(p); pages.push(p);
  }
  if(S.toc && doc.headings.length) paginate(tocBlocks(doc),ctx('toc-page'),false);
  const blocks=[...doc.root.children];
  if(!S.cover) blocks.unshift(titleBlock(doc));
  paginate(blocks,ctx(''),S.chapter);

  // 頁碼、目錄的頁碼、書眉
  pages.forEach((p,i)=>{
    p.dataset.no=i+1;
    p.classList.add((i+1)%2?'odd':'even');
    const foot=p.querySelector('.page-foot');
    if(foot) foot.textContent=i+1;
  });
  book.querySelectorAll('.toc-item').forEach(a=>{
    const t=book.querySelector('#'+CSS.escape(a.dataset.target));
    a.querySelector('.pg').textContent=t?t.closest('.page').dataset.no:'';
  });
  const title=(doc.title||'').replace(/[*_`]/g,'');
  let chap=null;
  for(const p of pages){
    if(p.classList.contains('cover')) continue;
    const hs=p.querySelectorAll('.page-body h2[id]');
    const head=p.querySelector('.page-head');
    const cur=p.classList.contains('toc-page')?{num:'',text:'目錄'}:(hs[0]?{num:hs[0].dataset.num||'',text:hs[0].textContent}:chap);
    if(S.header && (title||cur)){
      head.querySelector('.ph-title').textContent=title;
      const c=head.querySelector('.ph-chap');
      if(cur){ if(cur.num){ const b=document.createElement('b'); b.textContent=cur.num; c.append(b); } c.append(cur.text); }
    }else head.remove();
    if(hs.length){ const h=hs[hs.length-1]; chap={num:h.dataset.num||'',text:h.textContent}; }
  }
  let over=0;
  for(const p of pages){
    const body=p.querySelector('.page-body');
    if(body && !fits(body)){ p.classList.add('overflow'); over++; }
  }
  return {book,pages:pages.length,over};
}

/* ============ 字型 ============ */
async function loadFonts(text){
  if(!document.fonts) return;
  const meta=[M.title,M.subtitle,M.author,...M.items.map(x=>x.key+x.value)].join('');
  const sample=[...new Set(text+meta+'目錄續作者未命名劇本描述TRPGSCENARIOCONTENTS0123456789▼（）')].join('');
  const specs=['400 12px "Noto Serif TC"','700 12px "Noto Serif TC"','400 12px "Noto Sans TC"','500 12px "Noto Sans TC"','700 12px "Noto Sans TC"','300 12px Inter','500 12px Inter','600 12px Inter'];
  try{
    await Promise.race([
      Promise.all(specs.map(f=>document.fonts.load(f,sample).catch(()=>null))),
      new Promise(r=>setTimeout(r,5000))
    ]);
  }catch(e){}
}

/* ============ 繪製 ============ */
let seq=0, current=null, timer=null;
function showError(msg){ const e=$('#error'); e.style.display=msg?'block':'none'; e.textContent=msg||''; }

async function render(){
  const my=++seq;
  clearTimeout(timer); timer=null;
  if(!window.marked||!window.DOMPurify){
    showError('無法載入轉換用的函式庫（marked、DOMPurify）。請連上網路後重新開啟頁面。');
    return;
  }
  const src=ta().value;
  await loadFonts(src);
  if(my!==seq) return;
  let res, doc;
  try{
    doc=parseDoc(src);
    const [w,h]=PAPER[S.paper];
    $('#page-style').textContent=`@page{size:${w}mm ${h}mm;margin:0}`;
    res=makeBook(doc);
  }catch(e){ console.error(e); showError('排版時發生錯誤：'+e.message); return; }
  showError('');
  const pane=$('#previewPane'), keep=pane.scrollTop;
  $('#book-host').replaceChildren(res.book);
  pane.scrollTop=keep;
  current={doc,...res};
  applyZoom();
  updateStatus();
  lastCaretLine=-1; syncCaret(false);
}
function schedule(ms=500){ clearTimeout(timer); timer=setTimeout(render,ms); }

function applyZoom(){
  const host=$('#book-host'), pane=$('#previewPane');
  const pwPx=PAPER[S.paper][0]*96/25.4;
  let z=S.zoom==='auto'?Math.min(1.25,Math.max(.25,(pane.clientWidth-40)/pwPx)):+S.zoom;
  if(!isFinite(z)||z<=0) z=1;
  host.style.zoom=z;
}

function updateStatus(){
  if(!current) return;
  const d=current.doc;
  const ch=d.headings.filter(h=>h.level===2).length, sc=d.headings.filter(h=>h.level===3).length;
  const parts=[`字數 ${d.chars.toLocaleString()} 字`,`標題 ${ch+sc} 個（章 ${ch}、探索點 ${sc}）`,`${S.paper}・共 ${current.pages} 頁`];
  $('#status').innerHTML=parts.map(s=>`<span>${esc(s)}</span>`).join('')+
    (current.over?`<span class="warn">有放不進一頁的內容（${current.over} 頁，以紅框標出）</span>`:'')+
    '<span class="tip">點一下紙面，就會跳到內文的對應位置</span>';
}

/* ============ 分色編輯器 ============ */
function hlInline(e){
  return e.replace(new RegExp(RE_SKILL_SRC,'g'),'<span class="h-skill">$&</span>')
          .replace(new RegExp(RE_SAN_SRC,'g'),'<span class="h-san">$&</span>');
}
function highlight(){
  const lines=ta().value.split('\n');
  let html='', box=null, judge=false, fence=false;
  lines.forEach((l,i)=>{
    let cls='';
    const bm=l.match(RE_BOX_OPEN);
    if(RE_FENCE.test(l)){ fence=!fence; cls='code'; }
    else if(fence) cls='code';
    else if(bm){ box=bm[1].toLowerCase(); cls='box-open b-'+box; judge=false; }
    else if(box && RE_BOX_CLOSE.test(l)){ cls='box-close b-'+box; box=null; judge=false; }
    else if(RE_PB.test(l)) cls='pb';
    else if(/^\s*#\s/.test(l)) cls='h1';
    else if(/^\s*##\s/.test(l)) cls='h2';
    else if(/^\s*#{3,6}\s/.test(l)) cls='h3';
    else if(RE_DESC.test(l)) cls='desc';
    else if(RE_JUDGE.test(l)){ cls='judge'; judge=true; }
    else if(judge && l.trim()) cls='jbody';
    else if(/^\s*\|/.test(l)) cls='table';
    if(!l.trim()||(cls&&cls!=='judge'&&cls!=='jbody')) judge=judge&&cls==='jbody';
    if(box && !cls.startsWith('box')) cls+=' inbox b-'+box;
    const e=esc(l);
    cls=cls.split(' ').filter(Boolean).map(c=>'l-'+c).join(' ');
    html+=`<div class="ln ${cls}" data-ln="${i}">${e?(cls==='l-code'?e:hlInline(e)):'<br>'}</div>`;
  });
  $('#hl').innerHTML=html;
  $('#hl').scrollTop=ta().scrollTop;
}

function caretXY(pos){
  const mir=$('#mirror');
  mir.textContent=ta().value.slice(0,pos);
  const mark=document.createElement('span'); mark.textContent='|'; mir.appendChild(mark);
  return {x:mark.offsetLeft, y:mark.offsetTop-ta().scrollTop, h:mark.offsetHeight};
}
const lineOf=pos=>{ let n=0; const v=ta().value; for(let i=0;i<pos;i++) if(v.charCodeAt(i)===10) n++; return n; };
function lineStartPos(n){ const v=ta().value; let p=0; for(let i=0;i<n;i++){ const j=v.indexOf('\n',p); if(j<0) return v.length; p=j+1; } return p; }

/* 插入文字（優先用 execCommand，這樣復原才有效） */
function insertText(text,s,e){
  const t=ta();
  t.focus();
  t.setSelectionRange(s,e);
  let ok=false;
  try{ ok=document.execCommand('insertText',false,text); }catch(err){}
  if(!ok||t.value.slice(s,s+text.length)!==text){
    t.setRangeText(text,s,e,'end');
    t.dispatchEvent(new Event('input'));
  }
}
function put(raw,s,e,isInline){
  const v=ta().value;
  let pre='', post='';
  if(!isInline){
    const before=v.slice(0,s), after=v.slice(e);
    if(before.length){ if(!before.endsWith('\n')) pre='\n\n'; else if(!before.endsWith('\n\n')) pre='\n'; }
    if(after.length && !after.startsWith('\n')) post='\n';
  }
  let text=pre+raw+post;
  const a=text.indexOf('⟦'), b=text.indexOf('⟧');
  text=text.replace('⟦','').replace('⟧','');
  insertText(text,s,e);
  if(a>=0&&b>a) ta().setSelectionRange(s+a,s+b-1);
  else { const p=s+text.length-post.length; ta().setSelectionRange(p,p); }
  ensureCaretVisible();
}
function applyBlock(key,range){
  const t=ta(), v=t.value;
  let s=range?range[0]:t.selectionStart, e=range?range[1]:t.selectionEnd;
  const isInline=INLINE_SNIPS.has(key);
  const sel=v.slice(s,e);
  if(!range && sel.trim() && WRAP[key]){
    if(isInline){ put(WRAP[key](sel),s,e,true); return; }
    s=v.lastIndexOf('\n',s-1)+1;
    let ee=v.indexOf('\n',v[e-1]==='\n'?e-1:e); if(ee<0) ee=v.length; e=ee;
    put(WRAP[key](v.slice(s,e).replace(/\n+$/,''))+'\n',s,e,false);
    return;
  }
  put(SNIPS[key],s,e,isInline);
}
function ensureCaretVisible(){
  const t=ta(), c=caretXY(t.selectionStart);
  if(c.y<0||c.y>t.clientHeight-40) t.scrollTop+=c.y-t.clientHeight*0.35;
  $('#hl').scrollTop=t.scrollTop;
}

/* ---- 「/」選單 ---- */
const slash={open:false,pos:0,items:[],idx:0};
function openSlash(pos){
  slash.open=true; slash.pos=pos; slash.idx=0;
  updateSlash();
}
function closeSlash(){ slash.open=false; $('#slash').hidden=true; }
function updateSlash(){
  const t=ta(), v=t.value, caret=t.selectionStart;
  if(!slash.open) return;
  if(caret<=slash.pos || !/[\/／]/.test(v[slash.pos]||'')){ closeSlash(); return; }
  const q=v.slice(slash.pos+1,caret);
  if(/[\s]/.test(q)||q.length>16){ closeSlash(); return; }
  const ql=q.toLowerCase();
  slash.items=MENU.filter(m=>!ql||m.label.includes(q)||m.kw.includes(ql)||m.k.startsWith(ql));
  slash.idx=Math.min(slash.idx,Math.max(0,slash.items.length-1));
  const el=$('#slash');
  el.innerHTML='<div class="head">插入格式</div>'+(slash.items.length?slash.items.map((m,i)=>
    `<div class="item${i===slash.idx?' on':''}" data-i="${i}"><i style="--c:${m.c}"></i>${esc(m.label)}<small>${esc(m.hint)}</small></div>`).join(''):
    '<div class="empty">沒有符合的格式</div>');
  el.hidden=false;
  const c=caretXY(slash.pos), wrap=$('#edWrap');
  let top=c.y+c.h+4, left=Math.max(8,Math.min(c.x,wrap.clientWidth-260));
  if(top+el.offsetHeight>wrap.clientHeight-8) top=Math.max(8,c.y-el.offsetHeight-4);
  el.style.top=top+'px'; el.style.left=left+'px';
  el.querySelector('.item.on')?.scrollIntoView({block:'nearest'});
}
function chooseSlash(i){
  const m=slash.items[i]; if(!m) return;
  const range=[slash.pos,ta().selectionStart];
  closeSlash();
  applyBlock(m.k,range);
}
function maybeOpenSlash(){
  const t=ta(), v=t.value, pos=t.selectionStart-1;
  if(pos<0||!/[\/／]/.test(v[pos])) return;
  const ls=v.lastIndexOf('\n',pos-1)+1;
  if(v.slice(ls,pos).trim()==='') openSlash(pos);
}

/* ---- 內文 ⇔ 紙面 ---- */
let lastCaretLine=-1;
function findBlockForLine(line){
  let best=null, bestLine=-1;
  document.querySelectorAll('#book-host [data-line]').forEach(el=>{
    const l=+el.dataset.line;
    if(l<=line && l>=bestLine){ best=el; bestLine=l; }
  });
  return best?[...document.querySelectorAll(`#book-host [data-line="${bestLine}"]`)]:[];
}
function syncCaret(scroll=true){
  if(!current) return;
  const line=lineOf(ta().selectionStart);
  if(line===lastCaretLine) return;
  lastCaretLine=line;
  document.querySelectorAll('#book-host .is-cursor').forEach(x=>x.classList.remove('is-cursor'));
  const els=findBlockForLine(line);
  els.forEach(x=>x.classList.add('is-cursor'));
  if(scroll && els[0] && document.activeElement===ta()){
    const pane=$('#previewPane'), r=els[0].getBoundingClientRect(), pr=pane.getBoundingClientRect();
    if(r.bottom<pr.top+20||r.top>pr.bottom-40) els[0].scrollIntoView({block:'center',behavior:'smooth'});
  }
}
function jumpToLine(n){
  setTab('edit'); setSub('text');
  const t=ta(), pos=lineStartPos(n);
  t.focus({preventScroll:true});
  t.setSelectionRange(pos,pos);
  const div=$('#hl').querySelector(`[data-ln="${n}"]`);
  if(div){
    t.scrollTop=Math.max(0,div.offsetTop-t.clientHeight*0.3);
    $('#hl').scrollTop=t.scrollTop;
    div.classList.remove('flash'); void div.offsetWidth; div.classList.add('flash');
  }
  lastCaretLine=-1; syncCaret(false);
}

/* ============ 封面與概要表單 ============ */
function renderMetaForm(){
  $('#mTitle').value=M.title; $('#mSubtitle').value=M.subtitle; $('#mAuthor').value=M.author;
  $('#mItems').innerHTML=M.items.map((it,i)=>`<div class="mrow" data-i="${i}">
    <input class="mk" list="keySuggest" placeholder="項目" value="${esc(it.key)}" aria-label="項目">
    <input class="mv" placeholder="內容" value="${esc(it.value)}" aria-label="內容">
    <span class="ops"><button type="button" data-act="up" title="上移" aria-label="上移">↑</button><button type="button" data-act="down" title="下移" aria-label="下移">↓</button><button type="button" data-act="del" title="刪除" aria-label="刪除">×</button></span>
  </div>`).join('');
}
function applyFrontMatter(list){
  const pick=k=>{ const e=list.find(x=>x.key===k); return e?e.value:''; };
  M={title:pick('標題'),subtitle:pick('副標題'),author:pick('作者'),items:list.filter(x=>!COVER_KEYS.includes(x.key))};
  renderMetaForm();
}
// 把貼在內文開頭的「---」區塊搬進表單
function absorbFrontMatter(){
  const t=ta(), r=splitFrontMatter(t.value);
  if(!r) return false;
  applyFrontMatter(r.meta);
  t.value=r.body.replace(/^\s*\n/,'');
  t.setSelectionRange(0,0);
  return true;
}
function metaChanged(){ saveStore(); schedule(400); }

/* ============ 輸出 ============ */
async function doPrint(){ await render(); window.print(); }

function exportHtml(){
  if(!current) return;
  const title=(current.doc.title||'劇本').replace(/[*_`]/g,'');
  const book=current.book.cloneNode(true);
  book.querySelectorAll('.is-cursor').forEach(x=>x.classList.remove('is-cursor'));
  book.querySelectorAll('[data-line]').forEach(x=>x.removeAttribute('data-line'));
  const html=`<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${$('#font-link').outerHTML}
<style>${$('#page-style').textContent}</style>
<style>${$('#book-css').textContent}</style>
<style>html,body{margin:0}body{background:#ebe9e4;padding:24px 0}@media print{body{background:none;padding:0}}</style>
</head>
<body>
${book.outerHTML}
</body>
</html>`;
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=title.replace(/[\\/:*?"<>|\s]+/g,'_')+'_列印用.html';
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500);
}

/* ============ 介面操作 ============ */
function syncControls(){
  document.querySelectorAll('#paperSeg button').forEach(b=>b.classList.toggle('on',b.dataset.v===S.paper));
  document.querySelectorAll('#themeSw button').forEach(b=>b.classList.toggle('on',b.dataset.v===S.theme));
  $('#themeName').textContent=THEME_NAME[S.theme];
  $('#zoom').value=S.zoom;
  $('#optCover').checked=S.cover; $('#optToc').checked=S.toc; $('#optChapter').checked=S.chapter; $('#optHeader').checked=S.header;
}
function setTab(tab){
  document.body.dataset.tab=tab;
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x.dataset.tab===tab));
  applyZoom();
}
function setSub(sub){
  document.querySelectorAll('.subtabs [data-sub]').forEach(x=>x.classList.toggle('on',x.dataset.sub===sub));
  $('#textPane').hidden=sub!=='text';
  $('#metaPane').hidden=sub!=='meta';
  $('#foldIns').hidden=sub!=='text';
  if(sub==='text') highlight();
}

// 手機版可以收合上方的設定列與格式按鈕列
const FOLD={foldBar:'fold-bar',foldIns:'fold-ins'};
function applyFold(ui){
  for(const [id,cls] of Object.entries(FOLD)){
    document.body.classList.toggle(cls,!!ui[id]);
    $('#'+id).setAttribute('aria-expanded',String(!ui[id]));
  }
}
function initFold(){
  let ui={};
  try{ ui=JSON.parse(localStorage.getItem(UI_KEY))||{}; }catch(e){}
  applyFold(ui);
  for(const id of Object.keys(FOLD)){
    $('#'+id).addEventListener('click',()=>{
      ui[id]=!ui[id]; applyFold(ui);
      try{ localStorage.setItem(UI_KEY,JSON.stringify(ui)); }catch(e){}
      applyZoom(); highlight();
    });
  }
}

function init(){
  const saved=loadStore();
  if(saved&&saved.settings) Object.assign(S,saved.settings);
  if(!PAPER[S.paper]) S.paper='A5';
  if(!THEME_NAME[S.theme]) S.theme='mono';
  if(saved){
    ta().value=typeof saved.text==='string'?saved.text:'';
    if(saved.meta) M=Object.assign({title:'',subtitle:'',author:'',items:[]},saved.meta);
    absorbFrontMatter();
  }else{
    ta().value=SAMPLE_TEXT;
    M=JSON.parse(JSON.stringify(SAMPLE_META));
  }
  renderMetaForm();
  syncControls();
  highlight();

  const t=ta();
  t.addEventListener('input',e=>{
    if(absorbFrontMatter()) toast('已把封面資訊讀進「封面與概要」分頁');
    highlight();
    if(slash.open) updateSlash();
    else if(e.inputType&&e.inputType.startsWith('insert')&&e.data&&/[\/／]$/.test(e.data)) maybeOpenSlash();
    saveStore(); schedule();
  });
  t.addEventListener('compositionend',e=>{ if(!slash.open&&/[\/／]$/.test(e.data||'')) setTimeout(maybeOpenSlash,0); });
  t.addEventListener('scroll',()=>{ $('#hl').scrollTop=t.scrollTop; if(slash.open) updateSlash(); });
  t.addEventListener('keydown',e=>{
    if(!slash.open||e.isComposing) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); slash.idx=(slash.idx+1)%Math.max(1,slash.items.length); updateSlash(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); slash.idx=(slash.idx-1+slash.items.length)%Math.max(1,slash.items.length); updateSlash(); }
    else if(e.key==='Enter'||e.key==='Tab'){ if(slash.items.length){ e.preventDefault(); chooseSlash(slash.idx); } else closeSlash(); }
    else if(e.key==='Escape'){ e.preventDefault(); closeSlash(); }
  });
  let caretT=null;
  const onCaret=()=>{ clearTimeout(caretT); caretT=setTimeout(()=>syncCaret(true),120); if(slash.open) updateSlash(); };
  t.addEventListener('keyup',onCaret); t.addEventListener('click',onCaret);
  t.addEventListener('blur',()=>setTimeout(closeSlash,150));
  $('#slash').addEventListener('mousedown',e=>{ const it=e.target.closest('.item'); if(it){ e.preventDefault(); chooseSlash(+it.dataset.i); } });

  document.querySelectorAll('[data-snip]').forEach(b=>{
    b.addEventListener('mousedown',e=>e.preventDefault());   // 保留選取範圍
    b.addEventListener('click',()=>applyBlock(b.dataset.snip));
  });

  // 設定
  $('#paperSeg').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; S.paper=b.dataset.v; syncControls(); saveStore(); render(); });
  $('#themeSw').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; S.theme=b.dataset.v; syncControls(); saveStore(); render(); });
  $('#zoom').addEventListener('change',e=>{ S.zoom=e.target.value; saveStore(); applyZoom(); });
  [['#optCover','cover'],['#optToc','toc'],['#optChapter','chapter'],['#optHeader','header']].forEach(([id,k])=>
    $(id).addEventListener('change',e=>{ S[k]=e.target.checked; saveStore(); render(); }));

  // 封面與概要表單
  [['#mTitle','title'],['#mSubtitle','subtitle'],['#mAuthor','author']].forEach(([id,k])=>
    $(id).addEventListener('input',e=>{ M[k]=e.target.value; metaChanged(); }));
  $('#mItems').addEventListener('input',e=>{
    const row=e.target.closest('.mrow'); if(!row) return;
    const it=M.items[+row.dataset.i];
    if(e.target.classList.contains('mk')) it.key=e.target.value; else it.value=e.target.value;
    metaChanged();
  });
  $('#mItems').addEventListener('click',e=>{
    const b=e.target.closest('button[data-act]'); if(!b) return;
    const i=+b.closest('.mrow').dataset.i, a=b.dataset.act;
    if(a==='del') M.items.splice(i,1);
    if(a==='up'&&i>0) M.items.splice(i-1,0,M.items.splice(i,1)[0]);
    if(a==='down'&&i<M.items.length-1) M.items.splice(i+1,0,M.items.splice(i,1)[0]);
    renderMetaForm(); metaChanged();
  });
  $('#mAdd').addEventListener('click',()=>{
    M.items.push({key:'',value:''}); renderMetaForm(); metaChanged();
    $('#mItems .mrow:last-child .mk').focus();
  });

  // 分頁
  document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  document.querySelectorAll('.subtabs [data-sub]').forEach(b=>b.addEventListener('click',()=>setSub(b.dataset.sub)));
  initFold();

  // 點紙面跳到內文
  $('#book-host').addEventListener('click',e=>{
    if(e.target.closest('a[href^="#"]')) return;
    if(e.target.closest('.cover,.titleblock')){ setTab('edit'); setSub('meta'); $('#mTitle').focus(); return; }
    const el=e.target.closest('[data-line]');
    if(el) jumpToLine(+el.dataset.line);
  });

  $('#btnPrint').addEventListener('click',doPrint);
  $('#btnSave').addEventListener('click',exportHtml);
  const dlg=$('#help');
  $('#btnHelp').addEventListener('click',()=>dlg.showModal());
  dlg.addEventListener('click',e=>{ if(e.target===dlg||e.target.closest('[data-close]')) dlg.close(); });
  $('#btnNew').addEventListener('click',()=>{
    if(!confirm('要建立新的劇本。\n目前的內文、封面與概要會全部清除（紙張與配色的設定會保留）。\n\n需要的話，請先用「儲存列印用 HTML」等方式留一份備份。確定要繼續嗎？')) return;
    ta().value=''; M=blankMeta();
    closeSlash(); renderMetaForm(); highlight(); saveStore();
    $('#previewPane').scrollTop=0; ta().scrollTop=0;
    setTab('edit'); setSub('meta'); $('#mTitle').focus();
    render();
    toast('已建立新的劇本，可以從標題開始輸入');
  });
  $('#btnSample').addEventListener('click',()=>{
    if(!confirm('要用範例劇本取代目前的內文與封面資訊。確定嗎？')) return;
    ta().value=SAMPLE_TEXT; M=JSON.parse(JSON.stringify(SAMPLE_META));
    renderMetaForm(); highlight(); saveStore(); dlg.close(); render();
  });
  window.addEventListener('resize',()=>{ applyZoom(); highlight(); });
  window.addEventListener('beforeprint',()=>{ if(timer) render(); });
  if(document.fonts) document.fonts.addEventListener('loadingdone',()=>{ schedule(300); highlight(); });

  if(window.marked) marked.use({gfm:true,breaks:true});
  render();
}
init();
