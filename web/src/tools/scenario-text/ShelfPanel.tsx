/**
 * 「圖片庫」分頁（規格 1.4）：拖放區、用網址加入、每張圖做一則、每張圖的名稱／出處／資訊／刪除。
 */
import { Link2, ListPlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  Field,
  FileDrop,
  IconButton,
  Section,
  TextInput,
  Tooltip,
  useConfirm,
} from '@/ui';
import {
  addFiles,
  addUrl,
  makeFromImages,
  removeImage,
  renameImage,
  setImageCredit,
} from './actions';
import { isImageUrl, isTooBig, type ShelfImage, sizeText } from './model';
import { IMAGE_ACCEPT, StatusLine, Thumb } from './parts';
import { usesOf } from './resolve';
import { useDoc, useUi } from './store';
import { S } from './strings';

function ImageCell({ image }: { image: ShelfImage }) {
  const confirm = useConfirm();
  const missing = useUi((s) => (image.kind === 'file' ? s.missing.has(image.asset) : false));
  const big = isTooBig(image);
  const label = image.name || S.noName;

  const remove = async () => {
    const d = useDoc.getState().data;
    const { names, count } = usesOf(d, image.id, { noName: S.noName, face: S.facesTitle });
    const used = names.length > 0 || count > 0;
    const ok = await confirm(
      used
        ? {
            title: S.deleteUsedTitle(label),
            description: (
              <span className="flex flex-col gap-1">
                {names.length ? <span>{S.deleteUsedNames(names.join('、'))}</span> : null}
                {count ? <span>{S.deleteUsedCount(count)}</span> : null}
                <span>{S.deleteUsedAfter}</span>
              </span>
            ),
            confirmLabel: S.deleteConfirm,
            danger: true,
          }
        : { title: S.deleteTitle(label), confirmLabel: S.deleteConfirm, danger: true },
    );
    if (ok) removeImage(image.id, used);
  };

  const info =
    image.kind === 'url' ? (
      <Tooltip content={image.url}>
        <span className="truncate" data-testid="image-info">
          {S.imageUrlInfo}
        </span>
      </Tooltip>
    ) : (
      <span
        className={missing || big ? 'truncate text-warning' : 'truncate'}
        data-testid="image-info"
      >
        {missing ? S.imageMissing : `${sizeText(image.size)}${big ? S.imageTooBig : ''}`}
      </span>
    );

  return (
    <li
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface-2 p-1.5"
      data-testid="shelf-image"
    >
      <Thumb image={image} className="h-[72px] w-full border-solid" />
      <TextInput
        aria-label={S.imageNameOf(label)}
        value={image.name}
        onChange={(e) => renameImage(image.id, e.target.value)}
        className="h-7 text-xs"
      />
      <TextInput
        aria-label={S.imageCreditOf(label)}
        placeholder={S.imageCredit}
        value={image.credit}
        onChange={(e) => setImageCredit(image.id, e.target.value)}
        className="h-7 text-xs"
      />
      <div className="flex min-w-0 items-center justify-between gap-1 text-xs text-muted">
        {info}
        <IconButton
          label={S.deleteImage(label)}
          icon={<Trash2 />}
          size="sm"
          variant="ghost"
          onClick={() => void remove()}
        />
      </div>
    </li>
  );
}

function UrlDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!isImageUrl(url.trim())) {
      setError(S.urlBad);
      return;
    }
    if (addUrl(url)) {
      setUrl('');
      setError(null);
      onOpenChange(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.urlDialogTitle}
      size="sm"
      footer={
        <>
          <DialogClose>{S.urlCancel}</DialogClose>
          <Button variant="primary" onClick={submit}>
            {S.urlAdd}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={S.urlLabel} error={error ?? undefined}>
          <TextInput
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://"
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
          />
        </Field>
      </form>
    </Dialog>
  );
}

export function ShelfPanel() {
  const images = useDoc((s) => s.data.images);
  const [urlOpen, setUrlOpen] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.tabImages(images.length)} fixed description={S.shelfHelp}>
        <FileDrop
          multiple
          clickable
          accept={IMAGE_ACCEPT}
          filterByAccept={false}
          label={S.dropLabel}
          buttonLabel={S.dropButton}
          hint={S.dropHint}
          onFiles={(files) => void addFiles(files, 'shelf')}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" icon={<Link2 />} onClick={() => setUrlOpen(true)}>
            {S.addUrl}
          </Button>
          <Button
            size="sm"
            icon={<ListPlus />}
            disabled={!images.length}
            title={S.makeFromImagesHint}
            onClick={makeFromImages}
          >
            {S.makeFromImages}
          </Button>
        </div>
        <StatusLine area="shelf" />
        {images.length ? (
          <ul
            className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2 p-0"
            aria-label={S.shelfTitle}
          >
            {images.map((im) => (
              <ImageCell key={im.id} image={im} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{S.shelfEmpty}</p>
        )}
      </Section>
      <UrlDialog open={urlOpen} onOpenChange={setUrlOpen} />
    </div>
  );
}
