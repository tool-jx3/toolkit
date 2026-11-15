/**
 * 場景與線索：PL 要查明的事（推理 N）、場景（S）、線索（C）。
 * 編號依排列（線索依場景的順序、同一場景裡依加進來的順序，沒決定場景的排最後）；刪掉或移動就重新編號。
 * 檢查：一個推理至少連 3 條線索（漏掉一條也能往下走）。
 */
import type { Deck } from '../data';
import { S } from '../strings';
import {
  answerOf,
  type Clue,
  type Plot,
  type Scenario,
  slotCard,
  toneSlotName,
  uid,
} from './scenario';

/** 一個推理建議的線索條數 */
export const CLUES_PER_DEDUCTION = 3;

export const hasScene = (plot: Plot, c: Clue): boolean => plot.scenes.some((s) => s.id === c.scene);

/** 線索的排列：依場景的順序，沒決定場景的排最後 */
export function clueOrder(plot: Plot): Clue[] {
  return [
    ...plot.scenes.flatMap((s) => plot.clues.filter((c) => c.scene === s.id)),
    ...plot.clues.filter((c) => !hasScene(plot, c)),
  ];
}

/** 每個項目的編號（N1、S1、C1…） */
export function plotNumbers(plot: Plot): Record<string, string> {
  const m: Record<string, string> = {};
  plot.deductions.forEach((d, i) => {
    m[d.id] = `N${i + 1}`;
  });
  plot.scenes.forEach((s, i) => {
    m[s.id] = `S${i + 1}`;
  });
  clueOrder(plot).forEach((c, i) => {
    m[c.id] = `C${i + 1}`;
  });
  return m;
}

/** 有寫內容的線索 */
export const liveClues = (plot: Plot): Clue[] => plot.clues.filter((c) => c.text.trim());

/** 連到這個推理的線索（有寫內容的，依編號） */
export function cluesFor(plot: Plot, deductionId: string): Clue[] {
  return clueOrder(plot).filter((c) => c.text.trim() && c.links.includes(deductionId));
}

export const plotEmpty = (plot: Plot): boolean =>
  !plot.deductions.length && !plot.scenes.length && !plot.clues.length;

export type CheckLevel = 'ok' | 'mid' | 'warn' | 'info';

export interface CheckItem {
  level: CheckLevel;
  text: string;
  /** 推理的 id（推理的那一行） */
  deduction?: string;
}

/** 檢查（給畫面的「檢查」欄與文件） */
export function checkPlot(plot: Plot): CheckItem[] {
  const no = plotNumbers(plot);
  const out: CheckItem[] = [];
  if (!plot.deductions.length) out.push({ level: 'warn', text: S.plot.check.noDeduction });
  for (const d of plot.deductions) {
    const n = cluesFor(plot, d.id).length;
    const label = `${no[d.id]} ${d.text.trim() || S.plot.unwritten}`;
    const level: CheckLevel = n >= CLUES_PER_DEDUCTION ? 'ok' : n === 2 ? 'mid' : 'warn';
    out.push({ level, text: S.plot.check.deduction(label, n, level), deduction: d.id });
  }
  const live = liveClues(plot);
  const loose = live.filter((c) => !hasScene(plot, c));
  if (loose.length)
    out.push({ level: 'warn', text: S.plot.check.loose(loose.map((c) => no[c.id]).join('・')) });
  const stray = live.filter((c) => !c.links.some((x) => plot.deductions.some((d) => d.id === x)));
  if (stray.length)
    out.push({ level: 'mid', text: S.plot.check.stray(stray.map((c) => no[c.id]).join('・')) });
  const bare = plot.scenes.filter(
    (s) => !plot.clues.some((c) => c.scene === s.id && c.text.trim()),
  );
  if (bare.length)
    out.push({ level: 'info', text: S.plot.check.bare(bare.map((s) => no[s.id]).join('・')) });
  return out;
}

/** 從空白開始：一個推理、一個「導入」場景 */
export function blankPlot(): Plot {
  return {
    deductions: [{ id: uid('n'), text: '' }],
    scenes: [{ id: uid('s'), name: S.plot.seed.introScene, place: '', what: '' }],
    clues: [],
  };
}

/**
 * 從卡片做草稿（叩き台）：
 * - 推理：氣氛卡的真面目與規則、真相的內容（誰、為什麼）、走向結局的方法；
 * - 場景：導入、調查舞台、找 NPC 問話、障礙、高潮、結局；
 * - 線索：線索卡（＋回答）放在調查的場景、連到第一個推理；NPC 的話放在問話的場景、連到第二個推理。
 */
