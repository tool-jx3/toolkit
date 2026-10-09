/**
 * 設定欄：
 * - 編輯：相框（尺寸、相框顏色）、照片（載入、放大、重設位置）、文字（內容、字型、顏色、字級）；
 * - 裝飾：筆（顏色、粗細）、筆畫圖層（選擇、顯示、上下、清除）、貼紙（加入、清單）。沒有照片時全部停用（F20）。
 */
import {
  Image as ImageIcon,
  ImagePlus,
  RotateCcw,
  Sticker as StickerIcon,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ensureFont } from '@/core/fonts';
import {
  Button,
  ColorField,
  Field,
  FileDrop,
  GestureScope,
  IconButton,
  LayerList,
  Notice,
  Section,
  Segmented,
  Slider,
  TextInput,
  useConfirm,
  useToast,
} from '@/ui';
import { useAssetImages } from './media';
import {
  ASPECT_IDS,
  type AspectId,
  BRUSH_PRESETS,
  BRUSH_RANGE,
  CAPTION_FONTS,
  CAPTION_MAX,
  CAPTION_SIZE_RANGE,
  type CaptionFont,
  clipCaption,
  DEFAULT_CAPTION_COLOR,
  DEFAULT_CARD_BG,
  exportSize,
  hasStrokes,
  layerNumber,
  PEN_PRESETS,
  STICKER_MAX,
  stickerLetter,
  ZOOM_RANGE,
} from './model';
import { CAPTION_FONT_SPEC } from './render';
import {
  activeLayerId,
  clearAllLayers,
  clearLayer,
  docNow,
  edit,
  gesture,
  moveLayerInList,
  moveStickerInList,
  removeSticker,
  resetView,
  selectSticker,
  setAspect,
  setLayerVisible,
  setPen,
  setTool,
  setZoom,
  useDoc,
  usePen,
  useUi,
} from './store';
import { S } from './strings';

/** 相框與文字的常用色 */
const CARD_SWATCHES = [
  DEFAULT_CARD_BG,
  '#ffffff',
  '#f3e9dc',
  '#fde2e4',
  '#dfe7fd',
  '#e2f0cb',
  '#2b2b2b',
  '#111111',
] as const;
const TEXT_SWATCHES = [
  DEFAULT_CAPTION_COLOR,
  '#ffffff',
  '#3a3a3a',
  '#c0392b',
  '#2e6db4',
  '#2e8b57',
  '#8e44ad',
  '#d35400',
] as const;

/* ---------- 編輯 ---------- */

export function FrameSection() {
  const aspect = useDoc((s) => s.data.aspect);
  const cardBg = useDoc((s) => s.data.cardBg);
  const confirm = useConfirm();
  const size = exportSize(aspect);
  const choose = async (a: AspectId) => {
    if (a === docNow().aspect) return;
    if (
      hasStrokes(docNow().layers) &&
      !(await confirm({
        title: S.aspectConfirmTitle,
        description: S.aspectConfirmDesc,
        confirmLabel: S.aspectConfirmLabel,
        danger: true,
      }))
    )
      return;
    setAspect(a);
  };
  return (
    <Section title={S.sectionFrame}>
      <Field
        label={S.aspect}
        hint={<span data-testid="aspect-hint">{S.aspectHint(size.width, size.height)}</span>}
      >
        <Segmented<AspectId>
          value={aspect}
          onValueChange={(a) => void choose(a)}
          options={ASPECT_IDS.map((a) => ({
            value: a,
            label: S.aspects[a],
            ariaLabel: S.aspectAria[a],
          }))}
          fullWidth
        />
      </Field>
      <Field label={S.cardBg}>
        <GestureScope gesture={gesture}>
          <ColorField
            value={cardBg}
            swatches={CARD_SWATCHES}
            onChange={(v) =>
              edit((d) => {
                d.cardBg = v.slice(0, 7).toLowerCase();
              })
            }
          />
        </GestureScope>
      </Field>
    </Section>
  );
}

