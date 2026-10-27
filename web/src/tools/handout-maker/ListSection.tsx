/**
 * 道具清單（規格 F01）：每一張的縮圖（同一段程式畫）、點一下切換編輯的那一張、拖曳或 Alt＋↑／↓ 排順序、
 * 新增一張、建立副本、刪除（至少留一張；可以復原）。
 */
import { Copy, Plus } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import { Button, Section, ThumbnailList, useToast } from '@/ui';
import { HANDOUT_MAX, handoutName } from './model';
import {
  addBlank,
  duplicateActive,
  historyStep,
  moveHandout,
  removeHandout,
  select,
  useActive,
  useDoc,
} from './store';
import { S } from './strings';
import { useThumbs } from './thumbs';

export function ListSection() {
  const live = useDoc((s) => s.data.items);
  const activeId = useActive().id;
  /* 縮圖在閒置時分批重畫（thumbs.ts），打字不會卡 */
  const thumbs = useThumbs(live, activeId);
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const full = live.length >= HANDOUT_MAX;
  const remove = useCallback((id: string) => {
    const gone = removeHandout(id);
    if (gone)
      toastRef.current({
        title: S.removed(handoutName(gone) || S.untitled),
        replace: true,
        action: { label: S.undoAction, onClick: () => historyStep('undo') },
      });
  }, []);
  /* 清單上看得到的文字（名稱、主題、大小）：打本文時通常不變，清單就不重畫 */
  const rows = live.map((h) => ({
    id: h.id,
    name: handoutName(h) || S.untitled,
    meta: `${S.themes[h.theme]}・${h.width} × ${h.height}`,
  }));
  const rowsKey = rows.map((r) => `${r.id}\u0001${r.name}\u0001${r.meta}`).join('\u0000');
  // biome-ignore lint/correctness/useExhaustiveDependencies: rowsKey 已包含 rows 的內容
  const list = useMemo(
    () => (
      <ThumbnailList
        aria-label={S.listLabel}
        items={rows.map((r) => ({ ...r, image: thumbs.get(r.id) }))}
        selectedId={activeId}
        onSelect={select}
        onReorder={moveHandout}
        onRemove={remove}
        removeLabel={(it) => S.removeItem(it.name)}
        removeDisabled={rows.length <= 1}
        minItemWidth={96}
        thumbAspect={3 / 4}
        className="max-h-[22rem] overflow-y-auto"
      />
    ),
    [rowsKey, thumbs, activeId, remove],
  );
  return (
    <Section
      title={S.listTitle}
      actions={
        <span className="text-xs text-muted tabular-nums" data-testid="list-count">
          {S.listCount(live.length, HANDOUT_MAX)}
        </span>
      }
    >
      {list}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<Plus />}
          disabled={full}
          data-testid="add-handout"
          onClick={() => {
            if (addBlank()) toast({ title: S.added, replace: true });
          }}
        >
          {S.addNew}
        </Button>
        <Button
          size="sm"
          icon={<Copy />}
          disabled={full}
          data-testid="duplicate-handout"
          onClick={() => {
            if (duplicateActive()) toast({ title: S.duplicated, replace: true });
          }}
        >
          {S.duplicate}
        </Button>
        {full ? <span className="text-xs text-muted">{S.listFull(HANDOUT_MAX)}</span> : null}
      </div>
      <p className="m-0 text-xs text-muted">{S.listHint}</p>
    </Section>
  );
}
