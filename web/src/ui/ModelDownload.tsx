/**
 * 大型模型檔（`@/core/models`）的下載卡與狀態 hook：第一次用時先說明大小與來源、由使用者按下載；
 * 顯示進度、可以取消；下載完驗 SHA-256，不符就丟掉並說明；存在瀏覽器裡；可以刪除。
 *
 * ```tsx
 * const model = useModelCache(spec);
 * <ModelDownloadPanel spec={spec} {...model} />
 * if (model.state.status === 'ready') …
 * ```
 */
import { Download, ExternalLink, RotateCcw, Trash2, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  deleteModel,
  downloadModel,
  formatModelProgress,
  formatModelSize,
  ModelError,
  type ModelErrorKind,
  type ModelSpec,
  type ModelStorage,
  modelStatus,
  requestPersistentStorage,
  storageEstimate,
} from '@/core/models';
import { Button } from './Button';
import { cn } from './cn';
import { useConfirm } from './Dialog';
import { Notice } from './Notice';
import { ProgressBar } from './ProgressBar';

export type ModelCacheState =
  | { status: 'checking' }
  | { status: 'missing' }
  | { status: 'downloading'; loaded: number; total: number }
  | { status: 'verifying' }
  | { status: 'saving' }
  | { status: 'ready' }
  | { status: 'error'; kind: ModelErrorKind; message: string };

export interface ModelCache {
  state: ModelCacheState;
  /** 開始下載（已經在下載或已經有了時不做事） */
  download: () => Promise<void>;
  /** 取消下載 */
  cancel: () => void;
  /** 刪除已下載的模型 */
  remove: () => Promise<void>;
  /** 重新檢查（例如推論時發現模型被刪掉、驗證不符） */
  refresh: () => Promise<void>;
}

export interface ModelCacheOptions {
  /** 存放處（預設 Cache Storage，不能用時 IndexedDB；測試與元件展示頁用記憶體） */
  storage?: ModelStorage;
  /** 換掉 fetch（元件展示頁用假的下載，不連網） */
  fetch?: typeof fetch;
}

