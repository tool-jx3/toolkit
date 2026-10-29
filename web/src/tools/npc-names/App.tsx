/**
 * NPC 名字產生器：選地區、年代、性別與數量 → 一批依人數加權、不重複的名字（core/names）。
 * 點名字複製、全部複製、鎖定的名字再產生時留著；給種子時結果固定。
 * 寬畫面：左邊條件、右邊名字；窄畫面：名字在上、條件在下。規格：docs/refactor/specs/npc-names.md。
 */
import { Copy, Download, FileSpreadsheet, FileText, Redo2, Shuffle, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import {
  NAME_COUNT_MAX,
  NAME_GENDER_LABELS,
  NAME_REGIONS,
  type NameGenderChoice,
  type NameRegion,
  regionInfo,
} from '@/core/names';
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
import { historyLabel, sanitizeState, TOOL_ID } from './logic';
import { NameCard } from './NameCard';
import { useNames } from './store';
import { S } from './strings';

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
        {S.usage.notes.map((line) => (
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

const REGION_OPTIONS = NAME_REGIONS.map((r) => ({ value: r.id, label: r.label }));
const GENDER_OPTIONS = (['male', 'female', 'any'] as const).map((g) => ({
  value: g,
  label: NAME_GENDER_LABELS[g],
}));

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
  const info = regionInfo(state.region);
  const era = info.eras.find((e) => e.id === state.eras[state.region]) ?? info.eras[0];

  return (
    <>
      <div id={CONDITIONS_ID} className="scroll-mt-3">
        <Section title={S.conditions.title} fixed>
          <Field label={S.conditions.region}>
            <Segmented<NameRegion>
              value={state.region}
              onValueChange={(v) =>
                setConditions((d) => {
                  d.region = v;
                })
              }
              options={REGION_OPTIONS}
              fullWidth
            />
          </Field>
          <Field label={S.conditions.era} hint={era.hint}>
            <Segmented<string>
              value={era.id}
              onValueChange={(v) =>
                setConditions((d) => {
                  d.eras[d.region] = v;
                })
              }
              options={info.eras.map((e) => ({ value: e.id, label: e.label }))}
              fullWidth
            />
          </Field>
          <Field label={S.conditions.gender}>
            <Segmented<NameGenderChoice>
              value={state.gender}
              onValueChange={(v) =>
                setConditions((d) => {
                  d.gender = v;
                })
              }
              options={GENDER_OPTIONS}
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
            hidden={!info.middleInitial}
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

      <Section title={S.display.title} persistKey={`${TOOL_ID}:display`}>
        <Field label={S.display.readings} hint={S.display.jpOnly}>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {(['hiragana', 'katakana', 'romaji'] as const).map((k) => (
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

function NameList() {
  const raw = useNames((s) => s.data);
  const state = useMemo(() => sanitizeState(raw), [raw]);
  const status = useStatus();
  useCopyNotice();
  const locked = new Set(state.locked);

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
              onSelect: exportCsv,
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
            era: state.eras[state.region],
            gender: state.gender,
          })}
          ・{S.history.count(state.count)}
        </span>
        <Button size="sm" variant="ghost" onClick={toConditions}>
          {S.list.toConditions}
        </Button>
      </div>
      {status.failed ? <Notice tone="danger">{S.list.loadFailed}</Notice> : null}
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
              onCopy={(text) => void copyOne(text)}
              onToggleLock={toggleLock}
            />
          ))}
        </ul>
      ) : status.loading ? null : (
        <p className="m-0 text-muted">{S.list.empty}</p>
      )}
      <History />
    </div>
  );
}

export function App() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useNames);

  useEffect(() => {
    if (!sanitizeState(useNames.getState().data).names.length) void generate();
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
