/**
 * 設定欄：背景圖片（載入、範例圖、清除、圖片資訊）、效果分頁（動態／濾鏡卡片）、輸出設定。
 */
import { ImagePlus, Sparkles, Trash2, X } from 'lucide-react';
import { type RefObject, useCallback, useMemo } from 'react';
import {
  ASPECT_IDS,
  FILTER_PRESET_IDS,
  makeCanvas,
  QUALITY_LEVELS,
  type QualityLevel,
} from '@/core/image';
import { coverPlacement, type SizedImage } from '@/core/motion';
import {
  Button,
  EffectGrid,
  type EffectGridItem,
  type ExportPanelHandle,
  Field,
  FileDrop,
  NativeNumberInput,
  Section,
  Segmented,
  Select,
  Tabs,
  TextInput,
  Toggle,
} from '@/ui';
import {
  autoBase,
  clearImages,
  loadFiles,
  loadSample,
  selectEffect,
  selectFilter,
  setLoop,
} from './actions';
import { EFFECT_IDS, EFFECTS, type EffectId } from './effects';
import { approxKb, outputSize, SECONDS_MAX, SECONDS_MIN, type SizeChoice } from './logic';
import { drawEffectThumb, drawFilterThumb } from './render';
import { patchSettings, useSession, useSettings } from './store';
import { EFFECT_TEXT, FILTER_TEXT, type FilterChoice, S } from './strings';

export const ACCEPT = 'image/png,image/jpeg,image/webp';

/* ---------- 背景圖片 ---------- */

function ImageInfo() {
  const images = useSession((st) => st.images);
  if (!images.length)
    return (
      <p className="m-0 text-sm text-muted" data-testid="image-info">
        {S.emptyInfo}
      </p>
    );
  const first = images[0];
  const kb = approxKb(images.reduce((a, i) => a + i.bytes, 0));
  if (images.length === 1)
    return (
      <div className="flex min-w-0 flex-col text-sm" data-testid="image-info">
        <strong className="truncate font-medium" title={first.name}>
          {first.name}
        </strong>
        <span className="text-muted tabular-nums">
          {first.width} × {first.height} px・約 {kb} KB
        </span>
      </div>
    );
  return (
    <div className="flex min-w-0 flex-col text-sm" data-testid="image-info">
      <span className="tabular-nums">
        {S.multiInfo(images.length, first.width, first.height, kb)}
      </span>
      <ul className="m-0 list-none p-0 text-muted">
        {images.slice(0, 3).map((i) => (
          <li key={i.id} className="truncate" title={i.name}>
            {i.name}
          </li>
        ))}
        {images.length > 3 ? <li>{S.moreImages(images.length - 3)}</li> : null}
      </ul>
    </div>
  );
}

export function ImagePanel({ exportRef }: { exportRef: RefObject<ExportPanelHandle | null> }) {
  const exporting = useSession((st) => st.exporting);
  return (
    <Section title={S.sectionImage} persistKey="bg-motion:image">
      <div className="flex flex-col gap-3">
        <FileDrop
          onFiles={(files) => void loadFiles(files)}
          accept={ACCEPT}
          filterByAccept={false}
          multiple
          clickable
          icon={<ImagePlus />}
          label={S.dropLabel}
          buttonLabel={S.dropButton}
          hint={S.dropHint}
          disabled={exporting}
          aria-label={S.dropLabel}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Sparkles />}
            onClick={() => void loadSample()}
            disabled={exporting}
            title={S.sampleHint}
          >
            {S.sample}
          </Button>
          {exporting ? (
            <Button variant="danger" icon={<X />} onClick={() => exportRef.current?.cancel()}>
              {S.cancelExport}
            </Button>
          ) : (
            <Button icon={<Trash2 />} onClick={clearImages} title={S.clearHint}>
              {S.clear}
            </Button>
          )}
        </div>
        <ImageInfo />
      </div>
    </Section>
  );
}

/* ---------- 效果與濾鏡 ---------- */

const EFFECT_ITEMS: EffectGridItem<EffectId>[] = EFFECT_IDS.map((id) => ({
  value: id,
  ...EFFECT_TEXT[id],
}));

const FILTER_ITEMS: EffectGridItem<FilterChoice>[] = (['none', ...FILTER_PRESET_IDS] as const).map(
  (id) => ({ value: id, ...FILTER_TEXT[id] }),
);

/** 濾鏡縮圖的來源：第一張圖縮成 400 × 225（蓋滿、置中） */
function useFilterThumbSource(): SizedImage | null {
  const first = useSession((st) => st.images[0] ?? null);
  return useMemo(() => {
    if (!first) return null;
    const c = makeCanvas(400, 225);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) return null;
    const p = coverPlacement(first.width, first.height, 400, 225);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(first.bitmap, p.x, p.y, p.width, p.height);
    return c;
  }, [first]);
}

