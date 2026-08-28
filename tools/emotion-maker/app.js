"use strict";
/* ============ 資產清單（參照 images/ 路徑）============ */
/* id 保留原韓文，以維持匯出 JSON 與 localStorage 和原版工具相容。 */
const MANIFEST = {
  base: [{ id: "피부", file: "skin" }, { id: "얼굴 틀", file: "face" }],
  "눈": [
    { id: "감은 눈", file: "eyes/closed" }, { id: "반눈", file: "eyes/half" },
    { id: "번뜩", file: "eyes/glint" }, { id: "보통 눈", file: "eyes/normal" },
    { id: "웃는 눈", file: "eyes/smiling" }, { id: "윙크", file: "eyes/wink" },
    { id: "점눈", file: "eyes/dot" }, { id: "찡긋 감은 눈", file: "eyes/squint" },
    { id: "초롱", file: "eyes/sparkle" }, { id: "하트 눈", file: "eyes/heart" }
  ],
  "눈썹": [
    { id: "일반 눈썹", file: "brows/normal" }, { id: "일자 눈썹", file: "brows/straight" },
    { id: "처진 눈썹", file: "brows/drooping" }, { id: "힘준 눈썹", file: "brows/tense" }
  ],
  "입": [
    { id: "3자 입", file: "mouth/cat3" }, { id: "고양이 입", file: "mouth/cat" },
    { id: "메롱", file: "mouth/tongue" }, { id: "미소", file: "mouth/smile" },
    { id: "불만 입", file: "mouth/displeased" }, { id: "브이 입", file: "mouth/v" },
    { id: "웃으며 벌린 입", file: "mouth/laugh" }, { id: "작게 벌린 입", file: "mouth/small-open" },
    { id: "직선 입", file: "mouth/line" }, { id: "크게 벌린 입", file: "mouth/wide-open" }
  ],
  "꾸밈": [
    { id: "검정", file: "deco/black" }, { id: "눈물", file: "deco/tears" },
    { id: "땀 많이", file: "deco/sweat-many" }, { id: "땀 하나", file: "deco/sweat-one" },
    { id: "미간 주름", file: "deco/frown" }, { id: "보라", file: "deco/purple" },
    { id: "빠직", file: "deco/anger-mark" }, { id: "빨강", file: "deco/red" },
    { id: "음영", file: "deco/shade" }, { id: "절망", file: "deco/despair" },
    { id: "코 그림자", file: "deco/nose-shadow" }, { id: "파랑", file: "deco/blue" },
    { id: "홍조", file: "deco/blush" }
  ]
};

/* id → 檔名路徑。內建部件才有；自訂部件走 dataURL。 */
const FILE_OF = {};
for (const [cat, items] of Object.entries(MANIFEST)) {
  FILE_OF[cat] = Object.fromEntries(items.map(i => [i.id, i.file]));
}

const CATS = ["눈","눈썹","입","꾸밈"];    // 面板顯示順序
const SINGLE = new Set(["눈","눈썹","입"]);
const DECO = "꾸밈";
const DRAW_SINGLE = ["눈썹","눈","입"];    // z 順序：膚色 → 臉型 → 眉毛 → 眼睛 → 嘴巴 → 裝飾
const STORE_KEY = "emotion_face_maker_v1";
const CUSTOM_KEY = "emotion_face_maker_custom_v1";
const IMG = { base:{} };                   // 合成用 Image 快取
let customParts = {"눈":{},"눈썹":{},"입":{},"꾸밈":{}};  // {cat:{name:dataURL}}

/* 分類顯示名稱以 cat.* key 呈現；CAT_KEY 對照分類 id → key 字尾。 */
const CAT_KEY = { "눈": "eyes", "눈썹": "brows", "입": "mouth", "꾸밈": "deco" };
function catLabel(cat){ return T('cat.' + CAT_KEY[cat]); }

