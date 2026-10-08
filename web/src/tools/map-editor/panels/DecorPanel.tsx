/**
 * 裝飾工具的面板（1.9）：分類、圖章的方塊（＋自訂）、大小、旋轉、翻轉、改色（SVG）、陰影。
 */
import { FlipHorizontal2, FlipVertical2, Plus, RotateCcw, X } from 'lucide-react';
import {
  Button,
  ColorField,
  cn,
  Field,
  FieldRow,
  IconButton,
  NumberInput,
  Segmented,
  useConfirm,
} from '@/ui';
import { DECOR_GENRES, DECORS, type DecorGenre } from '../decorCatalog';
import { decorUrl } from '../decors';
import { isSvgDecor } from '../engine/decor';
import type { UserDecor } from '../model';
import { setMapPrefs, useMapPrefs } from '../stores';
import { S } from '../strings';
import { DrawShadow } from './ToolPanels';
import { removeUserDecor, uploadDecors } from './uploads';

const tile =
  'relative flex w-full flex-col items-center gap-0.5 overflow-hidden rounded-md border p-1 text-[10px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-focus';

export function DecorPanel() {
  const mp = useMapPrefs();
  const confirm = useConfirm();
  const user = mp.userDecors;
  const genres = DECOR_GENRES.filter(
    (g) => g.id === 'all' || (g.id === 'user' ? user.length > 0 : true),
  );
  const genre: DecorGenre = genres.some((g) => g.id === mp.decorGenreId)
    ? (mp.decorGenreId as DecorGenre)
    : 'all';
  const builtins = DECORS.filter((d) => genre === 'all' || d.genres.includes(genre));
  const users = genre === 'all' || genre === 'user' ? user : [];
  const svg = isSvgDecor(mp.decorId);

  const pick = (id: string) => setMapPrefs({ decorId: id, decorFill: null, decorStroke: null });

  const add = async () => {
    const added = await uploadDecors();
    if (added.length) pick(added[0].id);
  };

  const remove = async (d: UserDecor) => {
    const ok = await confirm({
      title: S.decor.removeTitle,
      description: S.decor.removeConfirm(d.name),
      confirmLabel: S.list.delete,
      danger: true,
    });
    if (ok) removeUserDecor(d.id);
  };

  const addTile = (
    <button
      type="button"
      className={cn(
        tile,
        'aspect-square justify-center border-dashed border-border-strong text-muted hover:text-accent',
      )}
      onClick={() => void add()}
      aria-label={S.decor.add}
      title={S.decor.add}
      data-testid="decor-add"
    >
      <Plus aria-hidden className="size-5" />
    </button>
  );

  return (
    <div className="flex flex-col gap-3" data-testid="decor-panel">
      <p className="text-xs text-muted">{S.decor.hint}</p>
      <Segmented
        size="sm"
        value={genre}
        onValueChange={(g) => setMapPrefs({ decorGenreId: g })}
        options={genres.map((g) => ({ value: g.id, label: S.decor.genres[g.id] }))}
        aria-label={S.decor.title}
        className="flex-wrap"
      />
      <div
        className="grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto pr-1"
        data-testid="decor-grid"
      >
        {genre === 'all' ? addTile : null}
        {users.map((d) => {
          const active = mp.decorId === d.id;
          return (
            <div key={d.id} className="group relative">
              <button
                type="button"
                className={cn(
                  tile,
                  active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                )}
                onClick={() => pick(d.id)}
                aria-pressed={active}
                title={d.name}
                data-decor={d.id}
              >
                <img
                  src={d.dataUrl}
                  alt=""
                  className="aspect-square w-full object-contain"
                  draggable={false}
                />
                <span className="w-full truncate text-center">{d.name}</span>
              </button>
              <button
                type="button"
                className="absolute -top-1 -right-1 hidden size-5 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-1 hover:text-danger group-focus-within:flex group-hover:flex [@media(hover:none)]:flex"
                onClick={() => void remove(d)}
                aria-label={S.decor.remove(d.name)}
                title={S.decor.remove(d.name)}
              >
                <X aria-hidden className="size-3" />
              </button>
            </div>
          );
        })}
        {builtins.map((d) => {
          const active = mp.decorId === d.id;
          return (
            <button
              key={d.id}
              type="button"
              className={cn(
                tile,
                active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
              )}
              onClick={() => pick(d.id)}
              aria-pressed={active}
              title={d.name}
              data-decor={d.id}
            >
              <img
                src={decorUrl(d.id) ?? ''}
                alt=""
                className="aspect-square w-full rounded-sm bg-white object-contain p-0.5"
                draggable={false}
              />
              <span className="w-full truncate text-center">{d.name}</span>
            </button>
          );
        })}
        {genre === 'user' ? addTile : null}
      </div>
      <FieldRow columns={2}>
        <Field label={S.decor.size}>
          <NumberInput
            value={Math.round((mp.decorScale ?? 1) * 100)}
            onChange={(v) => setMapPrefs({ decorScale: v / 100 })}
            min={10}
            max={1000}
            step={10}
            unit="%"
          />
        </Field>
        <Field label={S.decor.rotation}>
          <NumberInput
            value={mp.decorRotation}
            onChange={(decorRotation) => setMapPrefs({ decorRotation })}
            min={-360}
            max={360}
            unit="°"
          />
        </Field>
      </FieldRow>
      <Field label={S.decor.flip}>
        <div className="flex gap-1">
          <IconButton
            size="sm"
            icon={<FlipHorizontal2 />}
            label={S.decor.flipX}
            pressed={mp.decorFlipX}
            onClick={() => setMapPrefs({ decorFlipX: !mp.decorFlipX })}
          />
          <IconButton
            size="sm"
            icon={<FlipVertical2 />}
            label={S.decor.flipY}
            pressed={mp.decorFlipY}
            onClick={() => setMapPrefs({ decorFlipY: !mp.decorFlipY })}
          />
        </div>
      </Field>
      {svg ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{S.decor.recolor}</span>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw />}
              disabled={!mp.decorFill && !mp.decorStroke}
              onClick={() => setMapPrefs({ decorFill: null, decorStroke: null })}
            >
              {S.decor.resetColor}
            </Button>
          </div>
          <Field label={S.decor.fill} hint={mp.decorFill ? undefined : S.decor.original}>
            <ColorField
              value={mp.decorFill ?? '#505050ff'}
              onChange={(decorFill) => setMapPrefs({ decorFill })}
              alpha
            />
          </Field>
          <Field label={S.decor.stroke} hint={mp.decorStroke ? undefined : S.decor.original}>
            <ColorField
              value={mp.decorStroke ?? '#00000000'}
              onChange={(decorStroke) => setMapPrefs({ decorStroke })}
              alpha
            />
          </Field>
        </div>
      ) : null}
      <DrawShadow cat="decor" />
    </div>
  );
}