/** 模型的下載狀態（同一頁面裡每個 hook 各自檢查；下載後狀態變 ready） */
export function useModelCache(
  spec: ModelSpec,
  { storage, fetch: fetchImpl }: ModelCacheOptions = {},
): ModelCache {
  const [state, setState] = useState<ModelCacheState>({ status: 'checking' });
  const abort = useRef<AbortController | null>(null);
  const specRef = useRef(spec);
  specRef.current = spec;

  const refresh = useCallback(async () => {
    if (abort.current) return;
    const s = await modelStatus(specRef.current, storage);
    if (!abort.current) setState({ status: s === 'cached' ? 'ready' : 'missing' });
  }, [storage]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 換了模型（網址或 SHA-256）才重新檢查
  useEffect(() => {
    void refresh();
  }, [spec.url, spec.sha256, refresh]);

  /* 離開頁面時停止下載 */
  useEffect(() => () => abort.current?.abort(), []);

  const download = useCallback(async () => {
    if (abort.current) return;
    const s = specRef.current;
    const ac = new AbortController();
    abort.current = ac;
    try {
      /* 明顯放不下時先說明，不要下載到最後才失敗 */
      const room = await storageEstimate();
      if (room && room.quota - room.usage < s.bytes) throw new ModelError('quota');
      setState({ status: 'downloading', loaded: 0, total: s.bytes });
      let lastPaint = 0;
      await downloadModel(s, {
        signal: ac.signal,
        storage,
        fetch: fetchImpl,
        onProgress: (p) => {
          if (p.phase === 'verify') setState({ status: 'verifying' });
          else if (p.phase === 'save') setState({ status: 'saving' });
          else {
            /* 進度最多每 100 毫秒更新一次畫面 */
            const now = performance.now();
            if (now - lastPaint < 100 && p.loaded < p.total) return;
            lastPaint = now;
            setState({ status: 'downloading', loaded: p.loaded, total: p.total });
          }
        },
      });
      setState({ status: 'ready' });
      void requestPersistentStorage();
    } catch (e) {
      const err = e instanceof ModelError ? e : new ModelError('network', { cause: e });
      setState({ status: 'error', kind: err.kind, message: err.message });
    } finally {
      if (abort.current === ac) abort.current = null;
    }
  }, [storage, fetchImpl]);

  const cancel = useCallback(() => abort.current?.abort(), []);

  const remove = useCallback(async () => {
    abort.current?.abort();
    await deleteModel(specRef.current, storage);
    setState({ status: 'missing' });
  }, [storage]);

  return { state, download, cancel, remove, refresh };
}

export interface ModelDownloadPanelProps extends ModelCache {
  spec: ModelSpec;
  /** 下載前的說明（預設：要先下載模型才能使用＋大小、來源、授權） */
  intro?: ReactNode;
  /** 已下載時的補充（例如目前用顯示卡或 CPU） */
  readyExtra?: ReactNode;
  /** 停用刪除（例如推論中） */
  deleteDisabled?: boolean;
  className?: string;
}

/** 模型的下載卡：說明 → 下載（進度、取消）→ 驗證 → 已下載（可刪除）；失敗時說明並可重試 */
export function ModelDownloadPanel({
  spec,
  state,
  download,
  cancel,
  remove,
  intro,
  readyExtra,
  deleteDisabled,
  className,
}: ModelDownloadPanelProps) {
  const confirm = useConfirm();
  const labelId = useId();
  const size = formatModelSize(spec.bytes);
  const source = spec.homepage ? (
    <a href={spec.homepage} target="_blank" rel="noreferrer" className="text-accent underline">
      {spec.source}
      <ExternalLink aria-hidden className="ml-0.5 inline size-3 align-[-1px]" />
    </a>
  ) : (
    spec.source
  );
  const about = (
    <span className="text-xs text-muted">
      來源：{source}；授權：{spec.license}。只要下載一次，存在這個瀏覽器裡，之後離線也能用。
    </span>
  );

  let body: ReactNode;
  switch (state.status) {
    case 'checking':
      body = <p className="m-0 text-sm text-muted">正在檢查模型…</p>;
      break;
    case 'missing':
      body = (
        <>
          <p className="m-0 text-sm">
            {intro ?? (
              <>
                要先下載 AI 模型才能使用：{spec.name}，{size}。
              </>
            )}
          </p>
          {about}
          <Button
            variant="primary"
            icon={<Download />}
            onClick={() => void download()}
            className="self-start"
          >
            下載模型（{size}）
          </Button>
        </>
      );
      break;
    case 'downloading':
    case 'verifying':
    case 'saving': {
      const text =
        state.status === 'downloading'
          ? formatModelProgress(state.loaded, state.total)
          : state.status === 'verifying'
            ? '正在檢查檔案是否完整（SHA-256）…'
            : '正在存進瀏覽器…';
      body = (
        <>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span id={labelId}>下載模型中</span>
            <span className="tabular-nums text-muted" data-testid="model-progress-text">
              {text}
            </span>
          </div>
          <ProgressBar
            aria-labelledby={labelId}
            value={state.status === 'downloading' ? state.loaded / state.total : null}
            valueText={text}
          />
          <Button
            icon={<X />}
            onClick={cancel}
            disabled={state.status !== 'downloading'}
            className="self-end"
          >
            取消下載
          </Button>
        </>
      );
      break;
    }
    case 'ready':
      body = (
        <>
          <p className="m-0 text-sm text-success">
            模型已下載（{size}，存在這個瀏覽器）：{spec.name}
          </p>
          {readyExtra}
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 />}
            disabled={deleteDisabled}
            className="self-start text-danger"
            onClick={async () => {
              const ok = await confirm({
                title: '刪除已下載的模型？',
                description: `之後要使用時需要重新下載（${size}）。`,
                confirmLabel: '刪除',
                danger: true,
              });
              if (ok) await remove();
            }}
          >
            刪除已下載的模型
          </Button>
        </>
      );
      break;
    case 'error':
      body = (
        <>
          <Notice tone={state.kind === 'aborted' ? 'info' : 'danger'}>{state.message}</Notice>
          {about}
          <Button
            variant="primary"
            icon={state.kind === 'aborted' ? <Download /> : <RotateCcw />}
            onClick={() => void download()}
            className="self-start"
          >
            {state.kind === 'aborted' ? `下載模型（${size}）` : '重新下載'}
          </Button>
        </>
      );
      break;
  }
  return (
    <div
      className={cn('flex flex-col gap-2', className)}
      data-testid="model-panel"
      data-status={state.status}
    >
      {body}
    </div>
  );
}
