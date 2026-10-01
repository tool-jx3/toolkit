/**
 * 範本一覽（開頁畫面，F01～F03）：標題、一句說明、用途選擇、三類範本卡片。
 * 卡片縮圖固定以 480 × 480 的設定繪製；平常靜止在 t＝0.25，滑鼠停留或鍵盤聚焦時循環播放。
 */
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { Button, LoopThumb, TemplateGallery, type TemplateItem } from '@/ui';
import { chooseTemplate } from './actions';
import { TargetPicker, TargetSummary } from './controls';
import { useEnsureFonts, useFontTick } from './fontTick';
import { applyTemplate, type CutinTemplate, switchTarget } from './model';
import { buildScene } from './scene';
import { DEFAULT_SETTINGS } from './settings';
import { setSettings, usePrefs, useSettings, useUi } from './store';
import { S } from './strings';
import { TEMPLATE_CATEGORIES, TEMPLATES, templateOf } from './templates';

const THUMB = 480;
const THUMB_PX = 240;

function TemplateThumb({ template, playing }: { template: CutinTemplate; playing: boolean }) {
  const tick = useFontTick();
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重排
  const draw = useMemo(() => {
    const s = applyTemplate(
      {
        ...DEFAULT_SETTINGS,
        width: THUMB,
        height: THUMB,
        touched: { ...DEFAULT_SETTINGS.touched, size: true },
      },
      template,
    );
    const scene = buildScene({ ...s, width: THUMB, height: THUMB });
    return (ctx: CanvasRenderingContext2D, t: number) => {
      ctx.scale(THUMB_PX / THUMB, THUMB_PX / THUMB);
      scene.draw(ctx, t);
    };
  }, [template, tick]);
  return (
    <span className="block aspect-square h-full">
      <LoopThumb
        width={THUMB_PX}
        height={THUMB_PX}
        draw={draw}
        playing={playing}
        frames={15}
        fps={20}
      />
    </span>
  );
}

const ITEMS: Record<string, TemplateItem<CutinTemplate>[]> = Object.fromEntries(
  TEMPLATE_CATEGORIES.map((cat) => [
    cat,
    TEMPLATES.filter((t) => t.category === cat).map((t) => ({
      id: t.id,
      name: t.name,
      tags: [S.categories[cat]],
      data: t,
      thumbnail: ({ playing }: { playing: boolean }) => (
        <TemplateThumb template={t} playing={playing} />
      ),
    })),
  ]),
);

export function Gallery() {
  const target = useSettings((st) => st.data.target);
  const templateId = useSettings((st) => st.data.templateId);
  const started = usePrefs((p) => p.data.started);
  useEnsureFonts(TEMPLATES.map((t) => ({ font: t.font, text: t.text })));
  const current = templateOf(templateId);
  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-5" data-testid="gallery">
      <header className="flex flex-col gap-1.5">
        <h2 className="m-0 text-xl font-semibold">{S.galleryTitle}</h2>
        <p className="m-0 text-sm text-muted">{S.galleryLead}</p>
      </header>
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <h3 className="m-0 text-sm font-semibold">{S.targetLabel}</h3>
        <TargetPicker value={target} onChange={(v) => setSettings((s) => switchTarget(s, v))} />
        <TargetSummary target={target} />
      </section>
      {started ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            icon={<ArrowRight />}
            onClick={() => useUi.setState({ screen: 'editor' })}
          >
            {S.continueEditing}
          </Button>
          <span className="text-sm text-muted">{S.continueHint(current?.name ?? S.custom)}</span>
        </div>
      ) : null}
      {TEMPLATE_CATEGORIES.map((cat) => (
        <section key={cat} className="flex flex-col gap-2" data-category={cat}>
          <h3 className="m-0 text-base font-semibold">{S.categories[cat]}</h3>
          <TemplateGallery
            aria-label={S.templateListLabel(S.categories[cat])}
            templates={ITEMS[cat]}
            onApply={(t) => chooseTemplate(t.data)}
            activeId={started ? templateId : null}
            confirm={false}
            filter={false}
          />
        </section>
      ))}
    </div>
  );
}
