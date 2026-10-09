/**
 * 設定欄的角色（兩張圖共用）：新增角色（名字、顏色、圖片）、一次加入多張圖片、角色清單（排序、放到這一頁、
 * 放進關係圖、刪除）、刪除所有角色；選取的角色（名字、顏色、圖片、四象限的標記、放進關係圖、從這一頁拿掉、刪除）。
 */
import {
  GripVertical,
  Image as ImageIcon,
  ImagePlus,
  MapPinPlus,
  Plus,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  ColorField,
  Field,
  FileDrop,
  GestureScope,
  IconButton,
  Section,
  Segmented,
  SortableList,
  TextInput,
  ThumbnailImage,
  Toggle,
  useConfirm,
  useToast,
} from '@/ui';
import { type LoadedImage, loadCharacterImage } from './images';
import {
  type Character,
  type ChartKind,
  LIMITS,
  MARKERS,
  type Marker,
  mapMembers,
  PALETTE,
} from './model';
import {
  addCharacter,
  canAddCharacter,
  clearCharacters,
  currentPageIndex,
  gesture,
  moveCharacter,
  patchCharacter,
  placeCharacter,
  removeCharacter,
  select,
  selectedCharacter,
  setCharacterImage,
  suggestedColor,
  unplaceCharacter,
  useChart,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';

type Bitmaps = ReadonlyMap<string, ImageBitmap>;

/** 清單、選取面板的小縮圖：有圖片就顯示圖片，沒有時是顏色圓點 */
function Thumb({ c, bitmaps, size = 32 }: { c: Character; bitmaps: Bitmaps; size?: number }) {
  const bmp = c.image ? bitmaps.get(c.image.id) : undefined;
  if (c.image && bmp)
    return (
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-sm"
        style={{ width: size, height: size }}
      >
        <ThumbnailImage source={bmp} />
      </span>
    );
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span
        className="size-3.5 rounded-full border border-border-strong"
        style={{ background: c.color }}
        data-testid="color-dot"
      />
    </span>
  );
}

/** 圖片載入的結果通知（存不進瀏覽器時提醒） */
function useImageToasts() {
  const toast = useToast();
  return {
    notSaved: () => toast({ title: S.imageNotSaved, tone: 'warning' }),
    failed: (names: string[]) => toast({ title: S.decodeError(names.join('、')), tone: 'danger' }),
    rejected: (files: File[]) =>
      toast({ title: S.notImage(files.map((f) => f.name).join('、')), tone: 'danger' }),
  };
}

export function CharactersSection({
  bitmaps,
  onBatch,
  onReject,
}: {
  bitmaps: Bitmaps;
  onBatch: (files: File[]) => void;
  onReject: (files: File[]) => void;
}) {
  const characters = useChart((s) => s.data.characters);
  const chart = usePrefs((s) => s.data.chart);
  const confirm = useConfirm();
  const full = characters.length >= LIMITS.characters;
  return (
    <Section
      title={S.sectionCharacters}
      description={S.charactersHint}
      actions={
        <span className="text-xs text-muted tabular-nums" data-testid="character-count">
          {S.count(characters.length)}
        </span>
      }
    >
      <AddForm chart={chart} disabled={full} />
      <Field label={S.batchLabel}>
        <FileDrop
          aria-label={S.batchAria}
          accept="image/*"
          multiple
          paste="document"
          compact
          disabled={full}
          icon={<ImagePlus />}
          label={S.batchDrop}
          hint={full ? S.limitReached(LIMITS.characters) : S.batchHint}
          buttonLabel={S.batchButton}
          onFiles={onBatch}
          onReject={onReject}
        />
      </Field>
      {characters.length > 1 ? <p className="m-0 text-xs text-muted">{S.listHint}</p> : null}
      <RosterList characters={characters} chart={chart} bitmaps={bitmaps} />
      {characters.length ? (
        <div>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 />}
            onClick={async () => {
              const ok = await confirm({
                title: S.clearTitle,
                description: S.clearDesc,
                confirmLabel: S.clearConfirm,
                danger: true,
              });
              if (ok) clearCharacters();
            }}
          >
            {S.clearCharacters}
          </Button>
        </div>
      ) : null}
    </Section>
  );
}

