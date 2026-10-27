/**
 * 讀入（F49、F51、F52）：選檔或拖進視窗 → 解析（JSON、.ics、Google 日曆匯出的 ZIP）→ 對話框選要讀的行事曆、
 * 讀成場次或預定（iCal）、期間、加入或取代 → 讀入（一步復原）。
 */
import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { pickFiles, readAsBytes, unzipFiles } from '@/core/files';
import { Button, Checkbox, Dialog, Field, Notice, Segmented } from '@/ui';
import { today } from './dates';
import { convertKinds, parseIcal } from './ical';
import { type ImportBatch, type ImportFormat, ImportFormatError, parseImportJson } from './json';
import { ENTRY_LIMIT, type Entry, type EntryKind } from './model';
import { notify } from './notify';
import { applyImport, restoreFocus, useCal } from './store';
import { S } from './strings';

export interface PendingImport extends ImportBatch {
  name: string;
  restored: Set<string>;
  recurring: number;
  skipped: number;
}

export const useImport = create<{ pending: PendingImport | null }>(() => ({ pending: null }));

const baseName = (name: string) => name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || name;
const decode = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes);
const isZip = (b: Uint8Array) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03;

/** 檔案 → 要讀入的內容；看不懂時丟出錯誤（訊息可以直接顯示） */
export async function readImportFiles(files: readonly File[]): Promise<PendingImport> {
  const result: PendingImport = {
    name: files.map((f) => f.name).join('、'),
    format: 'ical',
    entries: [],
    cpColors: [],
    dropped: 0,
    restored: new Set(),
    recurring: 0,
    skipped: 0,
  };
  const formats = new Set<ImportFormat>();
  const addIcal = (text: string, name: string) => {
    const r = parseIcal(text, baseName(name));
    result.entries.push(...r.entries);
    for (const id of r.restored) result.restored.add(id);
    result.recurring += r.recurring;
    result.skipped += r.skipped;
    formats.add('ical');
  };
  for (const file of files) {
    const bytes = await readAsBytes(file);
    if (isZip(bytes)) {
      let unzipped: { name: string; data: Uint8Array }[];
      try {
        unzipped = unzipFiles(bytes);
      } catch {
        throw new ImportFormatError(S.importDialog.badZip);
      }
      const ics = unzipped.filter((f) => /\.(ics|ical|ifb)$/i.test(f.name));
      if (!ics.length) throw new ImportFormatError(S.importDialog.noIcs);
      for (const f of ics) addIcal(decode(f.data), f.name);
      continue;
    }
    const text = decode(bytes).replace(/^﻿/, '');
    if (/^\s*BEGIN:VCALENDAR/i.test(text)) {
      addIcal(text, file.name);
      continue;
    }
    if (/^\s*[[{]/.test(text)) {
      const b = parseImportJson(text);
      result.entries.push(...b.entries);
      result.cpColors.push(...b.cpColors);
      result.dropped += b.dropped;
      if (b.title && !result.title) result.title = b.title;
      formats.add(b.format);
      continue;
    }
    throw new ImportFormatError(S.importDialog.unknown);
  }
  result.format = formats.size === 1 ? [...formats][0] : formats.has('ical') ? 'ical' : 'self';
  return result;
}

/** 讀檔（選檔、拖放、專案選單）→ 打開讀入對話框；失敗時通知 */
export async function startImport(files: readonly File[]): Promise<void> {
  if (!files.length) return;
  try {
    const pending = await readImportFiles(files);
    useImport.setState({ pending });
  } catch (e) {
    restoreFocus();
    notify({
      title: S.importDialog.failed,
      /* 本工具的說明照原文；其他（瀏覽器丟的英文錯誤）一律寫「讀不到這個檔案」 */
      description: e instanceof ImportFormatError ? e.message : S.importDialog.unreadable,
      tone: 'danger',
    });
  }
}

export async function pickImport(kind: 'json' | 'ical'): Promise<void> {
  const files = await pickFiles({
    accept:
      kind === 'json' ? '.json,application/json' : '.ics,.ical,.zip,text/calendar,application/zip',
    multiple: kind === 'ical',
  });
  if (!files.length) {
    restoreFocus();
    return;
  }
  await startImport(files);
}

function Body({ pending }: { pending: PendingImport }) {
  const ical = pending.format === 'ical';
  const [as, setAs] = useState<'auto' | EntryKind>('auto');
  const [period, setPeriod] = useState<'all' | 'future'>('all');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const converted = useMemo(
    () => (ical ? convertKinds(pending.entries, pending.restored, as) : pending.entries),
    [ical, pending, as],
  );
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of converted) m.set(e.calendar, (m.get(e.calendar) ?? 0) + 1);
    return [...m.entries()];
  }, [converted]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(groups.map(([n]) => n)));
  const t = today();
  const current = useCal((s) => s.data.entries.length);
  const selected: Entry[] = converted.filter(
    (e) => checked.has(e.calendar) && (period === 'all' || e.end >= t),
  );
  /* 一個行事曆最多 5000 筆：放不下的不讀（依日期，早的先讀） */
  const room = Math.max(0, ENTRY_LIMIT - (mode === 'replace' ? 0 : current));
  const over = Math.max(0, selected.length - room);
  const toRead = over
    ? [...selected]
        .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
        .slice(0, room)
    : selected;
  const close = () => {
    useImport.setState({ pending: null });
    restoreFocus();
  };
  const run = () => {
    applyImport(toRead, pending.cpColors, { replace: mode === 'replace', title: pending.title });
    close();
    notify({
      title: S.importDialog.done(toRead.length),
      description: over ? S.importDialog.overDone(over) : undefined,
      tone: over ? 'warning' : 'success',
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={S.importDialog.title(pending.name)}
      description={S.importDialog.format[pending.format]}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {S.importDialog.cancel}
          </Button>
          <Button
            variant="primary"
            onClick={run}
            disabled={!toRead.length}
            data-testid="import-confirm"
          >
            {S.importDialog.confirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="import-dialog">
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">{S.importDialog.calendars}</legend>
          {groups.map(([name, n]) => (
            <Checkbox
              key={name}
              checked={checked.has(name)}
              onCheckedChange={(v) =>
                setChecked((s) => {
                  const next = new Set(s);
                  if (v) next.add(name);
                  else next.delete(name);
                  return next;
                })
              }
              label={
                <span>
                  <strong>{name}</strong>
                  <span className="ml-2 text-xs text-muted">{S.importDialog.count(n)}</span>
                </span>
              }
            />
          ))}
        </fieldset>
        {ical ? (
          <Field label={S.importDialog.as} hint={S.importDialog.asHint}>
            <Segmented
              value={as}
              onValueChange={(v) => setAs(v as 'auto' | EntryKind)}
              options={[
                { value: 'auto', label: S.importDialog.asAuto },
                { value: 'session', label: S.importDialog.asSession },
                { value: 'plan', label: S.importDialog.asPlan },
              ]}
            />
          </Field>
        ) : null}
        <Field label={S.importDialog.period}>
          <Segmented
            value={period}
            onValueChange={(v) => setPeriod(v as 'all' | 'future')}
            options={[
              { value: 'all', label: S.importDialog.periodAll },
              { value: 'future', label: S.importDialog.periodFuture },
            ]}
          />
        </Field>
        <Field
          label={S.importDialog.mode}
          hint={mode === 'replace' ? S.importDialog.replaceHint : undefined}
        >
          <Segmented
            value={mode}
            onValueChange={(v) => setMode(v as 'append' | 'replace')}
            options={[
              { value: 'append', label: S.importDialog.append },
              { value: 'replace', label: S.importDialog.replace },
            ]}
          />
        </Field>
        {pending.recurring ? (
          <Notice tone="info">{S.importDialog.recurring(pending.recurring)}</Notice>
        ) : null}
        {pending.skipped ? (
          <Notice tone="info">{S.importDialog.skipped(pending.skipped)}</Notice>
        ) : null}
        {pending.dropped ? (
          <Notice tone="warning">{S.importDialog.dropped(pending.dropped)}</Notice>
        ) : null}
        {over ? (
          <Notice tone="warning">
            <span data-testid="import-over">
              {mode === 'replace'
                ? S.importDialog.overReplace(selected.length, over)
                : S.importDialog.overAppend(current, selected.length, over)}
            </span>
          </Notice>
        ) : null}
        <p className="m-0 text-sm font-semibold" data-testid="import-summary">
          {toRead.length ? S.importDialog.summary(toRead.length) : S.importDialog.nothing}
        </p>
      </div>
    </Dialog>
  );
}

export function ImportDialog() {
  const pending = useImport((s) => s.pending);
  if (!pending) return null;
  return <Body pending={pending} />;
}
