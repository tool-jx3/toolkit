/**
 * 「專案」分頁（規格 1.1、F36～F38、F80）：專案名稱、時間寫法（換算的對話框）、曆名、標記、目前進度、現在時刻。
 * PL 檢視：只列 PL 看得到的標記（停用）。
 */
import { ChevronsLeft, ChevronsRight, Eye, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  ColorField,
  Dialog,
  DialogClose,
  Field,
  IconButton,
  Notice,
  NumberInput,
  Section,
  Segmented,
  Select,
  TextInput,
  Toggle,
} from '@/ui';
import {
  defaultSession,
  SESSION_LIMITS,
  type Session,
  type SessionStyle,
  sessionStartText,
  zeroOf,
} from '../model/session';
import { shiftCount, shiftUnits } from '../model/shift';
import { dateLabel, dayOneValue, ERA_MAX, readTime, type TimeMode } from '../model/time';
import { LIMITS, type Marker, PALETTE, SNAP_CHOICES } from '../model/types';
import { notify } from '../notify';
import {
  addMarker,
  commit,
  defaultDayOne,
  deleteMarker,
  docNow,
  findEvent,
  guard,
  patchDoc,
  planConvert,
  requestFit,
  shiftTimes,
  undo,
  updateMarker,
  useDoc,
  useUi,
} from '../store';
import { S } from '../strings';
import { centerTime, useVisibleDoc } from '../view/shared';
import { CalendarSection } from './CalendarSection';
import { PlLock } from './EventPanel';
import { TimeField } from './TimeField';

const g = historyGesture(useDoc);

