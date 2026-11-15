/**
 * 產生的文字：故事梗概、純文字檔、劇本文件（畫面上的預覽、列印、HTML 共用同一份 HTML）、
 * 劇本排版台（scenario-editor）可以貼上的 markdown。
 */
import { escapeHtml } from '@/core/html';
import { type Deck, findMission, findTone } from '../data';
import { S } from '../strings';
import {
  cluesFor,
  isPlaced,
  isPlotBlank,
  plotLabels,
  plotTextLines,
  reviewPlot,
  writtenClues,
} from './plot';
import {
  activeKeys,
  bondTargetName,
  bondTargetOf,
  catName,
  DESK_GROUPS,
  npcChoices,
  pcDisplayName,
  pcKeys,
  promptOf,
  relKey,
  replyOf,
  type Scenario,
  STORY_KEYS,
  secKey,
  slotCard,
  slotCat,
  slotWho,
  titleOf,
  toneSlotName,
} from './scenario';

/* ---------- 故事梗概 ---------- */

export type BriefPartId = 'scene' | 'path' | 'backstage' | 'landing' | 'blanks';

export interface BriefPart {
  id: BriefPartId;
  label: string;
  lines: string[];
}

/** 故事梗概：開場、往前走、幕後（只給 GM）、收尾、留給 GM 的空格 */
export type Brief = BriefPart[];

/** 真相的「幕後」一段：{stage} 換成舞台，第一個 {tone} 寫成「焦點名「卡名」」，之後只寫「卡名」 */
export function fillTone(template: string, toneTitle: string, slot: string, stage: string): string {
  let n = 0;
  return template.replace(/\{stage\}/g, stage).replace(/\{tone\}/g, () => {
    n++;
    return n === 1 ? S.syn.toneFirst(slot, toneTitle) : S.syn.toneAgain(toneTitle);
  });
}

/** 故事梗概（餘韻以外的八張故事的卡都抽到之後才有；餘韻沒有時「收尾」少兩句） */
export function briefOf(deck: Deck, sc: Scenario): Brief | null {
  const g = (k: string) => slotCard(deck, sc, k);
  const st = g('stage');
  const it = g('intro');
  const tn = g('tone');
  const cl = g('clue');
  const np = g('npc');
  const ob = g('obstacle');
  const tr = g('truth');
  const en = g('ending');
  if (!st || !it || !tn || !cl || !np || !ob || !tr || !en) return null;
  const L = S.doc.labels;
  const slot = toneSlotName(deck, sc);
  const opener = (findTone(deck, sc.tone)?.opener ?? '「{title}」。').replace('{title}', tn.title);
  const co = g('core');
  const climax = replyOf(sc, 'core');
  const landing = [S.syn.ending(en.title, en.text)];
  if (co) {
    landing.push(S.syn.core(co.title, co.text));
    landing.push(S.syn.climax(climax || co.answers[0], !!climax));
  }
  return [
    { id: 'scene', label: L.scene, lines: [S.syn.scene(it.title, st.title), opener] },
    {
      id: 'path',
      label: L.path,
      lines: [S.syn.path(cl.title, sc.npc.name.trim() || np.title, ob.title)],
    },
    {
      id: 'backstage',
      label: L.backstage,
      lines: [fillTone(tr.synopsis ?? tr.text, tn.title, slot, st.title)],
    },
    { id: 'landing', label: L.landing, lines: landing },
    {
      id: 'blanks',
      label: L.blanks,
      lines: [
        S.syn.blank(S.cats.truth, promptOf(deck, sc, 'truth')),
        S.syn.blank(slot, promptOf(deck, sc, 'tone')),
        S.syn.blank(S.cats.ending, promptOf(deck, sc, 'ending')),
      ],
    },
  ];
}

/** 題材與氣氛的標示（「解謎・陰森」） */
export function themeLabel(deck: Deck, sc: Pick<Scenario, 'mission' | 'tone'>): string {
  const m = findMission(deck, sc.mission);
  const t = findTone(deck, sc.tone);
  return m && t ? S.mt.summary(m.name, t.name) : (m?.name ?? t?.name ?? '');
}

/** 故事的欄與 PC 的欄（依文件的順序） */
export function orderedKeys(sc: Scenario): string[] {
  return [...STORY_KEYS, ...pcKeys(sc)];
}

