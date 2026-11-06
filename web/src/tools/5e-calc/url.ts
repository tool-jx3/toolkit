/**
 * 網址的 `?cr=`（原作 quick_monster_stats 的做法，F22）：開頁時讀、換 CR 時寫回（replaceState，不留歷史紀錄）。
 */
import { type Cr, parseCr } from '@/core/srd5/cr';

export function readCrFromUrl(): Cr | null {
  try {
    const v = new URLSearchParams(location.search).get('cr');
    return v ? parseCr(v) : null;
  } catch {
    return null;
  }
}

export function writeCrToUrl(cr: Cr): void {
  try {
    const url = new URL(location.href);
    if (url.searchParams.get('cr') === cr) return;
    url.searchParams.set('cr', cr);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* 改不了網址就算了 */
  }
}