export function PhotoSection({ onFiles }: { onFiles: (files: File[]) => void }) {
  const photo = useDoc((s) => s.data.photo);
  const zoom = useDoc((s) => s.data.view.zoom);
  return (
    <Section title={S.sectionPhoto}>
      <div data-testid="load-area" data-state={photo ? 'loaded' : 'empty'}>
        <FileDrop
          aria-label={S.dropAreaLabel}
          accept="image/*"
          paste="document"
          filterByAccept={false}
          compact={!!photo}
          icon={photo ? <ImageIcon /> : <ImagePlus />}
          label={
            photo ? (
              <span className="flex min-w-0" data-testid="photo-name">
                <span className="shrink-0">{S.loadedPrefix}</span>
                <span className="truncate" title={photo.name}>
                  {photo.name || '—'}
                </span>
              </span>
            ) : (
              S.dropLabel
            )
          }
          hint={photo ? S.loadedHint : S.dropHint}
          buttonLabel={photo ? S.changePhoto : S.choosePhoto}
          onFiles={onFiles}
        />
      </div>
      <Field label={S.zoom}>
        <Slider
          value={zoom}
          min={ZOOM_RANGE.min}
          max={ZOOM_RANGE.max}
          step={ZOOM_RANGE.step}
          precision={2}
          unit={S.zoomUnit}
          disabled={!photo}
          onChange={gesture.live(setZoom)}
          onCommit={gesture.commit}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<RotateCcw />} onClick={resetView} disabled={!photo}>
          {S.resetView}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">{S.panHint}</p>
      <p className="m-0 text-xs text-muted">{S.privacy}</p>
    </Section>
  );
}

