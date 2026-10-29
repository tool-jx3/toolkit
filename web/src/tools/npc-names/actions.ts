/**
 * 動作：產生一批（用到才載入那個地區的資料）、改條件（改了就換一批，鎖定的留著）、鎖定、複製。
 */
import { create } from 'zustand';
import { toCsv } from '@/core/csv';
import { copyText, downloadText } from '@/core/files';
import { loadedNameData, loadNameData, type NameData } from '@/core/names';
import {
  copyAllText,
  copyLine,
  csvRows,
  exportFileName,
  type NamesState,
  nextBatch,
  pushHistory,
  sanitizeHistory,
  sanitizeState,
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

async function generateBatch(): Promise<void> {
  const mine = ++ticket;
  const region = currentState().region;
  let data: NameData | null = loadedNameData(region);
  if (!data) {
    useStatus.setState({ loading: true, failed: false });
    try {
      data = await loadNameData(region);
    } catch {
      if (mine === ticket) useStatus.setState({ loading: false, failed: true });
      return;
    }
    if (mine !== ticket) return;
    useStatus.setState({ loading: false });
  }
  const state = currentState();
  if (state.region !== region) return;
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
    useHistory.getState().patch({
      history: pushHistory(sanitizeHistory(useHistory.getState().data.history), {
        id: `${at}-${batch.seed}`,
        at,
        region,
        era: state.eras[region],
        gender: state.gender,
        seed: batch.seed,
        names: batch.names,
      }),
    });
  }
}

/** 把紀錄裡的一批放回來（地區、年代、性別也換回那一批的；鎖定清掉；可以復原） */
export function restoreHistory(id: string): void {
  const entry = sanitizeHistory(useHistory.getState().data.history).find((e) => e.id === id);
  if (!entry) return;
  ++ticket;
  void asStep(() =>
    useNames.getState().update((d) => {
      d.region = entry.region;
      if (entry.era) d.eras[entry.region] = entry.era;
      d.gender = entry.gender;
      d.names = entry.names;
      d.locked = [];
      d.lastSeed = entry.seed;
    }),
  );
  useStatus.setState({ loading: false, failed: false, exhausted: false });
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

export function exportCsv(): void {
  const state = currentState();
  if (!state.names.length) return;
  downloadText(
    toCsv(csvRows(state.names), { bom: true }),
    exportFileName('csv'),
    'text/csv;charset=utf-8',
  );
}

/** 改條件（地區、年代、性別、數量、中間名縮寫）：改了就換一批（條件與新的一批算一步） */
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
