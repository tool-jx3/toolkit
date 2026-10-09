/**
 * 遊戲面板（規格 1.6、1.7）：狀態（眉標、主文、說明）＋主要按鈕、名次按鈕（揭曉時）、出場順序、
 * 完成後的下載列（解析度、附上沒出場的角色、PNG、WebP、同樣設定再玩一次）與沒出場的角色。
 */
import { Download, ImageDown, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { downloadBlob } from '@/core/files';
import { Button, Checkbox, cn, Select, ThumbnailImage, useConfirm, useToast } from '@/ui';
import { commitPending, drawNext, pickRank, restartGame, startGame } from './game';
import {
  appearanceOrder,
  characterById,
  fileNamePart,
  filledCount,
  missingCharacters,
  type RankCharacter,
  type StartProblem,
} from './model';
import { ExportSizeError, placeholderThumb, renderImage } from './render';
import {
  configNow,
  imageOf,
  isNarrow,
  runNow,
  setTab,
  thumbOf,
  useConfig,
  useGame,
  useSession,
} from './store';
import { S } from './strings';

const narrow = isNarrow;

/** 開始前的檢查沒過：通知、切到對應的分頁、焦點移到要改的欄位 */
export function useProblemReporter() {
  const toast = useToast();
  return (p: StartProblem | null) => {
    if (!p) {
      /* 窄畫面開始時進入播放畫面，捲到最上面 */
      if (useSession.getState().focus && narrow())
        requestAnimationFrame(() => window.scrollTo(0, 0));
      return;
    }
    toast({ title: S.problems[p.kind], tone: 'danger' });
    useSession.setState({ focus: false });
    setTab(p.tab);
    const selector =
      p.kind === 'name'
        ? '[data-field="name"]'
        : p.kind === 'subject'
          ? '[data-field="subject"]'
          : p.kind === 'unnamed'
            ? `[data-char-name="${p.id}"]`
            : p.kind === 'slots'
              ? '[data-field="slots"] input'
              : null;
    if (!selector) return;
    /* 分頁換好之後才找得到欄位 */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus()),
    );
  };
}

/** 下載排行榜（PNG／WebP）；解析度與附錄的設定在 useSession */
export function useExporter() {
  const toast = useToast();
  return async (type: 'image/png' | 'image/webp') => {
    const run = runNow();
    if (run?.phase !== 'complete' || useSession.getState().exporting) return;
    const { exportScale, includeMissing } = useSession.getState();
    useSession.setState({ exporting: true });
    try {
      const c = configNow();
      const r = await renderImage(
        { config: c, run, spinId: null, thumb: thumbOf, portrait: imageOf(c.portrait.photo?.id) },
        { scale: exportScale, includeMissing, type },
      );
      downloadBlob(r.blob, S.fileName(fileNamePart(c.name), fileNamePart(c.subject), r.ext));
      if (type === 'image/webp' && r.ext !== 'webp')
        toast({ title: S.webpFallback, tone: 'warning' });
      toast({ title: S.downloaded(r.width, r.height, r.ext), tone: 'success' });
    } catch (e) {
      toast({
        title: e instanceof ExportSizeError ? S.exportTooLarge : S.exportFailed,
        tone: 'danger',
      });
    } finally {
      useSession.setState({ exporting: false });
    }
  };
}

/** 小縮圖（裁切圖或名字卡） */
export function CharThumb({ ch, size = 24 }: { ch: RankCharacter; size?: number }) {
  useSession((s) => (ch.thumb ? s.images[ch.thumb] : null));
  const src = thumbOf(ch) ?? placeholderThumb(ch.name);
  return (
    <span
      className="inline-block shrink-0 overflow-hidden rounded-sm bg-surface-3"
      style={{ width: size, height: size }}
    >
      <ThumbnailImage source={src} fit="cover" />
    </span>
  );
}

