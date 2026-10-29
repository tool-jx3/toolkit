/**
 * 動作：產生一批（用到才載入那個地區的資料）、改條件（改了就換一批，鎖定的留著）、鎖定、複製。
 */
import { create } from 'zustand';
import { toCsv } from '@/core/csv';
import { copyText, downloadText } from '@/core/files';
import { loadedNameData, loadNameData, type NameData } from '@/core/names';
import {
  type CorpusData,
  type CorpusRegion,
  type CorpusSearchEntry,
  corpusPack,
  loadCorpus,
  loadedCorpus,
  rehydrateCorpusName,
} from '@/core/names/corpus';
import {
  copyAllText,
  copyLine,
  csvRows,
  currentEra,
  effectiveConditions,
  eraOption,
  exportFileName,
  type HistoryEntry,
  isCorpusName,
  type NamesState,
  type NpcName,
  needsDetails,
  nextBatch,
  pushHistory,
  sanitizeHistory,
  sanitizeState,
  searchCopyLine,
  storeHistory,
  toTxt,
} from './logic';
import { useHistory, useNames } from './store';
import { S } from './strings';

interface Status {
  loading: boolean;
  failed: boolean;
  exhausted: boolean;
}

/** 讀取中、讀不到、名字不夠（不存檔、不列入復原） */
export const useStatus = create<Status>(() => ({
  loading: false,
  failed: false,
  exhausted: false,
}));

export const currentState = (): NamesState => sanitizeState(useNames.getState().data);

let ticket = 0;

/**
 * 一個獨立的復原步驟（產生、改條件、鎖定、放回紀錄）：就算緊接在上一個變更之後（400 ms 內）也不會併在一起；
 * 改條件的「條件＋新的一批」（資料載入後才有）算同一步。已經在手勢裡（例如拖數量的滑桿）時併進那個手勢。
 */
async function asStep(fn: () => void | Promise<void>): Promise<void> {
  const own = !useNames.inGesture();
  if (own) useNames.beginGesture();
  try {
    await fn();
  } finally {
    if (own) useNames.endGesture();
  }
}

/** 產生一批：鎖定的留著，其他換成新的。之後又按了一次（或改了條件）時，前一次還沒載入完的結果丟掉。 */
export function generate(): Promise<void> {
  return asStep(generateBatch);
}

/** 目前的地區與年代用的資料：依人數的名單（core/names）或那個地區的考據語料（core/names/corpus） */
function sourceData(state: NamesState): {
  loaded: NameData | CorpusData | null;
  load: () => Promise<NameData | CorpusData>;
} {
  const src = currentEra(state).source;
  if (src.kind === 'count')
    return { loaded: loadedNameData(src.region), load: () => loadNameData(src.region) };
  return { loaded: loadedCorpus(state.region), load: () => loadCorpus(state.region) };
}

async function generateBatch(): Promise<void> {
  const mine = ++ticket;
  const before = currentState();
  const region = before.region;
  const era = currentEra(before).id;
  const source = sourceData(before);
  let data = source.loaded;
  if (!data) {
    useStatus.setState({ loading: true, failed: false });
    try {
      data = await source.load();
    } catch {
      if (mine === ticket) useStatus.setState({ loading: false, failed: true });
      return;
    }
    if (mine !== ticket) return;
    useStatus.setState({ loading: false });
  }
  const state = currentState();
  if (state.region !== region || currentEra(state).id !== era) return;
  const batch = nextBatch(state, data);
  const texts = new Set(batch.names.map((n) => n.text));
  useNames.getState().update((d) => {
    d.names = batch.names;
    d.lastSeed = batch.seed;
    d.locked = state.locked.filter((t) => texts.has(t));
  });
  useStatus.setState({ failed: false, exhausted: batch.exhausted });
  if (batch.names.length) {
    const at = Date.now();
    const cond = effectiveConditions(state);
    useHistory.getState().patch({
      history: storeHistory(
        pushHistory(sanitizeHistory(useHistory.getState().data.history), {
          id: `${at}-${batch.seed}`,
          at,
          region,
          era,
          gender: cond.gender,
          ...(cond.rank !== 'all' ? { rank: cond.rank } : {}),
          ...(cond.country !== 'all' ? { country: cond.country } : {}),
          ...(cond.part !== 'full' ? { part: cond.part } : {}),
          seed: batch.seed,
          names: batch.names,
        }),
      ),
    });
  }
}

/**
 * 紀錄裡的語料名字只存精簡版：從那個地區的資料查回涵義、備註、暱稱與姓的另一形（資料還沒載入時先載入）。
 * 讀不到資料或查不到（資料改版了）的就只有名字。
 */
