/**
 * 匯入對話框（F70～F91）：你的稱呼、四個分頁、匯入方式、略過重複、執行匯入。
 * 每次開啟都是全新的狀態（關閉時清空）。
 */
import { useEffect, useMemo, useState } from 'react';
import type { SessionRow } from '@/core/sessions';
import { Button, Checkbox, Dialog, Field, Segmented, Tabs, TextInput } from '@/ui';
import { OPTIONAL_COLUMN_KEYS } from './columns';
import { CcfoliaPanel, JsonPanel, PreviewTable, TextPanel } from './ImportPanels';
import { SheetPanel } from './ImportSheet';
import { buildSheetRows, countDuplicates, dropDuplicates, existingDupKeys } from './importSheet';
import {
  ccFormRow,
  type ImportTab,
  jsonRows,
  partialRows,
  resetImport,
  setImport,
  useImport,
} from './importStore';
import { notify } from './notify';
import {
  applyImport,
  closeImport,
  setSelfNames,
  useLog,
  usePrefs,
  useSelfNames,
  useUi,
} from './store';
import { S } from './strings';

/** 團報文字匯入後，有值就自動加進表格的欄位（3.8.7） */
const TEXT_KEYS = ['hashtag', 'ending', 'survival', 'campaign', 'ho'];

function SelfNameField() {
  const stored = usePrefs((s) => s.data.selfNames);
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [stored]);
  const commit = () => {
    if (draft !== stored) setSelfNames(draft);
  };
  return (
    <Field label={S.import.selfName} hint={S.import.selfNameHint}>
      <TextInput
        value={draft}
        placeholder={S.import.selfNamePlaceholder}
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
    </Field>
  );
}

/** 目前的分頁要匯入的團（略過重複之前） */
function useBuiltRows(): SessionRow[] {
  const tab = useImport((s) => s.tab);
  const grid = useImport((s) => s.grid);
  const reportRows = useImport((s) => s.reportRows);
  const cc = useImport((s) => s.cc);
  const json = useImport((s) => s.json);
  const self = useSelfNames();
  return useMemo(() => {
    if (tab === 'sheet') return grid ? buildSheetRows(grid, self) : [];
    if (tab === 'text') return reportRows ? partialRows(reportRows, self) : [];
    if (tab === 'ccfolia') {
      const row = ccFormRow(cc);
      return row ? partialRows([row], self) : [];
    }
    return json ? jsonRows(json) : [];
  }, [tab, grid, reportRows, cc, json, self]);
}

function ImportBody() {
  const tab = useImport((s) => s.tab);
  const target = useImport((s) => s.target);
  const skipDup = useImport((s) => s.skipDup);
  const grid = useImport((s) => s.grid);
  const json = useImport((s) => s.json);
  const allRows = useLog((s) => s.data.rows);
  const self = useSelfNames();
  const built = useBuiltRows();
  const existing = useMemo(
    () => (target === 'overwrite' ? new Set<string>() : existingDupKeys(allRows)),
    [target, allRows],
  );
  const count = useMemo(
    () => countDuplicates(built, existing, skipDup),
    [built, existing, skipDup],
  );

  const ready =
    tab === 'json'
      ? !!json
      : tab === 'text'
        ? built.length > 0
        : tab === 'ccfolia'
          ? false
          : !!grid && grid.rows.length > 0 && grid.mapping.some(Boolean);

  const run = () => {
    if (!ready) return;
    if (!built.length) {
      notify({ title: tab === 'text' ? S.import.noReports : S.import.noRows, tone: 'warning' });
      return;
    }
    const rows = skipDup ? dropDuplicates(built, existing) : built;
    const ensureKeys =
      tab === 'sheet'
        ? [...new Set((grid?.mapping ?? []).filter(Boolean) as string[])]
        : tab === 'text'
          ? TEXT_KEYS.filter((k) => rows.some((r) => r[k]))
          : [];
    const ids = applyImport({
      rows,
      target,
      columns: tab === 'json' ? (json?.columns ?? null) : null,
      ensureKeys: ensureKeys.filter((k) => (OPTIONAL_COLUMN_KEYS as readonly string[]).includes(k)),
    });
    closeImport();
    notify({ title: S.import.done(ids.length), tone: 'success' });
  };

  const preview = <PreviewTable rows={built} existing={existing} count={count} />;

  return (
    <div className="flex flex-col gap-3">
      <SelfNameField />
      <Tabs<ImportTab>
        aria-label={S.import.tabsAria}
        value={tab}
        onValueChange={(v) => setImport({ tab: v })}
        items={[
          {
            value: 'sheet',
            label: S.import.tabs.sheet,
            content: <SheetPanel existing={existing} self={self} count={count} />,
          },
          { value: 'text', label: S.import.tabs.text, content: <TextPanel preview={preview} /> },
          {
            value: 'ccfolia',
            label: S.import.tabs.ccfolia,
            content: <CcfoliaPanel preview={preview} self={self} />,
          },
          { value: 'json', label: S.import.tabs.json, content: <JsonPanel /> },
        ]}
      />
      <div className="sticky bottom-0 -mx-4 -mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-surface px-4 py-3">
        <Segmented
          aria-label={S.import.target}
          size="sm"
          value={target}
          onValueChange={(v) => setImport({ target: v })}
          options={[
            { value: 'append', label: S.import.append },
            { value: 'overwrite', label: S.import.overwrite },
          ]}
        />
        <Checkbox
          checked={skipDup}
          onCheckedChange={(v) => setImport({ skipDup: v })}
          label={S.import.skipDup}
        />
        <span className="flex-1" />
        <Button onClick={closeImport}>{S.import.cancel}</Button>
        <Button variant="primary" disabled={!ready} onClick={run}>
          {S.import.run}
        </Button>
      </div>
    </div>
  );
}

export function ImportDialog() {
  const open = useUi((s) => s.importOpen);
  /* 每次開啟都是全新的狀態：關閉時清空 */
  useEffect(() => {
    if (!open) resetImport();
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closeImport();
      }}
      title={S.import.title}
      description={S.import.description}
      size="xl"
      dismissOnOutside={false}
    >
      {open ? <ImportBody /> : null}
    </Dialog>
  );
}
