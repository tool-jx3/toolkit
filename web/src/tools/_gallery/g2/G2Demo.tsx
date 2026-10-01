/**
 * 元件展示頁「轉場與動態」分頁（G2 共用層）的設定欄。預覽欄（右邊）在 G2Preview.tsx。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { moveItem } from '@/core/compose';
import { animationTimeline, type DecodedAnimation, decodeAnimatedImage } from '@/core/decode';
import { formatDataSize, naturalSort } from '@/core/files';
import {
  applyFilterOps,
  FILTER_PRESET_IDS,
  FILTER_PRESETS,
  type FilterPresetId,
} from '@/core/image';
import { drawImageMotion, type SizedImage, VANISH_KINDS, type VanishKind } from '@/core/motion';
import { historyGesture, useUndoRedo } from '@/core/storage';
import { type CurveName, evaluateKeyframes, keyframesDuration } from '@/core/timeline';
import type { TransitionMode } from '@/core/transition';
import {
  ColorField,
  EffectGrid,
  type EffectGridItem,
  Field,
  FileDrop,
  IconButton,
  KeyframeTable,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  type ThumbnailItem,
  ThumbnailList,
  Toggle,
} from '@/ui';
import {
  CURVE_OPTIONS,
  drawCurveThumb,
  drawShapeThumb,
  FILTER_LABELS,
  loadDemoImage,
  MOTION_ITEMS,
  SHAPE_ITEMS,
  VANISH_LABELS,
} from './scenes';
import { DEFAULT_SCHEDULE, type G2Settings, type G2View, useG2, useG2Preview } from './store';

const MODES: { value: TransitionMode; label: string }[] = [
  { value: 'cover', label: '蓋上' },
  { value: 'reveal', label: '揭開' },
  { value: 'sweep', label: '掃過' },
];

const FPS_OPTIONS = [12, 15, 24, 30].map((v) => ({ value: String(v), label: `${v} FPS` }));

const CURVE_ITEMS: EffectGridItem<CurveName>[] = CURVE_OPTIONS.map((c) => ({
  value: c.value,
  label: c.label,
}));

/** 節點表可選的曲線（讀取動畫常用的幾種） */
const SCHEDULE_CURVES = CURVE_OPTIONS.filter((c) =>
  ['linear', 'smoothstep', 'cubicIn', 'cubicOut', 'cubicInOut', 'steps10'].includes(c.value),
);

const FILTER_ITEMS: EffectGridItem<FilterPresetId>[] = FILTER_PRESET_IDS.map((id) => ({
  value: id,
  label: FILTER_LABELS[id].label,
  group: FILTER_LABELS[id].group,
}));

const VANISH_OPTIONS = VANISH_KINDS.map((k) => ({ value: k, label: VANISH_LABELS[k] }));

function UndoButtons() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useG2);
  return (
    <>
      <IconButton
        size="sm"
        label="復原（轉場與動態）"
        icon={<Undo2 />}
        onClick={undo}
        disabled={!canUndo}
      />
      <IconButton
        size="sm"
        label="重做（轉場與動態）"
        icon={<Redo2 />}
        onClick={redo}
        disabled={!canRedo}
      />
    </>
  );
}

/** 改設定的同時把預覽切到相關的畫面 */
function useSet() {
  const update = useG2((st) => st.update);
  const setPreview = useG2Preview((st) => st.patch);
  return useCallback(
    <K extends keyof G2Settings>(key: K, value: G2Settings[K], view: G2View = 'transition') => {
      update((d) => {
        d[key] = value;
      });
      if (useG2Preview.getState().data.view !== view) setPreview({ view });
    },
    [update, setPreview],
  );
}

/* ---------- 轉場 ---------- */

