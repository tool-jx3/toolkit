/**
 * 元素分頁（規格 1.5）：元素清單（勾選、顯示、鎖定、名稱與副標、色塊、拖曳排序）、再製與刪除、上移下移、對齊面板。
 */
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowUp,
  CopyPlus,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  LockOpen,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button, Checkbox, cn, Field, IconButton, Section, Select, SortableList } from '@/ui';
import {
  clearSelection,
  deleteSelected,
  duplicateSelected,
  moveLayer,
  reorderList,
  runAlignment,
  type SelectMode,
  selectAll,
  selectElement,
  toggleLocked,
  toggleVisible,
} from './actions';
import {
  type AlignAction,
  type AlignReference,
  alignEnabled,
  BOUNDS_ACTIONS,
  DISTRIBUTE_ACTIONS,
  isLayoutElement,
  SYMMETRY_ACTIONS,
} from './layout';
import type { McElement } from './model';
import { rgbOf } from './render';
import { useProject, useUi } from './store';
import { S } from './strings';

const modeOf = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): SelectMode =>
  e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'replace';

function Swatch({ el }: { el: McElement }) {
  const stroke = rgbOf(el.style.stroke);
  const glow = rgbOf(el.style.glowColor || el.style.stroke);
  return (
    <span
      role="img"
      aria-label={S.layers.swatch(stroke, glow)}
      className="inline-block size-4 shrink-0 rounded-sm border border-border"
      style={{ background: stroke, boxShadow: `0 0 6px 1px ${glow}` }}
    />
  );
}

