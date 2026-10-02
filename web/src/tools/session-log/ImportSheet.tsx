/**
 * 匯入：試算表分頁（F73～F78）。貼上或讀入 CSV／TSV → 可編輯的格線（對應選單、儲存格、刪除列、重複標示）。
 * 格線的列以 memo 包住，改一格只重畫那一列；列很多時只畫捲動範圍內的列。
 */
import { FileDown, FileUp, Plus, RotateCcw, X } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { decodeText, downloadText, pickFiles, readAsBytes } from '@/core/files';
import { Button, Field, IconButton, Notice, Select, TextArea, useVirtualRows } from '@/ui';
import {
  type DupCount,
  SHEET_FIELDS,
  type SheetMapping,
  sessionDupKey,
  sheetRowToSessionCached,
  templateCsv,
} from './importSheet';
import {
  addGridRow,
  deleteGridRow,
  type ImportMsg,
  parseSheetText,
  repaste,
  setCell,
  setImport,
  setMapping,
  useImport,
} from './importStore';
import { S } from './strings';

const SKIP = '__skip';

const MAPPING_OPTIONS = [
  { value: SKIP, label: S.import.skip },
  ...SHEET_FIELDS.map((f) => ({ value: f, label: S.sheet.fields[f] })),
];

/** 停止輸入約 0.18 秒後解讀（F73） */
const PARSE_DELAY_MS = 180;

export function MsgLine({ msg, testId }: { msg: ImportMsg | null; testId?: string }) {
  if (!msg) return null;
  return (
    <Notice tone={msg.tone}>
      <span data-testid={testId}>{msg.text}</span>
    </Notice>
  );
}

const GridRow = memo(function GridRow({
  index,
  cells,
  dup,
}: {
  index: number;
  cells: readonly string[];
  dup: boolean;
}) {
  return (
    <tr
      data-grid-row=""
      data-dup={dup || undefined}
      className={dup ? 'bg-warning-soft' : undefined}
    >
      <td className="sticky left-0 z-[1] border-b border-border bg-surface px-1 py-1 whitespace-nowrap">
        <span className="flex items-center gap-1">
          <IconButton
            label={S.import.deleteRow(index + 1)}
            icon={<X />}
            size="sm"
            variant="ghost"
            onClick={() => deleteGridRow(index)}
          />
          {dup ? (
            <span className="rounded-full bg-warning-soft px-1.5 text-xs text-warning">
              {S.import.dup}
            </span>
          ) : null}
        </span>
      </td>
      {cells.map((c, j) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 儲存格依欄位位置
        <td key={j} className="border-b border-border p-0.5">
          <input
            aria-label={S.import.cell(index + 1, j + 1)}
            value={c}
            onChange={(e) => setCell(index, j, e.target.value)}
            onBlur={(e) => {
              const collapsed = e.target.value.replace(/\s+/g, ' ').trim();
              if (collapsed !== e.target.value) setCell(index, j, collapsed);
            }}
            className="h-7 w-full min-w-28 rounded-sm border border-transparent bg-transparent px-1.5 text-xs text-fg hover:border-border focus:border-accent focus:bg-surface-2"
          />
        </td>
      ))}
    </tr>
  );
});

