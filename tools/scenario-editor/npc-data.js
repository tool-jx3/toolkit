/* 劇本排版台（TRPG Toolkit 收錄版）：NPC 卡的各系統資料
 * 上游：sedn14636361/trpg-scenario-editor v3.3.0，CC0 1.0。
 * Emoklore TRPG／Double Cross 3rd／克蘇魯神話 TRPG 的能力值、技能、共鳴感情、症候群等名稱，
 * 會存進原稿、也會原樣輸出成 CCFOLIA 的棋子資料，所以保留上游的日文原文（不隨介面語言改變）。
 * 本檔要在 app.js 之前載入（兩者共用全域的 const）。 */
/* 參考：能力值／技能的項目與範圍，依據各系統的官方規則與實際角色卡。
   自動計算只實作能確認依據的公式（DX3rd 的 HP 最大值、CoC 的 DB／體格因無法確定公式，改為手動）。 */
const EMOKLORE_AB  = [['body','身体'],['dex','器用'],['mind','精神'],['sense','五感'],['int','知力'],['cha','魅力'],['soc','社会'],['luck','運勢']];
const DX3RD_AB     = [['body','肉体'],['sense','感覚'],['mind','精神'],['soc','社会']];
/* ---- Emoklore TRPG 官方技能一覽 ----
   出處：官方規則書「技能一覽」。
   參照能力已與官方表格，以及填寫完成的實際角色卡上 19 項技能（判定值＝技能 Lv＋參照能力）
   比對確認一致。參照能力為選擇式的 16 項技能，兩者也完全一致。
   div 是參照能力要除以的數。只加在官方表格寫著「÷2」的技能上。
   小數無條件進位（已確認與官方角色卡的棋子輸出「1DM<=1 〈＊急救〉」＝知力 1 時為 1 一致）。
   kind: base=基本技能（標記為 *）／ex=EX 技能（★）／normal=一般技能／special=〈∞共鳴〉
   arg: true 表示像〈○○:△△〉那樣要附註種類的技能 */