function TransitionControls() {
  const s = useG2((st) => st.data);
  const set = useSet();
  const g = useMemo(() => historyGesture(useG2), []);
  return (
    <>
      <Section
        title="轉場形狀 EffectGrid"
        persistKey="_gallery:g2:shapes"
        actions={<UndoButtons />}
      >
        <p className="m-0 text-xs text-muted">
          效果卡片：滑過或選取時播放示意動畫，←→ 依序、↑↓ 換列、Home／End
          到頭尾。形狀由「抵達時間圖」（core/transition）決定，每個像素 0～255。
        </p>
        <EffectGrid
          aria-label="轉場形狀"
          items={SHAPE_ITEMS}
          value={s.shape}
          onValueChange={(v) => v && set('shape', v)}
          draw={drawShapeThumb}
          thumbWidth={128}
          thumbHeight={72}
          minItemWidth={112}
          stillTime={0.3}
        />
      </Section>
      <Section title="轉場設定 core/transition" persistKey="_gallery:g2:transition">
        <Field label="方式">
          <Segmented
            value={s.mode}
            onValueChange={(v) => set('mode', v)}
            options={MODES}
            size="sm"
          />
        </Field>
        <Field label="邊緣柔和">
          <Slider
            value={s.softness}
            onChange={g.live((v) => set('softness', v))}
            onCommit={g.commit}
            min={0}
            max={100}
          />
        </Field>
        <Field label="蓋到">
          <Slider
            value={s.reach}
            onChange={g.live((v) => set('reach', v))}
            onCommit={g.commit}
            min={10}
            max={100}
            unit="%"
          />
        </Field>
        <Toggle
          label="由外往內（反過來的抵達順序）"
          checked={s.reverseOrder}
          onCheckedChange={(v) => set('reverseOrder', v)}
        />
        <Field label="顏色">
          <ColorField value={s.color} onChange={(c) => set('color', c)} />
        </Field>
        <Toggle label="邊緣發光" checked={s.glow} onCheckedChange={(v) => set('glow', v)} />
        <Show when={s.glow}>
          <Field label="發光顏色">
            <ColorField value={s.glowColor} onChange={(c) => set('glowColor', c)} />
          </Field>
        </Show>
        <Field label="轉場時間">
          <Slider
            value={s.duration}
            onChange={g.live((v) => set('duration', v))}
            onCommit={g.commit}
            min={0.2}
            max={5}
            step={0.1}
            precision={1}
            unit="秒"
          />
        </Field>
        <Field label="結尾停留">
          <Slider
            value={s.hold}
            onChange={g.live((v) => set('hold', v))}
            onCommit={g.commit}
            min={0}
            max={3}
            step={0.1}
            precision={1}
            unit="秒"
          />
        </Field>
        <Field label="FPS">
          <Select
            value={String(s.fps)}
            onValueChange={(v) => set('fps', Number(v))}
            options={FPS_OPTIONS}
            size="sm"
          />
        </Field>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Toggle label="來回" checked={s.roundTrip} onCheckedChange={(v) => set('roundTrip', v)} />
          <Toggle
            label="倒著播"
            checked={s.reversePlay}
            onCheckedChange={(v) => set('reversePlay', v)}
          />
          <Toggle label="重複播放" checked={s.loop} onCheckedChange={(v) => set('loop', v)} />
        </div>
        <p className="m-0 text-xs text-muted">
          影格表由 transitionFrames 產生：每格 1 ÷ FPS
          秒，停留加在最後一格（倒著播時在第一格）；來回是 2n − 1 格。檔案只播一次時，預覽每輪結尾停
          1.2 秒（usePlayback 的 loopGap）。
        </p>
      </Section>
    </>
  );
}

/* ---------- 曲線與節點表 ---------- */

function ScheduleChart({ keys }: { keys: G2Settings['schedule'] }) {
  const W = 240;
  const H = 72;
  const total = Math.max(0.001, keyframesDuration(keys));
  const pts: string[] = [];
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * total;
    pts.push(
      `${((t / total) * W).toFixed(1)},${(H - (evaluateKeyframes(keys, t) / 100) * H).toFixed(1)}`,
    );
  }
  return (
    <svg
      viewBox={`-4 -4 ${W + 8} ${H + 8}`}
      className="h-auto w-full max-w-80 rounded-sm bg-surface-2"
      aria-hidden
    >
      <polyline points={pts.join(' ')} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
      {keys.map((k) => (
        <circle
          key={`${k.time}:${k.value}`}
          cx={(k.time / total) * W}
          cy={H - (k.value / 100) * H}
          r={3}
          fill="var(--color-fg)"
        />
      ))}
    </svg>
  );
}

