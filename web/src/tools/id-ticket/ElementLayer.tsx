/**
 * 裝飾圖的操作層（SF 證件與證件共用，規格 F82、F95）：疊在預覽的畫布上，用共用的 LayoutEditor 拖曳移動、拉右下角縮放。
 * below＝沒選取的（在字的下面，點得到沒被字蓋住的地方）；沒有 below＝選取的那張（在最上面，被照片或字蓋住也拖得到）。
 * 座標：W × H＝卡片（SF 證件：原生像素；證件：設計單位），ox、oy＝卡片在操作層裡的位置。
 */
import { useRef } from 'react';
import type { Box } from '@/core/layout';
import { LayoutEditor, type LayoutItem } from '@/ui/LayoutEditor';
import { elementRect } from './sf/draw';
import {
  currentElements,
  gesture,
  patchElement,
  removeElement,
  useDoc,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';

export function ElementLayer({
  W,
  H,
  ox = 0,
  oy = 0,
  width,
  height,
  below,
}: {
  W: number;
  H: number;
  ox?: number;
  oy?: number;
  /** 操作層的大小（預設＝卡片＋位移） */
  width?: number;
  height?: number;
  below?: boolean;
}) {
  const doc = useDoc((s) => s.data);
  const side = usePrefs((p) => p.data.side);
  const sel = useUi((s) => s.element);
  const list = currentElements(doc, side);
  const start = useRef<{ x: number; y: number; w: number; h: number; size: number } | null>(null);
  const items: LayoutItem[] = list
    .filter((e) => (below ? e.id !== sel : e.id === sel))
    .map((e) => {
      const r = elementRect(e, W, H);
      return {
        id: e.id,
        label: e.image.name || S.sectionElements,
        box: { x: r.x + ox, y: r.y + oy, width: r.w, height: r.h },
        resizable: !below,
      };
    });
  if (!items.length) return null;
  const onChange = (id: string, box: Box, ch: { phase: string; op: 'move' | 'resize' }) => {
    const el = currentElements().find((e) => e.id === id);
    if (!el) return;
    if (ch.phase === 'start') {
      gesture.begin();
      const r = elementRect(el, W, H);
      start.current = { x: r.x, y: r.y, w: r.w, h: r.h, size: el.size };
      return;
    }
    const st = start.current ?? { ...elementRect(el, W, H), size: el.size };
    if (ch.op === 'resize') {
      const f = Math.max(box.width / st.w, box.height / st.h);
      const w = st.w * f;
      const h = st.h * f;
      patchElement(id, {
        size: st.size * f,
        x: (st.x + w / 2) / W,
        y: (st.y + h / 2) / H,
      });
    } else
      patchElement(id, {
        x: (box.x - ox + box.width / 2) / W,
        y: (box.y - oy + box.height / 2) / H,
      });
    if (ch.phase === 'end' || ch.phase === 'nudge') {
      start.current = null;
      gesture.commit();
    }
  };
  return (
    <LayoutEditor
      width={width ?? W + ox}
      height={height ?? H + oy}
      items={items}
      selectedId={sel}
      onSelect={(id) => useUi.setState({ element: id })}
      onChange={onChange}
      onDelete={below ? undefined : removeElement}
      onEscape={() => useUi.setState({ element: null })}
      keyboard={!below}
      guides={!below}
      nudgeStep={Math.max(1, Math.round(Math.min(W, H) / 500))}
      aria-label={S.elementsLayer}
    />
  );
}
