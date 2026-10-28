/**
 * 主欄：拖放區（F01）、批次的操作列與總計（F14、F24、F29）、檔案清單（F02、F05、F22、F24～F28、F31）。
 */
import {
  Download,
  FileUp,
  Play,
  RotateCw,
  SplitSquareHorizontal,
  Square,
  Trash2,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { diagnosticText, fileFields } from '@/core/diagnostics';
import { formatBytes } from '@/core/files';
import { missingPdfFeatures, type Progress } from '@/core/pdf';
import {
  Button,
  CopyDiagnostics,
  FileDrop,
  Notice,
  ProgressBar,
  TextInput,
  ThumbnailList,
  useConfirm,
} from '@/ui';
import {
  addFiles,
  cancelAll,
  clearAll,
  downloadOne,
  downloadZip,
  finishedItems,
  removeItem,
  retry,
  startAll,
  submitPassword,
} from './actions';
import { keptReason, needsWork, resultLines, savedPercent, settingsKey, sizeLine } from './logic';
import { currentSettings, type Item, useQueue, useSettings } from './store';
import { S } from './strings';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** 沒有縮圖時（讀不出來）的圖：一張紙 */
const PAPER = svgUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M16 6h22l10 10v42H16z" fill="#f4f4f5" stroke="#9ca3af" stroke-width="2"/><path d="M38 6v10h10" fill="none" stroke="#9ca3af" stroke-width="2"/><text x="32" y="44" font-size="11" text-anchor="middle" fill="#6b7280" font-family="sans-serif">PDF</text></svg>',
);
/** 要密碼的檔案：鎖頭 */
const LOCK = svgUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="16" y="28" width="32" height="24" rx="4" fill="#f4f4f5" stroke="#9ca3af" stroke-width="2"/><path d="M23 28v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#9ca3af" stroke-width="2"/><circle cx="32" cy="40" r="3" fill="#9ca3af"/></svg>',
);

function stageText(p: Progress | null): string {
  if (!p) return S.stages.inspect;
  const label = S.stages[p.stage];
  if ((p.stage === 'images' || p.stage === 'raster') && p.total) {
    return S.stageCount(
      label,
      p.done ?? 0,
      p.total,
      p.stage === 'images' ? S.unitImage : S.unitPage,
    );
  }
  return `${label}…`;
}

function progressValue(p: Progress | null): number | null {
  if (!p?.total) return null;
  return Math.min(1, (p.done ?? 0) / p.total);
}

function PasswordForm({ item }: { item: Item }) {
  const [pw, setPw] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void submitPassword(item.id, pw);
  };
  return (
    <form className="flex flex-col gap-1" onSubmit={submit}>
      <p className="m-0 text-xs text-muted">{S.passwordNeeded}</p>
      <div className="flex gap-1.5">
        <TextInput
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={S.passwordLabel(item.name)}
          value={pw}
          invalid={item.passwordWrong}
          onChange={(e) => setPw(e.target.value)}
          className="min-w-0 flex-1"
          data-testid="password"
        />
        <Button type="submit" size="sm" disabled={!pw}>
          {S.passwordSubmit}
        </Button>
      </div>
      {item.passwordWrong ? (
        <p className="m-0 text-xs text-danger" role="alert">
          {S.passwordWrong}
        </p>
      ) : null}
    </form>
  );
}