/** 回答了幾題（文件的標頭、清單的進度） */
export function answerProgress(sc: Scenario): { answered: number; total: number } {
  const keys = activeKeys(sc).filter((k) => !!sc.slots[k]?.card);
  return { answered: keys.filter((k) => !!replyOf(sc, k)).length, total: keys.length };
}

/* ---------- 純文字檔 ---------- */

function peopleLines(deck: Deck, sc: Scenario): string[] {
  const T = S.text;
  const out: string[] = [];
  for (let i = 1; i <= sc.pcCount; i++) {
    out.push(T.pcLine(pcDisplayName(sc, i), sc.pcs[i - 1].role.trim()));
    out.push(T.bondLine(bondTargetName(deck, sc, bondTargetOf(deck, sc, i))));
  }
  const npc = slotCard(deck, sc, 'npc');
  if (npc) {
    const nm = sc.npc.name.trim();
    out.push(T.npcLine(nm ? `${nm}（${npc.title}）` : npc.title));
    if (sc.npc.tie.trim()) out.push(T.tieLine(sc.npc.tie.trim()));
  }
  sc.extras.forEach((x, i) => {
    const label = x.name.trim() || S.cast.extraNpc(i + 1);
    out.push(T.npcLine(x.role.trim() ? `${label}（${x.role.trim()}）` : label));
    if (x.tie.trim()) out.push(T.tieLine(x.tie.trim()));
  });
  return out;
}

/** 純文字檔的內容（劇本名、題材與氣氛、故事梗概、角色、推理題與場景表、每張卡的提問與回答） */
export function scenarioText(deck: Deck, sc: Scenario): string {
  const T = S.text;
  const out: string[] = [titleOf(deck, sc), ''];
  const m = findMission(deck, sc.mission);
  const t = findTone(deck, sc.tone);
  if (m || t) out.push(T.mt(m?.name ?? S.undecided, t?.name ?? S.undecided), '');
  const brief = briefOf(deck, sc);
  if (brief) {
    out.push(T.synopsis);
    for (const p of brief) out.push(`〔${p.label}〕`, ...p.lines);
    out.push('');
  }
  if (sc.phase === 'done') out.push(T.cast, ...peopleLines(deck, sc), '');
  if (sc.phase === 'done' && !isPlotBlank(sc.plot)) out.push(T.plot, ...plotTextLines(sc.plot), '');
  out.push(T.skeleton);
  for (const k of orderedKeys(sc)) {
    const card = slotCard(deck, sc, k);
    if (!card) continue;
    out.push(T.cardLine(catName(deck, sc, slotCat(k)), slotWho(deck, sc, k), card.title));
    out.push(`　${card.text}`);
    out.push(T.question(promptOf(deck, sc, k)));
    const a = replyOf(sc, k);
    if (a) out.push(T.answer(a.replace(/\n/g, T.answerIndent)));
  }
  return `${out.join('\n')}\n`;
}

/* ---------- 劇本文件（HTML） ---------- */

const e = escapeHtml;
const br = (t: string) => e(t).replace(/\n/g, '<br>');

/** 一張卡：種類與卡名在左，說明、提問與回答在右（紙窄時疊成一欄） */
function itemHtml(deck: Deck, sc: Scenario, key: string, extra = ''): string {
  const card = slotCard(deck, sc, key);
  if (!card) return '';
  const a = replyOf(sc, key);
  const who = slotWho(deck, sc, key);
  return `<div class="pdk-item${extra}" data-doc-card="${key}"><div class="pdk-item-key"><span class="pdk-kind">${e(catName(deck, sc, slotCat(key)))}${who ? `・${e(who)}` : ''}</span><h3 class="pdk-item-name">${e(card.title)}</h3></div><div class="pdk-item-body"><p class="pdk-gist">${e(card.text)}</p><p class="pdk-ask"><span class="pdk-ask-tag">${S.doc.question}</span>${e(promptOf(deck, sc, key))}</p><p class="pdk-reply${a ? '' : ' is-blank'}">${a ? br(a) : S.doc.unanswered}</p></div></div>`;
}

const part = (id: string, title: string, body: string) =>
  `<section class="pdk-part" data-doc-section="${id}"><h2 class="pdk-heading">${e(title)}</h2>${body}</section>`;