export function ProjectPanel() {
  const doc = useDoc((s) => s.data);
  const vdoc = useVisibleDoc();
  const pl = vdoc.audience === 'pl';
  /* PL 檢視：GM 專用的標記（與「只到目前進度」之後的）不列 */
  const markers: readonly Marker[] = pl ? vdoc.markers : doc.markers;

  const changeMode = (to: TimeMode) => {
    if (to === doc.mode) return;
    const used = doc.events.length || doc.markers.length || doc.progress.time;
    if (!used) {
      patchDoc({ mode: to });
      requestFit();
      return;
    }
    useUi.setState({ convertTo: to });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="project-panel">
      {pl ? <PlLock /> : null}
      <Section title={S.projectTitle} fixed>
        <Field label={S.fProjectTitle} hint={S.projectTitleHint}>
          <TextInput
            value={doc.title}
            maxLength={LIMITS.title}
            disabled={pl}
            data-field="project-title"
            placeholder={S.toolName}
            onFocus={g.begin}
            onBlur={g.commit}
            onChange={(e) => patchDoc({ title: e.target.value }, false)}
          />
        </Field>
        <Field label={S.fMode} hint={S.modeHints[doc.mode]}>
          <Segmented<TimeMode>
            value={doc.mode}
            fullWidth
            disabled={pl}
            onValueChange={changeMode}
            options={[
              { value: 'date', label: S.modes.date },
              { value: 'day', label: S.modes.day },
              { value: 'year', label: S.modes.year },
            ]}
          />
        </Field>
        {doc.mode === 'day' ? <SessionFields pl={pl} /> : null}
        {doc.mode !== 'year' ? (
          <Field label={S.fSnap} hint={S.snapHint}>
            <div data-testid="snap-choice">
              <Segmented<string>
                value={String(doc.snap ?? 0)}
                fullWidth
                disabled={pl}
                onValueChange={(v) =>
                  commitPatch((d) => {
                    const n = Number(v);
                    if (n) d.snap = n;
                    else delete d.snap;
                  })
                }
                options={[
                  { value: '0', label: S.snapAuto },
                  ...SNAP_CHOICES.map((n) => ({ value: String(n), label: S.snapMinutes(n) })),
                ]}
              />
            </div>
          </Field>
        ) : null}
        {doc.mode === 'year' ? (
          <Field label={S.fEra} hint={S.eraHint}>
            <TextInput
              value={doc.era}
              maxLength={ERA_MAX}
              disabled={pl}
              data-field="era"
              onFocus={g.begin}
              onBlur={g.commit}
              onChange={(e) => patchDoc({ era: e.target.value }, false)}
            />
          </Field>
        ) : null}
      </Section>

      {doc.mode === 'year' ? <CalendarSection pl={pl} /> : null}

      <ShiftSection pl={pl} />

      <Section title={S.progressTitle} fixed description={S.progressHint}>
        <Field label={S.progressOn} layout="inline">
          <Toggle
            checked={doc.progress.on}
            disabled={pl}
            onCheckedChange={(on) =>
              patchDoc({
                progress: {
                  ...doc.progress,
                  on,
                  time: on && !doc.progress.time ? centerTime() : doc.progress.time,
                },
              })
            }
          />
        </Field>
        {doc.progress.on ? (
          <>
            <TimeField
              label={S.progressTime}
              value={doc.progress.time}
              mode={doc.mode}
              era={doc}
              disabled={pl}
              data-field="progress-time"
              onCommit={(t) => patchDoc({ progress: { ...docNow().progress, time: t } })}
            />
            <Field label={S.progressPlOnly} layout="inline" hint={S.progressPlOnlyHint}>
              <Toggle
                checked={doc.progress.plOnly}
                disabled={pl}
                onCheckedChange={(v) => patchDoc({ progress: { ...doc.progress, plOnly: v } })}
              />
            </Field>
          </>
        ) : null}
        {doc.mode === 'date' ? (
          <Field label={S.showNow} layout="inline" hint={S.showNowHint}>
            <Toggle
              checked={doc.showNow}
              disabled={pl}
              onCheckedChange={(v) => patchDoc({ showNow: v })}
            />
          </Field>
        ) : null}
      </Section>

      <Section
        title={S.markersTitle}
        fixed
        description={S.markersHint}
        actions={
          <Button
            size="sm"
            icon={<Plus />}
            disabled={pl || doc.markers.length >= LIMITS.markers}
            aria-label={S.addMarkerLabel}
            data-testid="add-marker"
            onClick={() => {
              const id = addMarker(centerTime());
              if (id)
                requestAnimationFrame(() =>
                  document.querySelector<HTMLInputElement>(`[data-marker-name="${id}"]`)?.focus(),
                );
            }}
          >
            {S.addMarker}
          </Button>
        }
      >
        {markers.length ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={S.markersTitle}>
            {markers.map((m) => (
              <MarkerRow key={m.id} m={m} pl={pl} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{S.markersEmpty}</p>
        )}
      </Section>
      <ConvertDialog />
    </div>
  );
}

/** 改資料（PL 檢視時不作用；一步復原） */
function commitPatch(recipe: Parameters<typeof commit>[0]): void {
  if (!guard()) return;
  commit(recipe);
}

const DAY_STYLE = '__day';

/**
 * 第 N 天的標示（F124）：第 N 天／時刻／日程／倒數／階段；開始時刻、時間幅（倒數）、每個階段的長度。
 * 換標示不換算存檔的時間（只改顯示與輸入的寫法）。
 */
function SessionFields({ pl }: { pl: boolean }) {
  const session = useDoc((s) => s.data.session);
  const setSession = (next: Session | null) =>
    commitPatch((d) => {
      if (next) d.session = next;
      else delete d.session;
    });
  const style = session?.style ?? DAY_STYLE;
  return (
    <>
      <Field
        label={S.fSession}
        hint={
          style === 'schedule' ? (
            <>
              <span className="block">{S.sessionHints.schedule}</span>
              <span className="block" data-testid="schedule-day-hint">
                {S.scheduleDayHint}
              </span>
            </>
          ) : (
            S.sessionHints[style as SessionStyle | '__day']
          )
        }
      >
        <Select
          value={style}
          disabled={pl}
          data-field="session-style"
          onValueChange={(v) =>
            setSession(
              v === DAY_STYLE
                ? null
                : { ...(session ?? defaultSession(v as SessionStyle)), style: v as SessionStyle },
            )
          }
          options={[
            { value: DAY_STYLE, label: S.sessions.__day },
            ...(['clock', 'schedule', 'countdown', 'phase'] as const).map((k) => ({
              value: k,
              label: S.sessions[k],
            })),
          ]}
        />
      </Field>
      {session && session.style !== 'schedule' ? (
        <StartField session={session} pl={pl} onChange={setSession} />
      ) : null}
      {session?.style === 'countdown' ? (
        <Field
          label={S.fSessionLength}
          hint={S.sessionZero(
            sessionStartText({ start: zeroOf(session) % 1440 }),
            zeroOf(session) >= 1440,
          )}
        >
          <NumberInput
            value={session.length}
            min={SESSION_LIMITS.length[0]}
            max={SESSION_LIMITS.length[1]}
            step={15}
            unit="分"
            disabled={pl}
            onChange={(v) => setSession({ ...session, length: Math.round(v) })}
          />
        </Field>
      ) : null}
      {session?.style === 'phase' ? (
        <Field label={S.fSessionPhase} hint={S.sessionPhaseHint}>
          <NumberInput
            value={session.phase}
            min={SESSION_LIMITS.phase[0]}
            max={SESSION_LIMITS.phase[1]}
            step={5}
            unit="分"
            disabled={pl}
            onChange={(v) => setSession({ ...session, phase: Math.round(v) })}
          />
        </Field>
      ) : null}
    </>
  );
}

/** 開始時刻（HH:MM；離開欄位或 Enter 時套用，看不懂時還原） */
function StartField({
  session,
  pl,
  onChange,
}: {
  session: Session;
  pl: boolean;
  onChange: (s: Session) => void;
}) {
  const text = sessionStartText(session);
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(text), [text]);
  const apply = () => {
    const m = /^(\d{1,2})[:：](\d{2})$/.exec(draft.normalize('NFKC').trim());
    const v = m ? Number(m[1]) * 60 + Number(m[2]) : -1;
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
      setError(S.sessionStartBad);
      setDraft(text);
      return;
    }
    setError(null);
    if (v !== session.start) onChange({ ...session, start: v });
  };
  return (
    <Field
      label={S.fSessionStart}
      hint={error ? undefined : S.sessionStartHint}
      error={error ?? undefined}
    >
      <TextInput
        value={draft}
        disabled={pl}
        data-field="session-start"
        placeholder="18:00"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            apply();
          }
        }}
      />
    </Field>
  );
}