const EMO_AB_LABEL = {body:'身体',dex:'器用',mind:'精神',sense:'五感',int:'知力',cha:'魅力',soc:'社会',luck:'運勢'};
const EMO_SKILLS = [
  {n:'〈*調査〉',      cat:'調査系', kind:'base',   refs:['dex']},
  {n:'〈検索〉',       cat:'調査系', kind:'normal', refs:['int']},
  {n:'〈洞察〉',       cat:'調査系', kind:'normal', refs:['int']},
  {n:'〈マッピング〉', cat:'調査系', kind:'normal', refs:['dex','sense']},
  {n:'〈直感〉',       cat:'調査系', kind:'normal', refs:['mind','luck']},
  {n:'〈鑑定〉',       cat:'調査系', kind:'normal', refs:['sense','int']},

  {n:'〈*知覚〉',      cat:'知覚系', kind:'base',   refs:['sense']},
  {n:'〈観察眼〉',     cat:'知覚系', kind:'normal', refs:['sense']},
  {n:'〈聞き耳〉',     cat:'知覚系', kind:'normal', refs:['sense']},
  {n:'〈毒見〉',       cat:'知覚系', kind:'normal', refs:['sense']},
  {n:'〈危機察知〉',   cat:'知覚系', kind:'normal', refs:['sense','luck']},
  {n:'〈★霊感〉',      cat:'知覚系', kind:'ex',     refs:['mind','luck']},

  {n:'〈*交渉〉',      cat:'交渉系', kind:'base',   refs:['cha']},
  {n:'〈社交術〉',     cat:'交渉系', kind:'normal', refs:['soc']},
  {n:'〈ディベート〉', cat:'交渉系', kind:'normal', refs:['int']},
  {n:'〈魅了〉',       cat:'交渉系', kind:'normal', refs:['cha']},
  {n:'〈心理〉',       cat:'交渉系', kind:'normal', refs:['mind','int']},

  {n:'〈*知識〉',        cat:'情報系', kind:'base',   refs:['int']},
  {n:'〈専門知識:○○〉', cat:'情報系', kind:'normal', refs:['int'],        arg:true},
  {n:'〈*ニュース〉',    cat:'情報系', kind:'base',   refs:['soc']},
  {n:'〈事情通〉',       cat:'情報系', kind:'normal', refs:['sense','soc']},
  {n:'〈業界:○○〉',     cat:'情報系', kind:'normal', refs:['soc','cha'],  arg:true},

  {n:'〈*運動〉',        cat:'運動系', kind:'base',   refs:['body']},
  {n:'〈スピード〉',     cat:'運動系', kind:'normal', refs:['body']},
  {n:'〈ストレングス〉', cat:'運動系', kind:'normal', refs:['body']},
  {n:'〈アクロバット〉', cat:'運動系', kind:'normal', refs:['body','dex']},
  {n:'〈ダイブ〉',       cat:'運動系', kind:'normal', refs:['body']},
  {n:'〈*格闘〉',        cat:'運動系', kind:'base',   refs:['body']},
  {n:'〈武術:○○〉',     cat:'運動系', kind:'normal', refs:['body'],             arg:true},
  {n:'〈★奥義:○○〉',    cat:'運動系', kind:'ex',     refs:['body','mind','dex'],arg:true},
  {n:'〈*投擲〉',        cat:'運動系', kind:'base',   refs:['dex']},
  {n:'〈★射撃:○○〉',    cat:'運動系', kind:'ex',     refs:['dex','sense'],      arg:true},

  {n:'〈*生存〉',   cat:'生存系', kind:'base',   refs:['body']},
  {n:'〈耐久〉',    cat:'生存系', kind:'normal', refs:['body']},
  {n:'〈*自我〉',   cat:'生存系', kind:'base',   refs:['mind']},
  {n:'〈根性〉',    cat:'生存系', kind:'normal', refs:['mind']},
  {n:'〈*手当て〉', cat:'生存系', kind:'base',   refs:['int'],        div:{int:2}},
  {n:'〈医術〉',    cat:'生存系', kind:'normal', refs:['dex','int']},
  {n:'〈★蘇生〉',   cat:'生存系', kind:'ex',     refs:['int','mind'], div:{mind:2}},

  {n:'〈*細工〉',    cat:'特殊技能', kind:'base',   refs:['dex']},
  {n:'〈技巧:○○〉', cat:'特殊技能', kind:'normal', refs:['dex'],                arg:true},
  {n:'〈芸術:○○〉', cat:'特殊技能', kind:'normal', refs:['dex','mind','sense'], arg:true},
  {n:'〈操縦:○○〉', cat:'特殊技能', kind:'normal', refs:['dex','sense','int'],  arg:true},
  {n:'〈暗号〉',     cat:'特殊技能', kind:'normal', refs:['int']},
  {n:'〈電脳〉',     cat:'特殊技能', kind:'normal', refs:['int']},
  {n:'〈隠匿〉',     cat:'特殊技能', kind:'normal', refs:['dex','soc','luck']},
  {n:'〈*幸運〉',    cat:'特殊技能', kind:'base',   refs:['luck']},
  {n:'〈★強運〉',    cat:'特殊技能', kind:'ex',     refs:['luck']},
  {n:'〈∞共鳴〉',   cat:'特殊技能', kind:'special',refs:[]}
];
const EMO_BASE_SKILLS = EMO_SKILLS.filter(x=>x.kind==='base');
/* ---- 共鳴感情一覽（5 種屬性） ----
   出處：官方規則書的共鳴感情一覽。已確認與官方「Howling」頁面中出現的
   嫉妬(情念)・狂気(傷)・支配(関係)・劣等感(傷)・好奇心(欲望)・破壊(欲望) 這 6 項屬性一致。
   表・裏・根源（Roots）三格的屬性並不固定，而是從一覽中選三個分配（建議選不同屬性）。 */