function CurveControls() {
  const s = useG2((st) => st.data);
  const set = useSet();
  const update = useG2((st) => st.update);
  return (
    <>
      <Section title="曲線 core/timeline curves" persistKey="_gallery:g2:curves">
        <p className="m-0 text-xs text-muted">
          點選曲線套到轉場（右邊預覽）。明滅、雷閃、心跳不是單調遞增，會來回閃動。
        </p>
        <EffectGrid
          aria-label="轉場曲線"
          items={CURVE_ITEMS}
          value={s.curve}
          onValueChange={(v) => v && set('curve', v)}
          draw={drawCurveThumb}
          thumbWidth={120}
          thumbHeight={72}
          minItemWidth={104}
          animate="hover"
        />
      </Section>
      <Section title="節點表 KeyframeTable" persistKey="_gallery:g2:keyframes">
        <p className="m-0 text-xs text-muted">
          時間（秒）、數值（%）與到這個節點的曲線。輸入時只改那一格，離開欄位才整理（排序、間隔至少
          0.05 秒、數值不倒退、最後一個是 100%）。新增插在間隔最大的地方，最少 2、最多 16 個。
        </p>
        <KeyframeTable
          aria-label="讀取進度節點"
          value={s.schedule}
          onChange={(keys) =>
            update((d) => {
              d.schedule = keys;
            })
          }
          curves={SCHEDULE_CURVES}
          defaults={DEFAULT_SCHEDULE}
        />
        <ScheduleChart keys={s.schedule} />
      </Section>
    </>
  );
}

/* ---------- 濾鏡、圖片動態、結尾消失 ---------- */

const filterThumbs = new Map<string, ImageData>();

