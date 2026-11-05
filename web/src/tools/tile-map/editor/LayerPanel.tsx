/**
 * 圖層：最上面的圖層列在最上面（畫在最前面）。點名稱選擇畫的圖層（Ctrl／⌘ 加選、Shift 選一段；選取工具一起作用），
 * 眼睛＝顯示／隱藏、鎖頭＝鎖定，右鍵或「⋯」：不透明度、重新命名、複製、刪除；拖曳把手排序（Alt＋↑↓ 也可以）。
 */
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { type MouseEvent, useState } from 'react';
import {
  ContextMenu,
  type ContextMenuItem,
  type ContextMenuState,
  cn,
  contextMenuPoint,
  IconButton,
  SortableList,
} from '@/ui';
import { type Layer, LIMITS, OPACITIES } from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { setEditor, useEditor, useMap } from './store';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function LayerPanel() {
  const layers = useMap((s) => s.data.layers);
  const active = useEditor((s) => s.active);
  const chosen = useEditor((s) => s.layers);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const rows = [...layers].reverse();

  const itemsFor = (l: Layer): ContextMenuItem[] => [
    ...OPACITIES.slice()
      .reverse()
      .map((o) => ({
        label: `${S.layers.opacity} ${pct(o)}`,
        icon: o === l.opacity ? <Check /> : <span className="inline-block size-4" />,
        onSelect: () => act.patchLayer(l.id, { opacity: o }),
      })),
    {
      label: S.layers.rename,
      icon: <Pencil />,
      separatorBefore: true,
      onSelect: () => setEditor({ dialog: { kind: 'rename-layer', id: l.id } }),
    },
    {
      label: S.layers.duplicate,
      icon: <Copy />,
      disabled: layers.length >= LIMITS.maxLayers,
      onSelect: () => act.duplicate(l.id),
    },
    {
      label: S.layers.remove,
      icon: <Trash2 />,
      danger: true,
      disabled: layers.length <= 1,
      onSelect: () => void act.removeLayer(l.id),
    },
  ];

  const openMenu = (l: Layer, e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    act.selectLayer(l.id, { keep: true });
    setMenu({ ...contextMenuPoint(e), items: itemsFor(l) });
  };

  return (
    <section
      aria-labelledby="tm-layers"
      className="flex min-h-0 flex-col gap-2"
      data-testid="layers"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="tm-layers" className="m-0 text-sm font-semibold">
          {S.layers.heading}
          <span className="ml-2 font-normal text-muted tabular-nums">
            {layers.length}／{LIMITS.maxLayers}
          </span>
        </h2>
        <IconButton
          label={
            layers.length >= LIMITS.maxLayers ? S.layers.maxed(LIMITS.maxLayers) : S.layers.add
          }
          icon={<Plus />}
          size="sm"
          variant="secondary"
          disabled={layers.length >= LIMITS.maxLayers}
          onClick={act.addLayer}
          data-testid="layer-add"
        />
      </div>
      <SortableList
        aria-label={S.layers.heading}
        items={rows}
        getId={(l) => l.id}
        mode="drop"
        cancelOutside
        selectedId={active}
        onSelect={(id) => act.selectLayer(id)}
        onMove={(from, to) => {
          const l = rows[from];
          if (l) act.moveLayer(l.id, layers.length - 1 - to);
        }}
        itemClassName={(l) =>
          cn(
            'rounded-md border',
            chosen.includes(l.id) ? 'border-accent bg-accent-soft' : 'border-transparent',
          )
        }
        renderItem={(l) => {
          const dim = !l.visible || l.opacity === 0;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: 右鍵選單是捷徑；鍵盤與觸控用「⋯」按鈕
            <div
              className={cn('flex min-w-0 items-center gap-1 py-0.5 pr-1', dim && 'opacity-60')}
              onContextMenu={(e) => openMenu(l, e)}
              data-testid="layer-row"
              data-layer-id={l.id}
              data-active={l.id === active || undefined}
            >
              <span
                data-drag-handle
                className="flex cursor-grab items-center px-0.5 text-muted"
                aria-hidden
              >
                <GripVertical className="size-4" />
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 truncate rounded-sm px-1 py-1 text-left text-sm focus-visible:focus-ring"
                aria-pressed={chosen.includes(l.id)}
                aria-label={S.layers.select(l.name)}
                onClick={(e) => {
                  e.stopPropagation();
                  act.selectLayer(l.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
                }}
                title={`${l.name}・${S.layers.opacity} ${pct(l.opacity)}`}
              >
                {l.name}
                {l.opacity < 1 ? (
                  <span className="ml-1 text-xs text-muted tabular-nums">{pct(l.opacity)}</span>
                ) : null}
              </button>
              <IconButton
                label={l.visible ? S.layers.hide(l.name) : S.layers.show(l.name)}
                icon={l.visible ? <Eye /> : <EyeOff />}
                size="sm"
                variant="ghost"
                pressed={!l.visible}
                onClick={(e) => {
                  e.stopPropagation();
                  act.patchLayer(l.id, { visible: !l.visible });
                }}
                data-testid="layer-visible"
              />
              <IconButton
                label={l.locked ? S.layers.unlock(l.name) : S.layers.lock(l.name)}
                icon={l.locked ? <Lock /> : <LockOpen />}
                size="sm"
                variant="ghost"
                pressed={l.locked}
                onClick={(e) => {
                  e.stopPropagation();
                  act.patchLayer(l.id, { locked: !l.locked });
                }}
                data-testid="layer-lock"
              />
              <IconButton
                label={S.layers.options(l.name)}
                icon={<MoreHorizontal />}
                size="sm"
                variant="ghost"
                onClick={(e) => openMenu(l, e)}
                data-testid="layer-menu"
              />
            </div>
          );
        }}
      />
      <p className="m-0 text-xs text-muted">{S.layers.hint}</p>
      <ContextMenu state={menu} onClose={() => setMenu(null)} aria-label={S.layers.heading} />
    </section>
  );
}
