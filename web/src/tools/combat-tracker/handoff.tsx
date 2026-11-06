/**
 * 別的工具送來的參戰者（`@/core/combat`；5e 速查計算的遭遇與快速怪物）：
 * - 寄件的工具在點擊的當下開的分頁：網址的 # 帶 `handoff=<id>`，資料晚一點才寫好——顯示「正在接收」等那一筆，
 *   拿到就加入（一步復原）並通知；# 讀到就從網址拿掉。
 * - 直接開（或重新整理）時還有一天內的交接資料（例如新分頁被瀏覽器擋住）：問要不要加入。
 */
import { useEffect, useState } from 'react';
import { COMBAT_TRACKER_ID, parseCombatHandoff, seedTotal } from '@/core/combat';
import { type Handoff, readHandoffId, takeHandoff, waitHandoff } from '@/core/handoff';
import { getTool } from '@/registry';
import { Notice, useConfirm, useToast } from '@/ui';
import { addSeeds } from './model';
import { step } from './store';
import { S } from './strings';

let started = false;

function clearHash() {
  try {
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  } catch {
    /* 改不了網址就算了 */
  }
}

const fromName = (h: Handoff) => getTool(h.from)?.name ?? h.from;

export function HandoffReceiver() {
  const toast = useToast();
  const confirm = useConfirm();
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (started) return;
    started = true;
    const apply = async (h: Handoff, ask: boolean) => {
      const seeds = parseCombatHandoff(await h.blob.text());
      if (!seeds?.length) return;
      if (
        ask &&
        !(await confirm({
          title: S.handoff.askTitle(seedTotal(seeds), fromName(h)),
          description: S.handoff.askDesc,
          confirmLabel: S.handoff.askOk,
          cancelLabel: S.handoff.askNo,
        }))
      )
        return;
      let n = 0;
      step((d) => {
        n = addSeeds(d, seeds);
      });
      toast({ title: S.handoff.added(n, fromName(h)), tone: 'success' });
    };
    void (async () => {
      const id = readHandoffId(location.hash);
      if (!id) {
        const h = await takeHandoff(COMBAT_TRACKER_ID);
        if (h) await apply(h, true);
        return;
      }
      clearHash();
      setWaiting(true);
      const r = await waitHandoff(COMBAT_TRACKER_ID, id);
      setWaiting(false);
      if (r.status === 'ok') {
        await apply(r.handoff, false);
        return;
      }
      toast({
        title: r.status === 'failed' ? S.handoff.failed : S.handoff.timeout,
        description: S.handoff.retry,
        tone: 'warning',
        duration: 10_000,
      });
    })();
  }, [confirm, toast]);
  return waiting ? (
    <div data-testid="handoff-waiting">
      <Notice tone="progress">{S.handoff.waiting}</Notice>
    </div>
  ) : null;
}
