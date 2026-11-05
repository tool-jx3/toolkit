/**
 * 畫布左上的工具列：選取（第一個）、畫筆、橡皮擦、填滿、圖形、滴管、整張移動。
 * 圖形按右鍵（或圖形工具時畫布上方的選單）選形狀與「只畫外框」。
 */
import {
  Check,
  Eraser,
  Move,
  PaintBucket,
  Paintbrush,
  Pipette,
  Shapes,
  SquareDashedMousePointer,
} from 'lucide-react';
import { type MouseEvent, useState } from 'react';
import {
  ContextMenu,
  type ContextMenuState,
  cn,
  contextMenuPoint,
  IconButton,
  Select,
  Toggle,
} from '@/ui';
import { SHAPE_KINDS, type ShapeKind } from '../model/shapes';
import { S } from '../strings';
import * as act from './actions';
import { type ToolId, useEditor, usePrefs } from './store';

const TOOLS: { id: ToolId; icon: React.ReactNode; key: string; label: string; hint?: string }[] = [
  {
    id: 'select',
    icon: <SquareDashedMousePointer />,
    key: 'S',
    label: S.tools.select,
    hint: S.tools.selectHint,
  },
  { id: 'brush', icon: <Paintbrush />, key: 'B', label: S.tools.brush },
  { id: 'eraser', icon: <Eraser />, key: 'E', label: S.tools.eraser },
  { id: 'fill', icon: <PaintBucket />, key: 'G', label: S.tools.fill },
  { id: 'shape', icon: <Shapes />, key: 'U', label: S.tools.shape, hint: S.tools.shapeHint },
  { id: 'picker', icon: <Pipette />, key: 'I', label: S.tools.picker, hint: S.tools.pickerHint },
  { id: 'move-map', icon: <Move />, key: 'M', label: S.tools.moveMap, hint: S.tools.moveMapHint },
];

export const shapeLabel = (k: ShapeKind): string => S.shapes[k];

export function ToolStrip() {
  const tool = useEditor((s) => s.tool);
  const shape = usePrefs((s) => s.data.shape);
  const outline = usePrefs((s) => s.data.outline);
  const patch = usePrefs((s) => s.patch);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const openShapeMenu = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    act.setTool('shape');
    setMenu({
      ...contextMenuPoint(e),
      items: [
        ...SHAPE_KINDS.map((k) => ({
          label: shapeLabel(k),
          icon: k === shape ? <Check /> : <span className="inline-block size-4" />,
          onSelect: () => patch({ shape: k }),
        })),
        {
          label: S.shapes.outline,
          icon: outline ? <Check /> : <span className="inline-block size-4" />,
          separatorBefore: true,
          disabled: shape === 'line',
          onSelect: () => patch({ outline: !outline }),
        },
      ],
    });
  };

  return (
    <>
      <div
        role="toolbar"
        aria-orientation="vertical"
        aria-label={S.tools.label}
        className="absolute top-2 left-2 z-10 flex flex-col gap-0.5 rounded-md border border-border bg-surface p-1 shadow-1"
        data-testid="tool-strip"
      >
        {TOOLS.map((t) => (
          <IconButton
            key={t.id}
            label={`${t.label}（${t.key}）${t.hint ? `：${t.hint}` : ''}`}
            icon={t.icon}
            size="sm"
            variant="ghost"
            pressed={tool === t.id}
            className={cn(t.id === 'move-map' && 'mt-1')}
            onClick={() =>
              act.setTool(tool === 'move-map' && t.id === 'move-map' ? 'select' : t.id)
            }
            onContextMenu={t.id === 'shape' ? openShapeMenu : undefined}
            aria-haspopup={t.id === 'shape' ? 'menu' : undefined}
            data-tool={t.id}
          />
        ))}
      </div>
      {tool === 'shape' ? (
        <div
          className="absolute top-2 right-2 z-10 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 shadow-1"
          data-testid="shape-options"
        >
          <Select
            size="sm"
            aria-label={S.shapes.menu}
            value={shape}
            onValueChange={(v) => patch({ shape: v as ShapeKind })}
            options={SHAPE_KINDS.map((k) => ({ value: k, label: shapeLabel(k) }))}
          />
          <Toggle
            label={S.shapes.outline}
            checked={outline && shape !== 'line'}
            disabled={shape === 'line'}
            onCheckedChange={(v) => patch({ outline: v })}
          />
        </div>
      ) : null}
      <ContextMenu state={menu} onClose={() => setMenu(null)} aria-label={S.shapes.menu} />
    </>
  );
}
