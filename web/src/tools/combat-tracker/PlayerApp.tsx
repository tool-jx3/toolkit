/**
 * 玩家視圖（同一頁加 `#player` 打開）：只顯示 GM 分頁送來的內容（`@/core/mirror`；已經拿掉隱藏的參戰者、GM 的備註、AC，
 * HP 依 GM 的設定），給玩家看、分享畫面或投影。字的大小與全螢幕記在這個瀏覽器（不影響 GM）。
 */
import { Maximize, Minimize } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createMirrorView, mirrorSupported } from '@/core/mirror';
import { createPreviewStore } from '@/core/storage';
import { cn, IconButton, Segmented, ThemeToggle, UiProvider } from '@/ui';
import { type PlayerRow, type PlayerSnapshot, TOOL_ID } from './model';
import { SIDE_CLASS, SIDE_STRIPE } from './Row';
import { S } from './strings';

type Size = 'md' | 'lg' | 'xl';
const usePlayerPrefs = createPreviewStore<{ size: Size }>(`${TOOL_ID}:player`, { size: 'lg' });

const SIZE_CLASS: Record<Size, string> = {
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl',
};

function Hp({ row }: { row: PlayerRow }) {
  const hp = row.hp;
  if (!hp) return null;
  if (hp.kind === 'exact')
    return (
      <span className="shrink-0 tabular-nums" data-testid="player-hp">
        {hp.hp}／{hp.max}
        {hp.temp > 0 ? (
          <span className="ml-1 text-[0.75em] text-accent">{S.player.temp(hp.temp)}</span>
        ) : null}
      </span>
    );
  return (
    <span
      className={cn(
        'shrink-0 rounded-sm px-2 py-0.5 text-[0.8em]',
        hp.level === 'full' && 'bg-success-soft text-success',
        hp.level === 'hurt' && 'bg-warning-soft text-warning',
        (hp.level === 'bloodied' || hp.level === 'down') && 'bg-danger-soft text-danger',
      )}
      data-testid="player-hp"
    >
      {S.player.rough[hp.level]}
    </span>
  );
}

function PlayerRowView({ row }: { row: PlayerRow }) {
  const out = row.status === 'down' || row.status === 'dead';
  return (
    <li
      className={cn(
        'relative flex flex-wrap items-center gap-x-4 gap-y-1 overflow-hidden rounded-lg border bg-surface py-3 pr-4 pl-5',
        row.current ? 'border-accent ring-2 ring-accent' : 'border-border',
        out && 'opacity-50',
      )}
      data-testid="player-row"
      data-current={row.current || undefined}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1.5', SIDE_STRIPE[row.side])} />
      <span className="w-[2.5em] shrink-0 text-center font-semibold tabular-nums text-muted">
        {row.init ?? '—'}
      </span>
      <span className="min-w-0 flex-1 font-semibold break-words">
        {row.name}
        <span
          className={cn(
            'ml-2 rounded-sm px-1.5 py-0.5 align-middle text-[0.6em] font-normal',
            SIDE_CLASS[row.side],
          )}
        >
          {S.side[row.side]}
        </span>
        {row.current ? (
          <span className="ml-2 rounded-sm bg-accent px-1.5 py-0.5 align-middle text-[0.6em] text-accent-contrast">
            {S.player.current}
          </span>
        ) : null}
        {row.status !== 'ok' ? (
          <span className="ml-2 rounded-sm bg-danger-soft px-1.5 py-0.5 align-middle text-[0.6em] font-normal text-danger">
            {S.status[row.status]}
          </span>
        ) : null}
      </span>
      <Hp row={row} />
      {row.conds.length ? (
        <span className="flex basis-full flex-wrap gap-1.5 pl-[3.5em] text-[0.7em]">
          {row.conds.map((k) => (
            <span
              key={k.label}
              className="rounded-full border border-border bg-surface-2 px-2 py-0.5"
            >
              {k.label}
              {k.rounds ? <span className="ml-1 text-muted">{k.rounds} 輪</span> : null}
            </span>
          ))}
        </span>
      ) : null}
    </li>
  );
}

export function PlayerApp() {
  const size = usePlayerPrefs((s) => s.data.size);
  const [snap, setSnap] = useState<PlayerSnapshot | null>(null);
  const [closed, setClosed] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    document.title = `${S.player.title}｜TRPG Toolkit`;
    const view = createMirrorView<PlayerSnapshot>(TOOL_ID, {
      state: (d) => {
        if (d && d.v === 1 && Array.isArray(d.rows)) {
          setSnap(d);
          setClosed(false);
        }
      },
      closed: () => setClosed(true),
    });
    const onVis = () => {
      if (document.visibilityState === 'visible') view.ping();
    };
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      view.close();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const current = snap?.rows.find((r) => r.current);
  return (
    <UiProvider>
      <div className="min-h-dvh bg-bg text-fg font-ui">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2">
          <h1 className="m-0 text-lg font-semibold">{S.player.title}</h1>
          {snap ? (
            <span className="text-lg tabular-nums" data-testid="player-round">
              {`第 ${snap.round} 輪`}
            </span>
          ) : null}
          {current ? (
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="text-muted">{S.player.current}：</span>
              <strong>{current.name}</strong>
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <div className="flex items-center gap-2">
            <Segmented<Size>
              aria-label={S.player.size}
              size="sm"
              value={size}
              onValueChange={(v) => usePlayerPrefs.getState().patch({ size: v })}
              options={(['md', 'lg', 'xl'] as const).map((v) => ({
                value: v,
                label: S.player.sizes[v],
              }))}
            />
            <IconButton
              label={full ? S.player.exitFullscreen : S.player.fullscreen}
              icon={full ? <Minimize /> : <Maximize />}
              onClick={toggleFull}
            />
            <ThemeToggle />
          </div>
        </header>
        <main className={cn('mx-auto flex max-w-5xl flex-col gap-3 p-4', SIZE_CLASS[size])}>
          {!mirrorSupported() ? (
            <p className="m-0 text-base text-warning">{S.player.unsupported}</p>
          ) : !snap ? (
            <p className="m-0 text-base text-muted" data-testid="player-waiting">
              {S.player.waiting}
            </p>
          ) : (
            <>
              {closed ? (
                <p className="m-0 text-sm text-warning" role="status">
                  {S.player.closed}
                </p>
              ) : null}
              {snap.rows.length ? (
                <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.player.title}>
                  {snap.rows.map((r) => (
                    <PlayerRowView key={r.id} row={r} />
                  ))}
                </ol>
              ) : (
                <p className="m-0 text-base text-muted">{S.player.empty}</p>
              )}
            </>
          )}
        </main>
      </div>
    </UiProvider>
  );
}
