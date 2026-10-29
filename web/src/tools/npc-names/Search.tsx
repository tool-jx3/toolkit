/**
 * 查名字：在目前地區的考據語料（所有年代的包）裡找姓或名（原站組合模式的搜尋；收藏與合成不做）。
 * 按「搜尋」或 Enter 才查；篩選（年代、性別、階級、國家、類別）會讓結果變成 0 筆的選項停用；點一筆就複製。
 * 字與篩選不存檔、不列入復原（store.ts 的 useSearch）。
 */
import { RotateCw, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  CORPUS_COUNTRY_LABELS,
  CORPUS_GENDER_LABELS,
  CORPUS_RANK_LABELS,
  type CorpusCountry,
  type CorpusGenderChoice,
  type CorpusRank,
  type CorpusRegion,
  type CorpusSearchAxis,
  type CorpusSearchEntry,
  type CorpusSearchFilters,
  type CorpusSearchKind,
  corpusPackInfo,
  corpusPackLabel,
  corpusPacksOf,
  corpusRegionInfo,
  corpusSearchIndex,
  DEFAULT_SEARCH_FILTERS,
  filterSearchHits,
  isCorpusRegion,
  loadCorpus,
  loadedCorpus,
  searchCorpus,
  searchOptionEmpty,
} from '@/core/names/corpus';
import { Button, cn, Field, Notice, Section, Segmented, Select, TextInput } from '@/ui';
import { copySearchHit } from './actions';
import { corpusDetails, type ReadingShow, sanitizeState, searchReadings, TOOL_ID } from './logic';
import { SEARCH_PAGE, useNames, useSearch } from './store';
import { S } from './strings';

const setFilter = <K extends CorpusSearchAxis>(axis: K, value: CorpusSearchFilters[K]) =>
  useSearch.setState((s) => ({ filters: { ...s.filters, [axis]: value }, limit: SEARCH_PAGE }));

/** 這個地區用得到的篩選：年代（包不只一個時）、階級（有標記時）、國家（北歐） */
function regionAxes(region: CorpusRegion) {
  const packs = corpusPacksOf(region);
  return {
    packs,
    era: packs.length > 1,
    rank: packs.some((p) => p.rank),
    country: packs.some((p) => p.countries),
  };
}

/** 換了地區時，不適用的篩選當作不限 */
function effectiveFilters(region: CorpusRegion, f: CorpusSearchFilters): CorpusSearchFilters {
  const axes = regionAxes(region);
  return {
    ...f,
    era: axes.packs.some((p) => p.id === f.era) ? f.era : 'all',
    rank: axes.rank ? f.rank : 'all',
    country: axes.country ? f.country : 'all',
  };
}

/** 讀這個地區的語料（送出搜尋時才讀；讀不到時提示重新整理，同 F29） */
function useRegionCorpus(region: CorpusRegion, wanted: boolean) {
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!wanted || loadedCorpus(region)) return;
    let live = true;
    setState('loading');
    loadCorpus(region).then(
      () => {
        if (!live) return;
        setState('idle');
        setTick((n) => n + 1);
      },
      () => live && setState('failed'),
    );
    return () => {
      live = false;
    };
  }, [region, wanted]);
  return { data: loadedCorpus(region), state };
}

function metaOf(hit: CorpusSearchEntry): string {
  const kind = S.search.kinds[hit.kind];
  const genders =
    hit.kind === 'given' ? hit.genders.map((g) => CORPUS_GENDER_LABELS[g]).join('、') : '';
  const pack = corpusPackInfo(hit.pack);
  return [genders ? `${kind}（${genders}）` : kind, pack ? corpusPackLabel(pack) : '']
    .filter(Boolean)
    .join('・');
}

function Hit({
  hit,
  region,
  show,
}: {
  hit: CorpusSearchEntry;
  region: CorpusRegion;
  show: ReadingShow;
}) {
  const readings = searchReadings(hit, region, show);
  /* 說明行同名字卡（原站的排法）；「顯示涵義」關掉時不顯示 */
  const details = show.meaning
    ? corpusDetails({
        meanings: [`${S.search.kinds[hit.kind]}：${hit.meaning}`],
        notes: hit.notes,
        extras: hit.extras,
      })
    : [];
  return (
    <li
      data-testid="search-hit"
      className="flex min-w-0 flex-col rounded-md border border-border bg-surface-2 p-1"
    >
      <button
        type="button"
        onClick={() => void copySearchHit(hit, region)}
        aria-label={S.list.copy(hit.text)}
        title={S.list.copy(hit.text)}
        className="min-w-0 cursor-copy rounded-sm px-2 py-1 text-left hover:bg-surface-3 focus-visible:focus-ring"
      >
        <span
          data-testid="search-hit-text"
          className="block break-words text-lg font-medium text-fg"
        >
          {hit.text}
        </span>
        {readings.map((r) => (
          <span key={r} className="block break-words text-sm text-muted">
            {r}
          </span>
        ))}
      </button>
      <div className="flex flex-col gap-0.5 px-2 pb-1 text-xs leading-relaxed">
        {details.map((d) => (
          <p key={d.text} className={cn('m-0 break-words', d.muted ? 'text-muted' : 'text-fg')}>
            {d.text}
          </p>
        ))}
        <p className="m-0 text-muted" data-testid="search-hit-meta">
          {metaOf(hit)}
        </p>
      </div>
    </li>
  );
}

