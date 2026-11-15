/**
 * 劇本清單：這個瀏覽器裡的劇本（自動存檔），找、打開、看文件、改名、複製一份、刪除、新的劇本。
 */
import { Copy, FileText, FolderOpen, Plus, Search, Trash2 } from 'lucide-react';
import { Button, cn, TextInput, useConfirm, useToast } from '@/ui';
import {
  deleteScenario,
  duplicateScenario,
  libraryFullMessage,
  libraryOf,
  openScenario,
  renameScenario,
  startNew,
} from '../actions';
import { getDeck } from '../data';
import { answerProgress, missionToneLabel } from '../model/document';
import { autoTitle, type Scenario, slotCard, titleOf, toneSlotName } from '../model/scenario';
import { usePlot, usePrefs } from '../store';
import { S } from '../strings';
import { textGesture } from './hooks';

const fmt = (ms: number) => {
  const d = new Date(ms);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${z(d.getMonth() + 1)}/${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
};

/** 搜尋用的文字：劇本名、自動的名字、舞台、氣氛卡、真相、結局 */
function haystack(sc: Scenario): string {
  const deck = getDeck(sc.deck);
  return [
    sc.title,
    autoTitle(deck, sc),
    ...['stage', 'tone', 'truth', 'ending'].map((k) => slotCard(deck, sc, k)?.title ?? ''),
  ].join(' ');
}

function Entry({ sc, current }: { sc: Scenario; current: boolean }) {
  const deck = getDeck(sc.deck);
  const confirm = useConfirm();
  const toast = useToast();
  const patch = usePrefs((s) => s.patch);
  const { answered, total } = answerProgress(sc);
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const chips: [string, string][] = (
    [
      [S.cats.stage, slotCard(deck, sc, 'stage')?.title],
      [toneSlotName(deck, sc), slotCard(deck, sc, 'tone')?.title],
      [S.cats.truth, slotCard(deck, sc, 'truth')?.title],
      [S.cats.ending, slotCard(deck, sc, 'ending')?.title],
    ] as [string, string | undefined][]
  ).filter((x): x is [string, string] => !!x[1]);
  const title = titleOf(deck, sc);
  return (
    <article
      data-testid="library-entry"
      data-id={sc.id}
      data-current={current ? 'true' : undefined}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border bg-surface p-3',
        current ? 'border-accent' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-fg">{deck.name}</span>
        {sc.madeBy ? <span>{S.doc.madeBy[sc.madeBy]}</span> : null}
        {current ? (
          <span className="rounded-sm bg-accent px-1.5 py-0.5 font-semibold text-accent-contrast">
            {S.library.editing}
          </span>
        ) : null}
        <span className="ml-auto tabular-nums">{fmt(sc.updated)}</span>
      </div>
      <TextInput
        aria-label={S.library.titleLabel}
        data-field="library-title"
        value={sc.title}
        maxLength={60}
        placeholder={autoTitle(deck, sc)}
        onFocus={textGesture.begin}
        onBlur={textGesture.commit}
        onChange={(e) => renameScenario(sc.id, e.target.value)}
      />
      <p className="m-0 text-xs text-muted">
        {[S.library.pcs(sc.pcCount), missionToneLabel(deck, sc)].filter(Boolean).join('・')}
      </p>
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {chips.map(([k, v]) => (
          <li key={k} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg">
            <span className="mr-1 text-muted">{k}</span>
            {v}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>{S.library.progress}</span>
        <span className="tabular-nums text-fg" data-testid="library-progress">
          {answered}／{total}
        </span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="primary"
          icon={<FolderOpen />}
          onClick={() => {
            openScenario(sc.id);
            patch({ view: 'make' });
            if (!current) toast({ title: S.library.opened(title), tone: 'success', replace: true });
          }}
        >
          {current ? S.library.openEditing : S.library.open}
        </Button>
        <Button
          size="sm"
          icon={<FileText />}
          disabled={sc.phase !== 'done'}
          onClick={() => {
            openScenario(sc.id, 'sheet');
            patch({ view: 'make' });
          }}
        >
          {S.library.sheet}
        </Button>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy />}
          onClick={() => {
            const copy = duplicateScenario(sc.id, `${title}${S.library.copySuffix}`);
            toast(
              copy
                ? { title: S.library.duplicated(title), tone: 'success', replace: true }
                : { title: libraryFullMessage(), tone: 'warning', replace: true },
            );
          }}
        >
          {S.library.duplicate}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 />}
          onClick={async () => {
            const ok = await confirm({
              title: S.library.deleteTitle(title),
              description: S.library.deleteDesc(current),
              confirmLabel: S.library.delete,
              danger: true,
            });
            if (!ok) return;
            deleteScenario(sc.id);
            toast({ title: S.library.deleted(title), tone: 'success', replace: true });
          }}
        >
          {S.library.delete}
        </Button>
      </div>
    </article>
  );
}

export function LibraryView() {
  const state = usePlot((s) => s.data);
  const q = usePrefs((s) => s.data.libraryQuery);
  const patch = usePrefs((s) => s.patch);
  const toast = useToast();
  const all = libraryOf(state);
  const query = q.trim();
  const list = query ? all.filter((sc) => haystack(sc).includes(query)) : all;
  return (
    <div className="flex flex-col gap-3" data-testid="library">
      <header className="flex flex-col gap-2">
        <h2 className="m-0 text-lg font-bold text-fg">{S.library.title}</h2>
        <p className="m-0 text-sm text-muted">{S.library.lead}</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
            <TextInput
              type="search"
              className="pl-8"
              aria-label={S.library.search}
              placeholder={S.library.search}
              value={q}
              onChange={(e) => patch({ libraryQuery: e.target.value })}
            />
          </div>
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => {
              if (!startNew()) {
                toast({ title: libraryFullMessage(), tone: 'warning', replace: true });
                return;
              }
              patch({ view: 'make' });
            }}
          >
            {S.library.newScenario}
          </Button>
        </div>
        <p className="m-0 text-sm text-muted" data-testid="library-count" aria-live="polite">
          {S.library.count(all.length, list.length, query)}
        </p>
      </header>
      {list.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((sc) => (
            <Entry key={sc.id} sc={sc} current={sc.id === state.current} />
          ))}
        </div>
      ) : (
        <p className="m-0 rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted">
          {all.length ? S.library.noHit : S.library.empty}
        </p>
      )}
    </div>
  );
}
