/**
 * 「圖片庫」分頁（規格 1.2）：拖放區、每張圖的縮圖、名稱、用在哪裡、大小、刪除。
 */
import { Trash2 } from 'lucide-react';
import { FileDrop, IconButton, Section, TextInput, useConfirm } from '@/ui';
import { addFiles, removeImage, renameImage, usesOf } from './actions';
import { viewsOf } from './derived';
import { isTooBig, type ShelfImage, sizeText } from './model';
import { IMAGE_ACCEPT, StatusLine, Thumb } from './parts';
import { useDoc, useUi } from './store';
import { S } from './strings';

function ImageCell({ image, use }: { image: ShelfImage; use: string | undefined }) {
  const confirm = useConfirm();
  const missing = useUi((s) => s.missing.has(image.asset));
  const big = isTooBig(image);
  const label = image.name || S.noNameRow;

  const remove = async () => {
    const names = usesOf(useDoc.getState().data, image.id);
    const ok = await confirm(
      names.length
        ? {
            title: S.deleteUsedTitle(label),
            description: (
              <span className="flex flex-col gap-1">
                <span>{names.join('、')}</span>
                <span>{S.deleteUsedAfter}</span>
              </span>
            ),
            confirmLabel: S.deleteConfirm,
            danger: true,
          }
        : { title: S.deleteTitle(label), confirmLabel: S.deleteConfirm, danger: true },
    );
    if (ok) removeImage(image.id);
  };

  return (
    <li
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface-2 p-1.5"
      data-testid="shelf-image"
    >
      <Thumb image={image} className="h-[84px] w-full border-solid" />
      <TextInput
        aria-label={S.imageNameOf(label)}
        value={image.name}
        onChange={(e) => renameImage(image.id, e.target.value)}
        className="h-7 text-xs"
      />
      <span
        className={`truncate text-xs ${use ? 'text-fg' : 'text-muted'}`}
        title={use ?? S.imageUnused}
        data-testid="image-use"
      >
        {use ?? S.imageUnused}
      </span>
      <div className="flex min-w-0 items-center justify-between gap-1 text-xs text-muted">
        <span
          className={missing || big ? 'truncate text-warning' : 'truncate'}
          data-testid="image-info"
        >
          {missing ? S.imageMissing : `${sizeText(image.size)}${big ? S.imageTooBig : ''}`}
        </span>
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

export function ShelfPanel() {
  const doc = useDoc((s) => s.data);
  const images = doc.images;
  /* 每張圖用在哪裡（第一個用到的地方）；×N 的複本共用原本名字的圖 */
  const owner = new Map<string, string>();
  for (const v of viewsOf(doc)) {
    const who = v.piece.imageName || v.piece.name || S.noNameRow;
    if (v.portrait && !owner.has(v.portrait.id)) owner.set(v.portrait.id, S.portraitOfName(who));
    for (const f of v.faces) {
      if (f.image && !owner.has(f.image.id)) owner.set(f.image.id, S.faceOfName(who, f.label));
    }
  }
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
        <StatusLine area="shelf" />
        {images.length ? (
          <ul
            className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2 p-0"
            aria-label={S.shelfTitle}
          >
            {images.map((im) => (
              <ImageCell key={im.id} image={im} use={owner.get(im.id)} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{S.shelfEmpty}</p>
        )}
      </Section>
    </div>
  );
}