/* ============ 內建情緒預設 20 種 ============ */
/* tag 為 i18n key（顯示文字），非資料 ID；部件引用值維持原韓文不動。 */
const PRESETS = [
  { tag:"preset.joy",        "눈":"보통 눈",       "눈썹":"일반 눈썹", "입":"웃으며 벌린 입", "꾸밈":[] },
  { tag:"preset.happy",      "눈":"웃는 눈",       "눈썹":"일반 눈썹", "입":"미소",          "꾸밈":["홍조"] },
  { tag:"preset.love",       "눈":"하트 눈",       "눈썹":"처진 눈썹", "입":"미소",          "꾸밈":["홍조"] },
  { tag:"preset.flutter",    "눈":"초롱",          "눈썹":"일반 눈썹", "입":"작게 벌린 입",   "꾸밈":["홍조"] },
  { tag:"preset.excited",    "눈":"초롱",          "눈썹":"힘준 눈썹", "입":"웃으며 벌린 입", "꾸밈":[] },
  { tag:"preset.playful",    "눈":"윙크",          "눈썹":"일반 눈썹", "입":"메롱",          "꾸밈":[] },
  { tag:"preset.confident",  "눈":"번뜩",          "눈썹":"힘준 눈썹", "입":"브이 입",       "꾸밈":[] },
  { tag:"preset.disgust",    "눈":"반눈",          "눈썹":"일자 눈썹", "입":"불만 입",       "꾸밈":["보라"] },
  { tag:"preset.sad",        "눈":"반눈",          "눈썹":"일자 눈썹", "입":"불만 입",       "꾸밈":["눈물"] },
  { tag:"preset.gloomy",     "눈":"반눈",          "눈썹":"처진 눈썹", "입":"직선 입",       "꾸밈":["절망","파랑"] },
  { tag:"preset.despair",    "눈":"반눈",          "눈썹":"처진 눈썹", "입":"직선 입",       "꾸밈":["절망","검정"] },
  { tag:"preset.wail",       "눈":"보통 눈",       "눈썹":"힘준 눈썹", "입":"크게 벌린 입",   "꾸밈":["눈물"] },
  { tag:"preset.anger",      "눈":"반눈",          "눈썹":"힘준 눈썹", "입":"불만 입",       "꾸밈":["빠직","빨강"] },
  { tag:"preset.rage",       "눈":"보통 눈",       "눈썹":"힘준 눈썹", "입":"크게 벌린 입",   "꾸밈":["빠직","빨강"] },
  { tag:"preset.annoyed",    "눈":"반눈",          "눈썹":"힘준 눈썹", "입":"불만 입",       "꾸밈":["미간 주름"] },
  { tag:"preset.surprise",   "눈":"초롱",          "눈썹":"일반 눈썹", "입":"작게 벌린 입",   "꾸밈":["땀 하나"] },
  { tag:"preset.shock",      "눈":"보통 눈",       "눈썹":"힘준 눈썹", "입":"크게 벌린 입",   "꾸밈":["음영","땀 많이"] },
  { tag:"preset.flustered",  "눈":"점눈",          "눈썹":"처진 눈썹", "입":"작게 벌린 입",   "꾸밈":["땀 많이"] },
  { tag:"preset.shy",        "눈":"찡긋 감은 눈",  "눈썹":"처진 눈썹", "입":"3자 입",        "꾸밈":["홍조"] },
  { tag:"preset.deadpan",    "눈":"보통 눈",       "눈썹":"일자 눈썹", "입":"직선 입",       "꾸밈":["코 그림자"] }
];

/* 內建 preset 的 tag 是 i18n key；使用者自訂的 tag 是自由文字。
 * T() 對未知 key 回傳 key 本身，故自訂文字原樣顯示。 */
function tagLabel(tag){ return T(tag); }

/* ============ 狀態 ============ */
let draft = newDraft();
let editingId = null;
let collection = [];
let importTargetCat = null;   // 匯入自訂部件的目標分類
function newDraft(){ return {"눈":null,"눈썹":null,"입":null,"꾸밈":[]}; }
function partExpr(cat,name){ const e=newDraft(); if(cat===DECO) e["꾸밈"]=[name]; else e[cat]=name; return e; }

