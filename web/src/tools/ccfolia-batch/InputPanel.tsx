/**
 * 「輸入」分頁（規格 1.2～1.4）：輸入的方式、NPC 資料欄、讀取方式、寫法說明、每一欄的用途、讀到的標籤與讀法、提醒、
 * 從角色卡網站貼上。
 */
import { ClipboardPaste, Sparkles, Trash2 } from 'lucide-react';
import { type KeyboardEvent, type Ref, useRef, useState } from 'react';
import {
  Button,
  Field,
  Notice,
  Section,
  Segmented,
  Select,
  TextArea,
  Toggle,
  Tooltip,
  useConfirm,
} from '@/ui';
import {
  addPasted,
  clearPasted,
  fillSample,
  hasInput,
  setColumnKind,
  setLabelKind,
  setMode,
  setOpts,
  setText,
  warningsOf,
} from './actions';
import { parsedOf } from './derived';
import type { InputMode, LabelKind, RollStyle, SuffixStyle } from './model';
import { StatusLine } from './parts';
import { useDoc, usePrefs } from './store';
import { COLUMN_KIND_OPTIONS, LABEL_KIND_OPTIONS, ROLL_OPTIONS, S } from './strings';
import type { ColumnKind } from './words';

const MODES: InputMode[] = ['memo', 'table'];
const SUFFIXES: SuffixStyle[] = ['alpha', 'number'];

