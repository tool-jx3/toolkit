/**
 * 劇本骨架抽卡：抽卡組出 TRPG 劇本的骨架（餘韻、導入、障礙、真相、結局、舞台、焦點、線索、NPC、
 * PC 的關係與秘密），回答卡上的問題、配置推理與場景、排成一份文件。
 * 參考 Xelltis エノキ「Kadan」現代・奇幻 體驗版（作者條款：只參考功能與做法，卡與文字全部本站自己寫）。
 * 規格：docs/refactor/specs/plot-deck.md。
 */
import { FilePlus2, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  Button,
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  useConfirm,
  useToast,
  withShortcut,
} from '@/ui';
import { StepNav, Stepper } from '@/ui/Stepper';
import {
  addLoadedScenario,
  beginScenario,
  currentNow,
  ensureCurrent,
  libraryFullMessage,
  libraryOf,
  resetCurrent,
  setDeck,
  setStep,
} from './actions';
import type { DeckId } from './data';
import { PROJECT_VERSION, scenarioFromProject, TOOL_ID } from './model/project';
import { hasAnyCard, type Scenario, STEPS } from './model/scenario';
import { usePlot, usePrefs, type View } from './store';
import { S } from './strings';
import { AnswersView } from './ui/Answers';
import { MissionToneDialog, SynopsisPanel } from './ui/Brief';
import { CardPicker, CardZoom } from './ui/CardFace';
import { CastView } from './ui/Cast';
import { CatalogView } from './ui/Catalog';
import { DeskView } from './ui/Desk';
import { useCurrent } from './ui/hooks';
import { LibraryView } from './ui/Library';
import { PlotView } from './ui/PlotView';
import { fileBase, SheetView } from './ui/Sheet';
import { CoreOffer, DeckSwitch, SetupDesk, StartScreen } from './ui/Start';

ensureCurrent();

function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ol>
        {S.usage.steps.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <ul>
        {S.usage.notes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

/** 做劇本的上方：卡組（換卡組＝新的劇本）與「新的劇本」 */
function TopBar({ sc }: { sc: Scenario }) {
  const confirm = useConfirm();
  const toast = useToast();
  const change = async (d: DeckId) => {
    if (d === sc.deck) return;
    if (hasAnyCard(sc) || sc.phase !== 'start') {
      const ok = await confirm({
        title: S.desk.newDeckTitle(S.decks[d]),
        description: S.desk.newDeckDesc,
        confirmLabel: S.desk.newDeckOk,
      });
      if (!ok) return;
    }
    setDeck(d);
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="top-bar">
      <span className="text-xs text-muted">{S.deckLabel}</span>
      <DeckSwitch value={sc.deck} onChange={(d) => void change(d)} />
      <span className="flex-1" />
      <Button
        size="sm"
        icon={<FilePlus2 />}
        onClick={() => {
          if (!beginScenario())
            toast({ title: libraryFullMessage(), tone: 'warning', replace: true });
        }}
      >
        {S.library.newScenario}
      </Button>
    </div>
  );
}

function Workflow({ sc }: { sc: Scenario }) {
  const index = Math.max(0, STEPS.indexOf(sc.step));
  const top = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  /* 換步驟時回到步驟列（已經看得到就不動） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在步驟換掉時
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
  }, [sc.step]);
  const steps = STEPS.map((k) => ({ label: S.steps[k].label, description: S.steps[k].desc }));
  const view =
    sc.step === 'cast' ? (
      <CastView sc={sc} />
    ) : sc.step === 'answers' ? (
      <AnswersView sc={sc} />
    ) : sc.step === 'plot' ? (
      <PlotView sc={sc} />
    ) : (
      <DeskView sc={sc} />
    );
  return (
    <div className="flex flex-col gap-3" ref={top}>
      <Stepper
        aria-label={S.stepsLabel}
        className="max-sm:hidden"
        steps={steps}
        value={index}
        onValueChange={(i) => setStep(STEPS[i])}
        completed={() => false}
      />
      <div className="flex flex-col gap-1 sm:hidden" data-testid="step-nav">
        <StepNav
          value={index}
          count={STEPS.length}
          onValueChange={(i) => setStep(STEPS[Math.min(STEPS.length - 1, Math.max(0, i))])}
        />
        <p className="m-0 text-center text-sm font-bold text-fg">{steps[index].label}</p>
      </div>
      {sc.step === 'sheet' ? (
        <SheetView sc={sc} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)]">
          <aside className="min-w-0 self-start lg:sticky-pane">
            <SynopsisPanel sc={sc} />
          </aside>
          <div className="min-w-0">{view}</div>
        </div>
      )}
    </div>
  );
}

function MakeView() {
  const sc = useCurrent();
  if (!sc) return null;
  if (sc.phase === 'start') return <StartScreen sc={sc} />;
  return (
    <div className="flex flex-col gap-3">
      <TopBar sc={sc} />
      {sc.phase === 'setup' ? (
        sc.setupStage === 'core' ? (
          <CoreOffer sc={sc} />
        ) : (
          <SetupDesk sc={sc} />
        )
      ) : (
        <Workflow sc={sc} />
      )}
    </div>
  );
}

function Main() {
  const view = usePrefs((s) => s.data.view);
  const patch = usePrefs((s) => s.patch);
  const count = usePlot((s) => libraryOf(s.data).length);
  return (
    <>
      <Tabs<View>
        aria-label={S.tabsLabel}
        value={view}
        onValueChange={(v) => patch({ view: v })}
        items={[
          { value: 'make', label: S.tabs.make, content: <MakeView /> },
          {
            value: 'library',
            label: count ? `${S.tabs.library}（${count}）` : S.tabs.library,
            content: <LibraryView />,
          },
          { value: 'catalog', label: S.tabs.catalog, content: <CatalogView /> },
        ]}
      />
      <CardZoom />
      <CardPicker />
      <MissionToneDialog />
    </>
  );
}

export function App() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(usePlot);
  const savedAt = useSaveStatus(TOOL_ID);
  const sc = useCurrent();
  const shortcuts = useMemo<Shortcut[]>(
    () => [
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
        version={PROJECT_VERSION}
        fileName={sc ? fileBase(sc) : TOOL_ID}
        getData={() => ({ scenario: currentNow() })}
        confirmOpen={false}
        openedMessage={S.project.opened}
        onLoad={(data, project) => {
          addLoadedScenario(scenarioFromProject(data, project.version));
          usePrefs.getState().patch({ view: 'make' });
          return true;
        }}
        onReset={() => {
          resetCurrent();
          usePrefs.getState().patch({ view: 'make' });
        }}
        resetText={{
          label: S.project.resetLabel,
          title: S.project.resetTitle,
          description: S.project.resetDesc,
          confirmLabel: S.project.resetOk,
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
      body={<Main />}
    />
  );
}