function plotHtml(sc: Scenario): string {
  const plot = sc.plot;
  if (isPlotBlank(plot)) return '';
  const no = plotLabels(plot);
  const D = S.doc;
  const clueLi = (c: (typeof plot.clues)[number]) => {
    const to = c.links.map((x) => no[x]).filter(Boolean);
    return `<li class="pdk-clue"><span class="pdk-tag">${no[c.id]}</span><span class="pdk-clue-text">${br(c.text.trim())}</span>${c.how.trim() ? `<span class="pdk-clue-how">${e(c.how.trim())}</span>` : ''}${to.length ? `<span class="pdk-clue-to">→ ${to.join('、')}</span>` : ''}</li>`;
  };
  const puzzles = plot.deductions
    .map((d) => {
      const cs = cluesFor(plot, d.id);
      return `<li class="pdk-puzzle"><span class="pdk-tag">${no[d.id]}</span><span>${e(d.text.trim() || S.plot.unwritten)}</span><span class="pdk-count${cs.length < 3 ? ' is-short' : ''}">${D.clueCount(
        cs.length,
        cs.map((c) => no[c.id]),
      )}</span></li>`;
    })
    .join('');
  const scenes = plot.scenes
    .map((s) => {
      const cs = plot.clues.filter((c) => c.scene === s.id && c.text.trim());
      return `<div class="pdk-scene"><p class="pdk-scene-title"><span class="pdk-tag">${no[s.id]}</span>${e(s.name.trim() || S.plot.noName)}${s.place.trim() ? `<span class="pdk-scene-place">＠${e(s.place.trim())}</span>` : ''}</p>${s.what.trim() ? `<p class="pdk-scene-what">${br(s.what.trim())}</p>` : ''}${cs.length ? `<ul class="pdk-clues">${cs.map(clueLi).join('')}</ul>` : ''}</div>`;
    })
    .join('');
  const unplaced = writtenClues(plot).filter((c) => !isPlaced(plot, c));
  const rest = unplaced.length
    ? `<div class="pdk-scene"><p class="pdk-scene-title">${D.unplacedClues}</p><ul class="pdk-clues">${unplaced.map(clueLi).join('')}</ul></div>`
    : '';
  return part(
    'plot',
    D.sections.plot,
    `<h3 class="pdk-sub">${D.deductions}</h3><ol class="pdk-puzzles">${puzzles}</ol><h3 class="pdk-sub">${D.scenes}</h3>${scenes}${rest}`,
  );
}

