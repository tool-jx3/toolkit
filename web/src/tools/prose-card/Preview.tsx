/**
 * 預覽區：全部的頁一起看（每頁一張畫布，和輸出同一段程式畫）、每頁可以單獨下載；下面是共用的匯出區
 * （PNG，兩頁以上可以全部下載或打包成 ZIP）與手機的分享。
 */
import { Download, Share2 } from 'lucide-react';
import {
  memo,
  type Ref,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAssetImage } from '@/core/assets';
import { downloadBlob } from '@/core/files';
import { loadSceneFonts, type SceneNode } from '@/core/scene';
import {
  Button,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Notice,
  useToast,
} from '@/ui';
import { backgroundKey, buildBackground } from './background';
import { canShareFiles, type RenderedPage, renderPages } from './exporter';
import { useUploadedFonts } from './fonts';
import { fileBase, MAX_PAGES, PAGE_H, PAGE_W, type ProseState } from './model';
import { measureContext, type PageEnv, type Plan, pageNodes, paintPage, planPages } from './render';
import { assets, docNow, setPrefs, useDoc, usePrefs } from './store';
import { S } from './strings';

export interface PlanInfo {
  /** 分頁根據的狀態（打字時晚一點跟上，打字不會卡） */
  state: ProseState;
  plan: Plan;
  pages: SceneNode[][];
  env: PageEnv;
  /** 每一頁的內容簽名（沒變的頁不重畫） */
  sigs: string[];
}

