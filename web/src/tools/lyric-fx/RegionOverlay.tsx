/**
 * 預覽上的避開區域（規格 F54）：平常以虛線框顯示（只供預覽、不會匯出）；框選中十字游標、拖曳畫出新的範圍
 * （寬高都超過 0.3% 才算），Enter 或「完成」記下、Esc 或「取消」放棄。
 * 框與標籤放在舞台的內容裡（跟著縮放），線寬與字級用 useStageScale 換算成固定的螢幕大小；完成／取消的按鈕在舞台外（RegionToolbar）。
 */
import { Check, X } from 'lucide-react';
import { type PointerEvent, useEffect, useRef } from 'react';
import type { LyricRegion } from '@/core/lyricfx';
import { Button, cn, useStageScale } from '@/ui';
import { cancelRegionEdit, commitRegionEdit } from './actions';
import { useSession } from './store';
import { S } from './strings';

const MIN = 0.003;

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

function Box({ r, pending, scale }: { r: LyricRegion; pending?: boolean; scale: number }) {
  const k = 1 / Math.max(0.05, scale);
  return (
    <div
      className={cn(
        'pointer-events-none absolute border-dashed',
        pending ? 'border-accent bg-accent-soft/40' : 'border-warning bg-warning-soft/30',
      )}
      style={{
        left: pct(r.x),
        top: pct(r.y),
        width: pct(r.width),
        height: pct(r.height),
        borderWidth: 2 * k,
      }}
      data-testid={pending ? 'region-pending' : 'region-box'}
    >
      <span
        className="absolute left-0 top-0 whitespace-nowrap rounded-br-sm bg-surface/90 text-fg"
        style={{ fontSize: 12 * k, padding: `${2 * k}px ${6 * k}px` }}
      >
        {S.preview.regionLabel}　{Math.round(r.width * 100)}% × {Math.round(r.height * 100)}%
      </span>
    </div>
  );
}

export function RegionOverlay({ region, show }: { region: LyricRegion | null; show: boolean }) {
  const editing = useSession((st) => st.regionEditing);
  const pending = useSession((st) => st.regionPending);
  const scale = useStageScale();
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelRegionEdit();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        commitRegionEdit();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing]);

  const at = (e: PointerEvent) => {
    const r = root.current?.getBoundingClientRect();
    if (!r?.width || !r.height) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const update = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    const w = Math.abs(p.x - d.x);
    const h = Math.abs(p.y - d.y);
    useSession.setState({
      regionPending:
        w >= MIN && h >= MIN
          ? { x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), width: w, height: h }
          : null,
    });
  };

  if (!editing && (!show || !region)) return null;
  return (
    <div
      ref={root}
      className={cn(
        'absolute inset-0',
        editing ? 'cursor-crosshair touch-none' : 'pointer-events-none',
      )}
      data-testid="region-overlay"
      data-editing={editing ? '' : undefined}
      onPointerDown={(e) => {
        if (!editing || e.button > 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, ...at(e) };
        useSession.setState({ regionPending: null });
      }}
      onPointerMove={(e) => {
        if (drag.current?.id === e.pointerId) update(e);
      }}
      onPointerUp={(e) => {
        if (drag.current?.id !== e.pointerId) return;
        update(e);
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      {editing ? <div className="pointer-events-none absolute inset-0 bg-overlay/30" /> : null}
      {region && !(editing && pending) ? <Box r={region} scale={scale} /> : null}
      {editing && pending ? <Box r={pending} pending scale={scale} /> : null}
    </div>
  );
}

/** 框選中的說明與「完成」「取消」（放在舞台下方） */
export function RegionToolbar() {
  const editing = useSession((st) => st.regionEditing);
  const pending = useSession((st) => st.regionPending);
  if (!editing) return null;
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-accent bg-accent-soft p-2"
      data-testid="region-toolbar"
    >
      <span className="min-w-0 flex-1 text-sm">{S.style.regionEditing}</span>
      <Button
        size="sm"
        variant="primary"
        icon={<Check />}
        onClick={commitRegionEdit}
        disabled={!pending}
      >
        {S.style.regionDone}
      </Button>
      <Button size="sm" variant="secondary" icon={<X />} onClick={cancelRegionEdit}>
        {S.style.regionCancel}
      </Button>
    </div>
  );
}