function Status() {
  const c = useConfig((s) => s.data);
  const run = useGame((s) => s.data.run);
  const exporting = useSession((s) => s.exporting);
  const report = useProblemReporter();
  const exporter = useExporter();
  const n = c.characters.length;
  const k = c.slots;
  let eyebrow: string = S.status.eyebrowIdle;
  let main: string = S.status.idle;
  let help: string = S.status.idleHelp(n, k);
  let action: string = S.status.start;
  let disabled = false;
  let onClick: () => void = () => report(startGame(narrow()));
  if (run) {
    const current = characterById(c, run.deck[run.turn]);
    eyebrow = S.status.eyebrow(run.turn, k);
    if (run.phase === 'spinning') {
      main = S.status.spinning;
      help = S.status.spinningHelp;
      action = S.status.spinningAction;
      disabled = true;
    } else if (run.phase === 'revealed') {
      const name = current?.name ?? '';
      if (run.pending === null) {
        main = S.status.revealed(name);
        help = S.status.revealedHelp;
        action = S.status.choose;
        disabled = true;
      } else {
        main = S.status.pending(name, run.pending);
        help = S.status.pendingHelp;
        action = S.status.commit(run.pending);
      }
      onClick = () => commitPending();
    } else if (run.phase === 'between') {
      main = S.status.between(characterById(c, run.lastId)?.name ?? S.fallbackName);
      help = S.status.betweenHelp(filledCount(run), k);
      action = c.autoNext ? S.status.nextAuto : S.status.next;
      onClick = () => drawNext();
    } else {
      eyebrow = S.status.eyebrowDone;
      main = S.status.done;
      help = S.status.doneHelp(n, k);
      action = S.status.download;
      disabled = exporting;
      onClick = () => void exporter('image/png');
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        className="min-w-0 flex-1 basis-56"
        aria-live="polite"
        aria-atomic="true"
        data-testid="status"
      >
        <p
          className="m-0 text-xs font-bold tracking-wider text-accent"
          data-testid="status-eyebrow"
        >
          {eyebrow}
        </p>
        <p
          className="m-0 text-base font-semibold [overflow-wrap:anywhere]"
          data-testid="status-text"
        >
          {main}
        </p>
        <p className="m-0 text-xs text-muted" data-testid="status-help">
          {help}
        </p>
      </div>
      <Button
        variant="primary"
        size="lg"
        className="min-w-40"
        onClick={onClick}
        disabled={disabled}
        loading={run?.phase === 'complete' && exporting}
        data-testid="main-action"
      >
        {action}
      </Button>
    </div>
  );
}

function RankChoices() {
  const c = useConfig((s) => s.data);
  const run = useGame((s) => s.data.run);
  const toast = useToast();
  if (run?.phase !== 'revealed') return null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一組名次按鈕
    <div
      role="group"
      aria-label={S.ranksLabel}
      className="grid grid-cols-5 gap-1.5"
      data-testid="rank-choices"
    >
      {run.ranks.map((entry, i) => {
        const name = entry ? (characterById(c, entry.id)?.name ?? '') : null;
        const selected = run.pending === i;
        return (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: 名次固定
            key={i}
            type="button"
            disabled={!!entry}
            aria-pressed={selected}
            aria-label={S.rankChoiceAria(i, name)}
            data-rank={i}
            onClick={() => {
              if (pickRank(i) === 'filled') toast({ title: S.filledToast, tone: 'info' });
            }}
            className={cn(
              'focus-visible:focus-ring flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md border px-1 py-1.5 text-xs transition-colors',
              selected
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border bg-surface hover:bg-surface-3',
              entry && 'cursor-not-allowed opacity-50',
            )}
          >
            <strong className="font-semibold">{S.rankChoice(i)}</strong>
            {name ? <small className="block max-w-full truncate text-[11px]">{name}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

function Order() {
  const c = useConfig((s) => s.data);
  const run = useGame((s) => s.data.run);
  if (!run) return null;
  const order = appearanceOrder(c, run);
  return (
    <section
      aria-labelledby="rc-order-title"
      className="rounded-md border border-border bg-surface-2 px-3 py-2"
      data-testid="appearance"
    >
      <h3 id="rc-order-title" className="m-0 mb-1 text-xs font-semibold text-muted">
        {S.orderTitle}
      </h3>
      <p
        className="m-0 text-sm font-medium whitespace-pre-wrap [overflow-wrap:anywhere]"
        aria-live="polite"
        aria-atomic="true"
        data-testid="appearance-order"
      >
        {order.length ? order.map((ch) => ch.name).join(' > ') : S.orderWaiting}
      </p>
    </section>
  );
}

function ExportBar() {
  const c = useConfig((s) => s.data);
  const run = useGame((s) => s.data.run);
  const scale = useSession((s) => s.exportScale);
  const includeMissing = useSession((s) => s.includeMissing);
  const exporting = useSession((s) => s.exporting);
  const exporter = useExporter();
  const confirm = useConfirm();
  const report = useProblemReporter();
  const [open, setOpen] = useState(false);
  if (run?.phase !== 'complete') return null;
  const missing = missingCharacters(c, run);
  return (
    <section
      aria-label={S.exportTitle}
      className="flex flex-col gap-2 border-t border-border pt-3"
      data-testid="export-bar"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select<'1' | '2'>
          aria-label={S.scale}
          size="sm"
          value={String(scale) as '1' | '2'}
          onValueChange={(v) => useSession.setState({ exportScale: v === '2' ? 2 : 1 })}
          options={[
            { value: '1', label: S.scales[1] },
            { value: '2', label: S.scales[2] },
          ]}
        />
        <Checkbox
          checked={includeMissing && missing.length > 0}
          disabled={!missing.length}
          onCheckedChange={(v) => useSession.setState({ includeMissing: v })}
          label={S.includeMissing}
        />
        <Button
          size="sm"
          variant="primary"
          icon={<Download />}
          disabled={exporting}
          onClick={() => void exporter('image/png')}
        >
          {S.downloadPng}
        </Button>
        <Button
          size="sm"
          icon={<ImageDown />}
          disabled={exporting}
          onClick={() => void exporter('image/webp')}
        >
          {S.downloadWebp}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          icon={<RotateCcw />}
          disabled={exporting}
          onClick={async () => {
            if (
              runNow()?.phase !== 'complete' &&
              !(await confirm({
                title: S.newGameTitle,
                description: S.newGameText,
                confirmLabel: S.newGameConfirm,
              }))
            )
              return;
            report(restartGame(narrow()));
          }}
        >
          {S.newGame}
        </Button>
      </div>
      {missing.length ? (
        <details
          open={open}
          onToggle={(e) => setOpen(e.currentTarget.open)}
          className="text-xs"
          data-testid="missing"
        >
          <summary className="cursor-pointer font-medium text-muted">
            {S.missingSummary(missing.length)}
          </summary>
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
            {missing.map((ch) => (
              <li
                key={ch.id}
                className="flex items-center gap-1.5 rounded-sm bg-surface-2 py-1 pr-2 pl-1"
                data-testid="missing-chip"
              >
                <CharThumb ch={ch} />
                <span>{ch.name}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export function PlayPanel() {
  return (
    <section
      aria-label={S.playLabel}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
      data-testid="play-panel"
    >
      <Status />
      <RankChoices />
      <Order />
      <ExportBar />
    </section>
  );
}
