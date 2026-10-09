/**
 * 一張可以刮的卡片（預覽與分享連結的畫面共用）：markup.ts 的 HTML＋樣式，掛上 engine.ts 的塗層程式。
 * 卡片的 HTML 或塗層設定一改就重新掛上（＝重新蓋上塗層）；圖片網址讀好時也是。
 */
import { useEffect, useMemo, useRef } from 'react';
import type { Card } from './card';
import { mountScratch, type ScratchHandle } from './engine';
import { usePreviewSources } from './images';
import { cardCss, cardHtml, engineConfig } from './markup';
import type { ShareCrops } from './share';

const SCOPE = '.scx-view';
const POP = 'scx-view-pop';
const CSS = cardCss(SCOPE, POP);

export function CardView({
  card,
  fit = false,
  crops,
  onHandle,
  onReveal,
  onRecover,
  onImages,
}: {
  card: Card;
  /** 等比縮小到外層的寬（分享連結的畫面） */
  fit?: boolean;
  /** 分享連結帶來的裁切範圍（網址的圖照這個裁，不再讀像素） */
  crops?: ShareCrops;
  onHandle?: (h: ScratchHandle | null) => void;
  onReveal?: () => void;
  /** 重新掛上（重新蓋上）時 */
  onRecover?: () => void;
  /** 圖片的讀取狀態 */
  onImages?: (s: { pending: number; missing: number }) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { src, pending, missing } = usePreviewSources(card, crops);
  const html = useMemo(() => cardHtml(card, { src, pop: true }), [card, src]);
  const cfgKey = useMemo(
    () => JSON.stringify(engineConfig(card, { popClass: POP, confetti: true, fit })),
    [card, fit],
  );
  const hooks = useRef({ onHandle, onReveal, onRecover, onImages });
  hooks.current = { onHandle, onReveal, onRecover, onImages };

  useEffect(() => {
    hooks.current.onImages?.({ pending, missing });
  }, [pending, missing]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: html 換了（innerHTML 重寫）就要重新掛上
  useEffect(() => {
    const el = host.current?.querySelector<HTMLElement>('[data-scx="card"]');
    if (!el) return;
    const h = mountScratch(el, JSON.parse(cfgKey), { onReveal: () => hooks.current.onReveal?.() });
    hooks.current.onHandle?.(h);
    hooks.current.onRecover?.();
    return () => {
      h.destroy();
      hooks.current.onHandle?.(null);
    };
  }, [html, cfgKey]);

  return (
    <div className="scx-view" data-testid="scratch-card">
      <style>{CSS}</style>
      <div
        ref={host}
        className={fit ? 'scx-fit mx-auto w-full' : undefined}
        style={fit ? { maxWidth: card.width + 4 } : undefined}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: markup.ts 產生的 HTML（使用者的文字都已跳脫）
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
