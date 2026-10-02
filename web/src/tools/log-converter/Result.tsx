/**
 * 結果區（F69～F80）：開始轉換、狀態列、預覽（不執行任何指令碼的內嵌框，固定高度約 500 px，每次重畫淡入）、
 * 預覽區段（起始編號、則數、檢視、範圍說明）、下載（單檔、分割檔、ZIP、部落格貼文版）。
 */
import { Download, FileArchive, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { downloadBytes, downloadText, zipFiles } from '@/core/files';
import { Button, Field, NativeNumberInput, Notice, Select, useConfirm, useToast } from '@/ui';
import { convert, refreshPreview } from './actions';
import { blogPage, type ConvertResult, downloadNames } from './render';
import { useSession } from './store';
import { S } from './strings';

const HTML_MIME = 'text/html;charset=utf-8';
const COUNTS = ['300', '500', '1000', '0'] as const;

function PreviewFrame() {
  const html = useSession((s) => s.previewHtml);
  const key = useSession((s) => s.previewKey);
  const ref = useRef<HTMLIFrameElement>(null);
  /* 每次重畫約 0.3 秒淡入（F72；減少動態效果時不動） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 只用來觸發
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
  }, [key]);
  if (!html)
    return (
      <div
        className="flex h-[500px] items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-2 p-6 text-center text-sm text-muted"
        data-testid="preview-empty"
      >
        {S.result.previewEmpty}
      </div>
    );
  return (
    <iframe
      ref={ref}
      title={S.result.previewFrame}
      sandbox=""
      srcDoc={html}
      data-testid="preview-frame"
      data-preview-key={key}
      className="block h-[500px] w-full rounded-md border border-border bg-surface-2"
    />
  );
}

function PreviewRange() {
  const entries = useSession((s) => s.entries);
  const start = useSession((s) => s.previewStart);
  const limit = useSession((s) => s.previewLimit);
  const result = useSession((s) => s.result);
  const key = useSession((s) => s.previewKey);
  const [draft, setDraft] = useState(String(start));
  /* 每次重畫都把修正後的起始編號寫回欄位（F74） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 只用來觸發
  useEffect(() => setDraft(String(start)), [start, key]);
  if (!result || !entries.length) return null;
  const total = entries.length;
  const apply = (lim = limit) => {
    const v = Number.parseInt(draft, 10);
    refreshPreview(Number.isFinite(v) ? v : 1, lim);
  };
  const last = limit ? Math.min(total, start - 1 + limit) : total;
  return (
    <div className="flex flex-col gap-2" data-testid="preview-range">
      <form
        noValidate
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="w-36">
          <Field label={S.result.rangeStart}>
            <NativeNumberInput value={draft} min={1} onChange={setDraft} size="sm" />
          </Field>
        </div>
        <div className="w-32">
          <Field label={S.result.rangeCount}>
            <Select
              size="sm"
              value={String(limit)}
              onValueChange={(v) => apply(Number(v))}
              options={COUNTS.map((c) => ({
                value: c,
                label: c === '0' ? S.result.rangeAll : `${c} 則`,
              }))}
            />
          </Field>
        </div>
        <Button size="sm" variant="secondary" type="submit">
          {S.result.rangeApply}
        </Button>
      </form>
      <p className="m-0 text-xs text-muted" data-testid="preview-info" aria-live="polite">
        {limit ? S.result.rangeInfo(start, last, total) : S.result.rangeInfoAll(total)}
      </p>
    </div>
  );
}

function Downloads({ result, blog }: { result: ConvertResult; blog: boolean }) {
  const toast = useToast();
  const [zipping, setZipping] = useState<'zip' | 'blog' | null>(null);
  const total = result.pages.length;
  const names = downloadNames(result.fileBase, total);
  const zip = async (kind: 'zip' | 'blog') => {
    setZipping(kind);
    try {
      await new Promise((r) => setTimeout(r, 0));
      const entries = result.pages.map((html, i) =>
        kind === 'zip'
          ? { name: names.page(i), data: html }
          : { name: names.blog(i), data: blogPage(result, i) },
      );
      downloadBytes(
        zipFiles(entries),
        kind === 'zip' ? names.zip : names.blogZip,
        'application/zip',
      );
    } catch {
      toast({ title: S.result.zipFailed, tone: 'danger' });
    } finally {
      setZipping(null);
    }
  };
  const blogClass = 'border-warning text-warning';
  return (
    <div className="flex flex-col gap-2" data-testid="downloads">
      <h3 className="m-0 text-sm font-semibold">{S.result.downloads}</h3>
      <div className="flex flex-wrap gap-2">
        {total > 1 && (
          <>
            <Button
              variant="primary"
              icon={<FileArchive />}
              loading={zipping === 'zip'}
              disabled={zipping !== null}
              onClick={() => void zip('zip')}
            >
              {zipping === 'zip' ? S.result.zipping : S.result.downloadZip}
            </Button>
            {blog && (
              <Button
                variant="secondary"
                className={blogClass}
                icon={<FileArchive />}
                loading={zipping === 'blog'}
                disabled={zipping !== null}
                onClick={() => void zip('blog')}
                data-blog=""
              >
                {zipping === 'blog' ? S.result.zipping : S.result.downloadBlogZip}
              </Button>
            )}
          </>
        )}
        {result.pages.map((html, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 分割檔依序排列
          <span key={i} className="contents">
            <Button
              variant={total > 1 ? 'secondary' : 'primary'}
              icon={<Download />}
              onClick={() => downloadText(html, names.page(i), HTML_MIME)}
            >
              {total > 1 ? S.result.downloadPart(i + 1) : S.result.downloadHtml}
            </Button>
            {blog && (
              <Button
                variant="secondary"
                className={blogClass}
                icon={<Download />}
                onClick={() => downloadText(blogPage(result, i), names.blog(i), HTML_MIME)}
                data-blog=""
              >
                {total > 1 ? S.result.downloadBlogPart(i + 1) : S.result.downloadBlog}
              </Button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ResultPanel() {
  const status = useSession((s) => s.status);
  const result = useSession((s) => s.result);
  const blog = useSession((s) => s.resultBlog);
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await convert((list, limitKb) =>
        confirm({
          title: S.result.bigImagesTitle,
          description: (
            <span className="whitespace-pre-wrap" data-testid="big-images">
              {S.result.bigImages(limitKb, list.join('\n'))}
            </span>
          ),
          confirmLabel: S.result.continue,
        }),
      );
    } catch (e) {
      toast({ title: S.result.failed(e instanceof Error ? e.message : String(e)), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="result">
      <Button
        variant="primary"
        size="lg"
        icon={<Play />}
        loading={busy}
        onClick={() => void run()}
        className="w-full"
      >
        {S.result.convert}
      </Button>
      <div aria-live="polite" data-testid="status">
        {status && <Notice tone={status.tone}>{status.text}</Notice>}
      </div>
      <h2 className="m-0 text-base font-semibold">{S.result.previewTitle}</h2>
      <PreviewFrame />
      <PreviewRange />
      {result && <Downloads result={result} blog={blog} />}
    </div>
  );
}
