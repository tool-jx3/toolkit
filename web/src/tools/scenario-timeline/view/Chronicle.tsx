/**
 * 年表（規格 1.6、F90、F91）：依時間排的清單、依日子分段；點一筆選取（Ctrl／⌘＋點選加減、Shift＋點選連續的一段）、
 * 雙擊或 Enter 編輯；列印、複製成文字。照目前的 GM／PL 檢視；篩選中只列符合的（列印、複製也是）。
 * 每個事件下面列它的關聯線（F111，「列出關聯線」開關；列印、複製也照這個開關）。
 */
import { Copy, Printer } from 'lucide-react';
import { memo, useMemo } from 'react';
import { copyText } from '@/core/files';
import { PAPER_SIZES, printPages } from '@/core/paged';
import { Button, cn, Toggle } from '@/ui';
import {
  type ChronRow,
  chronicle,
  chronicleHtml,
  chroniclePrintCss,
  chronicleText,
  linkText,
} from '../model/chronicle';
import { filteredDoc, matchingIds } from '../model/filter';
import { GM_COLOR } from '../model/types';
import { notify } from '../notify';
import {
  editEvent,
  filterOf,
  type Prefs,
  prefsNow,
  select,
  selectMany,
  setPrefs,
  toggleSelected,
  usePrefs,
  useUi,
} from '../store';
import { S } from '../strings';
import { useFilterState } from './FilterBar';
import { visibleNow } from './shared';
import { GM_STRIPES, GmBadge } from './Timeline';

/** 年表檢視列出關聯線（沒選過＝列出） */
export const chronicleLinksOn = (p: Pick<Prefs, 'chronicleLinks'>) => p.chronicleLinks !== false;

/** 目前看到的年表（篩選中只有符合的） */
const chronicleNow = () => {
  const vdoc = visibleNow();
  const p = prefsNow();
  return chronicle(filteredDoc(vdoc, matchingIds(vdoc, filterOf(p))), S.untitled, S.toolName, {
    links: chronicleLinksOn(p),
  });
};

/** 點一筆：Ctrl／⌘＝加減、Shift＝從上次點的那筆到這筆（年表的順序，只算事件）、其他＝只選它 */
function clickRow(
  id: string,
  e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  order: string[],
) {
  if (e.ctrlKey || e.metaKey) {
    toggleSelected(id);
    return;
  }
  const anchor = useUi.getState().selectedId;
  if (e.shiftKey && anchor && anchor !== id) {
    const a = order.indexOf(anchor);
    const b = order.indexOf(id);
    if (a >= 0 && b >= 0) {
      selectMany(order.slice(Math.min(a, b), Math.max(a, b) + 1), anchor);
      return;
    }
  }
  select(id);
}

export async function copyChronicle(): Promise<void> {
  const text = chronicleText(chronicleNow(), prefsNow().viewMode);
  const ok = await copyText(text).catch(() => false);
  notify(ok ? { title: S.copied, tone: 'success' } : { title: S.copyFailed, tone: 'danger' });
}

export function printChronicle(): Promise<HTMLIFrameElement> {
  const ch = chronicleNow();
  const audience = prefsNow().viewMode;
  return printPages({
    title: ch.title,
    css: chroniclePrintCss(ch),
    pages: [chronicleHtml(ch, audience)],
    size: PAPER_SIZES.A4,
    pageMargin: '15mm',
  });
}