/* ============ 部件清單／路徑（內建＋自訂）============ */
function names(cat){ return MANIFEST[cat].map(i => i.id).concat(Object.keys(customParts[cat]||{})); }
function isCustom(cat,name){ return !!(customParts[cat] && customParts[cat][name]); }
function baseSrc(id){ return "images/" + FILE_OF.base[id] + ".png"; }
function srcOf(cat,name){ return isCustom(cat,name) ? customParts[cat][name] : "images/" + FILE_OF[cat][name] + ".png"; }

/* id 為韓文資料鍵；顯示名稱一律查字典。自訂部件用使用者給的名字。
 * 若 name 既非自訂部件、亦非已知內建 id（例如匯入了本機沒有對應自訂部件的
 * JSON），FILE_OF 查無資料，此時原樣顯示 name，維持原版「找不到就照樣顯示」
 * 的容錯行為，而非丟出例外。 */
function partLabel(cat, name){
  if (isCustom(cat, name)) return name;
  const file = FILE_OF[cat] && FILE_OF[cat][name];
  if (!file) return name;
  return T('part.' + file.replace('/', '.'));
}

/* 表情 → 由下而上的圖層 src 陣列 */
function layerSrcs(e){
  const s=[baseSrc("피부"), baseSrc("얼굴 틀")];
  for(const c of DRAW_SINGLE) if(e[c]) s.push(srcOf(c,e[c]));
  (e["꾸밈"]||[]).forEach(n=>s.push(srcOf(DECO,n)));
  return s;
}

/* ============ 圖片預先載入（供 canvas 合成用）============ */
function loadImg(src){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>rej(src); i.src=src; }); }
async function preloadAll(){
  const jobs=[];
  for(const n of MANIFEST.base) jobs.push(loadImg(baseSrc(n.id)).then(im=>IMG.base[n.id]=im));
  for(const c of CATS){ IMG[c]=IMG[c]||{}; for(const n of names(c)) jobs.push(loadImg(srcOf(c,n)).then(im=>IMG[c][n]=im).catch(()=>{})); }
  await Promise.all(jobs);
}

/* ============ 縮圖（img 堆疊）============ */
function thumbEl(e, cls){
  const d=document.createElement("div"); d.className="thumb"+(cls?" "+cls:"");
  for(const s of layerSrcs(e)){ const im=document.createElement("img"); im.src=s; im.alt=""; d.appendChild(im); }
  return d;
}

/* ============ 面板 ============ */
function renderPalette(){
  const wrap=document.getElementById("palette"); wrap.innerHTML="";
  for(const cat of CATS){
    const box=document.createElement("div"); box.className="cat";
    const head=document.createElement("div"); head.className="cat-head";
    const nm=document.createElement("span"); nm.className="name"; nm.textContent=catLabel(cat);
    const tg=document.createElement("span"); tg.className="tag"; tg.textContent=SINGLE.has(cat)?T('palette.singleSelect'):T('palette.multiOrder');
    const add=mkBtn(T('palette.addImage'),()=>promptAddImage(cat)); add.className="ghost add";
    head.append(nm,tg,add); box.appendChild(head);

    const grid=document.createElement("div"); grid.className="grid-parts";
    for(const name of names(cat)){
      const el=document.createElement("div"); el.className="part";
      if(isCustom(cat,name)) el.classList.add("custom");
      const sel = SINGLE.has(cat) ? draft[cat]===name : draft[DECO].includes(name);
      if(sel) el.classList.add(SINGLE.has(cat)?"sel":"sel-deco");
      el.appendChild(thumbEl(partExpr(cat,name)));
      const lbl=document.createElement("div"); lbl.className="lbl";
      const label=partLabel(cat,name);
      lbl.textContent=label; lbl.title=label;
      el.appendChild(lbl);
      if(isCustom(cat,name)){
        const del=mkBtn("✕",ev=>{ ev.stopPropagation(); removeCustomPart(cat,name); }); del.className="del"; el.appendChild(del);
      }
      el.onclick=()=>togglePart(cat,name);
      grid.appendChild(el);
    }
    box.appendChild(grid); wrap.appendChild(box);
  }
}
function togglePart(cat,name){
  if(SINGLE.has(cat)) draft[cat]= draft[cat]===name ? null : name;
  else{
    const i=draft[DECO].indexOf(name);
    if(i>=0) draft[DECO].splice(i,1); else draft[DECO].push(name); // 越晚選取的越靠上（陣列尾端）
  }
  refreshEditor();
}

