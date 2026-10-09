/**
 * 設定欄：排列、個人資料、劇本格子（清單、加一格、一次放入多張圖片）、這一格（圖片、規則、劇本名稱、作者、心得標籤、感想）、
 * 心得標籤清單（新增、改字、刪除、排序、回到預設）。比較多人的心得在 CompareSection.tsx。
 */
import {
  GripVertical,
  Image as ImageIcon,
  ImagePlus,
  Images,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  Button,
  cn,
  Field,
  FileDrop,
  IconButton,
  Section,
  Segmented,
  SortableList,
  TextArea,
  TextInput,
  ThumbnailImage,
  useConfirm,
  useToast,
} from '@/ui';
import {
  type Cell,
  cleanTag,
  IMAGE_RATIOS,
  type ImageRatio,
  type ImageRef,
  LIMITS,
  RULE_SUGGESTIONS,
  tagUsage,
  VIEW_MODES,
  type ViewMode,
} from './model';
import { revealSection } from './reveal';
import {
  addCell,
  addTag,
  type CellText,
  canAddCell,
  gesture,
  moveCell,
  moveTag,
  patchProfile,
  removeCell,
  removeTag,
  renameTag,
  resetTags,
  select,
  selectedCellOf,
  setCellImage,
  setCellText,
  setProfileImage,
  setRatio,
  setView,
  toggleCellTag,
  useReview,
  useUi,
} from './store';
import { S } from './strings';
import { usePlaceImages } from './usePlaceImages';

type Bitmaps = ReadonlyMap<string, ImageBitmap>;

const count = (s: string) => Array.from(s).length;

/* ---------- 小元件 ---------- */

function Thumb({
  image,
  bitmaps,
  size,
}: {
  image: ImageRef | null;
  bitmaps: Bitmaps;
  size: number;
}) {
  const bmp = image ? bitmaps.get(image.id) : undefined;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-3 text-muted [&_svg]:size-4"
      style={{ width: size, height: size }}
    >
      {bmp ? <ThumbnailImage source={bmp} /> : <ImageIcon />}
    </span>
  );
}

/** 圖片欄：縮圖＋檔名＋拿掉；下面是選檔、拖放 */
function ImageField({
  image,
  bitmaps,
  dropLabel,
  onFiles,
  onReject,
  onClear,
  testId,
}: {
  image: ImageRef | null;
  bitmaps: Bitmaps;
  dropLabel: string;
  onFiles: (files: File[]) => void;
  onReject: (files: File[]) => void;
  onClear: () => void;
  testId: string;
}) {
  const missing = !!image && !bitmaps.get(image.id);
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={testId}>
      {image ? (
        <div className="flex min-w-0 items-center gap-2" data-testid={`${testId}-current`}>
          <Thumb image={image} bitmaps={bitmaps} size={48} />
          <span className="min-w-0 flex-1 truncate text-sm" title={image.name}>
            {image.name || '—'}
          </span>
          <Button size="sm" variant="ghost" icon={<X />} onClick={onClear}>
            {S.removeImage}
          </Button>
        </div>
      ) : null}
      {missing ? <p className="m-0 text-xs text-warning">{S.imageMissing}</p> : null}
      <FileDrop
        aria-label={dropLabel}
        accept="image/*"
        paste="off"
        compact
        icon={<ImagePlus />}
        label={image ? S.changeImage : S.dropImage}
        buttonLabel={S.chooseImage}
        onFiles={onFiles}
        onReject={onReject}
      />
    </div>
  );
}

/** 文字欄（單行）：從聚焦到離開算一步復原 */
function LineField({
  label,
  value,
  max,
  placeholder,
  onChange,
  list,
  hint,
}: {
  label: string;
  value: string;
  max: number;
  placeholder?: string;
  onChange: (v: string) => void;
  list?: string;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint} labelSuffix={`${count(value)}／${max}`}>
      <TextInput
        value={value}
        placeholder={placeholder}
        list={list}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
        }}
      />
    </Field>
  );
}

/* ---------- 排列 ---------- */

