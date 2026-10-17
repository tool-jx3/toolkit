/**
 * 設定欄共用的小元件（這個工具專用）：文字欄（離開才記一步、截到上限）、開關、圖片按鈕（選檔、圖片網址、拿掉）、
 * 清單列（貼文 1、貼文 2…＋新增、往前、往後、複製、刪除）、圖片網址對話框、調整範圍對話框。
 */
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Crop,
  ImagePlus,
  Link2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { create } from 'zustand';
import { pickFiles } from '@/core/files';
import type { FramePlacement } from '@/core/image';
import {
  Button,
  Chips,
  Dialog,
  Field,
  ImageFrameDialog,
  Notice,
  TextArea,
  TextInput,
  Toggle,
  useConfirm,
  useToast,
} from '@/ui';
import {
  addImageFiles,
  addImageUrls,
  type BatchNotice,
  type ImageTarget,
  isMultiTarget,
  type UrlFailure,
} from './media';
import { ZOOM_MAX } from './model';
import { gesture } from './store';
import { S } from './strings';
import { parseImageUrls } from './url';

export const clip = (v: string, max: number): string => Array.from(v).slice(0, max).join('');

/* ---------- 通知 ---------- */

export function useNotify() {
  const toast = useToast();
  return (n: BatchNotice | null) => {
    if (n) toast({ title: n.title, description: n.description, tone: n.tone });
  };
}

/* ---------- 文字欄與開關 ---------- */

