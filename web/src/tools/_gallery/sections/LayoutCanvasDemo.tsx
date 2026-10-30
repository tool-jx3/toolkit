/**
 * 版型畫布的貼紙操作層 LayoutCanvas（社群貼文產生器加的選填）：
 * - stickerGestures：滾輪縮放、Shift＋滾輪旋轉、兩指捏合（縮放＋旋轉）；
 * - children：疊在點選區與貼紙下面的操作層（這裡是一塊「點一下＋1」的區域），點了不會取消選取貼紙。
 * 貼紙的樣子這裡用 div 畫（實際的工具畫在 canvas 上）。
 */
import { useState } from 'react';
import type { Placement } from '@/core/scene';
import { Section, Stage } from '@/ui';
import { LayoutCanvas } from '@/ui/LayoutCanvas';

const W = 480;
const H = 320;

interface DemoSticker {
  id: string;
  color: string;
  placement: Placement;
}

export function LayoutCanvasDemo() {
  const [stickers, setStickers] = useState<DemoSticker[]>([
    {
      id: 'a',
      color: '#e5484d',
      placement: { cx: 150, cy: 140, width: 120, height: 70, rotation: -8 },
    },
    {
      id: 'b',
      color: '#3f63e0',
      placement: { cx: 330, cy: 190, width: 90, height: 90, rotation: 12 },
    },
  ]);
  const [sel, setSel] = useState<string | null>('a');
  const [taps, setTaps] = useState(0);
  const set = (id: string, p: Placement) =>
    setStickers((list) => list.map((s) => (s.id === id ? { ...s, placement: p } : s)));
  return (
    <Section title="貼紙操作層 LayoutCanvas（stickerGestures、children）">
      <p className="m-0 text-xs text-muted">
        滾輪縮放、Shift＋滾輪旋轉、兩指捏合；下方的灰色區域是
        children（點一下＋1，不會取消選取貼紙）。
      </p>
      <Stage width={W} height={H}>
        <div className="absolute inset-0 bg-surface-2" />
        <LayoutCanvas
          width={W}
          height={H}
          stickers={stickers.map((s) => ({
            id: s.id,
            label: `示範貼紙 ${s.id}`,
            placement: s.placement,
          }))}
          selectedSticker={sel}
          onSelectSticker={setSel}
          onStickerChange={(id, p) => set(id, p)}
          onStickerDelete={(id) => setStickers((list) => list.filter((s) => s.id !== id))}
          stickerGestures
        >
          <button
            type="button"
            className="absolute rounded-md border border-dashed border-border-strong bg-surface-3 text-xs text-muted"
            style={{ left: 20, top: 230, width: 180, height: 70 }}
            onClick={() => setTaps((n) => n + 1)}
            data-testid="layout-children"
          >
            children：點了 {taps} 次
          </button>
          {stickers.map((s) => (
            <div
              key={s.id}
              aria-hidden
              className="pointer-events-none absolute rounded-md"
              style={{
                left: s.placement.cx - s.placement.width / 2,
                top: s.placement.cy - s.placement.height / 2,
                width: s.placement.width,
                height: s.placement.height,
                background: s.color,
                transform: `rotate(${s.placement.rotation}deg)`,
              }}
            />
          ))}
        </LayoutCanvas>
      </Stage>
    </Section>
  );
}