export function LayoutSection() {
  const view = useReview((s) => s.data.view);
  const ratio = useReview((s) => s.data.ratio);
  return (
    <Section title={S.sectionLayout} persistKey="review-grid:layout">
      <Field label={S.view} hint={S.viewHint[view]}>
        <Segmented<ViewMode>
          value={view}
          onValueChange={setView}
          fullWidth
          options={VIEW_MODES.map((v) => ({ value: v, label: S.views[v] }))}
        />
      </Field>
      <Field label={S.ratio} hint={view === 'grid' ? S.ratioHint : S.ratioListHint}>
        <Segmented<ImageRatio>
          value={ratio}
          onValueChange={setRatio}
          fullWidth
          options={IMAGE_RATIOS.map((r) => ({
            value: r,
            label: S.ratios[r],
            disabled: view !== 'grid',
          }))}
        />
      </Field>
    </Section>
  );
}

/* ---------- 個人資料 ---------- */

export function ProfileSection({ bitmaps }: { bitmaps: Bitmaps }) {
  const profile = useReview((s) => s.data.profile);
  const { place, reject } = usePlaceImages();
  return (
    <div id="rg-profile" className="scroll-mt-16">
      <Section
        title={S.sectionProfile}
        description={S.profileHint}
        persistKey="review-grid:profile"
      >
        <Field label={S.avatar}>
          <ImageField
            image={profile.image}
            bitmaps={bitmaps}
            dropLabel={S.avatarDrop}
            testId="avatar-field"
            onFiles={(f) => void place(f.slice(0, 1), { kind: 'profile' })}
            onReject={reject}
            onClear={() => setProfileImage(null)}
          />
        </Field>
        <LineField
          label={S.name}
          value={profile.name}
          max={LIMITS.name}
          placeholder={S.namePlaceholder}
          onChange={(v) => patchProfile({ name: v })}
        />
        <LineField
          label={S.handle}
          value={profile.handle}
          max={LIMITS.handle}
          placeholder={S.handlePlaceholder}
          onChange={(v) => patchProfile({ handle: v })}
        />
      </Section>
    </div>
  );
}

/* ---------- 劇本格子 ---------- */

