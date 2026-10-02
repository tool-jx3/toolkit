import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  Files,
  ImagePlus,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob, downloadSequentially, readAsBytes } from '@/core/files';
import { detectImageType } from '@/core/image';
import { createToolStore } from '@/core/storage';
import {
  Button,
  Checkbox,
  ColorField,
  CropFrame,
  Field,
  FileDrop,
  IconButton,
  isFormControlTarget,
  matchCombo,
  Notice,
  type NoticeTone,
  Section,
  Segmented,
  Select,
  type Shortcut,
  Slider,
  Stage,
  type StagePan,
  Toggle,
  ToolShell,
  UsageSection,
} from '@/ui';
import { createEffectsRunner, latestQueue } from './effects-client';
import {
  ANCHORS,
  type Anchor,
  ASPECTS,
  type Aspect,
  type CropGeometry,
  chooseAnchor,
  clampRange,
  clipboardFileName,
  cropGeometry,
  DEFAULT_SETTINGS,
  EFFECT_RANGE,
  EFFECT_STYLES,
  type EffectStyle,
  type Figure,
  offsetFor,
  outputFileName,
  RANGE,
  resetOffset,
  type Settings,
  type Slot,
  sanitizeSettings,
  sourceKind,
  syncAnchors,
} from './logic';
import { type EffectParams, effectKey, effectParams } from './process';
import { cropRgba, decodeImage, drawPreview, type EffectLayer, rgbaToCanvas } from './render';
import { S } from './strings';

const TOOL_ID = 'ccfolia-cropper';

/** 比例、範圍、基準與效果設定自動存檔（主控裁定：效果設定也記住）；圖片清單不在 store 裡 */
const useSettings = createToolStore<Settings>(TOOL_ID, DEFAULT_SETTINGS, { version: 1 });

interface Item extends Slot {
  id: string;
  name: string;
  bitmap: ImageBitmap;
  figure: Figure;
}

interface Status {
  tone: NoticeTone;
  text: string;
  detail?: string;
}

/** 選檔視窗的類型（實際收不收由檔頭判斷） */
const ACCEPT = 'image/png,image/webp,.png,.webp';
/** 沒有圖時預覽區的大小 */
const EMPTY_STAGE = { width: 800, height: 600 };
/** 批次下載每張的間隔 */
const BATCH_INTERVAL_MS = 200;
/**
 * 預覽區的版面：≥ 1280 px 時預覽在左（跨兩列）、右側一欄由上而下是「載入＋清單」與「輸出＋下載＋狀態」。
 * 預覽的最高高度＝預覽欄的高度（100dvh − 5rem）扣掉 Stage 的工具列與邊框（約 3rem）。
 */
const PREVIEW_GRID =
  'flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-x-4 xl:[--stage-max-h:calc(100dvh-8rem)]';

let seq = 0;
const nextId = () => `img-${++seq}`;

const geometryOf = (it: Item, s: Pick<Settings, 'aspect' | 'range'>): CropGeometry =>
  cropGeometry(it.figure, {
    aspect: s.aspect,
    range: s.range,
    anchor: it.anchor,
    offset: it.offset,
  });

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

