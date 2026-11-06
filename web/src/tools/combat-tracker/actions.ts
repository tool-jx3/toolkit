/**
 * 介面上的動作：改資料（一個動作算一步復原）＋必要時跳通知（專注檢定、死亡、狀態結束、新的一輪）。
 * 通知的函式由元件傳進來（`useToast()`）。
 */
import { copyText } from '@/core/files';
import type { ToastOptions } from '@/ui';
import {
  applyDamage,
  applyDeathSave,
  applyHeal,
  condName,
  grantTemp,
  type HpEvent,
  nextTurn,
  orderText,
  parseHpEntry,
  prevTurn,
  rollDie,
  setHp,
} from './model';
import { data, step } from './store';
import { S } from './strings';

export type Toast = (o: ToastOptions) => void;

const nameOf = (id: string) => data().list.find((c) => c.id === id)?.name ?? '';

function report(toast: Toast | undefined, id: string, events: readonly HpEvent[]) {
  if (!toast) return;
  const name = nameOf(id);
  for (const e of events) {
    if (e.kind === 'concentration')
      toast({ title: S.hp.concentration(name, e.dc), tone: 'info', duration: 8000 });
    else if (e.kind === 'died')
      toast({
        title: e.reason === 'massive' ? S.hp.diedMassive(name) : S.hp.died(name),
        tone: 'danger',
      });
    else if (e.kind === 'failure') toast({ title: S.hp.failure(name, e.ng), tone: 'warning' });
    else if (e.kind === 'dead-no-heal') toast({ title: S.hp.deadNoHeal(name), tone: 'warning' });
  }
}

/** 傷害：一次套用到好幾位（一步復原） */
export function damage(ids: readonly string[], n: number, toast?: Toast, crit = false): void {
  const all: [string, HpEvent[]][] = [];
  step((d) => {
    for (const id of ids) all.push([id, applyDamage(d, id, n, { crit })]);
  });
  for (const [id, ev] of all) report(toast, id, ev);
}

export function heal(ids: readonly string[], n: number, toast?: Toast): void {
  const all: [string, HpEvent[]][] = [];
  step((d) => {
    for (const id of ids) all.push([id, applyHeal(d, id, n)]);
  });
  for (const [id, ev] of all) report(toast, id, ev);
}

export function giveTemp(ids: readonly string[], n: number): void {
  step((d) => {
    for (const id of ids) grantTemp(d, id, n);
  });
}

/** HP 欄打的字：+N 回復、-N 傷害、N 設定；看不懂時 false（欄位還原） */
export function hpEntry(id: string, text: string, toast?: Toast): boolean {
  const e = parseHpEntry(text);
  if (!e) return false;
  if (e.kind === 'heal') heal([id], e.n, toast);
  else if (e.kind === 'damage') damage([id], e.n, toast);
  else step((d) => setHp(d, id, e.n));
  return true;
}

function turnToasts(toast: Toast | undefined, r: ReturnType<typeof nextTurn>, round: number) {
  if (!toast || !r.id) return;
  if (r.newRound) toast({ title: S.turn.roundToast(round), tone: 'info', replace: true });
  const who = nameOf(r.id);
  for (const k of r.expired) toast({ title: S.turn.expired(who, condName(k)), tone: 'info' });
}

export function goNext(toast?: Toast): void {
  let r: ReturnType<typeof nextTurn> = { id: null, newRound: false, expired: [] };
  step((d) => {
    r = nextTurn(d);
  });
  turnToasts(toast, r, data().round);
}

export function goPrev(): void {
  step((d) => {
    prevTurn(d);
  });
}

/** 擲死亡豁免（d20）並通知結果 */
export function rollDeath(id: string, toast?: Toast, rng: () => number = Math.random): void {
  const roll = rollDie('d20', rng);
  let r: ReturnType<typeof applyDeathSave> = null;
  step((d) => {
    r = applyDeathSave(d, id, roll);
  });
  if (!r || !toast) return;
  const c = data().list.find((x) => x.id === id);
  if (!c) return;
  const res = r as NonNullable<ReturnType<typeof applyDeathSave>>;
  const name = c.name;
  const title = `${name}：${S.death.result[res](roll, res === 'success' ? c.death.ok : c.death.ng)}`;
  if (c.death.dead) toast({ title: `${title}　${S.death.deadNow}`, tone: 'danger' });
  else if (c.death.stable) toast({ title: `${name}：${S.death.stableNow}`, tone: 'success' });
  else toast({ title, tone: res === 'success' || res === 'crit-success' ? 'success' : 'warning' });
}

export async function copyOrder(toast: Toast): Promise<void> {
  const ok = await copyText(orderText(data()));
  toast(
    ok ? { title: S.turn.copied, tone: 'success' } : { title: S.turn.copyFailed, tone: 'danger' },
  );
}
