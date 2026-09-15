import { useMemo, useState } from 'react';
import { fmtBytes, TARGETS, type ExportTarget } from '../core/targets';
import { RECIPE_CATEGORY_LABELS, RECIPES, recipeParams, type Recipe, type RecipeCategory } from '../core/templates';
import { t, useLocale } from '../i18n';
import { Segmented } from './kit';
import { Thumb } from './Thumb';

interface Props {
  target: ExportTarget;
  onTarget: (id: string) => void;
  onPick: (recipe: Recipe) => void;
}

const ORDER: RecipeCategory[] = ['coc', 'general', 'style'];

/** 起動時の入口。まず配布先を決め、次にテンプレを1つ選ぶ */
export function GalleryScreen({ target, onTarget, onPick }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  // レシピごとの見本パラメータは1回だけ組む（文言が変わる言語切替のときだけ組み直す）
  const locale = useLocale();
  const previews = useMemo(() => new Map(RECIPES.map((r) => [r.id, recipeParams(r)])), [locale]);

  return (
    <div className="mx-auto max-w-[1100px] p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold sm:text-2xl">{t('gallery.title')}</h1>
        <p className="mt-1 text-sm text-neutral-400">{t('gallery.lead')}</p>
      </header>

      <section className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{t('gallery.where')}</h2>
        <Segmented
          value={target.id}
          onChange={onTarget}
          items={TARGETS.map((tg) => ({ id: tg.id, label: tg.label, sub: tg.notes.join(' / ') }))}
        />
        <p className="mt-2 text-[11px] text-neutral-500">
          {t('gallery.targetSpec', target.formats.map((f) => f.toUpperCase()).join(' / '), fmtBytes(target.maxBytes), target.defaultSize.w, target.defaultSize.h)}
          {target.fixedSize && t('gallery.targetFixed', target.fixedSize.w, target.fixedSize.h)}
        </p>
      </section>

      {ORDER.map((cat) => {
        const items = RECIPES.filter((r) => r.category === cat);
        if (!items.length) return null;
        return (
          <section key={cat} className="mb-7">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{t(RECIPE_CATEGORY_LABELS[cat])}</h2>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onPick(r)}
                  onMouseEnter={() => setHover(r.id)}
                  onMouseLeave={() => setHover((h) => (h === r.id ? null : h))}
                  onFocus={() => setHover(r.id)}
                  onBlur={() => setHover((h) => (h === r.id ? null : h))}
                  className="group flex flex-col items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-2 transition hover:border-sky-400 hover:bg-sky-400/5 focus:border-sky-400 focus:outline-none"
                >
                  <Thumb params={previews.get(r.id)!} size={140} animate={hover === r.id} />
                  <span className="w-full truncate text-center text-sm text-neutral-200">{r.label}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

    </div>
  );
}