export function CellsSection({ bitmaps }: { bitmaps: Bitmaps }) {
  const cells = useReview((s) => s.data.cells);
  const selectedId = useUi((s) => s.selectedId);
  const selected = useReview((s) => selectedCellOf(s.data, selectedId));
  const toast = useToast();
  const { place, reject } = usePlaceImages();
  const full = cells.length >= LIMITS.cells;
  return (
    <Section
      title={S.sectionCells}
      description={S.cellsHint}
      actions={
        <span className="text-xs text-muted tabular-nums" data-testid="cell-count">
          {S.cellsCount(cells.length)}
        </span>
      }
    >
      <SortableList<Cell>
        aria-label={S.cellsLabel}
        items={cells}
        getId={(c) => c.id}
        selectedId={selected.id}
        onSelect={(id) => select(id)}
        onMove={moveCell}
        onMoveStart={gesture.begin}
        onMoveEnd={gesture.commit}
        handleOnly
        renderItem={(c, { index }) => {
          const label = S.cellNumber(index + 1);
          return (
            <div
              className="flex min-h-12 min-w-0 items-center gap-2 px-2 py-1"
              data-cell-row={c.id}
            >
              <span
                data-drag-handle
                aria-hidden
                className="-ml-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
              >
                <GripVertical />
              </span>
              <Thumb image={c.image} bitmaps={bitmaps} size={36} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-xs text-muted">
                  {label}
                  {c.rule.trim() ? ` · ${c.rule.trim()}` : ''}
                </span>
                <span
                  className={cn('truncate text-sm', c.title.trim() ? 'text-fg' : 'text-muted')}
                  title={c.title}
                >
                  {c.title.trim() || S.untitled}
                </span>
              </div>
              <IconButton
                size="sm"
                variant="ghost"
                label={S.removeCellNamed(label)}
                icon={<Trash2 />}
                disabled={cells.length <= 1}
                onClick={() => {
                  if (!removeCell(c.id))
                    toast({ title: S.lastCell, tone: 'warning', replace: true });
                }}
              />
            </div>
          );
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={<Plus />}
          disabled={full}
          onClick={() => {
            if (!canAddCell() || !addCell()) {
              toast({ title: S.cellLimit(LIMITS.cells), tone: 'warning', replace: true });
              return;
            }
            revealSection('rg-cell-editor');
          }}
        >
          {S.addCell}
        </Button>
        {full ? <span className="text-xs text-muted">{S.cellLimit(LIMITS.cells)}</span> : null}
      </div>
      <Field label={S.batchLabel}>
        <FileDrop
          aria-label={S.batchAria}
          accept="image/*"
          multiple
          paste="off"
          compact
          icon={<Images />}
          label={S.batchDrop}
          hint={S.batchHint}
          buttonLabel={S.chooseImage}
          onFiles={(f) => void place(f, null)}
          onReject={reject}
        />
      </Field>
    </Section>
  );
}

/* ---------- 這一格 ---------- */

export function CellEditor({ bitmaps }: { bitmaps: Bitmaps }) {
  const selectedId = useUi((s) => s.selectedId);
  const cell = useReview((s) => selectedCellOf(s.data, selectedId));
  const index = useReview((s) => s.data.cells.findIndex((c) => c.id === cell.id));
  const view = useReview((s) => s.data.view);
  const { place, reject } = usePlaceImages();
  const set = (key: CellText) => (v: string) => setCellText(cell.id, key, v);
  return (
    <div id="rg-cell-editor" className="scroll-mt-16">
      <Section title={S.sectionCell(index + 1)}>
        <div className="flex flex-col gap-3" data-testid="cell-editor" data-cell={cell.id}>
          <Field label={S.cellImage} hint={S.cellImageHint}>
            <ImageField
              image={cell.image}
              bitmaps={bitmaps}
              dropLabel={S.cellImageDrop}
              testId="cell-image-field"
              onFiles={(f) => void place(f.slice(0, 1), { kind: 'cell', id: cell.id })}
              onReject={reject}
              onClear={() => setCellImage(cell.id, null)}
            />
          </Field>
          <LineField
            label={S.rule}
            value={cell.rule}
            max={LIMITS.rule}
            placeholder={S.rulePlaceholder}
            list="rg-rule-suggestions"
            onChange={set('rule')}
          />
          <datalist id="rg-rule-suggestions">
            {RULE_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <LineField
            label={S.title}
            value={cell.title}
            max={LIMITS.title}
            placeholder={S.titlePlaceholder}
            onChange={set('title')}
          />
          <LineField
            label={S.writer}
            value={cell.writer}
            max={LIMITS.writer}
            placeholder={S.writerPlaceholder}
            onChange={set('writer')}
          />
          <TagPicker cell={cell} />
          <Field
            label={S.comment}
            hint={view === 'list' ? S.commentHintList : S.commentHintGrid}
            labelSuffix={`${count(cell.comment)}／${LIMITS.comment}`}
          >
            <TextArea
              rows={4}
              value={cell.comment}
              placeholder={S.commentPlaceholder}
              onFocus={gesture.begin}
              onBlur={gesture.commit}
              onChange={(e) => set('comment')(e.target.value)}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}

/** 這一格的心得標籤：點一下選、再點一下取消（最多 3 個）；下面可以直接寫一個新的標籤 */
function TagPicker({ cell }: { cell: Cell }) {
  const toast = useToast();
  const list = useReview((s) => s.data.tags);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const offList = cell.tags.filter((t) => !list.includes(t));
  const options = [...list, ...offList];
  const full = cell.tags.length >= LIMITS.tagsPerCell;
  const toggle = (t: string) => {
    if (toggleCellTag(cell.id, t) === 'full')
      toast({ title: S.tagsFull(LIMITS.tagsPerCell), tone: 'warning', replace: true });
  };
  const quickAdd = () => {
    const r = addTag(draft);
    const text = cleanTag(draft);
    if (r === 'empty') {
      setError(S.tagEmpty);
      return;
    }
    if (r === 'full') {
      setError(S.tagListFull(LIMITS.tagList));
      return;
    }
    /* 新加的或清單裡本來就有：選取（已經選了就不動） */
    if (!cell.tags.includes(text)) toggle(text);
    setDraft('');
    setError(null);
  };
  return (
    <Field
      label={S.tags}
      hint={S.tagsHint(LIMITS.tagsPerCell)}
      labelSuffix={
        <span data-testid="tag-count">{S.tagsCount(cell.tags.length, LIMITS.tagsPerCell)}</span>
      }
    >
      <div className="flex min-w-0 flex-col gap-2">
        {/* biome-ignore lint/a11y/useSemanticElements: 一組切換按鈕，不是表單分組 */}
        <div
          role="group"
          aria-label={S.tagsAria}
          className="flex flex-wrap gap-1.5"
          data-testid="tag-picker"
        >
          {options.map((t) => {
            const on = cell.tags.includes(t);
            const order = cell.tags.indexOf(t);
            const off = !list.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                title={off ? `${t}${S.offList}` : undefined}
                data-tag={t}
                onClick={() => toggle(t)}
                className={cn(
                  'inline-flex h-8 max-w-full items-center gap-1 rounded-full border px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus',
                  on
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border bg-surface-2 text-fg hover:border-border-strong hover:bg-surface-3',
                  !on && full && 'opacity-60',
                  off && 'border-dashed',
                )}
              >
                {on ? (
                  <span aria-hidden className="tabular-nums font-semibold">
                    {order + 1}
                  </span>
                ) : null}
                <span className="truncate">{t}</span>
              </button>
            );
          })}
        </div>
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <TextInput
              aria-label={S.quickTag}
              value={draft}
              placeholder={S.quickTagPlaceholder}
              invalid={!!error}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  quickAdd();
                }
              }}
            />
            {error ? (
              <p className="m-0 mt-1 text-xs text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <Button icon={<Plus />} onClick={quickAdd}>
            {S.quickTagAdd}
          </Button>
        </div>
      </div>
    </Field>
  );
}

/* ---------- 心得標籤清單 ---------- */

export function TagsSection() {
  const tags = useReview((s) => s.data.tags);
  const cells = useReview((s) => s.data.cells);
  const confirm = useConfirm();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const r = addTag(draft);
    if (r === 'empty') setError(S.tagEmpty);
    else if (r === 'duplicate') setError(S.tagDuplicate);
    else if (r === 'full') setError(S.tagListFull(LIMITS.tagList));
    else {
      setDraft('');
      setError(null);
    }
  };
  const remove = async (i: number) => {
    const t = tags[i];
    const used = tagUsage(cells, t);
    if (used) {
      const ok = await confirm({
        title: S.tagRemoveTitle(t),
        description: S.tagRemoveDesc(used),
        confirmLabel: S.tagRemoveConfirm,
        danger: true,
      });
      if (!ok) return;
    }
    removeTag(i);
  };
  return (
    <Section
      title={S.sectionTags}
      description={S.tagsListHint}
      defaultOpen={false}
      persistKey="review-grid:tags"
      actions={
        <span className="text-xs text-muted tabular-nums" data-testid="tag-list-count">
          {S.tagsListCount(tags.length)}
        </span>
      }
    >
      <SortableList<string>
        aria-label={S.tagsListLabel}
        items={tags}
        getId={(t) => t}
        onMove={moveTag}
        onMoveStart={gesture.begin}
        onMoveEnd={gesture.commit}
        handleOnly
        renderItem={(t, { index }) => (
          <div className="flex min-w-0 items-center gap-2 px-2 py-1" data-tag-row={t}>
            <span
              data-drag-handle
              aria-hidden
              className="-ml-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
            >
              <GripVertical />
            </span>
            <TagText
              tag={t}
              onCommit={(v) => {
                const err = renameTag(index, v);
                if (err)
                  toast({
                    title: err === 'duplicate' ? S.tagDuplicate : S.tagEmpty,
                    tone: 'warning',
                    replace: true,
                  });
                return !err;
              }}
            />
            <span className="w-10 shrink-0 text-right text-xs text-muted tabular-nums">
              {S.tagUsed(tagUsage(cells, t))}
            </span>
            <IconButton
              size="sm"
              variant="ghost"
              label={S.tagRemove(t)}
              icon={<Trash2 />}
              onClick={() => void remove(index)}
            />
          </div>
        )}
      />
      <Field label={S.newTag} error={error ?? undefined}>
        <div className="flex min-w-0 gap-2">
          <TextInput
            value={draft}
            placeholder={S.newTagPlaceholder}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button icon={<Plus />} onClick={add} disabled={tags.length >= LIMITS.tagList}>
            {S.addTag}
          </Button>
        </div>
      </Field>
      <div>
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw />}
          onClick={async () => {
            const ok = await confirm({
              title: S.resetTagsTitle,
              description: S.resetTagsDesc,
              confirmLabel: S.resetTagsConfirm,
            });
            if (ok) resetTags();
          }}
        >
          {S.resetTags}
        </Button>
      </div>
    </Section>
  );
}

/** 標籤的文字欄：Enter 或離開時套用，Esc 還原；不能用（空白、重複）時還原 */
function TagText({ tag, onCommit }: { tag: string; onCommit: (v: string) => boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== tag) onCommit(draft);
    setDraft(null);
  };
  return (
    <div className="min-w-0 flex-1">
      <TextInput
        aria-label={S.tagText(tag)}
        value={draft ?? tag}
        onFocus={() => setDraft(tag)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(tag);
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
          }
        }}
      />
    </div>
  );
}
