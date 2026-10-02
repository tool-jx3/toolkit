/**
 * 輸出範圍（F230～F233）、查看成品（F079）、文字輸入（註解、樣板名稱）與選擇（TTC 的字體）的對話框。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import {
  Button,
  type ChoiceOptions,
  Dialog,
  DialogClose,
  Field,
  NativeNumberInput,
  Notice,
  Segmented,
  TextArea,
  TextInput,
  useChoice,
  useConfirm,
} from '@/ui';
import { bridge, type PromptOptions, type PromptResult } from '../bridge';
import { findBlock } from '../model/blocks';
import { clampRange, downloadExportHtml, downloadPdf, printRange } from '../output';
import { blockHtml, type RenderCtx } from '../render/html';
import { doc, say, setUi, useDoc, useUi } from '../store';
import { S } from '../strings';

/* ---------- 輸出範圍 ---------- */

export function OutputDialog() {
  const kind = useUi((s) => s.output);
  const total = useUi((s) => s.total);
  const [mode, setMode] = useState<'all' | 'range'>('all');
  const [a, setA] = useState('1');
  const [b, setB] = useState('1');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (kind) {
      setMode('all');
      setA('1');
      setB(String(total));
      setErr('');
      setBusy(null);
    }
  }, [kind, total]);
  const close = () => {
    abort.current?.abort();
    setUi({ output: null });
  };
  const range = () => (mode === 'all' ? { from: 0, to: total - 1 } : clampRange(+a, +b, total));
  const pages = () => useUi.getState().layout.pages;

  const doPrint = async () => {
    const r = range();
    close();
    await printRange(doc(), pages(), r);
  };
  const doPdf = async () => {
    const r = range();
    const ac = new AbortController();
    abort.current = ac;
    setErr('');
    setBusy('準備中…');
    try {
      const name = await downloadPdf(doc(), pages(), r, {
        signal: ac.signal,
        onProgress: (n, t) => setBusy(`產生 PDF 中…（${n}／${t} 頁）`),
      });
      say(S.status.pdfDone(name));
      setUi({ output: null });
    } catch (e) {
      if (ac.signal.aborted) return;
      setErr(
        e instanceof Error && e.name === 'PdfFontError'
          ? e.message
          : `無法產生 PDF：${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(null);
      abort.current = null;
    }
  };
  const doExport = () => {
    const name = downloadExportHtml(doc(), pages(), range());
    say(S.status.htmlDone(name));
    close();
  };
  const exp = kind === 'export';
  return (
    <Dialog
      open={!!kind}
      onOpenChange={(o) => !o && close()}
      title={exp ? '匯出閱覽用 HTML' : '列印 / PDF'}
      description={
        exp
          ? '一定附上目錄；閱讀者可以把目錄的標題遮住，避免先看到劇情。'
          : '列印只印出紙面（A4、無邊界），彈出視窗的內容集中在書末的附錄頁。'
      }
      footer={
        exp ? (
          <>
            <DialogClose>取消</DialogClose>
            <Button onClick={doExport}>匯出</Button>
          </>
        ) : (
          <>
            <DialogClose>{busy ? '取消' : '關閉'}</DialogClose>
            <Button
              variant="secondary"
              loading={!!busy}
              disabled={!!busy}
              onClick={() => void doPdf()}
            >
              下載 PDF
            </Button>
            <Button disabled={!!busy} onClick={() => void doPrint()}>
              列印
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3" data-testid="se-output">
        <Segmented
          value={mode}
          onValueChange={setMode}
          aria-label="範圍"
          options={[
            { value: 'all', label: `全部（${total} 頁）` },
            { value: 'range', label: '指定頁' },
          ]}
        />
        {mode === 'range' ? (
          <div className="flex items-end gap-2">
            <Field label="從第">
              <NativeNumberInput value={a} min={1} max={total} onChange={setA} unit="頁" />
            </Field>
            <span className="pb-2">～</span>
            <Field label="到第">
              <NativeNumberInput value={b} min={1} max={total} onChange={setB} unit="頁" />
            </Field>
          </div>
        ) : null}
        {!exp ? (
          <p className="m-0 text-xs text-muted">
            「下載 PDF」直接產生 PDF
            檔（文字可以選取、搜尋）；第一次會下載思源宋體／思源黑體，之後記在瀏覽器裡。
          </p>
        ) : null}
        {busy ? <Notice tone="progress">{busy}</Notice> : null}
        {err ? <Notice tone="danger">{err}</Notice> : null}
      </div>
    </Dialog>
  );
}

/* ---------- 查看成品 ---------- */

export function PreviewDialog() {
  const id = useUi((s) => s.preview);
  const d = useDoc((s) => s.data);
  const layout = useUi((s) => s.layout);
  const html = useMemo(() => {
    if (!id) return '';
    const b = findBlock(d, id)?.b;
    if (!b) return '';
    const ctx: RenderCtx = {
      doc: d,
      edit: false,
      pageOf: (x) => (layout.pageOf[x] == null ? null : layout.pageOf[x] + 1),
      total: layout.pages.length,
    };
    return `<div class="pg" style="height:auto;min-height:0;width:210mm"><div class="pg-body" style="padding:8mm ${d.padH}mm;font-size:${d.base}pt;height:auto">${blockHtml(b, ctx, { cols: 1, pull: 0, top: true })}</div></div>`;
  }, [id, d, layout]);
  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => !o && setUi({ preview: null })}
      title="查看成品"
      size="xl"
      footer={<DialogClose />}
    >
      <div
        className="overflow-auto rounded-md bg-surface-2 p-3"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: 紙面的 HTML 由本工具產生（文字都已跳脫）
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Dialog>
  );
}

/* ---------- 文字輸入 ---------- */

interface PromptState {
  o: PromptOptions | null;
  resolve: ((r: PromptResult | null) => void) | null;
}

const usePrompt = create<PromptState>(() => ({ o: null, resolve: null }));

export function askText(o: PromptOptions): Promise<PromptResult | null> {
  return new Promise((resolve) => {
    usePrompt.getState().resolve?.(null);
    usePrompt.setState({ o, resolve });
  });
}

export function PromptDialog() {
  const { o, resolve } = usePrompt();
  const [v, setV] = useState('');
  const [v2, setV2] = useState('');
  const first = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (o) {
      setV(o.value ?? '');
      setV2(o.second?.value ?? '');
    }
  }, [o]);
  const done = (r: PromptResult | null) => {
    resolve?.(r);
    usePrompt.setState({ o: null, resolve: null });
  };
  return (
    <Dialog
      open={!!o}
      onOpenChange={(open) => !open && done(null)}
      title={o?.title ?? ''}
      description={o?.description}
      size="sm"
      initialFocus={first}
      footer={
        <>
          <Button variant="secondary" onClick={() => done(null)}>
            取消
          </Button>
          <Button onClick={() => done({ value: v, second: v2 })}>
            {o?.confirmLabel ?? '確定'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          done({ value: v, second: v2 });
        }}
      >
        <Field label={o?.label ?? ''}>
          {o?.multiline ? (
            <TextArea
              ref={first}
              rows={4}
              value={v}
              maxLength={o?.maxLength}
              onChange={(e) => setV(e.target.value)}
            />
          ) : (
            <TextInput
              ref={first}
              value={v}
              maxLength={o?.maxLength}
              onChange={(e) => setV(e.target.value)}
            />
          )}
        </Field>
        {o?.second ? (
          <Field label={o.second.label}>
            <TextInput
              value={v2}
              maxLength={o.second.maxLength}
              onChange={(e) => setV2(e.target.value)}
            />
          </Field>
        ) : null}
      </form>
    </Dialog>
  );
}

/** 把橋接到共用的確認、選擇與這裡的文字輸入 */
export function BridgeBinder() {
  const confirm = useConfirm();
  const choose = useChoice();
  useEffect(() => {
    bridge.confirm = (o) => confirm(o);
    bridge.prompt = askText;
    bridge.choose = (o) =>
      choose({
        title: o.title,
        description: o.description,
        choices: o.choices,
      } as ChoiceOptions) as Promise<string | null>;
  }, [confirm, choose]);
  return null;
}