function AddForm({ chart, disabled }: { chart: ChartKind; disabled: boolean }) {
  const toast = useToast();
  const notes = useImageToasts();
  const count = useChart((s) => s.data.characters.length);
  const [name, setName] = useState('');
  const [color, setColor] = useState(suggestedColor);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [error, setError] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  /* 角色變多變少時（加入、刪除、復原），預設顏色跟著換成下一個沒人用的 */
  const colorTouched = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在人數改變時重算
  useEffect(() => {
    if (!colorTouched.current) setColor(suggestedColor());
  }, [count]);

  const add = () => {
    const n = name.trim();
    if (!n) {
      setError(true);
      nameInput.current?.focus();
      return;
    }
    if (!canAddCharacter()) {
      toast({ title: S.limitReached(LIMITS.characters), tone: 'warning' });
      return;
    }
    const id = addCharacter(
      { name: n, color, image: image?.ref ?? null },
      chart === 'quadrant' ? currentPageIndex() : null,
    );
    if (!id) return;
    toast({ title: S.added(n), tone: 'success', replace: true });
    setName('');
    setImage(null);
    setError(false);
    colorTouched.current = false;
    setColor(suggestedColor());
  };

  const pickImage = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    try {
      const r = await loadCharacterImage(f);
      if (!r.persisted) notes.notSaved();
      setImage(r);
    } catch {
      notes.failed([f.name]);
    }
  };

  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3"
      data-testid="add-form"
      disabled={disabled}
    >
      <legend className="sr-only">{S.addTitle}</legend>
      <Field label={S.name} error={error ? S.needName : undefined}>
        <TextInput
          ref={nameInput}
          value={name}
          placeholder={S.namePlaceholder}
          onChange={(e) => {
            setName(Array.from(e.target.value).slice(0, LIMITS.name).join(''));
            if (error && e.target.value.trim()) setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
      </Field>
      <Field label={S.color}>
        <ColorField
          value={color}
          swatches={PALETTE}
          onChange={(v) => {
            colorTouched.current = true;
            setColor(v.slice(0, 7).toLowerCase());
          }}
        />
      </Field>
      <Field label={S.image}>
        {image ? (
          <div className="flex min-w-0 items-center gap-2" data-testid="add-image">
            <ImageIcon aria-hidden className="size-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm" title={image.ref.name}>
              {S.imageChosen(image.ref.name)}
            </span>
            <IconButton
              size="sm"
              variant="ghost"
              label={S.imageClear}
              icon={<X />}
              onClick={() => setImage(null)}
            />
          </div>
        ) : (
          <FileDrop
            aria-label={S.imageDropLabel}
            accept="image/*"
            paste="off"
            compact
            icon={<ImageIcon />}
            label={S.imageDropLabel}
            buttonLabel={S.imageChoose}
            onFiles={(f) => void pickImage(f)}
            onReject={notes.rejected}
          />
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <Button variant="primary" icon={<UserPlus />} onClick={add}>
          {S.addButton}
        </Button>
        <p className="m-0 text-xs text-muted">
          {chart === 'quadrant' ? S.addHintQuadrant : S.addHintRelation}
        </p>
      </div>
    </fieldset>
  );
}

function RosterList({
  characters,
  chart,
  bitmaps,
}: {
  characters: Character[];
  chart: ChartKind;
  bitmaps: Bitmaps;
}) {
  const toast = useToast();
  const selectedId = useUi((s) => s.selectedId);
  const pageIndex = usePrefs((s) => s.data.page);
  const page = useChart((s) => s.data.pages[Math.min(pageIndex, s.data.pages.length - 1)]);
  const members = mapMembers(characters);
  return (
    <SortableList
      aria-label={S.listLabel}
      items={characters}
      getId={(c) => c.id}
      selectedId={selectedId}
      onSelect={(id) => select(id)}
      onMove={moveCharacter}
      onMoveStart={gesture.begin}
      onMoveEnd={gesture.commit}
      handleOnly
      empty={S.listEmpty}
      renderItem={(c) => {
        const name = c.name || S.noName;
        const onPage = !!page?.positions[c.id];
        const order = members.indexOf(c);
        return (
          <div
            className="flex min-h-12 min-w-0 items-center gap-2 px-2 py-1"
            data-character-row={c.id}
            data-on-page={onPage || undefined}
            data-in-map={c.inMap || undefined}
          >
            <span
              data-drag-handle
              aria-hidden
              className="-ml-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
            >
              <GripVertical />
            </span>
            <Thumb c={c} bitmaps={bitmaps} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className={c.name ? 'truncate text-sm text-fg' : 'truncate text-sm text-muted'}
                title={c.name}
              >
                {name}
              </span>
              <span
                className="flex items-center gap-1.5 text-xs text-muted"
                data-testid="row-status"
              >
                {chart === 'quadrant' ? (
                  <>
                    <span
                      aria-hidden
                      className={
                        onPage
                          ? 'size-1.5 rounded-full bg-success'
                          : 'size-1.5 rounded-full border border-border-strong'
                      }
                    />
                    {onPage ? S.onPage : S.notOnPage}
                  </>
                ) : c.inMap ? (
                  S.mapOrder(order + 1)
                ) : (
                  '—'
                )}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {chart === 'quadrant' ? (
                onPage ? null : (
                  <IconButton
                    size="sm"
                    label={`${S.place}：${name}`}
                    icon={<MapPinPlus />}
                    onClick={() => {
                      placeCharacter(c.id, currentPageIndex());
                      select(c.id);
                      toast({ title: S.placed(name), tone: 'success', replace: true });
                    }}
                  />
                )
              ) : (
                <Checkbox
                  aria-label={`${S.inMap}：${name}`}
                  checked={c.inMap}
                  onCheckedChange={(v) => patchCharacter(c.id, { inMap: v })}
                />
              )}
              <IconButton
                size="sm"
                variant="ghost"
                label={`${S.remove}：${name}`}
                icon={<Trash2 />}
                onClick={() => removeCharacter(c.id)}
              />
            </div>
          </div>
        );
      }}
    />
  );
}

export function SelectedSection({ bitmaps }: { bitmaps: Bitmaps }) {
  const selectedId = useUi((s) => s.selectedId);
  const c = useChart((s) => selectedCharacter(s.data, selectedId));
  const chart = usePrefs((s) => s.data.chart);
  const pageIndex = usePrefs((s) => s.data.page);
  const onPage = useChart((s) => {
    const p = s.data.pages[Math.min(pageIndex, s.data.pages.length - 1)];
    return !!(c && p?.positions[c.id]);
  });
  const notes = useImageToasts();
  if (!c) return null;
  const missing = !!c.image && !bitmaps.get(c.image.id);
  const changeImage = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    try {
      const r = await loadCharacterImage(f);
      if (!r.persisted) notes.notSaved();
      setCharacterImage(c.id, r.ref);
    } catch {
      notes.failed([f.name]);
    }
  };
  return (
    <Section title={S.sectionSelected}>
      <div className="flex flex-col gap-3" data-testid="selected-panel" data-character={c.id}>
        <Field label={S.name}>
          <TextInput
            value={c.name}
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => patchCharacter(c.id, { name: e.target.value })}
          />
        </Field>
        <Field label={S.color}>
          <GestureScope gesture={gesture}>
            <ColorField
              value={c.color}
              swatches={PALETTE}
              onChange={(v) => patchCharacter(c.id, { color: v.slice(0, 7).toLowerCase() })}
            />
          </GestureScope>
        </Field>
        <Field label={S.imageField}>
          <div className="flex min-w-0 flex-col gap-2">
            {c.image ? (
              <div className="flex min-w-0 items-center gap-2" data-testid="selected-image">
                <Thumb c={c} bitmaps={bitmaps} size={48} />
                <span className="min-w-0 flex-1 truncate text-sm" title={c.image.name}>
                  {c.image.name || '—'}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X />}
                  onClick={() => setCharacterImage(c.id, null)}
                >
                  {S.removeImage}
                </Button>
              </div>
            ) : null}
            {missing ? <p className="m-0 text-xs text-warning">{S.imageMissing}</p> : null}
            <FileDrop
              aria-label={S.imageDropLabel}
              accept="image/*"
              paste="off"
              compact
              icon={<ImagePlus />}
              label={c.image ? S.changeImage : S.addImage}
              buttonLabel={S.imageChoose}
              onFiles={(f) => void changeImage(f)}
              onReject={notes.rejected}
            />
          </div>
        </Field>
        <Field label={S.marker} hint={S.markerHint}>
          <Segmented<Marker>
            value={c.image ? c.marker : 'dot'}
            onValueChange={(v) => patchCharacter(c.id, { marker: v })}
            fullWidth
            options={MARKERS.map((m) => ({
              value: m,
              label: S.markers[m],
              disabled: m === 'image' && !c.image,
            }))}
          />
        </Field>
        <Field label={S.inMap} layout="inline" hint={S.inMapHint}>
          <Toggle checked={c.inMap} onCheckedChange={(v) => patchCharacter(c.id, { inMap: v })} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {chart === 'quadrant' ? (
            onPage ? (
              <Button onClick={() => unplaceCharacter(c.id, currentPageIndex())}>
                {S.unplace}
              </Button>
            ) : (
              <Button icon={<Plus />} onClick={() => placeCharacter(c.id, currentPageIndex())}>
                {S.place}
              </Button>
            )
          ) : null}
          <Button variant="danger" icon={<Trash2 />} onClick={() => removeCharacter(c.id)}>
            {S.deleteCharacter}
          </Button>
        </div>
        {chart === 'quadrant' && onPage ? (
          <p className="m-0 text-xs text-muted">{S.selectedHint}</p>
        ) : null}
      </div>
    </Section>
  );
}
