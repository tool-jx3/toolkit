/**
 * 預覽欄（規格 1.7、1.8）：整個遊戲畫面的預覽（滑過與按下、放大鏡、截圖）、預覽背景與試看的圖、按鈕的四種狀態、匯出
 * （畫面大小、ZIP、單張 PNG、TyranoScript 配置程式碼）。
 */
import {
  Camera,
  Code2,
  Download,
  ImagePlus,
  PackageOpen,
  Trash2,
  UserRound,
  ZoomIn,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { downloadBlob, downloadText, pickFiles } from '@/core/files';
import { loadImage } from '@/core/image';
import {
  Button,
  Dialog,
  Field,
  IconButton,
  Notice,
  ProgressBar,
  Section,
  Segmented,
  Select,
  Stage,
  TextOutputPanel,
  Toggle,
  useToast,
} from '@/ui';
import {
  assetText,
  buildZip,
  ensureAssetFonts,
  partPng,
  snapshotName,
  stageSnapshot,
} from './exporter';
import { loadFont } from './fonts';
import { screenSize } from './layout';
import {
  BUTTON_STATES,
  type DocState,
  RESOLUTIONS,
  type Resolution,
  SCENES,
  type Scene,
  SYSTEM_LABELS,
} from './model';
import { fileBaseName, type PartDef, type PartGroup, partsOf, renderPart } from './parts';
import {
  drawBackdrop,
  drawStage,
  type HitRegion,
  hitAt,
  type PreviewImage,
  stageText,
} from './stage';
import {
  assets,
  bump,
  type ImageRef,
  INSPECT_TARGETS,
  type InspectTarget,
  prefsNow,
  setPrefs,
  setResolution,
  useDoc,
  usePrefs,
  useSession,
} from './store';
import { S } from './strings';
import { tyranoCode } from './tyrano';

/* ---------- 圖片與字型 ---------- */

const toPreview = (b: ImageBitmap | undefined): PreviewImage | null =>
  b ? { width: b.width, height: b.height, source: b } : null;

/** 試看的圖（從資產庫讀回；讀好了重畫） */
export function usePreviewImages(): { bg: PreviewImage | null; char: PreviewImage | null } {
  const bg = usePrefs((s) => s.data.bg);
  const char = usePrefs((s) => s.data.char);
  useSession((s) => s.tick);
  useEffect(() => {
    let alive = true;
    for (const ref of [bg, char])
      if (ref && !assets.peekBitmap(ref.id))
        void assets.bitmap(ref.id).then((b) => {
          if (!alive) return;
          if (b) bump();
          else {
            /* 讀不回來（已從瀏覽器清除）：拿掉 */
            const p = prefsNow();
            if (p.bg?.id === ref.id) setPrefs({ bg: null });
            if (p.char?.id === ref.id) setPrefs({ char: null });
          }
        });
    return () => {
      alive = false;
    };
  }, [bg, char]);
  const bgBmp = bg ? assets.peekBitmap(bg.id) : undefined;
  const charBmp = char ? assets.peekBitmap(char.id) : undefined;
  return useMemo(() => ({ bg: toPreview(bgBmp), char: toPreview(charBmp) }), [bgBmp, charBmp]);
}

/** 用到的字型：換字型或文字時載入，載好了重畫（只有換字型時才顯示「載入中」） */
export function useFontLoading() {
  const doc = useDoc((s) => s.data);
  const font = doc.design.font;
  const text = stageText(doc) + assetText(doc);
  const last = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (last.current !== font) useSession.setState({ font: 'loading' });
    last.current = font;
    void loadFont(font, text).then((ok) => {
      if (!alive) return;
      useSession.setState({ font: ok ? 'ready' : 'fallback' });
      bump();
    });
    return () => {
      alive = false;
    };
  }, [font, text]);
}

/* ---------- 預覽畫面 ---------- */

const LENS = 240;

