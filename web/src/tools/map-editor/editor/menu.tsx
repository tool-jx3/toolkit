/**
 * 右鍵選單的項目（F063）：重新命名、複製、移到最上層、移到最下層、鎖定／解除鎖定、刪除。
 */
import { BringToFront, Copy, Lock, LockOpen, Pencil, SendToBack, Trash2 } from 'lucide-react';
import type { ContextMenuItem } from '@/ui';
import { act } from '../actions';
import type { MapEngine } from '../engine/engine';
import { selected } from '../engine/ops';
import { setEditor, usePrefs } from '../stores';
import { S } from '../strings';

/** 圖層清單上改名（右鍵選單）：圖層清單不在畫面上時切到「圖層」分頁 */
export function startRename(id: number): void {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    !window.matchMedia('(min-width: 1280px)').matches
  )
    usePrefs.getState().patch({ panelTab: 'layers' });
  setEditor({ renamingId: id });
}

export function contextItems(eng: MapEngine): ContextMenuItem[] {
  const objs = selected(eng);
  const locked = !!objs[0]?.lockMovementX;
  const items: ContextMenuItem[] = [];
  if (objs.length === 1)
    items.push({
      label: S.actions.rename,
      icon: <Pencil />,
      onSelect: () => startRename(objs[0]._layerId ?? -1),
    });
  items.push(
    { label: S.actions.duplicate, icon: <Copy />, onSelect: act.duplicate },
    { label: S.actions.front, icon: <BringToFront />, onSelect: act.front },
    { label: S.actions.back, icon: <SendToBack />, onSelect: act.back },
    {
      label: locked ? S.actions.unlock : S.actions.lock,
      icon: locked ? <LockOpen /> : <Lock />,
      onSelect: act.lock,
    },
    {
      label: S.actions.delete,
      icon: <Trash2 />,
      onSelect: act.delete,
      danger: true,
      separatorBefore: true,
    },
  );
  return items;
}
