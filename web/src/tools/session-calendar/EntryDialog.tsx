/**
 * 新增／編輯場次與預定（F34～F44）。編輯的是草稿，按「儲存」才寫回（一步復原）；×、Esc、取消不儲存。
 */
import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { splitTags } from '@/core/sessions';
import {
  Button,
  Checkbox,
  Chips,
  ColorField,
  Dialog,
  Field,
  FieldRow,
  IconButton,
  Segmented,
  TextArea,
  TextInput,
  useConfirm,
} from '@/ui';
import { today } from './dates';
import {
  colorCss,
  type Entry,
  type EntryColor,
  type EntryKind,
  entryTitle,
  newEntry,
  newId,
  PLAN_CALENDAR,
  PLAN_COLOR,
  SESSION_CALENDAR,
  SESSION_COLOR,
  type SessionStatus,
} from './model';
import { notify } from './notify';
import {
  addCpColor,
  calNow,
  closeEntryDialog,
  deleteEntry,
  pushColorHistory,
  removeCpColor,
  saveEntry,
  useCal,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';
import { nextTaskOrder } from './tasks';

const SYSTEM_SUGGESTIONS = [
  'CoC 7版',
  'CoC 6版',
  'Emoklore',
  '謀殺之謎',
  '忍神',
  'Insane',
  '劍世界2.5',
];
const FORMAT_SUGGESTIONS = ['線上・語音', '線上・文字', '線上・半文字', '線下（面團）'];

const describeColor = (c: EntryColor) => (c.mode === 'gradient' ? `${c.c1} → ${c.c2}` : c.c1);

/** 顏色（F39～F41）：單色／兩色漸層、最近用過的顏色、CP 色 */
function EntryColorField({
  value,
  onChange,
}: {
  value: EntryColor;
  onChange: (c: EntryColor) => void;
}) {
  const history = usePrefs((s) => s.data.colorHistory);
  const cps = useCal((s) => s.data.cpColors);
  const [cpName, setCpName] = useState('');
  const saveCp = () => {
    if (value.mode !== 'gradient') {
      notify({ title: S.color.cpSaveNeedsGradient, tone: 'warning' });
      return;
    }
    const cp = addCpColor(cpName, value.c1, value.c2);
    if (!cp) {
      notify({ title: S.color.cpFull, tone: 'warning' });
      return;
    }
    setCpName('');
    notify({ title: S.color.cpSaved, tone: 'success' });
  };
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={value.mode}
          onValueChange={(mode) => onChange({ ...value, mode })}
          options={[
            { value: 'solid', label: S.color.solid },
            { value: 'gradient', label: S.color.gradient },
          ]}
          aria-label={S.color.label}
          size="sm"
        />
        <span
          aria-label={S.color.preview}
          role="img"
          data-testid="color-preview"
          className="h-5 min-w-16 flex-1 rounded-full border border-border"
          style={{ background: colorCss(value) }}
        />
      </div>
      <FieldRow columns={2}>
        <Field label={S.color.c1}>
          <ColorField value={value.c1} onChange={(c1) => onChange({ ...value, c1 })} />
        </Field>
        <Field label={S.color.c2} hidden={value.mode !== 'gradient'}>
          <ColorField value={value.c2} onChange={(c2) => onChange({ ...value, c2 })} />
        </Field>
      </FieldRow>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">{S.color.history}</span>
        {history.length ? (
          <div className="flex flex-wrap gap-1.5" data-testid="color-history">
            {history.map((c) => (
              <button
                key={`${c.mode}${c.c1}${c.c2}`}
                type="button"
                aria-label={S.color.apply(describeColor(c))}
                title={describeColor(c)}
                onClick={() => onChange({ ...c })}
                className="size-6 rounded-full border border-border outline-none focus-visible:ring-2 focus-visible:ring-focus"
                style={{ background: colorCss(c) }}
              />
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted">{S.color.historyEmpty}</span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">{S.color.cp}</span>
        <span className="text-xs text-muted">{S.color.cpHint}</span>
        {cps.length ? (
          <ul
            aria-label={S.color.cpList}
            className="m-0 flex list-none flex-wrap gap-1.5 p-0"
            data-testid="cp-list"
          >
            {cps.map((cp) => (
              <li
                key={cp.id}
                className="flex items-center gap-1 rounded-full border border-border py-0.5 pr-1 pl-0.5"
              >
                <button
                  type="button"
                  onClick={() => onChange({ mode: 'gradient', c1: cp.c1, c2: cp.c2 })}
                  className="flex items-center gap-1 rounded-full text-xs outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  aria-label={S.color.apply(cp.name)}
                >
                  <span
                    aria-hidden
                    className="h-4 w-7 rounded-full"
                    style={{ background: `linear-gradient(90deg, ${cp.c1}, ${cp.c2})` }}
                  />
                  {cp.name}
                </button>
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={S.color.cpRemove(cp.name)}
                  icon={<X />}
                  onClick={() => removeCpColor(cp.id)}
                  noTooltip
                />
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-muted">{S.color.cpEmpty}</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            aria-label={S.color.cpName}
            placeholder={S.color.cpNamePlaceholder}
            value={cpName}
            maxLength={40}
            onChange={(e) => setCpName(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Button size="sm" variant="secondary" onClick={saveCp} data-testid="cp-save">
            {S.color.cpSave}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface Draft extends Entry {
  tagText: string;
}

function makeDraft(): { draft: Draft; isNew: boolean } {
  const st = useUi.getState().entryDialog;
  if (st?.mode === 'edit') {
    const e = calNow().entries.find((x) => x.id === st.id);
    if (e) return { draft: { ...structuredClone(e), tagText: e.tags.join(' ') }, isNew: false };
  }
  const kind = st?.mode === 'new' ? st.kind : 'session';
  const start = st?.mode === 'new' ? st.start : today();
  const end = st?.mode === 'new' ? st.end : start;
  return { draft: { ...newEntry(kind, start, { end }), tagText: '' }, isNew: true };
}

function DialogBody() {
  const [{ draft: initial, isNew }] = useState(makeDraft);
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const session = d.kind === 'session';
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((x) => ({ ...x, [key]: value }));

  const switchKind = (kind: EntryKind) =>
    setD((x) => {
      if (x.kind === kind) return x;
      const next: Draft = { ...x, kind };
      const oldDefault = x.kind === 'session' ? SESSION_COLOR : PLAN_COLOR;
      if (x.color.mode === 'solid' && x.color.c1 === oldDefault)
        next.color = { ...x.color, c1: kind === 'session' ? SESSION_COLOR : PLAN_COLOR };
      if (x.calendar === (x.kind === 'session' ? SESSION_CALENDAR : PLAN_CALENDAR))
        next.calendar = kind === 'session' ? SESSION_CALENDAR : PLAN_CALENDAR;
      if (isNew && kind === 'session' && !x.startTime) next.startTime = '20:00';
      if (isNew && kind === 'plan' && x.startTime === '20:00' && !x.endTime) next.startTime = '';
      return next;
    });

  const save = () => {
    if (!d.start) {
      setError(S.entry.startRequired);
      return;
    }
    let start = d.start;
    let end = d.end || d.start;
    if (end < start) [start, end] = [end, start];
    const { tagText, ...rest } = d;
    const entry: Entry = {
      ...rest,
      title: d.title.trim(),
      start,
      end,
      calendar: d.calendar.trim() || (session ? SESSION_CALENDAR : PLAN_CALENDAR),
      tags: splitTags(tagText),
      players: d.players
        .map((p) => ({ pl: p.pl.trim(), pc: p.pc.trim() }))
        .filter((p) => p.pl || p.pc),
      links: d.links
        .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
        .filter((l) => l.label || l.url),
      tasks: d.tasks.map((t) => ({ ...t, title: t.title.trim() })).filter((t) => t.title),
    };
    saveEntry(entry, isNew);
    pushColorHistory(entry.color);
    closeEntryDialog();
    notify({ title: isNew ? S.entry.added : S.entry.saved, tone: 'success' });
  };

  const remove = async () => {
    const ok = await confirm({
      title: S.entry.deleteTitle,
      description: S.entry.deleteDesc(entryTitle(d)),
      confirmLabel: S.entry.deleteConfirm,
      danger: true,
    });
    if (!ok) return;
    deleteEntry(d.id);
    closeEntryDialog();
    notify({ title: S.entry.deleted, tone: 'success' });
  };

  const title = isNew
    ? session
      ? S.entry.newSession
      : S.entry.newPlan
    : session
      ? S.entry.editSession
      : S.entry.editPlan;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) closeEntryDialog();
      }}
      title={title}
      size="lg"
      initialFocus={titleRef}
      dismissOnOutside={false}
      footer={
        <>
          {!isNew ? (
            <Button variant="danger" onClick={remove} className="mr-auto">
              {S.entry.delete}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={closeEntryDialog}>
            {S.entry.cancel}
          </Button>
          <Button variant="primary" onClick={save} data-testid="entry-save">
            {S.entry.save}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        data-testid="entry-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={S.entry.kind}>
          <Segmented
            value={d.kind}
            onValueChange={switchKind}
            options={[
              { value: 'session', label: S.entry.kindSession },
              { value: 'plan', label: S.entry.kindPlan },
            ]}
          />
        </Field>
        <Field label={session ? S.entry.scenario : S.entry.title}>
          <TextInput
            ref={titleRef}
            value={d.title}
            maxLength={300}
            placeholder={session ? '' : S.entry.titlePlaceholderPlan}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.entry.start} error={error || undefined}>
            <TextInput
              type="date"
              value={d.start}
              onChange={(e) => {
                const v = e.target.value;
                setError('');
                setD((x) => ({ ...x, start: v, end: x.end && x.end >= v ? x.end : v }));
              }}
            />
          </Field>
          <Field label={S.entry.end} hint={S.entry.endHint}>
            <TextInput
              type="date"
              value={d.end}
              min={d.start}
              onChange={(e) => set('end', e.target.value)}
            />
          </Field>
        </FieldRow>
        <FieldRow columns={2}>
          <Field label={S.entry.startTime} hint={S.entry.timeHint}>
            <TextInput
              type="time"
              value={d.startTime}
              onChange={(e) => set('startTime', e.target.value)}
            />
          </Field>
          <Field label={S.entry.endTime}>
            <TextInput
              type="time"
              value={d.endTime}
              onChange={(e) => set('endTime', e.target.value)}
            />
          </Field>
        </FieldRow>
        {session ? (
          <>
            <FieldRow columns={2}>
              <Field label={S.entry.system}>
                <div className="flex flex-col gap-1">
                  <TextInput
                    value={d.system}
                    maxLength={100}
                    onChange={(e) => set('system', e.target.value)}
                  />
                  <Chips
                    size="sm"
                    aria-label={S.entry.systemSuggest}
                    items={SYSTEM_SUGGESTIONS}
                    value={d.system}
                    onPick={(v) => set('system', v)}
                  />
                </div>
              </Field>
              <Field label={S.entry.gm}>
                <TextInput
                  value={d.gm}
                  maxLength={200}
                  onChange={(e) => set('gm', e.target.value)}
                />
              </Field>
            </FieldRow>
            <Field label={S.entry.format}>
              <div className="flex flex-col gap-1">
                <TextInput
                  value={d.format}
                  maxLength={200}
                  onChange={(e) => set('format', e.target.value)}
                />
                <Chips
                  size="sm"
                  aria-label={S.entry.formatSuggest}
                  items={FORMAT_SUGGESTIONS}
                  value={d.format}
                  onPick={(v) => set('format', v)}
                />
              </div>
            </Field>
            <FieldRow columns={2}>
              <Field label={S.entry.status}>
                <Segmented
                  value={d.status}
                  onValueChange={(v) => set('status', v as SessionStatus)}
                  options={[
                    { value: 'scheduled', label: S.status.scheduled },
                    { value: 'tentative', label: S.status.tentative },
                    { value: 'completed', label: S.status.completed },
                  ]}
                  size="sm"
                />
              </Field>
              <Field label={S.entry.tags} hint={S.entry.tagsHint}>
                <TextInput value={d.tagText} onChange={(e) => set('tagText', e.target.value)} />
              </Field>
            </FieldRow>
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1 text-sm font-medium">{S.entry.players}</legend>
              {d.players.map((p, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 草稿裡的參加者沒有識別碼
                <div key={i} className="flex items-center gap-2" data-player-row={i}>
                  <TextInput
                    aria-label={`${S.entry.pl} ${i + 1}`}
                    placeholder={S.entry.pl}
                    value={p.pl}
                    onChange={(e) =>
                      set(
                        'players',
                        d.players.map((x, k) => (k === i ? { ...x, pl: e.target.value } : x)),
                      )
                    }
                    className="min-w-0 flex-1"
                  />
                  <span className="text-muted">／</span>
                  <TextInput
                    aria-label={`${S.entry.pc} ${i + 1}`}
                    placeholder={S.entry.pc}
                    value={p.pc}
                    onChange={(e) =>
                      set(
                        'players',
                        d.players.map((x, k) => (k === i ? { ...x, pc: e.target.value } : x)),
                      )
                    }
                    className="min-w-0 flex-1"
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.entry.removePlayer(i + 1)}
                    icon={<X />}
                    onClick={() =>
                      set(
                        'players',
                        d.players.filter((_, k) => k !== i),
                      )
                    }
                  />
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus className="size-4" />}
                className="self-start"
                onClick={() => set('players', [...d.players, { pl: '', pc: '' }])}
              >
                {S.entry.addPlayer}
              </Button>
            </fieldset>
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1 text-sm font-medium">{S.entry.links}</legend>
              {d.links.map((l, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 草稿裡的連結沒有識別碼
                <div key={i} className="flex items-center gap-2">
                  <TextInput
                    aria-label={S.entry.linkLabelAria(i + 1)}
                    placeholder={S.entry.linkLabel}
                    value={l.label}
                    onChange={(e) =>
                      set(
                        'links',
                        d.links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    className="w-28 min-w-0 shrink-0 sm:w-36"
                  />
                  <TextInput
                    aria-label={S.entry.linkUrlAria(i + 1)}
                    placeholder="https://"
                    type="url"
                    value={l.url}
                    onChange={(e) =>
                      set(
                        'links',
                        d.links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)),
                      )
                    }
                    className="min-w-0 flex-1"
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.entry.removeLink(i + 1)}
                    icon={<X />}
                    onClick={() =>
                      set(
                        'links',
                        d.links.filter((_, k) => k !== i),
                      )
                    }
                  />
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus className="size-4" />}
                className="self-start"
                onClick={() => set('links', [...d.links, { label: '', url: '' }])}
              >
                {S.entry.addLink}
              </Button>
            </fieldset>
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1 text-sm font-medium">{S.entry.tasks}</legend>
              {d.tasks.map((t, i) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 sm:flex-nowrap"
                  data-task-row={i}
                >
                  <Checkbox
                    aria-label={S.entry.taskDoneAria(i + 1)}
                    checked={t.done}
                    onCheckedChange={(v) =>
                      set(
                        'tasks',
                        d.tasks.map((x, k) => (k === i ? { ...x, done: v } : x)),
                      )
                    }
                  />
                  <TextInput
                    aria-label={S.entry.taskTitleAria(i + 1)}
                    placeholder={S.entry.taskTitle}
                    value={t.title}
                    onChange={(e) =>
                      set(
                        'tasks',
                        d.tasks.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)),
                      )
                    }
                    className="min-w-0 flex-1"
                  />
                  <TextInput
                    aria-label={S.entry.taskDueAria(i + 1)}
                    type="date"
                    value={t.due}
                    onChange={(e) =>
                      set(
                        'tasks',
                        d.tasks.map((x, k) => (k === i ? { ...x, due: e.target.value } : x)),
                      )
                    }
                    className="w-40 min-w-0"
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.entry.removeTask(i + 1)}
                    icon={<X />}
                    onClick={() =>
                      set(
                        'tasks',
                        d.tasks.filter((_, k) => k !== i),
                      )
                    }
                  />
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus className="size-4" />}
                className="self-start"
                onClick={() => {
                  const base = Math.max(
                    nextTaskOrder(calNow().entries),
                    ...d.tasks.map((t) => t.order + 10),
                  );
                  set('tasks', [
                    ...d.tasks,
                    { id: newId('task'), title: '', due: d.start, done: false, order: base },
                  ]);
                }}
              >
                {S.entry.addTask}
              </Button>
            </fieldset>
          </>
        ) : null}
        <Field label={S.color.label}>
          <EntryColorField value={d.color} onChange={(c) => set('color', c)} />
        </Field>
        <Field label={S.entry.memo}>
          <TextArea rows={3} value={d.memo} onChange={(e) => set('memo', e.target.value)} />
        </Field>
        <Field label={S.entry.calendar} hint={S.entry.calendarHint}>
          <TextInput
            value={d.calendar}
            maxLength={100}
            onChange={(e) => set('calendar', e.target.value)}
          />
        </Field>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

export function EntryDialog() {
  const st = useUi((s) => s.entryDialog);
  if (!st) return null;
  /* key：換一筆時重新取草稿 */
  return <DialogBody key={st.mode === 'edit' ? st.id : `new-${st.kind}-${st.start}-${st.end}`} />;
}
