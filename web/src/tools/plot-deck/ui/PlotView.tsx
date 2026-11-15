/**
 * 場景與線索：檢查、PL 要查明的事（推理）、場景（上下移動、刪除）、線索（連到推理、換場景、刪除）。
 * 還沒有內容時：「從卡片做草稿」或「從空白開始」。
 */
import { ArrowDown, ArrowRight, ArrowUp, FilePlus2, Plus, Trash2, Wand2 } from 'lucide-react';
import { Button, cn, IconButton, Select, TextArea, TextInput, useConfirm, useToast } from '@/ui';
import {
  addClue,
  addDeduction,
  addScene,
  moveSceneBy,
  removePlot,
  seedPlotFromCards,
  setClueField,
  setClueScene,
  setDeductionText,
  setSceneField,
  setStep,
  startBlankPlot,
  toggleClueLink,
} from '../actions';
import {
  type CheckLevel,
  checkPlot,
  cluesFor,
  hasScene,
  needsDeleteConfirm,
  plotEmpty,
  plotNumbers,
} from '../model/plot';
import type { Clue, Plot, Scenario } from '../model/scenario';
import { S } from '../strings';
import { textGesture } from './hooks';

const NO_SCENE = '__none';

const LEVEL_CLASS: Record<CheckLevel, string> = {
  ok: 'border-success bg-success-soft',
  mid: 'border-warning bg-warning-soft',
  warn: 'border-danger bg-danger-soft',
  info: 'border-border bg-surface-2',
};

function focusLater(selector: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
}

