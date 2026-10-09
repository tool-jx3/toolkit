/**
 * 擺放模式的操作層（規格 F12）：疊在預覽上（DOM，不畫進圖）。
 * 在右欄裡按住：右下角的控點（±36 畫布 px）→ 改卡片大小；卡片（含上方的提示標籤）→ 移動卡片；其他地方 → 移動照片。
 * 放開才記一步復原。虛線框與控點維持固定的螢幕大小。
 */
import { type PointerEvent, useRef, useState } from 'react';
import { clientToLocal } from '@/core/layout';
import { useStageScale } from '@/ui';
import {
  CARD_GRAB,
  type CardBox,
  cardBox,
  cardTravel,
  type Layout,
  type PlacementHit,
  placementHit,
  resizeHandlePoint,
} from './layout';
import {
  CARD_SIZE_MAX,
  CARD_SIZE_MIN,
  clamp,
  type Overlay,
  type Portrait,
  portraitRect,
} from './model';
import { configNow, edit, gesture, imageOf, useConfig } from './store';
import { S } from './strings';

type Drag = {
  pointer: number;
  kind: Exclude<PlacementHit, null>;
  start: { x: number; y: number };
  overlay: Overlay;
  portrait: Portrait;
  box: CardBox;
};

const CURSOR: Record<Exclude<PlacementHit, null>, string> = {
  resize: 'nwse-resize',
  card: 'move',
  photo: 'grab',
};

export function PlacementLayer({ layout }: { layout: Layout }) {
  const k = 1 / useStageScale();
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [cursor, setCursor] = useState('default');
  const c = useConfig((s) => s.data);
  const b = cardBox(layout, c);
  const size = { width: layout.W, height: layout.H };

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = root.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 };
    return clientToLocal(e.clientX, e.clientY, r, size);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = toLocal(e);
    const cur = configNow();
    const box = cardBox(layout, cur);
    const kind = placementHit(layout, box, p);
    if (!kind) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gesture.begin();
    drag.current = {
      pointer: e.pointerId,
      kind,
      start: p,
      overlay: { ...cur.overlay },
      portrait: { ...cur.portrait },
      box,
    };
    setCursor(kind === 'photo' ? 'grabbing' : CURSOR[kind]);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const p = toLocal(e);
    if (!d) {
      const kind = placementHit(layout, cardBox(layout, configNow()), p);
      setCursor(kind ? CURSOR[kind] : 'default');
      return;
    }
    if (e.pointerId !== d.pointer) return;
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const r = layout.right;
    edit((cfg) => {
      if (d.kind === 'resize') {
        /* 以左上角為準：大小跟著橫向或縱向位移較大的那個，位置換算成新的可移動範圍裡的比例 */
        const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        cfg.overlay.size = clamp(d.box.s / r.width + delta / r.width, CARD_SIZE_MIN, CARD_SIZE_MAX);
        const nb = cardBox(layout, cfg);
        cfg.overlay.x = clamp((d.box.x - r.x - 22) / Math.max(1, r.width - 44 - nb.s), 0, 1);
        cfg.overlay.y = clamp((d.box.y - r.y - 25) / Math.max(1, r.height - nb.h - 108), 0, 1);
      } else if (d.kind === 'card') {
        const t = cardTravel(layout, d.box);
        cfg.overlay.x = clamp(d.overlay.x + dx / t.x, 0, 1);
        cfg.overlay.y = clamp(d.overlay.y + dy / t.y, 0, 1);
      } else {
        const ref = cfg.portrait.photo;
        if (!ref || !imageOf(ref.id)) return;
        const at0 = portraitRect(r, ref, { ...d.portrait, x: 0, y: 0 });
        const ox = Math.abs((at0.width - r.width) / 2);
        const oy = Math.abs((at0.height - r.height) / 2);
        cfg.portrait.x = ox ? clamp(d.portrait.x + dx / ox, -1, 1) : 0;
        cfg.portrait.y = oy ? clamp(d.portrait.y + dy / oy, -1, 1) : 0;
      }
    });
  };

  const end = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    drag.current = null;
    gesture.commit();
    setCursor(d.kind === 'photo' ? 'grab' : CURSOR[d.kind]);
  };

  const h = resizeHandlePoint(b);
  return (
    // biome-ignore lint/a11y/useSemanticElements: 疊在預覽上的指標操作區，不是表單分組；鍵盤用設定欄的滑桿
    <div
      ref={root}
      role="group"
      className="absolute inset-0 touch-none select-none"
      style={{ cursor }}
      aria-label={S.placementLayer}
      data-testid="placement-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-md border-dashed border-accent"
        data-testid="placement-outline"
        data-box={`${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.s)},${Math.round(b.h)}`}
        style={{
          left: b.x - CARD_GRAB.left,
          top: b.y - CARD_GRAB.left,
          width: b.s + CARD_GRAB.left * 2,
          height: b.h + CARD_GRAB.left * 2,
          borderWidth: 2 * k,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full border-solid border-white bg-accent shadow-1"
        data-testid="placement-handle"
        style={{
          left: h.x - 9 * k,
          top: h.y - 9 * k,
          width: 18 * k,
          height: 18 * k,
          borderWidth: 2 * k,
        }}
      />
    </div>
  );
}