/** 劇本文件的 HTML（`<article class="pdk-paper">`；樣式是 PRINT_STYLE） */
export function documentHtml(deck: Deck, sc: Scenario, now = new Date()): string {
  const brief = briefOf(deck, sc);
  const D = S.doc;
  const core = slotCard(deck, sc, 'core');
  const { answered, total } = answerProgress(sc);
  const facts = [
    D.meta.pcs(sc.pcCount, sc.useSecrets),
    themeLabel(deck, sc),
    core ? D.meta.core(core.title) : '',
    sc.madeBy ? D.madeBy[sc.madeBy] : '',
    D.meta.answered(answered, total),
    D.date(now),
  ]
    .filter(Boolean)
    .map((f) => `<li>${e(f)}</li>`)
    .join('');
  const briefBody = brief
    ? `<dl class="pdk-brief">${brief
        .map(
          (p) =>
            `<div class="pdk-row${p.id === 'backstage' ? ' is-gm' : ''}"><dt>${e(p.label)}</dt><dd>${p.lines.map((l) => `<p>${e(l)}</p>`).join('')}</dd></div>`,
        )
        .join('')}</dl>`
    : `<p class="pdk-blank">${D.synopsisEmpty}</p>`;
  const groups = DESK_GROUPS.map((g) =>
    part(g.id, D.sections[g.id], g.keys.map((k) => itemHtml(deck, sc, k)).join('')),
  ).join('');
  const pcs = Array.from({ length: sc.pcCount }, (_, k) => {
    const i = k + 1;
    const p = sc.pcs[k];
    return `<div class="pdk-pc" data-doc-pc="${i}"><p class="pdk-pc-line"><span class="pdk-tag">${S.cast.pc(i)}</span><strong>${e(p.name.trim() || D.pcName)}</strong>${p.role.trim() ? `<span class="pdk-pc-role">${e(p.role.trim())}</span>` : ''}<span class="pdk-pc-bond">${e(D.bondTarget(bondTargetName(deck, sc, bondTargetOf(deck, sc, i))))}</span></p>${itemHtml(deck, sc, relKey(i))}${sc.useSecrets ? itemHtml(deck, sc, secKey(i), ' is-secret') : ''}</div>`;
  }).join('');
  const npcCard = slotCard(deck, sc, 'npc');
  const npcs = [
    npcCard
      ? `<li><strong>${e(sc.npc.name.trim() || npcCard.title)}</strong><span class="pdk-npc-what">${e(npcCard.title)}</span><span class="pdk-npc-tie">${br(sc.npc.tie.trim() || D.npcTie)}</span></li>`
      : '',
    ...sc.extras.map(
      (x, i) =>
        `<li><strong>${e(x.name.trim() || S.cast.extraNpc(i + 1))}</strong><span class="pdk-npc-what">${e(x.role.trim())}</span><span class="pdk-npc-tie">${br(x.tie.trim() || D.npcTie)}</span></li>`,
    ),
  ].join('');
  const cast = `${pcs}${npcs ? `<h3 class="pdk-sub">${D.npcs}</h3><ul class="pdk-npcs">${npcs}</ul>` : ''}${sc.useSecrets ? `<p class="pdk-warn">${D.secretNote}</p>` : ''}`;
  return `<article class="pdk-paper" lang="zh-Hant-TW"><header class="pdk-top"><p class="pdk-over">${e(D.kicker(deck.name))}<span class="pdk-gm">${D.gmOnly}</span></p><h1 class="pdk-name">${e(titleOf(deck, sc))}</h1><ul class="pdk-facts">${facts}</ul></header>${part('synopsis', D.sections.synopsis, briefBody)}${groups}${plotHtml(sc)}${part('cast', D.sections.cast, cast)}</article>`;
}

/**
 * 文件的樣式：紙一律是淺色（深色主題時也一樣，印出來是紙）；顏色與字型取本站淺色主題的 token 值
 * （--text、--text-muted、--border、--surface-2、--accent、--font-ui），只用 .pdk- 開頭的 class。
 * 版面是一欄的「標籤＋內容」列；紙寬 640 px 以上時，標籤靠左成一欄。列印與 HTML 用同一份。
 */