export function TextField({
  label,
  value,
  max,
  onChange,
  hint,
  placeholder,
  rows,
  ariaLabel,
  testId,
}: {
  label: string;
  value: string;
  max: number;
  onChange: (v: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  /** 給了就是多行 */
  rows?: number;
  ariaLabel?: string;
  testId?: string;
}) {
  const common = {
    value,
    placeholder,
    'aria-label': ariaLabel,
    'data-testid': testId,
    onFocus: gesture.begin,
    onBlur: gesture.commit,
  };
  return (
    <Field label={label} hint={hint}>
      {rows ? (
        <TextArea {...common} rows={rows} onChange={(e) => onChange(clip(e.target.value, max))} />
      ) : (
        <TextInput {...common} onChange={(e) => onChange(clip(e.target.value, max))} />
      )}
    </Field>
  );
}

export function Check({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} layout="inline" hint={hint}>
      <Toggle checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}

/* ---------- 圖片網址對話框 ---------- */

export const useUrlDialog = create<{ target: ImageTarget | null; label: string }>(() => ({
  target: null,
  label: '',
}));
export const openUrlDialog = (target: ImageTarget, label = ''): void =>
  useUrlDialog.setState({ target, label });

export function UrlDialogHost() {
  const { target, label } = useUrlDialog();
  const notify = useNotify();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<UrlFailure[]>([]);
  const [busy, setBusy] = useState(false);
  const multi = target ? isMultiTarget(target) : false;
  useEffect(() => {
    if (target) {
      setText('');
      setError(null);
      setFailed([]);
      setBusy(false);
    }
  }, [target]);
  const close = () => useUrlDialog.setState({ target: null });
  const apply = async () => {
    if (!target) return;
    const { urls, bad } = parseImageUrls(text, multi);
    if (!urls.length && !bad.length) {
      setError(S.urlEmpty);
      return;
    }
    if (bad.length) {
      setError(S.urlBad);
      return;
    }
    setError(null);
    setBusy(true);
    const r = await addImageUrls(urls, target);
    setBusy(false);
    notify(r.notice);
    if (r.failed.length) {
      setFailed(r.failed);
      setText(r.failed.map((f) => f.url).join('\n'));
      return;
    }
    close();
  };
  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o && !busy) close();
      }}
      title={multi ? S.urlDialogTitleMulti : S.urlDialogTitle}
      description={label || undefined}
      footer={
        <Button
          variant="primary"
          loading={busy}
          onClick={() => void apply()}
          data-testid="url-apply"
        >
          {busy ? S.urlLoading : S.urlApply}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={S.urlLabel} hint={S.urlHint} error={error ?? undefined}>
          <TextArea
            value={text}
            rows={multi ? 4 : 2}
            spellCheck={false}
            autoComplete="off"
            placeholder={multi ? S.urlPlaceholderMulti : S.urlPlaceholder}
            onChange={(e) => setText(e.target.value)}
            data-testid="url-input"
            className="font-mono text-xs"
          />
        </Field>
        {failed.length ? (
          <Notice tone="danger">
            <div data-testid="url-failed">
              <p className="m-0">{S.urlFailed(failed.length, failed.length)}</p>
              <ul className="m-0 mt-1 flex list-disc flex-col gap-1 pl-4">
                {failed.map((f) => (
                  <li key={f.url} className="break-all">
                    <span className="font-mono text-xs">{f.url}</span>
                    <br />
                    {S.urlReason[f.kind]}
                  </li>
                ))}
              </ul>
            </div>
          </Notice>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ---------- 圖片按鈕 ---------- */

export function ImageButtons({
  target,
  hasImage,
  onRemove,
  pickLabel = S.avatarPick,
  label,
  extra,
}: {
  target: ImageTarget;
  hasImage?: boolean;
  onRemove?: () => void;
  pickLabel?: string;
  /** 對話框與按鈕的名稱（螢幕閱讀器） */
  label?: string;
  extra?: ReactNode;
}) {
  const notify = useNotify();
  const multi = isMultiTarget(target);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        icon={<ImagePlus />}
        aria-label={label ? `${label}：${pickLabel}` : undefined}
        onClick={() =>
          void pickFiles({ accept: 'image/*', multiple: multi }).then((files) =>
            addImageFiles(files, target).then(notify),
          )
        }
      >
        {pickLabel}
      </Button>
      <Button
        size="sm"
        icon={<Link2 />}
        aria-label={label ? `${label}：${S.avatarUrl}` : undefined}
        onClick={() => openUrlDialog(target, label)}
      >
        {S.avatarUrl}
      </Button>
      {onRemove ? (
        <Button
          size="sm"
          variant="ghost"
          icon={<X />}
          disabled={!hasImage}
          aria-label={label ? `${label}：${S.avatarRemove}` : undefined}
          onClick={onRemove}
        >
          {S.avatarRemove}
        </Button>
      ) : null}
      {extra}
    </div>
  );
}

/* ---------- 清單列 ---------- */

export function ListBar({
  ids,
  currentId,
  chip,
  ariaLabel,
  onPick,
  onAdd,
  addLabel,
  full,
  onMove,
  onDuplicate,
  onRemove,
  confirmRemove,
}: {
  ids: readonly string[];
  currentId: string;
  chip: (n: number) => string;
  ariaLabel: string;
  onPick: (id: string) => void;
  onAdd: () => void;
  addLabel: string;
  full: string | null;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  confirmRemove: { title: string; description: string; confirmLabel: string };
}) {
  const confirm = useConfirm();
  const i = Math.max(0, ids.indexOf(currentId));
  const n = ids.length;
  return (
    <div className="flex flex-col gap-2">
      <Chips
        aria-label={ariaLabel}
        items={ids.map((id, k) => ({ value: id, label: chip(k + 1) }))}
        value={ids[i]}
        onPick={onPick}
      />
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon={<Plus />} disabled={!!full} onClick={onAdd}>
          {addLabel}
        </Button>
        <Button size="sm" icon={<ArrowLeft />} disabled={i === 0} onClick={() => onMove(-1)}>
          {S.movePrev}
        </Button>
        <Button size="sm" icon={<ArrowRight />} disabled={i >= n - 1} onClick={() => onMove(1)}>
          {S.moveNext}
        </Button>
        <Button size="sm" icon={<Copy />} disabled={!!full} onClick={onDuplicate}>
          {S.duplicate}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 />}
          disabled={n <= 1}
          onClick={() =>
            void confirm({ ...confirmRemove, danger: true }).then((ok) => {
              if (ok) onRemove();
            })
          }
        >
          {S.remove}
        </Button>
      </div>
      {full ? <p className="m-0 text-xs text-muted">{full}</p> : null}
    </div>
  );
}

/* ---------- 調整範圍 ---------- */

export interface FrameRequest {
  image: CanvasImageSource;
  aspect: number;
  initial: FramePlacement;
  title: string;
  onApply: (p: FramePlacement) => void;
}

export const useFrameDialog = create<{ req: FrameRequest | null }>(() => ({ req: null }));
export const openFrame = (req: FrameRequest): void => useFrameDialog.setState({ req });

export function FrameDialogHost() {
  const req = useFrameDialog((s) => s.req);
  return (
    <ImageFrameDialog
      open={!!req}
      onOpenChange={(o) => {
        if (!o) useFrameDialog.setState({ req: null });
      }}
      image={req?.image ?? null}
      aspect={req?.aspect ?? 1}
      cover={{ maxZoom: ZOOM_MAX }}
      initialPlacement={req?.initial ?? null}
      title={req?.title ?? S.frameTitle}
      note={S.frameNote}
      onApply={(p) => req?.onApply(p)}
    />
  );
}

/** 「調整範圍」「回到預設」兩個按鈕 */
export function PlaceButtons({
  onAdjust,
  onReset,
  disabled,
  adjustLabel = S.adjustRange,
}: {
  onAdjust: () => void;
  onReset: () => void;
  disabled?: boolean;
  adjustLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" icon={<Crop />} disabled={disabled} onClick={onAdjust}>
        {adjustLabel}
      </Button>
      <Button size="sm" variant="ghost" icon={<RotateCcw />} disabled={disabled} onClick={onReset}>
        {S.resetPlace}
      </Button>
    </div>
  );
}

/** 每個分頁最下面的「重設」按鈕（先確認、可以復原） */
export function ResetButton({
  label,
  confirmText,
  onReset,
}: {
  label: string;
  confirmText: { title: string; description: string; confirmLabel: string };
  onReset: () => void;
}) {
  const confirm = useConfirm();
  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        icon={<RotateCcw />}
        onClick={() =>
          void confirm({ ...confirmText, danger: true }).then((ok) => {
            if (ok) onReset();
          })
        }
      >
        {label}
      </Button>
    </div>
  );
}
