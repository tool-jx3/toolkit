/**
 * 產生的文字：劇情大綱的例子、文字檔、劇本文件（畫面上的預覽、列印、HTML 共用同一份 HTML）、
 * 劇本排版台（scenario-editor）可以貼上的 markdown。
 */
import { escapeHtml } from '@/core/html';
import { type Deck, findMission, findTone } from '../data';
import { S } from '../strings';
import {
  checkPlot,
  cluesFor,
  hasScene,
  liveClues,
  plotEmpty,
  plotLines,
  plotNumbers,
} from './plot';
import {
  activeKeys,
  answerOf,
  catName,
  FLOW_KEYS,
  npcList,
  pcKeys,
  pcLabel,
  questionOf,
  relKey,
  relTarget,
  type Scenario,
  STAGE_KEYS,
  STORY_KEYS,
  secKey,
  slotCard,
  slotCat,
  slotWho,
  targetLabel,
  titleOf,
  toneSlotName,
} from './scenario';

export interface Synopsis {
  core: string;
  open: string[];
  truth: string;
  ask: string[];
  end: string;
}

/** 真相的句子裡的 {tone}：第一次寫稱呼＋「氣氛卡「卡名」」，之後只寫稱呼 */
export function fillTone(
  template: string,
  tone: { title: string; ref?: string },
  slot: string,
  stage: string,
): string {
  let n = 0;
  return template.replace(/\{stage\}/g, stage).replace(/\{tone\}/g, () => {
    n++;
    return n === 1
      ? S.syn.toneFirst(tone.ref ?? '', slot, tone.title)
      : S.syn.toneAgain(tone.ref ?? '', tone.title);
  });
}

/** 劇情大綱的例子（舞台、導入、氣氛卡、線索、NPC、障礙、真相、結局都抽到之後才有） */
export function synopsis(deck: Deck, sc: Scenario): Synopsis | null {
  const g = (k: string) => slotCard(deck, sc, k);
  const [st, it, tn, cl, np, ob, tr, en] = [
    'stage',
    'intro',
    'tone',
    'clue',
    'npc',
    'obstacle',
    'truth',
    'ending',
  ].map(g);
  if (!st || !it || !tn || !cl || !np || !ob || !tr || !en) return null;
  const slot = toneSlotName(deck, sc);
  const tone = findTone(deck, sc.tone);
  const opener = (tone?.opener ?? '「{title}」。').replace('{title}', tn.title);
  const co = g('core');
  const coreAnswer = answerOf(sc, 'core');
  return {
    core: co ? S.syn.core(co.title, co.text, coreAnswer || co.answers[0], !!coreAnswer) : '',
    open: [
      S.syn.open1(st.title, it.via ?? S.syn.viaFallback(it.title), deck.incident, opener),
      S.syn.open2(cl.title, sc.npc.name.trim() || np.title, ob.title),
    ],
    truth: fillTone(tr.synopsis ?? tr.text, tn, slot, st.title),
    ask: [
      S.syn.askTruth(questionOf(deck, sc, 'truth')),
      S.syn.askTone(slot, questionOf(deck, sc, 'tone')),
    ],
    end: S.syn.end(en.title, en.text, questionOf(deck, sc, 'ending')),
  };
}

/** 題材與氣氛的標示（「調查・偵探 × 怪奇・恐怖」） */
export function missionToneLabel(deck: Deck, sc: Pick<Scenario, 'mission' | 'tone'>): string {
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
  return { answered: keys.filter((k) => !!answerOf(sc, k)).length, total: keys.length };
}

/* ---------- 文字檔 ---------- */