export const PRINT_STYLE = `.pdk-paper{--pdk-ink:#1c1b19;--pdk-soft:#5b5751;--pdk-rule:#dcd6cc;--pdk-wash:#f0ede8;--pdk-mark:#6a4c9c;--pdk-mark-wash:rgb(106 76 156 / 0.08);box-sizing:border-box;max-width:880px;margin:0 auto;padding:24px 20px 28px;background:#fff;color:var(--pdk-ink);font-family:'Noto Sans TC','PingFang TC','Heiti TC','Microsoft JhengHei','微軟正黑體','Noto Sans CJK TC','Source Han Sans TC',system-ui,sans-serif;font-size:14px;line-height:1.7;border:1px solid var(--pdk-rule);border-radius:12px}
.pdk-paper *,.pdk-paper *::before,.pdk-paper *::after{box-sizing:border-box}
.pdk-paper p,.pdk-paper ul,.pdk-paper ol,.pdk-paper dl,.pdk-paper dd,.pdk-paper h1,.pdk-paper h2,.pdk-paper h3{margin:0}
.pdk-top{padding-bottom:14px;border-bottom:1px solid var(--pdk-rule)}
.pdk-over{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;color:var(--pdk-soft)}
.pdk-gm{padding:1px 8px;border-radius:999px;background:var(--pdk-mark);color:#fff;font-weight:700}
.pdk-name{margin-top:6px;font-size:24px;line-height:1.35;font-weight:700;overflow-wrap:anywhere}
.pdk-facts{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:10px;padding:0;list-style:none;font-size:12px;color:var(--pdk-soft)}
.pdk-facts li{padding:0 8px;border:1px solid var(--pdk-rule);border-radius:999px}
.pdk-part{margin-top:22px}
.pdk-heading{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:17px;font-weight:700;color:var(--pdk-mark)}
.pdk-heading::after{content:'';flex:1;height:1px;background:var(--pdk-rule)}
.pdk-sub{margin:14px 0 6px;font-size:14px;font-weight:700}
.pdk-brief{display:grid;gap:8px}
.pdk-row{display:grid;gap:2px;padding:8px 10px;border-radius:8px;background:var(--pdk-wash)}
.pdk-row dt{font-size:12px;font-weight:700;color:var(--pdk-soft)}
.pdk-row dd p+p{margin-top:4px}
.pdk-row.is-gm{background:var(--pdk-mark-wash)}
.pdk-row.is-gm dt{color:var(--pdk-mark)}
.pdk-blank{color:var(--pdk-soft)}
.pdk-item{display:grid;gap:6px;padding:10px 0;border-top:1px dashed var(--pdk-rule);break-inside:avoid}
.pdk-heading+.pdk-item{border-top:0}
.pdk-kind{font-size:12px;color:var(--pdk-mark);font-weight:700}
.pdk-item-name{font-size:15px;line-height:1.45;font-weight:700}
.pdk-gist{font-size:13px;color:var(--pdk-soft)}
.pdk-ask{margin-top:4px;font-size:13px}
.pdk-ask-tag{margin-right:6px;font-size:12px;font-weight:700;color:var(--pdk-mark)}
.pdk-reply{margin-top:4px;padding:6px 10px;border-radius:8px;background:var(--pdk-wash);overflow-wrap:anywhere}
.pdk-reply.is-blank{background:transparent;padding-left:0;color:var(--pdk-soft);font-size:12.5px}
.pdk-item.is-secret .pdk-reply{background:var(--pdk-mark-wash)}
.pdk-tag{display:inline-block;min-width:28px;margin-right:8px;padding:0 6px;border-radius:6px;background:var(--pdk-ink);color:#fff;font-size:12px;font-weight:700;text-align:center}
.pdk-puzzles,.pdk-clues,.pdk-npcs{display:grid;gap:4px;padding:0;list-style:none}
.pdk-puzzle{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 0}
.pdk-count{margin-left:auto;padding-left:12px;font-size:12px;color:var(--pdk-soft)}
.pdk-count.is-short{color:var(--pdk-mark);font-weight:700}
.pdk-scene{margin-top:10px;padding:8px 10px;border-left:3px solid var(--pdk-mark);break-inside:avoid}
.pdk-scene-title{font-weight:700}
.pdk-scene-place{margin-left:6px;font-weight:400;font-size:12.5px;color:var(--pdk-soft)}
.pdk-scene-what{margin-top:4px;font-size:13.5px}
.pdk-clues{margin-top:6px}
.pdk-clue{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;font-size:13px}
.pdk-clue .pdk-tag{background:var(--pdk-mark)}
.pdk-clue-how,.pdk-clue-to{font-size:12px;color:var(--pdk-soft)}
.pdk-pc{margin-top:12px;break-inside:avoid}
.pdk-pc-line{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px}
.pdk-pc-role,.pdk-pc-bond{font-size:12.5px;color:var(--pdk-soft)}
.pdk-npcs li{display:grid;gap:0 10px;padding:6px 0;border-top:1px dashed var(--pdk-rule);break-inside:avoid}
.pdk-npc-what{font-size:12.5px;color:var(--pdk-soft)}
.pdk-npc-tie{font-size:13.5px}
.pdk-warn{margin-top:12px;font-size:12.5px;color:var(--pdk-mark);font-weight:700}
@media (min-width:640px){.pdk-paper{padding:32px 36px 36px}.pdk-name{font-size:27px}.pdk-row{grid-template-columns:8.5em minmax(0,1fr);column-gap:14px}.pdk-item{grid-template-columns:12em minmax(0,1fr);column-gap:18px}.pdk-npcs li{grid-template-columns:10em minmax(0,1fr)}.pdk-npc-tie{grid-column:2}}
@media print{.pdk-paper{max-width:none;padding:0;border:0;border-radius:0}.pdk-paper *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;

/** 匯出的 HTML（一個獨立的檔案） */
export function documentFile(deck: Deck, sc: Scenario, now = new Date()): string {
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(titleOf(deck, sc))}</title><style>body{margin:0;padding:20px 10px;background:#f6f4f0}${PRINT_STYLE}</style></head><body>${documentHtml(deck, sc, now)}</body></html>\n`;
}

