/**
 * 推理與場景：推理題（A、B、C…）、場景（#1、#2…）、線索（場景的編號－第幾條，例如 2-1；還沒放進場景的是 ?-1）。
 * 標號依排列；刪掉或移動就重新標。
 * 檢查：先列總數，再看每一道推理題的線索夠不夠（3 條以上），最後是沒有線索的場景、還沒放的線索、沒指向推理題的線索。
 */
import type { Deck } from '../data';
import { S } from '../strings';
import { type Clue, type Plot, replyOf, type Scenario, slotCard, uid } from './scenario';

/** 一道推理題建議的線索條數 */
export const CLUES_PER_DEDUCTION = 3;

export const isPlaced = (plot: Plot, c: Clue): boolean => plot.scenes.some((s) => s.id === c.scene);

/** 線索的排列：依場景的順序，還沒放的排最後 */
export function cluesInSceneOrder(plot: Plot): Clue[] {
  return [
    ...plot.scenes.flatMap((s) => plot.clues.filter((c) => c.scene === s.id)),
    ...plot.clues.filter((c) => !isPlaced(plot, c)),
  ];
}

/** 推理題的字母（A…Z，之後 AA、AB…） */
function letters(i: number): string {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return i < a.length ? a[i] : letters(Math.floor(i / a.length) - 1) + a[i % a.length];
}

/** 每個項目的標號（推理題 A、場景 #1、線索 1-1） */
export function plotLabels(plot: Plot): Record<string, string> {
  const m: Record<string, string> = {};
  plot.deductions.forEach((d, i) => {
    m[d.id] = letters(i);
  });
  plot.scenes.forEach((s, i) => {
    m[s.id] = `#${i + 1}`;
    plot.clues
      .filter((c) => c.scene === s.id)
      .forEach((c, j) => {
        m[c.id] = `${i + 1}-${j + 1}`;
      });
  });
  plot.clues
    .filter((c) => !isPlaced(plot, c))
    .forEach((c, j) => {
      m[c.id] = `?-${j + 1}`;
    });
  return m;
}

/** 有寫內容的線索 */
export const writtenClues = (plot: Plot): Clue[] => plot.clues.filter((c) => c.text.trim());

/** 指向這一題的線索（有寫內容的，照場景的順序） */
export function cluesFor(plot: Plot, deductionId: string): Clue[] {
  return cluesInSceneOrder(plot).filter((c) => c.text.trim() && c.links.includes(deductionId));
}

export const isPlotBlank = (plot: Plot): boolean =>
  !plot.deductions.length && !plot.scenes.length && !plot.clues.length;

export type CheckLevel = 'ok' | 'mid' | 'warn' | 'info';

export interface CheckItem {
  level: CheckLevel;
  text: string;
  /** 推理題的 id（推理題的那一行） */
  deduction?: string;
}

/** 檢查（畫面的「檢查」欄與送去劇本排版台的提醒） */
export function reviewPlot(plot: Plot): CheckItem[] {
  const no = plotLabels(plot);
  const C = S.plot.check;
  const written = writtenClues(plot);
  const out: CheckItem[] = [
    {
      level: 'info',
      text: C.summary(plot.deductions.length, plot.scenes.length, written.length),
    },
  ];
  if (!plot.deductions.length) out.push({ level: 'warn', text: C.none });
  for (const d of plot.deductions) {
    const n = cluesFor(plot, d.id).length;
    const label = `${no[d.id]}. ${d.text.trim() || S.plot.unwritten}`;
    const level: CheckLevel =
      n >= CLUES_PER_DEDUCTION ? 'ok' : n === CLUES_PER_DEDUCTION - 1 ? 'mid' : 'warn';
    out.push({ level, text: C.deduction(label, n, level), deduction: d.id });
  }
  const list = (ids: string[]) => ids.map((id) => no[id]).join('、');
  const emptyScenes = plot.scenes.filter((s) => !written.some((c) => c.scene === s.id));
  if (emptyScenes.length)
    out.push({ level: 'info', text: C.emptyScenes(list(emptyScenes.map((s) => s.id))) });
  const unplaced = written.filter((c) => !isPlaced(plot, c));
  if (unplaced.length)
    out.push({ level: 'warn', text: C.unplaced(list(unplaced.map((c) => c.id))) });
  const unlinked = written.filter(
    (c) => !c.links.some((x) => plot.deductions.some((d) => d.id === x)),
  );
  if (unlinked.length)
    out.push({ level: 'mid', text: C.unlinked(list(unlinked.map((c) => c.id))) });
  return out;
}