export function SheetGridView({
  existing,
  self,
  count,
}: {
  existing: ReadonlySet<string>;
  self: ReadonlySet<string>;
  count: DupCount;
}) {
  const grid = useImport((s) => s.grid);
  const target = useImport((s) => s.target);
  const dupFlags = useMemo(() => {
    if (!grid) return [];
    return grid.rows.map((cells) =>
      existing.has(sessionDupKey(sheetRowToSessionCached(cells, grid.mapping, self))),
    );
  }, [grid, existing, self]);
  /* 列很多時只畫捲動範圍內的列 */
  const scroller = useRef<HTMLDivElement>(null);
  const v = useVirtualRows({
    count: grid?.rows.length ?? 0,
    scrollRef: scroller,
    rowHeight: 33,
    headerOffset: 56,
  });
  useLayoutEffect(() => {
    if (v.virtual)
      v.measure(scroller.current?.querySelector<HTMLElement>('tbody tr[data-grid-row]') ?? null);
  });
  if (!grid) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-sm" data-testid="sheet-count">
        <span className="font-semibold">{S.import.preview}</span> {S.import.count(count.willImport)}
        {target === 'overwrite' ? S.import.countOverwrite : ''}
        {count.dup ? S.import.countDup(count.dup) : ''}
      </p>
      <p className="m-0 text-xs text-muted">{S.import.gridHint}</p>
      <div ref={scroller} className="max-h-80 overflow-auto rounded-md border border-border">
        <table aria-label={S.import.gridAria} className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-[3] border-b border-border bg-surface-2 px-1" />
              {grid.columns.map((name, j) => (
                <th
                  // biome-ignore lint/suspicious/noArrayIndexKey: 欄位依位置
                  key={j}
                  scope="col"
                  className="sticky top-0 z-[2] min-w-32 border-b border-border bg-surface-2 p-1 text-left font-normal"
                >
                  <span className="mb-0.5 block truncate px-0.5 text-muted" title={name}>
                    {name}
                  </span>
                  <Select
                    size="sm"
                    aria-label={S.import.mapping(j + 1, name)}
                    value={grid.mapping[j] || SKIP}
                    onValueChange={(v) => setMapping(j, (v === SKIP ? '' : v) as SheetMapping)}
                    options={MAPPING_OPTIONS}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.padTop ? (
              <tr aria-hidden>
                <td
                  colSpan={grid.columns.length + 1}
                  className="p-0"
                  style={{ height: v.padTop }}
                />
              </tr>
            ) : null}
            {grid.rows.slice(v.start, v.end).map((cells, k) => (
              <GridRow
                // biome-ignore lint/suspicious/noArrayIndexKey: 格線的列沒有識別碼，以列號當 key（刪除一列時後面的列重畫）
                key={`row-${v.start + k}`}
                index={v.start + k}
                cells={cells}
                dup={dupFlags[v.start + k] ?? false}
              />
            ))}
            {v.padBottom ? (
              <tr aria-hidden>
                <td
                  colSpan={grid.columns.length + 1}
                  className="p-0"
                  style={{ height: v.padBottom }}
                />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon={<Plus />} onClick={addGridRow}>
          {S.import.addRow}
        </Button>
        <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={repaste}>
          {S.import.repaste}
        </Button>
      </div>
    </div>
  );
}

export function SheetPanel({
  existing,
  self,
  count,
}: {
  existing: ReadonlySet<string>;
  self: ReadonlySet<string>;
  count: DupCount;
}) {
  const grid = useImport((s) => s.grid);
  const text = useImport((s) => s.sheetText);
  const msg = useImport((s) => s.sheetMsg);
  const file = useImport((s) => s.sheetFile);

  useEffect(() => {
    if (grid) return;
    const t = setTimeout(() => parseSheetText(text), PARSE_DELAY_MS);
    return () => clearTimeout(t);
  }, [text, grid]);

  const pick = async () => {
    const [f] = await pickFiles({
      accept: '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain',
    });
    if (!f) return;
    try {
      const decoded = decodeText(await readAsBytes(f));
      setImport({
        sheetText: decoded.text,
        sheetFile:
          decoded.encoding === 'utf-8'
            ? S.import.fileRead(f.name)
            : S.import.fileEncoding(f.name, decoded.encoding),
      });
      parseSheetText(decoded.text);
    } catch {
      setImport({ sheetMsg: { tone: 'danger', text: S.import.fileReadError } });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">{S.import.sheetHint}</p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon={<FileUp />} onClick={() => void pick()}>
          {S.import.pickSheet}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<FileDown />}
          onClick={() =>
            downloadText(templateCsv(), S.import.templateFileName, 'text/csv;charset=utf-8')
          }
        >
          {S.import.template}
        </Button>
      </div>
      {file ? (
        <p className="m-0 text-xs text-muted" data-testid="sheet-file">
          {file}
        </p>
      ) : null}
      {grid ? null : (
        <Field label={S.import.sheetPaste}>
          <TextArea
            rows={5}
            value={text}
            placeholder={S.import.sheetPlaceholder}
            spellCheck={false}
            onChange={(e) => setImport({ sheetText: e.target.value })}
            className="font-mono text-xs"
          />
        </Field>
      )}
      <MsgLine msg={msg} testId="sheet-msg" />
      <SheetGridView existing={existing} self={self} count={count} />
    </div>
  );
}
