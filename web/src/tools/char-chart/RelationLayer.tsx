/**
 * 疊在關係圖畫布上的操作層（規格 1.6）：每個人是一顆圓形按鈕（可以用 Tab、Enter 操作），依序點兩個人連線；
 * 點空白處取消（標題的範圍除外）；在標題上按兩下（或點兩下）直接改字。點了第一個人的外圈畫在這一層（不會輸出）。
 */
import { type PointerEvent, useRef } from 'react';
import { clientToLocal } from '@/core/layout';
import { useStageScale } from '@/ui';
import { LabelEditor } from './LabelEditor';
import { type Character, LIMITS, type Point, REL, type RelationLayout } from './model';
import { releaseFocus } from './QuadLayer';
import { clickNode, setRelationTitle, useUi } from './store';
import { S } from './strings';

const DOUBLE_MS = 450;
const DOUBLE_PX = 10;
/** 在這個範圍裡按兩下改標題（畫布 px） */
const TITLE_EDIT = { width: 400, height: 100 };

export function RelationLayer({
  layout,
  members,
  title,
}: {
  layout: RelationLayout;
  members: Character[];
  title: string;
}) {
  const k = 1 / useStageScale();
  const linkFrom = useUi((s) => s.linkFrom);
  const editing = useUi((s) => s.editing);
  const root = useRef<HTMLDivElement>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const size = { width: Math.floor(layout.width), height: Math.floor(layout.height) };
  const byId = new Map(members.map((c) => [c.id, c]));
  const from = layout.nodes.find((n) => n.id === linkFrom);
  const R = REL.nodeRadius;

  const toLocal = (e: { clientX: number; clientY: number }): Point => {
    const r = root.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 };
    return clientToLocal(e.clientX, e.clientY, r, size);
  };

  /** 空白處（按鈕以外）：取消點了第一個人；在標題的範圍裡不取消；按兩下標題改字 */
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target instanceof SVGElement)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = toLocal(e);
    const inTitle = p.x < REL.titleZone.width && p.y < REL.titleZone.height;
    if (!inTitle) useUi.setState({ linkFrom: null });
    const now = performance.now();
    const prev = lastTap.current;
    const px = { x: e.clientX, y: e.clientY };
    if (prev && now - prev.t < DOUBLE_MS && Math.hypot(px.x - prev.x, px.y - prev.y) < DOUBLE_PX) {
      lastTap.current = null;
      if (p.x < TITLE_EDIT.width && p.y < TITLE_EDIT.height) {
        e.preventDefault();
        releaseFocus();
        useUi.setState({ editing: { chart: 'relation', key: 'title' } });
      }
      return;
    }
    lastTap.current = { t: now, ...px };
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: 疊在預覽上的操作區；每個人是一顆按鈕
    <div
      ref={root}
      role="group"
      aria-label={S.relationLayer}
      data-testid="relation-layer"
      data-link-from={linkFrom ?? ''}
      className="absolute inset-0 select-none"
      onPointerDown={onPointerDown}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
      >
        {from ? (
          <g data-testid="link-from" data-character={from.id}>
            <circle
              cx={from.x}
              cy={from.y}
              r={R + 5}
              fill="none"
              stroke="rgba(0, 0, 0, 0.45)"
              strokeWidth={4 + 3 * k}
            />
            <circle
              cx={from.x}
              cy={from.y}
              r={R + 5}
              fill="none"
              style={{ stroke: 'var(--accent)' }}
              strokeWidth={4}
            />
          </g>
        ) : null}
      </svg>
      {layout.nodes.map((n) => {
        const c = byId.get(n.id);
        if (!c) return null;
        return (
          <button
            key={n.id}
            type="button"
            data-node={n.id}
            aria-label={S.nodeLabel(c.name)}
            aria-pressed={linkFrom === n.id}
            className="absolute cursor-pointer rounded-full outline-none focus-visible:ring-4 focus-visible:ring-focus"
            style={{ left: n.x - R, top: n.y - R, width: R * 2, height: R * 2 }}
            onPointerDown={(e) => {
              /* 按鈕自己處理；不讓空白處的取消接手 */
              e.stopPropagation();
              lastTap.current = null;
            }}
            onClick={() => clickNode(n.id)}
          />
        );
      })}
      {members.length ? null : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span
            className="rounded-md bg-surface px-3 py-1.5 text-sm text-muted shadow-1"
            style={{ transform: `scale(${k})` }}
            data-testid="relation-empty"
          >
            {S.relationEmpty}
          </span>
        </div>
      )}
      {editing?.chart === 'relation' ? (
        <LabelEditor
          x={REL.titleX}
          y={REL.titleY + REL.titleFont / 2}
          align="left"
          wide
          value={title}
          label={S.editLabel('title')}
          maxLength={LIMITS.title}
          onCommit={setRelationTitle}
          onClose={() => useUi.setState({ editing: null })}
        />
      ) : null}
    </div>
  );
}
