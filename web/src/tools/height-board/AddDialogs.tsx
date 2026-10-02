/**
 * 加入角色的對話框：單張（F03）與批次（F04）。
 * 身高欄用原生數字欄（1～1000、0.1 為單位），不合法時由瀏覽器顯示欄位提示、對話框不關閉。
 */
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Dialog, Field, TextInput } from '@/ui';
import { HEIGHT, nameFromFile } from './logic';
import { S } from './strings';

export interface AddEntry {
  file: File;
  /** 使用者填的名稱（可能是空白；空白時用檔名推得的名稱） */
  name: string;
  height: number;
}

/** 物件網址（換檔或關閉時釋放） */
function useObjectUrls(files: readonly File[]): string[] {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(
    () => () => {
      for (const u of urls) URL.revokeObjectURL(u);
    },
    [urls],
  );
  return urls;
}

/** 選字中（輸入法）的 Enter 不算 */
const isPlainEnter = (e: KeyboardEvent<HTMLInputElement>) =>
  e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229;

const heightInputProps = {
  type: 'number',
  inputMode: 'decimal',
  min: HEIGHT.min,
  max: HEIGHT.max,
  step: HEIGHT.step,
  autoComplete: 'off',
} as const;

/* ---------- 單張 ---------- */

export function SingleAddDialog({
  file,
  onConfirm,
  onCancel,
}: {
  file: File;
  onConfirm: (entry: AddEntry) => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const files = useMemo(() => [file], [file]);
  const [url] = useObjectUrls(files);
  const [name, setName] = useState(() => nameFromFile(file.name));
  const [height, setHeight] = useState('');
  const heightRef = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const h = Number(height);
    if (!Number.isFinite(h)) return;
    onConfirm({ file, name, height: h });
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      title={S.singleTitle}
      description={S.singleDescription}
      initialFocus={heightRef}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {S.skip}
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            {S.confirmAdd}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <div className="checker flex h-48 shrink-0 items-end justify-center overflow-hidden rounded-md border border-border sm:h-56 sm:w-40">
          <img
            src={url}
            alt={S.preview}
            className="block max-h-full max-w-full object-contain"
            data-testid="add-preview"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Field label={S.nameLabel}>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              name="name"
            />
          </Field>
          <Field label={S.heightLabel} hint={S.heightHint}>
            <div className="flex items-center gap-2">
              <TextInput
                ref={heightRef}
                {...heightInputProps}
                required
                name="height"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="w-32"
              />
              <span aria-hidden className="text-sm text-muted">
                cm
              </span>
            </div>
          </Field>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- 批次 ---------- */

interface Row {
  name: string;
  height: string;
}

export function BatchAddDialog({
  files,
  onConfirm,
  onCancel,
}: {
  files: readonly File[];
  onConfirm: (entries: AddEntry[]) => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const urls = useObjectUrls(files);
  const [rows, setRows] = useState<Row[]>(() =>
    files.map((f) => ({ name: nameFromFile(f.name), height: '' })),
  );
  const form = useRef<HTMLFormElement>(null);
  const nameRefs = useRef<(HTMLInputElement | null)[]>([]);
  const heightRefs = useRef<(HTMLInputElement | null)[]>([]);
  const firstHeight = useRef<HTMLInputElement | null>(null);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const entries: AddEntry[] = [];
    rows.forEach((r, i) => {
      if (r.height.trim() === '') return;
      const h = Number(r.height);
      if (Number.isFinite(h)) entries.push({ file: files[i], name: r.name, height: h });
    });
    onConfirm(entries);
  };

  const onNameKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (!isPlainEnter(e)) return;
    e.preventDefault();
    heightRefs.current[i]?.focus();
  };
  const onHeightKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (!isPlainEnter(e)) return;
    e.preventDefault();
    const next = heightRefs.current[i + 1];
    if (next) {
      next.focus();
      next.select();
    } else form.current?.requestSubmit();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      title={S.batchTitle(files.length)}
      description={S.batchDescription}
      size="lg"
      initialFocus={firstHeight}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {S.cancel}
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            {S.confirmAdd}
          </Button>
        </>
      }
    >
      <form ref={form} id={formId} onSubmit={submit}>
        <ol className="m-0 flex list-none flex-col gap-2 p-0" data-testid="batch-rows">
          {files.map((f, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: 列與檔案一一對應，順序不變
              key={i}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-1.5"
            >
              <div className="checker flex h-16 w-12 shrink-0 items-end justify-center overflow-hidden rounded-sm">
                <img src={urls[i]} alt="" className="block max-h-full max-w-full object-contain" />
              </div>
              <TextInput
                ref={(el) => {
                  nameRefs.current[i] = el;
                }}
                aria-label={S.rowName(i + 1)}
                title={f.name}
                value={rows[i].name}
                autoComplete="off"
                onChange={(e) => setRow(i, { name: e.target.value })}
                onKeyDown={(e) => onNameKey(i, e)}
                className="min-w-0 flex-1"
              />
              <div className="flex shrink-0 items-center gap-1.5">
                <TextInput
                  ref={(el) => {
                    heightRefs.current[i] = el;
                    if (i === 0) firstHeight.current = el;
                  }}
                  {...heightInputProps}
                  aria-label={S.rowHeight(i + 1)}
                  placeholder={S.heightPlaceholder}
                  value={rows[i].height}
                  onChange={(e) => setRow(i, { height: e.target.value })}
                  onKeyDown={(e) => onHeightKey(i, e)}
                  className="w-28"
                />
                <span aria-hidden className="text-sm text-muted">
                  cm
                </span>
              </div>
            </li>
          ))}
        </ol>
      </form>
    </Dialog>
  );
}
