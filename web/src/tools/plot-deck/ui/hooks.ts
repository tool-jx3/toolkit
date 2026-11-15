/**
 * 畫面用的 hook：目前的劇本、換卡前的確認（回答會清掉、體驗的核心換了之後的真相與結局）、換掉的卡的短暫標示。
 */
import { useMemo } from 'react';
import { historyGesture } from '@/core/storage';
import { useConfirm, useToast } from '@/ui';
import {
  changeMissionTone,
  currentNow,
  currentOf,
  pickFromList,
  redrawAll,
  redrawTargets,
  refitCore,
  reroll,
} from '../actions';
import { getDeck } from '../data';
import { missionToneLabel } from '../model/document';
import { answersAtRisk, missionToneTargets } from '../model/draw';
import { type Scenario, toneSlotName } from '../model/scenario';
import { setUi, usePlot } from '../store';
import { S } from '../strings';

export function useCurrent(): Scenario | null {
  return usePlot((s) => currentOf(s.data));
}

/** 文字欄：聚焦到離開算一步復原 */
export const textGesture = historyGesture(usePlot);

let flashTimer: ReturnType<typeof setTimeout> | null = null;
export function flash(keys: readonly string[]): void {
  setUi({ flash: [...keys] });
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => setUi({ flash: [] }), 1200);
}

export function useCardOps() {
  const confirm = useConfirm();
  const toast = useToast();
  return useMemo(() => {
    /** 換這些欄之前：回答會清掉的話先確認 */
    const guard = async (keys: readonly string[]): Promise<boolean> => {
      const sc = currentNow();
      if (!sc) return false;
      const risk = answersAtRisk(sc, keys);
      if (!risk.length) return true;
      if (keys.includes('truth'))
        return confirm({
          title: S.confirm.truthTitle,
          description: S.confirm.truthDesc,
          confirmLabel: S.confirm.truthOk,
        });
      return confirm({
        title: S.confirm.loseTitle,
        description: S.confirm.loseDesc(risk.length),
        confirmLabel: S.confirm.loseOk,
      });
    };
    /** 體驗的核心換了：合不來的真相與結局要不要重抽 */
    const followCore = async (misfits: readonly string[]): Promise<string[]> => {
      if (!misfits.length) return [];
      const ok = await confirm({
        title: S.confirm.followCoreTitle,
        description: S.confirm.followCoreDesc,
        confirmLabel: S.confirm.followCoreOk,
        cancelLabel: S.confirm.followCoreKeep,
      });
      if (!ok || !(await guard(misfits))) return [];
      return refitCore(misfits);
    };
    return {
      async reroll(key: string) {
        if (!(await guard([key]))) return;
        const r = reroll(key);
        const more = await followCore(r.misfits);
        flash([...r.changed, ...more]);
      },
      async pick(key: string, cardId: string) {
        const sc = currentNow();
        if (!sc || sc.slots[key]?.card === cardId) return;
        if (sc.phase === 'done' && !(await guard([key]))) return;
        const r = pickFromList(key, cardId);
        const more = await followCore(r.misfits);
        flash([...r.changed, ...more]);
      },
      async redrawAll() {
        const sc = currentNow();
        if (!sc) return;
        if (!(await guard(redrawTargets(sc)))) return;
        flash(redrawAll());
      },
      /** 換題材與氣氛（合不來的卡問過才重抽） */
      async changeMissionTone(mission: string | null, tone: string | null) {
        const sc = currentNow();
        if (!sc || (mission === sc.mission && tone === sc.tone)) return;
        const deck = getDeck(sc.deck);
        const { must, optional } = missionToneTargets(deck, sc, mission, tone);
        const targets = [...must, ...optional];
        const label = missionToneLabel(deck, { mission, tone });
        if (!targets.length) {
          changeMissionTone(mission, tone, []);
          toast({ title: S.mt.applied(label), tone: 'success', replace: true });
          return;
        }
        const slot = toneSlotName(deck, sc);
        const ok = await confirm({
          title: S.mt.refitTitle,
          description: S.mt.refitDesc(tone !== sc.tone, slot, targets.length),
          confirmLabel: S.mt.refitOk,
        });
        if (!ok || !(await guard(targets))) return;
        const changed = changeMissionTone(mission, tone, targets);
        flash(changed);
        toast({ title: S.mt.refitted(label, changed.length), tone: 'success', replace: true });
      },
    };
  }, [confirm, toast]);
}