export function Chronicle() {
  const { vdoc, ids } = useFilterState();
  const pl = usePrefs((s) => s.data.viewMode) === 'pl';
  const linksOn = usePrefs((s) => chronicleLinksOn(s.data));
  const ch = useMemo(
    () => chronicle(filteredDoc(vdoc, ids), S.untitled, S.toolName, { links: linksOn }),
    [vdoc, ids, linksOn],
  );
  const selectedIds = useUi((s) => s.selectedIds);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  /* Shift＋點選用的順序（年表上由上而下的事件） */
  const order = useMemo(
    () => ch.sections.flatMap((s) => s.rows.filter((r) => r.kind === 'event').map((r) => r.id)),
    [ch],
  );
  return (
    <section
      aria-label={S.chronicle}
      data-testid="chronicle"
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:p-4 lg:max-h-[calc(100dvh-13rem)] lg:min-h-[28rem] lg:overflow-y-auto"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 text-lg font-bold break-words text-fg" data-testid="chronicle-title">
            {ch.title}
          </h2>
          {ch.range ? <p className="m-0 text-xs text-muted">{ch.range}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {vdoc.links.length ? (
            <Toggle
              label={S.chronLinks}
              checked={linksOn}
              onCheckedChange={(v) => setPrefs({ chronicleLinks: v })}
            />
          ) : null}
          <Button
            size="sm"
            icon={<Printer />}
            data-testid="print"
            onClick={() => void printChronicle()}
          >
            {S.print}
          </Button>
          <Button
            size="sm"
            icon={<Copy />}
            data-testid="copy-text"
            onClick={() => void copyChronicle()}
          >
            {S.copyText}
          </Button>
        </div>
      </header>
      {ch.sections.length === 0 ? (
        <p className="m-0 py-8 text-center text-sm text-muted">
          {ids && vdoc.events.length ? S.filterNone : pl ? S.emptyPl : S.chronicleEmpty}
        </p>
      ) : (
        ch.sections.map((s) => (
          <div key={s.key} className="flex flex-col gap-1" data-section={s.heading}>
            <h3 className="m-0 border-b border-border pb-1 text-sm font-bold text-fg">
              {s.heading}
            </h3>
            <ol className="m-0 flex list-none flex-col p-0">
              {s.rows.map((r) => (
                <Row
                  key={`${r.kind}${r.id}`}
                  r={r}
                  gm={!pl}
                  selected={selected.has(r.id)}
                  order={order}
                />
              ))}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}

const Row = memo(function Row({
  r,
  gm,
  selected,
  order,
}: {
  r: ChronRow;
  gm: boolean;
  selected: boolean;
  order: string[];
}) {
  const isEvent = r.kind === 'event';
  const cls = cn(
    'grid w-full grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 rounded-md border-l-[3px] border-transparent px-2 py-1.5 text-left sm:grid-cols-[7.5rem_minmax(0,1fr)]',
    isEvent &&
      'cursor-pointer hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
    selected && 'bg-accent-soft',
  );
  const style =
    gm && r.secret
      ? { borderLeftColor: GM_COLOR, backgroundImage: selected ? undefined : GM_STRIPES }
      : undefined;
  const body = (
    <>
      <span
        className="block pt-px text-xs font-medium break-words text-muted tabular-nums"
        data-chron-time
      >
        {r.time}
      </span>
      <span className="block min-w-0">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {r.kind === 'marker' ? (
            <span aria-hidden className="text-xs" style={{ color: r.color }}>
              ◆
            </span>
          ) : (
            <i
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ background: r.color }}
            />
          )}
          <span className="text-sm font-semibold break-words text-fg" data-chron-title>
            {r.title}
          </span>
          {r.laneName ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1 text-[11px] text-muted">
              <i
                aria-hidden
                className="inline-block size-1.5 rounded-full"
                style={{ background: r.laneColor }}
              />
              {r.laneName}
            </span>
          ) : null}
          {r.categoryName ? (
            <span className="rounded-sm border border-border px-1 text-[11px] text-muted">
              {r.categoryName}
            </span>
          ) : null}
          {r.background ? (
            <span className="rounded-sm border border-border px-1 text-[11px] text-muted">
              {S.bgTag}
            </span>
          ) : null}
          {r.kind === 'marker' ? (
            <span className="rounded-sm border border-border px-1 text-[11px] text-muted">
              {S.markerTag}
            </span>
          ) : null}
          {gm && r.gm ? <GmBadge /> : null}
        </span>
        {r.place || r.people.length ? (
          <span className="block text-xs text-muted">
            {[
              r.place ? `${S.place}：${r.place}` : '',
              r.people.length ? `${S.people}：${r.people.join('、')}` : '',
            ]
              .filter(Boolean)
              .join('／')}
          </span>
        ) : null}
        {r.description.trim() ? (
          <span className="block text-sm whitespace-pre-wrap break-words text-fg">
            {r.description.trim()}
          </span>
        ) : null}
        {r.links.length ? (
          <span className="mt-0.5 block text-xs text-muted" data-chron-links>
            {r.links.map((k, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 同樣兩端、同樣種類的線可能有兩條（方向相反），清單不會重排
                key={i}
                className={cn('block break-words', gm && k.secret && 'text-warning')}
                data-chron-link={k.kind}
                data-secret={(gm && k.secret) || undefined}
              >
                {linkText(k)}
                {gm && k.secret ? (
                  <>
                    {' '}
                    <GmBadge />
                  </>
                ) : null}
              </span>
            ))}
          </span>
        ) : null}
        {gm && r.gmNote.trim() ? (
          <span
            className="mt-0.5 block border-l-[3px] pl-2 text-xs whitespace-pre-wrap break-words text-warning"
            style={{ borderLeftColor: GM_COLOR }}
            data-chron-note
          >
            <span className="font-semibold">{S.gmNote}：</span>
            {r.gmNote.trim()}
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <li
      data-chron-row={r.id}
      data-kind={r.kind}
      data-selected={selected || undefined}
      data-secret={(gm && r.secret) || undefined}
    >
      {isEvent ? (
        <button
          type="button"
          aria-pressed={selected}
          className={cls}
          style={style}
          onClick={(e) => clickRow(r.id, e, order)}
          onDoubleClick={() => editEvent(r.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              editEvent(r.id);
            }
          }}
        >
          {body}
        </button>
      ) : (
        <div className={cls} style={style}>
          {body}
        </div>
      )}
    </li>
  );
});
