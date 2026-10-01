import { Download, ImagePlus, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { downloadSequentially, formatBytes, readAsBytes } from '@/core/files';
import { canvasToBlob, detectImageType, getImageData, loadImage } from '@/core/image';
import {
  Button,
  Field,
  FileDrop,
  Notice,
  type NoticeTone,
  Section,
  Segmented,
  Slider,
  ThumbnailList,
  Toggle,
  ToolShell,
  UsageSection,
  useWebpSupport,
} from '@/ui';
import {
  composePixels,
  contentRect,
  type OutputOptions,
  outputName,
  outputSpec,
  placeAll,
  QUALITY_RANGE,
  type RgbaBuffer,
  type SourceKind,
  sourceKind,
} from './logic';
import { S } from './strings';

interface Item {
  id: string;
  file: File;
  /** 原圖縮圖用的物件網址 */
  url: string;
  kind: SourceKind;
}

interface Result {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

interface ProcessOptions {
  trim: boolean;
  align: boolean;
}

interface Status {
  tone: NoticeTone;
  text: string;
  detail?: string;
}

/** 選檔視窗的類型（實際收不收由檔頭判斷） */
const ACCEPT = 'image/png,image/webp,.png,.webp';

let seq = 0;
const nextId = () => `img-${++seq}`;

/** 讓瀏覽器有機會更新畫面（進度） */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

function toCanvas(buf: RgbaBuffer): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = buf.width;
  c.height = buf.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error(S.canvasError);
  ctx.putImageData(new ImageData(buf.data, buf.width, buf.height), 0, 0);
  return c;
}

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
  /* 規格 F21：不保留任何檔案或設定，所以全部用元件狀態 */
  const [items, setItems] = useState<Item[]>([]);
  const [results, setResults] = useState<Map<string, Result> | null>(null);
  const [used, setUsed] = useState<ProcessOptions | null>(null);
  const [trim, setTrim] = useState(true);
  const [align, setAlign] = useState(true);
  const [webp, setWebp] = useState(true);
  const [qualityMode, setQualityMode] = useState<'lossless' | 'custom'>('lossless');
  const [quality, setQuality] = useState<number>(QUALITY_RANGE.default);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const webpSupported = useWebpSupport();

  const itemsRef = useRef(items);
  /** 清單變動時加一：進行中的處理看到不同就放棄結果 */
  const generation = useRef(0);
  const downloadAbort = useRef<AbortController | null>(null);

  /* 離開頁面時釋放縮圖網址 */
  useEffect(
    () => () => {
      for (const it of itemsRef.current) URL.revokeObjectURL(it.url);
    },
    [],
  );

  const commitItems = (next: Item[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  /** 處理結果作廢：縮圖回到未處理、下載停用，進行中的處理與下載都停止 */
  const invalidate = () => {
    generation.current++;
    downloadAbort.current?.abort();
    downloadAbort.current = null;
    setResults(null);
    setUsed(null);
    setProcessing(false);
    setDownloading(false);
  };

  const addFiles = async (files: File[]) => {
    const checked = await Promise.all(
      files.map(async (file) => ({
        file,
        kind: sourceKind(detectImageType(await readAsBytes(file.slice(0, 64))), file.type),
      })),
    );
    const accepted = checked.filter((c): c is { file: File; kind: SourceKind } => c.kind !== null);
    if (!accepted.length) {
      /* 全部不合格：顯示錯誤，已載入的清單與處理結果不受影響 */
      setStatus({ tone: 'danger', text: S.typeError });
      return;
    }
    invalidate();
    const next = [
      ...itemsRef.current,
      ...accepted.map(({ file, kind }) => ({
        id: nextId(),
        file,
        kind,
        url: URL.createObjectURL(file),
      })),
    ];
    commitItems(next);
    setStatus({ tone: 'success', text: S.loaded(next.length) });
  };

  const remove = (id: string) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (!it) return;
    invalidate();
    URL.revokeObjectURL(it.url);
    const next = itemsRef.current.filter((x) => x.id !== id);
    commitItems(next);
    setStatus(next.length ? { tone: 'success', text: S.loaded(next.length) } : null);
  };

  const clear = () => {
    invalidate();
    for (const it of itemsRef.current) URL.revokeObjectURL(it.url);
    commitItems([]);
    setStatus(null);
  };

  const process = async () => {
    invalidate();
    const my = generation.current;
    const list = itemsRef.current;
    const n = list.length;
    if (!n) return;
    const opts: ProcessOptions = { trim, align };
    setProcessing(true);
    /* 一律從原圖重算：先逐張解碼並裁掉透明留白，再依最寬的寬度對齊 */
    const crops: (RgbaBuffer | null)[] = [];
    for (let i = 0; i < n; i++) {
      /* 進度要在解碼大圖之前就畫出來 */
      flushSync(() => setStatus({ tone: 'progress', text: S.processing(i + 1, n) }));
      await yieldToUi();
      if (generation.current !== my) return;
      let pixels: ImageData;
      try {
        const bitmap = await loadImage(list[i].file);
        pixels = getImageData(bitmap);
        bitmap.close();
      } catch {
        if (generation.current !== my) return;
        setProcessing(false);
        setStatus({ tone: 'danger', text: S.readError(list[i].file.name) });
        return;
      }
      if (generation.current !== my) return;
      const rect = contentRect(pixels, opts.trim);
      crops.push(
        composePixels(pixels, { crop: rect, width: rect.width, height: rect.height, offsetX: 0 }),
      );
    }
    const placements = placeAll(
      crops.map((c) => ({ x: 0, y: 0, width: c!.width, height: c!.height })),
      opts.align,
    );
    const map = new Map<string, Result>();
    try {
      placements.forEach((p, i) => {
        const canvas = toCanvas(composePixels(crops[i]!, p));
        crops[i] = null;
        map.set(list[i].id, { canvas, width: p.width, height: p.height });
      });
    } catch (e) {
      /* 例如圖片太大、瀏覽器配置不到畫布 */
      if (generation.current !== my) return;
      setProcessing(false);
      setStatus({ tone: 'danger', text: S.processError(e instanceof Error ? e.message : '') });
      return;
    }
    if (generation.current !== my) return;
    setResults(map);
    setUsed(opts);
    setProcessing(false);
    setStatus({
      tone: 'success',
      text: S.processDone(n, opts.align ? (placements[0]?.width ?? null) : null),
    });
  };

  const downloadAll = async () => {
    if (!results) return;
    const ac = new AbortController();
    downloadAbort.current = ac;
    setDownloading(true);
    const options: OutputOptions = {
      webp,
      quality: qualityMode === 'lossless' ? 'lossless' : quality,
    };
    const list = itemsRef.current.filter((it) => results.has(it.id));
    try {
      await downloadSequentially(
        list.map((it) => {
          const spec = outputSpec(it.kind, options, webpSupported);
          const r = results.get(it.id)!;
          return {
            name: outputName(it.file.name, spec.ext),
            blob: () => canvasToBlob(r.canvas, spec.mime, spec.quality),
          };
        }),
        {
          signal: ac.signal,
          onProgress: (i, n) =>
            setStatus({
              tone: 'progress',
              text: S.downloading(i + 1, n),
              detail: S.downloadingHint,
            }),
        },
      );
      setStatus({ tone: 'success', text: S.downloaded(list.length) });
    } catch {
      /* 清單變動而取消時，狀態已由 invalidate 之後的動作更新 */
      if (!ac.signal.aborted) setStatus({ tone: 'danger', text: S.downloadError });
    } finally {
      if (downloadAbort.current === ac) {
        downloadAbort.current = null;
        setDownloading(false);
      }
    }
  };

  const optionsChanged = !!used && (used.trim !== trim || used.align !== align);
  const usage = <Usage />;

  const settings = (
    <>
      <Section title={S.sectionProcess} fixed description={S.processHint}>
        <Field label={S.trim} hint={S.trimHint} layout="inline">
          <Toggle checked={trim} onCheckedChange={setTrim} />
        </Field>
        <Field label={S.align} hint={S.alignHint} layout="inline">
          <Toggle checked={align} onCheckedChange={setAlign} />
        </Field>
      </Section>
      <Section title={S.sectionOutput} fixed>
        <Field label={S.webp} hint={S.webpHint} layout="inline">
          <Toggle checked={webp} onCheckedChange={setWebp} />
        </Field>
        <Field label={S.quality} hint={webp ? S.qualityHint : S.qualityDisabledHint}>
          <Segmented<'lossless' | 'custom'>
            value={qualityMode}
            onValueChange={setQualityMode}
            disabled={!webp}
            fullWidth
            options={[
              { value: 'lossless', label: S.qualityLossless },
              { value: 'custom', label: S.qualityCustom },
            ]}
          />
        </Field>
        {qualityMode === 'custom' ? (
          <Field label={S.qualityValue}>
            <Slider
              value={quality}
              onChange={setQuality}
              min={QUALITY_RANGE.min}
              max={QUALITY_RANGE.max}
              step={1}
              unit="%"
              disabled={!webp}
            />
          </Field>
        ) : null}
        {!webpSupported ? <Notice tone="warning">{S.webpUnsupported}</Notice> : null}
      </Section>
      <UsageSection>{usage}</UsageSection>
      <p className="m-0 px-1 text-xs text-muted">{S.disclaimer}</p>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-3">
      <FileDrop
        multiple
        accept={ACCEPT}
        filterByAccept={false}
        icon={<ImagePlus />}
        label={S.dropLabel}
        buttonLabel={S.dropButton}
        hint={S.dropHint}
        onFiles={(files) => void addFiles(files)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<Wand2 />}
          loading={processing}
          disabled={!items.length}
          onClick={() => void process()}
        >
          {S.process}
        </Button>
        <Button
          icon={<Download />}
          loading={downloading}
          disabled={!results}
          onClick={() => void downloadAll()}
        >
          {S.downloadAll}
        </Button>
        <Button variant="ghost" icon={<Trash2 />} disabled={!items.length} onClick={clear}>
          {S.clear}
        </Button>
      </div>
      {status ? (
        <Notice tone={status.tone}>
          <span data-testid="status-text">{status.text}</span>
          {status.detail ? <span className="mt-0.5 block text-xs">{status.detail}</span> : null}
        </Notice>
      ) : null}
      {optionsChanged ? <Notice tone="warning">{S.optionsChanged}</Notice> : null}
      <ThumbnailList
        aria-label={S.listLabel}
        empty={S.listEmpty}
        onRemove={remove}
        removeLabel={(it) => S.remove(it.name)}
        items={items.map((it) => {
          const r = results?.get(it.id);
          return {
            id: it.id,
            name: it.file.name,
            image: r ? r.canvas : it.url,
            status: r ? ('done' as const) : undefined,
            statusLabel: S.processed,
            meta: r ? S.sizeMeta(r.width, r.height) : formatBytes(it.file.size),
          };
        })}
      />
    </div>
  );

  return <ToolShell toolId="portrait-size" usage={usage} settings={settings} preview={preview} />;
}
