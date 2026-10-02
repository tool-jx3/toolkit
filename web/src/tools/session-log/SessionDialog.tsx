/**
 * 新增／編輯團資訊（F45～F55）：基本資訊、參加者、備註、額外欄位（所有可選與自訂欄位）、長篇感想。
 * 編輯的是草稿，按「儲存」才寫回；×、Esc、取消不儲存。
 */
import { Plus, X } from 'lucide-react';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  COMMON_SYSTEMS,
  normalizeTimeValue,
  SESSION_ROLES,
  SESSION_STATUSES,
  SESSION_SURVIVALS,
  type SessionRow,
  systemLabel,
} from '@/core/sessions';
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  FieldRow,
  IconButton,
  Select,
  TextArea,
  TextInput,
  useConfirm,
} from '@/ui';
import { type ColumnState, columnLabel, dialogColumns, isUrlColumn } from './columns';
import { dialogChoice, isValidUrlField, newSessionRow, systemInput } from './logic';
import { notify } from './notify';
import { closeDialog, deleteRow, saveDialogRow, today, useLog, useUi } from './store';
import { S } from './strings';

const CUSTOM = '__custom';
const UNSET = '__unset';

interface Draft {
  row: SessionRow;
  dates: string[];
  systemChoice: string;
  systemCustom: string;
}

function makeDraft(row: SessionRow): Draft {
  const system = String(row.system ?? '');
  const known = COMMON_SYSTEMS.includes(system);
  return {
    row: { ...row },
    dates: row.dates?.length ? [...row.dates] : [today()],
    systemChoice: known ? system : CUSTOM,
    systemCustom: known ? '' : systemLabel(system),
  };
}

const BASIC = ['date', 'scenario', 'system', 'role', 'status', 'time'];
const PEOPLE = ['gm', 'players', 'pc'];
const NOTE = ['note'];

const str = (v: unknown) => (v == null ? '' : String(v));