const EMO_EMOTIONS = [
  {k:'望', label:'欲望', items:['自己顕示','所有','本能','破壊','優越感','怠惰','逃避','好奇心','スリル']},
  {k:'念', label:'情念', items:['喜び','怒り','哀しみ','幸福','不安','嫌悪','恐怖','嫉妬','恨み']},
  {k:'想', label:'理想', items:['正義','崇拝','善悪','希望','向上','理性','勝利','秩序','憧憬','無我']},
  {k:'係', label:'関係', items:['友情','愛','恋','依存','尊敬','軽蔑','庇護','支配','奉仕','甘え']},
  {k:'傷', label:'傷',   items:['後悔','孤独','諦観','絶望','否定','疑念','罪悪感','狂気','劣等感']}
];
const EMO_RES_SLOTS = [['omote','表','外に出ている感情'],['ura','裏','内に潜む感情'],['root','ルーツ','人格の根源']];
function emoAttrOf(k){ return EMO_EMOTIONS.find(a=>a.k===k) || null; }
/* 把附種類的技能（〈★射撃:○○〉等）的○○填好後的顯示名稱 */
function emoSkillName(sk){
  const def = emoDefOf(sk.n), arg = String(sk.arg||'').trim();
  if(def && def.arg && arg) return def.n.replace('○○', arg);
  return String(sk.n||'');
}
/* 吸收寫法差異後查找技能。不論寫〈★射撃:拳銃〉還是「射撃」都會對應到同一個定義 */
function emoNorm(v){
  return String(v==null?'':v).trim()
    .replace(/[〈〉《》<>]/g,'').replace(/[*＊★☆∞]/g,'')
    .replace(/[:：].*$/,'').trim();
}
const EMO_SKILL_MAP = {};
EMO_SKILLS.forEach(d=>{ EMO_SKILL_MAP[emoNorm(d.n)] = d; });
function emoDefOf(name){ return EMO_SKILL_MAP[emoNorm(name)] || null; }
/* 參照能力的除法（僅限官方表格中「÷2」的技能）。小數無條件進位 */
function emoDiv(def, ref){ return (def && def.div && def.div[ref]) ? def.div[ref] : 1; }
function emoRefLabel(def){
  if(!def) return '';
  if(!def.refs.length) return '共鳴判定の【強度】';
  return def.refs.map(r=>EMO_AB_LABEL[r] + (emoDiv(def,r)>1 ? '÷'+emoDiv(def,r) : '')).join('／');
}
const EMO_CATS = EMO_SKILLS.reduce((a,d)=>(a.includes(d.cat)?a:a.concat(d.cat)),[]);
function emoNum(v){ const x = parseFloat(String(v==null?'':v).trim()); return isNaN(x)?null:x; }
/* 參照能力的自動選擇：有填能力值的話取較高者（套用 ÷2 之後），
   同值則取先寫的那個。都沒填就回傳第一個參照能力。 */
function emoPickRef(def, ab){
  if(!def || !def.refs.length) return '';
  let best='', bestVal=-Infinity;
  def.refs.forEach(r=>{
    const raw = emoNum(ab[r]); if(raw===null) return;
    const v = Math.ceil(raw / emoDiv(def,r));
    if(v > bestVal){ bestVal = v; best = r; }     // 只有嚴格大於時才更新＝同值時先者勝
  });
  return best || def.refs[0];
}
/* 實際使用的參照能力。有手動選擇就優先，空白則自動選擇 */
function emoSkillRef(sk, ab){
  const manual = String(sk.ref||'').trim();
  if(manual) return manual;
  return emoPickRef(emoDefOf(sk.n), ab);
}
/* 判定值＝技能 Lv＋（參照能力÷div，小數無條件捨去） */
function emoSkillTarget(sk, ab){
  const ref = emoSkillRef(sk, ab); if(!ref) return '';
  const lv = emoNum(sk.lv), raw = emoNum(ab[ref]);
  if(lv===null || raw===null) return '';
  return lv + Math.ceil(raw / emoDiv(emoDefOf(sk.n), ref));
}
/* 基本技能視為 Lv0，所以判定值＝參照能力÷div */
function emoBaseTarget(def, ab){
  const r = def.refs[0]; if(!r) return '';
  const raw = emoNum(ab[r]); if(raw===null) return '';
  return Math.ceil(raw / emoDiv(def, r));
}
/* ---- 症候群（Syndrome，13 種） ----
   出處：Double Cross The 3rd Edition 的基本 12 種症候群＋Ouroboros。
   血統（Breed）依 Pure=1 / Cross=2 / Tri=3 種來選。
   顏色為了在紙（米白色）上容易分辨，刻意把色相分散開來挑選。 */
