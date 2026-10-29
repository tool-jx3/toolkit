/**
 * 動作：產生一批（用到才載入那個地區的資料）、改條件（改了就換一批，鎖定的留著）、鎖定、複製。
 */
import { create } from 'zustand';
import { copyText } from '@/core/files';
import { loadedNameData, loadNameData, type NameData } from '@/core/names';
import { copyAllText, copyLine, type NamesState, nextBatch, sanitizeState } from './logic';
import { useNames } from './store';
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

/** 產生一批：鎖定的留著，其他換成新的。之後又按了一次（或改了條件）時，前一次還沒載入完的結果丟掉。 */
export async function generate(): Promise<void> {
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
}

/** 改條件（地區、年代、性別、數量、中間名縮寫）：改了就換一批 */
export function setConditions(recipe: (d: NamesState) => void): void {
  useNames.getState().update((d) => {
    recipe(d as NamesState);
  });
  void generate();
}

export function toggleLock(text: string): void {
  useNames.getState().update((d) => {
    d.locked = d.locked.includes(text) ? d.locked.filter((t) => t !== text) : [...d.locked, text];
  });
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