function ErrorBlock({ item }: { item: Item }) {
  const err = item.error;
  const [diag, setDiag] = useState<string | null>(null);
  const level = item.level;
  useEffect(() => {
    if (!err) return;
    let alive = true;
    void diagnosticText({
      tool: S.diagnostics,
      summary: S.errors[err.kind],
      items: [
        {
          title: S.diagFile,
          fields: [
            ['檔名', item.name],
            ...fileFields(item.file),
            ...(level ? ([[S.diagLevel, S.levels[level]]] as const) : []),
            [S.diagKind, err.kind],
            ...(err.detail ? ([[S.diagDetail, err.detail]] as const) : []),
          ],
        },
      ],
    }).then((t) => {
      if (alive) setDiag(t);
    });
    return () => {
      alive = false;
    };
  }, [err, item.name, item.file, level]);
  if (!err) return null;
  return (
    <div className="flex flex-col gap-1" data-testid="item-error">
      <p className="m-0 text-sm text-danger" role="alert">
        {S.errors[err.kind]}
      </p>
      {/* 頁數超過的 detail 是頁數，不是引擎的訊息 */}
      {err.detail && err.kind !== 'aborted' && err.kind !== 'too-many-pages' ? (
        <p className="m-0 break-all text-xs text-muted">{S.engineSaid(err.detail)}</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {/* 讀不到的檔案重試也一樣讀不到：只留移除（右上角）與說明 */}
        {err.kind !== 'unreadable' ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCw />}
            onClick={() => void retry(item.id)}
          >
            {S.retry}
          </Button>
        ) : null}
        {diag ? <CopyDiagnostics text={diag} /> : null}
      </div>
    </div>
  );
}