const DX3RD_SYN = [
  {k:'angel', n:'エンジェルハイロゥ', c:'#b8912f'},
  {k:'balor', n:'バロール',           c:'#6b3fa0'},
  {k:'bdog',  n:'ブラックドッグ',     c:'#1f4e8c'},
  {k:'bram',  n:'ブラム＝ストーカー', c:'#8e1420'},
  {k:'chim',  n:'キュマイラ',         c:'#7a4a24'},
  {k:'exile', n:'エグザイル',         c:'#4a7a3a'},
  {k:'hanu',  n:'ハヌマーン',         c:'#d2691e'},
  {k:'morph', n:'モルフェウス',       c:'#5f6b73'},
  {k:'neum',  n:'ノイマン',           c:'#128a86'},
  {k:'orcus', n:'オルクス',           c:'#23201c'},
  {k:'sala',  n:'サラマンダー',       c:'#d1402a'},
  {k:'sola',  n:'ソラリス',           c:'#8ea628'},
  {k:'uro',   n:'ウロボロス',         c:'#a02f7a'}
];
/* 效果（Effect）的種類。13 種症候群，再加上 2 種不屬於症候群的，共 15 種。 */
const DX3RD_KIND = DX3RD_SYN.concat([
  {k:'easy',  n:'イージー', c:'#9a9184'},
  {k:'works', n:'ワークス', c:'#4f4636'}
]);
const DX3RD_BREEDS = [['pure','ピュア',1],['cross','クロス',2],['tri','トライ',3]];
function dxBreedN(b){ const x=DX3RD_BREEDS.find(v=>v[0]===b); return x?x[2]:0; }
function dxSynOf(k){ return DX3RD_SYN.find(x=>x.k===k) || null; }
function dxKindOf(k){ return DX3RD_KIND.find(x=>x.k===k) || null; }
/* 把選好的症候群組成「Balor／Neumann」的形式 */
function dxSynText(d){
  const n = dxBreedN(d.breed) || (d.syns||[]).filter(Boolean).length;
  return (d.syns||[]).slice(0, n||3).map(k=>{const x=dxSynOf(k); return x?x.n:'';})
    .filter(Boolean).join('／');
}
const COC_AB       = [['str','STR'],['con','CON'],['pow','POW'],['dex','DEX'],['app','APP'],['siz','SIZ'],['int','INT'],['edu','EDU']];
/* ---- Double Cross 3rd 技能 ----
   出處：Yutosheet II for DX3rd 的排列。放在哪個能力值底下就決定了參照能力。
   arg:true 表示像〈運転:○○〉那樣要附註種類的技能。 */
const DX3RD_SKILL_DEFS = [
  {k:'melee',    n:'白兵', ab:'body'},
  {k:'dodge',    n:'回避', ab:'body'},
  {k:'ride',     n:'運転', ab:'body',  arg:true},
  {k:'ranged',   n:'射撃', ab:'sense'},
  {k:'percept',  n:'知覚', ab:'sense'},
  {k:'art',      n:'芸術', ab:'sense', arg:true},
  {k:'rc',       n:'RC',   ab:'mind'},
  {k:'will',     n:'意志', ab:'mind'},
  {k:'know',     n:'知識', ab:'mind',  arg:true},
  {k:'negotiate',n:'交渉', ab:'soc'},
  {k:'procure',  n:'調達', ab:'soc'},
  {k:'info',     n:'情報', ab:'soc',   arg:true}
];
/* ---- 克蘇魯神話 TRPG 技能一覽 ----
   出處：角色卡製作工具「Iachara」的第 6 版／第 7 版角色卡。
   只收錄技能名稱。從該工具擷取的初始值有欄位錯位的問題
   （與提供的實際棋子「拳擊 50・閃避 0」不一致），為了不填入錯誤的數值，不做自動填寫。 */
