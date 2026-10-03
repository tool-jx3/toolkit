/**
 * 預覽：版型的場景＋貼紙畫在 canvas（與輸出同一段程式），上面疊 LayoutCanvas（點選區、貼紙控點、從畫布取色）。
 * 下方：文字記錄的頁面切換、多人資料框的人數與新增鈕；最下面是下載（PNG，文字記錄另有 PDF；下載前先自動分頁）。
 */
import {
  ArrowLeftToLine,
  BringToFront,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  LayoutGrid,
  Plus,
  SendToBack,
  Square,
  SquareDashed,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob, downloadBytes } from '@/core/files';
import { collectHitRegions, drawScene, loadSceneFonts } from '@/core/scene';
import type { ToolStore } from '@/core/storage';
import {
  Button,
  type CanvasPicker,
  IconButton,
  LayoutCanvas,
  type LayoutSticker,
  Notice,
  Stage,
  useToast,
} from '@/ui';
import { paginateNow } from './autoPaginate';
import { type Draft, draftAssets, parseHitKey, stickerMax, type TemplateDef } from './model';
import { addMemberTo, addPageTo, chooseSide } from './Panel';
import { drawStickers, exportPng, outputName, sceneEnv, stickerPlacement } from './render';
import { selectSticker } from './StickerPanel';
import { patchSticker, placementToSticker, removeSticker, stepSticker } from './stickers';
import { assets, measureContext, STICKER_SIDE, silently, useUi } from './store';
import { S } from './strings';
import { CARD_H, CARD_W, MAX_MEMBERS, members, soloScene } from './templates/roster';
import { activeOf, MAX_PAGES, pagesOf, variantOf } from './templates/textlog';

export interface PreviewProps {
  def: TemplateDef;
  store: ToolStore<Draft>;
  d: Draft;
  picker: CanvasPicker;
}

/** 7 張以上時才有「只看這一張」 */
const SOLO_MIN = 7;