export function seedPlot(deck: Deck, sc: Scenario): Plot {
  const title = (k: string) => slotCard(deck, sc, k)?.title ?? '';
  const body = (k: string) => {
    const c = slotCard(deck, sc, k);
    return c ? (answerOf(sc, k) || c.text).replace(/\n/g, ' ') : '';
  };
  const core = slotCard(deck, sc, 'core');
  const climax = core ? answerOf(sc, 'core') || core.answers[0] : '';
  const npcName = sc.npc.name.trim() || title('npc');
  const slot = toneSlotName(deck, sc);
  const T = S.plot.seed;
  const deductions = [
    title('tone') && T.dedTone(slot, title('tone')),
    title('truth') && T.dedTruth(title('truth')),
    title('ending') && T.dedEnding(title('ending')),
  ]
    .filter((t): t is string => !!t)
    .map((text) => ({ id: uid('n'), text }));
  const st = title('stage');
  const rows: [string, string, string][] = [
    [T.intro(title('intro')), st, body('intro')],
    [T.investigate(st), st, T.investigateWhat(st, title('tone') || T.anomaly)],
  ];
  if (npcName) rows.push([T.ask(npcName), '', sc.npc.tie.trim() || T.askWhat(npcName)]);
  rows.push([T.obstacle(title('obstacle')), '', body('obstacle')]);
  rows.push([T.climax, '', climax]);
  rows.push([T.ending(title('ending')), '', body('ending')]);
  const scenes = rows.map(([name, place, what]) => ({ id: uid('s'), name, place, what }));
  const at = (i: number) => scenes[Math.min(i, scenes.length - 1)].id;
  const dn = (i: number) => (deductions[i] ? [deductions[i].id] : []);
  const clues: Clue[] = [];
  const clueTitle = title('clue');
  if (clueTitle) {
    const a = answerOf(sc, 'clue').replace(/\n/g, ' ');
    clues.push({
      id: uid('c'),
      text: a ? T.clueAnswered(clueTitle, a) : clueTitle,
      how: '',
      scene: at(1),
      links: dn(0),
    });
  }
  if (npcName)
    clues.push({ id: uid('c'), text: T.npcTalk(npcName), how: '', scene: at(2), links: dn(1) });
  return { deductions, scenes, clues };
}

/** 刪除前要不要確認：寫了內容、或是放了線索的場景 */
export function needsDeleteConfirm(
  plot: Plot,
  kind: 'deduction' | 'scene' | 'clue',
  id: string,
): boolean {
  if (kind === 'deduction') return !!plot.deductions.find((d) => d.id === id)?.text.trim();
  if (kind === 'scene') {
    const s = plot.scenes.find((x) => x.id === id);
    return (
      !!s &&
      (!!(s.name.trim() || s.place.trim() || s.what.trim()) ||
        plot.clues.some((c) => c.scene === id))
    );
  }
  const c = plot.clues.find((x) => x.id === id);
  return !!c && !!(c.text.trim() || c.how.trim());
}

/** 刪掉（推理：線索上的連結一起拿掉；場景：上面的線索移到「還沒決定場景」） */
export function removePlotItem(plot: Plot, kind: 'deduction' | 'scene' | 'clue', id: string): void {
  if (kind === 'deduction') {
    plot.deductions = plot.deductions.filter((d) => d.id !== id);
    for (const c of plot.clues) c.links = c.links.filter((x) => x !== id);
  } else if (kind === 'scene') {
    plot.scenes = plot.scenes.filter((s) => s.id !== id);
    for (const c of plot.clues) if (c.scene === id) c.scene = '';
  } else plot.clues = plot.clues.filter((c) => c.id !== id);
}

/** 場景往上（-1）或往下（+1）移一格 */
export function moveScene(plot: Plot, id: string, dir: -1 | 1): boolean {
  const i = plot.scenes.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= plot.scenes.length) return false;
  [plot.scenes[i], plot.scenes[j]] = [plot.scenes[j], plot.scenes[i]];
  return true;
}

/** 文字版的場景與線索（文字檔、文件用） */
export function plotLines(plot: Plot): string[] {
  const no = plotNumbers(plot);
  const P = S.plot.text;
  const out: string[] = [P.deductions];
  for (const d of plot.deductions) {
    const cs = cluesFor(plot, d.id);
    out.push(
      P.deduction(
        no[d.id],
        d.text.trim() || S.plot.unwritten,
        cs.map((c) => no[c.id]),
      ),
    );
  }
  const line = (c: Clue) =>
    P.clue(
      no[c.id],
      c.text.trim().replace(/\n/g, ' '),
      c.how.trim(),
      c.links.map((x) => no[x]).filter(Boolean),
    );
  out.push(P.scenes);
  for (const s of plot.scenes) {
    out.push(P.scene(no[s.id], s.name.trim() || S.plot.noName, s.place.trim()));
    if (s.what.trim()) out.push(P.what(s.what.trim().replace(/\n/g, ' ')));
    for (const c of plot.clues.filter((x) => x.scene === s.id && x.text.trim())) out.push(line(c));
  }
  const loose = liveClues(plot).filter((c) => !hasScene(plot, c));
  if (loose.length) {
    out.push(P.loose);
    for (const c of loose) out.push(line(c));
  }
  return out;
}