function Lens({
  canvas,
  point,
  zoom,
}: {
  canvas: HTMLCanvasElement | null;
  point: { x: number; y: number; cx: number; cy: number } | null;
  zoom: 1 | 2;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  /* 預覽重畫（設定、滑過、按下、字型與圖片讀好）時放大鏡也跟著重畫 */
  useSession((s) => s.tick);
  useSession((s) => s.hover);
  useSession((s) => s.pressed);
  useDoc((s) => s.data);
  useEffect(() => {
    /* 預覽的畫布在父元件的 effect 裡重畫（比這裡晚），所以等下一個畫面再取樣 */
    const raf = requestAnimationFrame(() => {
      const lens = ref.current;
      if (!lens || !canvas || !point) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      const n = Math.round(LENS * ratio);
      if (lens.width !== n) lens.width = n;
      if (lens.height !== n) lens.height = n;
      const ctx = lens.getContext('2d');
      if (!ctx) return;
      const src = LENS / zoom;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, n, n);
      ctx.imageSmoothingEnabled = zoom === 1;
      ctx.drawImage(canvas, point.x - src / 2, point.y - src / 2, src, src, 0, 0, n, n);
    });
    return () => cancelAnimationFrame(raf);
  });
  if (!point) return null;
  const gap = 20;
  const margin = 8;
  let left = point.cx + gap;
  let top = point.cy - LENS - gap;
  if (left + LENS > window.innerWidth - margin) left = point.cx - LENS - gap;
  if (top < margin) top = point.cy + gap;
  left = Math.max(margin, Math.min(left, window.innerWidth - LENS - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - LENS - margin));
  return createPortal(
    <div
      aria-hidden
      data-testid="magnifier"
      className="checker pointer-events-none fixed z-50 overflow-hidden rounded-full border-2 border-accent shadow-2"
      style={{ left, top, width: LENS, height: LENS }}
    >
      <canvas ref={ref} className="block size-full" />
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-sm bg-surface px-1.5 text-xs text-fg">
        {S.lensLabel(zoom)}
      </span>
    </div>,
    document.body,
  );
}

