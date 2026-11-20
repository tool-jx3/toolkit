/**
 * 選取的棋子在 CCFOLIA 上大概的樣子（規格 F34）：盤面左上的狀態一覽（頭像、先攻值、狀態條）、盤面上的棋子與大小、
 * 參數、差分、聊天面板；從輸入讀到的棋子另外列出原文每一行讀成什麼（F35）。
 */
import { cn } from '@/ui';
import type { PieceView } from './derived';
import type { ReadPiece } from './memo';
import { Thumb, useImageSrc } from './parts';
import { chipText, S, SOURCE_STATE } from './strings';

function StatusCard({ view }: { view: PieceView }) {
  const c = view.piece;
  const { src } = useImageSrc(view.portrait);
  const notes: string[] = [];
  if (!view.active) notes.push(S.notOnBoard);
  else if (view.hideStatus) notes.push(S.notListed);
  if (view.secret) notes.push(S.secretNote);
  if (c.invisible) notes.push(S.invisibleNote);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div
        className={cn(
          'flex min-w-0 max-w-72 gap-2 rounded-md bg-[rgba(0,0,0,0.72)] p-2 text-[#fff]',
          (view.hideStatus || !view.active) && 'opacity-50',
        )}
        data-testid="mock-item"
      >
        <div className="relative size-12 shrink-0">
          <div className="size-12 overflow-hidden rounded-sm bg-[#555]">
            {src ? <img src={src} alt="" className="size-full object-cover object-top" /> : null}
          </div>
          <span
            className="absolute -top-1.5 -left-1.5 min-w-5 rounded-full bg-[#2196f3] px-1 text-center text-[11px] leading-5 font-semibold"
            title={S.previewInitiative}
            data-testid="mock-initiative"
          >
            {c.initiative}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1" data-testid="mock-bars">
          <span className="truncate text-xs font-semibold">{c.name || S.noNameRow}</span>
          {c.status.map((s, i) => {
            const ratio = s.max ? Math.max(0, Math.min(1, s.value / s.max)) : 0;
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: 狀態列沒有 id，位置就是它的身分
                key={i}
                className="relative h-4 overflow-hidden rounded-sm bg-[rgba(255,255,255,0.18)] text-[11px] leading-4"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-[#4caf50]"
                  style={{ width: `${ratio * 100}%` }}
                />
                <div className="relative flex justify-between gap-2 px-1">
                  <span className="truncate">{s.label}</span>
                  <span className="tabular-nums">{s.max ? `${s.value}/${s.max}` : s.value}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {notes.length ? (
        <p className="m-0 text-xs text-muted" data-testid="mock-note">
          {notes.join('・')}
        </p>
      ) : null}
    </div>
  );
}

function BoardPiece({ view }: { view: PieceView }) {
  const { src } = useImageSrc(view.portrait);
  const px = Math.min(view.size, 12) * 24 * 0.75;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex min-h-24 min-w-24 items-center justify-center rounded-md border border-border bg-surface-2 p-2 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:18px_18px]"
        data-testid="mock-board"
      >
        <div
          className={cn(
            'flex items-end justify-center overflow-hidden text-center text-[10px] text-muted',
            !view.active && 'opacity-40',
          )}
          style={{ width: px, height: px }}
          data-testid="mock-piece"
        >
          {src ? (
            <img src={src} alt={S.pieceAlt(view.piece.name)} className="size-full object-contain" />
          ) : (
            <span className="self-center">{S.noImage}</span>
          )}
        </div>
      </div>
      <span className="text-xs text-muted" data-testid="mock-size">
        {S.pieceSize(view.size)}
      </span>
    </div>
  );
}

export function Preview({ view }: { view: PieceView | null }) {
  if (!view) {
    return (
      <p
        className="m-0 rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted"
        data-testid="preview-empty"
      >
        {S.previewEmpty}
      </p>
    );
  }
  const params = view.piece.params.filter((p) => p.label);
  return (
    <section
      aria-label={S.previewAria(view.piece.name || S.noNameRow)}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3"
      data-testid="preview"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <StatusCard view={view} />
        <BoardPiece view={view} />
      </div>
      <dl className="m-0 flex min-w-0 flex-col gap-2 text-xs">
        {params.length ? (
          <div>
            <dt className="text-muted">{S.detailParams}</dt>
            <dd className="m-0 break-words" data-testid="mock-params">
              {params.map((p) => `${p.label} ${p.value}`).join('　')}
            </dd>
          </div>
        ) : null}
        {view.faces.length ? (
          <div>
            <dt className="text-muted">{S.detailFaces}</dt>
            <dd className="m-0">
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" data-testid="mock-faces">
                {view.faces.map((f) => (
                  <li
                    key={`${f.auto}-${f.index}-${f.label}`}
                    className="flex w-14 flex-col gap-0.5"
                  >
                    <Thumb image={f.image} className="h-14 w-14" />
                    <span className="truncate text-center">{f.label || S.noNameRow}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        {view.commands ? (
          <div>
            <dt className="text-muted">{S.detailPalette}</dt>
            <dd className="m-0">
              <pre
                className="m-0 max-h-48 overflow-auto rounded-md bg-surface p-2 font-mono text-xs whitespace-pre-wrap break-all"
                data-testid="mock-palette"
              >
                {view.commands}
              </pre>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

/** 原文的每一行讀成了什麼（讀不出的數字標成警告色） */
export function SourceView({ piece }: { piece: ReadPiece }) {
  return (
    <details open className="rounded-lg border border-border bg-surface" data-testid="source">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">{S.sourceTitle}</summary>
      <ol className="m-0 flex list-none flex-col p-0 pb-1" aria-label={S.sourceAria}>
        {piece.source.map((src) => (
          <li
            key={src.line}
            className={cn(
              'grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 gap-y-1 border-t border-border px-3 py-1.5 text-xs sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)]',
              (src.state === 'partial' || src.state === 'unread') && 'bg-warning-soft',
            )}
            data-testid="source-line"
            data-state={src.state}
          >
            <span className="text-muted tabular-nums">{src.line}</span>
            <span className="min-w-0 break-all whitespace-pre-wrap">{src.text}</span>
            <span className="col-start-2 flex min-w-0 flex-wrap gap-1 sm:col-start-auto">
              {src.read.length ? (
                src.read.map((r, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: 同一行的讀法沒有 id
                    key={i}
                    className={cn(
                      'rounded-sm border px-1 leading-5',
                      r.t === 'miss'
                        ? 'border-warning text-warning'
                        : 'border-border-strong text-fg',
                    )}
                    data-testid="chip"
                    data-miss={r.t === 'miss' || undefined}
                  >
                    {chipText(r)}
                  </span>
                ))
              ) : (
                <span className="rounded-sm border border-dashed border-border px-1 leading-5 text-muted">
                  {SOURCE_STATE[src.state] || SOURCE_STATE.skip}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