function MotionControls() {
  const s = useG2((st) => st.data);
  const set = useSet();
  const g = useMemo(() => historyGesture(useG2), []);
  const [image, setImage] = useState<SizedImage | null>(null);
  useEffect(() => {
    let alive = true;
    loadDemoImage()
      .then((b) => alive && setImage(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  /* 圖片載入後 draw 換一個，卡片重畫 */
  const drawFilter = useCallback(
    (ctx: CanvasRenderingContext2D, id: FilterPresetId) => {
      const { width: W, height: H } = ctx.canvas;
      if (!image) {
        ctx.fillStyle = '#3a3150';
        ctx.fillRect(0, 0, W, H);
        return;
      }
      const key = `${id}:${W}x${H}`;
      let img = filterThumbs.get(key);
      if (!img) {
        drawImageMotion(ctx, image, W, H);
        const src = ctx.getImageData(0, 0, W, H);
        img = new ImageData(applyFilterOps(src.data, W, H, FILTER_PRESETS[id]), W, H);
        filterThumbs.set(key, img);
      }
      ctx.putImageData(img, 0, 0);
    },
    [image],
  );
  return (
    <>
      <Section title="濾鏡 EffectGrid（可取消選取）" persistKey="_gallery:g2:filters">
        <p className="m-0 text-xs text-muted">
          allowDeselect：再點一次選取中的卡片（或按空白鍵）取消，回到「無濾鏡」。濾鏡是 core/image
          的 FILTER_PRESETS（一串
          FilterOp）；模糊、馬賽克、錯位、掃描線以輸出像素計，所以小縮圖看起來比較強。
        </p>
        <p className="m-0 text-xs text-muted" data-testid="g2-filter-current">
          目前：{s.filter ? FILTER_LABELS[s.filter].label : '無濾鏡'}
        </p>
        <EffectGrid
          aria-label="濾鏡"
          items={FILTER_ITEMS}
          value={s.filter}
          onValueChange={(v) => set('filter', v, 'motion')}
          allowDeselect
          draw={drawFilter}
          thumbWidth={128}
          thumbHeight={72}
          minItemWidth={96}
          animate="none"
        />
      </Section>
      <Section title="圖片動態與結尾消失 core/motion" persistKey="_gallery:g2:motion">
        <EffectGrid
          aria-label="圖片動態"
          items={MOTION_ITEMS}
          value={s.motion}
          onValueChange={(v) => set('motion', v, 'motion')}
          allowDeselect
          minItemWidth={120}
        />
        <Field label="結尾消失">
          <Select
            value={s.vanish}
            onValueChange={(v) => set('vanish', v as VanishKind, 'motion')}
            options={VANISH_OPTIONS}
            size="sm"
          />
        </Field>
        <Field label="消失強度">
          <Slider
            value={s.intensity}
            onChange={g.live((v) => set('intensity', v, 'motion'))}
            onCommit={g.commit}
            min={0.5}
            max={1.5}
            step={0.05}
            precision={2}
            unit="倍"
          />
        </Field>
      </Section>
    </>
  );
}

/* ---------- 動畫圖檔解碼 ---------- */

interface DecodedItem extends ThumbnailItem {
  anim: DecodedAnimation;
  image: ImageBitmap;
}

const FORMAT_LABEL: Record<DecodedAnimation['format'], string> = {
  apng: 'APNG',
  png: 'PNG',
  gif: 'GIF',
  webp: 'WebP',
  image: '圖片',
};

function DecodeDemo() {
  const [items, setItems] = useState<DecodedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  /* 卸載時釋放縮圖 */
  const latest = useRef(items);
  latest.current = items;
  useEffect(
    () => () => {
      for (const it of latest.current) it.image.close();
    },
    [],
  );
  const onFiles = async (files: File[]) => {
    setError(null);
    const added: DecodedItem[] = [];
    for (const file of naturalSort(files, (f) => f.name)) {
      try {
        const anim = await decodeAnimatedImage(file, { maxFrames: 500 });
        const first = anim.frames[0];
        const image = await createImageBitmap(new ImageData(first.rgba, anim.width, anim.height));
        const total = animationTimeline(anim.frames.map((f) => f.delayMs)).total;
        added.push({
          id: `d${++seq.current}`,
          name: file.name,
          image,
          anim,
          meta: (
            <span data-testid="g2-decode-meta">
              {FORMAT_LABEL[anim.format]}・{anim.width}×{anim.height}・{anim.frames.length} 格・
              {(total / 1000).toFixed(2)} 秒・
              {anim.loops === 0 ? '無限循環' : `播 ${anim.loops} 次`}・{formatDataSize(file.size)}
              {anim.truncated ? '（超過 500 格，已截斷）' : ''}
            </span>
          ),
        });
      } catch (e) {
        setError(`${file.name}：${e instanceof Error ? e.message : '無法解碼'}`);
      }
    }
    if (added.length) setItems((list) => naturalSort([...list, ...added], (it) => it.name));
  };
  const frames = items.reduce((n, it) => n + it.anim.frames.length, 0);
  return (
    <Section title="動畫圖檔解碼 core/decode＋ThumbnailList" persistKey="_gallery:g2:decode">
      <p className="m-0 text-xs text-muted">
        APNG、GIF 用純 JavaScript 拆格，動態 WebP 解析結構後每格交給瀏覽器解碼；最多 500
        格。加入的檔案依檔名自然排序（2 排在 10 前面），之後可拖曳或
        Alt＋方向鍵調整順序。可以先在右邊「轉場」匯出一個 WebP／APNG 再拖進來試。
      </p>
      <FileDrop
        onFiles={(f) => void onFiles(f)}
        accept="image/png,image/apng,image/gif,image/webp"
        filterByAccept={false}
        multiple
        paste="focus"
        compact
        label="拖放動畫圖檔"
        hint="APNG、GIF、動態 WebP（也可以是單張圖片）"
        aria-label="動畫圖檔"
      />
      {error ? (
        <p className="m-0 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <p className="m-0 text-xs text-muted" data-testid="g2-decode-summary">
        {items.length ? `${items.length} 個檔案・共 ${frames} 格` : '還沒有檔案'}
      </p>
      <ThumbnailList
        aria-label="已解碼的動畫"
        items={items}
        thumbAspect={16 / 9}
        thumbFit="cover"
        minItemWidth={132}
        numbered
        onReorder={(from, to) => setItems((list) => moveItem(list, from, to))}
        onRemove={(id) =>
          setItems((list) => {
            list.find((it) => it.id === id)?.image.close();
            return list.filter((it) => it.id !== id);
          })
        }
      />
    </Section>
  );
}

export function G2Demo() {
  return (
    <div className="flex flex-col gap-3">
      <TransitionControls />
      <CurveControls />
      <MotionControls />
      <DecodeDemo />
    </div>
  );
}