/**
 * 時間的插入與縮短（F129）：從基準時間起，之後開始的事件、標記、目前進度、退場時刻整段往後挪或往前縮（一步復原）。
 */
function ShiftSection({ pl }: { pl: boolean }) {
  const doc = useDoc((s) => s.data);
  const units = useMemo(() => shiftUnits(doc), [doc]);
  const selectedId = useUi((s) => s.selectedId);
  const [from, setFrom] = useState('');
  const [amount, setAmount] = useState(30);
  const [unitId, setUnitId] = useState<string>(units[0]?.id ?? 'min');
  const unit = units.find((u) => u.id === unitId) ?? units[0];
  /* 基準時間的預設：選取中的事件的開始，沒有時畫面範圍的中間 */
  const fromText = from || findEvent(selectedId)?.start || '';
  const fromTv = fromText ? readTime(doc.mode, fromText, doc) : null;
  const count = fromTv ? shiftCount(doc, fromTv.v) : 0;
  const run = (dir: 1 | -1) => {
    const base = fromText || centerTime();
    const tv = readTime(doc.mode, base, doc);
    if (!tv || !unit) return;
    const plan = shiftTimes(tv.v, dir * amount * unit.v);
    if (!plan) return;
    if (!plan.moved && plan.sessionLength === null) {
      notify({ title: S.shiftNothing, tone: 'info' });
      return;
    }
    notify({
      title: S.shiftDone(dir > 0, `${amount} ${unit.label}`, plan.moved),
      description: [
        plan.aligned ? S.shiftAligned(plan.aligned) : '',
        plan.blocked ? S.shiftBlocked(plan.blocked) : '',
      ]
        .filter(Boolean)
        .join(''),
      tone: 'success',
      action: { label: S.undoAction, onClick: () => undo() },
    });
  };
  return (
    <Section title={S.shiftTitle} persistKey="scenario-timeline:shift" description={S.shiftHint}>
      <TimeField
        label={S.shiftFrom}
        value={fromText}
        mode={doc.mode}
        era={doc}
        disabled={pl}
        allowEmpty
        hint={S.shiftFromHint}
        data-field="shift-from"
        onCommit={(t) => setFrom(t)}
      />
      {fromText ? (
        <p className="m-0 text-xs text-muted" data-testid="shift-count">
          {S.shiftCount(count)}
        </p>
      ) : null}
      <div className="flex min-w-0 items-end gap-2">
        <Field label={S.shiftAmount} className="min-w-0 flex-1">
          <NumberInput
            value={amount}
            min={1}
            max={100000}
            step={unit?.id === 'min' ? 5 : 1}
            disabled={pl}
            onChange={(v) => setAmount(Math.max(1, Math.round(v)))}
          />
        </Field>
        <Field label={S.shiftUnit} className="w-24 shrink-0">
          <Select
            value={unit?.id ?? 'min'}
            disabled={pl}
            data-field="shift-unit"
            onValueChange={setUnitId}
            options={units.map((u) => ({ value: u.id, label: u.label }))}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<ChevronsRight />}
          disabled={pl}
          data-testid="shift-insert"
          onClick={() => run(1)}
        >
          {S.shiftInsert}
        </Button>
        <Button
          size="sm"
          icon={<ChevronsLeft />}
          disabled={pl}
          data-testid="shift-shrink"
          onClick={() => run(-1)}
        >
          {S.shiftShrink}
        </Button>
      </div>
    </Section>
  );
}

