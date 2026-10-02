/**
 * 圖片選擇面板（F080～F088）：所有選圖欄共用。篩選（名稱＋標籤名稱）、用途篩選、面板內匯入（只匯入一張時直接選用）、
 * 當場製作（單色圖、動態圖、合成圖）、加工欄位中的圖、清空、縮圖格（滑過動態圖從頭播放）。
 */
import { Brush, ImagePlus, Palette, Scissors, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pickFiles } from '@/core/files';
import { Button, cn, Dialog, TextInput } from '@/ui';
import { useImageUrl, useNotify } from './common';
import { importFiles, importMessage } from './importer';
import { filterForPicker, TAG_LABELS, tagsLabel } from './materials';
import type { Material, Tag } from './model';
import { openFade, openMaker, pendingPick } from './ops';
import { setSession, useProject, useSession } from './store';
import { S } from './strings';

function Tile({ m, selected, onPick }: { m: Material; selected: boolean; onPick: () => void }) {
  const url = useImageUrl(m.name);
  const [nonce, setNonce] = useState(0);
  return (
    <button
      type="button"
      title={m.label}
      data-picker-tile={m.name}
      aria-pressed={selected}
      onClick={onPick}
      onPointerEnter={() => {
        if (m.animated) setNonce((n) => n + 1);
      }}
      className={cn(
        'flex min-w-0 flex-col items-stretch gap-1 rounded-md border border-border bg-surface-2 p-1.5 text-left hover:bg-surface-3 focus-visible:focus-ring',
        selected && 'border-accent ring-2 ring-accent',
      )}
    >
      <span className="checker flex aspect-square items-center justify-center overflow-hidden rounded-sm">
        {url ? (
          <img
            key={nonce}
            src={url}
            alt=""
            className="size-full object-contain"
            draggable={false}
          />
        ) : null}
      </span>
      <span className="truncate text-xs text-fg">{m.label}</span>
      <span className="truncate text-[11px] text-muted">
        {tagsLabel(m)} {m.width ? `${m.width}×${m.height}` : ''}
      </span>
    </button>
  );
}

export function ImagePicker() {
  const target = useSession((s) => s.picker);
  const materials = useProject((s) => s.data.materials);
  const notify = useNotify();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Tag | null>(null);
  const [over, setOver] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (target) {
      setQuery('');
      setRole(target.role);
    }
  }, [target]);
  const list = useMemo(() => filterForPicker(materials, query, role), [materials, query, role]);
  if (!target) return null;

  const close = () => setSession({ picker: null });
  const choose = (name: string | null) => {
    target.apply(name);
    close();
  };
  const upload = async (files: File[]) => {
    if (!files.length) return;
    const r = await importFiles(files);
    const msg = importMessage(r);
    notify(msg.text, msg.ok ? 'success' : 'warning');
    if (r.names.length === 1) choose(r.names[0]);
  };
  /** 製作或加工：完成後放回這個欄位 */
  const make = (kind: 'solid' | 'fade' | 'maker' | 'edit') => {
    pendingPick.current = target;
    close();
    if (kind === 'solid') setSession({ modal: { kind: 'solid' } });
    else if (kind === 'fade') openFade({ kind: 'picker' }, target.current);
    else if (kind === 'maker') openMaker({ kind: 'picker' }, target.current ?? '');
    else if (target.current)
      setSession({ modal: { kind: 'edit', name: target.current, context: { kind: 'picker' } } });
  };
  const tile =
    'flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong bg-surface-2 p-2 text-center text-xs text-muted hover:bg-surface-3 hover:text-fg focus-visible:focus-ring';

  return (
    <Dialog
      open
      size="xl"
      title={S.pickerTitle}
      initialFocus={filterRef}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 整個面板都能放下圖片 */}
      <div
        className={cn(
          'flex flex-col gap-3',
          over && 'rounded-md outline-2 outline-dashed outline-accent',
        )}
        data-testid="image-picker"
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer.types).includes('Files')) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (!files.length) return;
          e.preventDefault();
          void upload(files);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            ref={filterRef}
            aria-label={S.pickerFilter}
            placeholder={S.pickerFilter}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Button
            variant="primary"
            icon={<ImagePlus />}
            onClick={async () => upload(await pickFiles({ accept: 'image/*', multiple: true }))}
          >
            {S.pickerUpload}
          </Button>
        </div>
        {target.role ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{S.pickerRoleNote}</span>
            <Button
              size="sm"
              variant={role ? 'secondary' : 'primary'}
              aria-pressed={!role}
              onClick={() => setRole(null)}
            >
              {S.pickerAll}
            </Button>
            <Button
              size="sm"
              variant={role ? 'primary' : 'secondary'}
              aria-pressed={!!role}
              onClick={() => setRole(target.role)}
            >
              {S.pickerRole(TAG_LABELS[target.role])}
            </Button>
          </div>
        ) : null}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
          <button type="button" className={tile} onClick={() => make('solid')}>
            <Palette className="size-5" aria-hidden />
            {S.makeSolid}
          </button>
          {target.current ? (
            <button type="button" className={tile} onClick={() => make('edit')}>
              <Scissors className="size-5" aria-hidden />
              {S.pickerEdit}
            </button>
          ) : null}
          <button type="button" className={tile} onClick={() => make('fade')}>
            <Sparkles className="size-5" aria-hidden />
            {S.makeFade}
          </button>
          <button type="button" className={tile} onClick={() => make('maker')}>
            <Brush className="size-5" aria-hidden />
            {S.makeMaker}
          </button>
          <button
            type="button"
            aria-pressed={!target.current}
            className={cn(
              tile,
              'border-solid',
              !target.current && 'border-accent ring-2 ring-accent text-fg',
            )}
            onClick={() => choose(null)}
          >
            <span className="text-lg">—</span>
            {target.empty || S.pickerNone}
          </button>
          {list.map((m) => (
            <Tile
              key={m.name}
              m={m}
              selected={m.name === target.current}
              onPick={() => choose(m.name)}
            />
          ))}
        </div>
        {!list.length && query ? <p className="m-0 text-sm text-muted">{S.pickerNoMatch}</p> : null}
        {!materials.length ? <p className="m-0 text-sm text-muted">{S.pickerEmpty}</p> : null}
      </div>
    </Dialog>
  );
}
