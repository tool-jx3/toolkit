/**
 * 範本一覽（開頁畫面，規格 F01～F09）：搜尋、分類、縮圖背景、縮圖一起播放、結果數、沒有結果時清除篩選；
 * 點卡片套用範本並進入編輯畫面。縮圖用與匯出相同的場景即時畫（等比縮進 4:3 的格子）。
 */
import { ArrowRight, Search } from 'lucide-react';
import { type Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Field,
  Kbd,
  LoopThumb,
  Segmented,
  TemplateGallery,
  type TemplateItem,
  TextInput,
  Toggle,
} from '@/ui';
import { useEnsureFonts, useFontTick } from './fontTick';
import {
  applyPreset,
  CATEGORY_IDS,
  type CategoryId,
  PRESETS,
  type Preset,
  presetOf,
} from './presets';
import { buildScene } from './scene';
import { filterPresets } from './search';
import { choosePreset, type ThumbBg, usePrefs, useSb, useUi } from './store';
import { CATEGORY_NAMES, S, STYLE_NAMES } from './strings';

const TW = 320;
const TH = 240;
/** 縮圖的底色（只用在縮圖畫布上，和預覽舞台的黑、白底相同用意） */
const THUMB_BG: Record<Exclude<ThumbBg, 'checker'>, string> = { dark: '#1b1d22', light: '#f5f3ee' };

/** 元素在畫面附近時才播放（捲出畫面的縮圖停下來） */
function useInView<T extends Element>(): [Ref<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      rootMargin: '160px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView];
}

function PresetThumb({ preset, playing }: { preset: Preset; playing: boolean }) {
  const tick = useFontTick();
  const bg = usePrefs((p) => p.data.thumbBg);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重排
  const scene = useMemo(() => buildScene(applyPreset(preset)), [preset, tick]);
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, u: number) => {
      if (bg !== 'checker') {
        ctx.fillStyle = THUMB_BG[bg];
        ctx.fillRect(0, 0, TW, TH);
      }
      const k = Math.min(TW / scene.width, TH / scene.height) * 0.94;
      ctx.translate((TW - scene.width * k) / 2, (TH - scene.height * k) / 2);
      ctx.scale(k, k);
      scene.render(ctx, u * scene.duration);
    },
    [scene, bg],
  );
  const [ref, inView] = useInView<HTMLSpanElement>();
  return (
    <span ref={ref} className="block size-full" data-preset-thumb={preset.id}>
      <LoopThumb
        width={TW}
        height={TH}
        draw={draw}
        playing={playing && inView}
        frames={Math.max(1, Math.round(scene.duration * 12))}
        fps={12}
        stillTime={scene.duration > 0 ? scene.stillTime / scene.duration : 0}
      />
    </span>
  );
}

const durationOf = (p: Preset): number => buildScene(applyPreset(p)).duration;

export function presetDescription(p: Preset, seconds: number): string {
  const names = [...new Set(p.bubbles.map((b) => STYLE_NAMES[b.style]))];
  return S.presetMeta(names.length > 2 ? S.styleCount(names.length) : names.join('、'), seconds);
}