const COC_SKILLS = {
  '6':[
    ['戦闘', ['回避','キック','組み付き','こぶし（パンチ）','頭突き','投擲','マーシャルアーツ','拳銃','サブマシンガン','ショットガン','マシンガン','ライフル']],
    ['探索', ['応急手当','鍵開け','隠す','隠れる','聞き耳','忍び歩き','写真術','精神分析','追跡','登攀','図書館','目星']],
    ['行動', ['運転','機械修理','重機械操作','乗馬','水泳','製作','操縦','跳躍','電気修理','ナビゲート','変装']],
    ['交渉', ['言いくるめ','信用','説得','値切り','母国語']],
    ['知識', ['医学','オカルト','化学','クトゥルフ神話','芸術','経理','考古学','コンピューター','心理学','人類学','生物学','地質学','電子工学','天文学','博物学','物理学','法律','薬学','歴史']]
  ],
  '7':[
    ['戦闘', ['回避','近接戦闘','投擲','射撃']],
    ['探索', ['応急手当','鍵開け','手さばき','聞き耳','隠密','精神分析','追跡','登攀','図書館','目星','鑑定']],
    ['行動', ['運転','機械修理','重機械操作','乗馬','水泳','芸術','製作','操縦','跳躍','電気修理','ナビゲート','変装']],
    ['交渉', ['言いくるめ','信用','説得','母国語','ほかの言語','威圧','魅惑']],
    ['知識', ['医学','オカルト','クトゥルフ神話','経理','考古学','コンピューター','科学','心理学','人類学','電子工学','自然','法律','歴史','サバイバル','伝承']]
  ]
};
/* 要附註專業領域（種類）的技能。
   第 7 版是官方標有「(専)」的技能（近戰・射擊・駕駛・製作・操縱・藝術・科學・
   生存・其他語言・傳承）再加上母語。
   其他技能不顯示種類欄。 */
const COC_ARG_SKILLS = {
  '6':['芸術','製作','母国語','操縦','運転'],
  '7':['近接戦闘','射撃','運転','製作','操縦','芸術','科学','サバイバル','ほかの言語','伝承','母国語']
};
function cocNeedsArg(ver, name){
  const n = String(name||'').trim(); if(!n) return false;
  return COC_ARG_SKILLS[ver==='6'?'6':'7'].indexOf(n) >= 0;
}
function cocCats(ver){ return COC_SKILLS[ver==='6'?'6':'7'].map(x=>x[0]); }
function cocSkillsOf(ver,cat){
  const t=COC_SKILLS[ver==='6'?'6':'7'];
  return cat ? (t.find(x=>x[0]===cat)||['',[]])[1] : t.reduce((a,x)=>a.concat(x[1]),[]);
}
/* 組出附種類的技能名稱（例：駕駛:機車） */
function withArg(name, arg){
  const a=String(arg||'').trim();
  return a ? name+':'+a : name;
}
/* CoC 各版能力值的位數不同（第 6 版＝3D6 等的原始值／第 7 版＝×5 後的百分比），所以候選清單分開 */
const COC6_LIST = {str:'dl-coc6a',con:'dl-coc6a',pow:'dl-coc6a',dex:'dl-coc6a',app:'dl-coc6a',siz:'dl-coc6b',int:'dl-coc6b',edu:'dl-coc6e'};
const COC7_LIST = {str:'dl-coc7a',con:'dl-coc7a',pow:'dl-coc7a',dex:'dl-coc7a',app:'dl-coc7a',siz:'dl-coc7b',int:'dl-coc7b',edu:'dl-coc7b'};
