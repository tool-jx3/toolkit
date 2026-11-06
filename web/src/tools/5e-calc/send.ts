/** 「加進戰鬥追蹤」：在點擊的當下呼叫（`@/core/combat` 先開新分頁、再寫資料），結果用通知告訴使用者 */
import { type CombatSeed, seedTotal, sendToCombatTracker } from '@/core/combat';
import type { ToastOptions } from '@/ui';
import { TOOL_ID } from './model';
import { S } from './strings';

export function sendSeeds(
  seeds: readonly CombatSeed[],
  name: string,
  toast: (o: ToastOptions) => void,
): void {
  if (!seeds.length) return;
  void sendToCombatTracker({ from: TOOL_ID, name, seeds }).then((r) => {
    if (!r.sent) {
      toast({
        title: S.send.failed,
        description: S.send.failedHint,
        tone: 'danger',
        duration: 10_000,
      });
      return;
    }
    if (!r.opened) {
      toast({
        title: S.send.blocked,
        description: S.send.blockedHint,
        tone: 'warning',
        duration: 10_000,
        action: { label: S.send.open, onClick: () => window.open(r.href, '_blank') },
      });
      return;
    }
    toast({ title: S.send.ok(seedTotal(seeds)), tone: 'success' });
  });
}
