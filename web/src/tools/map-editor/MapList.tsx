/**
 * 地圖一覽（規格 1.1）：卡片（縮圖、網格種類、名稱、更新時間）、新增、複製、重新命名、匯出 JSON、刪除、讀取 JSON、
 * 舊版存檔的搬移（F011）。
 */
import { Copy, Download, FileJson, Map as MapIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadText, pickFiles, readAsText } from '@/core/files';
import type { MapGridType } from '@/core/grid';
import {
  Button,
  Dialog,
  Field,
  IconButton,
  Notice,
  TextInput,
  UsageSection,
  useConfirm,
  useToast,
  WindowDrop,
} from '@/ui';
import { formatMapDate, type MapMeta, mapJsonFileName } from './model';
import { NewMapDialog, todayLabel } from './NewMapDialog';
import {
  createMap,
  deleteMap,
  duplicateMap,
  ensureLegacyMigrated,
  getMapData,
  getMeta,
  importMapJson,
  isMemoryOnly,
  listMaps,
  MapFileError,
  putMeta,
} from './storage';
import { S } from './strings';
import { Usage } from './Usage';

/** 搬移的提示只顯示一次 */
let migrationShown = false;

export interface MapListProps {
  onOpen: (id: string) => void;
  /** 開頁時要顯示的訊息（例如網址的 id 找不到） */
  flash?: string | null;
  onFlashShown?: () => void;
}

