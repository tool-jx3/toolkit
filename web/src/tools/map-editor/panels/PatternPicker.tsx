/**
 * 圖樣選擇（F110、F113）：分類（全部／自訂）、單色方塊＋色彩欄、自訂圖樣的方塊（× 刪除）、「＋」新增。
 */
import { Plus, X } from 'lucide-react';
import { ColorField, cn, Field, Segmented, useConfirm } from '@/ui';
import type { PatternState, UserPattern } from '../model';
import { useMapPrefs } from '../stores';
import { S } from '../strings';
import { removeUserPattern, uploadPatterns } from './uploads';

export interface PatternPickerProps {
  value: PatternState;
  onChange: (next: PatternState) => void;
  /** 標題（例「地面的圖樣」） */
  label: string;
  testId?: string;
}

const tile =
  'relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border text-xs outline-none focus-visible:ring-2 focus-visible:ring-focus';

export function PatternPicker({ value, onChange, label, testId }: PatternPickerProps) {
  const patterns = useMapPrefs((s) => s.userPatterns);
  const confirm = useConfirm();
  const genres = patterns.length ? (['all', 'user'] as const) : (['all'] as const);
  const genre = genres.includes(value.genreId as 'all') ? (value.genreId as 'all' | 'user') : 'all';
  const solidActive = value.mode === 'solid' || !patterns.some((p) => p.id === value.id);

  const add = async () => {
    const added = await uploadPatterns();
    if (added?.length) onChange({ ...value, mode: 'pattern', id: added[0].id });
  };

  const remove = async (p: UserPattern) => {
    const ok = await confirm({
      title: S.pattern.removeTitle,
      description: S.pattern.removeConfirm(p.name),
      confirmLabel: S.list.delete,
      danger: true,
    });
    if (ok) removeUserPattern(p.id);
  };

  const addTile = (
    <button
      type="button"
      className={cn(tile, 'border-dashed border-border-strong text-muted hover:text-accent')}
      onClick={() => void add()}
      aria-label={S.pattern.add}
      title={S.pattern.add}
      data-testid="pattern-add"
    >
      <Plus aria-hidden className="size-5" />
    </button>
  );

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <span className="text-sm font-medium">{label}</span>
      {genres.length > 1 ? (
        <Segmented
          size="sm"
          value={genre}
          onValueChange={(g) => onChange({ ...value, genreId: g })}
          options={genres.map((g) => ({ value: g, label: S.pattern.genres[g] }))}
          aria-label={label}
        />
      ) : null}
      <div className="grid grid-cols-5 gap-1.5">
        {genre === 'all' ? (
          <button
            type="button"
            className={cn(tile, solidActive ? 'border-accent ring-2 ring-accent' : 'border-border')}
            style={{ background: value.solidColor }}
            onClick={() => onChange({ ...value, mode: 'solid' })}
            aria-pressed={solidActive}
            aria-label={S.pattern.solid}
            title={S.pattern.solid}
            data-pattern="solid"
          >
            <span className="rounded-sm bg-surface/80 px-1 text-[10px] text-fg">
              {S.pattern.solid}
            </span>
          </button>
        ) : null}
        {genre === 'all' ? addTile : null}
        {patterns.map((p) => {
          const active = value.mode === 'pattern' && value.id === p.id;
          return (
            <div key={p.id} className="group relative">
              <button
                type="button"
                className={cn(
                  tile,
                  'checker',
                  active ? 'border-accent ring-2 ring-accent' : 'border-border',
                )}
                onClick={() => onChange({ ...value, mode: 'pattern', id: p.id })}
                aria-pressed={active}
                aria-label={p.name}
                title={p.name}
                data-pattern={p.id}
              >
                <img src={p.dataUrl} alt="" className="size-full object-cover" draggable={false} />
              </button>
              <button
                type="button"
                className="absolute -top-1 -right-1 hidden size-5 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-1 hover:text-danger group-focus-within:flex group-hover:flex [@media(hover:none)]:flex"
                onClick={() => void remove(p)}
                aria-label={S.pattern.remove(p.name)}
                title={S.pattern.remove(p.name)}
              >
                <X aria-hidden className="size-3" />
              </button>
            </div>
          );
        })}
        {genre === 'user' ? addTile : null}
      </div>
      {!patterns.length ? <p className="text-xs text-muted">{S.pattern.emptyHint}</p> : null}
      {solidActive ? (
        <Field label={S.pattern.solidColor}>
          <ColorField
            value={value.solidColor}
            onChange={(c) => onChange({ ...value, mode: 'solid', solidColor: c })}
            alpha
          />
        </Field>
      ) : null}
    </div>
  );
}
