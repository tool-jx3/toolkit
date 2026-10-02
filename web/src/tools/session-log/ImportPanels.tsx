/**
 * 匯入：團報文字（F79、F80）、CCFOLIA・紀錄（F81～F84）、JSON（F85）分頁，以及預覽表（F86）。
 */
import { FileJson, TableProperties } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { pickFiles, readAsBytes } from '@/core/files';
import { type SessionRow, systemLabel } from '@/core/sessions';
import { Button, Field, FieldRow, FileDrop, Select, TextArea, TextInput } from '@/ui';
import { MsgLine } from './ImportSheet';
import {
  analyzeFiles,
  type CcFile,
  type CcRole,
  isZipFile,
  rowToCells,
  sessionForm,
  sessionRow,
} from './importCcfolia';
import { parseReportText } from './importReport';
import { type DupCount, sessionDupKey } from './importSheet';
import {
  ccFormRow,
  routeToSheet,
  setCcField,
  setImport,
  setSpeakerRole,
  useImport,
} from './importStore';
import { dateDisplay, parseImportJson } from './logic';
import { S } from './strings';

/** 停止輸入約 0.22 秒後解讀（F79） */
const REPORT_DELAY_MS = 220;
const PREVIEW_LIMIT = 10;

/* ---------- 預覽（F86） ---------- */