export function SearchPanel() {
  const raw = useNames((s) => s.data);
  const state = useMemo(() => sanitizeState(raw), [raw]);
  const region = isCorpusRegion(state.region) ? state.region : 'jp';
  const { draft, query, filters: stored, limit } = useSearch();
  const { data, state: load } = useRegionCorpus(region, !!query);
  const axes = regionAxes(region);
  const filters = effectiveFilters(region, stored);
  const hits = useMemo(
    () => (data && query ? searchCorpus(corpusSearchIndex(data), query) : null),
    [data, query],
  );
  const shown = hits ? filterSearchHits(hits, filters) : [];
  const active = (Object.keys(filters) as CorpusSearchAxis[]).some(
    (a) => filters[a] !== DEFAULT_SEARCH_FILTERS[a],
  );
  const empty = (axis: CorpusSearchAxis, value: string) =>
    !!hits && searchOptionEmpty(hits, filters, axis, value);
  const submit = () => {
    const q = useSearch.getState().draft.trim();
    useSearch.setState((s) => ({
      query: q,
      limit: SEARCH_PAGE,
      filters: q ? s.filters : DEFAULT_SEARCH_FILTERS,
    }));
  };
  const regionInfo = corpusRegionInfo(region);

  return (
    <Section
      title={S.search.title}
      description={S.search.description(regionInfo.label)}
      persistKey={`${TOOL_ID}:search`}
      defaultOpen={false}
    >
      <Field label={S.search.label} hint={S.search.hint}>
        <div className="flex min-w-0 gap-2">
          <TextInput
            type="search"
            value={draft}
            placeholder={S.search.placeholder}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => useSearch.setState({ draft: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
            }}
          />
          <Button icon={<SearchIcon />} onClick={submit}>
            {S.search.submit}
          </Button>
        </div>
      </Field>
      <div className="flex flex-col gap-2" data-testid="search-filters">
        {axes.era ? (
          <Field label={regionInfo.eraLabel}>
            <Select
              value={filters.era}
              onValueChange={(v) => setFilter('era', v)}
              options={[
                { value: 'all', label: S.search.any },
                ...axes.packs.map((p) => ({
                  value: p.id,
                  label: corpusPackLabel(p),
                  disabled: empty('era', p.id),
                })),
              ]}
            />
          </Field>
        ) : null}
        <Field label={S.conditions.gender}>
          <Segmented<CorpusGenderChoice>
            value={filters.gender}
            onValueChange={(v) => setFilter('gender', v)}
            options={(['any', 'male', 'female', 'neutral'] as const).map((g) => ({
              value: g,
              label: CORPUS_GENDER_LABELS[g],
              disabled: empty('gender', g),
            }))}
            fullWidth
          />
        </Field>
        {axes.rank ? (
          <Field label={S.conditions.rank}>
            <Segmented<CorpusRank>
              value={filters.rank}
              onValueChange={(v) => setFilter('rank', v)}
              options={(['all', 'noble', 'common'] as const).map((v) => ({
                value: v,
                label: CORPUS_RANK_LABELS[v],
                disabled: empty('rank', v),
              }))}
              fullWidth
            />
          </Field>
        ) : null}
        {axes.country ? (
          <Field label={S.conditions.country}>
            <Segmented<CorpusCountry>
              value={filters.country}
              onValueChange={(v) => setFilter('country', v)}
              options={(['all', 'se', 'no', 'dk', 'fi'] as const).map((v) => ({
                value: v,
                label: CORPUS_COUNTRY_LABELS[v],
                disabled: empty('country', v),
              }))}
              fullWidth
            />
          </Field>
        ) : null}
        <Field label={S.search.kind}>
          <Segmented<'all' | CorpusSearchKind>
            value={filters.kind}
            onValueChange={(v) => setFilter('kind', v)}
            options={(['all', 'family', 'given'] as const).map((v) => ({
              value: v,
              label: S.search.kinds[v],
              disabled: empty('kind', v),
            }))}
            fullWidth
          />
        </Field>
        {active ? (
          <div>
            <Button
              size="sm"
              variant="ghost"
              icon={<X />}
              onClick={() =>
                useSearch.setState({ filters: DEFAULT_SEARCH_FILTERS, limit: SEARCH_PAGE })
              }
            >
              {S.search.clear}
            </Button>
          </div>
        ) : null}
      </div>
      {load === 'failed' ? (
        <Notice
          tone="danger"
          action={
            <Button size="sm" icon={<RotateCw />} onClick={() => window.location.reload()}>
              {S.list.reload}
            </Button>
          }
        >
          {S.list.loadFailed}
        </Notice>
      ) : query && !hits ? (
        <p className="m-0 text-sm text-muted">{S.search.loading}</p>
      ) : null}
      {hits ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-sm" aria-live="polite">
            <span className="font-medium text-fg" data-testid="search-total">
              {S.search.total(shown.length)}
            </span>
            {axes.packs.length > 1 ? (
              <span className="text-xs text-muted" data-testid="search-per-era">
                {S.search.perEra}
              </span>
            ) : null}
          </p>
          {shown.length ? (
            <ul
              aria-label={S.search.aria}
              className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 2xl:grid-cols-3"
            >
              {shown.slice(0, limit).map((h) => (
                <Hit
                  key={`${h.pack}:${h.kind}:${h.text}`}
                  hit={h}
                  region={region}
                  show={state.show}
                />
              ))}
            </ul>
          ) : !hits.length ? (
            <p className="m-0 text-sm text-muted">{S.search.empty}</p>
          ) : null}
          {shown.length > limit ? (
            <div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => useSearch.setState((s) => ({ limit: s.limit + SEARCH_PAGE }))}
              >
                {S.search.more(shown.length - limit)}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}
