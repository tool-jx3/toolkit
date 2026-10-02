/**
 * 紀錄區：工具列（新增、詳細・感想、匯入、匯出）、搜尋／篩選／排序（F15～F18）、欄位管理、範例提示（F34）、表格。
 */
import { Download, FileText, PanelRightOpen, Plus, Search, Upload } from 'lucide-react';
import { useMemo } from 'react';
import { systemLabel } from '@/core/sessions';
import { Button, Notice, Select, TextInput } from '@/ui';
import { ColumnTools } from './ColumnPanels';
import { filterRows, type RoleFilter, type SortMode, systemFilterValues } from './logic';
import { notify } from './notify';
import { SessionTable } from './SessionTable';
import {
  deleteSamples,
  exportJson,
  openAddDialog,
  openDetail,
  openImport,
  setFilter,
  useLog,
  useUi,
} from './store';
import { S } from './strings';

export const SEARCH_INPUT_ID = 'session-log-search';
export const EXPORT_OUTPUT_ID = 'session-log-export';
/** 工具列的新增鈕（捲出畫面時才顯示浮動的新增鈕） */
export const ADD_BUTTON_ID = 'session-log-add';

const ALL = '__all';

/** 匯出 JSON（按鈕、快捷鍵） */
export function exportJsonWithNotice(): void {
  const name = exportJson();
  notify({ title: S.toast.exported(name), tone: 'success' });
}

/** 匯出文字：捲到輸出欄（F93） */
export function scrollToExport(): void {
  const el = document.getElementById(EXPORT_OUTPUT_ID);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function Filters() {
  const filter = useUi((s) => s.filter);
  const rows = useLog((s) => s.data.rows);
  const systems = useMemo(() => systemFilterValues(rows), [rows]);
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
      <div className="relative col-span-2 md:col-span-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <TextInput
          id={SEARCH_INPUT_ID}
          type="search"
          aria-label={S.toolbar.search}
          placeholder={S.toolbar.searchPlaceholder}
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value })}
          className="pl-8"
        />
      </div>
      <Select
        aria-label={S.toolbar.systemFilter}
        value={filter.system || ALL}
        onValueChange={(v) => setFilter({ system: v === ALL ? '' : v })}
        options={[
          { value: ALL, label: S.toolbar.allSystems },
          ...systems.map((v) => ({ value: v, label: systemLabel(v) })),
        ]}
      />
      <Select<RoleFilter>
        aria-label={S.toolbar.roleFilter}
        value={filter.role}
        onValueChange={(v) => setFilter({ role: v })}
        options={[
          { value: 'all', label: S.toolbar.roles.all },
          { value: 'PL', label: S.toolbar.roles.PL },
          { value: 'GM', label: S.toolbar.roles.GM },
        ]}
      />
      <Select<SortMode>
        aria-label={S.toolbar.sort}
        value={filter.sort}
        onValueChange={(v) => setFilter({ sort: v })}
        className="col-span-2 md:col-span-1"
        options={(['newest', 'oldest', 'scenario', 'gm'] as const).map((v) => ({
          value: v,
          label: S.toolbar.sorts[v],
        }))}
      />
    </div>
  );
}

function SampleNotice() {
  const n = useLog((s) => s.data.rows.filter((r) => r.sample).length);
  if (!n) return null;
  return (
    <Notice
      tone="info"
      action={
        <Button
          size="sm"
          onClick={() => {
            const removed = deleteSamples();
            if (removed) notify({ title: S.toast.samplesDeleted(removed), tone: 'success' });
          }}
        >
          {S.deleteSamples}
        </Button>
      }
    >
      <span data-testid="sample-notice">{S.samplesNotice(n)}</span>
    </Notice>
  );
}

export function LogPanel() {
  const rows = useLog((s) => s.data.rows);
  const filter = useUi((s) => s.filter);
  const shown = useMemo(() => filterRows(rows, filter), [rows, filter]);
  return (
    <section
      aria-labelledby="session-log-title"
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0">
          <h2 id="session-log-title" className="m-0 text-base font-semibold">
            {S.toolbar.title}
          </h2>
          <p className="m-0 text-xs text-muted" data-testid="row-count">
            {S.toolbar.shown(shown.length, rows.length)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            id={ADD_BUTTON_ID}
            variant="primary"
            size="sm"
            icon={<Plus />}
            onClick={openAddDialog}
          >
            {S.toolbar.add}
          </Button>
          <Button size="sm" icon={<PanelRightOpen />} onClick={() => openDetail()}>
            {S.toolbar.detail}
          </Button>
          <Button size="sm" icon={<Upload />} onClick={openImport}>
            {S.toolbar.import}
          </Button>
          <Button size="sm" icon={<Download />} onClick={exportJsonWithNotice}>
            {S.toolbar.exportJson}
          </Button>
          <Button size="sm" icon={<FileText />} onClick={scrollToExport}>
            {S.toolbar.exportText}
          </Button>
        </div>
      </div>
      <Filters />
      <ColumnTools />
      <SampleNotice />
      <SessionTable rows={shown} />
    </section>
  );
}