/* ---------- 送去劇本排版台（markdown） ---------- */

/**
 * 劇本排版台照 markdown 讀原稿（scenario-editor 的 `mdParse`）：行首的 ``` ~~~、# 標題、--- 橫線、![]() 圖片、
 * :: 寫法會變成別的區塊；段落的第一行開頭是「」『』※＊【判定】（場景）之類的，會被猜成台詞、注釋、特殊區塊或場景。
 * 寫的字照原樣保留，只在會被誤認的行首加一個零寬空格（U+200B；看不見，`trim` 也不會去掉），
 * 並把空行拿掉（不然一段會被切成好幾段，下一段的開頭又會被猜一次）。
 */
const ZW = '​';
const MD_BLOCK_START = [
  /^ {0,3}(`{3,}|~{3,})/,
  /^ {0,3}#{1,6}(?=[ \t]|$)/,
  /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  /^ {0,3}!\[/,
  /^ {0,3}[:：]{2,}/,
];
/** 段落第一行的開頭會被猜成別的書式 */
const MD_GUESS_START =
  /^[「『※＊]|^【?(技能判定|判定|技能檢定|檢定|特殊ルール|特殊規則)】?|^[（(【[]?(シーン|場面|場景)/;
/** 段落第一行的任何地方有這些時會被猜成別的書式 */
const MD_GUESS_ANYWHERE = [
  /[〈《]\S+[〉》].*(成功|失敗|ロール|判定|檢定)/,
  /(へ|に)(移行|移動|続く)[。．]?$/,
];

/** 寫的字分成行：空行拿掉，會被當成寫法的行首加零寬空格（圍起來的寫法裡也用這個） */
function mdLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((ln) => ln.trim())
    .map((ln) => (MD_BLOCK_START.some((r) => r.test(ln)) ? `${ZW}${ln}` : ln));
}

/** 一段描述文：`label` 接在第一行前面；第一行會被猜成別的書式時，標籤自己成一行（沒有標籤時放一個零寬空格） */
function mdPara(label: string, text: string): string[] {
  const lines = mdLines(text);
  if (!lines.length) return [];
  const first = `${label}${lines[0]}`.trim();
  if (MD_GUESS_ANYWHERE.some((r) => r.test(first))) return [label.trim() || ZW, ...lines, ''];
  if (!label && MD_GUESS_START.test(first)) lines[0] = `${ZW}${lines[0]}`;
  return [`${label}${lines[0]}`, ...lines.slice(1), ''];
}

/** 標籤（[…]）裡不能有 ] 與換行 */
const mdLabel = (t: string) => t.replace(/[\]］\n\r]/g, ' ').trim();
/** 表格的儲存格裡不能有 | 與換行 */
const mdCell = (t: string) => t.replace(/[|｜]/g, '／').replace(/\r?\n/g, ' ').trim();
/** # 後面只能有一行 */
const mdHead = (t: string) => t.replace(/\r?\n/g, ' ').trim();

function mdCard(deck: Deck, sc: Scenario, key: string): string[] {
  const card = slotCard(deck, sc, key);
  if (!card) return [];
  const who = slotWho(deck, sc, key);
  return [
    `## ${catName(deck, sc, slotCat(key))}${who ? `（${mdHead(who)}）` : ''}：${card.title}`,
    '',
    ...mdPara('', card.text),
    `:::note[${S.doc.question}]`,
    ...mdLines(promptOf(deck, sc, key)),
    ':::',
    '',
    ...mdPara(S.md.reply, replyOf(sc, key)),
  ];
}

/**
 * 給劇本排版台貼上的 markdown：主標題、副標題，每一節是 #、每張卡是 ##（提問放在注釋裡）、每位 PC 一份手冊（秘密寫在裡面）、
 * NPC 是 NPC 卡、線索是表格。
 */
