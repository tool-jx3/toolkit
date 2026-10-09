/**
 * 對 NPC 清單的操作（都經過 useNpcs，所以都可以復原）。目前的 NPC 在 useView。
 * 打字以外的操作（新增、刪除、擲骰、切換版本、開關）各算一步復原：就算緊接在打字之後（400 ms 內）也不會跟打字併成一步。
 */
import type { Characteristic, CocEdition, DiceParseError } from '@/core/coc';
import {
  blankCommand,
  blankSkill,
  currentNpc,
  diceError,
  type Npc,
  newNpc,
  recalc,
  rollAbility,
  rollAllAbilities,
} from './logic';
import { useNpcs, useRollNotice, useView } from './store';

/** 一個獨立的復原步驟 */
export function step<T>(fn: () => T): T {
  useNpcs.beginGesture();
  try {
    return fn();
  } finally {
    useNpcs.endGesture();
  }
}

export function getCurrent(): Npc {
  return currentNpc(useNpcs.getState().data, useView.getState().data.currentId);
}

/** 改目前的 NPC（fn 回傳新的 NPC） */
export function updateCurrent(fn: (npc: Npc) => Npc): void {
  const id = getCurrent().id;
  const { data, replace } = useNpcs.getState();
  replace({ ...data, npcs: data.npcs.map((n) => (n.id === id ? fn(n) : n)) });
}

/** 改目前 NPC 的幾個欄位（打字用：連續的變更併成一步） */
export function patchCurrent(patch: Partial<Npc>): void {
  updateCurrent((n) => ({ ...n, ...patch }));
}

/** 改目前 NPC 的幾個欄位（開關、選項：一次算一步） */
export function patchCurrentStep(patch: Partial<Npc>): void {
  step(() => patchCurrent(patch));
}

export function selectNpc(id: string): void {
  if (useView.getState().data.currentId !== id) useRollNotice.setState({ npcId: null, stats: [] });
  useView.getState().patch({ currentId: id });
}

/** 新增（版本同目前的 NPC），並切到新的 */
export function addNpc(): void {
  const npc = newNpc(getCurrent().edition);
  step(() =>
    useNpcs.getState().update((d) => {
      d.npcs.push(npc);
    }),
  );
  selectNpc(npc.id);
}

/** 刪除（至少留一個）；刪掉的是目前的 NPC 時切到第一個 */
export function removeNpc(id: string): void {
  const { npcs } = useNpcs.getState().data;
  if (npcs.length <= 1) return;
  const wasCurrent = getCurrent().id === id;
  step(() =>
    useNpcs.getState().update((d) => {
      d.npcs = d.npcs.filter((n) => n.id !== id);
    }),
  );
  if (wasCurrent) selectNpc(useNpcs.getState().data.npcs[0].id);
}

/** 切換版本：重新算衍生值（屬性的值不換算） */
export function setEdition(edition: CocEdition): void {
  step(() => updateCurrent((n) => recalc({ ...n, edition })));
}

export function setAbilityDice(stat: Characteristic, dice: string): void {
  updateCurrent((n) => ({
    ...n,
    abilities: { ...n.abilities, [stat]: { ...n.abilities[stat], dice } },
  }));
}

/** 直接改屬性的值：重新算衍生值 */
export function setAbilityValue(stat: Characteristic, value: number): void {
  updateCurrent((n) =>
    recalc({ ...n, abilities: { ...n.abilities, [stat]: { ...n.abilities[stat], value } } }),
  );
}

/** 擲一項（看不懂的算式回傳錯誤） */
export function rollOne(stat: Characteristic): DiceParseError | null {
  const r = rollAbility(getCurrent(), stat);
  if (r.npc !== getCurrent()) step(() => updateCurrent(() => r.npc));
  return r.error;
}

/**
 * 全部擲骰（「全部擲骰」鈕、快捷鍵 R、擲骰並複製共用）：回傳看不懂、沒有擲的項目，並記在 useRollNotice
 * （全部擲成功時清掉說明）。
 */
export function rollAll(): Characteristic[] {
  const npc = getCurrent();
  const r = rollAllAbilities(npc);
  step(() => updateCurrent(() => r.npc));
  useRollNotice.setState({ npcId: npc.id, stats: r.errors });
  return r.errors;
}

/** 目前還要顯示的跳過項目：最近一次全部擲骰跳過、而且現在仍然看不懂的（改好或清空的不再列） */
export function pendingSkipped(
  npc: Npc,
  notice: { npcId: string | null; stats: readonly Characteristic[] },
): Characteristic[] {
  if (notice.npcId !== npc.id) return [];
  return notice.stats.filter((s) => diceError(npc.abilities[s]?.dice ?? '') !== null);
}

/* ---------- 技能與指令 ---------- */

export function addSkill(): void {
  step(() => updateCurrent((n) => ({ ...n, skills: [...n.skills, blankSkill()] })));
}

export function patchSkill(id: string, patch: { name?: string; value?: number }): void {
  updateCurrent((n) => ({
    ...n,
    skills: n.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  }));
}

export function removeSkill(id: string): void {
  step(() => updateCurrent((n) => ({ ...n, skills: n.skills.filter((s) => s.id !== id) })));
}

export function addCommand(): void {
  step(() => updateCurrent((n) => ({ ...n, commands: [...n.commands, blankCommand()] })));
}

export function patchCommand(id: string, patch: { name?: string; expr?: string }): void {
  updateCurrent((n) => ({
    ...n,
    commands: n.commands.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  }));
}

export function removeCommand(id: string): void {
  step(() => updateCurrent((n) => ({ ...n, commands: n.commands.filter((c) => c.id !== id) })));
}