function DialogBody({
  id,
  isNew,
  scenarioRef,
}: {
  id: string | null;
  isNew: boolean;
  scenarioRef: RefObject<HTMLInputElement | null>;
}) {
  const data = useLog((s) => s.data);
  const confirm = useConfirm();
  /* 開啟時取一次（之後是草稿） */
  const [draft, setDraft] = useState<Draft>(() => {
    const existing = id ? useLog.getState().data.rows.find((r) => r.id === id) : null;
    return makeDraft(existing ?? newSessionRow(today()));
  });
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [focusDate, setFocusDate] = useState<number | null>(null);
  const dateRefs = useRef<(HTMLInputElement | null)[]>([]);
  const columns = useMemo(() => dialogColumns(data), [data]);
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const extra = columns.filter((c) => ![...BASIC, ...PEOPLE, ...NOTE].includes(c.key));

  useEffect(() => {
    if (focusDate === null) return;
    dateRefs.current[focusDate]?.focus();
    setFocusDate(null);
  }, [focusDate]);

  const setField = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, row: { ...d.row, [key]: value } }));

  const save = () => {
    const bad = new Set(
      columns
        .filter((c) => isUrlColumn(c.key) && !isValidUrlField(str(draft.row[c.key])))
        .map((c) => c.key),
    );
    setInvalid(bad);
    if (bad.size) {
      document.querySelector<HTMLElement>(`[data-dialog-field="${[...bad][0]}"]`)?.focus();
      return;
    }
    const row: SessionRow = { ...draft.row };
    for (const c of columns) {
      if (c.key === 'date') continue;
      if (c.key === 'system')
        row.system =
          draft.systemChoice === CUSTOM ? systemInput(draft.systemCustom) : draft.systemChoice;
      else if (c.key === 'fav') row.fav = row.fav ? '★' : '';
      else if (c.key === 'time') row.time = normalizeTimeValue(row.time);
      else if (c.key === 'role' || c.key === 'status' || c.key === 'survival')
        /* 選單顯示的值（不在選單裡時是第一項）就是存的值（F48） */
        row[c.key] = dialogChoice(c.key, row[c.key]);
      else row[c.key] = str(row[c.key]);
    }
    const dates = [...new Set(draft.dates.map((d) => d.trim()).filter(Boolean))].sort();
    row.dates = dates;
    row.date = dates[0] ?? '';
    row.longNote = str(row.longNote);
    saveDialogRow(row, isNew);
    notify({ title: isNew ? S.dialog.added : S.dialog.saved, tone: 'success' });
  };

  const remove = async () => {
    if (!id) return;
    const ok = await confirm({
      title: S.dialog.deleteTitle,
      description: S.dialog.deleteDesc(str(draft.row.scenario)),
      confirmLabel: S.dialog.deleteConfirm,
      danger: true,
    });
    if (!ok) return;
    deleteRow(id);
    closeDialog();
    notify({ title: S.dialog.deleted, tone: 'success' });
  };

  const fieldFor = (col: ColumnState) => {
    const key = col.key;
    const label = columnLabel(col);
    const value = str(draft.row[key]);
    switch (key) {
      case 'date':
        return (
          <fieldset
            key={key}
            className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0 sm:col-span-2"
          >
            <legend className="mb-1 p-0 text-xs font-medium text-muted">{S.dialog.date}</legend>
            {draft.dates.map((d, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 日期欄沒有識別碼，依位置（刪除時整組重排）
              <div key={`${i}-${draft.dates.length}`} className="flex items-center gap-1.5">
                <TextInput
                  ref={(el) => {
                    dateRefs.current[i] = el;
                  }}
                  type="date"
                  aria-label={S.dialog.dateRow(i + 1)}
                  value={d}
                  onChange={(e) =>
                    setDraft((x) => ({
                      ...x,
                      dates: x.dates.map((v, j) => (j === i ? e.target.value : v)),
                    }))
                  }
                  className="w-44"
                />
                <IconButton
                  label={S.dialog.removeDate(i + 1)}
                  icon={<X />}
                  size="sm"
                  variant="ghost"
                  disabled={draft.dates.length <= 1}
                  onClick={() =>
                    setDraft((x) => ({ ...x, dates: x.dates.filter((_, j) => j !== i) }))
                  }
                />
              </div>
            ))}
            <div>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus />}
                onClick={() => {
                  setDraft((x) => ({ ...x, dates: [...x.dates, ''] }));
                  setFocusDate(draft.dates.length);
                }}
              >
                {S.dialog.addDate}
              </Button>
            </div>
          </fieldset>
        );
      case 'system':
        return (
          <div key={key} className="flex min-w-0 flex-col gap-1.5">
            <Field label={S.dialog.system}>
              <Select
                value={draft.systemChoice}
                onValueChange={(v) => setDraft((x) => ({ ...x, systemChoice: v }))}
                options={[
                  { value: CUSTOM, label: S.dialog.systemCustom },
                  ...COMMON_SYSTEMS.map((v) => ({ value: v, label: systemLabel(v) })),
                ]}
              />
            </Field>
            {draft.systemChoice === CUSTOM ? (
              <TextInput
                aria-label={S.dialog.systemCustomLabel}
                placeholder={S.dialog.systemCustomPlaceholder}
                value={draft.systemCustom}
                onChange={(e) => setDraft((x) => ({ ...x, systemCustom: e.target.value }))}
              />
            ) : null}
          </div>
        );
      case 'role':
        return (
          <Field key={key} label={S.dialog.role}>
            <Select
              value={dialogChoice('role', value)}
              onValueChange={(x) => setField('role', x)}
              options={SESSION_ROLES.map((r) => ({ value: r, label: r }))}
            />
          </Field>
        );
      case 'status':
        return (
          <Field key={key} label={S.dialog.status}>
            <Select
              value={dialogChoice('status', value)}
              onValueChange={(x) => setField('status', x)}
              options={SESSION_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
            />
          </Field>
        );
      case 'time':
        return (
          <Field key={key} label={S.dialog.time}>
            <div className="flex items-center gap-1.5">
              <TextInput
                inputMode="decimal"
                placeholder={S.dialog.timePlaceholder}
                value={value}
                onChange={(e) => setField('time', e.target.value)}
              />
              <span className="shrink-0 text-xs text-muted">{S.dialog.hoursUnit}</span>
            </div>
          </Field>
        );
      case 'fav':
        return (
          <Field key={key} label={S.dialog.fav}>
            <Checkbox
              checked={Boolean(draft.row.fav)}
              onCheckedChange={(v) => setField('fav', v ? '★' : '')}
              label={S.dialog.favLabel}
            />
          </Field>
        );
      case 'survival':
        return (
          <Field key={key} label={label}>
            <Select
              value={dialogChoice('survival', value) || UNSET}
              onValueChange={(x) => setField('survival', x === UNSET ? '' : x)}
              options={[
                { value: UNSET, label: S.dialog.survivalUnset },
                ...SESSION_SURVIVALS.map((s) => ({ value: s.value, label: s.label })),
              ]}
            />
          </Field>
        );
      default: {
        const labelText =
          key === 'gm'
            ? S.dialog.gm
            : key === 'players'
              ? S.dialog.players
              : key === 'scenario'
                ? columnLabel(col)
                : label;
        const url = isUrlColumn(key);
        return (
          <Field
            key={key}
            label={labelText}
            error={invalid.has(key) ? S.dialog.urlInvalid : undefined}
          >
            <TextInput
              ref={key === 'scenario' ? scenarioRef : undefined}
              type={url ? 'url' : 'text'}
              placeholder={url ? 'https://' : undefined}
              value={value}
              data-dialog-field={key}
              onChange={(e) => setField(key, e.target.value)}
            />
          </Field>
        );
      }
    }
  };

  const group = (title: string, keys: readonly string[] | ColumnState[]) => {
    const cols = (keys as (string | ColumnState)[])
      .map((k) => (typeof k === 'string' ? byKey.get(k) : k))
      .filter((c): c is ColumnState => !!c);
    if (!cols.length) return null;
    return (
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-semibold">{title}</legend>
        <FieldRow columns={2}>{cols.map(fieldFor)}</FieldRow>
      </fieldset>
    );
  };

  return (
    <form
      id="session-dialog-form"
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {group(S.dialog.groups.basic, BASIC)}
      {group(S.dialog.groups.people, PEOPLE)}
      {group(S.dialog.groups.note, NOTE)}
      {group(S.dialog.groups.extra, extra)}
      <Field label={S.dialog.longNote}>
        <TextArea
          rows={6}
          value={str(draft.row.longNote)}
          onChange={(e) => setField('longNote', e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {!isNew ? (
          <Button variant="danger" onClick={remove}>
            {S.dialog.delete}
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button onClick={closeDialog}>{S.dialog.cancel}</Button>
        <Button variant="primary" type="submit">
          {S.dialog.save}
        </Button>
      </div>
    </form>
  );
}

export function SessionDialog() {
  const dialog = useUi((s) => s.dialog);
  const open = dialog !== null;
  const isNew = dialog?.mode === 'add';
  const id = dialog?.mode === 'edit' ? dialog.id : null;
  const scenarioRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closeDialog();
      }}
      title={isNew ? S.dialog.addTitle : S.dialog.editTitle}
      size="lg"
      dismissOnOutside={false}
      initialFocus={scenarioRef}
    >
      {open ? (
        <DialogBody key={id ?? 'new'} id={id} isNew={isNew} scenarioRef={scenarioRef} />
      ) : null}
    </Dialog>
  );
}