/** 一格一格自己寫：一道空白的推理題、一個「開場」場景 */
export function blankPlot(): Plot {
  return {
    deductions: [{ id: uid('n'), text: '' }],
    scenes: [{ id: uid('s'), name: S.plot.seed.introScene, place: '', what: '' }],
    clues: [],
  };
}

/**
 * 用卡片排草稿：
 * - 推理題：線索卡指向什麼、NPC 隱瞞了什麼、真相為什麼會發生；
 * - 場景：開場（導入）、現場（舞台＋焦點）、對話（NPC）、阻礙、揭曉與收尾（最後一幕＋結局）；
 * - 線索：線索卡（＋回答）放在現場、指向第一題；NPC 說溜嘴的話放在對話、指向第二題；焦點留下的痕跡放在阻礙、指向第三題。
 */
export function draftPlot(deck: Deck, sc: Scenario): Plot {
  const title = (k: string) => slotCard(deck, sc, k)?.title ?? '';
  const bodyOf = (k: string) => {
    const c = slotCard(deck, sc, k);
    return c ? (replyOf(sc, k) || c.text).replace(/\n/g, ' ') : '';
  };
  const core = slotCard(deck, sc, 'core');
  const climax = core ? replyOf(sc, 'core') || core.answers[0] : '';
  const npcName = sc.npc.name.trim() || title('npc');
  const T = S.plot.seed;
  const dedText = [
    title('clue') && T.dedClue(title('clue')),
    npcName && T.dedNpc(npcName),
    title('truth') && T.dedTruth(title('truth')),
  ];
  const asked = dedText.map((text) => (text ? { id: uid('n'), text } : null));
  const deductions = asked.filter((d): d is { id: string; text: string } => !!d);
  const st = title('stage');
  const rows: [string, string, string][] = [
    [T.opening(title('intro')), '', bodyOf('intro')],
    [T.site(st), st, T.siteWhat(st, title('tone'))],
  ];
  if (npcName) rows.push([T.talk(npcName), '', sc.npc.tie.trim() || T.talkWhat(npcName)]);
  rows.push([T.block(title('obstacle')), '', bodyOf('obstacle')]);
  rows.push([T.finale, '', T.finaleWhat(climax, title('ending'))]);
  const scenes = rows.map(([name, place, what]) => ({ id: uid('s'), name, place, what }));
  const sceneOf = (prefix: string) => scenes.find((s) => s.name.startsWith(prefix))?.id ?? '';
  const to = (i: number) => (asked[i] ? [(asked[i] as { id: string }).id] : []);
  const clues: Clue[] = [];
  const clueTitle = title('clue');
  if (clueTitle) {
    const a = replyOf(sc, 'clue').replace(/\n/g, ' ');
    clues.push({
      id: uid('c'),
      text: a ? T.clueAnswered(clueTitle, a) : clueTitle,
      how: '',
      scene: sceneOf(T.site('')),
      links: to(0),
    });
  }
  if (npcName)
    clues.push({
      id: uid('c'),
      text: T.slip(npcName),
      how: '',
      scene: sceneOf(T.talk('')),
      links: to(1),
    });
  if (title('tone'))
    clues.push({
      id: uid('c'),
      text: T.trace(title('tone')),
      how: '',
      scene: sceneOf(T.block('')),
      links: to(2),
    });
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

/** 刪掉（推理題：線索上的指向一起拿掉；場景：上面的線索移到「還沒放進場景」） */
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

/** 純文字的推理題與場景表（純文字檔、我的劇本的展開用） */
export function plotTextLines(plot: Plot): string[] {
  const no = plotLabels(plot);
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
  const unplaced = writtenClues(plot).filter((c) => !isPlaced(plot, c));
  if (unplaced.length) {
    out.push(P.unplaced);
    for (const c of unplaced) out.push(line(c));
  }
  return out;
}
