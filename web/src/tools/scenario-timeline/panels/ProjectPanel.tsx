/**
 * 「專案」分頁（規格 1.1、F36～F38、F80）：專案名稱、時間寫法（換算的對話框）、曆名、標記、目前進度、現在時刻。
 * PL 檢視：只列 PL 看得到的標記（停用）。
 */
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  ColorField,
  Dialog,
  DialogClose,
  Field,
  IconButton,
  Notice,
  Section,
  Segmented,
  TextInput,
  Toggle,
} from '@/ui';
import { dateLabel, dayOneValue, ERA_MAX, type TimeMode } from '../model/time';
import { LIMITS, type Marker, PALETTE } from '../model/types';
import { notify } from '../notify';
import {
  addMarker,
  defaultDayOne,
  deleteMarker,
  docNow,
  patchDoc,
  planConvert,
  requestFit,
  updateMarker,
  useDoc,
  useUi,
} from '../store';
import { S } from '../strings';
import { currentWin, newEventStart, snapForWidth, useVisibleDoc } from '../view/shared';
import { CalendarSection } from './CalendarSection';
import { PlLock } from './EventPanel';
import { TimeField } from './TimeField';

const g = historyGesture(useDoc);

/** 畫面範圍中間的時間（新標記、打開目前進度用） */
function centerTime(): string {
  const doc = docNow();
  const win = currentWin();
  return newEventStart(
    doc.mode,
    (win.start + win.end) / 2,
    snapForWidth(doc.mode, win, 800, doc),
    doc,
  );
}

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
            })
          }
        />
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