export function MapList({ onOpen, flash, onFlashShown }: MapListProps) {
  const [maps, setMaps] = useState<MapMeta[] | null>(null);
  const [migrated, setMigrated] = useState(0);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<MapMeta | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const autoOpened = useRef(false);

  const refresh = useCallback(async () => {
    const list = await listMaps();
    setMaps(list);
    return list;
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const count = await ensureLegacyMigrated();
      if (!live) return;
      if (count > 0 && !migrationShown) {
        migrationShown = true;
        setMigrated(count);
      }
      const list = await refresh();
      if (!live) return;
      if (!list.length && !autoOpened.current) {
        autoOpened.current = true;
        setCreating(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [refresh]);

  /* 從編輯畫面回來：分頁標題回到工具名稱 */
  useEffect(() => {
    document.title = `${S.toolName}｜TRPG Toolkit`;
  }, []);

  useEffect(() => {
    if (!flash) return;
    toast({ title: flash, tone: 'warning' });
    onFlashShown?.();
  }, [flash, onFlashShown, toast]);

  const create = async (name: string, gridType: MapGridType) => {
    const meta = await createMap(name, gridType);
    setCreating(false);
    onOpen(meta.id);
  };

  const duplicate = async (m: MapMeta) => {
    await duplicateMap(m.id, S.list.copyName(m.name));
    await refresh();
  };

  const remove = async (m: MapMeta) => {
    const ok = await confirm({
      title: S.list.deleteTitle,
      description: S.list.deleteConfirm(m.name),
      confirmLabel: S.list.delete,
      danger: true,
    });
    if (!ok) return;
    await deleteMap(m.id);
    await refresh();
  };

  const exportJson = async (m: MapMeta) => {
    const raw = await getMapData(m.id);
    if (!raw) return;
    downloadText(JSON.stringify(raw), mapJsonFileName(m.name), 'application/json');
  };

  const importFiles = async (files: File[]) => {
    for (const f of files) {
      try {
        const meta = await importMapJson(
          await readAsText(f),
          f.name,
          S.list.importName(todayLabel()),
        );
        toast({ title: S.list.imported(meta.name), tone: 'success' });
      } catch (e) {
        if (e instanceof MapFileError) toast({ title: S.list.invalidFile, tone: 'danger' });
        else
          toast({
            title: S.list.importError(e instanceof Error ? e.message : String(e)),
            tone: 'danger',
          });
      }
    }
    await refresh();
  };

  const pickJson = async () => {
    const files = await pickFiles({ accept: '.json,application/json', multiple: true });
    if (files.length) await importFiles(files);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="map-list">
      <WindowDrop
        accept=".json,application/json"
        onDrop={(files) => void importFiles(files)}
        onReject={() => toast({ title: S.list.invalidFile, tone: 'danger' })}
        label={S.list.importJson}
      />
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">{S.list.title}</h2>
        <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
          {S.list.newMap}
        </Button>
        <Button icon={<FileJson />} onClick={() => void pickJson()}>
          {S.list.importJson}
        </Button>
      </div>
      {migrated > 0 ? (
        <Notice
          tone="success"
          action={
            <Button size="sm" variant="ghost" onClick={() => setMigrated(0)}>
              關閉
            </Button>
          }
        >
          {S.list.migrated(migrated)}
        </Notice>
      ) : null}
      {isMemoryOnly() ? <Notice tone="warning">{S.list.memoryOnly}</Notice> : null}
      {maps === null ? (
        <p className="text-sm text-muted">{S.list.loading}</p>
      ) : maps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          {S.list.empty}
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3 p-0">
          {maps.map((m) => (
            <li
              key={m.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface"
              data-testid="map-card"
              data-map-id={m.id}
            >
              <button
                type="button"
                className="checker block aspect-[8/5] w-full overflow-hidden border-b border-border bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-focus"
                onClick={() => onOpen(m.id)}
                aria-label={S.list.open(m.name)}
              >
                {m.thumbnail ? (
                  <img
                    src={m.thumbnail}
                    alt=""
                    className="size-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted">
                    <MapIcon aria-hidden className="size-8 opacity-40" />
                    <span className="sr-only">{S.list.noThumb}</span>
                  </span>
                )}
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                <span className="w-fit rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs text-muted">
                  {S.gridTypes[m.gridType] ?? m.gridType}
                </span>
                <button
                  type="button"
                  className="min-w-0 truncate text-left font-medium text-fg hover:text-accent hover:underline"
                  onClick={() => onOpen(m.id)}
                  data-testid="map-card-name"
                >
                  {m.name}
                </button>
                <span className="text-xs text-muted">
                  {S.list.updated(formatMapDate(m.updatedAt))}
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={<Copy />}
                    label={S.list.duplicate}
                    onClick={() => void duplicate(m)}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={<Pencil />}
                    label={S.list.rename}
                    onClick={() => setRenaming(m)}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={<Download />}
                    label={S.list.exportJson}
                    onClick={() => void exportJson(m)}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 />}
                    label={S.list.delete}
                    onClick={() => void remove(m)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <UsageSection persistKey="map-editor">
        <Usage />
      </UsageSection>
      <NewMapDialog open={creating} onOpenChange={setCreating} onCreate={create} />
      <RenameDialog
        target={renaming}
        onClose={() => setRenaming(null)}
        onRename={async (m, name) => {
          const cur = await getMeta(m.id);
          if (cur) await putMeta({ ...cur, name, updatedAt: new Date().toISOString() });
          setRenaming(null);
          await refresh();
        }}
      />
    </div>
  );
}

/** 重新命名（F006；編輯列的地圖名稱也用這個） */
export function RenameDialog({
  target,
  onClose,
  onRename,
}: {
  target: { name: string } | null;
  onClose: () => void;
  onRename: (target: MapMeta, name: string) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (target) setName(target.name);
  }, [target]);
  const submit = () => {
    const v = name.trim().slice(0, 60);
    if (!target) return;
    if (!v || v === target.name) {
      onClose();
      return;
    }
    void onRename(target as MapMeta, v);
  };
  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={S.list.renameTitle}
      initialFocus={ref}
      size="sm"
      footer={
        <Button variant="primary" onClick={submit}>
          確定
        </Button>
      }
    >
      <Field label={S.list.nameLabel}>
        <TextInput
          ref={ref}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          data-testid="rename-input"
        />
      </Field>
    </Dialog>
  );
}