/* ============ 匯入自訂部件 ============ */
function promptAddImage(cat){ importTargetCat=cat; document.getElementById("filePart").click(); }
function handlePartFiles(files){
  const cat=importTargetCat; if(!cat) return;
  let pending=files.length, added=[];
  Array.from(files).forEach(f=>{
    if(!f.type.startsWith("image/")){ if(--pending===0) finishAdd(cat,added); return; }
    const r=new FileReader();
    r.onload=()=>{
      const base=f.name.replace(/\.[^.]+$/,"").trim()||T('customPart.defaultName');
      const name=uniqueName(cat,base);
      customParts[cat][name]=r.result;
      added.push(name);
      loadImg(r.result).then(im=>{ (IMG[cat]=IMG[cat]||{})[name]=im; });
      if(--pending===0) finishAdd(cat,added);
    };
    r.onerror=()=>{ if(--pending===0) finishAdd(cat,added); };
    r.readAsDataURL(f);
  });
}
function finishAdd(cat,added){
  if(added.length===0){ toast(T('toast.notImage')); return; }
  saveCustom(); refreshEditor(); toast(T('toast.imagesAdded', catLabel(cat), added.length));
}
function removeCustomPart(cat,name){
  if(!confirm(T('confirm.deleteCustomPart', name))) return;
  delete customParts[cat][name];
  if(IMG[cat]) delete IMG[cat][name];
  // 從目前編輯中／已儲存的表情中移除參照
  if(draft[cat]===name) draft[cat]=null;
  draft[DECO]=draft[DECO].filter(n=>n!==name);
  collection.forEach(e=>{
    if(SINGLE.has(cat) && e[cat]===name) e[cat]=null;
    e["꾸밈"]=e["꾸밈"].filter(n=>n!==name);
  });
  saveCustom(); save(); refreshEditor(); renderCollection(); toast(T('toast.customPartRemoved'));
}
function uniqueName(cat,base){
  const exist=new Set(names(cat)); if(!exist.has(base)) return base;
  let i=2; while(exist.has(`${base} (${i})`)) i++; return `${base} (${i})`;
}

/* ============ 裝飾圖層堆疊 ============ */
function renderDecoStack(){
  const box=document.getElementById("decoStack"); box.innerHTML="";
  const arr=draft[DECO];
  if(arr.length===0){ box.innerHTML=`<div class="hint">${T('deco.empty')}</div>`; return; }
  for(let i=arr.length-1;i>=0;i--){   // 由上（前）往下
    const it=document.createElement("div"); it.className="deco-item";
    const g=document.createElement("span"); g.className="grip"; g.textContent=T('deco.layerLabel', arr.length-i);
    const n=document.createElement("span"); n.className="dn"; n.textContent=partLabel(DECO,arr[i]);
    const up=mkBtn("▲",()=>moveDeco(i,+1)); up.disabled=(i===arr.length-1);
    const dn=mkBtn("▼",()=>moveDeco(i,-1)); dn.disabled=(i===0);
    const rm=mkBtn("✕",()=>{arr.splice(i,1);refreshEditor();}); rm.className="danger";
    it.append(g,n,up,dn,rm); box.appendChild(it);
  }
}
function moveDeco(i,dir){ const a=draft[DECO],j=i+dir; if(j<0||j>=a.length)return; [a[i],a[j]]=[a[j],a[i]]; refreshEditor(); }
function mkBtn(t,fn){ const b=document.createElement("button"); b.textContent=t; b.onclick=fn; return b; }