export function editorMarkdown(deck: Deck, sc: Scenario): string {
  const D = S.doc;
  const out: string[] = [];
  out.push(':::title', ...mdLines(titleOf(deck, sc)), ':::', '');
  out.push(
    ':::subtitle',
    ...mdLines(
      S.md.subtitle(deck.name, themeLabel(deck, sc), D.meta.pcs(sc.pcCount, sc.useSecrets)),
    ),
    ':::',
    '',
  );
  const brief = briefOf(deck, sc);
  out.push(`# ${D.sections.synopsis}`, '');
  if (brief) for (const p of brief) out.push(...mdPara(`${p.label}：`, p.lines.join('\n')));
  else out.push(...mdPara('', D.synopsisEmpty));
  for (const g of DESK_GROUPS) {
    out.push(`# ${D.sections[g.id]}`, '');
    for (const k of g.keys) out.push(...mdCard(deck, sc, k));
  }
  if (!isPlotBlank(sc.plot)) {
    const plot = sc.plot;
    const no = plotLabels(plot);
    out.push(`# ${D.sections.plot}`, '', `## ${D.deductions}`, '');
    for (const d of plot.deductions) {
      const cs = cluesFor(plot, d.id);
      out.push(
        ...mdPara(
          `${no[d.id]}. `,
          `${(d.text.trim() || S.plot.unwritten).replace(/\r?\n/g, ' ')}（${D.clueCount(
            cs.length,
            cs.map((c) => no[c.id]),
          )}）`,
        ),
      );
    }
    const table = (title: string, list: typeof plot.clues) => [
      `:::table[${mdLabel(title)}]`,
      `|${D.clueHead.join('|')}|`,
      '|---|---|---|---|',
      ...list.map(
        (c) =>
          `|${no[c.id]}|${mdCell(c.text)}|${mdCell(c.how)}|${c.links
            .map((x) => no[x])
            .filter(Boolean)
            .join('、')}|`,
      ),
      ':::',
      '',
    ];
    for (const s of plot.scenes) {
      out.push(`## ${no[s.id]} ${mdHead(s.name) || S.plot.noName}`, '');
      out.push(...mdPara(`${S.plot.scenePlace}：`, s.place.trim()));
      out.push(...mdPara(S.md.what, s.what.trim()));
      const cs = plot.clues.filter((c) => c.scene === s.id && c.text.trim());
      if (cs.length) out.push(...table(`${no[s.id]} ${S.cats.clue}`, cs));
    }
    const unplaced = writtenClues(plot).filter((c) => !isPlaced(plot, c));
    if (unplaced.length) out.push(`## ${D.unplacedClues}`, '', ...table(D.unplacedClues, unplaced));
    const warn = reviewPlot(plot).filter((x) => x.level === 'warn' || x.level === 'mid');
    if (warn.length)
      out.push(
        `:::note[${S.plot.check.title}]`,
        ...warn.flatMap((x) => mdLines(x.text)),
        ':::',
        '',
      );
  }
  out.push(`# ${D.sections.cast}`, '');
  for (let i = 1; i <= sc.pcCount; i++) {
    const p = sc.pcs[i - 1];
    const lines: string[] = [];
    if (p.role.trim()) lines.push(S.md.role(p.role.trim()));
    const rel = slotCard(deck, sc, relKey(i));
    if (rel) {
      lines.push(S.md.relation(rel.title, bondTargetName(deck, sc, bondTargetOf(deck, sc, i))));
      lines.push(`${S.doc.question}：${promptOf(deck, sc, relKey(i))}`);
      const a = replyOf(sc, relKey(i));
      if (a) lines.push(S.md.answer(a));
    }
    const sec = sc.useSecrets ? slotCard(deck, sc, secKey(i)) : null;
    if (sec) {
      lines.push(S.md.secret(sec.title), sec.text);
      lines.push(`${S.doc.question}：${promptOf(deck, sc, secKey(i))}`);
      const a = replyOf(sc, secKey(i));
      if (a) lines.push(S.md.answer(a));
    }
    out.push(
      `:::handout[${mdLabel(S.md.handout(pcDisplayName(sc, i)))}]{no=HO${i}}`,
      ...lines.flatMap(mdLines),
      ':::',
      '',
    );
  }
  for (const n of npcChoices(deck, sc)) {
    const isCard = n.id === 'npc';
    const x = sc.extras.find((y) => y.id === n.id);
    const memo = isCard
      ? [slotCard(deck, sc, 'npc')?.title ?? '', sc.npc.tie.trim()]
      : [x?.role.trim() ?? '', x?.tie.trim() ?? ''];
    out.push(`:::npc[${mdLabel(n.label)}]`, ...memo.flatMap(mdLines), ':::', '');
  }
  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}