function StageView({ images }: { images: ReturnType<typeof usePreviewImages> }) {
  const doc = useDoc((s) => s.data);
  const prefs = usePrefs((s) => s.data);
  const hover = useSession((s) => s.hover);
  const pressed = useSession((s) => s.pressed);
  const tick = useSession((s) => s.tick);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitsRef = useRef<HitRegion[]>([]);
  const [lens, setLens] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const { width, height } = screenSize(doc.resolution);
  const toast = useToast();

  /* 背景＋立繪先畫在另一張畫布上（只在背景、圖、解析度改變時重畫；拖曳滑桿時只重畫框） */
  const backdrop = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const scale = width / 1920;
    ctx.scale(scale, scale);
    drawBackdrop(ctx, {
      scene: prefs.scene,
      bgImage: images.bg,
      charImage: images.char,
      samplePortrait: prefs.samplePortrait,
    });
    return c;
  }, [width, height, prefs.scene, prefs.samplePortrait, images.bg, images.char]);

  useEffect(() => {
    void tick;
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const scale = doc.resolution / 1920;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    hitsRef.current = drawStage(ctx, doc, {
      scene: prefs.scene,
      bgImage: images.bg,
      charImage: images.char,
      samplePortrait: prefs.samplePortrait,
      hover,
      pressed,
      scale,
      backdrop,
    });
    c.dataset.drawn = String(Number(c.dataset.drawn ?? 0) + 1);
  });

  /** 指標位置 → 1920 座標與畫布 px */
  const locate = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return null;
    return { bx: fx * 1920, by: fy * 1080, px: fx * c.width, py: fy * c.height };
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = locate(e);
    if (prefs.magnifier && e.pointerType !== 'touch' && p)
      setLens({ x: p.px, y: p.py, cx: e.clientX, cy: e.clientY });
    else setLens(null);
    const id = p ? hitAt(hitsRef.current, p.bx, p.by) : null;
    if (id !== useSession.getState().hover) useSession.setState({ hover: id });
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = locate(e);
    const id = p ? hitAt(hitsRef.current, p.bx, p.by) : null;
    if (!id) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    useSession.setState({ hover: id, pressed: id });
    const target: InspectTarget = id.startsWith('sys:') ? (id.slice(4) as InspectTarget) : 'choice';
    if (prefsNow().inspect !== target) setPrefs({ inspect: target });
  };

  const release = () => {
    if (useSession.getState().pressed) useSession.setState({ pressed: null });
  };

  const snapshot = async () => {
    const name = snapshotName(doc, doc.base.name);
    const blob = await stageSnapshot(
      doc,
      {
        scene: prefs.scene,
        bgImage: images.bg,
        charImage: images.char,
        samplePortrait: prefs.samplePortrait,
      },
      stageText(doc),
    );
    downloadBlob(blob, name);
    toast({ title: S.snapshotDone(name), tone: 'success' });
  };

  const touchOnly =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(any-hover: hover)').matches;
  const status = pressed
    ? S.pressing
    : hover
      ? S.hovering
      : touchOnly
        ? S.stageHintTouch
        : S.stageHint;
  return (
    <div className="flex flex-col gap-2">
      <Stage
        aria-label={S.stageAria}
        width={width}
        height={height}
        backgrounds={[]}
        background={{ kind: 'checker' }}
        toolbarExtra={
          <div className="flex items-center gap-1">
            <IconButton
              size="sm"
              icon={<ZoomIn />}
              label={S.magnifier}
              pressed={prefs.magnifier}
              onClick={() => {
                setPrefs({ magnifier: !prefs.magnifier });
                setLens(null);
              }}
            />
            <Segmented<'1' | '2'>
              size="sm"
              aria-label={S.magnifierZoom}
              value={String(prefs.lensZoom) as '1' | '2'}
              onValueChange={(v) => setPrefs({ lensZoom: v === '2' ? 2 : 1 })}
              options={[
                { value: '1', label: S.lensZooms[1] },
                { value: '2', label: S.lensZooms[2] },
              ]}
              disabled={!prefs.magnifier}
            />
            <IconButton
              size="sm"
              icon={<Camera />}
              label={S.snapshot}
              onClick={() => void snapshot()}
            />
          </div>
        }
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          data-testid="stage-canvas"
          data-hover={hover ?? ''}
          data-pressed={pressed ?? ''}
          className="block size-full touch-pan-y"
          style={{ cursor: prefs.magnifier ? 'zoom-in' : hover ? 'pointer' : 'default' }}
          onPointerEnter={onMove}
          onPointerMove={onMove}
          onPointerDown={onDown}
          onPointerUp={release}
          onPointerCancel={() => {
            release();
            setLens(null);
          }}
          onLostPointerCapture={release}
          onPointerLeave={() => {
            setLens(null);
            useSession.setState({ hover: null, pressed: null });
          }}
        />
      </Stage>
      {prefs.magnifier ? (
        <Lens canvas={canvasRef.current} point={lens} zoom={prefs.lensZoom} />
      ) : null}
      {doc.mode === 'novel' ? (
        <p className="m-0 text-xs text-muted" data-testid="stage-status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

/* ---------- 預覽背景與試看的圖 ---------- */

const MAX_BYTES = 30 * 1024 * 1024;
const MAX_PIXELS = 50_000_000;
const ACCEPT = 'image/png,image/jpeg,image/webp';

async function pickPreviewImage(): Promise<{ ref: ImageRef } | { error: string } | null> {
  const [file] = await pickFiles({ accept: ACCEPT, multiple: false });
  if (!file) return null;
  if (file.type && !ACCEPT.split(',').includes(file.type))
    return { error: S.imageFailed(file.name) };
  if (file.size > MAX_BYTES) return { error: S.imageTooLarge };
  try {
    const bmp = await loadImage(file);
    const big = bmp.width * bmp.height > MAX_PIXELS;
    bmp.close?.();
    if (big) return { error: S.imageTooLarge };
  } catch {
    return { error: S.imageFailed(file.name) };
  }
  const r = await assets.add(file);
  return { ref: { id: r.id, name: file.name } };
}

function StagingBar() {
  const prefs = usePrefs((s) => s.data);
  const toast = useToast();
  const choose = async (kind: 'bg' | 'char') => {
    const r = await pickPreviewImage();
    if (!r) return;
    if ('error' in r) {
      toast({ title: r.error, tone: 'danger' });
      return;
    }
    setPrefs(kind === 'bg' ? { bg: r.ref } : { char: r.ref });
    toast({
      title: S.imageLoaded(kind === 'bg' ? S.bgWhat : S.charWhat, r.ref.name),
      tone: 'success',
    });
  };
  return (
    <div className="flex flex-col gap-2" data-testid="staging">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={S.scene} className="min-w-44 flex-1">
          <Select<Scene>
            value={prefs.scene}
            onValueChange={(v) => setPrefs({ scene: v })}
            options={SCENES.map((s) => ({ value: s, label: S.scenes[s] }))}
            size="sm"
          />
        </Field>
        <Button size="sm" icon={<ImagePlus />} onClick={() => void choose('bg')}>
          {S.bgImage}
        </Button>
        <Button size="sm" icon={<UserRound />} onClick={() => void choose('char')}>
          {S.charImage}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 />}
          disabled={!prefs.bg && !prefs.char}
          onClick={() => {
            setPrefs({ bg: null, char: null });
            toast({ title: S.imagesRemoved });
          }}
        >
          {S.removeImages}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Field label={S.samplePortrait} layout="inline">
          <Toggle
            checked={prefs.samplePortrait}
            disabled={!!prefs.char}
            onCheckedChange={(v) => setPrefs({ samplePortrait: v })}
          />
        </Field>
        {prefs.bg ? (
          <span className="truncate text-xs text-muted" data-testid="bg-name">
            {S.currentBg(prefs.bg.name)}
          </span>
        ) : null}
        {prefs.char ? (
          <span className="truncate text-xs text-muted" data-testid="char-name">
            {S.currentChar(prefs.char.name)}
          </span>
        ) : null}
      </div>
      <p className="m-0 text-xs text-muted">{S.previewNote}</p>
    </div>
  );
}

/* ---------- 單張 PNG ---------- */

async function downloadPart(doc: DocState, part: PartDef): Promise<string> {
  await ensureAssetFonts(doc);
  const blob = await partPng(doc, part);
  const name = fileBaseName(part.file);
  downloadBlob(blob, name);
  return name;
}

/* ---------- 四種狀態 ---------- */

function StateCanvas({ part, doc }: { part: PartDef; doc: DocState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tick = useSession((s) => s.tick);
  useEffect(() => {
    void tick;
    const c = ref.current;
    if (!c) return;
    const src = renderPart(part, doc.resolution, (w, h) => {
      c.width = w;
      c.height = h;
      c.getContext('2d')?.clearRect(0, 0, w, h);
      return c;
    });
    void src;
  });
  return <canvas ref={ref} className="block h-auto max-w-full" />;
}

function StateTray() {
  const doc = useDoc((s) => s.data);
  const inspect = usePrefs((s) => s.data.inspect);
  const toast = useToast();
  const parts = useMemo(() => partsOf(doc, 'novel'), [doc]);
  const list = BUTTON_STATES.map((st) =>
    parts.find((p) => p.id === (inspect === 'choice' ? `choice:${st}` : `sys:${inspect}:${st}`)),
  ).filter((p): p is PartDef => !!p);
  return (
    <Section title={S.stateSection} description={S.stateNote} persistKey="ui-frame:states">
      <Field label={S.stateTarget}>
        <Select<InspectTarget>
          value={inspect}
          onValueChange={(v) => setPrefs({ inspect: v })}
          options={INSPECT_TARGETS.map((t) => ({
            value: t,
            label: t === 'choice' ? S.choiceButton : SYSTEM_LABELS[doc.design.buttonLang][t],
          }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2" data-testid="state-grid">
        {list.map((p, i) => (
          <button
            key={p.id}
            type="button"
            data-state={BUTTON_STATES[i]}
            aria-label={S.stateDownload(fileBaseName(p.file))}
            className="checker flex flex-col items-center gap-1 rounded-md border border-border p-2 text-xs text-fg hover:border-accent focus-visible:focus-ring"
            onClick={() =>
              void downloadPart(doc, p).then((name) =>
                toast({ title: S.assetDownloaded(name), tone: 'success' }),
              )
            }
          >
            <StateCanvas part={p} doc={doc} />
            <span className="rounded-sm bg-surface px-1.5 py-0.5">
              {S.stateCard(S.states[BUTTON_STATES[i]], p.width, p.height)}
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ---------- 配置程式碼 ---------- */

type CodeFile = 'quick' | 'choice' | 'css';

function CodeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const doc = useDoc((s) => s.data);
  const [file, setFile] = useState<CodeFile>('quick');
  const code = useMemo(() => (open ? tyranoCode(doc, doc.base.name) : null), [doc, open]);
  const text = code
    ? file === 'quick'
      ? code.quickPaste
      : file === 'choice'
        ? code.choiceExample
        : code.css
    : '';
  const name = S.codeFiles[file];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.codeDialog}
      description={S.codeLead}
      size="lg"
    >
      <div className="flex flex-col gap-3" data-testid="code-dialog">
        <Segmented<CodeFile>
          aria-label={S.codeDialog}
          value={file}
          onValueChange={setFile}
          options={(['quick', 'choice', 'css'] as const).map((f) => ({
            value: f,
            label: S.codeFiles[f],
          }))}
          fullWidth
        />
        <TextOutputPanel
          title={name}
          text={text}
          wrap="off"
          font="mono"
          messages={{ copied: S.codeCopied }}
          actions={
            <Button
              size="sm"
              icon={<Download />}
              onClick={() =>
                downloadText(
                  text,
                  name,
                  file === 'css' ? 'text/css;charset=utf-8' : 'text/plain;charset=utf-8',
                )
              }
            >
              {S.codeDownload}
            </Button>
          }
        />
      </div>
    </Dialog>
  );
}

/* ---------- 匯出 ---------- */

const GROUPS: PartGroup[] = ['frames', 'choice', 'system'];

function AssetList({ parts, doc }: { parts: PartDef[]; doc: DocState }) {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-2" data-testid="asset-list">
      <p className="m-0 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{S.assetList}</span>
        <span className="text-xs text-muted" data-testid="asset-count">
          {S.assetCount(parts.length)}
        </span>
      </p>
      <p className="m-0 text-xs text-muted">{S.assetNote}</p>
      {GROUPS.map((g) => {
        const items = parts.filter((p) => p.group === g);
        if (!items.length) return null;
        const rows = (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  data-file={p.file}
                  className="flex w-full items-center justify-between gap-2 rounded-sm border border-border bg-surface px-2 py-1.5 text-left text-sm hover:border-accent focus-visible:focus-ring"
                  onClick={() =>
                    void downloadPart(doc, p).then((name) =>
                      toast({ title: S.assetDownloaded(name), tone: 'success' }),
                    )
                  }
                >
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {S.assetSize(p.width, p.height)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        );
        if (g === 'frames') return <div key={g}>{rows}</div>;
        return (
          <details key={g} className="rounded-sm border border-border p-2" data-group={g}>
            <summary className="cursor-pointer text-sm">
              {S.assetGroups[g]}（{items.length}）
            </summary>
            <div className="mt-2">{rows}</div>
          </details>
        );
      })}
    </div>
  );
}

function ExportSection() {
  const doc = useDoc((s) => s.data);
  const busy = useSession((s) => s.busy);
  const toast = useToast();
  const [codeOpen, setCodeOpen] = useState(false);
  const parts = useMemo(() => partsOf(doc), [doc]);
  const novel = doc.mode === 'novel';
  const zip = async () => {
    if (useSession.getState().busy) return;
    useSession.setState({ busy: { done: 0, total: parts.length } });
    try {
      const r = await buildZip(doc, doc.base.name, (done, total) =>
        useSession.setState({ busy: { done, total } }),
      );
      downloadBlob(new Blob([r.bytes as BlobPart], { type: 'application/zip' }), r.fileName);
      toast({ title: S.zipDone(r.fileName), tone: 'success' });
    } catch (e) {
      toast({
        title: S.zipFailed,
        description: String((e as Error)?.message ?? e),
        tone: 'danger',
      });
    } finally {
      useSession.setState({ busy: null });
    }
  };
  return (
    <Section title={S.exportSection} persistKey="ui-frame:export" fixed>
      <Field label={S.resolution} hint={S.resolutionHint}>
        <Segmented<'1920' | '1280'>
          value={String(doc.resolution) as '1920' | '1280'}
          onValueChange={(v) => setResolution(Number(v) as Resolution)}
          options={RESOLUTIONS.map((r) => ({
            value: String(r) as '1920' | '1280',
            label: S.resolutions[r],
          }))}
          fullWidth
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={<PackageOpen />}
          loading={!!busy}
          disabled={!!busy}
          onClick={() => void zip()}
          data-testid="zip-button"
        >
          {S.zip(parts.length, novel)}
        </Button>
        {novel ? (
          <Button icon={<Code2 />} onClick={() => setCodeOpen(true)}>
            {S.codeButton}
          </Button>
        ) : null}
      </div>
      {busy ? (
        <Notice tone="progress">
          {S.zipping(busy.done, busy.total)}
          <ProgressBar value={busy.total ? busy.done / busy.total : 0} />
        </Notice>
      ) : null}
      <AssetList parts={parts} doc={doc} />
      <CodeDialog open={codeOpen} onOpenChange={setCodeOpen} />
    </Section>
  );
}

export function Preview() {
  const images = usePreviewImages();
  const mode = useDoc((s) => s.data.mode);
  useFontLoading();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <StageView images={images} />
      <StagingBar />
      {mode === 'novel' ? <StateTray /> : null}
      <ExportSection />
    </div>
  );
}
