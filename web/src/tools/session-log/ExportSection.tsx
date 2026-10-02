/**
 * 已通關劇本清單（F93～F101）：輸出類型、用名字篩選（＋清除、提示）、輸出欄與複製。
 */
import { X } from 'lucide-react';
import { useDeferredValue, useMemo, useRef } from 'react';
import { Button, Field, Segmented, TextInput, TextOutputPanel } from '@/ui';
import {
  buildExportText,
  EXPORT_MODES,
  type ExportMode,
  exportHint,
  exportRows,
} from './exportText';
import { EXPORT_OUTPUT_ID } from './LogPanel';
import { useLog, useUi } from './store';
import { S } from './strings';

export function ExportSection() {
  /* 清單很長時，打字不必等清單重算（延後一拍） */
  const rows = useDeferredValue(useLog((s) => s.data.rows));
  const mode = useUi((s) => s.exportMode);
  const query = useUi((s) => s.exportQuery);
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(() => exportRows(rows, query), [rows, query]);
  const text = useMemo(() => buildExportText(list, mode), [list, mode]);
  const hint = exportHint(list, query);
  return (
    <section
      aria-labelledby="session-log-export-title"
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <div>
        <h2 id="session-log-export-title" className="m-0 text-base font-semibold">
          {S.out.title}
        </h2>
        <p className="m-0 text-xs text-muted">{S.out.description}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={S.out.mode} hint={S.out.modes[mode].desc}>
          <Segmented<ExportMode>
            value={mode}
            onValueChange={(v) => useUi.setState({ exportMode: v })}
            fullWidth
            size="sm"
            options={EXPORT_MODES.map((m) => ({ value: m, label: S.out.modes[m].label }))}
          />
        </Field>
        <Field label={S.out.filter}>
          <div className="flex items-center gap-1.5">
            <TextInput
              ref={input}
              type="search"
              value={query}
              placeholder={S.out.filterPlaceholder}
              onChange={(e) => useUi.setState({ exportQuery: e.target.value })}
            />
            <Button
              size="md"
              icon={<X />}
              onClick={() => {
                useUi.setState({ exportQuery: '' });
                input.current?.focus();
              }}
            >
              {S.out.clear}
            </Button>
          </div>
        </Field>
      </div>
      <p className="m-0 min-h-5 text-xs text-muted" aria-live="polite" data-testid="export-hint">
        {hint}
      </p>
      <div id={EXPORT_OUTPUT_ID}>
        <TextOutputPanel
          text={text}
          title={S.out.output}
          placeholder={S.out.outputPlaceholder}
          count={(t) => (t ? S.out.lines(t.split('\n').length) : null)}
          messages={{ copied: S.out.copied }}
        />
      </div>
    </section>
  );
}
