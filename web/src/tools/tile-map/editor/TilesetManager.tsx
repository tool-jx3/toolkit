/**
 * 管理圖塊組（對話框）：左邊是自訂與內建的圖塊組清單、新增自訂圖塊組；右邊是選中的那一組：
 * 改名、匯入圖塊、每一次匯入（可以刪掉）、刪除整組；內建的可以收起來（不列在調色盤）。下面是圖庫的備份與讀入。
 */
import { Archive, ArchiveRestore, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pickFiles } from '@/core/files';
import { Button, cn, Dialog, DialogClose, Field, IconButton, TextInput, Toggle } from '@/ui';
import { MAX_SETS } from '../model/library';
import type { TileDef } from '../model/types';
import { drawThumb } from '../render/draw';
import { S } from '../strings';
import { BUILTIN_SETS } from '../tiles/builtin';
import {
  backupLibrary,
  freshSetName,
  newSet,
  removeImport,
  removeSet,
  renameSetTo,
  restoreLibrary,
  showBuiltin,
} from './libraryActions';
import { setEditor, useEditor, useLibrary } from './store';
import { imageFor, setName, useImages } from './tiles';

function Thumb({ def }: { def: TileDef | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useImages((s) => s.version);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 圖片讀好（version）時重畫
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    c.width = 64;
    c.height = 64;
    ctx.clearRect(0, 0, 64, 64);
    const img = def && imageFor(def.src);
    if (def && img) drawThumb(ctx, def, img, 64);
  }, [def, version]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="checker size-10 shrink-0 rounded-sm border border-border"
    />
  );
}

export function TilesetManager() {
  const open = useEditor((s) => s.dialog === 'sets');
  const managed = useEditor((s) => s.managed);
  const lib = useLibrary((s) => s.lib);
  const [newName, setNewName] = useState(S.sets.newName);
  const [rename, setRename] = useState('');
  const custom = lib.sets;
  const selected = managed ?? custom[0]?.id ?? BUILTIN_SETS[0].id;
  const set = custom.find((s) => s.id === selected);
  const builtin = BUILTIN_SETS.find((s) => s.id === selected);
  const currentName = setName(selected);

  useEffect(() => {
    if (open) setNewName(freshSetName());
  }, [open]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 換了圖塊組才帶入名字
  useEffect(() => setRename(currentName), [selected, open]);

  const choose = (id: string) => setEditor({ managed: id });
  const listBtn = (id: string, label: string, n: number) => (
    <button
      key={id}
      type="button"
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm focus-visible:focus-ring hover:bg-surface-3',
        id === selected && 'bg-accent-soft text-fg',
      )}
      aria-pressed={id === selected}
      onClick={() => choose(id)}
      data-set={id}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 text-xs text-muted tabular-nums">{n}</span>
    </button>
  );
  const firstOf = useMemo(() => (set ? set.imports.map((i) => i.tiles[0]) : []), [set]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && setEditor({ dialog: null })}
      title={S.sets.title}
      size="lg"
      footer={<DialogClose />}
    >
      <div className="grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]" data-testid="set-manager">
        <div className="flex min-w-0 flex-col gap-2">
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const id = newSet(newName.trim() || freshSetName());
              if (id) {
                choose(id);
                setNewName(freshSetName());
              }
            }}
          >
            <TextInput
              aria-label={S.sets.newTitle}
              value={newName}
              maxLength={100}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 min-w-0 flex-1 text-sm"
              data-testid="new-set-name"
            />
            <Button
              type="submit"
              size="sm"
              icon={<Plus />}
              disabled={custom.length >= MAX_SETS}
              data-testid="new-set"
            >
              {S.sets.newSet}
            </Button>
          </form>
          <h3 className="m-0 mt-1 text-xs font-semibold text-muted">
            {S.sets.custom}（{custom.length}／{MAX_SETS}）
          </h3>
          <div className="flex flex-col gap-0.5">
            {custom.map((s) =>
              listBtn(
                s.id,
                s.name,
                s.imports.reduce((n, i) => n + i.tiles.length, 0),
              ),
            )}
          </div>
          <h3 className="m-0 mt-1 text-xs font-semibold text-muted">{S.sets.builtin}</h3>
          <div className="flex flex-col gap-0.5">
            {BUILTIN_SETS.map((s) => listBtn(s.id, lib.names[s.id] ?? s.name, s.tiles.length))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3" data-testid="set-detail">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (rename.trim() && rename.trim() !== currentName) renameSetTo(selected, rename);
            }}
          >
            <Field label={S.sets.renameTitle}>
              <TextInput
                value={rename}
                maxLength={100}
                onChange={(e) => setRename(e.target.value)}
                data-testid="set-rename-input"
              />
            </Field>
            <Button
              type="submit"
              size="md"
              variant="secondary"
              disabled={!rename.trim() || rename.trim() === currentName}
            >
              {S.sets.rename}
            </Button>
          </form>
          {set ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  icon={<Upload />}
                  onClick={() => setEditor({ dialog: 'import', managed: set.id, importFiles: [] })}
                  data-testid="open-import"
                >
                  {S.sets.import}
                </Button>
                <Button
                  variant="danger"
                  icon={<Trash2 />}
                  onClick={() => void removeSet(set.id)}
                  data-testid="delete-set"
                >
                  {S.sets.deleteSet}
                </Button>
              </div>
              <h3 className="m-0 text-sm font-semibold">{S.sets.imports}</h3>
              {set.imports.length ? (
                <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="import-list">
                  {set.imports.map((imp, i) => (
                    <li
                      key={imp.id}
                      className="flex items-center gap-2 rounded-md border border-border p-1.5"
                    >
                      <Thumb def={firstOf[i]} />
                      <span className="min-w-0 flex-1 truncate text-sm">{imp.name}</span>
                      <span className="text-xs text-muted tabular-nums">
                        {S.sets.count(imp.tiles.length)}
                      </span>
                      <IconButton
                        label={S.sets.removeImport(imp.name)}
                        icon={<Trash2 />}
                        size="sm"
                        variant="ghost"
                        onClick={() => void removeImport(set.id, imp.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-sm text-muted">{S.sets.noImports}</p>
              )}
            </>
          ) : builtin ? (
            <>
              <p className="m-0 text-sm">{S.sets.builtinNote[builtin.id]}</p>
              <p className="m-0 text-sm text-muted">{S.sets.count(builtin.tiles.length)}</p>
              {builtin.id.startsWith('kenney') ? (
                <p className="m-0 text-xs text-muted">{S.sets.kenney}</p>
              ) : null}
              <Toggle
                label={S.sets.show}
                checked={!lib.hidden.includes(builtin.id)}
                onCheckedChange={(v) => showBuiltin(builtin.id, v)}
              />
            </>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
        <h3 className="m-0 text-sm font-semibold">{S.sets.library}</h3>
        <p className="m-0 text-xs text-muted">{S.sets.libraryNote}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Archive />}
            onClick={() => void backupLibrary()}
            data-testid="backup-library"
          >
            {S.sets.backup}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<ArchiveRestore />}
            onClick={async () => {
              const [f] = await pickFiles({ accept: '.zip,application/zip' });
              if (f) await restoreLibrary(f);
            }}
            data-testid="restore-library"
          >
            {S.sets.restore}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