function MarkerRow({ m, pl }: { m: Marker; pl: boolean }) {
  const doc = useDoc((s) => s.data);
  const name = m.label.trim() || S.markerDefault;
  return (
    <li
      className="flex flex-col gap-1.5 rounded-md border border-border p-2"
      data-marker-item={m.id}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <ColorField
          value={m.color}
          showInput={false}
          className="w-auto shrink-0"
          swatches={PALETTE}
          disabled={pl}
          aria-label={`${S.markerColor}：${name}`}
          onChange={(c) =>
            updateMarker(m.id, (x) => {
              x.color = c.slice(0, 7).toLowerCase();
            })
          }
        />
        <TextInput
          value={m.label}
          aria-label={S.markerName}
          data-marker-name={m.id}
          maxLength={LIMITS.label}
          disabled={pl}
          className="min-w-0 flex-1"
          onFocus={g.begin}
          onBlur={g.commit}
          onChange={(e) =>
            updateMarker(
              m.id,
              (x) => {
                x.label = e.target.value;
              },
              false,
            )
          }
        />
        <IconButton
          size="sm"
          variant="secondary"
          label={`${S.markerGm}：${name}`}
          icon={<span className="text-[11px] font-bold">GM</span>}
          pressed={m.gm}
          disabled={pl}
          onClick={() =>
            updateMarker(m.id, (x) => {
              x.gm = !x.gm;
              if (!x.gm) {
                delete x.revealed;
                delete x.unlocked;
              }
            })
          }
        />
        {!pl && m.gm ? (
          <IconButton
            size="sm"
            variant="secondary"
            label={`${S.markerRevealed}：${name}`}
            icon={<Eye />}
            pressed={!!m.revealed}
            data-marker-revealed={m.id}
            onClick={() =>
              updateMarker(m.id, (x) => {
                if (x.revealed) delete x.revealed;
                else x.revealed = true;
              })
            }
          />
        ) : null}
        <IconButton
          size="sm"
          variant="ghost"
          label={S.markerDelete(name)}
          icon={<Trash2 />}
          disabled={pl}
          onClick={() => deleteMarker(m.id)}
        />
      </div>
      <TimeField
        label={S.markerTime}
        value={m.time}
        mode={doc.mode}
        era={doc}
        disabled={pl}
        data-field="marker-time"
        onCommit={(t) =>
          updateMarker(m.id, (x) => {
            x.time = t;
          })
        }
      />
    </li>
  );
}

/** 換時間寫法（規格 F04） */
function ConvertDialog() {
  const to = useUi((s) => s.convertTo);
  const mode = useDoc((s) => s.data.mode);
  const era = useDoc((s) => s.data.era);
  const [dayOne, setDayOne] = useState('');
  useEffect(() => {
    if (to) setDayOne(defaultDayOne());
  }, [to]);
  const needsDay = !!to && (mode === 'day' || to === 'day');
  const plan = to ? planConvert(to, dayOne) : null;
  const close = () => useUi.setState({ convertTo: null });
  return (
    <Dialog
      open={!!to}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={to ? S.convertTitle(S.modes[to]) : ''}
      description={S.convertDesc}
      size="sm"
      footer={
        <>
          <DialogClose>{S.pasteCancel}</DialogClose>
          <Button
            variant="primary"
            disabled={!plan || plan.bad > 0}
            data-testid="convert-apply"
            onClick={() => {
              if (!plan || !to) return;
              plan.apply();
              close();
              notify({ title: S.converted(S.modes[to]), tone: 'success' });
            }}
          >
            {S.convertApply}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {needsDay ? (
          <Field
            label={S.convertDayOne}
            hint={plan ? S.parsed(dayOneLabel(dayOne)) : S.convertDayOneHint}
            error={plan ? undefined : '看不懂這個日期'}
          >
            <TextInput
              value={dayOne}
              data-field="day-one"
              placeholder="1925-03-12"
              onChange={(e) => setDayOne(e.target.value)}
            />
          </Field>
        ) : null}
        {plan && plan.bad > 0 ? <Notice tone="warning">{S.convertBad(plan.bad)}</Notice> : null}
        {plan && plan.bad === 0 && plan.lossy > 0 ? (
          <div data-testid="convert-lossy">
            <Notice tone="info">
              <p className="m-0">{S.convertLossy(plan.lossy)}</p>
              <ul className="m-0 mt-1 list-disc pl-5">
                {plan.examples.map((x, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 例子固定順序、不重排
                  <li key={i}>
                    {x.name}：{x.from} → {x.to}
                  </li>
                ))}
              </ul>
            </Notice>
          </div>
        ) : null}
        {plan && to === 'date' && mode === 'year' && era.trim() ? (
          <p className="m-0 text-sm text-muted">{S.convertEraNote(era.trim())}</p>
        ) : null}
      </div>
    </Dialog>
  );
}

function dayOneLabel(text: string): string {
  const v = dayOneValue(text);
  return v === null ? text.trim() : dateLabel(v);
}