/* ============ 預覽 ============ */
function renderPreview(){
  const p=document.getElementById("preview"); p.innerHTML="";
  for(const s of layerSrcs(draft)){ const im=document.createElement("img"); im.src=s; im.alt=""; p.appendChild(im); }
}
function refreshEditor(){ renderPalette(); renderDecoStack(); renderPreview(); }

/* ============ 收藏清單 ============ */
function renderCollection(){
  const wrap=document.getElementById("collection"); wrap.innerHTML="";
  document.getElementById("collCount").textContent=`(${collection.length})`;
  const sel=collection.filter(e=>e.includeInGrid).length;
  document.getElementById("countHint").textContent=collection.length?T('collection.gridSelectHint', sel, collection.length):"";
  if(collection.length===0){ wrap.innerHTML=`<div class="empty">${T('collection.emptyHtml')}</div>`; return; }
  collection.forEach(e=>{
    const it=document.createElement("div"); it.className="coll-item"+(e.id===editingId?" editing":"");
    const lab=document.createElement("label"); lab.className="inline";
    const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=e.includeInGrid; cb.title=T('collection.checkboxTitle');
    cb.onchange=()=>{ e.includeInGrid=cb.checked; save(); renderCollection(); };
    lab.appendChild(cb);
    const th=thumbEl(e);
    const meta=document.createElement("div"); meta.className="meta";
    meta.innerHTML=`<div class="t">${escapeHtml(e.tag ? tagLabel(e.tag) : T('tag.none'))}</div><div class="s">${summary(e)}${e.showText?"":T('summary.textHidden')}</div>`;
    const acts=document.createElement("div"); acts.className="acts";
    acts.append(mkBtn(T('btn.edit'),()=>loadForEdit(e.id)), mkBtn(T('btn.duplicate'),()=>duplicate(e.id)));
    const db=mkBtn(T('btn.delete'),()=>del(e.id)); db.className="danger"; acts.appendChild(db);
    it.append(lab,th,meta,acts); wrap.appendChild(it);
  });
}
function summary(e){
  const p=[];
  for(const c of DRAW_SINGLE) if(e[c]) p.push(partLabel(c,e[c]));
  if(e["꾸밈"].length) p.push(T('summary.decoCount', e["꾸밈"].length));
  return p.join(" · ")||T('summary.empty');
}

