/**
 * 配置檢視的浮動面板（F30～F35）：每列有顯示／隱藏、獨顯「S」、調色後縮圖、名稱、資訊；點列＝選取（不開檢視器）。
 * 上方三個按鈕：全部顯示、全部隱藏、解除獨顯。寬畫面時浮在檢視上（可捲動），窄畫面時放在檢視下方。
 */
import { Eye, EyeOff } from 'lucide-react';
import { Button, cn, IconButton } from '@/ui';
import { fileLabel, type PanelRow } from './layout';
import type { Asset, Mode } from './store';
import { S } from './strings';
import { ThumbCanvas } from './ThumbCanvas';

export interface LayerPanelProps {
  mode: Mode;
  rows: readonly PanelRow[];
  assets: readonly Asset[];
  isVisible: (a: Asset) => boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleSolo: (id: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onUnsolo: () => void;
}

export function rowLabel(row: PanelRow, asset: Asset): string {
  if (row.kind === 'layer') return asset.label;
  const file = fileLabel(asset.name);
  if (row.kind === 'background') return S.rowName(S.background, file);
  if (row.kind === 'foreground') return S.rowName(S.foreground, file);
  return S.rowName(row.name, file);
}

export function rowInfo(row: PanelRow, asset: Asset): string {
  if (row.kind === 'layer') return `${asset.width}×${asset.height}`;
  if (row.kind === 'asset') return S.rowMeta(S.rowAsset, asset.width, asset.height);
  return S.rowMeta(S.rowZ(row.z ?? 0), asset.width, asset.height);
}

export function LayerPanel(p: LayerPanelProps) {
  const byId = new Map(p.assets.map((a) => [a.id, a]));
  const title =
    p.mode === 'room'
      ? S.panelTitle.room
      : p.mode === 'psd'
        ? S.panelTitle.psd
        : S.panelTitle.other;
  return (
    <section
      aria-label={p.mode === 'room' ? S.panelTitle.room : S.panelTitle.psd}
      data-testid="layer-panel"
      className="flex max-h-[min(60dvh,520px)] min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2 md:absolute md:top-2 md:right-2 md:z-10 md:max-h-[calc(100%-1rem)] md:w-80"
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col gap-1 border-b border-border px-2 py-1.5">
        <h3 className="m-0 text-sm font-semibold">{title}</h3>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" onClick={p.onShowAll}>
            {S.showAll}
          </Button>
          <Button size="sm" onClick={p.onHideAll}>
            {S.hideAll}
          </Button>
          <Button size="sm" onClick={p.onUnsolo}>
            {S.unsolo}
          </Button>
        </div>
      </div>
      <ul aria-label={S.panelLabel} className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-1">
        {p.rows.map((row) => {
          const a = byId.get(row.assetId);
          if (!a) return null;
          const label = rowLabel(row, a);
          const shown = p.isVisible(a);
          const selected = p.selectedId === a.id;
          return (
            <li
              key={row.key}
              data-testid="layer-row"
              data-asset={a.id}
              data-hidden={!shown || undefined}
              aria-current={selected || undefined}
              className={cn(
                'flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md border px-1 py-1 outline-none focus-visible:focus-ring',
                selected ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-surface-2',
                !shown && 'opacity-50',
              )}
              onClick={() => p.onSelect(a.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  p.onSelect(a.id);
                }
              }}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: 列可以用鍵盤選取
              tabIndex={0}
            >
              <IconButton
                size="sm"
                variant="ghost"
                label={a.visible ? S.eyeHide(label) : S.eyeShow(label)}
                icon={a.visible ? <Eye /> : <EyeOff />}
                pressed={!a.visible}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onToggleVisible(a.id);
                }}
              />
              <button
                type="button"
                aria-pressed={a.solo}
                aria-label={a.solo ? S.soloOff(label) : S.soloOn(label)}
                title={a.solo ? S.soloOff(label) : S.soloOn(label)}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onToggleSolo(a.id);
                }}
                className={cn(
                  'inline-flex size-6 shrink-0 items-center justify-center rounded-sm border text-xs font-bold outline-none focus-visible:focus-ring',
                  a.solo
                    ? 'border-accent bg-accent text-accent-contrast'
                    : 'border-border-strong text-muted hover:text-fg',
                )}
              >
                S
              </button>
              <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-2">
                <ThumbCanvas assetId={a.id} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-fg" title={label} data-testid="row-label">
                  {label}
                </div>
                <div className="truncate text-xs text-muted">{rowInfo(row, a)}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
