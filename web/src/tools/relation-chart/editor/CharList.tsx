/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 角色清單（原作的「角色列表」）：小頭像、重要度、名字、編輯鈕；點一列＝聚焦並把畫面移過去；
 * 拖曳換順序（未釘選的角色接手位置；觸控從列左邊的把手拖）；搜尋；角色 8 位以上而且有標籤時可以依標籤分組。
 */
import { Pencil, Plus, Search, Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import { IconButton, SortableList, TextInput } from '@/ui';
import { charLevel, displayName, type SheetCtx } from '../engine/geom';
import type { ImageHref } from '../engine/nodes';
import type { Char } from '../model/types';
import { addChar, reorderChar } from '../state/actions';
import {
  holdHistory,
  releaseHistory,
  setPrefs,
  setUi,
  usePrefs,
  useProject,
  useUi,
} from '../state/store';
import { S } from '../strings';
import { useCtx, useHref, useSheet } from './hooks';
import { CharThumb } from './thumbs';
import { centerOnChar } from './view';
import { DragHandle } from './widgets';

function pickChar(id: number): void {
  const u = useUi.getState();
  const same = u.focus?.kind === 'node' && u.focus.id === id;
  setUi({ focus: same ? null : { kind: 'node', id }, hover: null });
  if (!same) centerOnChar(id);
}

function Row({
  c,
  ctx,
  href,
  selected,
  handle,
}: {
  c: Char;
  ctx: SheetCtx;
  href: ImageHref;
  selected: boolean;
  /** 可以拖曳排序（分組時不行） */
  handle?: boolean;
}) {
  const lv = charLevel(c);
  return (
    <div
      className={`flex min-w-0 items-center gap-2 py-0.5 ${selected ? 'text-accent' : ''}`}
      data-testid="char-row"
      data-char-id={c.id}
    >
      {handle ? <DragHandle title={S.chars.dragTip} /> : null}
      <CharThumb ctx={ctx} c={c} href={href} size={26} />
      {lv ? (
        <span className="shrink-0 rounded-sm bg-surface-3 px-1 text-[10px] font-semibold tabular-nums text-muted">
          {S.chars.level(lv)}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-sm">{displayName(c)}</span>
      <IconButton
        size="sm"
        icon={<Pencil />}
        label={S.chars.editTip}
        onClick={(e) => {
          e.stopPropagation();
          setUi({ panel: { kind: 'char', id: c.id } });
        }}
        data-testid="char-edit"
      />
    </div>
  );
}

function SearchBox({ chars }: { chars: readonly Char[] }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return [];
    return chars.filter((c) => displayName(c).toLowerCase().includes(k)).slice(0, 8);
  }, [q, chars]);
  const go = (c: Char) => {
    setUi({ sel: [c.id], focus: { kind: 'node', id: c.id } });
    centerOnChar(c.id, 1.15);
    setQ('');
  };
  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted"
      />
      <TextInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={S.chars.search}
        aria-label={S.chars.searchLabel}
        className="h-8 pl-7 text-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) {
            e.preventDefault();
            go(hits[0]);
          } else if (e.key === 'Escape') setQ('');
        }}
        data-testid="char-search"
      />
      {q.trim() ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-md border border-border bg-surface p-1 shadow-2">
          {hits.length ? (
            hits.map((c) => (
              <button
                key={c.id}
                type="button"
                className="block w-full truncate rounded-sm px-2 py-1 text-left text-sm hover:bg-accent-soft"
                onClick={() => go(c)}
              >
                {displayName(c)}
              </button>
            ))
          ) : (
            <p className="px-2 py-1 text-sm text-muted">{S.chars.searchNone}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function CharList() {
  const sheet = useSheet();
  const ctx = useCtx(sheet);
  const href = useHref(sheet);
  const labels = useProject((s) => s.data.labels);
  const focus = useUi((u) => u.focus);
  const sel = useUi((u) => u.sel);
  const grouped = usePrefs((p) => p.data.groupByLabel);
  const chars = sheet.chars;
  const canGroup = chars.length >= 8 && chars.some((c) => c.labels.length);
  const showGroups = grouped && canGroup;
  const selSet = new Set(sel);
  const focusId = focus?.kind === 'node' ? String(focus.id) : null;

  const groups = useMemo(() => {
    if (!showGroups) return [];
    const out = labels
      .map((l) => ({
        key: String(l.id),
        name: l.text,
        items: chars.filter((c) => c.labels.includes(l.id)),
      }))
      .filter((g) => g.items.length);
    const none = chars.filter((c) => !c.labels.some((l) => labels.some((x) => x.id === l)));
    if (none.length) out.push({ key: 'none', name: S.chars.ungrouped, items: none });
    return out;
  }, [showGroups, labels, chars]);

  return (
    <div className="flex min-h-0 flex-col gap-2" data-testid="char-list">
      <div className="flex items-center gap-1">
        <h2 className="text-sm font-semibold">{S.chars.title}</h2>
        <span className="text-xs text-muted" data-testid="char-count">
          {S.chars.count(chars.length)}
        </span>
        <span className="ml-auto" />
        {canGroup ? (
          <IconButton
            size="sm"
            icon={<Tags />}
            label={S.chars.groupTip}
            pressed={grouped}
            onClick={() => setPrefs({ groupByLabel: !grouped })}
            data-testid="char-group"
          />
        ) : null}
        <IconButton
          size="sm"
          icon={<Plus />}
          label={S.chars.add}
          onClick={() => addChar()}
          data-testid="char-add"
        />
      </div>
      {chars.length ? <SearchBox chars={chars} /> : null}
      <div className="min-h-0 overflow-auto lg:flex-1">
        {showGroups ? (
          <div className="flex flex-col gap-1">
            {groups.map((g) => (
              <details key={g.key} open className="rounded-md border border-border">
                <summary className="cursor-pointer px-2 py-1 text-sm font-medium">
                  {g.name} <span className="text-xs text-muted">{g.items.length}</span>
                </summary>
                <ul className="px-1 pb-1">
                  {g.items.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`w-full rounded-sm px-1 text-left hover:bg-surface-2 ${focusId === String(c.id) ? 'bg-accent-soft' : ''}`}
                        onClick={() => pickChar(c.id)}
                      >
                        <Row c={c} ctx={ctx} href={href} selected={selSet.has(c.id)} />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        ) : (
          <SortableList
            aria-label={S.chars.listLabel}
            items={chars}
            getId={(c) => String(c.id)}
            mode="drop"
            selectedId={focusId}
            onSelect={(id) => pickChar(Number(id))}
            onMove={(from, to) => reorderChar(from, to)}
            onMoveStart={() => holdHistory('list')}
            onMoveEnd={() => releaseHistory('list')}
            renderItem={(c) => (
              <Row c={c} ctx={ctx} href={href} selected={selSet.has(c.id)} handle />
            )}
            empty={S.chars.empty}
          />
        )}
      </div>
    </div>
  );
}
