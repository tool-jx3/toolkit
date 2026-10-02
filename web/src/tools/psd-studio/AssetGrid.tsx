/**
 * 圖片清單（F17）：縮圖格（依寬度自動排列）；每格是調色後的低解析度縮圖（透明處棋盤格）、名稱（滑過看完整名稱）、
 * 尺寸與種類；角標：APNG、PSD、隱藏、個別調整。點一下＝選取並開啟單圖檢視器。
 */
import { cn } from '@/ui';
import { isAssetAdjustActive } from './adjust';
import type { Asset, Mode } from './store';
import { S } from './strings';
import { ThumbCanvas } from './ThumbCanvas';

export function kindText(a: Asset, mode: Mode): string {
  if (a.apng) return S.kindFrames(a.frames);
  if (mode === 'psd') return S.kindLayer;
  return S.kindStatic;
}

function Badge({ children, tone }: { children: string; tone: 'accent' | 'muted' | 'warning' }) {
  return (
    <span
      className={cn(
        'rounded-sm px-1 py-px text-[11px] leading-4 font-semibold shadow-1',
        tone === 'accent' && 'bg-accent text-accent-contrast',
        tone === 'muted' && 'bg-surface-3 text-fg',
        tone === 'warning' && 'bg-warning text-warning-contrast',
      )}
    >
      {children}
    </span>
  );
}

export function AssetGrid({
  assets,
  mode,
  isVisible,
  selectedId,
  onOpen,
}: {
  assets: readonly Asset[];
  mode: Mode;
  isVisible: (a: Asset) => boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <ul
      aria-label={S.listLabel}
      data-testid="asset-grid"
      className="m-0 grid list-none gap-2 p-0"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(132px, 100%), 1fr))' }}
    >
      {assets.map((a) => {
        const selected = a.id === selectedId;
        const hidden = !isVisible(a);
        return (
          <li key={a.id} data-testid="asset-tile" data-asset={a.id} data-name={a.name}>
            <button
              type="button"
              aria-current={selected || undefined}
              aria-label={S.tileOpen(a.label)}
              title={a.name}
              onClick={() => onOpen(a.id)}
              className={cn(
                'flex w-full min-w-0 flex-col gap-1 rounded-md border p-1.5 text-left outline-none focus-visible:focus-ring',
                selected
                  ? 'border-accent bg-accent-soft'
                  : 'border-border bg-surface hover:bg-surface-2',
                hidden && 'opacity-60',
              )}
            >
              <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm bg-surface-2">
                <ThumbCanvas assetId={a.id} testId="tile-thumb" />
                <div className="absolute top-1 left-1 flex flex-wrap gap-1">
                  {a.apng ? <Badge tone="accent">{S.badgeApng}</Badge> : null}
                  {mode === 'psd' && !a.apng ? <Badge tone="accent">{S.badgePsd}</Badge> : null}
                  {hidden ? <Badge tone="muted">{S.badgeHidden}</Badge> : null}
                  {isAssetAdjustActive(a.adjust) ? (
                    <Badge tone="warning">{S.badgeAdjusted}</Badge>
                  ) : null}
                </div>
              </div>
              <span className="truncate text-xs text-fg" data-testid="tile-name">
                {a.label}
              </span>
              <span className="flex justify-between gap-1 text-xs text-muted">
                <span data-testid="tile-size">
                  {a.width}×{a.height}
                </span>
                <span>{kindText(a, mode)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
