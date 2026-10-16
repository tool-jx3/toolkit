/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 檔案庫 › 連線總表（F094；原作的 renderRelTableSide、renderRelTableTab、relTableCtx）：目前分頁的個別關係
 * （不含群體關係）。左欄：只看哪一種、排序、條數、批次（勾選、改成某種關係、刪除）、新增關係；右欄：每條一列
 * （來源｜關係名稱〔可以直接換〕｜目標，有備註時第二行），點列＝編輯那條關係。檢視層級：最少＝縮圖與箭頭、
 * 一般＝加名字與關係名稱、詳細＝再加備註。刪除模式：點列即刪（墓碑）。
 */
import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { Button, Checkbox, Field, Segmented, Select, useToast } from '@/ui';
import { displayName, sheetCtx } from '../engine/geom';
import {
  DEFAULT_REL_QUERY,
  type RelSortKey,
  type RelTableQuery,
  relTableRows,
} from '../logic/relTable';
import { typeLabel } from '../model/factory';
import type { Rel, Sheet } from '../model/types';
import { changeRelType } from '../state/actions';
import { addRelation, deleteRels, retagRels } from '../state/libActions';
import { setUi, usePrefs, useProject, useUi } from '../state/store';
import { S } from '../strings';
import { useHref, useSheet } from './hooks';
import type { LibAction } from './LabelLibrary';
import { kickSim } from './sim';
import { CharThumb, TypeSample } from './thumbs';

const T = S.relTable;

export const TABLE_ACTIONS: readonly LibAction[] = [
  { key: 'del', icon: <Trash2 />, tip: T.act.del, tone: 'danger' },
];

/** 連線總表的狀態（記憶體；原作的 relTableCtx） */
interface TableState {
  q: Omit<RelTableQuery, 'query'>;
  checked: number[];
  adding: boolean;
  msg: string | null;
  retagTo: number;
  form: { from: number; to: number; both: boolean; type: number };
}
const useTable = create<TableState>(() => ({
  q: { type: DEFAULT_REL_QUERY.type, sortKey: 'from', sortDir: 1 },
  checked: [],
  adding: false,
  msg: null,
  retagTo: 0,
  form: { from: 0, to: 0, both: false, type: 0 },
}));
const setTable = (patch: Partial<TableState>) => useTable.setState(patch);

/** 目前列出的關係（篩選、搜尋、排序） */
function useRows(query: string): { sheet: Sheet; rows: Rel[] } {
  const sheet = useSheet();
  const q = useTable((s) => s.q);
  const rows = useMemo(() => relTableRows(sheet, { ...q, query }), [sheet, q, query]);
  return { sheet, rows };
}

