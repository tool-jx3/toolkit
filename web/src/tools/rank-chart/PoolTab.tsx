/**
 * 分頁 02「角色名單」（規格 1.3）：新增名字、一次輸入名字、一次加很多張照片（選檔、拖放、貼上）、
 * 名單（名稱、照片的加入／裁切／更換／移除、拖曳排序、刪除）、換成範例、全部清空。
 */
import {
  Crop as CropIcon,
  ImagePlus,
  ListPlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { pickFiles } from '@/core/files';
import {
  Button,
  Dialog,
  DialogClose,
  FileDrop,
  Section,
  TextArea,
  ThumbnailList,
  useConfirm,
  useToast,
} from '@/ui';
import {
  addBlank,
  addNames,
  addPhotos,
  applyCrop,
  clearPool,
  loadDemo,
  removeCharacter,
  removePhoto,
  renameCharacter,
  reorderCharacter,
} from './actions';
import { CropEditor, type CropTarget } from './CropEditor';
import { PHOTO_ACCEPT, PhotoError, sourceBitmap, storePhoto } from './images';
import {
  DEFAULT_CROP,
  LIMITS,
  MAX_POOL,
  PHOTO_MAX_SIDE,
  parseNames,
  type RankCharacter,
} from './model';
import { placeholderThumb } from './render';
import { configNow, useConfig, useGame, useSession } from './store';
import { S } from './strings';
import { LimitedInput, NextStep } from './widgets';

/** 加照片的通知（成功、失敗的檔案、沒存進瀏覽器） */
export function usePhotoAdder() {
  const toast = useToast();
  return async (files: readonly File[]) => {
    if (!files.length) return;
    const left = MAX_POOL - configNow().characters.length;
    if (files.length > left) {
      toast({ title: S.poolLeft(Math.max(0, left)), tone: 'danger' });
      return;
    }
    const r = await addPhotos(files);
    if (r.added) toast({ title: S.photosAdded(r.added), tone: 'success' });
    if (r.errors.length)
      toast({
        title: S.photoErrorsTitle,
        description: S.photoErrors(r.errors.slice(0, 2), r.errors.length - 2),
        tone: 'danger',
      });
    if (r.notPersisted) toast({ title: S.notPersisted, tone: 'warning' });
  };
}

function NamesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [text, setText] = useState('');
  /* 錯誤寫在對話框裡（通知在對話框後面，螢幕閱讀器讀不到） */
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const count = useConfig((s) => s.data.characters.length);
  const apply = () => {
    const names = parseNames(text);
    if (!names.length) {
      setError(S.namesEmpty);
      return;
    }
    if (!addNames(names)) {
      setError(S.poolLeft(Math.max(0, MAX_POOL - count)));
      return;
    }
    toast({ title: S.namesAdded(names.length), tone: 'success' });
    setText('');
    setError(null);
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setText('');
          setError(null);
        }
        onOpenChange(o);
      }}
      title={S.namesTitle}
      description={S.namesHint(Math.max(0, MAX_POOL - count))}
      footer={
        <>
          <DialogClose>{S.cancel}</DialogClose>
          <Button variant="primary" onClick={apply} data-testid="names-apply">
            {S.namesApply}
          </Button>
        </>
      }
    >
      <TextArea
        aria-label={S.namesLabel}
        rows={9}
        value={text}
        placeholder={S.namesPlaceholder}
        invalid={!!error}
        onChange={(e) => {
          setText(e.currentTarget.value);
          setError(null);
        }}
        data-testid="names-text"
      />
      {error ? (
        <p role="alert" className="m-0 mt-2 text-sm text-danger" data-testid="names-error">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

function CharacterFields({
  ch,
  index,
  locked,
  onCrop,
  onPhoto,
}: {
  ch: RankCharacter;
  index: number;
  locked: boolean;
  onCrop: (ch: RankCharacter) => void;
  onPhoto: (ch: RankCharacter) => void;
}) {
  const missing = useSession((s) => (ch.thumb ? s.images[ch.thumb] === null : false));
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="character-row" data-id={ch.id}>
      <LimitedInput
        value={ch.name}
        max={LIMITS.character}
        disabled={locked}
        aria-label={S.charNameAria(index)}
        placeholder={S.charPlaceholder}
        data-char-name={ch.id}
        className="h-8"
        onChange={(v) => renameCharacter(ch.id, v)}
        onBlurValue={(v) => {
          if (v !== v.trim()) renameCharacter(ch.id, v.trim());
        }}
      />
      <span className="text-xs text-muted">{ch.photo ? S.subPhoto : S.subCard}</span>
      {missing ? (
        <p className="m-0 text-xs text-danger" role="status">
          {S.missingPhoto}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {ch.photo ? (
          <>
            <Button
              size="sm"
              icon={<CropIcon />}
              disabled={locked}
              onClick={() => onCrop(ch)}
              aria-label={S.actionAria(S.crop, ch.name)}
            >
              {S.crop}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw />}
              disabled={locked}
              onClick={() => onPhoto(ch)}
              aria-label={S.actionAria(S.replacePhoto, ch.name)}
            >
              {S.replacePhoto}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<X />}
              disabled={locked}
              onClick={() => removePhoto(ch.id)}
              aria-label={S.actionAria(S.removePhoto, ch.name)}
            >
              {S.removePhoto}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            icon={<ImagePlus />}
            disabled={locked}
            onClick={() => onPhoto(ch)}
            aria-label={S.actionAria(S.addPhoto, ch.name)}
          >
            {S.addPhoto}
          </Button>
        )}
      </div>
    </div>
  );
}

export function PoolTab() {
  const characters = useConfig((s) => s.data.characters);
  const locked = useGame((s) => s.data.run !== null);
  const images = useSession((s) => s.images);
  const busy = useSession((s) => s.busy);
  const toast = useToast();
  const confirm = useConfirm();
  const addPhotosNow = usePhotoAdder();
  const [namesOpen, setNamesOpen] = useState(false);
  const [crop, setCrop] = useState<CropTarget | null>(null);

  const openCrop = async (ch: RankCharacter) => {
    const bitmap = await sourceBitmap(ch.photo);
    if (!ch.photo || !bitmap) {
      toast({ title: S.missingPhoto, tone: 'danger' });
      return;
    }
    setCrop({ charId: ch.id, name: ch.name, photo: ch.photo, bitmap, crop: ch.crop });
  };
  /* 加照片／換照片：選好之後先裁切，按「套用」才換上 */
  const pickPhoto = async (ch: RankCharacter) => {
    const [file] = await pickFiles({ accept: PHOTO_ACCEPT });
    if (!file) return;
    try {
      const p = await storePhoto(file, PHOTO_MAX_SIDE);
      if (!p.persisted) toast({ title: S.notPersisted, tone: 'warning' });
      setCrop({
        charId: ch.id,
        name: ch.name,
        photo: p.ref,
        bitmap: p.bitmap,
        crop: { ...DEFAULT_CROP },
      });
    } catch (e) {
      toast({
        title: e instanceof PhotoError ? e.message : S.decodeError(file.name),
        tone: 'danger',
      });
    }
  };

  const items = characters.map((ch) => ({
    id: ch.id,
    name: ch.name || S.charPlaceholder,
    image: ch.thumb
      ? ch.thumb in images
        ? (images[ch.thumb] ?? placeholderThumb(ch.name))
        : null
      : placeholderThumb(ch.name),
  }));

  return (
    <div className="flex flex-col gap-3">
      <Section
        title={S.poolTitle}
        fixed
        description={S.poolLead}
        actions={
          <span
            className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted tabular-nums"
            data-testid="pool-count"
          >
            {S.poolCount(characters.length)}
          </span>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            icon={<Plus />}
            disabled={locked}
            onClick={() => {
              const id = addBlank();
              if (!id) {
                toast({ title: S.poolFull, tone: 'danger' });
                return;
              }
              requestAnimationFrame(() => {
                const el = document.querySelector<HTMLInputElement>(`[data-char-name="${id}"]`);
                el?.focus();
                el?.select();
              });
            }}
          >
            {S.addName}
          </Button>
          <Button
            size="sm"
            icon={<ListPlus />}
            disabled={locked}
            onClick={() => setNamesOpen(true)}
          >
            {S.pasteNames}
          </Button>
        </div>
        <FileDrop
          onFiles={(files) => {
            /* 不是圖片的檔也交給 addPhotos：列在「無法加入」裡，圖片照樣加入（對等驗證 7.1） */
            void addPhotosNow(files);
          }}
          accept={PHOTO_ACCEPT}
          multiple
          filterByAccept={false}
          paste="document"
          clickable
          icon={<ImagePlus />}
          label={busy ? `${S.dropLabel}（${busy}）` : S.dropLabel}
          buttonLabel={S.dropButton}
          hint={S.dropHint}
          disabled={locked || !!busy}
          aria-label={S.dropLabel}
        />
        <ThumbnailList
          aria-label={S.listAria}
          layout="list"
          thumbSize={56}
          thumbFit="cover"
          items={items}
          onReorder={locked ? undefined : reorderCharacter}
          onRemove={locked ? undefined : removeCharacter}
          removeLabel={(it) =>
            S.actionAria(S.remove, characters.find((c) => c.id === it.id)?.name ?? '')
          }
          empty={<p className="m-0 py-6 text-center text-sm text-muted">{S.empty}</p>}
          renderFields={(_, i) => (
            <CharacterFields
              ch={characters[i]}
              index={i}
              locked={locked}
              onCrop={(ch) => void openCrop(ch)}
              onPhoto={(ch) => void pickPhoto(ch)}
            />
          )}
        />
        <p className="m-0 text-xs text-muted" data-testid="pool-stat">
          {S.poolStat(characters.length)}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            icon={<RotateCcw />}
            disabled={locked}
            onClick={async () => {
              if (
                !(await confirm({
                  title: S.demoTitle,
                  description: S.demoText,
                  confirmLabel: S.demoConfirm,
                }))
              )
                return;
              loadDemo();
            }}
          >
            {S.demo}
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 />}
            disabled={locked || !characters.length}
            onClick={async () => {
              if (
                !(await confirm({
                  title: S.clearTitle,
                  description: S.clearText,
                  confirmLabel: S.clearConfirm,
                  danger: true,
                }))
              )
                return;
              clearPool();
            }}
          >
            {S.clear}
          </Button>
        </div>
      </Section>
      <NextStep to="rules" />
      <NamesDialog open={namesOpen} onOpenChange={setNamesOpen} />
      <CropEditor
        target={crop}
        onClose={() => setCrop(null)}
        onApply={(t, c) => {
          void applyCrop(t, c).then((persisted) => {
            if (!persisted) toast({ title: S.notPersisted, tone: 'warning' });
          });
        }}
      />
    </div>
  );
}
