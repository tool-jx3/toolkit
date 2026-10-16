/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 交換位置模式（F061；原作的 swapGameMode、handleSwapGameClick）：點第一位＝挑起，再點同一位＝放下；
 * 點第二位＝兩人交換座標與清單順序（一步復原），可以一直換下去。釘選的也能換（釘選只管排列與磁鐵）。
 * 模式中角色拖不動、長按不開面板（都當成點一下）；建立關係模式優先。
 */
import { swapChars } from '../state/libActions';
import { activeSheet, setUi, useUi } from '../state/store';

export function toggleSwap(on?: boolean): void {
  const cur = !!useUi.getState().swap;
  const next = on ?? !cur;
  if (next === cur) return;
  setUi(next ? { swap: { pick: null }, sel: [] } : { swap: null });
}

/** 交換位置模式中點了一位角色（畫布或角色清單） */
export function swapClick(id: number): void {
  const u = useUi.getState();
  if (!u.swap) return;
  const pick = u.swap.pick;
  const alive = pick !== null && activeSheet().chars.some((c) => c.id === pick);
  if (!alive) {
    /* 沒有挑起的（或挑起的那位已經被刪）：這一下＝挑起 */
    setUi({ swap: { pick: id }, sel: [] });
    return;
  }
  if (pick === id) {
    setUi({ swap: { pick: null } });
    return;
  }
  swapChars(pick, id);
  setUi({ swap: { pick: null }, sel: [] });
}
