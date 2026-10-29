/**
 * NPC 名字產生器：選地區、年代、性別與數量 → 一批不重複的名字。兩種資料：依真實人數加權的名單（core/names；
 * 日本、台灣、美國），與弄墨 Inknomu 的考據語料（core/names/corpus；8 個地區，附涵義，平均抽）。
 * 點名字複製、全部複製、鎖定的名字再產生時留著；給種子時結果固定。
 * 寬畫面：左邊條件、右邊名字；窄畫面：名字在上、條件在下。規格：docs/refactor/specs/npc-names.md。
 */
import {
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Redo2,
  RotateCw,
  Shuffle,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NAME_COUNT_MAX, type NamePart, regionInfo } from '@/core/names';
import {
  CORPUS_COUNTRY_LABELS,
  CORPUS_GENDER_LABELS,
  CORPUS_RANK_LABELS,
  CORPUS_REGIONS,
  CORPUS_RULE_LABELS,
  type CorpusCountry,
  type CorpusData,
  type CorpusGenderChoice,
  type CorpusRank,
  type CorpusRegion,
  corpusPack,
  corpusRegionInfo,
  corpusRuleNotice,
  INKNOMU_SOURCE,
  type InknomuPackInfo,
  type InknomuSourceGroup,
  loadCorpus,
  loadCorpusSources,
  loadedCorpus,
  sourceSegments,
} from '@/core/names/corpus';
import { historyGesture, useUndoRedo } from '@/core/storage';
import {
  Button,
  Checkbox,
  Field,
  IconButton,
  MenuButton,
  Notice,
  Section,
  Segmented,
  Select,
  type SelectGroup,
  type Shortcut,
  Slider,
  TextInput,
  Toggle,
  ToolShell,
  UsageSection,
  useToast,
  withShortcut,
} from '@/ui';
import {
  copyAll,
  copyOne,
  exportCsv,
  exportTxt,
  generate,
  setConditions,
  setCopyNotifier,
  toggleLock,
  useStatus,
} from './actions';
import { History } from './History';
import {
  countMeanings,
  currentEra,
  type EraOption,
  effectiveConditions,
  eraOptions,
  fromCurrentSource,
  historyLabel,
  isCorpusName,
  type NpcName,
  PART_LABELS,
  partOptions,
  sanitizeState,
  TOOL_ID,
} from './logic';
import { NameCard } from './NameCard';
import { SearchPanel } from './Search';
import { useNames } from './store';
import { S } from './strings';

const LINK = 'text-accent underline';