/** 讀到的標籤與讀法：改過的在前，再來是沒看過的名稱，最後是認得的 */
function LabelsSection() {
  const doc = useDoc((s) => s.data);
  const list = doc.edited
    ? []
    : parsedOf(doc).labels.filter((l) => l.auto !== 'initiative' && l.kind !== 'initiative');
  if (!list.length) return null;
  const rank = (l: (typeof list)[number]) => (l.kind !== l.auto ? 0 : l.known ? 2 : 1);
  const sorted = [...list].sort((a, b) => rank(a) - rank(b));
  return (
    <Section
      title={<span data-testid="labels-title">{S.labelsTitle(list.length)}</span>}
      defaultOpen={false}
      persistKey="ccfolia-batch:labels"
      description={S.labelsHelp}
    >
      <ul
        className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2"
        data-testid="labels"
      >
        {sorted.map((l) => {
          const shown =
            l.written.replace(/\s+/g, '') === l.label.replace(/\s+/g, '')
              ? l.label
              : S.labelWritten(l.written, l.label);
          return (
            <li
              key={l.key}
              className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1"
              data-testid="label-row"
              data-known={l.known || undefined}
            >
              <span className="min-w-0 flex-1 truncate text-xs" title={shown}>
                {l.known ? null : (
                  <Tooltip content={S.labelUnknown}>
                    <span className="mr-1 font-semibold text-warning" data-testid="label-unknown">
                      <span aria-hidden>？</span>
                      <span className="sr-only">{S.labelUnknown}</span>
                    </span>
                  </Tooltip>
                )}
                <span className={l.kind === 'ignore' ? 'text-muted line-through' : ''}>
                  {shown}
                </span>
              </span>
              <Select
                size="sm"
                className="w-40 shrink-0"
                aria-label={S.labelAria(l.label)}
                value={l.kind as LabelKind}
                onValueChange={(v) => setLabelKind(l.key, v as LabelKind, l.auto)}
                options={LABEL_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** 每一欄的用途（貼上試算表） */
function ColumnsField() {
  const doc = useDoc((s) => s.data);
  const columns = parsedOf(doc).columns.filter((c) => c.header);
  if (!columns.length) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="columns">
      <p className="m-0 text-xs text-muted">{S.columnsTitle}</p>
      <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2">
        {columns.map((c) => (
          <li
            key={c.index}
            className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1"
          >
            <span
              className={`min-w-0 flex-1 truncate text-xs ${c.kind === 'ignore' ? 'text-muted line-through' : ''}`}
              title={c.header}
            >
              {c.header}
            </span>
            <Select
              size="sm"
              className="w-40 shrink-0"
              aria-label={S.columnAria(c.header)}
              value={c.kind}
              onValueChange={(v) => setColumnKind(c.header, v as ColumnKind, c.auto)}
              options={COLUMN_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Help({ mode }: { mode: InputMode }) {
  const open = usePrefs((s) => s.data.helpOpen);
  return (
    <Section
      title={S.helpTitle}
      open={open}
      onOpenChange={(v) => usePrefs.getState().patch({ helpOpen: v })}
    >
      {mode === 'memo' ? (
        <div className="flex flex-col gap-2 text-xs leading-relaxed text-muted" data-testid="help">
          <p className="m-0">{S.memoHelp.lead}</p>
          <ul className="m-0 list-disc pl-5">
            {S.memoHelp.rules.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="m-0">{S.memoHelp.paste}</p>
          <ul className="m-0 list-disc pl-5">
            {S.memoHelp.fix.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="m-0 text-xs leading-relaxed text-muted" data-testid="help">
          {S.tableHelp}
        </p>
      )}
    </Section>
  );
}

function PasteSection() {
  const pasted = useDoc((s) => s.data.pasted.length);
  const edited = useDoc((s) => !!s.data.edited);
  const confirm = useConfirm();
  const [text, setTextValue] = useState('');
  const clear = async () => {
    if (
      await confirm({
        title: S.pasteClearTitle(pasted),
        confirmLabel: S.pasteClearConfirm,
        danger: true,
      })
    ) {
      clearPasted();
    }
  };
  return (
    <Section
      title={
        <span>
          {S.pasteTitle}
          {pasted ? (
            <span className="ml-2 text-xs font-normal text-muted" data-testid="paste-info">
              {S.pasteSummary(pasted)}
            </span>
          ) : null}
        </span>
      }
      defaultOpen={false}
      persistKey="ccfolia-batch:paste"
      description={S.pasteHelp}
    >
      <TextArea
        aria-label={S.pasteAria}
        data-testid="paste-json"
        rows={4}
        spellCheck={false}
        autoComplete="off"
        placeholder={S.pastePlaceholder}
        value={text}
        onChange={(e) => setTextValue(e.target.value)}
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          icon={<ClipboardPaste />}
          onClick={() => {
            if (addPasted(text)) setTextValue('');
          }}
        >
          {S.pasteAdd}
        </Button>
        {pasted && !edited ? (
          <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => void clear()}>
            {S.pasteClear}
          </Button>
        ) : null}
      </div>
      <StatusLine area="paste" />
    </Section>
  );
}

export function InputPanel({ textRef }: { textRef?: Ref<HTMLTextAreaElement> }) {
  const doc = useDoc((s) => s.data);
  const confirm = useConfirm();
  const escRef = useRef(false);
  const { opts, mode } = doc;
  const locked = !!doc.edited;
  const warnings = warningsOf(doc);

  const fill = async () => {
    if (
      hasInput(doc) &&
      !(await confirm({ title: S.sampleTitle, confirmLabel: S.sampleConfirm }))
    ) {
      return;
    }
    if (
      doc.edited &&
      !(await confirm({ title: S.sampleEditedTitle, confirmLabel: S.sampleConfirm, danger: true }))
    ) {
      return;
    }
    fillSample();
  };

  const switchMode = async (next: InputMode) => {
    if (next === mode) return;
    if (
      doc.edited &&
      !(await confirm({
        title: S.modeSwitchTitle,
        confirmLabel: S.modeSwitchConfirm,
        danger: true,
      }))
    ) {
      return;
    }
    setMode(next);
  };

  /* 表格欄：Tab 輸入 Tab（換下一格）；Shift＋Tab 或先按 Esc 再按 Tab 離開 */
  const onTableKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      escRef.current = true;
      return;
    }
    const plainTab =
      e.key === 'Tab' &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.nativeEvent.isComposing;
    if (plainTab && !escRef.current && !locked) {
      e.preventDefault();
      const el = e.currentTarget;
      el.setRangeText('\t', el.selectionStart, el.selectionEnd, 'end');
      setText(el.value);
    }
    escRef.current = false;
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section
        title={<span id="ccfolia-batch-input-title">{S.inputTitle}</span>}
        fixed
        actions={
          <Button size="sm" icon={<Sparkles />} onClick={() => void fill()}>
            {S.fillSample}
          </Button>
        }
      >
        <Segmented
          aria-label={S.modeLabel}
          fullWidth
          value={mode}
          onValueChange={(m) => void switchMode(m)}
          options={MODES.map((m) => ({ value: m, label: S.modes[m].label }))}
        />
        <p className="m-0 -mt-1 text-xs text-muted" data-testid="mode-hint">
          {S.modes[mode].hint}
        </p>
        {locked ? (
          <Notice tone="info">
            <span data-testid="input-locked">{S.locked}</span>
          </Notice>
        ) : null}
        {mode === 'memo' ? (
          <TextArea
            ref={textRef}
            aria-label={S.memoAria}
            data-testid="memo"
            rows={12}
            spellCheck={false}
            autoComplete="off"
            readOnly={locked}
            placeholder={S.memoPlaceholder}
            value={doc.memo}
            onChange={(e) => setText(e.target.value)}
            className="font-mono text-xs leading-relaxed"
          />
        ) : (
          <>
            <TextArea
              ref={textRef}
              aria-label={S.tableAria}
              aria-describedby="ccfolia-batch-tab-hint"
              data-testid="table"
              rows={10}
              spellCheck={false}
              autoComplete="off"
              wrap="off"
              readOnly={locked}
              placeholder={S.tablePlaceholder}
              value={doc.table}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onTableKey}
              onBlur={() => {
                escRef.current = false;
              }}
              className="font-mono text-xs leading-relaxed"
            />
            <p id="ccfolia-batch-tab-hint" className="m-0 -mt-1 text-xs text-muted">
              {S.tableTabHint}
            </p>
          </>
        )}
        {mode === 'memo' ? (
          <div className="flex min-w-0 flex-col gap-2" data-testid="memo-options">
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label={S.roll}>
                <Select
                  value={opts.roll}
                  onValueChange={(v) => setOpts({ roll: v as RollStyle })}
                  options={ROLL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </Field>
              <Field label={S.suffix}>
                <Select
                  value={opts.suffix}
                  onValueChange={(v) => setOpts({ suffix: v as SuffixStyle })}
                  options={SUFFIXES.map((v) => ({ value: v, label: S.suffixOptions[v] }))}
                />
              </Field>
            </div>
            <Field label={S.secretRoll} layout="inline">
              <Toggle
                checked={opts.secretRoll}
                onCheckedChange={(v) => setOpts({ secretRoll: v })}
              />
            </Field>
            <Field label={S.proseToMemo} layout="inline">
              <Toggle
                checked={opts.proseToMemo}
                onCheckedChange={(v) => setOpts({ proseToMemo: v })}
              />
            </Field>
            <Field label={S.abilityChecks} layout="inline">
              <Toggle
                checked={opts.abilityChecks}
                onCheckedChange={(v) => setOpts({ abilityChecks: v })}
              />
            </Field>
          </div>
        ) : (
          <ColumnsField />
        )}
        {warnings.length ? (
          <Notice tone="warning">
            <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="warnings">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </Section>
      <Help mode={mode} />
      {mode === 'memo' ? <LabelsSection /> : null}
      <PasteSection />
    </div>
  );
}