export function RelTableSide({ query }: { query: string }) {
  const sheet = useSheet();
  const mode = useUi((u) => u.libMode);
  const toast = useToast();
  const st = useTable();
  const { rows } = useRows(query);
  const types = sheet.types;
  const alive = new Set(sheet.rels.map((r) => r.id));
  const checked = st.checked.filter((id) => alive.has(id));
  const listed = rows.map((r) => r.id);
  const allOn = listed.length > 0 && listed.every((id) => checked.includes(id));
  const retagTo = types.some((t) => t.id === st.retagTo) ? st.retagTo : (types[0]?.id ?? 0);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (msgTimer.current) clearTimeout(msgTimer.current);
    },
    [],
  );
  const sortBtn = (k: RelSortKey, label: string) => {
    const on = st.q.sortKey === k;
    return (
      <Button
        key={k}
        size="sm"
        variant={on ? 'primary' : 'secondary'}
        onClick={() =>
          setTable({
            q: { ...st.q, sortKey: k, sortDir: on ? (st.q.sortDir === 1 ? -1 : 1) : 1 },
          })
        }
        data-testid={`reltable-sort-${k}`}
      >
        {label}
        {on ? (st.q.sortDir === 1 ? ' ▲' : ' ▼') : ''}
      </Button>
    );
  };
  /* 新增的表單：預設來源＝第一位、目標＝第一位不是來源的 */
  const chars = sheet.chars;
  const fFrom = chars.some((c) => c.id === st.form.from) ? st.form.from : (chars[0]?.id ?? 0);
  const firstOther = chars.find((c) => c.id !== fFrom)?.id ?? fFrom;
  const fTo = chars.some((c) => c.id === st.form.to) ? st.form.to : firstOther;
  const fType = types.some((t) => t.id === st.form.type) ? st.form.type : (types[0]?.id ?? 0);
  const charOpts = chars.map((c) => ({ value: String(c.id), label: displayName(c) }));
  const typeOpts = types.map((t) => ({ value: String(t.id), label: typeLabel(t, types) }));
  return (
    <div className="flex flex-col gap-2" data-testid="reltable-side">
      <p className="text-xs text-muted" data-testid="lib-hint">
        {mode === 'del' ? T.hintDel : T.hint}
      </p>
      <Field label={T.filter}>
        <Select
          size="sm"
          value={String(types.some((t) => t.id === st.q.type) ? st.q.type : 0)}
          onValueChange={(v) => setTable({ q: { ...st.q, type: Number(v) } })}
          options={[{ value: '0', label: T.all }, ...typeOpts]}
          aria-label={T.filter}
          data-testid="reltable-filter"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-muted">{T.sort}</span>
        {sortBtn('from', T.from)}
        {sortBtn('to', T.to)}
        {sortBtn('type', T.type)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm tabular-nums" data-testid="reltable-count">
          {T.count(rows.length)}
        </span>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => setTable({ adding: !st.adding })}
          data-testid="reltable-add-toggle"
        >
          {st.adding ? T.addClose : T.addToggle}
        </Button>
      </div>
      {st.adding ? (
        <div
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-2"
          data-testid="reltable-add"
        >
          <span className="text-xs font-semibold text-muted">{T.addLabel}</span>
          {chars.length < 2 ? (
            <p className="text-xs text-muted">{T.noOthers}</p>
          ) : !types.length ? (
            <p className="text-xs text-muted">{T.needType}</p>
          ) : (
            <>
              <Field label={T.from}>
                <Select
                  size="sm"
                  value={String(fFrom)}
                  onValueChange={(v) => setTable({ form: { ...st.form, from: Number(v) } })}
                  options={charOpts}
                  aria-label={T.from}
                  data-testid="reltable-add-from"
                />
              </Field>
              <Field label={T.dir}>
                <Segmented
                  size="sm"
                  value={st.form.both ? 'both' : 'one'}
                  onValueChange={(v) => setTable({ form: { ...st.form, both: v === 'both' } })}
                  options={[
                    { value: 'one', label: T.dirOne },
                    { value: 'both', label: T.dirBoth },
                  ]}
                />
              </Field>
              <Field label={T.to}>
                <Select
                  size="sm"
                  value={String(fTo)}
                  onValueChange={(v) => setTable({ form: { ...st.form, to: Number(v) } })}
                  options={charOpts}
                  aria-label={T.to}
                  data-testid="reltable-add-to"
                />
              </Field>
              <Field label={T.type}>
                <Select
                  size="sm"
                  value={String(fType)}
                  onValueChange={(v) => setTable({ form: { ...st.form, type: Number(v) } })}
                  options={typeOpts}
                  aria-label={T.type}
                  data-testid="reltable-add-type"
                />
              </Field>
              <Button
                size="sm"
                variant="primary"
                className="self-start"
                onClick={() => {
                  const r = addRelation(fFrom, fTo, fType, st.form.both);
                  if (r === 'dup') {
                    toast({ title: T.dup, tone: 'warning' });
                    return;
                  }
                  /* 成功：來源、方向、關係保留；目標回到第一位不是來源的角色 */
                  setTable({ form: { from: fFrom, to: 0, both: st.form.both, type: fType } });
                  kickSim(0.7);
                }}
                data-testid="reltable-add-go"
              >
                {T.addBtn}
              </Button>
            </>
          )}
        </div>
      ) : null}
      {checked.length || listed.length ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2">
          <Checkbox
            checked={allOn}
            onCheckedChange={(v) =>
              setTable({
                checked: v
                  ? [...new Set([...checked, ...listed])]
                  : checked.filter((id) => !listed.includes(id)),
              })
            }
            label={T.checked(checked.length)}
            data-testid="reltable-check-all"
          />
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted">{T.retagRow}</span>
            <Select
              size="sm"
              className="min-w-0 flex-1"
              value={retagTo ? String(retagTo) : ''}
              onValueChange={(v) => setTable({ retagTo: Number(v) })}
              options={typeOpts}
              aria-label={T.retagRow}
              data-testid="reltable-retag-type"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              disabled={!checked.length || !retagTo}
              onClick={() => {
                const r = retagRels(checked, retagTo);
                if (r.skipped) {
                  setTable({ msg: T.retagSkip(r.applied, r.skipped) });
                  if (msgTimer.current) clearTimeout(msgTimer.current);
                  msgTimer.current = setTimeout(() => setTable({ msg: null }), 6000);
                }
              }}
              data-testid="reltable-retag"
            >
              {T.retag}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 />}
              disabled={!checked.length}
              onClick={() => {
                deleteRels(checked);
                setTable({ checked: [] });
              }}
              data-testid="reltable-del-checked"
            >
              {T.delChecked}
            </Button>
          </div>
          {st.msg ? (
            <p className="text-xs text-warning" role="status" data-testid="reltable-msg">
              ⚠ {st.msg}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Name({ c, size }: { c: Sheet['chars'][number] | undefined; size: number }) {
  const sheet = useSheet();
  const labels = useProject((s) => s.data.labels);
  const frames = useProject((s) => s.data.frames);
  const ctx = useMemo(() => sheetCtx(sheet, labels, { frames }), [sheet, labels, frames]);
  const href = useHref(sheet);
  const level = usePrefs((p) => p.data.libLevel);
  if (!c) return <span className="text-muted">?</span>;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <CharThumb ctx={ctx} c={c} href={href} size={size} />
      {level === 'min' ? (
        <span className="sr-only">{displayName(c)}</span>
      ) : (
        <span className="min-w-0 truncate text-sm">{displayName(c)}</span>
      )}
    </span>
  );
}

const THUMB = { sm: 22, md: 28, lg: 36 } as const;

export function RelTableList({ query }: { query: string }) {
  const toast = useToast();
  const { sheet, rows } = useRows(query);
  const mode = useUi((u) => u.libMode);
  const level = usePrefs((p) => p.data.libLevel);
  const size = THUMB[usePrefs((p) => p.data.libSize)];
  const checked = useTable((s) => s.checked);
  const ctx = useMemo(() => sheetCtx(sheet), [sheet]);
  const byId = new Map(sheet.chars.map((c) => [c.id, c]));
  const types = new Map(sheet.types.map((t) => [t.id, t]));
  /* 刪除模式：記下進模式時的列，刪掉的留墓碑 */
  const frozen = useRef<{ sig: string; rows: { id: number; text: string }[] } | null>(null);
  const [, force] = useState(0);
  const label = (r: Rel) => {
    const t = types.get(r.type);
    return t ? typeLabel(t, sheet.types) : '';
  };
  const nameOf = (id: number) => {
    const c = byId.get(id);
    return c ? displayName(c) : '?';
  };
  const text = (r: Rel) => `${nameOf(r.from)} → ${label(r)} → ${nameOf(r.to)}`;
  if (mode !== 'del') frozen.current = null;
  let list: { id: number; text: string; r: Rel | undefined }[] = rows.map((r) => ({
    id: r.id,
    text: text(r),
    r,
  }));
  if (mode === 'del') {
    const sig = `${query}|${JSON.stringify(useTable.getState().q)}`;
    if (frozen.current?.sig !== sig)
      frozen.current = { sig, rows: list.map((x) => ({ id: x.id, text: x.text })) };
    const live = new Map(rows.map((r) => [r.id, r]));
    list = frozen.current.rows.map((x) => ({ ...x, r: live.get(x.id) }));
  }
  if (!list.length) return <p className="text-sm text-muted">{T.empty}</p>;
  return (
    <ul
      className={
        level === 'min'
          ? 'flex flex-wrap gap-1.5'
          : 'grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-1.5'
      }
      aria-label={T.listLabel}
      data-testid="reltable-list"
    >
      {list.map(({ id, text: ghostText, r }) => {
        if (!r)
          return (
            <li
              key={id}
              className="flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border px-2 py-1 text-sm opacity-40"
              aria-hidden
              data-testid="reltable-ghost"
            >
              <span className="min-w-0 flex-1 truncate line-through">{ghostText}</span>
              <span className="shrink-0 text-xs">{S.charLib.ghost}</span>
            </li>
          );
        const t = types.get(r.type);
        const self = r.from === r.to;
        const on = checked.includes(r.id);
        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: 鍵盤用列裡的按鈕（名字）操作
          <li
            key={r.id}
            className="flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-md border border-border bg-surface-2 px-2 py-1 hover:border-accent"
            title={[T.rowTip, r.note].filter(Boolean).join('\n')}
            onClick={(e) => {
              if ((e.target as Element).closest('[data-no-row]')) return;
              if (useUi.getState().libMode === 'del') {
                deleteRels([r.id]);
                force((n) => n + 1);
                return;
              }
              setUi({ panel: { kind: 'rel', id: r.id }, focus: { kind: 'edge', id: r.id } });
            }}
            data-testid="reltable-row"
            data-rel-id={r.id}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span data-no-row className="flex items-center">
                <Checkbox
                  checked={on}
                  onCheckedChange={(v) =>
                    setTable({
                      checked: v ? [...checked, r.id] : checked.filter((x) => x !== r.id),
                    })
                  }
                  aria-label={text(r)}
                />
              </span>
              <Name c={byId.get(r.from)} size={size} />
              <span className="flex min-w-0 flex-1 items-center justify-center gap-1">
                {t ? (
                  <TypeSample ctx={ctx} t={t} width={level === 'min' ? 28 : 36} height={14} />
                ) : null}
                {level !== 'min' && t ? (
                  <span data-no-row className="min-w-0">
                    <Select
                      size="sm"
                      className="max-w-32"
                      value={String(r.type)}
                      onValueChange={(v) => {
                        if (!changeRelType(r.id, Number(v)))
                          toast({ title: T.dup, tone: 'warning' });
                      }}
                      options={sheet.types.map((x) => ({
                        value: String(x.id),
                        label: typeLabel(x, sheet.types),
                      }))}
                      aria-label={T.type}
                      data-testid="reltable-row-type"
                    />
                  </span>
                ) : null}
                <span className="shrink-0 text-xs text-muted">
                  {self ? '↻' : r.both ? '⇄' : '→'}
                </span>
              </span>
              {self ? (
                <span className="text-sm text-muted">{S.char.self}</span>
              ) : (
                <Name c={byId.get(r.to)} size={size} />
              )}
            </div>
            {level === 'detail' && r.note ? (
              <p className="truncate pl-6 text-xs text-muted">{r.note}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** 換了分頁：勾選清掉 */
export function resetRelTable(): void {
  setTable({ checked: [], msg: null });
}