export function Preview({ def, store, d, picker }: PreviewProps) {
  const toast = useToast();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const ui = useUi();
  const side = ui.side[def.id];
  const sticker = ui.sticker;

  /* 圖片：還沒讀進記憶體的先讀，讀好再重畫 */
  useEffect(() => {
    const ids = draftAssets(d).filter((id) => !assets.peekBitmap(id));
    if (!ids.length) return;
    let alive = true;
    void assets.preload(ids).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [d]);

  const rosterSolo = def.kind === 'roster' && ui.solo && members(d).length >= SOLO_MIN;
  const soloMember = rosterSolo
    ? (members(d).find((n) => `m${n}` === side) ?? members(d)[0])
    : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 是圖片與字型載入後的重畫
  const nodes = useMemo(
    () => (soloMember !== null ? soloScene(d, sceneEnv(d), soloMember) : def.scene(d, sceneEnv(d))),
    [def, d, tick, soloMember],
  );

  /* 字型：用到的字載入後重畫 */
  useEffect(() => {
    let alive = true;
    void loadSceneFonts(nodes).then((changed) => {
      if (changed && alive) setTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [nodes]);

  const size = soloMember !== null ? { width: CARD_W, height: CARD_H } : def.size(d);

  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (c.width !== size.width) c.width = size.width;
    if (c.height !== size.height) c.height = size.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    drawScene(ctx, nodes);
    if (soloMember === null) drawStickers(ctx, def, d);
  });

  const regions = useMemo(() => collectHitRegions(nodes, measureContext()), [nodes]);
  const stickers: LayoutSticker[] =
    soloMember !== null
      ? []
      : d.stickers.map((s) => ({
          id: s.id,
          label: S.stickerName(s.name),
          placement: stickerPlacement(def, d, s),
          bounds: def.stickerArea(d, s),
          hidden: !(def.stickerVisible?.(d, s) ?? true),
        }));

  const onPick = (key: string) => {
    if (key.startsWith('goto/')) {
      const n = Number(key.slice(5));
      silently(store, () => store.getState().patch({ active: n, view: 'single' }));
      useUi.getState().open(def.id, `p${n}`);
      return;
    }
    const h = parseHitKey(key);
    if (!h) return;
    chooseSide(def, store, h.side);
    useUi.getState().open(def.id, h.side, h.group);
  };

  const stickerToolbar = (id: string) => {
    const s = d.stickers.find((x) => x.id === id);
    if (!s) return null;
    const set = (next: Draft) => store.getState().replace(next);
    return (
      <>
        <IconButton
          size="sm"
          label={S.stickerShadow}
          icon={<SquareDashed />}
          pressed={s.shadow}
          onClick={() => set(patchSticker(store.getState().data, id, { shadow: !s.shadow }))}
        />
        <IconButton
          size="sm"
          label={S.stickerOutline}
          icon={<Square />}
          pressed={s.outline}
          onClick={() => set(patchSticker(store.getState().data, id, { outline: !s.outline }))}
        />
        <IconButton
          size="sm"
          label={S.stickerFront}
          icon={<BringToFront />}
          disabled={d.stickers[0]?.id === id}
          onClick={() => set(stepSticker(store.getState().data, id, 'front'))}
        />
        <IconButton
          size="sm"
          label={S.stickerBack}
          icon={<SendToBack />}
          disabled={d.stickers.at(-1)?.id === id}
          onClick={() => set(stepSticker(store.getState().data, id, 'back'))}
        />
        <IconButton
          size="sm"
          label={S.stickerDelete}
          icon={<Trash2 />}
          onClick={() => {
            set(removeSticker(store.getState().data, id));
            useUi.getState().setSticker(null);
          }}
        />
      </>
    );
  };

  const big = stickerMax(def.size(d));
  const toolbarExtra =
    def.kind === 'roster' && members(d).length >= SOLO_MIN ? (
      <Button
        size="sm"
        variant={rosterSolo ? 'primary' : 'secondary'}
        icon={<LayoutGrid />}
        onClick={() => ui.setSolo(!ui.solo)}
        aria-pressed={rosterSolo}
      >
        {rosterSolo ? S.overview : S.solo}
      </Button>
    ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="preview">
      <Stage
        width={size.width}
        height={size.height}
        aria-label={S.previewAria}
        defaultBackground={{ kind: 'checker' }}
        toolbarExtra={toolbarExtra}
      >
        <canvas
          ref={canvas}
          width={size.width}
          height={size.height}
          className="block size-full"
          data-testid="pair-canvas"
          data-size={`${size.width}x${size.height}`}
        />
        <LayoutCanvas
          width={size.width}
          height={size.height}
          aria-label={S.canvasAria}
          regions={regions}
          activeKey={
            side && side !== STICKER_SIDE ? `${side}/${ui.group[`${def.id}|${side}`] ?? ''}` : null
          }
          onPick={onPick}
          stickers={stickers}
          selectedSticker={sticker}
          onSelectSticker={(id) => {
            const s = d.stickers.find((x) => x.id === id) ?? null;
            selectSticker(def, store, s);
            if (s) ui.setSide(def.id, STICKER_SIDE);
          }}
          onStickerChange={(id, p, phase) => {
            const st = store.getState();
            if (phase === 'start') {
              store.beginGesture();
              return;
            }
            const cur = st.data.stickers.find((x) => x.id === id);
            if (!cur) return;
            st.replace(patchSticker(st.data, id, placementToSticker(def, st.data, cur, p)));
            if (phase === 'end') store.endGesture();
          }}
          onStickerDelete={(id) => {
            store.getState().replace(removeSticker(store.getState().data, id));
            ui.setSticker(null);
          }}
          stickerRange={{ min: 12, max: big }}
          stickerToolbar={stickerToolbar}
          picker={picker}
          pickSource={() => canvas.current}
          pickHint={S.pickHint}
        />
      </Stage>
      {def.kind === 'textlog' ? <PageNav def={def} store={store} d={d} /> : null}
      {def.kind === 'roster' ? <RosterNav def={def} store={store} d={d} /> : null}
      <ExportBar
        def={def}
        store={store}
        size={def.size(d)}
        onError={(m) => toast({ title: m, tone: 'danger' })}
      />
    </div>
  );
}

/* ---------- 文字記錄的頁面切換 ---------- */

function PageNav({ def, store, d }: { def: TemplateDef; store: ToolStore<Draft>; d: Draft }) {
  const toast = useToast();
  const pages = pagesOf(d);
  const n = activeOf(d);
  const i = pages.indexOf(n);
  const all = d.view === 'all';
  const go = (k: number) => {
    silently(store, () => store.getState().patch({ active: k, view: 'single' }));
    chooseSide(def, store, `p${k}`);
  };
  return (
    <nav
      aria-label={S.pageNavAria}
      className="flex flex-wrap items-center justify-center gap-2"
      data-testid="page-nav"
    >
      <IconButton
        label={S.prevPage}
        icon={<ChevronLeft />}
        disabled={all || i <= 0}
        onClick={() => go(pages[i - 1])}
      />
      <span
        className="min-w-14 text-center text-sm tabular-nums text-fg"
        aria-live="polite"
        data-testid="page-counter"
      >
        {S.pageCounter(i + 1, pages.length)}
      </span>
      <IconButton
        label={S.nextPage}
        icon={<ChevronRight />}
        disabled={all || i >= pages.length - 1}
        onClick={() => go(pages[i + 1])}
      />
      <Button
        size="sm"
        icon={all ? <ArrowLeftToLine /> : <LayoutGrid />}
        aria-pressed={all}
        onClick={() =>
          silently(store, () => store.getState().patch({ view: all ? 'single' : 'all' }))
        }
      >
        {all ? S.viewSingle : S.viewAll}
      </Button>
      <Button
        size="sm"
        icon={<Plus />}
        disabled={pages.length >= MAX_PAGES}
        onClick={() => {
          if (!addPageTo(def, store)) toast({ title: S.pageLimit, tone: 'warning' });
        }}
      >
        {S.addPage}
      </Button>
    </nav>
  );
}

/* ---------- 多人資料框：畫布下方的新增鈕（舊版畫布區的「＋」） ---------- */

function RosterNav({ def, store, d }: { def: TemplateDef; store: ToolStore<Draft>; d: Draft }) {
  const toast = useToast();
  const n = members(d).length;
  return (
    <nav
      aria-label={S.rosterNavAria}
      className="flex flex-wrap items-center justify-center gap-2"
      data-testid="roster-nav"
    >
      <span className="text-sm tabular-nums text-muted" data-testid="member-count">
        {S.memberCount(n, MAX_MEMBERS)}
      </span>
      <Button
        size="sm"
        icon={<Plus />}
        disabled={n >= MAX_MEMBERS}
        onClick={() => {
          if (!addMemberTo(def, store)) toast({ title: S.memberLimit, tone: 'warning' });
        }}
        data-testid="canvas-add-member"
      >
        {S.addMember}
      </Button>
    </nav>
  );
}

/* ---------- 下載 ---------- */

function ExportBar({
  def,
  store,
  size,
  onError,
}: {
  def: TemplateDef;
  store: ToolStore<Draft>;
  size: { width: number; height: number };
  onError: (message: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<'png' | 'pdf' | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const isLog = def.kind === 'textlog';

  /* 下載前先分頁一次（本文欄剛貼上、還沒分頁的字也要在輸出裡；同舊版按 PDF 時的 scene.paginate()） */
  const latest = async (): Promise<Draft> => {
    await paginateNow(def, store);
    return store.getState().data;
  };

  const png = async () => {
    setBusy('png');
    try {
      const blob = await exportPng(def, await latest());
      const name = outputName(def, 'png');
      downloadBlob(blob, name);
      toast({ title: S.pngDone(name), tone: 'success' });
    } catch {
      onError(S.pngFailed);
    } finally {
      setBusy(null);
    }
  };

  const pdf = async () => {
    const variant = variantOf(def.id);
    if (!variant) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setBusy('pdf');
    setProgress(S.pdfFonts);
    try {
      const [{ logPdf }, data] = await Promise.all([import('./pdf'), latest()]);
      ctl.signal.throwIfAborted();
      const bytes = await logPdf(def, variant, data, {
        signal: ctl.signal,
        onProgress: (n, total) => setProgress(S.pdfProgress(n, total)),
      });
      const name = outputName(def, 'pdf');
      downloadBytes(bytes, name, 'application/pdf');
      setProgress(S.pdfDone(pagesOf(data).length));
    } catch (e) {
      if (ctl.signal.aborted) setProgress(S.pdfCanceled);
      else {
        setProgress(null);
        onError(`${S.pdfFailed}${e instanceof Error && e.message ? `（${e.message}）` : ''}`);
      }
    } finally {
      abort.current = null;
      setBusy(null);
    }
  };

  return (
    <section
      aria-label={S.exportTitle}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
      data-testid="export-bar"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<Download />}
          onClick={png}
          loading={busy === 'png'}
          disabled={busy !== null}
        >
          {S.downloadPng}
        </Button>
        {isLog ? (
          <Button
            icon={<FileText />}
            onClick={pdf}
            loading={busy === 'pdf'}
            disabled={busy !== null}
          >
            {S.downloadPdf}
          </Button>
        ) : null}
        {busy === 'pdf' ? (
          <Button size="sm" variant="ghost" icon={<X />} onClick={() => abort.current?.abort()}>
            {S.pdfCancel}
          </Button>
        ) : null}
        <span className="ml-auto text-sm tabular-nums text-muted" data-testid="export-size">
          {S.exportSize(size.width, size.height)}
        </span>
      </div>
      <p className="m-0 text-xs text-muted">
        {S.exportNote}
        {isLog ? ` ${S.pdfNote}` : ''}
      </p>
      {progress ? <Notice tone={busy === 'pdf' ? 'progress' : 'info'}>{progress}</Notice> : null}
    </section>
  );
}
