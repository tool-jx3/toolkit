/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 群體關係（原作的 openGrelPopup、charGrelListHtml）與收合的聚合線（openColRelList）：
 * - 群體關係面板：關係名、「A → B」、成員人數與例外人數、「算到每位成員」、清空例外、刪除（D29）。
 * - 角色面板的「群體關係（依標籤）」段：自己是端點的與以成員身分繼承的；繼承的列可以排除／恢復適用。
 * - 聚合線面板：組成的關係（唯讀；要編輯先展開陣營，D30）。
 */
import { RotateCcw, Trash2, UserCheck, UserX } from 'lucide-react';
import { Button, Field, IconButton, Toggle } from '@/ui';
import { displayName, typeLineColor } from '../engine/geom';
import {
  colAggregate,
  grelAlive,
  grelEndIsLbl,
  grelEndMembers,
  grelEndName,
  grelEntriesFor,
  grelExcluded,
} from '../engine/labels';
import { typeLabel } from '../model/factory';
import type { Char } from '../model/types';
import {
  clearGrelExcept,
  deleteGrel,
  setCollapsed,
  toggleGrelExcept,
  updateGrel,
} from '../state/actions';
import { setUi } from '../state/store';
import { S } from '../strings';
import { useCtx, useSheet } from './hooks';

/** 群體關係的面板（點畫布上的群體關係線或膠囊） */
export function GrelPanel({ id }: { id: number }) {
  const sheet = useSheet();
  const ctx = useCtx(sheet);
  const g = sheet.grels.find((x) => x.id === id);
  if (!g || !grelAlive(ctx, g)) return <p className="text-sm text-muted">{S.grel.gone}</p>;
  const t = ctx.typeById.get(g.type);
  const col = t ? typeLineColor(ctx, t) : undefined;
  const nF = grelEndIsLbl(g.from) ? grelEndMembers(ctx, g.from).length : null;
  const nT = grelEndIsLbl(g.to) ? grelEndMembers(ctx, g.to).length : null;
  const exN = g.except.filter((x) => ctx.byId.has(x)).length;
  const counts = [nF, nT].filter((n): n is number => n !== null).map(S.grel.members);
  return (
    <div className="flex flex-col gap-3" data-testid="grel-panel">
      <div className="flex flex-col gap-1 rounded-md border border-border bg-surface-2 p-2 text-sm">
        <span className="font-semibold" style={{ color: col }}>
          {t ? typeLabel(t, sheet.types) : '?'}
        </span>
        <span className="font-semibold" data-testid="grel-ends">
          {grelEndName(ctx, g.from)} {g.both ? '⇄' : '→'} {grelEndName(ctx, g.to)}
        </span>
        <span className="text-xs text-muted" data-testid="grel-counts">
          {counts.join(' ⇄ ')}
          {exN ? `　${S.grel.excluded(exN)}` : ''}
        </span>
      </div>
      <Field label={S.grel.inherit} layout="inline" hint={S.grel.inheritHint}>
        <Toggle checked={g.inherit} onCheckedChange={(v) => updateGrel(g.id, { inherit: v })} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {exN ? (
          <Button
            size="sm"
            icon={<UserCheck />}
            onClick={() => clearGrelExcept(g.id)}
            data-testid="grel-clear-except"
          >
            {S.grel.clearExcept(exN)}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 />}
          onClick={() => deleteGrel(g.id)}
          data-testid="grel-delete"
        >
          {S.grel.remove}
        </Button>
      </div>
    </div>
  );
}

/** 角色面板：群體關係（依標籤） */
export function GrelsOf({ c }: { c: Char }) {
  const sheet = useSheet();
  const ctx = useCtx(sheet);
  const list = grelEntriesFor(ctx, c.id);
  if (!list.length) return null;
  return (
    <Field label={S.grel.section}>
      <ul className="flex flex-col gap-0.5" data-testid="char-grels">
        {list.map((en) => {
          const t = ctx.typeById.get(en.g.type);
          const col = t ? typeLineColor(ctx, t) : undefined;
          const arrow = en.g.both ? '⇄' : en.dirOut ? '→' : '←';
          const n = grelEndIsLbl(en.other)
            ? ` ×${grelEndMembers(ctx, en.other).filter((m) => !grelExcluded(en.g, m.id)).length}`
            : '';
          return (
            <li
              key={en.g.id}
              className={`flex min-w-0 items-center gap-2 text-sm ${en.ex ? 'line-through opacity-40' : en.own ? '' : 'opacity-75'}`}
              data-testid="char-grel-row"
              data-grel={en.g.id}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-surface-2"
                title={S.grel.open}
                onClick={() => setUi({ panel: { kind: 'grel', id: en.g.id } })}
              >
                <span className="w-4 shrink-0" style={{ color: col }}>
                  {arrow}
                </span>
                <span className="shrink-0 font-semibold" style={{ color: col }}>
                  {t ? typeLabel(t, sheet.types) : '?'}
                </span>
                <span className="min-w-0 truncate">
                  {grelEndName(ctx, en.other)}
                  {n}
                  {en.via ? (
                    <span className="ml-1 text-xs text-muted">{S.grel.via(en.via.text)}</span>
                  ) : null}
                </span>
              </button>
              {en.own ? null : (
                <IconButton
                  size="sm"
                  icon={en.ex ? <RotateCcw /> : <UserX />}
                  label={en.ex ? S.grel.restore : S.grel.exclude}
                  onClick={() => toggleGrelExcept(en.g.id, c.id)}
                  data-testid="char-grel-except"
                />
              )}
            </li>
          );
        })}
      </ul>
    </Field>
  );
}

/** 聚合線的面板：組成的關係（唯讀） */
export function ColEdgePanel({ colKey }: { colKey: string }) {
  const sheet = useSheet();
  const ctx = useCtx(sheet);
  const bk = colAggregate(ctx).get(colKey);
  const t = bk ? ctx.typeById.get(bk.type) : undefined;
  if (!bk || !t) return <p className="text-sm text-muted">{S.colEdge.gone}</p>;
  const col = typeLineColor(ctx, t);
  const name = (id: number) => {
    const c = ctx.byId.get(id);
    return c ? displayName(c) : '?';
  };
  const groups = [bk.a, bk.b].filter((e) => grelEndIsLbl(e)).map((e) => Number(e.slice(1)));
  return (
    <div className="flex flex-col gap-3" data-testid="coledge-panel">
      <p className="font-semibold" style={{ color: col }}>
        {S.colEdge.title(typeLabel(t, sheet.types), bk.rels.length)}
      </p>
      <p className="text-xs text-muted">{S.colEdge.hint}</p>
      <ul className="flex flex-col gap-1 text-sm" data-testid="coledge-rows">
        {bk.rels.map((r) => {
          const arrow = r.both ? '⇄' : '→';
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span>{name(r.from)}</span>
              <b style={{ color: col }}>
                {arrow} {typeLabel(t, sheet.types)} {arrow}
              </b>
              <span>{name(r.to)}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        {groups.map((id) => (
          <Button
            key={id}
            size="sm"
            onClick={() => {
              setCollapsed(id, false);
              setUi({ panel: null });
            }}
            data-testid="coledge-expand"
          >
            {S.colEdge.expand(ctx.lblById.get(id)?.text ?? '')}
          </Button>
        ))}
      </div>
    </div>
  );
}