function castLines(deck: Deck, sc: Scenario): string[] {
  const T = S.text;
  const out: string[] = [];
  for (let i = 1; i <= sc.pcCount; i++) {
    out.push(T.pcLine(pcLabel(sc, i), sc.pcs[i - 1].role.trim()));
    out.push(T.relLine(targetLabel(deck, sc, relTarget(deck, sc, i))));
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

/** 文字檔的內容（劇本名、題材與氣氛、大綱、登場人物、場景與線索、每張卡的問題與回答） */
export function outlineText(deck: Deck, sc: Scenario): string {
  const T = S.text;
  const out: string[] = [titleOf(deck, sc), ''];
  const m = findMission(deck, sc.mission);
  const t = findTone(deck, sc.tone);
  if (m || t) out.push(T.mt(m?.name ?? S.undecided, t?.name ?? S.undecided), '');
  const sy = synopsis(deck, sc);
  if (sy) {
    out.push(T.synopsis);
    if (sy.core) out.push(`${S.doc.labels.core}：${sy.core}`);
    out.push(...sy.open);
    out.push(`${S.doc.labels.truth}：${sy.truth}`);
    out.push(`${S.doc.labels.ask}：`, ...sy.ask);
    out.push(`${S.doc.labels.ending}：${sy.end}`, '');
  }
  if (sc.phase === 'done') out.push(T.cast, ...castLines(deck, sc), '');
  if (sc.phase === 'done' && !plotEmpty(sc.plot)) out.push(T.plot, ...plotLines(sc.plot), '');
  out.push(T.skeleton);
  for (const k of orderedKeys(sc)) {
    const card = slotCard(deck, sc, k);
    if (!card) continue;
    out.push(T.cardLine(catName(deck, sc, slotCat(k)), slotWho(deck, sc, k), card.title));
    out.push(`　${card.text}`);
    out.push(T.question(questionOf(deck, sc, k)));
    const a = answerOf(sc, k);
    if (a) out.push(T.answer(a.replace(/\n/g, T.answerIndent)));
  }
  return `${out.join('\n')}\n`;
}

/* ---------- 劇本文件（HTML） ---------- */

const e = escapeHtml;
const br = (t: string) => e(t).replace(/\n/g, '<br>');

function docCard(deck: Deck, sc: Scenario, key: string, opt: { step?: number; cls?: string } = {}) {
  const card = slotCard(deck, sc, key);
  if (!card) return '';
  const a = answerOf(sc, key);
  const who = slotWho(deck, sc, key);
  return `<div class="pd-card${opt.cls ? ` ${opt.cls}` : ''}" data-doc-card="${key}"><div class="pd-tab">${opt.step ? `<b>${opt.step}</b>` : ''}${e(catName(deck, sc, slotCat(key)))}${who ? `<span>${e(who)}</span>` : ''}</div><h4>${e(card.title)}</h4><p class="pd-desc">${e(card.text)}</p><p class="pd-q"><span>${S.doc.question}</span>${e(questionOf(deck, sc, key))}</p><p class="pd-a${a ? '' : ' pd-empty'}">${a ? br(a) : S.doc.unanswered}</p></div>`;
}

function plotSection(sc: Scenario, num: string): string {
  const plot = sc.plot;
  if (plotEmpty(plot)) return '';
  const no = plotNumbers(plot);
  const row = (c: (typeof plot.clues)[number]) =>
    `<tr><th>${no[c.id]}</th><td>${br(c.text.trim())}</td><td class="pd-how">${e(c.how.trim())}</td><td class="pd-to">${c.links
      .map((x) => no[x])
      .filter(Boolean)
      .join('・')}</td></tr>`;
  const head = `<tr>${S.doc.clueHead.map((h) => `<th scope="col">${h}</th>`).join('')}</tr>`;
  const table = (rows: string) =>
    `<table class="pd-clues"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  const ded = plot.deductions
    .map((d) => {
      const cs = cluesFor(plot, d.id);
      return `<li><b>${no[d.id]}</b>${e(d.text.trim() || S.plot.unwritten)}<span class="${cs.length < 3 ? 'pd-short' : ''}">${S.doc.clueCount(
        cs.length,
        cs.map((c) => no[c.id]),
      )}</span></li>`;
    })
    .join('');
  const scenes = plot.scenes
    .map((s) => {
      const cs = plot.clues.filter((c) => c.scene === s.id && c.text.trim());
      return `<div class="pd-scene"><div class="pd-schead"><b>${no[s.id]}</b><h4>${e(s.name.trim() || S.plot.noName)}</h4>${s.place.trim() ? `<span>${e(s.place.trim())}</span>` : ''}</div>${s.what.trim() ? `<p>${br(s.what.trim())}</p>` : ''}${cs.length ? table(cs.map(row).join('')) : ''}</div>`;
    })
    .join('');
  const loose = liveClues(plot).filter((c) => !hasScene(plot, c));
  const looseHtml = loose.length
    ? `<div class="pd-scene"><div class="pd-schead"><h4>${S.doc.looseClues}</h4></div>${table(loose.map(row).join(''))}</div>`
    : '';
  return `<section class="pd-sec" data-doc-section="plot"><h2><b>${num}</b>${S.doc.sections.plot}<span>${S.doc.sections.plotSub}</span></h2><h3 class="pd-sub">${S.doc.deductions}</h3><ul class="pd-ded">${ded}</ul><h3 class="pd-sub">${S.doc.scenes}</h3>${scenes}${looseHtml}</section>`;
}

/** 劇本文件的 HTML（`<article class="pd-doc">`；樣式是 DOC_CSS） */
export function documentHtml(deck: Deck, sc: Scenario, now = new Date()): string {
  const sy = synopsis(deck, sc);
  const D = S.doc;
  const slot = toneSlotName(deck, sc);
  const core = slotCard(deck, sc, 'core');
  const { answered, total } = answerProgress(sc);
  const meta = [
    D.meta.pcs(sc.pcCount, sc.useSecrets),
    missionToneLabel(deck, sc),
    core ? D.meta.core(core.title) : '',
    sc.madeBy ? D.madeBy[sc.madeBy] : '',
    D.meta.answered(answered, total),
    D.date(now),
  ]
    .filter(Boolean)
    .map(e)
    .join(' ／ ');
  const syn = sy
    ? `${sy.core ? `<p><span class="pd-lab">${D.labels.core}</span>${e(sy.core)}</p>` : ''}${sy.open.map((t) => `<p>${e(t)}</p>`).join('')}<p><span class="pd-lab">${D.labels.truth}</span>${e(sy.truth)}</p><p><span class="pd-lab">${D.labels.ask}</span>${sy.ask.map(e).join('<br>')}</p><p><span class="pd-lab">${D.labels.ending}</span>${e(sy.end)}</p>`
    : `<p>${D.synopsisEmpty}</p>`;
  const pcs = Array.from({ length: sc.pcCount }, (_, k) => {
    const i = k + 1;
    const p = sc.pcs[k];
    return `<div class="pd-pc" data-doc-pc="${i}"><div class="pd-pchead"><b>${S.cast.pc(i)}</b><span class="pd-name">${e(p.name.trim() || D.pcName)}</span>${p.role.trim() ? `<span class="pd-role">${e(p.role.trim())}</span>` : ''}<span class="pd-rel">${e(D.relTarget(targetLabel(deck, sc, relTarget(deck, sc, i))))}</span></div><div class="pd-row2">${docCard(deck, sc, relKey(i))}${sc.useSecrets ? docCard(deck, sc, secKey(i), { cls: 'pd-secret' }) : ''}</div></div>`;
  }).join('');
  const npcCard = slotCard(deck, sc, 'npc');
  const npcs = [
    npcCard
      ? `<div class="pd-npc"><b>${e(sc.npc.name.trim() || npcCard.title)}</b><span>${e(npcCard.title)}</span><p>${br(sc.npc.tie.trim() || D.npcTie)}</p></div>`
      : '',
    ...sc.extras.map(
      (x, i) =>
        `<div class="pd-npc"><b>${e(x.name.trim() || S.cast.extraNpc(i + 1))}</b><span>${e(x.role.trim())}</span><p>${br(x.tie.trim() || D.npcTie)}</p></div>`,
    ),
  ].join('');
  const hasPlot = !plotEmpty(sc.plot);
  return `<article class="pd-doc" lang="zh-Hant-TW"><header class="pd-head"><p class="pd-kicker">${e(D.kicker(deck.name))}</p><h1 class="pd-title">${e(titleOf(deck, sc))}</h1><p class="pd-meta">${meta}</p><span class="pd-stamp">${D.gmOnly}</span></header><section class="pd-sec" data-doc-section="synopsis"><h2><b>01</b>${D.sections.synopsis}</h2><div class="pd-syn">${syn}</div></section><section class="pd-sec" data-doc-section="flow"><h2><b>02</b>${D.sections.flow}<span>${D.sections.flowSub}</span></h2><div class="pd-core">${docCard(deck, sc, 'core', { cls: 'pd-wide' })}</div><div class="pd-grid4">${FLOW_KEYS.map((k, i) => docCard(deck, sc, k, { step: i + 1 })).join('')}</div></section><section class="pd-sec" data-doc-section="stage"><h2><b>03</b>${e(D.sections.stage(slot))}</h2><div class="pd-grid4">${STAGE_KEYS.map((k) => docCard(deck, sc, k)).join('')}</div></section>${plotSection(sc, '04')}<section class="pd-sec" data-doc-section="cast"><h2><b>${hasPlot ? '05' : '04'}</b>${D.sections.cast}</h2>${pcs}${npcs ? `<h3 class="pd-sub">${D.npcs}</h3><div class="pd-npcs">${npcs}</div>` : ''}${sc.useSecrets ? `<p class="pd-note">${D.secretNote}</p>` : ''}</section></article>`;
}

/**
 * 文件的樣式：紙是白底黑字（深色主題時也一樣，列印出來是紙），只用 .pd- 開頭的 class。
 * 字型跟著頁面（本站的繁中字型堆疊），列印與 HTML 用同一份。
 */
export const DOC_CSS = `.pd-doc{--ink:#1f2328;--muted:#5b6169;--line:#d4d0c4;--paper:#fbfaf6;--tint:#f1eee4;--accent:#8b2f2f;--pack:#335c58;position:relative;max-width:1040px;margin:0 auto;padding:36px 40px 40px;background:var(--paper);color:var(--ink);border-radius:4px;font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;font-size:14px;line-height:1.75;box-sizing:border-box}
.pd-doc *{box-sizing:border-box}
.pd-head{border-bottom:3px double var(--ink);padding-bottom:12px;margin-bottom:22px;padding-right:96px}
.pd-kicker{margin:0;font-size:12px;letter-spacing:.12em;color:var(--pack)}
.pd-title{margin:4px 0 6px;font-size:28px;line-height:1.3;font-weight:700;overflow-wrap:anywhere}
.pd-meta{margin:0;font-size:12.5px;color:var(--muted)}
.pd-stamp{position:absolute;top:36px;right:40px;border:2px solid var(--accent);color:var(--accent);padding:2px 10px;font-weight:700;letter-spacing:.2em;transform:rotate(-6deg);font-size:14px}
.pd-sec{margin-top:26px;break-inside:auto}
.pd-sec>h2{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px;font-size:19px;font-weight:700;border-bottom:2px solid var(--pack);padding-bottom:4px;margin:0 0 12px}
.pd-sec>h2 b{font-size:12px;color:var(--pack);letter-spacing:.16em}
.pd-sec>h2 span{font-size:12px;font-weight:400;color:var(--muted)}
.pd-syn{background:var(--tint);border-left:4px solid var(--pack);padding:10px 16px}
.pd-syn p{margin:6px 0}
.pd-lab{display:inline-block;margin-right:8px;padding:0 6px;font-size:12px;background:var(--pack);color:#fff;border-radius:2px}
.pd-grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px 12px}
.pd-core{margin-bottom:14px}
.pd-card{border:1px solid var(--line);border-radius:4px;padding:10px 12px;background:#fff;break-inside:avoid}
.pd-card.pd-wide{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);column-gap:20px}
.pd-card.pd-wide .pd-tab,.pd-card.pd-wide h4,.pd-card.pd-wide .pd-desc{grid-column:1}
.pd-card.pd-wide .pd-q{grid-column:2;grid-row:1/3}
.pd-card.pd-wide .pd-a{grid-column:2;grid-row:3/5}
.pd-tab{font-size:12px;color:var(--pack);font-weight:700}
.pd-tab b{display:inline-block;margin-right:6px;min-width:18px;text-align:center;background:var(--pack);color:#fff;border-radius:2px}
.pd-tab span{margin-left:8px;font-weight:400;color:var(--muted)}
.pd-card h4{margin:2px 0 4px;font-size:16px;line-height:1.4}
.pd-desc{margin:0 0 6px;font-size:13px;color:var(--muted)}
.pd-q{margin:0 0 4px;font-size:13px}
.pd-q span{display:inline-block;margin-right:6px;font-size:11.5px;color:var(--accent);font-weight:700}
.pd-a{margin:0;padding:6px 8px;border-left:3px solid var(--accent);background:var(--tint);font-size:13.5px;white-space:normal;overflow-wrap:anywhere}
.pd-a.pd-empty{color:var(--muted);border-left-color:var(--line);background:transparent;font-size:12.5px}
.pd-sub{margin:16px 0 8px;font-size:15px;color:var(--pack)}
.pd-ded{margin:0;padding:0;list-style:none}
.pd-ded li{display:flex;flex-wrap:wrap;gap:4px 10px;padding:4px 0;border-bottom:1px dashed var(--line)}
.pd-ded b{color:var(--pack)}
.pd-ded span{margin-left:auto;font-size:12.5px;color:var(--muted)}
.pd-ded .pd-short{color:var(--accent);font-weight:700}
.pd-scene{margin:10px 0 14px;break-inside:avoid}
.pd-schead{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px}
.pd-schead b{color:var(--pack)}
.pd-schead h4{margin:0;font-size:15px}
.pd-schead span{font-size:12.5px;color:var(--muted)}
.pd-scene>p{margin:4px 0 6px;font-size:13.5px}
.pd-clues{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px}
.pd-clues th,.pd-clues td{border:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
.pd-clues thead th{background:var(--tint);font-weight:700;font-size:12px}
.pd-clues tbody th{width:44px;color:var(--pack)}
.pd-how{width:28%}
.pd-to{width:70px}
.pd-pc{margin:12px 0 16px;break-inside:avoid}
.pd-pchead{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px;margin-bottom:6px}
.pd-pchead b{color:var(--pack)}
.pd-name{font-size:16px;font-weight:700}
.pd-role,.pd-rel{font-size:12.5px;color:var(--muted)}
.pd-row2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.pd-secret{border-style:dashed;border-color:var(--accent)}
.pd-npcs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
.pd-npc{border-top:1px solid var(--line);padding-top:6px;break-inside:avoid}
.pd-npc b{font-size:15px}
.pd-npc span{margin-left:8px;font-size:12.5px;color:var(--muted)}
.pd-npc p{margin:4px 0 0;font-size:13.5px}
.pd-note{margin:12px 0 0;font-size:12.5px;color:var(--accent)}
@media (max-width:820px){.pd-doc{padding:22px 16px}.pd-grid4{grid-template-columns:repeat(2,minmax(0,1fr))}.pd-row2,.pd-npcs{grid-template-columns:minmax(0,1fr)}.pd-card.pd-wide{display:block}.pd-head{padding-right:0}.pd-title{font-size:23px}.pd-stamp{position:static;display:inline-block;margin-top:8px}}
@media (max-width:480px){.pd-grid4{grid-template-columns:minmax(0,1fr)}.pd-how{width:auto}}
@media print{.pd-doc{max-width:none;padding:0;background:#fff;border-radius:0}.pd-card,.pd-syn,.pd-a{background:#fff}.pd-doc *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;

/** 匯出的 HTML（一個獨立的檔案） */
export function documentFile(deck: Deck, sc: Scenario, now = new Date()): string {
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(titleOf(deck, sc))}</title><style>body{margin:0;padding:24px 12px;background:#d9dcd6}${DOC_CSS}</style></head><body>${documentHtml(deck, sc, now)}</body></html>\n`;
}

/* ---------- 劇本排版台的格式（markdown） ---------- */

const mdLine = (t: string) => t.replace(/\r?\n/g, '\n');
/** 標籤（[…]）裡不能有 ] 與換行 */
const mdLabel = (t: string) => t.replace(/[\]］\n\r]/g, ' ').trim();
/** 表格的儲存格裡不能有 | 與換行 */
const mdCell = (t: string) => t.replace(/[|｜]/g, '／').replace(/\r?\n/g, ' ').trim();

function mdCard(deck: Deck, sc: Scenario, key: string, level: '##' | '###'): string[] {
  const card = slotCard(deck, sc, key);
  if (!card) return [];
  const a = answerOf(sc, key);
  const who = slotWho(deck, sc, key);
  return [
    `${level} ${catName(deck, sc, slotCat(key))}${who ? `（${who}）` : ''}：${card.title}`,
    '',
    card.text,
    '',
    `:::note[${S.doc.question}]`,
    questionOf(deck, sc, key),
    ':::',
    '',
    ...(a ? [mdLine(a), ''] : []),
  ];
}

/**
 * 給劇本排版台貼上的 markdown（劇本排版台的「原稿」欄照 markdown 讀）：主標題、副標題、
 * 每一節是 #、每張卡是 ##（問題放在注釋裡）、每位 PC 是一份手冊（秘密寫在裡面）、NPC 是 NPC 卡、
 * 線索是表格。
 */
export function editorMarkdown(deck: Deck, sc: Scenario): string {
  const D = S.doc;
  const out: string[] = [];
  out.push(':::title', titleOf(deck, sc), ':::', '');
  out.push(
    ':::subtitle',
    S.md.subtitle(deck.name, missionToneLabel(deck, sc), D.meta.pcs(sc.pcCount, sc.useSecrets)),
    ':::',
    '',
  );
  const sy = synopsis(deck, sc);
  out.push(`# ${D.sections.synopsis}`, '');
  if (sy) {
    if (sy.core) out.push(`${D.labels.core}：${sy.core}`, '');
    for (const t of sy.open) out.push(t, '');
    out.push(`${D.labels.truth}：${sy.truth}`, '');
    out.push(`${D.labels.ask}：`, ...sy.ask, '');
    out.push(`${D.labels.ending}：${sy.end}`, '');
  } else out.push(D.synopsisEmpty, '');
  out.push(`# ${D.sections.flow}`, '');
  for (const k of ['core', ...FLOW_KEYS]) out.push(...mdCard(deck, sc, k, '##'));
  out.push(`# ${D.sections.stage(toneSlotName(deck, sc))}`, '');
  for (const k of STAGE_KEYS) out.push(...mdCard(deck, sc, k, '##'));
  if (!plotEmpty(sc.plot)) {
    const plot = sc.plot;
    const no = plotNumbers(plot);
    out.push(`# ${D.sections.plot}`, '', `## ${D.deductions}`, '');
    for (const d of plot.deductions) {
      const cs = cluesFor(plot, d.id);
      out.push(
        `${no[d.id]} ${d.text.trim() || S.plot.unwritten}（${D.clueCount(
          cs.length,
          cs.map((c) => no[c.id]),
        )}）`,
        '',
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
            .join('・')}|`,
      ),
      ':::',
      '',
    ];
    for (const s of plot.scenes) {
      out.push(`## ${no[s.id]} ${s.name.trim() || S.plot.noName}`, '');
      if (s.place.trim()) out.push(`${S.plot.scenePlace}：${s.place.trim()}`, '');
      if (s.what.trim()) out.push(mdLine(s.what.trim()), '');
      const cs = plot.clues.filter((c) => c.scene === s.id && c.text.trim());
      if (cs.length) out.push(...table(`${no[s.id]} ${S.cats.clue}`, cs));
    }
    const loose = liveClues(plot).filter((c) => !hasScene(plot, c));
    if (loose.length) out.push(`## ${D.looseClues}`, '', ...table(D.looseClues, loose));
    const warn = checkPlot(plot).filter((x) => x.level === 'warn' || x.level === 'mid');
    if (warn.length)
      out.push(`:::note[${S.plot.check.title}]`, ...warn.map((x) => x.text), ':::', '');
  }
  out.push(`# ${D.sections.cast}`, '');
  for (let i = 1; i <= sc.pcCount; i++) {
    const p = sc.pcs[i - 1];
    const lines: string[] = [];
    if (p.role.trim()) lines.push(S.md.role(p.role.trim()));
    const rel = slotCard(deck, sc, relKey(i));
    if (rel) {
      lines.push(S.md.relation(rel.title, targetLabel(deck, sc, relTarget(deck, sc, i))));
      lines.push(`${S.doc.question}：${questionOf(deck, sc, relKey(i))}`);
      const a = answerOf(sc, relKey(i));
      if (a) lines.push(S.md.answer(a.replace(/\n/g, ' ')));
    }
    const sec = sc.useSecrets ? slotCard(deck, sc, secKey(i)) : null;
    if (sec) {
      lines.push('', S.md.secret(sec.title), sec.text);
      lines.push(`${S.doc.question}：${questionOf(deck, sc, secKey(i))}`);
      const a = answerOf(sc, secKey(i));
      if (a) lines.push(S.md.answer(a.replace(/\n/g, ' ')));
    }
    out.push(
      `:::handout[${mdLabel(S.md.handout(pcLabel(sc, i)))}]{no=HO${i}}`,
      ...lines,
      ':::',
      '',
    );
  }
  for (const n of npcList(deck, sc)) {
    const isCard = n.id === 'npc';
    const x = sc.extras.find((y) => y.id === n.id);
    const memo = isCard
      ? [slotCard(deck, sc, 'npc')?.title ?? '', sc.npc.tie.trim()]
      : [x?.role.trim() ?? '', x?.tie.trim() ?? ''];
    out.push(`:::npc[${mdLabel(n.label)}]`, ...memo.filter(Boolean), ':::', '');
  }
  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}