function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ul>
        {S.usage.steps.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-2 font-semibold">{S.usage.notesTitle}</p>
      <ul>
        {S.usage.notes.slice(0, -1).map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li data-testid="usage-corpus-note">
          {S.usage.corpusNote.prefix}
          <a className={LINK} href={INKNOMU_SOURCE.url} target="_blank" rel="noopener noreferrer">
            {INKNOMU_SOURCE.name}
          </a>
          （
          <a
            className={LINK}
            href={INKNOMU_SOURCE.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {INKNOMU_SOURCE.license}
          </a>
          ）{S.usage.corpusNote.suffix}
        </li>
        {S.usage.notes.slice(-1).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

/** 條件區塊（窄畫面的「改條件」捲到這裡） */
const CONDITIONS_ID = 'npc-names-conditions';

function toConditions() {
  const el = document.getElementById(CONDITIONS_ID);
  if (!el) return;
  el.scrollIntoView({ block: 'start' });
  el.querySelector<HTMLElement>('[role=radio][aria-checked=true]')?.focus({ preventScroll: true });
}

/** 數量的滑桿：拖曳中的變更（每一格都換一批）放開時記成一步復原 */
const countGesture = historyGesture(useNames);

const REGION_OPTIONS = CORPUS_REGIONS.map((r) => ({ value: r.id, label: r.label }));
/** 地區排成 4 欄 2 列（390 px 寬也放得下、不必橫向捲動） */
const REGION_COLUMNS = 4;
const genderOptions = (neutral: boolean) =>
  (neutral
    ? (['male', 'female', 'neutral', 'any'] as const)
    : (['male', 'female', 'any'] as const)
  ).map((g) => ({ value: g, label: CORPUS_GENDER_LABELS[g] }));
const RANK_OPTIONS = (['all', 'noble', 'common'] as const).map((v) => ({
  value: v,
  label: CORPUS_RANK_LABELS[v],
}));
const COUNTRY_OPTIONS = (['all', 'se', 'no', 'dk', 'fi'] as const).map((v) => ({
  value: v,
  label: CORPUS_COUNTRY_LABELS[v],
}));

/** 年代選單：依人數的名單與考據語料分兩組（每個選項的第二行是說明） */
function eraGroups(options: readonly EraOption[]): SelectGroup[] {
  const item = (o: EraOption) => ({ value: o.id, label: o.label, description: o.hint });
  const count = options.filter((o) => o.source.kind === 'count');
  const corpus = options.filter((o) => o.source.kind === 'corpus');
  return [
    ...(count.length ? [{ label: S.conditions.countGroup, options: count.map(item) }] : []),
    ...(corpus.length ? [{ label: S.conditions.corpusGroup, options: corpus.map(item) }] : []),
  ];
}

/** 一個包的資料（說明、規則）；這個地區的語料還沒載入時先載入 */
function useCorpusPack(region: CorpusRegion, id: string) {
  const [, setTick] = useState(0);
  const data = loadedCorpus(region);
  useEffect(() => {
    if (loadedCorpus(region)) return;
    let live = true;
    loadCorpus(region).then(
      () => live && setTick((n) => n + 1),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [region]);
  return data ? (corpusPack(data, id) ?? null) : null;
}

/** 這個地區頁面的資料來源（第一次打開「關於這份語料」時才載入；讀不到就不顯示） */
function useCorpusSources(region: CorpusRegion) {
  const [sources, setSources] = useState<{
    region: CorpusRegion;
    groups: readonly InknomuSourceGroup[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    loadCorpusSources(region).then(
      (groups) => live && setSources({ region, groups }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [region]);
  return sources?.region === region ? sources.groups : null;
}

/** 資料來源：照原站分組（各組標筆數），連結另開分頁 */
function CorpusSources({ region }: { region: CorpusRegion }) {
  const groups = useCorpusSources(region);
  if (!groups?.length) return null;
  return (
    <div data-testid="corpus-sources">
      <p className="m-0 text-xs font-semibold text-muted">{S.about.sources}</p>
      {groups.map((g) => (
        <div key={g.group} className="mt-1" data-testid="corpus-source-group">
          <p className="m-0 text-xs font-medium text-fg">
            {S.about.sourceGroup(g.group, g.items.length)}
          </p>
          <ul className="m-0 list-disc pl-5 text-xs">
            {g.items.map((item) => (
              <li key={item.text} className="break-words">
                {sourceSegments(item).map((seg, i) =>
                  seg.url ? (
                    <a
                      // biome-ignore lint/suspicious/noArrayIndexKey: 一筆裡的片段不會重排
                      key={i}
                      className={LINK}
                      href={seg.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {seg.text}
                    </a>
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 一筆裡的片段不會重排
                    <span key={i}>{seg.text}</span>
                  ),
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** 「關於這份語料」：包的說明、來源與考據、命名規則（照原文），與出處 */
function AboutCorpus({ pack }: { pack: InknomuPackInfo }) {
  const data = useCorpusPack(pack.region, pack.id);
  const region = corpusRegionInfo(pack.region);
  const rules = Object.entries(data?.rules ?? {}).filter(([, r]) => r.note);
  return (
    <Section
      title={S.about.title}
      description={pack.label}
      persistKey={`${TOOL_ID}:about`}
      defaultOpen={false}
    >
      <div data-testid="corpus-about" className="flex flex-col gap-2 text-sm leading-relaxed">
        {data ? (
          <>
            <div>
              <p className="m-0 text-xs font-semibold text-muted">{S.about.note}</p>
              <p className="m-0 break-words">{data.note}</p>
            </div>
            <div>
              <p className="m-0 text-xs font-semibold text-muted">{S.about.corpusNote}</p>
              <p className="m-0 break-words">{data.corpus_note}</p>
            </div>
            {rules.length ? (
              <div>
                <p className="m-0 text-xs font-semibold text-muted">{S.about.rules}</p>
                <ul className="m-0 list-disc pl-5">
                  {rules.map(([key, rule]) => {
                    const notice = corpusRuleNotice(data, key);
                    return (
                      <li key={key} className="break-words">
                        <span className="font-medium">{CORPUS_RULE_LABELS[key] ?? key}：</span>
                        {rule.note}
                        {notice ? <span className="text-muted">（{notice}）</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="m-0 text-muted">{S.list.generating}</p>
        )}
        <CorpusSources region={pack.region} />
        <p className="m-0 text-xs text-muted" data-testid="corpus-credit">
          {S.about.creditPrefix}
          <a className={LINK} href={region.url} target="_blank" rel="noopener noreferrer">
            {INKNOMU_SOURCE.name}
          </a>
          （
          <a
            className={LINK}
            href={INKNOMU_SOURCE.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {INKNOMU_SOURCE.license}
          </a>
          ）{S.about.creditSuffix}
        </p>
      </div>
    </Section>
  );
}

/** 複製的通知（成功：短暫的「已複製」；失敗：說明怎麼自己複製） */
function useCopyNotice() {
  const toast = useToast();
  const ref = useRef(toast);
  ref.current = toast;
  useEffect(
    () =>
      setCopyNotifier((ok, title) =>
        ref.current(
          ok
            ? { title, tone: 'success', replace: true, duration: 2000 }
            : {
                title: S.toast.copyFailed,
                description: S.toast.copyFailedHint,
                tone: 'danger',
                replace: true,
              },
        ),
      ),
    [],
  );
}

function Settings() {
  const raw = useNames((s) => s.data);
  const state = useMemo(() => sanitizeState(raw), [raw]);
  const update = useNames((s) => s.update);
  const era = currentEra(state);
  const options = eraOptions(state.region);
  const pack = era.source.kind === 'corpus' ? era.source.pack : null;
  const middleInitial = era.source.kind === 'count' && regionInfo(era.source.region).middleInitial;
  const cond = effectiveConditions(state);
  const parts = partOptions(state);

  return (
    <>
      <div id={CONDITIONS_ID} className="scroll-mt-3">
        <Section title={S.conditions.title} fixed>
          <Field label={S.conditions.region}>
            <Segmented<CorpusRegion>
              value={state.region}
              onValueChange={(v) =>
                setConditions((d) => {
                  d.region = v;
                })
              }
              options={REGION_OPTIONS}
              columns={REGION_COLUMNS}
            />
          </Field>
          <Field label={corpusRegionInfo(state.region).eraLabel} hint={era.hint}>
            <Select
              value={era.id}
              onValueChange={(v) =>
                setConditions((d) => {
                  d.eras[d.region] = v;
                })
              }
              options={eraGroups(options)}
            />
          </Field>
          <Field label={S.conditions.gender}>
            <Segmented<CorpusGenderChoice>
              value={cond.gender}
              onValueChange={(v) =>
                setConditions((d) => {
                  d.gender = v;
                })
              }
              options={genderOptions(!!pack?.neutral)}
              fullWidth
            />
          </Field>
          <Field label={S.conditions.rank} hint={S.conditions.rankHint} hidden={!pack?.rank}>
            <Segmented<CorpusRank>
              value={state.rank}
              onValueChange={(v) =>
                setConditions((d) => {
                  d.rank = v;
                })
              }
              options={RANK_OPTIONS}
              fullWidth
            />
          </Field>
          <Field
            label={S.conditions.country}
            hint={S.conditions.countryHint}
            hidden={!pack?.countries}
          >
            <Segmented<CorpusCountry>
              value={state.country}
              onValueChange={(v) =>
                setConditions((d) => {
                  d.country = v;
                })
              }
              options={COUNTRY_OPTIONS}
              fullWidth
            />
          </Field>
          <Field label={S.conditions.part} hint={S.conditions.partHint} hidden={!parts.length}>
            <Segmented<NamePart>
              value={cond.part}
              onValueChange={(v) =>
                setConditions((d) => {
                  d.part = v;
                })
              }
              options={(parts.length ? parts : (['full'] as NamePart[])).map((v) => ({
                value: v,
                label: PART_LABELS[v],
              }))}
              fullWidth
            />
          </Field>
          <Field label={S.conditions.count}>
            <Slider
              value={state.count}
              onChange={countGesture.live((v: number) => {
                void setConditions((d) => {
                  d.count = v;
                });
              })}
              onCommit={countGesture.commit}
              min={1}
              max={NAME_COUNT_MAX}
              step={1}
              unit={S.conditions.countUnit}
            />
          </Field>
          <Field
            label={S.conditions.middle}
            hint={S.conditions.middleHint}
            layout="inline"
            hidden={!middleInitial}
          >
            <Toggle
              checked={state.middleInitial}
              onCheckedChange={(v) =>
                setConditions((d) => {
                  d.middleInitial = v;
                })
              }
            />
          </Field>
        </Section>
      </div>

      {pack ? <AboutCorpus pack={pack} /> : null}

      <Section title={S.display.title} persistKey={`${TOOL_ID}:display`}>
        <Field label={S.display.readings} hint={S.display.readingsHint}>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {(['hiragana', 'katakana', 'romaji', 'original'] as const).map((k) => (
              <Checkbox
                key={k}
                label={S.display[k]}
                checked={state.show[k]}
                onCheckedChange={(v) =>
                  update((d) => {
                    d.show[k] = v;
                  })
                }
              />
            ))}
          </div>
        </Field>
        <Field label={S.display.meaning} hint={S.display.meaningHint} layout="inline">
          <Toggle
            checked={state.show.meaning}
            onCheckedChange={(v) =>
              update((d) => {
                d.show.meaning = v;
              })
            }
          />
        </Field>
        <Field label={S.display.copyReading} hint={S.display.copyReadingHint} layout="inline">
          <Toggle
            checked={state.copyReading}
            onCheckedChange={(v) =>
              update((d) => {
                d.copyReading = v;
              })
            }
          />
        </Field>
      </Section>

      <Section title={S.seed.title} persistKey={`${TOOL_ID}:seed`} defaultOpen={false}>
        <Field label={S.seed.label} hint={S.seed.hint}>
          <TextInput
            value={state.seed}
            placeholder={S.seed.placeholder}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) =>
              update((d) => {
                d.seed = e.target.value;
              })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') void generate();
            }}
          />
        </Field>
        {state.lastSeed ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span data-testid="last-seed">{S.seed.last(state.lastSeed)}</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={state.seed === state.lastSeed}
              onClick={() =>
                update((d) => {
                  d.seed = d.lastSeed;
                })
              }
            >
              {S.seed.use}
            </Button>
          </div>
        ) : null}
      </Section>
    </>
  );
}

/**
 * 依人數的名單的名字要查涵義時（F57）：「顯示涵義」開著、這一批裡有那個地區的人數名單名字時，載入那個地區的考據語料
 * （和選語料的包時是同一個檔，只載一次）。載入中或讀不到時名字照常顯示、只是沒有涵義（不另外提示）。
 * 回傳查已經載入的語料的函式（載入完成時重新繪製）。
 */
function useCountMeaningCorpus(
  names: readonly NpcName[],
  enabled: boolean,
): (region: CorpusRegion) => CorpusData | null {
  const [, setTick] = useState(0);
  const regions = enabled
    ? [...new Set(names.filter((n) => !isCorpusName(n)).map((n) => n.region))].sort().join(',')
    : '';
  useEffect(() => {
    if (!regions) return;
    let live = true;
    /* 已經載入的也重畫一次：繪製之後、這裡執行之前，可能剛被別的地方（查名字）載入完 */
    for (const region of regions.split(',') as CorpusRegion[]) {
      loadCorpus(region).then(
        () => live && setTick((n) => n + 1),
        () => {},
      );
    }
    return () => {
      live = false;
    };
  }, [regions]);
  return loadedCorpus;
}

function NameList() {
  const raw = useNames((s) => s.data);
  const state = useMemo(() => sanitizeState(raw), [raw]);
  const status = useStatus();
  useCopyNotice();
  const locked = new Set(state.locked);
  const corpusOf = useCountMeaningCorpus(state.names, state.show.meaning);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        data-testid="names-toolbar"
        className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 bg-bg px-1 py-1"
      >
        <Button
          variant="primary"
          size="lg"
          icon={<Shuffle />}
          loading={status.loading}
          onClick={() => void generate()}
          title={withShortcut(S.keys.generate, 'g')}
        >
          {S.list.generate}
        </Button>
        <Button
          icon={<Copy />}
          onClick={() => void copyAll()}
          disabled={!state.names.length}
          title={withShortcut(S.keys.copyAll, 'c')}
        >
          {S.list.copyAll}
        </Button>
        <MenuButton
          label={S.list.export}
          icon={<Download />}
          disabled={!state.names.length}
          items={[
            {
              label: S.list.exportTxt,
              description: S.list.exportTxtHint,
              icon: <FileText />,
              onSelect: exportTxt,
            },
            {
              label: S.list.exportCsv,
              description: S.list.exportCsvHint,
              icon: <FileSpreadsheet />,
              onSelect: () => void exportCsv(),
            },
          ]}
        />
        <span className="ml-auto text-sm text-muted" data-testid="names-summary" aria-live="polite">
          {status.loading
            ? S.list.generating
            : state.names.length
              ? S.list.summary(state.names.length, state.locked.length)
              : ''}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted lg:hidden">
        <span data-testid="conditions-summary">
          {S.list.conditions}：
          {historyLabel({
            region: state.region,
            era: currentEra(state).id,
            ...effectiveConditions(state),
          })}
          ・{S.history.count(state.count)}
        </span>
        <Button size="sm" variant="ghost" onClick={toConditions}>
          {S.list.toConditions}
        </Button>
      </div>
      {status.failed ? (
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
      ) : null}
      {status.exhausted ? <Notice tone="warning">{S.list.exhausted}</Notice> : null}
      {state.names.length ? (
        <ul
          aria-label={S.list.aria}
          className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 2xl:grid-cols-3"
        >
          {state.names.map((n) => (
            <NameCard
              key={n.text}
              name={n}
              locked={locked.has(n.text)}
              show={state.show}
              countMeaning={state.show.meaning ? countMeanings(n, corpusOf(n.region)) : null}
              onCopy={(text) => void copyOne(text)}
              onToggleLock={toggleLock}
            />
          ))}
        </ul>
      ) : status.loading ? null : (
        <p className="m-0 text-muted">{S.list.empty}</p>
      )}
      <History />
      <SearchPanel />
    </div>
  );
}

export function App() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useNames);

  /* 開頁時還沒有這個地區與年代的名字（第一次開、或上次切換時資料讀不到、重新整理之後）就產生一批 */
  useEffect(() => {
    const state = sanitizeState(useNames.getState().data);
    if (!state.names.some((n) => fromCurrentSource(n, state))) void generate();
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'g', label: S.keys.generate, group: S.keys.group, handler: () => void generate() },
      { keys: 'c', label: S.keys.copyAll, group: S.keys.group, handler: () => void copyAll() },
      { keys: 'mod+z', label: S.keys.undo, group: S.keys.edit, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.keys.redo, group: S.keys.edit, handler: redo },
    ],
    [undo, redo],
  );

  const headerActions = (
    <>
      <IconButton
        label={withShortcut(S.keys.undo, 'mod+z')}
        icon={<Undo2 />}
        onClick={undo}
        disabled={!canUndo}
      />
      <IconButton
        label={withShortcut(S.keys.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        onClick={redo}
        disabled={!canRedo}
      />
    </>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={headerActions}
      settings={
        <>
          <UsageSection persistKey={`${TOOL_ID}:usage`}>
            <Usage />
          </UsageSection>
          <Settings />
        </>
      }
      preview={<NameList />}
    />
  );
}