/* ============ 儲存／編輯 ============ */
function collectDraft(){
  return { id: editingId||uid(), "눈":draft["눈"],"눈썹":draft["눈썹"],"입":draft["입"],"꾸밈":[...draft["꾸밈"]],
    tag: document.getElementById("tagInput").value.trim(),
    showText: document.getElementById("showText").checked, includeInGrid:true };
}
function saveExpr(){
  const item=collectDraft();
  if(!item["눈"]&&!item["눈썹"]&&!item["입"]&&item["꾸밈"].length===0){ toast(T('toast.selectAtLeastOne')); return; }
  if(editingId){
    const idx=collection.findIndex(e=>e.id===editingId);
    item.includeInGrid=collection[idx].includeInGrid; collection[idx]=item; toast(T('toast.expressionUpdated'));
  }else{ collection.push(item); toast(T('toast.expressionSaved')); }
  save(); clearDraft(); renderCollection();
}
function loadForEdit(id){
  const e=collection.find(x=>x.id===id); if(!e)return;
  editingId=id; draft={"눈":e["눈"],"눈썹":e["눈썹"],"입":e["입"],"꾸밈":[...e["꾸밈"]]};
  document.getElementById("tagInput").value=e.tag ? tagLabel(e.tag) : "";
  document.getElementById("showText").checked=e.showText;
  document.getElementById("btnSave").textContent=T('btn.saveDone');
  document.getElementById("btnCancelEdit").hidden=false;
  refreshEditor(); renderCollection();
}
function loadPresets(){
  if(collection.length && !confirm(T('confirm.addPresets', PRESETS.length))) return;
  PRESETS.forEach(p=>collection.push({
    id:uid(), "눈":p["눈"],"눈썹":p["눈썹"],"입":p["입"],"꾸밈":[...p["꾸밈"]],
    tag:p.tag, showText:true, includeInGrid:true
  }));
  save(); renderCollection(); toast(T('toast.presetsAdded', PRESETS.length));
}
function randomize(){
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  draft["눈"]=pick(names("눈"));
  draft["눈썹"]=pick(names("눈썹"));
  draft["입"]=pick(names("입"));
  draft["꾸밈"]=[pick(names("꾸밈"))];   // 裝飾也僅隨機選一個
  refreshEditor();
}
function clearDraft(){
  draft=newDraft(); editingId=null;
  document.getElementById("tagInput").value="";
  document.getElementById("showText").checked=true;
  document.getElementById("btnSave").textContent=T('btn.save');
  document.getElementById("btnCancelEdit").hidden=true;
  refreshEditor();
}
function duplicate(id){
  const e=collection.find(x=>x.id===id); if(!e)return;
  const c=JSON.parse(JSON.stringify(e)); c.id=uid(); c.tag=tagLabel(e.tag||"")+T('duplicate.suffix');
  const idx=collection.findIndex(x=>x.id===id); collection.splice(idx+1,0,c);
  save(); renderCollection(); toast(T('toast.duplicated'));
}
function del(id){
  const e=collection.find(x=>x.id===id);
  if(!confirm(T('confirm.deleteExpression', e.tag ? tagLabel(e.tag) : T('tag.thisExpression')))) return;
  collection=collection.filter(x=>x.id!==id);
  if(editingId===id) clearDraft();
  save(); renderCollection();
}
function deleteSelected(){
  const n=collection.filter(e=>e.includeInGrid).length;
  if(n===0){ toast(T('toast.noneChecked')); return; }
  if(!confirm(T('confirm.deleteChecked', n))) return;
  const removedEditing = collection.some(e=>e.includeInGrid && e.id===editingId);
  collection=collection.filter(e=>!e.includeInGrid);
  if(removedEditing) clearDraft();
  save(); renderCollection(); toast(T('toast.deletedCount', n));
}
function clearAll(){
  if(collection.length===0) return;
  if(!confirm(T('confirm.clearAll', collection.length))) return;
  collection=[]; clearDraft(); save(); renderCollection(); toast(T('toast.allCleared'));
}

/* ============ 儲存區 ============ */
function save(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(collection)); }catch(e){} }
function saveCustom(){ try{ localStorage.setItem(CUSTOM_KEY, JSON.stringify(customParts)); }catch(e){ toast(T('toast.customSaveFailed')); } }
function load(){
  try{ const r=localStorage.getItem(STORE_KEY); if(r) collection=normalize(JSON.parse(r)); }catch(e){}
  try{ const c=localStorage.getItem(CUSTOM_KEY); if(c){ const p=JSON.parse(c); for(const cat of CATS) customParts[cat]=p[cat]||{}; } }catch(e){}
}
function normalize(arr){
  return (arr||[]).map(e=>({ id:e.id||uid(),
    "눈":e["눈"]??null,"눈썹":e["눈썹"]??null,"입":e["입"]??null,
    "꾸밈":Array.isArray(e["꾸밈"])?e["꾸밈"]:[],
    tag:e.tag||"", showText:e.showText!==false, includeInGrid:e.includeInGrid!==false }));
}

/* ============ JSON ============ */
function exportJSON(){
  const data={ app:"emotion-face-maker", version:1, exportedAt:new Date().toISOString(), expressions:collection };
  downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}), `emotion-expressions_${stamp()}.json`);
}
function importJSON(file){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const d=JSON.parse(r.result); const arr=Array.isArray(d)?d:d.expressions;
      if(!Array.isArray(arr)) throw 0;
      const mode = collection.length ? (confirm(T('confirm.importMode', arr.length))?"add":"replace") : "replace";
      const loaded=normalize(arr).map(e=>({...e,id:uid()}));
      collection = mode==="add" ? collection.concat(loaded) : loaded;
      save(); renderCollection(); toast(T('toast.importedCount', loaded.length));
    }catch(e){ toast(T('toast.importFailed')); }
  };
  r.readAsText(file);
}

