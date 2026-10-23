/**
 * 場景的編輯舞台（規格 F11～F15、F24、F26）：場景圖＋所有熱點的輪廓與編號（SVG，不輸出）＋畫熱點的工具層＋
 * 共用的 LayoutEditor（選取、拖曳、八個控點、方向鍵、Delete、Esc）。座標都是場景圖的 %。
 */
import { type PointerEvent, useRef, useState } from 'react';
import type { Box, BoxHandle } from '@/core/layout';
import {
  LayoutEditor,
  type LayoutItem,
  Notice,
  Stage,
  type StageBackground,
  useStageScale,
} from '@/ui';
import {
  boxFromDrag,
  type ClueMapState,
  clampBox,
  effectiveRequires,
  LIMITS,
  type PctBox,
  type Shape,
  type Spot,
  spotLabel,
} from './model';
import {
  addSpot,
  removeSpot,
  STAGE_BGS,
  type StageBg,
  selectSpot,
  setSpotBox,
  setTool,
  stageBgOf,
  useClue,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';

/** 舞台的內容寬（px）；高依場景比例 */
export const STAGE_W = 1200;

const HANDLES: readonly BoxHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** 熱點輪廓與編號（SVG，座標是舞台內容 px；線寬與圓標維持固定的螢幕大小） */
function Shapes({
  spots,
  look,
  W,
  H,
}: {
  spots: readonly Spot[];
  look: ClueMapState['look'];
  W: number;
  H: number;
}) {
  const k = 1 / useStageScale();
  const accent = look.accent;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${W} ${H}`}
      data-testid="stage-shapes"
    >
      {spots.map((s, i) => {
        const x = (s.x / 100) * W;
        const y = (s.y / 100) * H;
        const w = (s.w / 100) * W;
        const h = (s.h / 100) * H;
        const dash = s.hidden ? `${8 * k} ${5 * k}` : undefined;
        const r = 11 * k;
        const bx = Math.min(Math.max(x + 3 * k + r, r), W - r);
        const by = Math.min(Math.max(y + 3 * k + r, r), H - r);
        const needs = effectiveRequires(s).length > 0;
        const common = {
          fill: accent,
          fillOpacity: 0.14,
          stroke: '#ffffff',
          strokeWidth: 4 * k,
          strokeDasharray: dash,
        };
        const shape = (extra: object) =>
          s.shape === 'ellipse' ? (
            <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...extra} />
          ) : (
            <rect x={x} y={y} width={w} height={h} rx={2 * k} {...extra} />
          );
        return (
          <g key={s.id} data-shape-id={s.id} data-hidden={s.hidden || undefined}>
            {shape(common)}
            {shape({
              fill: 'none',
              stroke: accent,
              strokeWidth: 2 * k,
              strokeDasharray: dash,
            })}
            <circle
              cx={bx}
              cy={by}
              r={r}
              fill={needs ? '#1f2328' : accent}
              stroke="#fff"
              strokeWidth={1.5 * k}
            />
            <text
              x={bx}
              y={by}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12 * k}
              fontWeight={700}
              fill={needs ? '#ffffff' : '#000000'}
            >
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 畫熱點的工具層：選取工具時按空白處取消選取；畫矩形／橢圓時拖曳畫出範圍 */
function DrawLayer({ aspect }: { aspect: number }) {
  const tool = useUi((s) => s.tool);
  const root = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{
    a: { x: number; y: number };
    b: { x: number; y: number };
  } | null>(null);
  const k = 1 / useStageScale();
  const point = (e: PointerEvent) => {
    const r = root.current?.getBoundingClientRect();
    if (!r?.width || !r.height) return { x: 0, y: 0 };
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const shape: Shape | null = tool === 'rect' ? 'rect' : tool === 'ellipse' ? 'ellipse' : null;
  const box: PctBox | null =
    draft && shape
      ? {
          x: Math.min(draft.a.x, draft.b.x),
          y: Math.min(draft.a.y, draft.b.y),
          w: Math.abs(draft.b.x - draft.a.x),
          h: Math.abs(draft.b.y - draft.a.y),
        }
      : null;
  return (
    <div
      ref={root}
      className="absolute inset-0"
      style={{ cursor: shape ? 'crosshair' : undefined, touchAction: shape ? 'none' : undefined }}
      data-testid="draw-layer"
      data-tool={tool}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (!shape) {
          selectSpot(null);
          return;
        }
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const p = point(e);
        setDraft({ a: p, b: p });
      }}
      onPointerMove={(e) => {
        if (draft) setDraft({ a: draft.a, b: point(e) });
      }}
      onPointerUp={(e) => {
        if (!draft || !shape) return;
        const b = point(e);
        addSpot(shape, boxFromDrag(shape, aspect, draft.a, b));
        setDraft(null);
      }}
      onPointerCancel={() => setDraft(null)}
    >
      {box && (box.w > 0 || box.h > 0) ? (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          data-testid="draw-draft"
          style={{
            left: `${box.x}%`,
            top: `${box.y}%`,
            width: `${box.w}%`,
            height: `${box.h}%`,
            outline: `${2 * k}px dashed var(--accent)`,
            background: 'rgba(255,255,255,0.12)',
            borderRadius: shape === 'ellipse' ? '50%' : 0,
          }}
        />
      ) : null}
    </div>
  );
}

export function StageEditor({
  src,
  aspect,
  look,
  spots,
  onImageSize,
}: {
  src: string;
  aspect: number;
  look: ClueMapState['look'];
  spots: readonly Spot[];
  onImageSize: (width: number, height: number) => void;
}) {
  const selectedId = useUi((s) => s.selectedId);
  const tool = useUi((s) => s.tool);
  const stageBg = stageBgOf(usePrefs((s) => s.data.stageBg));
  const [failed, setFailed] = useState<string | null>(null);
  const W = STAGE_W;
  const H = Math.max(1, Math.round(W / aspect));

  const items: LayoutItem[] = spots.map((s, i) => ({
    id: s.id,
    label: S.stage.spotAria(i + 1, spotLabel(s, i)),
    box: { x: s.x, y: s.y, width: s.w, height: s.h },
    resizable: true,
    handles: HANDLES,
    limits: { minWidth: LIMITS.minSize, minHeight: LIMITS.minSize, maxWidth: 100, maxHeight: 100 },
    clamp: (b: Box) => {
      const c = clampBox({ x: b.x, y: b.y, w: b.width, h: b.height });
      return { x: c.x, y: c.y, width: c.w, height: c.h };
    },
  }));

  const onChange = (id: string, box: Box, change: { phase: string }) => {
    if (change.phase === 'start') {
      useClue.beginGesture();
      return;
    }
    if (change.phase === 'end') {
      useClue.endGesture();
      return;
    }
    setSpotBox(id, { x: box.x, y: box.y, w: box.width, h: box.height });
  };

  return (
    <>
      <Stage<'dark' | 'light' | 'checker'>
        width={W}
        height={H}
        backgrounds={STAGE_BGS}
        background={{ kind: stageBg } as StageBackground<StageBg>}
        onBackgroundChange={(bg) => usePrefs.getState().patch({ stageBg: stageBgOf(bg.kind) })}
        aria-label={S.stage.label}
      >
        {src ? (
          <img
            alt=""
            src={src}
            draggable={false}
            className="block size-full select-none"
            data-testid="stage-image"
            onLoad={(e) => {
              setFailed(null);
              onImageSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
            }}
            onError={() => setFailed(src)}
          />
        ) : (
          <div className="size-full bg-surface-2" />
        )}
        <Shapes spots={spots} look={look} W={W} H={H} />
        <DrawLayer aspect={aspect} />
        <div
          className={tool === 'select' ? 'contents' : 'contents [&_button]:pointer-events-none!'}
        >
          <LayoutEditor
            width={W}
            height={H}
            units="percent"
            items={items}
            selectedId={selectedId}
            onSelect={selectSpot}
            onChange={onChange}
            nudgeStep={0.5}
            nudgeShiftStep={5}
            hitPadding={4}
            onDelete={removeSpot}
            onEscape={() => {
              if (useUi.getState().tool !== 'select') setTool('select');
              else if (useUi.getState().selectedId) selectSpot(null);
            }}
            aria-label={S.stage.layerLabel}
          />
        </div>
      </Stage>
      {failed ? (
        <Notice tone="warning" className="">
          <span data-testid="scene-load-failed">{S.stage.loadFailed}</span>
        </Notice>
      ) : null}
    </>
  );
}