export function App() {
  const stored = useSettings((st) => st.data);
  const s = useMemo(() => sanitizeSettings(stored), [stored]);
  const patch = useSettings((st) => st.patch);

  /* 圖片清單與目前這張（不存檔） */
  const [items, setItemsState] = useState<Item[]>([]);
  const [index, setIndexState] = useState(0);
  const itemsRef = useRef(items);
  const indexRef = useRef(index);
  const setItems = (next: Item[]) => {
    itemsRef.current = next;
    setItemsState(next);
  };
  const setIndex = (i: number) => {
    indexRef.current = i;
    setIndexState(i);
  };
  const [applyAll, setApplyAll] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<StagePan>({ x: 0, y: 0 });
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [batching, setBatching] = useState(false);
  const batchAbort = useRef<AbortController | null>(null);
  /** 每次載入加一：還在讀檔的舊一批看到不同就放棄 */
  const loadGen = useRef(0);

  const current = items[index] ?? null;
  const geo = current ? geometryOf(current, s) : null;
  const params = effectParams(s);
  /** 選單上顯示的基準：目前這張自己的；沒有圖時是最後一次選的 */
  const menuAnchor: Anchor = current?.anchor ?? s.anchor;

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  /* 離開頁面時釋放圖片 */
  useEffect(
    () => () => {
      for (const it of itemsRef.current) it.bitmap.close();
    },
    [],
  );

  /* ---------- 效果預覽（Worker 計算，只算最新一筆） ---------- */

  const runner = useMemo(() => createEffectsRunner(), []);
  useEffect(() => () => runner.dispose(), [runner]);
  const queue = useMemo(() => latestQueue(), []);
  const [fx, setFx] = useState<(EffectLayer & { itemId: string; key: string }) | null>(null);
  const fxRef = useRef(fx);
  fxRef.current = fx;
  const wantKey =
    current && geo && params
      ? `${current.id}|${geo.x},${geo.y},${geo.width},${geo.height}|${effectKey(params)}`
      : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: wantKey 已包含目前這張、裁切範圍與效果參數
  useEffect(() => {
    if (!wantKey || !current || !geo || !params) return;
    if (fxRef.current?.key === wantKey) return;
    const item = current;
    const rect = { x: geo.x, y: geo.y, width: geo.width, height: geo.height };
    const p = params;
    const key = wantKey;
    queue(async () => {
      /* 輪到時這張已經不在清單裡（重新載入）就不算 */
      if (!itemsRef.current.some((it) => it.id === item.id)) return;
      const out = await runner.apply(cropRgba(item.bitmap, rect), p);
      if (!itemsRef.current.some((it) => it.id === item.id)) return;
      setFx({ itemId: item.id, key, rect, canvas: rgbaToCanvas(out) });
    });
  }, [wantKey]);

  /* ---------- 預覽畫布 ---------- */

  const canvas = useRef<HTMLCanvasElement>(null);
  const stageW =
    current && geo ? Math.max(current.figure.width, geo.x + geo.width) : EMPTY_STAGE.width;
  const stageH = current ? current.figure.height : EMPTY_STAGE.height;
  const fxShown = current && params && fx && fx.itemId === current.id ? fx : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 依畫面上用到的值重畫
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    drawPreview(c, current?.bitmap ?? null, geo, fxShown);
  }, [current, geo?.x, geo?.y, geo?.width, geo?.height, fxShown, stageW, stageH]);

  /* ---------- 載入（F01～F05） ---------- */

  const load = async (files: File[], pasted: boolean) => {
    const checked = pasted
      ? files
      : (
          await Promise.all(
            files.map(async (file) => ({
              file,
              ok:
                sourceKind(detectImageType(await readAsBytes(file.slice(0, 64))), file.type) !==
                null,
            })),
          )
        )
          .filter((c) => c.ok)
          .map((c) => c.file);
    if (!checked.length) {
      /* 全部不合格：錯誤訊息，清單不變（其他類型的檔案混在裡面時靜默略過） */
      setStatus({ tone: 'danger', text: S.typeError });
      return;
    }
    const my = ++loadGen.current;
    const loaded: Item[] = [];
    const failed: string[] = [];
    const drop = () => {
      for (const it of loaded) it.bitmap.close();
    };
    for (let i = 0; i < checked.length; i++) {
      setStatus({ tone: 'progress', text: S.reading(i + 1, checked.length) });
      const file = checked[i];
      try {
        const { bitmap, figure } = await decodeImage(file);
        if (loadGen.current !== my) {
          bitmap.close();
          return drop();
        }
        loaded.push({ id: nextId(), name: file.name, bitmap, figure, anchor: 'head', offset: 0 });
      } catch {
        if (loadGen.current !== my) return drop();
        failed.push(file.name);
      }
    }
    if (loadGen.current !== my) return drop();
    if (!loaded.length) {
      /* 全部讀不到：指出檔名，清單不變（主控裁定：畫面與下載內容保持一致） */
      setStatus({ tone: 'danger', text: S.readFailed(failed) });
      return;
    }
    /* 載入會取代整個清單；每張以目前選單上的基準當作自己的基準 */
    const anchor =
      itemsRef.current[indexRef.current]?.anchor ??
      sanitizeSettings(useSettings.getState().data).anchor;
    batchAbort.current?.abort();
    const old = itemsRef.current;
    setItems(loaded.map((it) => ({ ...it, anchor })));
    setIndex(0);
    resetView();
    setFx(null);
    setTimeout(() => {
      for (const it of old) it.bitmap.close();
    }, 0);
    setStatus(
      failed.length
        ? { tone: 'warning', text: S.loadedWithErrors(loaded.length, failed) }
        : pasted
          ? { tone: 'success', text: S.pasted(loaded[0].name) }
          : { tone: 'success', text: S.loaded(loaded.length) },
    );
  };
  const loadRef = useRef(load);
  loadRef.current = load;

  /* 貼上（F03）：剪貼簿裡第一個圖片項目，PNG、JPEG 都收；焦點在表單控制項時不作用（F39） */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isFormControlTarget(e.target) || isFormControlTarget(document.activeElement)) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"],[role="alertdialog"]'))
        return;
      const entry = Array.from(e.clipboardData?.items ?? []).find(
        (it) => it.kind === 'file' && it.type.startsWith('image/'),
      );
      const blob = entry?.getAsFile();
      if (!blob) return;
      e.preventDefault();
      const file = new File([blob], clipboardFileName(new Date()), {
        type: blob.type || 'image/png',
      });
      void loadRef.current([file], true);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  /* ---------- 清單瀏覽（F06、F07） ---------- */

  const go = (dir: -1 | 1) => {
    const n = itemsRef.current.length;
    const i = indexRef.current + dir;
    if (i < 0 || i >= n) return;
    setIndex(i);
    resetView();
  };

  /* ---------- 裁切框（F08～F20） ---------- */

  const updateCurrent = (fn: (list: readonly Item[], i: number) => Item[]) => {
    if (!itemsRef.current.length) return;
    setItems(fn(itemsRef.current, indexRef.current));
  };

  const setAspect = (aspect: Aspect) => {
    if (aspect === s.aspect) return;
    patch({ aspect });
    updateCurrent(resetOffset);
  };
  const setRange = (range: number) => patch({ range: clampRange(range) });
  const setAnchor = (anchor: Anchor) => {
    patch({ anchor });
    updateCurrent((list, i) => chooseAnchor(list, i, anchor, applyAll));
  };
  const toggleApplyAll = (on: boolean) => {
    setApplyAll(on);
    if (on) updateCurrent((list) => syncAnchors(list, menuAnchor));
  };
  const backToBase = () => updateCurrent(resetOffset);

  /** 拖曳開始時的框（位移以「起點＋移動量」換算，按下不動不會跳） */
  const dragStart = useRef<{ x: number; offset: number } | null>(null);
  const onFrameMove = (rect: { x: number }, phase: 'start' | 'move' | 'end') => {
    if (!current || !geo) return;
    if (phase === 'start') {
      dragStart.current = { x: geo.x, offset: current.offset };
      return;
    }
    if (phase === 'end') {
      dragStart.current = null;
      return;
    }
    const start = dragStart.current;
    if (!start) return;
    /* 回到起點時還原原本的位移（不因四捨五入差半格） */
    const offset = rect.x === start.x ? start.offset : offsetFor(geo, rect.x);
    if (offset === current.offset) return;
    updateCurrent((list, i) => list.map((it, k) => (k === i ? { ...it, offset } : it)));
  };

  /* ---------- 下載（F35～F38） ---------- */

  const renderBlob = async (it: Item, g: CropGeometry, p: EffectParams | null) => {
    const bytes = await runner.encode(cropRgba(it.bitmap, g), p);
    return new Blob([bytes], { type: 'image/png' });
  };

  const downloadCurrent = async () => {
    const it = itemsRef.current[indexRef.current];
    if (!it || batching || saving) return;
    const name = outputFileName(it.name);
    setSaving(true);
    try {
      downloadBlob(await renderBlob(it, geometryOf(it, s), params), name);
      setStatus({ tone: 'success', text: S.downloaded(name) });
    } catch {
      setStatus({ tone: 'danger', text: S.downloadError });
    } finally {
      setSaving(false);
    }
  };
  const downloadRef = useRef(downloadCurrent);
  downloadRef.current = downloadCurrent;

  const downloadAll = async () => {
    const list = itemsRef.current;
    if (list.length < 2 || batching) return;
    const snapshot = { aspect: s.aspect, range: s.range };
    const p = params;
    const ac = new AbortController();
    batchAbort.current = ac;
    setBatching(true);
    try {
      await downloadSequentially(
        list.map((it) => ({
          name: outputFileName(it.name),
          blob: () => renderBlob(it, geometryOf(it, snapshot), p),
        })),
        {
          intervalMs: BATCH_INTERVAL_MS,
          signal: ac.signal,
          onProgress: (i, n) =>
            setStatus({
              tone: 'progress',
              text: S.downloading(i + 1, n),
              detail: S.downloadingHint,
            }),
        },
      );
      setStatus({ tone: 'success', text: S.downloadedAll(list.length) });
    } catch {
      /* 重新載入而取消時不顯示錯誤（狀態已換成載入的結果） */
      if (!ac.signal.aborted) setStatus({ tone: 'danger', text: S.downloadError });
    } finally {
      if (batchAbort.current === ac) {
        batchAbort.current = null;
        setBatching(false);
      }
    }
  };

  /* Ctrl／⌘＋S：擋掉瀏覽器的另存網頁；焦點在表單控制項時不作用（F39） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || !matchCombo(e, 'mod+s')) return;
      if (isFormControlTarget(e.target)) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"],[role="alertdialog"]'))
        return;
      e.preventDefault();
      if (!e.repeat) void downloadRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- 快捷鍵（F07、F10、F20、F24；帶 Ctrl／⌘／Alt 時不觸發） ---------- */

  const shortcuts: Shortcut[] = [
    { keys: ['a', 'shift+a'], label: S.prev, group: S.keysImages, handler: () => go(-1) },
    { keys: ['d', 'shift+d'], label: S.next, group: S.keysImages, handler: () => go(1) },
    { keys: 'mod+v', label: S.keyPaste, group: S.keysImages },
    {
      keys: '[',
      label: S.keyRangeDown,
      group: S.keysFrame,
      handler: () => setRange(s.range - RANGE.keyStep),
    },
    {
      keys: ']',
      label: S.keyRangeUp,
      group: S.keysFrame,
      handler: () => setRange(s.range + RANGE.keyStep),
    },
    { keys: ['c', 'shift+c'], label: S.resetOffset, group: S.keysFrame, handler: backToBase },
    { keys: ['r', 'shift+r'], label: S.resetView, group: S.keysView, handler: resetView },
    { keys: 'mod+s', label: S.download, group: S.keysDownload },
  ];

  /* ---------- 版面 ---------- */

  const usage = <Usage />;
  const n = items.length;
  const style = s.effectStyle;

  const settings = (
    <>
      <Section title={S.sectionFrame} fixed>
        <Field label={S.aspect} hint={S.aspectHint}>
          <Segmented<Aspect>
            value={s.aspect}
            onValueChange={setAspect}
            fullWidth
            options={ASPECTS.map((a) => ({ value: a, label: S.aspectLabels[a] }))}
          />
        </Field>
        <Field label={S.range} hint={S.rangeHint}>
          <Slider
            value={s.range}
            onChange={setRange}
            min={RANGE.min}
            max={RANGE.max}
            step={RANGE.step}
            unit="%"
          />
        </Field>
        <Field label={S.anchor} hint={`${S.anchorDescriptions[menuAnchor]}${S.anchorHint}`}>
          <Select<Anchor>
            value={menuAnchor}
            onValueChange={setAnchor}
            options={ANCHORS.map((a) => ({
              value: a,
              label: S.anchorLabels[a],
              description: S.anchorDescriptions[a],
            }))}
          />
        </Field>
        <Field label={S.applyAll} hint={S.applyAllHint} layout="inline">
          <Checkbox checked={applyAll} onCheckedChange={toggleApplyAll} />
        </Field>
      </Section>
      <Section title={S.sectionEffect} fixed>
        <Field label={S.effectOn} hint={S.effectOnHint} layout="inline">
          <Toggle checked={s.effectOn} onCheckedChange={(effectOn) => patch({ effectOn })} />
        </Field>
        <Field label={S.effectStyle} hint={S.effectStyleHints[style]}>
          <Segmented<EffectStyle>
            value={style}
            onValueChange={(effectStyle) => patch({ effectStyle })}
            fullWidth
            options={EFFECT_STYLES.map((v) => ({ value: v, label: S.effectStyleLabels[v] }))}
          />
        </Field>
        <Field label={S.effectColor}>
          <ColorField value={s.effectColor} onChange={(effectColor) => patch({ effectColor })} />
        </Field>
        <Field label={S.effectWidth}>
          <Slider
            value={s.effectWidth}
            onChange={(effectWidth) => patch({ effectWidth })}
            min={EFFECT_RANGE.width.min}
            max={EFFECT_RANGE.width.max}
            unit="px"
          />
        </Field>
        <Field label={S.effectBlur} hidden={style === 'stroke'}>
          <Slider
            value={s.effectBlur}
            onChange={(effectBlur) => patch({ effectBlur })}
            min={EFFECT_RANGE.blur.min}
            max={EFFECT_RANGE.blur.max}
            unit="px"
          />
        </Field>
        <Field label={S.effectOffset} hint={S.effectOffsetHint} hidden={style !== 'shadow'}>
          <Slider
            value={s.effectOffset}
            onChange={(effectOffset) => patch({ effectOffset })}
            min={EFFECT_RANGE.offset.min}
            max={EFFECT_RANGE.offset.max}
            unit="px"
          />
        </Field>
        <Field label={S.effectOpacity}>
          <Slider
            value={s.effectOpacity}
            onChange={(effectOpacity) => patch({ effectOpacity })}
            min={EFFECT_RANGE.opacity.min}
            max={EFFECT_RANGE.opacity.max}
            unit="%"
          />
        </Field>
      </Section>
      <UsageSection>{usage}</UsageSection>
      <p className="m-0 px-1 text-xs text-muted">{S.disclaimer}</p>
    </>
  );

  const fxState = !params || !current ? 'off' : fx?.key === wantKey ? 'ready' : 'pending';

  /*
   * 版面：窄畫面由上而下（載入、清單、預覽、下載）；≥ 1280 px 時預覽在左、其他控制項排在右側一欄，
   * 預覽的高度放到畫面能容納的最高（對等驗證後的追加裁定：1440 × 900 時顯示比例不小於 0.6），微調時拖得比較準。
   */
  const preview = (
    <div className={PREVIEW_GRID}>
      <div className="flex min-w-0 flex-col gap-3 xl:col-start-2 xl:row-start-1">
        <FileDrop
          multiple
          compact
          /* 右側一欄較窄：改成直式（圖示、說明、按鈕上下排） */
          className="xl:flex-col xl:items-center xl:gap-2 xl:py-4 xl:text-center"
          accept={ACCEPT}
          filterByAccept={false}
          paste="off"
          icon={<ImagePlus />}
          label={S.dropLabel}
          buttonLabel={S.dropButton}
          hint={S.dropHint}
          onFiles={(files) => void load(files, false)}
        />
        <div className="flex min-w-0 items-center gap-1.5">
          <IconButton
            label={S.prev}
            icon={<ChevronLeft />}
            variant="secondary"
            aria-keyshortcuts="A"
            disabled={index <= 0 || !n}
            onClick={() => go(-1)}
          />
          <output
            className="min-w-12 text-center text-sm tabular-nums"
            aria-label={S.counterLabel(n ? index + 1 : 0, n)}
            data-testid="counter"
          >
            {S.counter(n ? index + 1 : 0, n)}
          </output>
          <IconButton
            label={S.next}
            icon={<ChevronRight />}
            variant="secondary"
            aria-keyshortcuts="D"
            disabled={index >= n - 1 || !n}
            onClick={() => go(1)}
          />
          {current ? (
            <span
              className="ml-1 min-w-0 flex-1 truncate text-sm text-muted"
              title={current.name}
              data-testid="file-name"
            >
              {current.name}
            </span>
          ) : null}
        </div>
      </div>
      <div className="relative min-w-0 xl:col-start-1 xl:row-span-2 xl:row-start-1">
        <Stage
          width={stageW}
          height={stageH}
          aria-label={S.stageLabel}
          dragPan
          wheelZoom="plain"
          zoomBase="fit"
          zoomRange={[0.2, 5]}
          wheelFactors={[1.1, 0.9]}
          zoom={zoom}
          onZoomChange={(z) => setZoom(z === 'fit' ? 1 : z)}
          pan={pan}
          onPanChange={setPan}
          backgrounds={['checker', 'dark', 'light', 'color']}
          toolbarExtra={
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw />}
              aria-keyshortcuts="R"
              onClick={resetView}
            >
              {S.resetView}
            </Button>
          }
        >
          <canvas
            ref={canvas}
            width={stageW}
            height={stageH}
            className="block size-full"
            data-testid="preview-canvas"
            data-fx={fxState}
          />
          {current && geo ? (
            <CropFrame
              width={stageW}
              height={stageH}
              rect={{ x: geo.x, y: geo.y, width: geo.width, height: geo.height }}
              label={S.frameLabel}
              aria-label={S.frameAria}
              onMove={onFrameMove}
            />
          ) : null}
        </Stage>
        {!current ? (
          <p className="pointer-events-none absolute inset-x-4 top-1/2 m-0 -translate-y-1/2 pt-8 text-center text-sm text-muted">
            {S.empty}
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3 xl:col-start-2 xl:row-start-2">
        {current && geo ? (
          <p className="m-0 flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
            <span data-testid="output-size">{S.outputInfo(geo.width, geo.height)}</span>
            <span className="min-w-0 truncate" data-testid="output-name">
              {outputFileName(current.name)}
            </span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            icon={<Download />}
            aria-keyshortcuts="Control+S"
            loading={saving}
            disabled={!current || batching}
            onClick={() => void downloadCurrent()}
          >
            {S.download}
          </Button>
          <Button
            icon={<Files />}
            disabled={n < 2 || batching || saving}
            onClick={() => void downloadAll()}
          >
            {batching ? S.downloadAllBusy : S.downloadAll}
          </Button>
          <Button
            variant="ghost"
            icon={<Crosshair />}
            aria-keyshortcuts="C"
            disabled={!current}
            onClick={backToBase}
          >
            {S.resetOffset}
          </Button>
        </div>
        {status ? (
          <Notice tone={status.tone}>
            <span data-testid="status-text">{status.text}</span>
            {status.detail ? <span className="mt-0.5 block text-xs">{status.detail}</span> : null}
          </Notice>
        ) : null}
      </div>
    </div>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={usage}
      shortcuts={shortcuts}
      settings={settings}
      preview={preview}
    />
  );
}