/* ============ 合併圖（canvas）============ */
let gridBg="transparent";
function drawFace(ctx,x,y,size,e){
  const d=img=>img&&ctx.drawImage(img,x,y,size,size);
  d(IMG.base["피부"]); d(IMG.base["얼굴 틀"]);
  for(const c of DRAW_SINGLE){ if(e[c]&&IMG[c]) d(IMG[c][e[c]]); }
  (e["꾸밈"]||[]).forEach(n=>{ if(IMG[DECO]) d(IMG[DECO][n]); });
}
function openGrid(){
  if(collection.filter(e=>e.includeInGrid).length===0){ toast(T('toast.selectForGrid')); return; }
  document.getElementById("gridModal").classList.add("open"); buildGrid();
}
function buildGrid(){
  const sel=collection.filter(e=>e.includeInGrid);
  const info=document.getElementById("gridInfo");
  if(sel.length===0){ info.textContent=T('grid.noneSelected'); return; }
  const cell=clampNum("optCell",300,80,800), gap=clampNum("optGap",14,0,200);
  let cols=clampNum("optCols",0,0,50); if(cols<=0) cols=Math.ceil(Math.sqrt(sel.length));
  cols=Math.min(cols,sel.length); const rows=Math.ceil(sel.length/cols);
  const globalText=document.getElementById("optText").checked;
  const font=clampNum("optFont",26,6,160), textColor=document.getElementById("optTextColor").value;
  const lineH=Math.round(font*1.28), pad=Math.round(font*0.5);

  const tmp=document.createElement("canvas").getContext("2d");
  const fontStr=`600 ${font}px "Segoe UI","Malgun Gothic",sans-serif`; tmp.font=fontStr;
  let maxLines=0; const wrapCache=new Map();
  sel.forEach(e=>{ if(globalText&&e.showText&&e.tag){ const l=wrapText(tmp,tagLabel(e.tag),cell-pad*2); wrapCache.set(e.id,l); maxLines=Math.max(maxLines,l.length);} });
  const bandH = maxLines>0 ? (maxLines*lineH+pad*2) : 0;
  const cellH = cell+bandH;
  const W=cols*cell+(cols+1)*gap, H=rows*cellH+(rows+1)*gap;

  const cv=document.getElementById("gridCanvas"); cv.width=W; cv.height=H;
  const ctx=cv.getContext("2d"); ctx.clearRect(0,0,W,H);
  if(gridBg!=="transparent"){ ctx.fillStyle=gridBg==="white"?"#ffffff":document.getElementById("optBgColor").value; ctx.fillRect(0,0,W,H); }
  ctx.textAlign="center"; ctx.textBaseline="top"; ctx.font=fontStr; ctx.fillStyle=textColor;

  sel.forEach((e,i)=>{
    const c=i%cols, r=Math.floor(i/cols);
    const x=gap+c*(cell+gap), y=gap+r*(cellH+gap);
    drawFace(ctx,x,y,cell,e);
    const lines=wrapCache.get(e.id);
    if(bandH>0&&lines){ let ty=y+cell+pad; for(const ln of lines){ ctx.fillText(ln,x+cell/2,ty); ty+=lineH; } }
  });
  info.innerHTML=T('grid.info', sel.length, cols, rows, W, H);
}
function wrapText(ctx,text,maxW){
  const out=[];
  for(const raw of String(text).split("\n")){
    if(raw===""){ out.push(""); continue; }
    let line="";
    for(const ch of raw){ if(ctx.measureText(line+ch).width>maxW&&line){ out.push(line); line=ch; } else line+=ch; }
    out.push(line);
  }
  return out;
}
function downloadGrid(){
  const cv=document.getElementById("gridCanvas");
  try{
    cv.toBlob(b=>{ if(!b){ showServerWarn(); return; } downloadBlob(b, `emotion-grid_${stamp()}.png`); }, "image/png");
  }catch(err){ showServerWarn(); }
}
function showServerWarn(){ document.getElementById("serverWarn").hidden=false; toast(T('toast.pngBlocked')); }