function LayerRow({
  el,
  selected,
  primary,
  multi,
}: {
  el: McElement;
  selected: boolean;
  primary: boolean;
  multi: boolean;
}) {
  const symCount = useProject((s) => (s.data.symmetry.enabled ? s.data.symmetry.count : 0));
  const shift = useRef(false);
  const sub = [
    primary && multi ? S.layers.keyPrefix : null,
    el.symmetry && symCount ? S.layers.symPrefix(symCount) : null,
    S.motion.short[el.animation.mode],
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={cn('flex min-w-0 items-center gap-1 px-1 py-0.5', !el.visible && 'opacity-60')}>
      <span
        data-drag-handle
        aria-hidden
        className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted"
      >
        <GripVertical className="size-4" />
      </span>
      <span
        className="flex shrink-0 items-center"
        onPointerDownCapture={(e) => {
          shift.current = e.shiftKey;
        }}
        onKeyDownCapture={(e) => {
          shift.current = e.shiftKey;
        }}
      >
        <Checkbox
          aria-label={S.layers.selectAria(el.name)}
          checked={selected}
          onCheckedChange={() => selectElement(el.id, shift.current ? 'range' : 'toggle')}
        />
      </span>
      <IconButton
        size="sm"
        variant="ghost"
        label={el.visible ? S.layers.hide(el.name) : S.layers.show(el.name)}
        icon={el.visible ? <Eye /> : <EyeOff />}
        pressed={!el.visible}
        onClick={() => toggleVisible(el.id)}
      />
      <IconButton
        size="sm"
        variant="ghost"
        label={el.locked ? S.layers.unlock(el.name) : S.layers.lock(el.name)}
        icon={el.locked ? <Lock /> : <LockOpen />}
        pressed={el.locked}
        onClick={() => toggleLocked(el.id)}
      />
      <button
        type="button"
        className={cn(
          'flex min-w-0 flex-1 flex-col rounded-sm px-1.5 py-0.5 text-left hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        )}
        title={el.name}
        onClick={(e) => selectElement(el.id, modeOf(e))}
        data-testid="layer-name"
      >
        <span className={cn('truncate text-sm', primary && 'font-semibold')}>{el.name}</span>
        <span className="truncate text-xs text-muted">{sub}</span>
      </button>
      <Swatch el={el} />
    </div>
  );
}

function LayerList() {
  const elements = useProject((s) => s.data.elements);
  const { selected, primary } = useUi(
    useShallow((s) => ({ selected: s.selected, primary: s.primary })),
  );
  const rows = elements.slice().reverse();
  const multi = selected.length > 1;
  return (
    <SortableList<McElement>
      aria-label={S.layers.listLabel}
      items={rows}
      getId={(el) => el.id}
      selectedId={primary}
      onSelect={(id) => selectElement(id)}
      onMove={reorderList}
      onMoveStart={() => useProject.beginGesture()}
      onMoveEnd={() => useProject.endGesture()}
      empty={S.layers.empty}
      itemClassName={(el) =>
        cn(selected.includes(el.id) && el.id !== primary && 'border-accent/60 bg-accent-soft/50')
      }
      renderItem={(el) => (
        <LayerRow
          el={el}
          selected={selected.includes(el.id)}
          primary={el.id === primary}
          multi={multi}
        />
      )}
      className="max-h-[22rem] overflow-y-auto pr-1"
    />
  );
}

const ACTION_ICONS: Partial<Record<AlignAction, ReactNode>> = {
  'align-left': <AlignStartVertical />,
  'align-center-x': <AlignCenterVertical />,
  'align-right': <AlignEndVertical />,
  'align-top': <AlignStartHorizontal />,
  'align-center-y': <AlignCenterHorizontal />,
  'align-bottom': <AlignEndHorizontal />,
  'distribute-x': <AlignHorizontalDistributeCenter />,
  'distribute-y': <AlignVerticalDistributeCenter />,
};

function AlignPanel() {
  const project = useProject((s) => s.data);
  const { selectedIds, primary, reference } = useUi(
    useShallow((s) => ({ selectedIds: s.selected, primary: s.primary, reference: s.alignRef })),
  );
  const selected = project.elements.filter((el) => selectedIds.includes(el.id));
  const key = project.elements.find((el) => el.id === primary) ?? null;
  const locked = selected.filter((el) => el.locked).length;
  const movable = selected.filter((el) => !el.locked && isLayoutElement(el)).length;
  const count = !selected.length
    ? S.align.countNone
    : locked
      ? S.align.countMovable(selected.length, movable)
      : S.align.count(selected.length);
  const canSelectAll = project.elements.some(
    (el) => el.visible && !el.locked && isLayoutElement(el),
  );
  const enabled = (a: AlignAction) => alignEnabled(project, { selected, key }, reference, a);
  const mirror = project.symmetry.mirror;
  const help =
    selected.length > 1
      ? S.align.helpKey(key?.name ?? '—')
      : mirror
        ? S.align.helpMirror
        : S.align.helpDefault;
  const button = (a: AlignAction, withIcon: boolean) => {
    const blocked = mirror && (a === 'symmetry-sector' || a === 'symmetry-angle-space');
    return (
      <Button
        key={a}
        size="sm"
        variant="secondary"
        icon={withIcon ? ACTION_ICONS[a] : undefined}
        disabled={!enabled(a)}
        title={blocked ? S.align.mirrorDisabled : S.align.actions[a].label}
        onClick={() => runAlignment(a)}
        data-align={a}
        className="justify-start"
      >
        {S.align.actions[a].short}
      </Button>
    );
  };
  return (
    <Section
      title={S.align.title}
      persistKey="magic-circle:align"
      actions={
        <span
          className="text-xs text-muted tabular-nums"
          aria-live="polite"
          data-testid="align-count"
        >
          {count}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            onClick={selectAll}
            disabled={!canSelectAll}
            title={S.align.selectAllHint}
          >
            {S.align.selectAll}
          </Button>
          <Button size="sm" onClick={clearSelection} disabled={!selected.length}>
            {S.align.clear}
          </Button>
        </div>
        <Field label={S.align.reference}>
          <Select<AlignReference>
            value={reference}
            onValueChange={(v) => useUi.setState({ alignRef: v })}
            options={(['canvas', 'selection', 'key'] as const).map((v) => ({
              value: v,
              label: S.align.ref[v],
            }))}
          />
        </Field>
        {/* biome-ignore lint/a11y/useSemanticElements: 一組對齊按鈕，不是表單分組 */}
        <div role="group" aria-label={S.align.boundsGroup} className="grid grid-cols-3 gap-1.5">
          {BOUNDS_ACTIONS.map((a) => button(a, true))}
        </div>
        <div>
          <p className="m-0 mb-1.5 text-xs font-medium text-muted">{S.align.distributeTitle}</p>
          {/* biome-ignore lint/a11y/useSemanticElements: 一組分佈按鈕，不是表單分組 */}
          <div
            role="group"
            aria-label={S.align.distributeGroup}
            className="grid grid-cols-2 gap-1.5"
          >
            {DISTRIBUTE_ACTIONS.map((a) => button(a, true))}
          </div>
        </div>
        <div>
          <p className="m-0 mb-1.5 text-xs font-medium text-muted">{S.align.symmetryTitle}</p>
          {/* biome-ignore lint/a11y/useSemanticElements: 一組對稱尺對齊按鈕，不是表單分組 */}
          <div role="group" aria-label={S.align.symmetryGroup} className="grid grid-cols-3 gap-1.5">
            {SYMMETRY_ACTIONS.map((a) => button(a, false))}
          </div>
        </div>
        <p className="m-0 text-xs text-muted" data-testid="align-help">
          {help}
        </p>
      </div>
    </Section>
  );
}

export function LayersPanel() {
  const hasSelection = useUi((s) => s.selected.length > 0);
  const primary = useUi((s) => s.primary);
  return (
    <>
      <Section
        title={S.layers.heading}
        description={S.layers.sub}
        fixed
        actions={
          <div className="flex items-center gap-1">
            <IconButton
              size="sm"
              variant="ghost"
              label={S.layers.duplicate}
              icon={<CopyPlus />}
              onClick={duplicateSelected}
              disabled={!hasSelection}
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={S.layers.remove}
              icon={<Trash2 />}
              onClick={deleteSelected}
              disabled={!hasSelection}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <LayerList />
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" icon={<ArrowUp />} onClick={() => moveLayer(1)} disabled={!primary}>
              {S.layers.moveUp}
            </Button>
            <Button
              size="sm"
              icon={<ArrowDown />}
              onClick={() => moveLayer(-1)}
              disabled={!primary}
            >
              {S.layers.moveDown}
            </Button>
          </div>
          <p className="m-0 text-xs text-muted">{S.layers.moveHint}</p>
        </div>
      </Section>
      <AlignPanel />
    </>
  );
}
