/**
 * 奇幻隨機產生器：選產生器（人物、冒險、地點、物品、寶藏、自訂）與條件 → 一批結果卡。
 * 參考 mshea/lazy_gm_tools 的 5e Artisanal Database 的 generators（程式 CC0）。規格：docs/refactor/specs/fantasy-gen.md。
 * 寬畫面：左邊產生器與條件、右邊結果；窄畫面：結果在上（按鈕列上有產生器的下拉選單）、條件在下。
 */
import {
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Redo2,
  RotateCw,
  Shuffle,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { historyGesture, resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  Button,
  cn,
  Field,
  IconButton,
  MenuButton,
  Notice,
  ProjectMenu,
  Section,
  Segmented,
  Select,
  type SelectGroup,
  type Shortcut,
  Slider,
  TextInput,
  ToolShell,
  UsageSection,
  useToast,
  withShortcut,
} from '@/ui';
import { About } from './About';
import {
  addCustom,
  copyAll,
  exportCsv,
  exportTxt,
  generate,
  setCopyNotifier,
  setCount,
  setGenerator,
  setOption,
  useStatus,
} from './actions';
import { CustomEditor } from './CustomEditor';
import {
  CATEGORIES,
  COUNT_MAX,
  CUSTOM_PREFIX,
  type GeneratorDef,
  isCustomId,
  optionValue,
} from './generators';
import { History } from './History';
import {
  allGenerators,
  CUSTOM_MAX,
  countOf,
  currentGenerator,
  DATA_VERSION,
  findGenerator,
  type GenState,
  optionsLabel,
  optionsOf,
  sanitizeState,
  TOOL_ID,
} from './logic';
import { ResultList } from './ResultList';
import { SavedList } from './SavedList';
import { useGen, useHistory } from './store';
import { S } from './strings';

const SETTINGS_ID = 'fantasy-gen-settings';
const countGesture = historyGesture(useGen);

function useGenState(): GenState {
  const raw = useGen((s) => s.data);
  return useMemo(() => sanitizeState(raw), [raw]);
}

function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ul>
        {S.usage.steps.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <ul>
        {S.usage.notes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

/** 產生器的選單（窄畫面的按鈕列；依分類分組） */
function generatorGroups(state: GenState): SelectGroup[] {
  const all = allGenerators(state);
  return CATEGORIES.flatMap((cat) => {
    const gens = all.filter((g) => g.category === cat);
    return gens.length
      ? [{ label: S.categories[cat], options: gens.map((g) => ({ value: g.id, label: g.label })) }]
      : [];
  });
}

/** 依分類排的產生器按鈕（寬畫面的設定欄） */
function GeneratorPicker({ state }: { state: GenState }) {
  const all = allGenerators(state);
  return (
    <Section title={S.settings.generator} fixed>
      <div data-testid="generator-picker" className="flex flex-col gap-2">
        {CATEGORIES.map((cat) => {
          const gens = all.filter((g) => g.category === cat);
          if (!gens.length && cat !== 'custom') return null;
          return (
            <div key={cat} className="flex flex-col gap-1">
              <p className="m-0 text-xs font-semibold text-muted">{S.categories[cat]}</p>
              <div className="flex flex-wrap gap-1">
                {gens.map((g) => (
                  <Button
                    key={g.id}
                    size="sm"
                    variant={g.id === state.gen ? 'primary' : 'secondary'}
                    aria-pressed={g.id === state.gen}
                    onClick={() => void setGenerator(g.id)}
                  >
                    {g.label}
                  </Button>
                ))}
                {cat === 'custom' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Plus />}
                    disabled={state.customs.length >= CUSTOM_MAX}
                    onClick={() => void addCustom()}
                  >
                    {S.custom.add}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Conditions({ state, def }: { state: GenState; def: GeneratorDef }) {
  const options = optionsOf(state, def.id);
  return (
    <div id={SETTINGS_ID} className="scroll-mt-3">
      <Section title={S.settings.options} description={def.label} fixed>
        {def.summary ? (
          <p data-testid="generator-summary" className="m-0 text-sm leading-relaxed text-muted">
            {def.summary}
          </p>
        ) : null}
        {def.options.map((o) => (
          <Field key={o.key} label={o.label}>
            {o.select || o.choices.length > 4 ? (
              <Select
                value={optionValue(def, options, o.key)}
                onValueChange={(v) => void setOption(def.id, o.key, v)}
                options={o.choices}
              />
            ) : (
              <Segmented
                value={optionValue(def, options, o.key)}
                onValueChange={(v) => void setOption(def.id, o.key, v)}
                options={o.choices}
                fullWidth
                columns={o.choices.length > 3 ? 2 : undefined}
              />
            )}
          </Field>
        ))}
        <Field label={S.settings.count}>
          <Slider
            value={countOf(state, def)}
            onChange={countGesture.live((v: number) => {
              void setCount(def.id, v);
            })}
            onCommit={countGesture.commit}
            min={1}
            max={COUNT_MAX}
            step={1}
            unit={S.settings.countUnit}
          />
        </Field>
      </Section>
    </div>
  );
}

function SeedSection({ state }: { state: GenState }) {
  const update = useGen((s) => s.update);
  return (
    <Section title={S.settings.seedTitle} persistKey={`${TOOL_ID}:seed`} defaultOpen={false}>
      <Field label={S.settings.seed} hint={S.settings.seedHint}>
        <TextInput
          value={state.seed}
          placeholder={S.settings.seedPlaceholder}
          spellCheck={false}
          autoComplete="off"
          maxLength={100}
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
          <span data-testid="last-seed">{S.settings.lastSeed(state.lastSeed)}</span>
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
            {S.settings.useSeed}
          </Button>
        </div>
      ) : null}
    </Section>
  );
}

function Settings() {
  const state = useGenState();
  const def = currentGenerator(state);
  const custom = isCustomId(def.id)
    ? state.customs.find((c) => `${CUSTOM_PREFIX}${c.id}` === def.id)
    : undefined;
  return (
    <>
      <GeneratorPicker state={state} />
      {custom ? <CustomEditor custom={custom} /> : null}
      <Conditions state={state} def={def} />
      <SeedSection state={state} />
      <About />
    </>
  );
}

/** 複製的通知（成功：短暫的通知；失敗：說明怎麼自己複製） */
function useCopyNotice() {
  const toast = useToast();
  const ref = useRef(toast);
  ref.current = toast;
  useEffect(
    () =>
      setCopyNotifier((ok, title) =>
        ref.current(
          ok
            ? { title, tone: 'success', replace: true, duration: 2500 }
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

function toSettings() {
  const el = document.getElementById(SETTINGS_ID);
  if (!el) return;
  el.scrollIntoView({ block: 'start' });
  el.querySelector<HTMLElement>('[role=radio][aria-checked=true], button, input')?.focus({
    preventScroll: true,
  });
}

function Results() {
  const state = useGenState();
  const status = useStatus();
  const def = currentGenerator(state);
  useCopyNotice();
  const locked = state.results.filter((r) => r.locked).length;
  const labelOf = (gen: string) =>
    findGenerator(state, gen)?.label ?? state.saved.find((s) => s.gen === gen)?.label ?? null;
  const detail = optionsLabel(def, optionsOf(state, def.id));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        data-testid="results-toolbar"
        className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 bg-bg px-1 py-1"
      >
        <div className="w-full lg:hidden">
          <Select
            aria-label={S.settings.generator}
            value={def.id}
            onValueChange={(v) => void setGenerator(v)}
            options={generatorGroups(state)}
          />
        </div>
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
          disabled={!state.results.length}
          title={withShortcut(S.keys.copyAll, 'c')}
        >
          {S.list.copyAll}
        </Button>
        <MenuButton
          label={S.list.export}
          icon={<Download />}
          disabled={!state.results.length}
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
              onSelect: exportCsv,
            },
          ]}
        />
        <span
          className="ml-auto text-sm text-muted"
          data-testid="results-summary"
          aria-live="polite"
        >
          {status.loading
            ? S.list.generating
            : state.results.length
              ? S.list.summary(state.results.length, locked)
              : ''}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted lg:hidden">
        <span data-testid="conditions-summary">
          {S.list.conditions}：
          {[def.label, detail, `${countOf(state, def)} ${S.settings.countUnit}`]
            .filter(Boolean)
            .join('・')}
        </span>
        <Button size="sm" variant="ghost" onClick={toSettings}>
          {S.list.toSettings}
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
      {status.issues.length ? (
        <Notice tone="warning">
          <ul className="m-0 pl-4" data-testid="batch-issues">
            {status.issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {state.results.length ? (
        <ResultList results={state.results} current={def} labelOf={labelOf} />
      ) : status.loading ? null : (
        <p className="m-0 text-muted">{S.list.empty}</p>
      )}
      <SavedList saved={state.saved} />
      <History />
    </div>
  );
}

export function App() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useGen);
  const savedAt = useSaveStatus(TOOL_ID);

  /* 第一次打開（還沒有結果）時產生一批 */
  useEffect(() => {
    if (!sanitizeState(useGen.getState().data).results.length) void generate();
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
      <ProjectMenu<unknown>
        toolId={TOOL_ID}
        version={DATA_VERSION}
        getData={() => sanitizeState(useGen.getState().data)}
        onLoad={(data) => {
          useGen.getState().replace(sanitizeState(data));
          return true;
        }}
        onReset={() => {
          resetToolStore(useGen, { clearHistory: false });
          useHistory.getState().patch({ history: [] });
          void generate();
        }}
        savedAt={savedAt}
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
        <div className={cn('flex flex-col gap-3')}>
          <UsageSection persistKey={`${TOOL_ID}:usage`}>
            <Usage />
          </UsageSection>
          <Settings />
        </div>
      }
      preview={<Results />}
    />
  );
}
