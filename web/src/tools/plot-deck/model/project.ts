/**
 * 存檔：自動存檔（我的劇本＋目前的劇本）與專案檔（版本 1：一份劇本）。
 * 讀的時候一律經過 sanitize：壞掉、手改過或舊版的資料補上預設值，不認得的卡丟掉。
 */
import { ProjectFileError } from '@/core/storage';
import { findCard, findMission, findTone, getDeck, isDeckId } from '../data';
import { S } from '../strings';
import {
  ALL_KEYS,
  type Clue,
  type ExtraNpc,
  emptyPc,
  type MadeBy,
  newScenario,
  PC_MAX,
  PC_MIN,
  type Phase,
  type Plot,
  type Scenario,
  STEPS,
  type Step,
  slotCat,
  type Written,
} from './scenario';

export const TOOL_ID = 'plot-deck';
/** 專案檔的版本 */
export const PROJECT_VERSION = 1;
/** 我的劇本最多幾份 */
export const LIBRARY_MAX = 100;
/** 文字欄的上限（字） */
export const TEXT_MAX = 4000;
export const SHORT_MAX = 200;

export interface PlotDeckState {
  scenarios: Scenario[];
  /** 目前在做的劇本（null＝還沒有） */
  current: string | null;
}

export const initialState: PlotDeckState = { scenarios: [], current: null };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = TEXT_MAX): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const idOf = (v: unknown): string => (typeof v === 'string' && /^[\w.-]{1,64}$/.test(v) ? v : '');

function written(
  raw: unknown,
  valid: (card: string) => boolean,
  max: number,
): Record<string, Written> {
  const out: Record<string, Written> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!ALL_KEYS.includes(k) || !isObj(v)) continue;
    const card = idOf(v.card);
    const text = str(v.text, max);
    if (card && valid(card) && text.trim()) out[k] = { card, text };
  }
  return out;
}

function sanitizePlot(raw: unknown): Plot {
  const p = isObj(raw) ? raw : {};
  const deductions = arr(p.deductions)
    .filter(isObj)
    .map((d) => ({ id: idOf(d.id), text: str(d.text, SHORT_MAX * 2) }))
    .filter((d) => d.id);
  const scenes = arr(p.scenes)
    .filter(isObj)
    .map((s) => ({
      id: idOf(s.id),
      name: str(s.name, SHORT_MAX),
      place: str(s.place, SHORT_MAX),
      what: str(s.what),
    }))
    .filter((s) => s.id);
  const dedIds = new Set(deductions.map((d) => d.id));
  const sceneIds = new Set(scenes.map((s) => s.id));
  const clues: Clue[] = arr(p.clues)
    .filter(isObj)
    .map((c) => {
      const scene = idOf(c.scene);
      return {
        id: idOf(c.id),
        text: str(c.text),
        how: str(c.how, SHORT_MAX * 2),
        scene: sceneIds.has(scene) ? scene : '',
        links: [...new Set(arr(c.links).map(idOf))].filter((x) => dedIds.has(x)),
      };
    })
    .filter((c) => c.id);
  const uniq = <T extends { id: string }>(list: T[]) => {
    const seen = new Set<string>();
    return list.filter((x) => !seen.has(x.id) && !!seen.add(x.id));
  };
  return { deductions: uniq(deductions), scenes: uniq(scenes), clues: uniq(clues) };
}