function ResultBlock({
  item,
  onCompare,
  stale,
}: {
  item: Item;
  onCompare: (id: string) => void;
  stale: boolean;
}) {
  const r = item.report;
  if (!r) return null;
  const level = item.level ?? 'balanced';
  const kept = item.state === 'kept';
  return (
    <div className="flex flex-col gap-1" data-testid="item-result" data-kept={kept || undefined}>
      {kept ? (
        <>
          <p className="m-0 text-sm font-semibold">{S.keptTitle}</p>
          <p className="m-0 text-xs text-muted">{keptReason(r, level)}</p>
        </>
      ) : (
        <p className="m-0 text-sm font-semibold tabular-nums" data-testid="item-sizes">
          {sizeLine(r.originalBytes, r.outputBytes)}
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-muted">
        {resultLines(r, level).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {stale ? <p className="m-0 text-xs text-warning">{S.stale}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          icon={<Download />}
          onClick={() => downloadOne(item.id)}
          data-testid="download"
        >
          {kept ? S.downloadOriginal : S.download}
        </Button>
        {!kept ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<SplitSquareHorizontal />}
            onClick={() => onCompare(item.id)}
          >
            {S.compare}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RowBody(props: { item: Item; onCompare: (id: string) => void; keyNow: string }) {
  const { item } = props;
  const hint =
    item.missingFonts.length && item.state !== 'password' && item.state !== 'error' ? (
      <p className="m-0 text-xs text-muted" data-testid="fonts-hint">
        {S.fontsHint}
      </p>
    ) : null;
  return (
    <>
      <RowState {...props} />
      {hint}
    </>
  );
}

function RowState({
  item,
  onCompare,
  keyNow,
}: {
  item: Item;
  onCompare: (id: string) => void;
  keyNow: string;
}) {
  switch (item.state) {
    case 'probing':
      return <p className="m-0 text-xs text-muted">{S.probing}</p>;
    case 'password':
      return <PasswordForm item={item} />;
    case 'ready':
      return <p className="m-0 text-xs text-muted">{S.waiting}</p>;
    case 'running':
      return (
        <div className="flex flex-col gap-1">
          <ProgressBar value={progressValue(item.progress)} label={S.progressLabel(item.name)} />
          <p className="m-0 text-xs text-muted" data-testid="item-stage">
            {stageText(item.progress)}
          </p>
        </div>
      );
    case 'done':
    case 'kept':
      return <ResultBlock item={item} onCompare={onCompare} stale={item.key !== keyNow} />;
    case 'error':
      return <ErrorBlock item={item} />;
  }
}

export function MainColumn({ onCompare }: { onCompare: (id: string) => void }) {
  const items = useQueue((q) => q.items);
  const running = useQueue((q) => q.running);
  const batch = useQueue((q) => q.batch);
  const note = useQueue((q) => q.note);
  const announce = useQueue((q) => q.announce);
  /* 設定改了要重算哪些列要壓 */
  useSettings((st) => st.data);
  const keyNow = settingsKey(currentSettings());
  const todo = items.filter((it) =>
    needsWork({ state: it.state, key: it.key, errorKind: it.error?.kind ?? null }, keyNow),
  ).length;
  const finished = finishedItems(items);
  const confirm = useConfirm();
  const totalIn = finished.reduce((a, it) => a + (it.report?.originalBytes ?? 0), 0);
  const totalOut = finished.reduce((a, it) => a + (it.report?.outputBytes ?? 0), 0);
  const missing = useMemo(() => missingPdfFeatures(), []);
  return (
    <div className="flex flex-col gap-3">
      {missing.length ? (
        <Notice tone="danger">
          <span data-testid="unsupported">{S.unsupported(missing.join('、'))}</span>
        </Notice>
      ) : null}
      <FileDrop
        multiple
        clickable
        readNow={false}
        disabled={missing.length > 0}
        accept="application/pdf,.pdf"
        filterByAccept={false}
        icon={<FileUp />}
        label={S.dropLabel}
        buttonLabel={S.dropButton}
        hint={S.dropHint}
        onFiles={(files) => void addFiles(files)}
      />
      <div className="flex flex-wrap items-center gap-2" data-testid="batch-bar">
        {running ? (
          <Button variant="danger" icon={<Square />} onClick={cancelAll}>
            {S.cancel}
          </Button>
        ) : (
          <Button
            icon={<Play />}
            disabled={!todo}
            onClick={() => void startAll()}
            data-testid="start"
          >
            {S.start(todo)}
          </Button>
        )}
        <Button
          variant="secondary"
          icon={<Download />}
          disabled={!finished.length}
          onClick={() => void downloadZip()}
          data-testid="zip"
        >
          {S.zip}
        </Button>
        <Button
          variant="ghost"
          icon={<Trash2 />}
          disabled={!items.length || running}
          onClick={async () => {
            if (
              await confirm({
                title: S.clearConfirm,
                description: S.clearConfirmText,
                danger: true,
                confirmLabel: S.clear,
              })
            )
              clearAll();
          }}
        >
          {S.clear}
        </Button>
        {finished.length ? (
          <span className="text-xs text-muted tabular-nums" data-testid="totals">
            {S.totals(
              finished.length,
              formatBytes(totalIn),
              formatBytes(totalOut),
              S.saved(savedPercent(totalIn, totalOut)),
            )}
          </span>
        ) : null}
      </div>
      {running && batch ? (
        <Notice tone="progress">{S.running(batch.index, batch.total)}</Notice>
      ) : note ? (
        <Notice tone={note.tone}>
          <span className="whitespace-pre-line" data-testid="note">
            {note.text}
          </span>
        </Notice>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <ThumbnailList
        aria-label={S.listLabel}
        layout="list"
        thumbSize={72}
        empty={S.listEmpty}
        items={items.map((it) => ({
          ...it,
          image:
            it.thumb ?? (it.state === 'password' ? LOCK : it.state === 'probing' ? null : PAPER),
          meta: S.meta(formatBytes(it.size), it.pages, it.encrypted, it.version),
          status:
            it.state === 'done' || it.state === 'kept'
              ? ('done' as const)
              : it.state === 'error'
                ? ('error' as const)
                : undefined,
          statusLabel:
            it.state === 'done' ? S.statusDone : it.state === 'kept' ? S.statusKept : S.statusError,
        }))}
        onRemove={removeItem}
        removeDisabled={running}
        removeLabel={(it) => S.remove(it.name)}
        renderFields={(it) => <RowBody item={it} onCompare={onCompare} keyNow={keyNow} />}
      />
    </div>
  );
}
