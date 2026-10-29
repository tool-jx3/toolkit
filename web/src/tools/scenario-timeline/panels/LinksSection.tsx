/**
 * 「事件」分頁的關聯線（規格 F93）：選取的事件連出、連進的線（種類、說明、GM 專用、對調方向、刪除），
 * 以及「加上關聯線」（找事件）。PL 檢視只列 PL 看得到的線（停用），不能新增。
 */
import { ArrowLeftRight, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { historyGesture } from '@/core/storage';
import { Field, IconButton, Section, Select, TextInput } from '@/ui';
import { LINK_KINDS, type LinkKind } from '../model/links';
import { readTime } from '../model/time';
import type { VisibleDoc } from '../model/visible';
import { addLink, deleteLink, docNow, select, updateLink, useDoc, useUi } from '../store';
import { S } from '../strings';

const g = historyGesture(useDoc);
const MAX_RESULTS = 8;

export function LinksSection({ id, vdoc, pl }: { id: string; vdoc: VisibleDoc; pl: boolean }) {
  const allLinks = useDoc((s) => s.data.links);
  /* PL 檢視：只列 PL 看得到的線（GM 專用、另一端看不到的不列） */
  const links = (pl ? vdoc.links : allLinks).filter((k) => k.from === id || k.to === id);
  const titleOf = useMemo(() => {
    const m = new Map(vdoc.events.map((e) => [e.id, e.title.trim() || S.untitled]));
    return (x: string) => m.get(x) ?? S.untitled;
  }, [vdoc.events]);
  const focusLink = useUi((s) => s.focusLink);
  const listRef = useRef<HTMLUListElement>(null);
  const [hot, setHot] = useState<string | null>(null);
  useEffect(() => {
    if (!focusLink.id) return;
    setHot(focusLink.id);
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-link-row="${CSS.escape(focusLink.id)}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
    const t = window.setTimeout(() => setHot(null), 2400);
    return () => window.clearTimeout(t);
  }, [focusLink]);

  return (
    <Section title={S.linksTitle} fixed description={S.linksHint}>
      {links.length ? (
        <ul
          ref={listRef}
          className="m-0 flex list-none flex-col gap-2 p-0"
          aria-label={S.linksTitle}
        >
          {links.map((k) => {
            const out = k.from === id;
            const other = out ? k.to : k.from;
            return (
              <li
                key={k.id}
                data-link-row={k.id}
                className={`flex flex-col gap-1.5 rounded-md border p-2 ${hot === k.id ? 'border-accent ring-2 ring-focus' : 'border-border'}`}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-fg">
                  {out ? <span className="text-muted">{S.linkThis}</span> : null}
                  {!out ? (
                    <button
                      type="button"
                      className="min-w-0 truncate rounded-sm font-semibold text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                      onClick={() => select(other)}
                    >
                      「{titleOf(other)}」
                    </button>
                  ) : null}
                  <Select<LinkKind>
                    size="sm"
                    aria-label={S.linkKind}
                    value={k.kind}
                    disabled={pl}
                    className="w-24"
                    data-field="link-kind"
                    onValueChange={(v) =>
                      updateLink(k.id, (x) => {
                        x.kind = v;
                      })
                    }
                    options={LINK_KINDS.map((x) => ({ value: x, label: S.linkKinds[x] }))}
                  />
                  {out ? (
                    <button
                      type="button"
                      className="min-w-0 truncate rounded-sm font-semibold text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                      onClick={() => select(other)}
                    >
                      「{titleOf(other)}」
                    </button>
                  ) : (
                    <span className="text-muted">{S.linkThis}</span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={S.linkSwap}
                      icon={<ArrowLeftRight />}
                      disabled={pl}
                      onClick={() =>
                        updateLink(k.id, (x) => {
                          const f = x.from;
                          x.from = x.to;
                          x.to = f;
                        })
                      }
                    />
                    {pl ? null : (
                      <IconButton
                        size="sm"
                        variant="secondary"
                        label={S.linkGm}
                        icon={<span className="text-[11px] font-bold">GM</span>}
                        pressed={k.gm}
                        onClick={() =>
                          updateLink(k.id, (x) => {
                            x.gm = !x.gm;
                          })
                        }
                      />
                    )}
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={S.linkDelete}
                      icon={<Trash2 />}
                      disabled={pl}
                      onClick={() => deleteLink(k.id)}
                    />
                  </span>
                </div>
                <TextInput
                  value={k.note}
                  aria-label={S.linkNote}
                  placeholder={S.linkNoteHint}
                  maxLength={200}
                  disabled={pl}
                  data-field="link-note"
                  onFocus={g.begin}
                  onBlur={g.commit}
                  onChange={(e) =>
                    updateLink(
                      k.id,
                      (x) => {
                        x.note = e.target.value;
                      },
                      false,
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 text-sm text-muted">{S.linksEmpty}</p>
      )}
      {pl ? null : <LinkPicker from={id} vdoc={vdoc} />}
    </Section>
  );
}

/** 加上關聯線：打字找事件，點一下連過去（導致） */
function LinkPicker({ from, vdoc }: { from: string; vdoc: VisibleDoc }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const t = q.trim().normalize('NFKC').toLowerCase();
    if (!t) return [];
    const doc = docNow();
    return vdoc.events
      .filter(
        (e) =>
          e.id !== from &&
          (e.title.trim() || S.untitled).normalize('NFKC').toLowerCase().includes(t),
      )
      .map((e) => ({ e, v: readTime(doc.mode, e.start, doc)?.v ?? 0 }))
      .sort((a, b) => a.v - b.v)
      .slice(0, MAX_RESULTS)
      .map((x) => x.e);
  }, [q, vdoc.events, from]);
  return (
    <div className="flex flex-col gap-1.5">
      <Field label={S.linkAdd} hint={S.linkAddHint}>
        <TextInput
          value={q}
          type="search"
          data-field="link-search"
          placeholder={S.linkSearch}
          onChange={(e) => setQ(e.target.value)}
        />
      </Field>
      {q.trim() ? (
        results.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={S.linkResults}>
            {results.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  data-link-pick={e.id}
                  className="w-full truncate rounded-md border border-border px-2 py-1 text-left text-sm text-fg hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  onClick={() => {
                    if (addLink(from, e.id)) setQ('');
                  }}
                >
                  → {e.title.trim() || S.untitled}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-xs text-muted">{S.linkNoResult}</p>
        )
      ) : null}
    </div>
  );
}