async function withDetails(entry: HistoryEntry): Promise<NpcName[]> {
  if (!entry.names.some(needsDetails)) return entry.names;
  let data = loadedCorpus(entry.region);
  if (!data) data = await loadCorpus(entry.region).catch(() => null);
  return entry.names.map((n) => {
    if (!needsDetails(n) || !data) return n;
    const pack = corpusPack(data, n.pack);
    return (pack && rehydrateCorpusName(pack, n)) ?? n;
  });
}

/** 把紀錄裡的一批放回來（地區、年代、性別、階級、國家與輸出也換回那一批的；鎖定清掉；可以復原） */
export function restoreHistory(id: string): Promise<void> {
  const entry = sanitizeHistory(useHistory.getState().data.history).find((e) => e.id === id);
  if (!entry) return Promise.resolve();
  const mine = ++ticket;
  useStatus.setState({ loading: false, failed: false, exhausted: false });
  return asStep(async () => {
    const names = await withDetails(entry);
    /* 查回的期間又產生或改了條件：放棄這次放回 */
    if (mine !== ticket) return;
    useNames.getState().update((d) => {
      d.region = entry.region;
      if (entry.era) d.eras[entry.region] = entry.era;
      d.gender = entry.gender;
      /* 那一批的包有階級、國家的標記時，條件也換回來（紀錄沒寫＝不限） */
      const src = eraOption(entry.region, entry.era).source;
      if (src.kind === 'corpus' && src.pack.rank) d.rank = entry.rank ?? 'all';
      if (src.kind === 'corpus' && src.pack.countries) d.country = entry.country ?? 'all';
      /* 輸出：這個地區可以選時換回那一批的（紀錄沒寫＝全名） */
      if (entry.region !== 'tw') d.part = entry.part ?? 'full';
      d.names = names;
      d.locked = [];
      d.lastSeed = entry.seed;
    });
  });
}

export async function copyHistory(id: string): Promise<boolean> {
  const entry = sanitizeHistory(useHistory.getState().data.history).find((e) => e.id === id);
  if (!entry) return false;
  const ok = await copyText(copyAllText(entry.names, currentState()));
  notifier(ok, S.toast.copiedAll(entry.names.length));
  return ok;
}

export function clearHistory(): void {
  useHistory.getState().patch({ history: [] });
}

export function exportTxt(): void {
  const state = currentState();
  if (!state.names.length) return;
  downloadText(toTxt(state.names, state), exportFileName('txt'));
}

/**
 * 匯出 CSV（匯出當下的這一批）。依人數的名單的列的涵義（F57）從那個地區的考據語料查：還沒載入時先載入
 * （不管「顯示涵義」開不開；讀不到時那一欄留白）。
 */
export async function exportCsv(): Promise<void> {
  const state = currentState();
  if (!state.names.length) return;
  const regions = new Set(state.names.filter((n) => !isCorpusName(n)).map((n) => n.region));
  for (const region of regions) {
    if (!loadedCorpus(region)) await loadCorpus(region).catch(() => null);
  }
  downloadText(
    toCsv(csvRows(state.names, loadedCorpus), { bom: true }),
    exportFileName('csv'),
    'text/csv;charset=utf-8',
  );
}

/** 改條件（地區、年代、性別、階級、國家、輸出、數量、中間名縮寫）：改了就換一批（條件與新的一批算一步） */
export function setConditions(recipe: (d: NamesState) => void): Promise<void> {
  return asStep(async () => {
    useNames.getState().update((d) => {
      recipe(d as NamesState);
    });
    await generateBatch();
  });
}

export function toggleLock(text: string): void {
  void asStep(() =>
    useNames.getState().update((d) => {
      d.locked = d.locked.includes(text) ? d.locked.filter((t) => t !== text) : [...d.locked, text];
    }),
  );
}

/** 複製的結果怎麼通知（畫面上的元件註冊：通知要在 ToolShell 的 UiProvider 裡才發得出去） */
type CopyNotifier = (ok: boolean, title: string) => void;
let notifier: CopyNotifier = () => {};

export function setCopyNotifier(fn: CopyNotifier): () => void {
  notifier = fn;
  return () => {
    if (notifier === fn) notifier = () => {};
  };
}

export async function copyOne(text: string): Promise<boolean> {
  const state = currentState();
  const name = state.names.find((n) => n.text === text);
  const ok = await copyText(name ? copyLine(name, state) : text);
  notifier(ok, S.toast.copied(text));
  return ok;
}

export async function copyAll(): Promise<boolean> {
  const state = currentState();
  if (!state.names.length) return false;
  const ok = await copyText(copyAllText(state.names, state));
  notifier(ok, S.toast.copiedAll(state.names.length));
  return ok;
}

/** 複製查名字的一筆（附不附讀音同 F27） */
export async function copySearchHit(
  hit: CorpusSearchEntry,
  region: CorpusRegion,
): Promise<boolean> {
  const ok = await copyText(searchCopyLine(hit, region, currentState()));
  notifier(ok, S.toast.copied(hit.text));
  return ok;
}