export function Gallery({ searchRef }: { searchRef: Ref<HTMLInputElement> }) {
  const prefs = usePrefs((p) => p.data);
  const patch = usePrefs((p) => p.patch);
  const presetId = useSb((s) => s.data.presetId);
  const tick = useFontTick();
  useEnsureFonts(
    useMemo(() => {
      const map = new Map<string, { family: string; weight: number; text: string }>();
      for (const p of PRESETS) {
        const f = p.settings.font ?? applyPreset(p).font;
        const text = p.bubbles
          .map((b) => `${b.title ?? ''}${b.text ?? ''}${b.button ?? ''}`)
          .join('');
        for (const weight of [f.weight, Math.max(700, f.weight)]) {
          const k = `${f.family}|${weight}`;
          const cur = map.get(k);
          map.set(k, { family: f.family, weight, text: (cur?.text ?? '') + text });
        }
      }
      return [...map.values()];
    }, []),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重算長度
  const durations = useMemo(() => new Map(PRESETS.map((p) => [p.id, durationOf(p)])), [tick]);
  const list = filterPresets(PRESETS, prefs.category, prefs.query);
  const items: TemplateItem<Preset>[] = list.map((p) => ({
    id: p.id,
    name: p.name,
    description: presetDescription(p, durations.get(p.id) ?? 0),
    tags: [CATEGORY_NAMES[p.category]],
    data: p,
    thumbnail: ({ playing }: { playing: boolean }) => (
      <PresetThumb preset={p} playing={prefs.motion || playing} />
    ),
  }));
  const current = presetOf(presetId);
  const clear = () => {
    patch({ query: '', category: 'all' });
    if (searchRef && typeof searchRef === 'object') searchRef.current?.focus();
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4" data-testid="gallery">
      <header className="flex flex-col gap-1.5">
        <h2 className="m-0 text-xl font-semibold">{S.galleryTitle}</h2>
        <p className="m-0 text-sm text-muted">{S.galleryLead}</p>
      </header>
      {prefs.started ? (
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
      {/* 焦點在分類、縮圖背景、一起播放上時（共用快捷鍵在表單控制項上不觸發單鍵），/ 也跳到搜尋欄（照原作） */}
      <section
        className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3"
        aria-label={S.searchLabel}
        onKeyDown={(e) => {
          if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
          const t = e.target as HTMLElement;
          if (t.isContentEditable || t instanceof HTMLTextAreaElement) return;
          if (t instanceof HTMLInputElement && t.type !== 'checkbox' && t.type !== 'radio') return;
          e.preventDefault();
          if (searchRef && typeof searchRef === 'object') searchRef.current?.focus();
        }}
      >
        <Field
          label={S.searchLabel}
          labelSuffix={
            <span className="text-xs text-muted">
              <Kbd>/</Kbd>
            </span>
          }
        >
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
            />
            <TextInput
              ref={searchRef}
              type="search"
              className="pl-8"
              value={prefs.query}
              placeholder={S.searchPlaceholder}
              autoComplete="off"
              onChange={(e) => patch({ query: e.target.value })}
            />
          </div>
        </Field>
        <Field label={S.categoryLabel}>
          <Segmented<CategoryId | 'all'>
            size="sm"
            className="flex-wrap"
            value={prefs.category}
            onValueChange={(v) => patch({ category: v })}
            options={[
              { value: 'all', label: S.all },
              ...CATEGORY_IDS.map((c) => ({ value: c, label: CATEGORY_NAMES[c] })),
            ]}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Field label={S.thumbBg}>
            <Segmented<ThumbBg>
              size="sm"
              value={prefs.thumbBg}
              onValueChange={(v) => patch({ thumbBg: v })}
              options={(['dark', 'light', 'checker'] as const).map((v) => ({
                value: v,
                label: S.thumbBgs[v],
              }))}
            />
          </Field>
          <Field label={S.motion} layout="inline" hint={S.motionHint}>
            <Toggle checked={prefs.motion} onCheckedChange={(v) => patch({ motion: v })} />
          </Field>
          <p
            className="m-0 ml-auto text-sm text-muted tabular-nums"
            aria-live="polite"
            data-testid="result-count"
          >
            <span aria-hidden>{S.resultCount(list.length, PRESETS.length)}</span>
            <span className="sr-only">{S.resultCountLabel(list.length, PRESETS.length)}</span>
          </p>
        </div>
      </section>
      {list.length ? (
        <TemplateGallery
          aria-label={S.presetListLabel}
          templates={items}
          onApply={(t) => choosePreset(t.data)}
          activeId={prefs.started ? presetId : null}
          confirm={false}
          filter={false}
        />
      ) : (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted"
          data-testid="gallery-empty"
        >
          <p className="m-0">{S.empty}</p>
          <Button size="sm" onClick={clear}>
            {S.clearFilters}
          </Button>
        </div>
      )}
    </div>
  );
}