function CheckPanel({ plot }: { plot: Plot }) {
  const items = checkPlot(plot);
  return (
    <section
      aria-label={S.plot.check.title}
      data-testid="plot-check"
      aria-live="polite"
      className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3"
    >
      <h3 className="m-0 text-sm font-bold text-fg">{S.plot.check.title}</h3>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((it) => (
          <li
            key={it.text}
            data-level={it.level}
            className={cn('rounded-sm border-l-4 px-2 py-1 text-sm text-fg', LEVEL_CLASS[it.level])}
          >
            {it.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function useRemove() {
  const confirm = useConfirm();
  return async (plot: Plot, kind: 'deduction' | 'scene' | 'clue', id: string) => {
    if (needsDeleteConfirm(plot, kind, id)) {
      const no = plotNumbers(plot)[id];
      const held = kind === 'scene' ? plot.clues.filter((c) => c.scene === id).length : 0;
      const ok = await confirm({
        title: S.plot.deleteTitle(no),
        description:
          kind === 'scene'
            ? S.plot.deleteSceneDesc(held)
            : kind === 'deduction'
              ? S.plot.deleteDeductionDesc
              : S.plot.deleteClueDesc,
        confirmLabel: S.plot.deleteItem,
        danger: true,
      });
      if (!ok) return;
    }
    removePlot(kind, id);
  };
}

function ClueRow({ plot, clue, no }: { plot: Plot; clue: Clue; no: Record<string, string> }) {
  const remove = useRemove();
  const n = no[clue.id];
  return (
    <div
      data-testid="clue"
      data-clue={clue.id}
      className="flex min-w-0 gap-2 rounded-md border border-border bg-surface p-2"
    >
      <span className="w-8 shrink-0 pt-1.5 text-xs font-bold text-accent tabular-nums">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <TextArea
          rows={2}
          aria-label={`${n} ${S.plot.clueText}`}
          placeholder={S.plot.clueText}
          data-field="clue-text"
          value={clue.text}
          onFocus={textGesture.begin}
          onBlur={textGesture.commit}
          onChange={(e) => setClueField(clue.id, 'text', e.target.value)}
        />
        <TextInput
          aria-label={`${n} ${S.plot.clueHow}`}
          placeholder={S.plot.clueHow}
          data-field="clue-how"
          value={clue.how}
          onFocus={textGesture.begin}
          onBlur={textGesture.commit}
          onChange={(e) => setClueField(clue.id, 'how', e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">{S.plot.clueLinks}</span>
          {plot.deductions.length ? (
            plot.deductions.map((d) => {
              const on = clue.links.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={on}
                  data-link={no[d.id]}
                  title={d.text}
                  onClick={() => toggleClueLink(clue.id, d.id)}
                  className={cn(
                    'h-7 rounded-full border px-2.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus',
                    on
                      ? 'border-accent bg-accent text-accent-contrast'
                      : 'border-border bg-surface-2 text-fg hover:bg-surface-3',
                  )}
                >
                  {no[d.id]}
                </button>
              );
            })
          ) : (
            <span className="text-xs text-muted">{S.plot.noDeductions}</span>
          )}
          <span className="flex-1" />
          <div className="min-w-[9rem]">
            <Select
              size="sm"
              aria-label={S.plot.clueScene(n)}
              data-testid="clue-scene"
              value={hasScene(plot, clue) ? clue.scene : NO_SCENE}
              onValueChange={(v) => setClueScene(clue.id, v === NO_SCENE ? '' : v)}
              options={[
                { value: NO_SCENE, label: S.plot.chooseScene },
                ...plot.scenes.map((s) => ({
                  value: s.id,
                  label: `${no[s.id]} ${s.name.trim() || S.plot.noName}`,
                })),
              ]}
            />
          </div>
          <IconButton
            size="sm"
            variant="ghost"
            label={`${n} ${S.plot.deleteItem}`}
            icon={<Trash2 />}
            onClick={() => void remove(plot, 'clue', clue.id)}
          />
        </div>
      </div>
    </div>
  );
}

function PlotEditor({ plot }: { plot: Plot }) {
  const remove = useRemove();
  const no = plotNumbers(plot);
  const loose = plot.clues.filter((c) => !hasScene(plot, c));
  return (
    <div className="flex flex-col gap-4">
      <CheckPanel plot={plot} />
      <section className="flex flex-col gap-2" data-testid="deductions">
        <header className="flex flex-wrap items-baseline gap-x-3">
          <h3 className="m-0 text-base font-bold text-fg">
            <span className="mr-2 text-xs text-accent">01</span>
            {S.plot.deductions.title}
          </h3>
          <p className="m-0 text-xs text-muted">{S.plot.deductions.lead}</p>
        </header>
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {plot.deductions.map((d) => {
            const n = cluesFor(plot, d.id).length;
            return (
              <li
                key={d.id}
                data-testid="deduction"
                data-deduction={d.id}
                className="flex min-w-0 items-start gap-2"
              >
                <span className="w-8 shrink-0 pt-1.5 text-xs font-bold text-accent">
                  {no[d.id]}
                </span>
                <TextArea
                  rows={1}
                  className="min-w-0 flex-1"
                  aria-label={no[d.id]}
                  placeholder={S.plot.deductionPlaceholder}
                  data-field="deduction"
                  value={d.text}
                  onFocus={textGesture.begin}
                  onBlur={textGesture.commit}
                  onChange={(e) => setDeductionText(d.id, e.target.value)}
                />
                <span
                  data-testid="deduction-count"
                  className={cn(
                    'shrink-0 rounded-full px-2 py-1 text-xs',
                    n >= 3
                      ? 'bg-success-soft text-fg'
                      : n === 2
                        ? 'bg-warning-soft text-fg'
                        : 'bg-danger-soft text-fg',
                  )}
                >
                  {S.plot.clueCount(n)}
                </span>
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={`${no[d.id]} ${S.plot.deleteItem}`}
                  icon={<Trash2 />}
                  onClick={() => void remove(plot, 'deduction', d.id)}
                />
              </li>
            );
          })}
        </ol>
        <div>
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              const id = addDeduction();
              focusLater(`[data-deduction="${id}"] textarea`);
            }}
          >
            {S.plot.addDeduction}
          </Button>
        </div>
      </section>
      <section className="flex flex-col gap-2" data-testid="scenes">
        <header className="flex flex-wrap items-baseline gap-x-3">
          <h3 className="m-0 text-base font-bold text-fg">
            <span className="mr-2 text-xs text-accent">02</span>
            {S.plot.scenes.title}
          </h3>
          <p className="m-0 text-xs text-muted">{S.plot.scenes.lead}</p>
        </header>
        {plot.scenes.map((s, i) => (
          <article
            key={s.id}
            data-testid="scene"
            data-scene={s.id}
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-accent">{no[s.id]}</span>
              <TextInput
                className="min-w-[8rem] flex-1"
                aria-label={`${no[s.id]} ${S.plot.sceneName}`}
                placeholder={S.plot.sceneName}
                data-field="scene-name"
                value={s.name}
                onFocus={textGesture.begin}
                onBlur={textGesture.commit}
                onChange={(e) => setSceneField(s.id, 'name', e.target.value)}
              />
              <TextInput
                className="min-w-[6rem] flex-1"
                aria-label={`${no[s.id]} ${S.plot.scenePlace}`}
                placeholder={S.plot.scenePlace}
                data-field="scene-place"
                value={s.place}
                onFocus={textGesture.begin}
                onBlur={textGesture.commit}
                onChange={(e) => setSceneField(s.id, 'place', e.target.value)}
              />
              <span className="flex gap-1">
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={S.plot.moveUp(no[s.id])}
                  icon={<ArrowUp />}
                  disabled={i === 0}
                  onClick={() => moveSceneBy(s.id, -1)}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={S.plot.moveDown(no[s.id])}
                  icon={<ArrowDown />}
                  disabled={i === plot.scenes.length - 1}
                  onClick={() => moveSceneBy(s.id, 1)}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={`${no[s.id]} ${S.plot.deleteItem}`}
                  icon={<Trash2 />}
                  onClick={() => void remove(plot, 'scene', s.id)}
                />
              </span>
            </div>
            <TextArea
              rows={2}
              aria-label={`${no[s.id]} ${S.plot.sceneWhat}`}
              placeholder={S.plot.sceneWhat}
              data-field="scene-what"
              value={s.what}
              onFocus={textGesture.begin}
              onBlur={textGesture.commit}
              onChange={(e) => setSceneField(s.id, 'what', e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              {plot.clues
                .filter((c) => c.scene === s.id)
                .map((c) => (
                  <ClueRow key={c.id} plot={plot} clue={c} no={no} />
                ))}
            </div>
            <div>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus />}
                onClick={() => {
                  const id = addClue(s.id);
                  focusLater(`[data-clue="${id}"] textarea`);
                }}
              >
                {S.plot.addClue}
              </Button>
            </div>
          </article>
        ))}
        {loose.length ? (
          <article
            data-testid="loose-clues"
            className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-dashed border-border-strong p-3"
          >
            <h4 className="m-0 text-sm font-bold text-fg">{S.plot.loose}</h4>
            {loose.map((c) => (
              <ClueRow key={c.id} plot={plot} clue={c} no={no} />
            ))}
          </article>
        ) : null}
        <div>
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              const id = addScene();
              focusLater(`[data-scene="${id}"] input`);
            }}
          >
            {S.plot.addScene}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function PlotView({ sc }: { sc: Scenario }) {
  const toast = useToast();
  const empty = plotEmpty(sc.plot);
  return (
    <div className="flex flex-col gap-3" data-testid="plot">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-lg font-bold text-fg">{S.plot.title}</h2>
        <p className="m-0 text-sm text-muted">{S.plot.lead}</p>
      </header>
      {empty ? (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          <p className="m-0 text-sm text-fg">{S.plot.emptyLead}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={<Wand2 />}
              onClick={() => {
                seedPlotFromCards();
                toast({ title: S.plot.seed.done, tone: 'success', replace: true });
              }}
            >
              {S.plot.seed.fromCards}
            </Button>
            <Button icon={<FilePlus2 />} onClick={startBlankPlot}>
              {S.plot.seed.blank}
            </Button>
          </div>
        </section>
      ) : (
        <PlotEditor plot={sc.plot} />
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button variant="ghost" onClick={() => setStep('answers')}>
          {S.back(S.steps.answers.label)}
        </Button>
        <span className="flex-1" />
        <Button variant="primary" icon={<ArrowRight />} onClick={() => setStep('sheet')}>
          {S.next(S.steps.sheet.label)}
        </Button>
      </div>
    </div>
  );
}