export function PreviewTable({
  rows,
  existing,
  count,
}: {
  rows: readonly SessionRow[];
  existing: ReadonlySet<string>;
  count: DupCount;
}) {
  const target = useImport((s) => s.target);
  const skipDup = useImport((s) => s.skipDup);
  if (!rows.length) return null;
  const cols = ['date', 'scenario', 'system', 'role', 'gm', 'players', 'pc'] as const;
  const head = { ...S.sheet.fields, gm: 'GM', players: 'PL', pc: 'PC', role: '身分' };
  return (
    <section className="flex flex-col gap-1.5" aria-label={S.import.previewAria}>
      <p className="m-0 text-sm" data-testid="preview-count">
        <span className="font-semibold">{S.import.preview}</span> {S.import.count(count.willImport)}
        {target === 'overwrite' ? S.import.countOverwrite : ''}
        {count.dup
          ? skipDup
            ? S.import.previewDupSkip(count.dup)
            : S.import.previewDupKeep(count.dup)
          : ''}
      </p>
      <div className="max-h-64 overflow-auto rounded-md border border-border">
        <table
          className="w-full border-separate border-spacing-0 text-xs"
          data-testid="preview-table"
        >
          <thead>
            <tr>
              <th className="sticky top-0 border-b border-border bg-surface-2 px-1.5 py-1" />
              {cols.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="sticky top-0 border-b border-border bg-surface-2 px-1.5 py-1 text-left font-semibold whitespace-nowrap text-muted"
                >
                  {head[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PREVIEW_LIMIT).map((row) => {
              const dup = existing.has(sessionDupKey(row));
              return (
                <tr
                  key={row.id}
                  data-dup={dup || undefined}
                  className={dup ? 'bg-warning-soft' : undefined}
                >
                  <td className="border-b border-border px-1.5 py-1 whitespace-nowrap text-warning">
                    {dup ? S.import.dup : ''}
                  </td>
                  {cols.map((c) => (
                    <td key={c} className="max-w-48 truncate border-b border-border px-1.5 py-1">
                      {c === 'date'
                        ? dateDisplay(row)
                        : c === 'system'
                          ? systemLabel(row.system)
                          : String(row[c] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows.length > PREVIEW_LIMIT ? (
              <tr>
                <td />
                <td colSpan={cols.length} className="px-1.5 py-1 text-muted">
                  {S.import.previewMore(rows.length - PREVIEW_LIMIT)}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- 團報文字 ---------- */

export function TextPanel({ preview }: { preview: ReactNode }) {
  const text = useImport((s) => s.reportText);
  const rows = useImport((s) => s.reportRows);
  useEffect(() => {
    const t = setTimeout(() => {
      setImport({ reportRows: text.trim() ? parseReportText(text) : null });
    }, REPORT_DELAY_MS);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">{S.import.textHint}</p>
      <Field label={S.import.textPaste}>
        <TextArea
          rows={8}
          value={text}
          placeholder={S.import.textPlaceholder}
          onChange={(e) => setImport({ reportText: e.target.value })}
        />
      </Field>
      {rows ? (
        <MsgLine
          testId="text-msg"
          msg={
            rows.length
              ? { tone: 'success', text: S.import.textParsed(rows.length) }
              : { tone: 'warning', text: S.import.textFailed }
          }
        />
      ) : null}
      {preview}
    </div>
  );
}

/* ---------- CCFOLIA・紀錄 ---------- */

async function readCcFile(f: File): Promise<CcFile> {
  const bytes = await readAsBytes(f);
  const zip = isZipFile({ name: f.name, bytes });
  return {
    name: f.name,
    text: zip ? '' : new TextDecoder().decode(bytes),
    bytes: zip ? bytes : undefined,
    mtime: f.lastModified || 0,
  };
}

const CC_ROLE_OPTIONS: readonly CcRole[] = ['pc', 'pl', 'kp', ''];
const NONE = '__none';

export function CcfoliaPanel({ preview, self }: { preview: ReactNode; self: ReadonlySet<string> }) {
  const files = useImport((s) => s.ccFiles);
  const msg = useImport((s) => s.ccMsg);
  const cc = useImport((s) => s.cc);
  const row = ccFormRow(cc);

  const load = async (list: File[]) => {
    if (!list.length) return;
    const loaded = await Promise.all(list.map(readCcFile));
    const sessions = analyzeFiles(loaded);
    const names = list.map((f) => f.name).join('、');
    if (sessions.length >= 2) {
      setImport({
        ccFiles: names,
        cc: null,
        ccMsg: { tone: 'info', text: S.import.ccMultiNote(sessions.length) },
      });
      routeToSheet(
        sessions.map((s) => rowToCells(sessionRow(s, self), self)),
        S.import.ccMulti(sessions.length),
      );
      return;
    }
    const session = sessions[0] ?? {
      base: '',
      scenario: '',
      system: '',
      dateList: [],
      fallbackDate: '',
      speakers: new Map(),
    };
    const next = sessionForm(session, self);
    setImport({
      ccFiles: names,
      cc: next,
      ccMsg: next.speakers.length
        ? { tone: 'success', text: S.import.ccFound(next.speakers.length) }
        : { tone: 'warning', text: S.import.ccNone },
    });
  };

  const field = (
    key: keyof NonNullable<typeof cc>['form'],
    label: string,
    placeholder?: string,
  ) => (
    <Field label={label}>
      <TextInput
        value={cc?.form[key] ?? ''}
        placeholder={placeholder}
        onChange={(e) => setCcField(key, e.target.value)}
      />
    </Field>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">{S.import.ccHint}</p>
      <FileDrop
        multiple
        accept=".json,.html,.htm,.txt,.zip,application/json,text/html,text/plain,application/zip"
        filterByAccept={false}
        paste="off"
        compact
        label={S.import.ccDrop}
        buttonLabel={S.import.ccPick}
        onFiles={(list) => void load(list)}
      />
      {files ? (
        <p className="m-0 text-xs text-muted" data-testid="cc-files">
          {S.import.ccFiles(files)}
        </p>
      ) : null}
      <MsgLine msg={msg} testId="cc-msg" />
      {cc ? (
        <>
          <FieldRow columns={2}>
            {field('scenario', S.import.ccScenario, S.import.ccScenarioPlaceholder)}
            <Field label={S.import.ccDate} hint={S.import.ccDateHint}>
              <TextInput
                value={cc.form.date}
                placeholder={S.import.ccDatePlaceholder}
                onChange={(e) => setCcField('date', e.target.value)}
              />
            </Field>
            {field('system', S.import.ccSystem, S.import.ccSystemPlaceholder)}
            {field('role', S.import.ccRole, S.import.ccRolePlaceholder)}
            {field('gm', S.import.ccGm, S.import.ccGmPlaceholder)}
            {field('players', S.import.ccPl, S.import.ccPlPlaceholder)}
          </FieldRow>
          {cc.speakers.length ? (
            <section className="flex flex-col gap-1.5" aria-label={S.import.ccSpeakers}>
              <h3 className="m-0 text-sm font-semibold">{S.import.ccSpeakers}</h3>
              <ul
                className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2"
                data-testid="cc-speakers"
              >
                {cc.speakers.map((s, i) => (
                  <li
                    key={s.name}
                    className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{s.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {[
                          s.fromJson ? S.import.ccPiece : '',
                          s.msgCount ? S.import.ccMessages(s.msgCount) : '',
                          s.diceCount ? S.import.ccDice(s.diceCount) : '',
                        ]
                          .filter(Boolean)
                          .join('・') || '—'}
                      </span>
                    </span>
                    <Select
                      size="sm"
                      className="w-24"
                      aria-label={S.import.ccSpeakerRole(s.name)}
                      value={s.role || NONE}
                      onValueChange={(v) =>
                        setSpeakerRole(i, (v === NONE ? '' : v) as CcRole, self)
                      }
                      options={CC_ROLE_OPTIONS.map((r) => ({
                        value: r || NONE,
                        label: S.import.ccRoles[r],
                      }))}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div>
            <Button
              variant="primary"
              size="sm"
              icon={<TableProperties />}
              disabled={!row}
              onClick={() => {
                if (row) routeToSheet([rowToCells(row, self)], S.import.ccConverted);
              }}
            >
              {S.import.ccToSheet}
            </Button>
          </div>
          {preview}
        </>
      ) : null}
    </div>
  );
}

/* ---------- JSON ---------- */

export function JsonPanel() {
  const file = useImport((s) => s.jsonFile);
  const json = useImport((s) => s.json);
  const error = useImport((s) => s.jsonError);
  const pick = async () => {
    const [f] = await pickFiles({ accept: 'application/json,.json' });
    if (!f) return;
    let payload = null;
    try {
      payload = parseImportJson(await f.text());
    } catch {
      payload = null;
    }
    setImport({ jsonFile: f.name, json: payload, jsonError: !payload });
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">{S.import.jsonHint}</p>
      <div>
        <Button size="sm" icon={<FileJson />} onClick={() => void pick()}>
          {S.import.jsonPick}
        </Button>
      </div>
      {file ? (
        <MsgLine
          testId="json-msg"
          msg={
            error || !json
              ? { tone: 'danger', text: S.import.jsonError }
              : { tone: 'success', text: S.import.jsonRows(file, json.rows.length) }
          }
        />
      ) : null}
    </div>
  );
}
