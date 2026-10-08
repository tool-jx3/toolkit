/**
 * 首頁：工具依群組分段列出，可以搜尋；頁尾只放靈感來源（CLAUDE.md 第 5 條）。
 * 工具清單從 registry 產生（entries.ts），上線一個工具就自動多一張卡片。
 */
import { ExternalLink, Search } from 'lucide-react';
import { Fragment, useDeferredValue, useMemo, useState } from 'react';
import { cn, TextInput, ThemeToggle } from '@/ui';
import {
  type EntrySection,
  type HomeEntry,
  homeEntries,
  inspirations,
  matchEntry,
  sections,
} from './entries';
import { toolIcon } from './icons';
import { S } from './strings';

const sectionId = (s: EntrySection) => `group-${s.group ?? 'external'}`;

export function App() {
  const entries = useMemo(() => homeEntries(import.meta.env.DEV), []);
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim());
  const shown = useMemo(() => entries.filter((e) => matchEntry(e, q)), [entries, q]);
  const groups = useMemo(() => sections(shown), [shown]);
  const credits = useMemo(() => inspirations(entries), [entries]);
  const total = entries.filter((e) => e.kind !== 'external').length;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-2xl font-bold text-fg">{S.heading}</h1>
            <p className="m-0 text-sm text-muted">{S.tagline(total)}</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
        <p className="m-0 text-sm text-muted">{S.intro}</p>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted"
            />
            <TextInput
              type="search"
              aria-label={S.search}
              placeholder={S.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <p role="status" className={cn('m-0 text-sm text-muted', !q && 'sr-only')}>
            {q ? (shown.length ? S.found(shown.length) : S.notFound(q)) : ''}
          </p>
          {groups.length > 1 ? (
            <nav aria-label={S.groupNav}>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {groups.map((s) => (
                  <li key={sectionId(s)}>
                    <a
                      href={`#${sectionId(s)}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-fg no-underline hover:border-accent"
                    >
                      {s.title}
                      <span className="text-muted">{s.entries.length}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>

        {groups.map((s) => (
          <section
            key={sectionId(s)}
            id={sectionId(s)}
            aria-labelledby={`${sectionId(s)}-title`}
            className="flex scroll-mt-4 flex-col gap-3"
          >
            <h2
              id={`${sectionId(s)}-title`}
              className="m-0 flex items-baseline gap-2 text-lg font-semibold text-fg"
            >
              {s.title}
              <span className="text-xs font-normal text-muted">{S.count(s.entries.length)}</span>
            </h2>
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {s.entries.map((e) => (
                <li key={`${e.kind}:${e.id}`}>
                  <ToolCard entry={e} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      <footer className="border-t border-border px-4 py-4 text-xs text-muted">
        <div className="mx-auto max-w-6xl">
          <h2 className="m-0 mb-1 text-xs font-semibold text-fg">{S.inspiration}</h2>
          <p className="m-0 leading-relaxed">
            {credits.map((c, i) => (
              <Fragment key={c.name}>
                {i ? <span aria-hidden> · </span> : null}
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noopener noreferrer">
                    {c.name}
                  </a>
                ) : (
                  <span>{c.name}</span>
                )}
              </Fragment>
            ))}
          </p>
        </div>
      </footer>
    </div>
  );
}

function ToolCard({ entry }: { entry: HomeEntry }) {
  const Icon = toolIcon(entry.id);
  const external = entry.kind === 'external';
  const badge = entry.kind === 'live' ? null : entry.kind;
  return (
    <a
      href={entry.href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex h-full gap-3 rounded-lg border border-border bg-surface p-3 text-fg no-underline transition-colors hover:border-accent hover:bg-surface-2"
    >
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-soft text-accent"
      >
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h3 className="m-0 text-base font-semibold">{entry.name}</h3>
          {badge ? (
            <span
              title={S.badgeTitle[badge]}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 text-[11px] leading-4',
                badge === 'legacy'
                  ? 'border-warning text-warning'
                  : badge === 'next'
                    ? 'border-accent text-accent'
                    : 'border-border-strong text-muted',
              )}
            >
              {S.badge[badge]}
              {external ? <ExternalLink aria-hidden className="size-3" /> : null}
            </span>
          ) : null}
        </span>
        <span className="text-sm text-muted">{entry.summary}</span>
        {external ? <span className="sr-only">{S.newTab}</span> : null}
      </span>
    </a>
  );
}
