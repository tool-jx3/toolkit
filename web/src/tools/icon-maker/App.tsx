import { Copy, Download, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { copyImage, downloadBlob } from '@/core/files';
import { canvasToBlob, loadImage } from '@/core/image';
import type { Box } from '@/core/layout';
import { createToolStore } from '@/core/storage';
import {
  Button,
  Field,
  IconButton,
  LayoutEditor,
  type LayoutItem,
  Section,
  Segmented,
  type Shortcut,
  Slider,
  Stage,
  TextInput,
  ThumbChoice,
  ToolShell,
  useToast,
} from '@/ui';
import { LoadArea } from './LoadArea';
import {
  BACKGROUND_KINDS,
  type BackgroundKind,
  boxCenter,
  CANVAS,
  canZoom,
  clampImageBox,
  clampPlateBox,
  defaultLayout,
  defaultSettings,
  FONT_IDS,
  type FontId,
  FRAME_KINDS,
  FRAME_RANGE,
  type FrameKind,
  formatScale,
  frameWidthPx,
  HO_STYLES,
  type HoStyle,
  type IconSettings,
  type ItemId,
  imageBox,
  innerRect,
  nameBoxOf,
  type Orientation,
  PLATE_LIMITS,
  PRESETS,
  presetById,
  SAFE_AREA,
  zoomStep,
} from './logic';
import {
  drawFrameThumb,
  drawIcon,
  ensureIconFonts,
  type IconImage,
  imageSize,
  renderIcon,
} from './render';
import { S } from './strings';

/** 規格 F35：不保留任何設定（重新整理就回到預設） */
const useIcon = createToolStore<IconSettings>('icon-maker', defaultSettings(), {
  persist: false,
});

interface Loaded {
  bitmap: ImageBitmap;
  name: string;
}

/* 方向鍵、Delete、Esc 由 LayoutEditor 處理，這裡只列在快捷鍵說明裡 */
const SHORTCUTS: Shortcut[] = [
  {
    keys: ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'],
    label: S.shortcutNudge,
    group: S.shortcutGroup,
  },
  {
    keys: ['shift+arrowup', 'shift+arrowdown', 'shift+arrowleft', 'shift+arrowright'],
    label: S.shortcutNudgeBig,
    group: S.shortcutGroup,
  },
  { keys: ['delete', 'backspace'], label: S.shortcutDeselect, group: S.shortcutGroup },
  { keys: 'escape', label: S.shortcutEscape, group: S.shortcutGroup },
];

const opts = <V extends string>(values: readonly V[], labels: Record<V, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

function Usage() {
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usageNotesTitle}</p>
      <ul>
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

function Summary({ s, selected }: { s: IconSettings; selected: ItemId | null }) {
  const text = (v: string) => (v.trim() === '' ? S.empty : v);
  const rows: [string, string, string][] = [
    ['preset', S.summary.preset, presetById(s.preset).name],
    ['frame-kind', S.summary.frameKind, S.frameKinds[s.frameKind]],
    ['background', S.summary.background, S.backgrounds[s.background]],
    ['frame-width', S.summary.frameWidth, S.px(s.frameWidth)],
    ['image-scale', S.summary.imageScale, formatScale(s.imageScale)],
    ['name', S.summary.name, text(s.name)],
    ['ho', S.summary.ho, text(s.hoText)],
    ['selected', S.summary.selected, selected ? S.items[selected] : S.noSelection],
  ];
  return (
    <section
      aria-label={S.summaryTitle}
      className="rounded-lg border border-border bg-surface px-3 py-2.5"
      data-testid="summary"
    >
      <h2 className="m-0 mb-1.5 text-sm font-semibold">{S.summaryTitle}</h2>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
        {rows.map(([key, label, value]) => (
          <Fragment key={key}>
            <dt className="text-muted">{label}</dt>
            <dd className="m-0 truncate" title={value} data-testid={`summary-${key}`}>
              {value}
            </dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

/** 下載 PNG 與複製圖片（規格 F29～F31）：另開一張 1024 畫布，用同一段繪圖程式畫 */
function OutputButtons({ image }: { image: IconImage | null }) {
  const toast = useToast();
  const download = async () => {
    try {
      const c = await renderIcon(useIcon.getState().data, image);
      downloadBlob(await canvasToBlob(c), S.fileName);
    } catch (e) {
      toast({
        title: S.downloadFailed,
        description: e instanceof Error ? e.message : undefined,
        tone: 'danger',
      });
    }
  };
  const copy = async () => {
    /* Safari 要在點擊當下呼叫剪貼簿：直接把產生中的 Promise 交出去 */
    const blob = renderIcon(useIcon.getState().data, image).then((c) => canvasToBlob(c));
    const r = await copyImage(blob);
    toast(
      r.ok
        ? { title: S.copied, description: S.copiedHint, tone: 'success' }
        : { title: S.copyFailed, description: S.copyFailedHint, tone: 'warning' },
    );
  };
  return (
    <div className="ml-auto flex flex-wrap gap-2">
      <Button icon={<Copy />} onClick={() => void copy()}>
        {S.copy}
      </Button>
      <Button variant="primary" icon={<Download />} onClick={() => void download()}>
        {S.download}
      </Button>
    </div>
  );
}

const roundBox = (b: Box) => ({
  x: +b.x.toFixed(3),
  y: +b.y.toFixed(3),
  width: +b.width.toFixed(3),
  height: +b.height.toFixed(3),
});

export function App() {
  const s = useIcon((st) => st.data);
  const update = useIcon((st) => st.update);
  const patch = useIcon((st) => st.patch);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const loadedRef = useRef<Loaded | null>(null);
  const [selected, setSelected] = useState<ItemId | null>('name');
  const [fontTick, setFontTick] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  const image = useMemo<IconImage | null>(
    () =>
      loaded
        ? { source: loaded.bitmap, width: loaded.bitmap.width, height: loaded.bitmap.height }
        : null,
    [loaded],
  );

  /* 字型載好之後重畫（中文字型只下載用到的字） */
  useEffect(() => {
    let alive = true;
    void ensureIconFonts({ name: s.name, font: s.font, hoText: s.hoText }).then(() => {
      if (alive) setFontTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [s.name, s.font, s.hoText]);

  /* 預覽：與下載同一段繪圖程式 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載好後重畫
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawIcon(ctx, s, image);
  }, [s, image, fontTick]);

  useEffect(
    () => () => {
      loadedRef.current?.bitmap.close();
    },
    [],
  );

  /** 解碼失敗時丟錯（LoadArea 顯示訊息） */
  const loadFile = async (file: File): Promise<void> => {
    const bitmap = await loadImage(file);
    loadedRef.current?.bitmap.close();
    const next = { bitmap, name: file.name };
    loadedRef.current = next;
    setLoaded(next);
    /* 規格 F04：位置與倍率沿用目前值；載入後選取圖片 */
    setSelected('image');
  };

  const inner = innerRect(s.frameWidth);
  const preset = presetById(s.preset);

  const items: LayoutItem[] = [
    {
      id: 'image',
      label: S.items.image,
      box: imageBox(s.imageCenter, s.imageScale, imageSize(image)),
      /* 圖片可以比內側區域大很多：只有看得到的部分可以點 */
      clipToFrame: true,
      clamp: (b) => clampImageBox(b),
    },
    {
      id: 'name',
      label: S.items.name,
      box: nameBoxOf(s),
      resizable: true,
      limits: PLATE_LIMITS,
      /* 改大小時左上角不動 */
      clamp: (b, op) => (op === 'move' ? clampPlateBox(b) : b),
    },
    {
      id: 'ho',
      label: S.items.ho,
      box: s.ho,
      resizable: true,
      limits: PLATE_LIMITS,
      clamp: (b, op) => (op === 'move' ? clampPlateBox(b) : b),
    },
  ];

  const setBox = (id: string, b: Box) =>
    update((d) => {
      if (id === 'image') d.imageCenter = boxCenter(b);
      else if (id === 'name') {
        if (d.orientation === 'vertical') d.nameV = b;
        else d.nameH = b;
      } else if (id === 'ho') d.ho = b;
    });

  const zoom = (dir: 1 | -1) =>
    update((d) => {
      d.imageScale = zoomStep(d.imageScale, dir);
    });

  const resetLayout = () => {
    update((d) => Object.assign(d, defaultLayout()));
    setSelected('name');
  };

  const drawPreset = useCallback(
    (ctx: CanvasRenderingContext2D, id: string) =>
      drawFrameThumb(ctx, presetById(id), s.frameKind, s.background),
    [s.frameKind, s.background],
  );
  const drawBackgroundThumb = useCallback(
    (ctx: CanvasRenderingContext2D, kind: BackgroundKind) =>
      drawFrameThumb(ctx, preset, s.frameKind, kind),
    [preset, s.frameKind],
  );

  const settings = (
    <>
      <Section title={S.sectionImage}>
        <LoadArea fileName={loaded?.name ?? null} onFile={loadFile} />
        <p className="m-0 text-xs text-muted" data-testid="privacy">
          {S.privacy}
        </p>
      </Section>
      <Section title={S.sectionFrame}>
        <Field label={S.frameKind}>
          <Segmented<FrameKind>
            value={s.frameKind}
            onValueChange={(v) => patch({ frameKind: v })}
            options={opts(FRAME_KINDS, S.frameKinds)}
            fullWidth
          />
        </Field>
        <Field label={S.preset} hint={S.presetHint}>
          <ThumbChoice
            value={s.preset}
            onValueChange={(v) => patch({ preset: v })}
            options={PRESETS.map((p) => ({ value: p.id, label: p.name }))}
            draw={drawPreset}
            thumbWidth={180}
            thumbHeight={48}
            minItemWidth={92}
          />
        </Field>
        <Field label={S.background} hint={S.backgroundHint}>
          <ThumbChoice<BackgroundKind>
            value={s.background}
            onValueChange={(v) => patch({ background: v })}
            options={opts(BACKGROUND_KINDS, S.backgrounds)}
            draw={drawBackgroundThumb}
            thumbWidth={150}
            thumbHeight={84}
            minItemWidth={92}
          />
        </Field>
        <Field label={S.frameWidth} hint={S.frameWidthHint(Math.round(frameWidthPx(s.frameWidth)))}>
          <Slider
            value={s.frameWidth}
            onChange={(v) => patch({ frameWidth: v })}
            min={FRAME_RANGE.min}
            max={FRAME_RANGE.max}
            step={1}
            unit="px"
          />
        </Field>
      </Section>
      <Section title={S.sectionName}>
        <Field label={S.name}>
          <TextInput
            value={s.name}
            placeholder={S.namePlaceholder}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
        <Field label={S.font} hint={S.fontHint}>
          <Segmented<FontId>
            value={s.font}
            onValueChange={(v) => patch({ font: v })}
            options={opts(FONT_IDS, S.fonts)}
            fullWidth
          />
        </Field>
        <Field label={S.orientation} hint={S.orientationHint}>
          <Segmented<Orientation>
            value={s.orientation}
            onValueChange={(v) => patch({ orientation: v })}
            options={opts(['vertical', 'horizontal'] as const, S.orientations)}
            fullWidth
          />
        </Field>
      </Section>
      <Section title={S.sectionHo}>
        <Field label={S.hoText} hint={S.hoHint}>
          <TextInput value={s.hoText} onChange={(e) => patch({ hoText: e.target.value })} />
        </Field>
        <Field label={S.hoStyle}>
          <Segmented<HoStyle>
            value={s.hoStyle}
            onValueChange={(v) => patch({ hoStyle: v })}
            options={opts(HO_STYLES, S.hoStyles)}
            fullWidth
          />
        </Field>
      </Section>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-3">
      <Stage width={CANVAS} height={CANVAS} aria-label={S.previewLabel}>
        <canvas
          ref={canvas}
          width={CANVAS}
          height={CANVAS}
          className="block size-full"
          data-testid="icon-canvas"
          /* 目前的版面（內側區域的 %），給測試與除錯讀 */
          data-layout={JSON.stringify(
            Object.fromEntries(items.map((it) => [it.id, roundBox(it.box)])),
          )}
        />
        <LayoutEditor
          width={CANVAS}
          height={CANVAS}
          frame={inner}
          units="percent"
          items={items}
          selectedId={selected}
          onSelect={(id) => setSelected(id as ItemId | null)}
          onChange={(id, box, { phase }) => {
            if (phase === 'move' || phase === 'nudge') setBox(id, box);
          }}
          nudgeStep={0.2}
          nudgeShiftStep={2}
          safeArea={SAFE_AREA}
          aria-label={S.editorLabel}
        />
      </Stage>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <IconButton
            label={S.zoomOut}
            icon={<ZoomOut />}
            onClick={() => zoom(-1)}
            disabled={!canZoom(s.imageScale, -1)}
          />
          <span
            className="min-w-20 text-center text-sm tabular-nums text-muted"
            data-testid="image-scale"
          >
            {S.scaleLabel(formatScale(s.imageScale))}
          </span>
          <IconButton
            label={S.zoomIn}
            icon={<ZoomIn />}
            onClick={() => zoom(1)}
            disabled={!canZoom(s.imageScale, 1)}
          />
        </div>
        <Button icon={<RotateCcw />} onClick={resetLayout} title={S.resetLayoutHint}>
          {S.resetLayout}
        </Button>
        <OutputButtons image={image} />
      </div>
      <Summary s={s} selected={selected} />
    </div>
  );

  return (
    <ToolShell
      toolId="icon-maker"
      usage={<Usage />}
      shortcuts={SHORTCUTS}
      settings={settings}
      preview={preview}
    />
  );
}