export function CaptionSection() {
  const c = useDoc((s) => s.data.caption);
  /* 字型按鈕以各自的字型顯示（D1）：開頁就載入按鈕上的字（「粗體」「手寫」由補字的中文字型顯示，只下載這兩個字） */
  useEffect(() => {
    for (const f of CAPTION_FONTS) {
      const spec = CAPTION_FONT_SPEC[f];
      void ensureFont(spec.cjk, spec.cjkWeight, S.fonts[f]);
    }
  }, []);
  const set = (recipe: (cap: typeof c) => void) =>
    edit((d) => {
      recipe(d.caption);
    });
  return (
    <Section title={S.sectionCaption}>
      <Field label={S.caption} hint={S.captionHint(Array.from(c.text).length, CAPTION_MAX)}>
        <TextInput
          value={c.text}
          placeholder={S.captionPlaceholder}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          /* 上限以字元計（emoji 算一個）；不用 maxLength（它以 UTF-16 計） */
          onChange={(e) =>
            set((cap) => {
              cap.text = clipCaption(e.target.value);
            })
          }
        />
      </Field>
      <Field label={S.font}>
        <Segmented<CaptionFont>
          value={c.font}
          onValueChange={(v) =>
            set((cap) => {
              cap.font = v;
            })
          }
          options={CAPTION_FONTS.map((f) => ({
            value: f,
            ariaLabel: S.fontAria[f],
            label: (
              <span
                style={{
                  fontFamily: `"${CAPTION_FONT_SPEC[f].family}", "${CAPTION_FONT_SPEC[f].cjk}", sans-serif`,
                  fontWeight: CAPTION_FONT_SPEC[f].weight,
                }}
              >
                {S.fonts[f]}
              </span>
            ),
          }))}
          fullWidth
        />
      </Field>
      <Field label={S.captionColor}>
        <GestureScope gesture={gesture}>
          <ColorField
            value={c.color}
            swatches={TEXT_SWATCHES}
            onChange={(v) =>
              set((cap) => {
                cap.color = v.slice(0, 7).toLowerCase();
              })
            }
          />
        </GestureScope>
      </Field>
      <Field label={S.captionSize}>
        <Slider
          value={c.size}
          min={CAPTION_SIZE_RANGE.min}
          max={CAPTION_SIZE_RANGE.max}
          step={1}
          unit="px"
          onChange={gesture.live((v: number) =>
            set((cap) => {
              cap.size = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
    </Section>
  );
}

/* ---------- 裝飾 ---------- */

export function LockNotice() {
  const hasPhoto = useDoc((s) => !!s.data.photo);
  if (hasPhoto) return null;
  return (
    <div data-testid="decorate-lock">
      <Notice tone="info">{S.needPhoto}</Notice>
    </div>
  );
}

/** 一個色點按鈕 */
function Swatch({
  color,
  label,
  pressed,
  disabled,
  onClick,
}: {
  color: string;
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      data-swatch={color}
      className="size-9 shrink-0 rounded-full border-2 border-border-strong outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40 aria-pressed:border-fg aria-pressed:ring-3 aria-pressed:ring-accent-soft"
      style={{ background: color }}
    />
  );
}

export function PenSection() {
  const hasPhoto = useDoc((s) => !!s.data.photo);
  const color = usePen((s) => s.data.color);
  const size = usePen((s) => s.data.size);
  const isPreset = (PEN_PRESETS as readonly string[]).includes(color);
  return (
    <Section title={S.sectionPen}>
      <Field label={S.penColor}>
        <div className="flex flex-col gap-2">
          {/* biome-ignore lint/a11y/useSemanticElements: 一排切換按鈕（色點），不是表單分組 */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={S.penColor}>
            {PEN_PRESETS.map((c) => (
              <Swatch
                key={c}
                color={c}
                label={S.penColorAria(c)}
                pressed={color === c}
                disabled={!hasPhoto}
                onClick={() => setPen({ color: c })}
              />
            ))}
          </div>
          <div
            className="flex min-w-0 items-center gap-2"
            data-testid="custom-pen"
            data-active={!isPreset || undefined}
          >
            <span className={isPreset ? 'text-xs text-muted' : 'text-xs font-medium text-fg'}>
              {S.customColor}
            </span>
            <div className="min-w-0 flex-1">
              <ColorField
                aria-label={S.customColor}
                value={color}
                swatches={PEN_PRESETS}
                onChange={(v) => setPen({ color: v.slice(0, 7).toLowerCase() })}
                disabled={!hasPhoto}
              />
            </div>
          </div>
        </div>
      </Field>
      <Field label={S.brushSize} hint={S.brushHint}>
        <div className="flex flex-col gap-2">
          <Slider
            value={size}
            min={BRUSH_RANGE.min}
            max={BRUSH_RANGE.max}
            step={1}
            disabled={!hasPhoto}
            onChange={(v) => setPen({ size: v })}
          />
          {/* biome-ignore lint/a11y/useSemanticElements: 一排切換按鈕（預設粗細），不是表單分組 */}
          <div className="grid grid-cols-5 gap-2" role="group" aria-label={S.brushSize}>
            {BRUSH_PRESETS.map((n) => {
              const dot = Math.round(6 + (n / 40) * 20);
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={S.brushPreset(n)}
                  aria-pressed={size === n}
                  title={S.brushPreset(n)}
                  disabled={!hasPhoto}
                  onClick={() => setPen({ size: n })}
                  data-brush={n}
                  className="flex h-10 items-center justify-center rounded-md border border-border bg-surface outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40 aria-pressed:border-accent aria-pressed:bg-accent-soft"
                >
                  <span
                    aria-hidden
                    className="rounded-full bg-fg"
                    style={{ width: dot, height: dot }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </Field>
    </Section>
  );
}

export function LayersSection() {
  const hasPhoto = useDoc((s) => !!s.data.photo);
  const layers = useDoc((s) => s.data.layers);
  usePen((s) => s.data.layer);
  const active = activeLayerId();
  const confirm = useConfirm();
  /* 清單上層在前：第 i 列＝畫的順序 n − 1 − i；名稱依位置（圖層 1 在最下面） */
  const items = layers
    .map((l, i) => ({
      id: l.id,
      name: S.layerName(i + 1),
      visible: l.visible,
      meta: (
        <span data-testid="layer-meta">
          {S.layerMeta(l.strokes.length)}
          {l.id === active ? ` · ${S.layerActive}` : ''}
        </span>
      ),
    }))
    .reverse();
  const activeLayer = layers.find((l) => l.id === active);
  const clearOne = async () => {
    const pos = layerNumber(docNow().layers, active);
    if (
      !(await confirm({
        title: S.clearLayerTitle(pos),
        description: S.clearLayerDesc,
        confirmLabel: S.clearLabel,
        danger: true,
      }))
    )
      return;
    clearLayer(active);
  };
  const clearEvery = async () => {
    if (
      !(await confirm({
        title: S.clearAllTitle,
        description: S.clearAllDesc,
        confirmLabel: S.clearLabel,
        danger: true,
      }))
    )
      return;
    clearAllLayers();
  };
  return (
    <Section title={S.sectionLayers}>
      <p className="m-0 text-xs text-muted">{S.layersHint}</p>
      <LayerList
        aria-label={S.layersLabel}
        items={items}
        selectedId={active}
        onSelect={(id) => setPen({ layer: id })}
        onVisibleChange={(id, v) => setLayerVisible(id, v)}
        onMove={moveLayerInList}
        onMoveStart={gesture.begin}
        onMoveEnd={gesture.commit}
        moveButtons={{ up: S.layerUp, down: S.layerDown }}
        sortDisabled={!hasPhoto}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<Trash2 />}
          onClick={() => void clearOne()}
          disabled={!hasPhoto || !activeLayer?.strokes.length}
        >
          {S.clearLayer}
        </Button>
        <Button
          variant="danger"
          icon={<Trash2 />}
          onClick={() => void clearEvery()}
          disabled={!hasPhoto || !hasStrokes(layers)}
        >
          {S.clearAll}
        </Button>
      </div>
    </Section>
  );
}

export function StickersSection({ onFiles }: { onFiles: (files: File[]) => void }) {
  const hasPhoto = useDoc((s) => !!s.data.photo);
  const stickers = useDoc((s) => s.data.stickers);
  const selected = useUi((s) => s.selectedSticker);
  const { images } = useAssetImages(stickers.map((s) => s.asset));
  const full = stickers.length >= STICKER_MAX;
  const blocked = !hasPhoto || full;
  const toast = useToast();
  const zone = useRef<HTMLDivElement>(null);
  /* 拖著檔案經過貼紙區時，全視窗拖放的提示改說「加入貼紙」（對等驗證 F33） */
  useEffect(() => {
    const set = (v: boolean) => {
      if (useUi.getState().dropOnSticker !== v) useUi.setState({ dropOnSticker: v });
    };
    const over = (e: DragEvent) => {
      const el = zone.current;
      set(!!el && e.target instanceof Node && el.contains(e.target));
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) set(false);
    };
    const done = () => set(false);
    window.addEventListener('dragenter', over, true);
    window.addEventListener('dragover', over, true);
    window.addEventListener('dragleave', leave, true);
    window.addEventListener('drop', done);
    return () => {
      window.removeEventListener('dragenter', over, true);
      window.removeEventListener('dragover', over, true);
      window.removeEventListener('dragleave', leave, true);
      window.removeEventListener('drop', done);
      set(false);
    };
  }, []);
  const items = stickers
    .map((s, i) => ({
      id: s.id,
      name: S.stickerName(stickerLetter(i), s.name),
      thumbnail: images.get(s.asset) ?? null,
    }))
    .reverse();
  return (
    <Section
      title={S.sectionStickers}
      actions={
        <span className="text-xs tabular-nums text-muted" data-testid="sticker-count">
          {S.stickerCount(stickers.length, STICKER_MAX)}
        </span>
      }
    >
      {/* 貼紙區停用（沒有照片、已滿 5 張）時拖放區不處理放開：這一層接住，說明原因，不交給全視窗拖放去換照片 */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 只接住拖放的放開（拖放本來就沒有鍵盤操作；鍵盤用裡面的選檔按鈕） */}
      <div
        ref={zone}
        onDragOver={(e) => {
          if (blocked && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!blocked) return;
          e.preventDefault();
          e.stopPropagation();
          const files = Array.from(e.dataTransfer.files);
          if (!files.length) return;
          if (!hasPhoto) toast({ title: S.stickerNeedPhoto, tone: 'warning' });
          else onFiles(files);
        }}
      >
        <FileDrop
          aria-label={S.stickerDropLabel}
          accept="image/*"
          multiple
          paste="off"
          filterByAccept={false}
          compact
          icon={<StickerIcon />}
          label={S.stickerDropLabel}
          buttonLabel={S.stickerButton}
          hint={full ? S.stickerFull(STICKER_MAX) : S.stickerHint}
          disabled={blocked}
          onFiles={onFiles}
        />
      </div>
      <LayerList
        aria-label={S.stickersLabel}
        items={items}
        selectedId={selected}
        onSelect={(id) => {
          selectSticker(id);
          setTool('move');
        }}
        onMove={moveStickerInList}
        onMoveStart={gesture.begin}
        onMoveEnd={gesture.commit}
        moveButtons={{ up: S.stickerUp, down: S.stickerDown }}
        thumbSize={{ width: 48, height: 48 }}
        sortDisabled={!hasPhoto}
        empty={S.stickersEmpty}
        renderActions={(item) => (
          <IconButton
            size="sm"
            label={`${S.stickerDelete}：${item.name}`}
            icon={<Trash2 />}
            disabled={!hasPhoto}
            onClick={() => removeSticker(item.id)}
          />
        )}
      />
    </Section>
  );
}