/** 一份劇本（壞掉、不是劇本時 null） */
export function sanitizeScenario(raw: unknown, now = Date.now()): Scenario | null {
  if (!isObj(raw) || !isDeckId(raw.deck)) return null;
  const deck = getDeck(raw.deck);
  const base = newScenario(raw.deck, {}, now);
  const sc: Scenario = { ...base };
  sc.id = idOf(raw.id) || base.id;
  sc.created = num(raw.created, now);
  sc.updated = num(raw.updated, sc.created);
  sc.title = str(raw.title, 60);
  sc.mission = findMission(deck, str(raw.mission))?.id ?? null;
  sc.tone = findTone(deck, str(raw.tone))?.id ?? null;
  sc.madeBy = (['random', 'setup', 'catalog'] as const).includes(raw.madeBy as MadeBy)
    ? (raw.madeBy as MadeBy)
    : null;
  sc.pcCount = Math.min(PC_MAX, Math.max(PC_MIN, Math.round(num(raw.pcCount, 2))));
  sc.useSecrets = typeof raw.useSecrets === 'boolean' ? raw.useSecrets : true;
  const slots = isObj(raw.slots) ? raw.slots : {};
  for (const k of ALL_KEYS) {
    const s = isObj(slots[k]) ? (slots[k] as Obj) : {};
    const card = findCard(deck, idOf(s.card));
    sc.slots[k] = {
      card: card && card.cat === slotCat(k) ? card.id : null,
      locked: !!card && s.locked === true,
    };
  }
  const has = (k: string) => (card: string) => sc.slots[k]?.card === card;
  const ans = written(raw.answers, () => true, TEXT_MAX);
  const qs = written(raw.questions, () => true, SHORT_MAX * 2);
  sc.answers = Object.fromEntries(Object.entries(ans).filter(([k, v]) => has(k)(v.card)));
  sc.questions = Object.fromEntries(Object.entries(qs).filter(([k, v]) => has(k)(v.card)));
  sc.pcs = Array.from({ length: PC_MAX }, (_, i) => {
    const p = arr(raw.pcs)[i];
    if (!isObj(p)) return emptyPc();
    const target = idOf(p.target);
    return { name: str(p.name, 40), role: str(p.role, SHORT_MAX), target: target || null };
  });
  const npc = isObj(raw.npc) ? raw.npc : {};
  sc.npc = { name: str(npc.name, 40), tie: str(npc.tie) };
  const seen = new Set<string>();
  sc.extras = arr(raw.extras)
    .filter(isObj)
    .map(
      (x): ExtraNpc => ({
        id: idOf(x.id),
        name: str(x.name, 40),
        role: str(x.role, SHORT_MAX),
        tie: str(x.tie),
      }),
    )
    .filter((x) => x.id && x.id !== 'npc' && !seen.has(x.id) && !!seen.add(x.id))
    .slice(0, 20);
  sc.plot = sanitizePlot(raw.plot);
  const anyCard = Object.values(sc.slots).some((s) => s.card);
  const phase = (['start', 'setup', 'done'] as const).includes(raw.phase as Phase)
    ? (raw.phase as Phase)
    : 'start';
  /* 抽好的卡還在就是「抽好了」；沒有卡的「抽好了」回到開始 */
  sc.phase = phase === 'done' && !anyCard ? 'start' : phase;
  sc.setupStage = raw.setupStage === 'cards' ? 'cards' : 'core';
  sc.coreOffer = arr(raw.coreOffer)
    .map(idOf)
    .filter((id) => findCard(deck, id)?.cat === 'core')
    .slice(0, 3);
  if (sc.phase === 'setup' && sc.setupStage === 'core' && !sc.coreOffer.length) sc.coreOffer = [];
  sc.step = STEPS.includes(raw.step as Step) ? (raw.step as Step) : 'cards';
  return sc;
}

/** 自動存檔的整份資料 */
export function sanitizeState(raw: unknown): PlotDeckState {
  const r = isObj(raw) ? raw : {};
  const seen = new Set<string>();
  const scenarios = arr(r.scenarios)
    .map((x) => sanitizeScenario(x))
    .filter((x): x is Scenario => !!x && !seen.has(x.id) && !!seen.add(x.id))
    .slice(0, LIBRARY_MAX);
  const current = typeof r.current === 'string' && seen.has(r.current) ? r.current : null;
  return { scenarios, current };
}

/** 專案檔的資料（目前的劇本） */
export interface ProjectData {
  scenario: Scenario;
}

/** 讀專案檔：版本比這一版新、不是劇本時丟 ProjectFileError（訊息可以直接顯示） */
export function scenarioFromProject(data: unknown, version: number): Scenario {
  if (version > PROJECT_VERSION) throw new ProjectFileError(S.project.newer);
  const sc = sanitizeScenario(isObj(data) ? data.scenario : null);
  if (!sc) throw new ProjectFileError(S.project.invalid);
  return sc;
}
