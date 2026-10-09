/**
 * 存檔槽視窗：建立新的存檔槽（名稱＝版型名稱、20% 的預覽圖、時間）、清單（只列目前版型的、新的在前）、
 * 改名（最多 40 字，空白時用預設名稱）、覆蓋（確認）、讀取（確認）、刪除（確認、無法復原）。
 */
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { canvasToBlob } from '@/core/image';
import type { ToolStore } from '@/core/storage';
import { Button, Dialog, Notice, TextInput, useConfirm, useToast } from '@/ui';
import {
  type Draft,
  DraftError,
  draftAssets,
  newId,
  type TemplateDef,
  validateDraft,
} from './model';
import { renderOutput } from './render';
import {
  deleteSlot,
  getSlot,
  listSlots,
  putSlot,
  SLOT_NAME_MAX,
  type SlotRecord,
  slotName,
} from './slots';
import { assets, useUi } from './store';
import { S } from './strings';

const PREVIEW_SCALE = 0.2;

function SlotPreview({ blob }: { blob: Blob | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <div className="checker flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border">
      {url ? (
        <img src={url} alt={S.slotPreviewAlt} className="max-h-full max-w-full object-contain" />
      ) : null}
    </div>
  );
}

const time = (ms: number) =>
  new Date(ms).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/**
 * 一列存檔槽。名稱欄由這一列管理：離開欄位（或按 Enter）時整理成實際的名稱（空白→「存檔槽」）並改名；
 * 「覆蓋」帶著欄位裡的名稱（改名後直接按覆蓋也保留新名稱）。
 * 存檔槽的名稱變了（例如上一次改名寫完、清單重讀）時欄位跟著換，但正在輸入時不換（不蓋掉打到一半的字）。
 */
export function SlotRow({
  r,
  onRename,
  onOverwrite,
  onLoad,
  onRemove,
}: {
  r: SlotRecord;
  onRename: (name: string) => void;
  onOverwrite: (name: string) => void;
  onLoad: () => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(r.name);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setName(r.name);
  }, [r.name]);
  const settle = () => {
    const next = slotName(name, S.slotDefaultName);
    setName(next);
    return next;
  };
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-2 p-2">
      <SlotPreview blob={r.preview} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <TextInput
          aria-label={S.slotName}
          value={name}
          maxLength={SLOT_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => {
            editing.current = true;
          }}
          onBlur={() => {
            editing.current = false;
            onRename(settle());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <time className="text-xs text-muted" dateTime={new Date(r.savedAt).toISOString()}>
          {time(r.savedAt)}
        </time>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => onOverwrite(settle())}>
          {S.slotOverwrite}
        </Button>
        <Button size="sm" variant="primary" onClick={onLoad}>
          {S.slotLoad}
        </Button>
        <Button size="sm" variant="danger" onClick={onRemove}>
          {S.slotDelete}
        </Button>
      </div>
    </li>
  );
}

export function SlotsDialog({
  open,
  onOpenChange,
  def,
  store,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  def: TemplateDef;
  store: ToolStore<Draft>;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<SlotRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRows(await listSlots(def.id));
      setError(null);
    } catch {
      setRows([]);
      setError(S.slotFailed);
    }
  }, [def.id]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const snapshot = async (): Promise<{ data: Draft; preview: Blob | null }> => {
    const data = structuredClone(store.getState().data);
    let preview: Blob | null = null;
    try {
      preview = await canvasToBlob(await renderOutput(def, data, PREVIEW_SCALE), 'image/png');
    } catch {
      preview = null;
    }
    return { data, preview };
  };

  const create = async () => {
    setBusy(true);
    try {
      const snap = await snapshot();
      await putSlot({
        id: newId('slot'),
        templateId: def.id,
        name: def.name,
        ...snap,
        savedAt: Date.now(),
      });
      toast({ title: S.slotCreated, tone: 'success' });
      await refresh();
    } catch {
      setError(S.slotFailed);
    } finally {
      setBusy(false);
    }
  };

  /** 改名、覆蓋依序寫入（覆蓋等改名寫完，並以存檔槽目前的內容為準） */
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const queue = (job: () => Promise<void>): Promise<void> => {
    const next = writes.current.then(job);
    writes.current = next.catch(() => undefined);
    return next;
  };

  const overwrite = async (r: SlotRecord, name: string) => {
    if (
      !(await confirm({
        title: S.slotOverwriteTitle,
        description: S.slotOverwriteDesc,
        confirmLabel: S.slotOverwrite,
      }))
    )
      return;
    try {
      const snap = await snapshot();
      await queue(async () => {
        const cur = (await getSlot(r.id)) ?? r;
        await putSlot({ ...cur, ...snap, name, savedAt: Date.now() });
      });
      toast({ title: S.slotOverwritten, tone: 'success' });
    } catch {
      setError(S.slotFailed);
    }
    await refresh();
  };

  const load = async (r: SlotRecord) => {
    if (
      !(await confirm({
        title: S.slotLoadTitle,
        description: S.slotLoadDesc,
        confirmLabel: S.slotLoad,
      }))
    )
      return;
    try {
      const next = validateDraft(def, r.data);
      for (const id of draftAssets(next)) {
        const bmp = await assets.bitmap(id).catch(() => undefined);
        if (!bmp) throw new DraftError(S.imageUnreadable);
      }
      store.getState().replace(next);
      useUi.getState().setSticker(null);
      toast({ title: S.slotLoaded, tone: 'success' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: `${S.slotBroken}${e instanceof Error ? e.message : ''}`, tone: 'danger' });
    }
  };

  const remove = async (r: SlotRecord) => {
    if (
      !(await confirm({
        title: S.slotDeleteTitle,
        description: S.slotDeleteDesc,
        confirmLabel: S.slotDelete,
        danger: true,
      }))
    )
      return;
    await deleteSlot(r.id);
    toast({ title: S.slotDeleted });
    await refresh();
  };

  const rename = async (r: SlotRecord, name: string) => {
    if (name === r.name) return;
    try {
      await queue(async () => {
        const cur = (await getSlot(r.id)) ?? r;
        if (cur.name !== name) await putSlot({ ...cur, name });
      });
    } catch {
      setError(S.slotFailed);
    }
    await refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.slotsTitle}
      description={S.slotsNote}
      size="lg"
    >
      <div className="flex flex-col gap-3">
        <div>
          <Button variant="primary" icon={<Plus />} onClick={create} loading={busy}>
            {S.slotNew}
          </Button>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {rows && !rows.length && !error ? (
          <p className="m-0 text-sm text-muted">{S.slotEmpty}</p>
        ) : null}
        <ul
          className="m-0 flex list-none flex-col gap-2 p-0"
          aria-label={S.slotsTitle}
          data-testid="slot-list"
        >
          {(rows ?? []).map((r) => (
            <SlotRow
              key={r.id}
              r={r}
              onRename={(name) => void rename(r, name)}
              onOverwrite={(name) => void overwrite(r, name)}
              onLoad={() => void load(r)}
              onRemove={() => void remove(r)}
            />
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