/* ============ 工具函式 ============ */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function stamp(){ const d=new Date(),p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; }
function clampNum(id,def,min,max){ let v=parseInt(document.getElementById(id).value,10); if(isNaN(v))v=def; return Math.max(min,Math.min(max,v)); }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function downloadBlob(blob,name){ const u=URL.createObjectURL(blob),a=document.createElement("a"); a.href=u; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(u),1000); }
let toastT; function toast(m){ const t=document.getElementById("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),1900); }

/* ============ 事件綁定 ============ */
function bind(){
  document.getElementById("btnSave").onclick=saveExpr;
  document.getElementById("btnRandom").onclick=randomize;
  document.getElementById("btnPreset").onclick=loadPresets;
  document.getElementById("btnClear").onclick=clearDraft;
  document.getElementById("btnCancelEdit").onclick=clearDraft;
  document.getElementById("btnExport").onclick=exportJSON;
  document.getElementById("btnImport").onclick=()=>document.getElementById("fileImport").click();
  document.getElementById("fileImport").onchange=e=>{ if(e.target.files[0]){ importJSON(e.target.files[0]); e.target.value=""; } };
  document.getElementById("filePart").onchange=e=>{ if(e.target.files.length){ handlePartFiles(e.target.files); e.target.value=""; } };
  document.getElementById("btnGrid").onclick=openGrid;
  document.getElementById("btnCloseModal").onclick=()=>document.getElementById("gridModal").classList.remove("open");
  document.getElementById("btnDownload").onclick=downloadGrid;
  document.getElementById("gridModal").onclick=e=>{ if(e.target.id==="gridModal") e.target.classList.remove("open"); };
  document.getElementById("btnAll").onclick=()=>{ collection.forEach(e=>e.includeInGrid=true); save(); renderCollection(); };
  document.getElementById("btnNone").onclick=()=>{ collection.forEach(e=>e.includeInGrid=false); save(); renderCollection(); };
  document.getElementById("btnDelSel").onclick=deleteSelected;
  document.getElementById("btnClearAll").onclick=clearAll;
  ["optCols","optCell","optGap","optFont","optText","optTextColor","optBgColor"].forEach(id=>{
    document.getElementById(id).oninput=()=>{ if(document.getElementById("gridModal").classList.contains("open")) buildGrid(); };
  });
  document.getElementById("optBg").querySelectorAll("button").forEach(b=>{
    b.onclick=()=>{ document.getElementById("optBg").querySelectorAll("button").forEach(x=>x.classList.remove("on")); b.classList.add("on");
      gridBg=b.dataset.bg; document.getElementById("optBgColor").hidden=(gridBg!=="custom"); buildGrid(); };
  });
  window.addEventListener("keydown",e=>{ if(e.key==="Escape") document.getElementById("gridModal").classList.remove("open"); });
}

/* ============ 啟動 ============ */
(async function init(){
  load(); bind(); refreshEditor(); renderCollection();   // 立即顯示 UI
  try{ await preloadAll(); }                              // 供 canvas 合成用的預先載入
  catch(src){ toast(T('toast.imageLoadFailed', src)); }
})();

I18N.mountSwitcher(document.getElementById('localeSelect'));
I18N.onChange(() => {
  refreshEditor();       // 重繪面板（分類標題、部件標籤）、裝飾堆疊、預覽
  renderCollection();    // 重繪收藏清單（標籤、摘要）
  if (document.getElementById('gridModal').classList.contains('open')) buildGrid(); // 若合併圖視窗開啟中，重繪其文字
});
