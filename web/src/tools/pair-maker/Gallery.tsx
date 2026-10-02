/**
 * 版型一覽：每個版型一張卡（縮圖＝版型初始狀態的實際算繪、名稱、分類與一句說明），可依分類篩選。
 */
import { useEffect, useRef } from 'react';
import { drawScene, loadSceneFonts } from '@/core/scene';
import { TemplateGallery } from '@/ui';
import type { TemplateDef } from './model';
import { sceneEnv } from './render';
import { S } from './strings';
import { TEMPLATES } from './templates';

const THUMB_W = 320;
const THUMB_H = 240;

function Thumb({ def }: { def: TemplateDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const d = def.initial();
    const size = def.size(d);
    const k = Math.min(THUMB_W / size.width, THUMB_H / size.height);
    const draw = () => {
      const c = ref.current;
      if (!c || !alive) return;
      c.width = Math.round(size.width * k);
      c.height = Math.round(size.height * k);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      drawScene(ctx, def.scene(d, sceneEnv(d)));
    };
    draw();
    void loadSceneFonts(def.scene(d, sceneEnv(d))).then((changed) => changed && draw());
    return () => {
      alive = false;
    };
  }, [def]);
  return (
    <canvas ref={ref} aria-hidden className="block max-h-full max-w-full" data-thumb={def.id} />
  );
}

export function Gallery({
  onPick,
  activeId,
}: {
  onPick: (id: string) => void;
  activeId?: string | null;
}) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="pm-gallery-title">
      <h2 id="pm-gallery-title" className="m-0 text-lg font-semibold text-fg">
        {S.galleryTitle}
      </h2>
      <p className="m-0 text-sm text-muted">{S.galleryIntro}</p>
      <TemplateGallery
        aria-label={S.galleryAria}
        confirm={false}
        activeId={activeId}
        templates={TEMPLATES.map((def) => ({
          id: def.id,
          name: def.name,
          description: `#${def.tag}　${def.tip}`,
          tags: [def.tag],
          thumbnail: <Thumb def={def} />,
          data: def.id,
        }))}
        onApply={(t) => onPick(t.data)}
      />
    </section>
  );
}