/** 分頁的結果（字型載好、自己加的字型恢復後重排）；設定欄的頁數也用它 */
export function usePlan(): PlanInfo {
  const live = useDoc((st) => st.data);
  const s = useDeferredValue(live);
  const photo = useAssetImage(assets, s.layout === 'photo' ? s.photo.image?.id : null);
  const uploaded = useUploadedFonts();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts?.addEventListener) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(t);
      t = setTimeout(() => setTick((n) => n + 1), 60);
    };
    fonts.addEventListener('loadingdone', bump);
    return () => {
      clearTimeout(t);
      fonts.removeEventListener('loadingdone', bump);
    };
  }, []);
  const env = useMemo<PageEnv>(
    () => ({
      photo: photo.bitmap
        ? { source: photo.bitmap, width: photo.bitmap.width, height: photo.bitmap.height }
        : null,
      measure: measureContext(),
    }),
    [photo.bitmap],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick、字型清單是字型載入後重排
  const plan = useMemo(() => planPages(s), [s, tick, uploaded.list]);
  const pages = useMemo(() => plan.pages.map((_, i) => pageNodes(s, plan, i, env)), [s, plan, env]);
  const photoId = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 換了照片（env）就是新的簽名
  const envId = useMemo(() => ++photoId.current, [env]);
  const sigs = useMemo(() => {
    const settings = JSON.stringify({ ...s, body: null });
    return plan.pages.map(
      (p, i) => `${tick}|${envId}|${i}/${plan.pages.length}|${settings}|${JSON.stringify(p)}`,
    );
  }, [s, plan, tick, envId]);
  useEffect(() => {
    let alive = true;
    void loadSceneFonts(pages.flat()).then((changed) => {
      if (changed && alive) setTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [pages]);
  return { state: s, plan, pages, env, sigs };
}

interface PageCanvasProps {
  index: number;
  total: number;
  nodes: readonly SceneNode[];
  /** 內容簽名：一樣時不重畫 */
  sig: string;
  background: CanvasImageSource;
  onDownload: (index: number) => void;
  busy: boolean;
}

/** 一頁的畫布（簽名、背景都沒變時不重畫） */
const PageCanvas = memo(
  function PageCanvas({ index, total, nodes, background, onDownload, busy }: PageCanvasProps) {
    const canvas = useRef<HTMLCanvasElement>(null);
    useLayoutEffect(() => {
      const c = canvas.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      paintPage(ctx, background, nodes);
    });
    return (
      <figure
        className="m-0 flex w-full max-w-[540px] flex-col gap-1.5"
        data-testid="prose-page-frame"
      >
        <canvas
          ref={canvas}
          width={PAGE_W}
          height={PAGE_H}
          role="img"
          aria-label={S.pageAria(index + 1, total)}
          className="block h-auto w-full rounded-sm shadow-2"
          data-testid="prose-page"
          data-page={index + 1}
        />
        {total > 1 ? (
          <figcaption className="flex items-center justify-between gap-2 text-xs text-muted">
            <span className="tabular-nums" data-testid="page-caption">
              {S.pageCaption(index + 1, total)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={<Download />}
              disabled={busy}
              onClick={() => onDownload(index)}
              aria-label={`${S.downloadPage}（${S.pageCaption(index + 1, total)}）`}
            >
              {S.downloadPage}
            </Button>
          </figcaption>
        ) : null}
      </figure>
    );
  },
  (a, b) =>
    a.sig === b.sig &&
    a.background === b.background &&
    a.busy === b.busy &&
    a.total === b.total &&
    a.onDownload === b.onDownload,
);

function useBackground(s: ProseState) {
  const bgImg = useAssetImage(assets, s.bg.kind === 'image' ? s.bg.image?.id : null);
  const key = backgroundKey(s.bg, 1, !!bgImg.bitmap);
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 已包含影響畫面的設定
  const canvas = useMemo(
    () =>
      buildBackground(
        s.bg,
        bgImg.bitmap
          ? { source: bgImg.bitmap, width: bgImg.bitmap.width, height: bgImg.bitmap.height }
          : null,
        1,
      ),
    [key, bgImg.bitmap],
  );
  return { canvas, status: bgImg.status };
}

export function Preview({
  exportRef,
  planInfo,
}: {
  exportRef: Ref<ExportPanelHandle>;
  planInfo: PlanInfo;
}) {
  const live = useDoc((st) => st.data);
  const scale = usePrefs((p) => p.data.scale);
  const toast = useToast();
  const { plan, pages, sigs, state: s } = planInfo;
  const bg = useBackground(s);
  const photoStatus = useAssetImage(assets, s.layout === 'photo' ? s.photo.image?.id : null).status;
  const [busy, setBusy] = useState(false);
  const shareable = useMemo(() => canShareFiles(), []);
  /* 分享：先做好圖再分享；瀏覽器以「不是在點擊當下」拒絕時，留著做好的圖，請使用者再按一次 */
  const ready = useRef<{ state: ProseState; scale: number; files: File[] } | null>(null);
  const [sharing, setSharing] = useState(false);

  const downloadPage = useCallback(
    async (index: number) => {
      setBusy(true);
      try {
        const [p] = await renderPages(docNow(), scale, { indices: [index] });
        if (p) downloadBlob(p.blob, p.name);
      } catch {
        toast({ title: S.exportFailed, tone: 'danger' });
      } finally {
        setBusy(false);
      }
    },
    [scale, toast],
  );
  const onDownload = useCallback((k: number) => void downloadPage(k), [downloadPage]);

  const share = async () => {
    const cur = docNow();
    try {
      setSharing(true);
      let files =
        ready.current?.state === cur && ready.current.scale === scale ? ready.current.files : null;
      if (!files) {
        const list: RenderedPage[] = await renderPages(cur, scale);
        files = list.map((p) => new File([p.blob], p.name, { type: 'image/png' }));
        ready.current = { state: cur, scale, files };
      }
      await navigator.share({ files, title: cur.title.trim() || S.fileBase });
      ready.current = null;
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      if (name === 'AbortError') return;
      if (name === 'NotAllowedError') {
        toast({ title: S.shareRetry, tone: 'info' });
        return;
      }
      toast({ title: S.shareFailed, tone: 'danger' });
    } finally {
      setSharing(false);
    }
  };

  const settings: ExportSettings = { format: 'png', fps: 10, plays: 0, scale, quantize: false };
  const formats = useMemo(
    () => [{ id: 'png', label: S.formatPng, description: S.formatPngDesc }],
    [],
  );

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="preview">
      <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span
          className="rounded-full border border-border px-2 py-0.5 text-xs text-fg tabular-nums"
          data-testid="page-count"
          data-count={plan.pages.length}
        >
          {S.pageCount(plan.pages.length)}
        </span>
        <span className="text-xs">{S.sizeNote(scale)}</span>
      </p>
      {plan.capped ? <Notice tone="warning">{S.capped(MAX_PAGES)}</Notice> : null}
      {plan.firstEmpty ? <Notice tone="info">{S.firstEmpty}</Notice> : null}
      {photoStatus === 'missing' ? <Notice tone="warning">{S.imageMissing.photo}</Notice> : null}
      {bg.status === 'missing' ? <Notice tone="warning">{S.imageMissing.bg}</Notice> : null}
      <section
        aria-label={S.previewAria}
        className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface-2 p-3 sm:p-4"
      >
        {pages.map((nodes, i) => (
          <PageCanvas
            // biome-ignore lint/suspicious/noArrayIndexKey: 頁的順序就是身分
            key={i}
            index={i}
            total={pages.length}
            nodes={nodes}
            sig={sigs[i]}
            background={bg.canvas as CanvasImageSource}
            onDownload={onDownload}
            busy={busy}
          />
        ))}
      </section>
      <div id="prose-export" className="flex min-w-0 flex-col gap-3">
        <ExportPanel
          ref={exportRef}
          title={S.exportTitle}
          formats={formats}
          baseSize={{ width: PAGE_W, height: PAGE_H }}
          scaleOptions={[1, 2]}
          settings={settings}
          onSettingsChange={(n) => setPrefs({ scale: n.scale === 1 ? 1 : 2 })}
          resetKey={live}
          onExport={async (st, { signal, onProgress }) => {
            const cur = docNow();
            const list = await renderPages(cur, st.scale, { signal, onProgress });
            const files = list.map((p) => ({
              blob: p.blob,
              fileName: p.name,
              width: p.width,
              height: p.height,
            }));
            if (files.length === 1) return files[0];
            return { files, zipName: fileBase(cur.title, S.fileBase) };
          }}
        />
        {shareable ? (
          <div className="flex flex-col gap-1">
            <Button
              icon={<Share2 />}
              loading={sharing}
              disabled={sharing}
              onClick={() => void share()}
              className="self-start"
            >
              {sharing ? S.sharing : S.share}
            </Button>
            <p className="m-0 text-xs text-muted">{S.shareHint}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