export function EffectTabs() {
  const effect = useSettings((st) => st.data.effect);
  const filter = useSettings((st) => st.data.filter);
  const tab = useSettings((st) => st.data.tab);
  const thumbSource = useFilterThumbSource();
  const drawFilter = useCallback(
    (ctx: CanvasRenderingContext2D, f: FilterChoice) => drawFilterThumb(ctx, f, thumbSource),
    [thumbSource],
  );
  return (
    <Tabs<'motion' | 'filter'>
      aria-label={S.tabsLabel}
      value={tab}
      onValueChange={(v) => patchSettings({ tab: v })}
      items={[
        {
          value: 'motion',
          label: S.tabMotion,
          content: (
            <div className="flex flex-col gap-2 pt-1">
              <p className="m-0 text-xs text-muted">{S.motionHint}</p>
              <EffectGrid<EffectId>
                aria-label={S.motionGridLabel}
                items={EFFECT_ITEMS}
                value={effect}
                onValueChange={selectEffect}
                allowDeselect
                draw={drawEffectThumb}
                columns={3}
                minItemWidth={96}
                period={2}
                stillTime={0.35}
                renderBadge={(it) =>
                  EFFECTS[it.value].loop ? (
                    <span className="rounded-sm bg-surface/85 px-1 text-[10px] leading-4 text-muted">
                      {S.loopBadge}
                    </span>
                  ) : null
                }
              />
            </div>
          ),
        },
        {
          value: 'filter',
          label: S.tabFilter,
          content: (
            <div className="flex flex-col gap-2 pt-1">
              <EffectGrid<FilterChoice>
                aria-label={S.filterGridLabel}
                items={FILTER_ITEMS}
                value={filter}
                onValueChange={(v) => selectFilter(v ?? 'none')}
                draw={drawFilter}
                animate="none"
                stillTime={0}
                columns={3}
                minItemWidth={96}
              />
              <p className="m-0 text-xs text-muted">{S.filterNote}</p>
            </div>
          ),
        },
      ]}
    />
  );
}

/* ---------- 輸出設定 ---------- */

const QUALITY_OPTIONS = QUALITY_LEVELS.map((q) => ({ value: q, label: S.qualities[q] }));

export function OutputPanel() {
  const s = useSettings((st) => st.data);
  const first = useSession((st) => st.images[0] ?? null);
  const sourceBase = useSession((st) => st.sourceBase);
  const auto = autoBase(s, sourceBase);
  const size = outputSize(s.quality, s.size, first);
  const sizeOptions = useMemo(
    () => [
      { value: 'original' as SizeChoice, label: S.originalSize },
      ...ASPECT_IDS.map((id) => {
        const o = outputSize(s.quality, id, null);
        return { value: id as SizeChoice, label: S.aspectLabel(id, o.width, o.height) };
      }),
    ],
    [s.quality],
  );
  return (
    <Section title={S.sectionOutput} persistKey="bg-motion:output">
      <div className="flex flex-col gap-3">
        <Field label={S.fileName} hint={S.fileNameHint}>
          <TextInput
            value={s.fileName ?? auto}
            onChange={(e) => patchSettings({ fileName: e.target.value })}
            spellCheck={false}
            autoComplete="off"
            data-testid="file-name"
          />
        </Field>
        <Field label={S.seconds} hint={S.secondsHint}>
          <NativeNumberInput
            value={s.secondsText}
            onChange={(v) => patchSettings({ secondsText: v })}
            min={SECONDS_MIN}
            max={SECONDS_MAX}
            step={0.5}
            unit="秒"
            stepLabels={{ up: S.secondsUp, down: S.secondsDown }}
          />
        </Field>
        <Field label={S.quality} hint={S.qualityHint}>
          <Segmented<QualityLevel>
            value={s.quality}
            onValueChange={(quality) => patchSettings({ quality })}
            options={QUALITY_OPTIONS}
            fullWidth
          />
        </Field>
        <Field label={S.size} hint={S.sizeHint}>
          <Select<SizeChoice>
            value={s.size}
            onValueChange={(v) => patchSettings({ size: v })}
            options={sizeOptions}
          />
        </Field>
        <Field label={S.loop} layout="inline" hint={S.loopHint}>
          <Toggle checked={s.loop} onCheckedChange={setLoop} />
        </Field>
        <p className="m-0 text-xs text-muted tabular-nums">
          {S.outputSize(size.width, size.height)}
        </p>
      </div>
    </Section>
  );
}
