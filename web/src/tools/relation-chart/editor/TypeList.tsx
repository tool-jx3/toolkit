/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 關係類型清單（原作的「關係列表」）：顯示核取方塊（Alt＋點＝只顯示這一種）、線型樣本、名稱、編輯鈕；
 * 點一列＝進入這種關係的建立關係模式（再點一次結束）；拖曳換順序（圖例照這個順序；觸控從列左邊的把手拖）。
 */
import { Pencil, Plus } from 'lucide-react';
import { IconButton, SortableList } from '@/ui';
import type { SheetCtx } from '../engine/geom';
import { typeLabel } from '../model/factory';
import type { RelType } from '../model/types';
import { addType, moveType, startLink, toggleTypeHidden } from '../state/actions';
import { holdHistory, releaseHistory, setUi, useUi } from '../state/store';
import { S } from '../strings';
import { useCtx, useSheet } from './hooks';
import { TypeSample } from './thumbs';
import { DragHandle } from './widgets';

function Row({ t, ctx, active }: { t: RelType; ctx: SheetCtx; active: boolean }) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 py-0.5 ${active ? 'text-accent' : ''}`}
      data-testid="type-row"
      data-type-id={t.id}
    >
      <DragHandle title={S.types.dragTip} />
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-(--accent)"
        checked={!t.hidden}
        aria-label={S.types.visTip}
        title={S.types.visTip}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          toggleTypeHidden(t.id, e.altKey);
        }}
        onChange={() => {}}
        data-testid="type-visible"
      />
      <TypeSample ctx={ctx} t={t} width={44} height={18} />
      <span
        className={`min-w-0 flex-1 truncate text-sm ${t.hidden ? 'text-muted line-through' : ''}`}
      >
        {typeLabel(t, ctx.sheet.types)}
      </span>
      <IconButton
        size="sm"
        icon={<Pencil />}
        label={S.types.edit}
        onClick={(e) => {
          e.stopPropagation();
          setUi({ panel: { kind: 'type', id: t.id } });
        }}
        data-testid="type-edit"
      />
    </div>
  );
}

export function TypeList() {
  const sheet = useSheet();
  const ctx = useCtx(sheet);
  const link = useUi((u) => u.link);
  return (
    <div className="flex min-h-0 flex-col gap-2" data-testid="type-list">
      <div className="flex items-center gap-1">
        <h2 className="text-sm font-semibold">{S.types.title}</h2>
        <span className="ml-auto" />
        <IconButton
          size="sm"
          icon={<Plus />}
          label={S.types.add}
          onClick={() => addType()}
          data-testid="type-add"
        />
      </div>
      <div className="min-h-0 overflow-auto lg:flex-1">
        <SortableList
          aria-label={S.types.listLabel}
          items={sheet.types}
          getId={(t) => String(t.id)}
          selectedId={link ? String(link.typeId) : null}
          onSelect={(id) => startLink(Number(id))}
          onMove={(from, to) => moveType(from, to)}
          onMoveStart={() => holdHistory('list')}
          onMoveEnd={() => releaseHistory('list')}
          renderItem={(t) => <Row t={t} ctx={ctx} active={link?.typeId === t.id} />}
          empty={S.types.empty}
        />
      </div>
      <p className="hidden text-xs text-muted lg:block">{S.types.linkTip}</p>
    </div>
  );
}
