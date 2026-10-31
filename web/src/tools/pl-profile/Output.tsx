/**
 * 輸出（規格 F30～F41）：圖片的預覽與下載、純文字、分享連結。編輯畫面與唯讀檢視共用 ImagesPreview、TextOutput。
 */
import { Copy, Download, Link2, Maximize2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAssetImage } from '@/core/assets';
import { copyImage, downloadBlob, safeFileName } from '@/core/files';
import { canvasToBlob } from '@/core/image';
import { shareTooLong } from '@/core/share';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  Field,
  Segmented,
  TextOutputPanel,
  useToast,
} from '@/ui';
import { ShareLinkDialog } from '@/ui/InteractiveHtmlDialog';
import type { ProfileData } from './model';
import {
  type AvatarSource,
  type CardImage,
  canvasMeasure,
  exportSize,
  type ImageKind,
  imageText,
  layoutImages,
  loadImageFonts,
  MAX_IMAGE_PIXELS,
  measureContext,
  paintImage,
  renderImage,
} from './render';
import { SHARE_MAX_LENGTH, shareUrlFor } from './share';
import { assets, type OutputView, useProfile, useView } from './store';
import { S } from './strings';
import { type TextStyle, toText } from './text';

/** 預覽 canvas 的倍率（下載用 look.scale 重畫） */
const PREVIEW_SCALE = 1.5;

/** 頭像的圖片（編輯畫面；唯讀檢視沒有頭像） */
export function useAvatarSource(d: ProfileData): AvatarSource | null {
  const avatar = d.profile.avatar;
  const { bitmap } = useAssetImage(assets, avatar?.id);
  return useMemo(
    () =>
      avatar && bitmap
        ? {
            image: bitmap,
            width: avatar.width,
            height: avatar.height,
            placement: d.profile.avatarPlacement,
          }
        : null,
    [avatar, bitmap, d.profile.avatarPlacement],
  );
}

/** 排版（字型載入後重排一次：量字寬會變） */
export function useCardImages(d: ProfileData): CardImage[] {
  const [fontTick, setFontTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 字型載入後（fontTick）要重新量字寬
  const images = useMemo(() => layoutImages(d, canvasMeasure(measureContext())), [d, fontTick]);
  const chars = useMemo(() => imageText(images), [images]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 用到的字（chars）變了才載入；images 只是拿來交給載入函式
  useEffect(() => {
    let alive = true;
    void loadImageFonts(images).then(() => {
      if (alive) setFontTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [chars]);
  return images;
}

export const imageName = (kind: ImageKind): string => S.output.imageNames[kind];

export function imageFileName(d: ProfileData, kind: ImageKind): string {
  const nick = d.profile.nickname.trim();
  const base = nick ? `${nick}_${imageName(kind)}` : imageName(kind);
  return `${safeFileName(base, { fallback: imageName(kind) })}.png`;
}

function PreviewCanvas({
  image,
  avatar,
  scale,
  testId,
}: {
  image: CardImage;
  avatar: AvatarSource | null;
  scale: number;
  testId?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const el = ref.current;
      const ctx = el?.getContext('2d');
      if (!el || !ctx) return;
      const size = exportSize(image, scale);
      el.width = size.width;
      el.height = size.height;
      paintImage(ctx, image, size.scale, avatar);
      el.dataset.painted = String(Number(el.dataset.painted ?? '0') + 1);
    }, 60);
    return () => clearTimeout(t);
  }, [image, avatar, scale]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={S.output.previewAria(imageName(image.kind))}
      data-testid={testId}
      data-kind={image.kind}
      data-width={image.width}
      data-height={image.height}
      className="mx-auto block h-auto w-full rounded-md shadow-1"
      style={{ maxWidth: image.width }}
    />
  );
}

/** 圖片的預覽＋下載（每張一個下載鈕；兩張時多一個全部下載） */
export function ImagesPreview({
  data,
  avatar,
}: {
  data: ProfileData;
  avatar: AvatarSource | null;
}) {
  const images = useCardImages(data);
  const toast = useToast();
  const [zoom, setZoom] = useState<ImageKind | null>(null);
  const scale = data.look.scale;

  const render = async (image: CardImage) => {
    await loadImageFonts([image]);
    /* 字型載入後重新排版（量字寬），再畫 */
    const fresh =
      layoutImages(data, canvasMeasure(measureContext())).find((x) => x.kind === image.kind) ??
      image;
    return renderImage(fresh, scale, avatar);
  };
  const save = async (image: CardImage) => {
    try {
      const canvas = await render(image);
      const name = imageFileName(data, image.kind);
      downloadBlob(await canvasToBlob(canvas), name);
      toast({ title: S.toast.downloaded, description: name, tone: 'success' });
    } catch (e) {
      toast({
        title: S.toast.exportFailed,
        description: e instanceof Error ? e.message : String(e),
        tone: 'danger',
      });
    }
  };
  const saveAll = async () => {
    for (const im of images) {
      await save(im);
      await new Promise((r) => setTimeout(r, 600));
    }
  };
  const copy = async (image: CardImage) => {
    const r = await copyImage(render(image).then((c) => canvasToBlob(c)));
    toast(
      r.ok
        ? { title: S.toast.copiedImage, tone: 'success' }
        : { title: S.toast.copyImageFailed, description: S.toast.copyImageHint, tone: 'warning' },
    );
  };
  const zoomed = zoom ? images.find((x) => x.kind === zoom) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {images.length > 1 ? (
        <Button
          variant="primary"
          icon={<Download />}
          onClick={() => void saveAll()}
          className="self-start"
        >
          {S.output.downloadAll}
        </Button>
      ) : null}
      {images.map((im) => {
        const out = exportSize(im, scale);
        const reduced = out.scale < scale - 1e-9;
        return (
          <figure key={im.kind} className="m-0 flex flex-col gap-2" data-image={im.kind}>
            {/* 窄畫面（預覽在設定上面）：長的圖在框裡捲動，不把設定推得太下面 */}
            <div className="max-h-[min(70dvh,900px)] overflow-auto rounded-md lg:max-h-none lg:overflow-visible">
              <PreviewCanvas
                image={im}
                avatar={avatar}
                scale={PREVIEW_SCALE}
                testId="card-preview"
              />
            </div>
            <figcaption className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-xs text-muted tabular-nums" data-testid="image-size">
                {imageName(im.kind)}・{S.output.size(out.width, out.height)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={<Maximize2 />}
                onClick={() => setZoom(im.kind)}
              >
                {S.output.zoom}
              </Button>
              <Button size="sm" icon={<Copy />} onClick={() => void copy(im)}>
                {S.output.copyImage}
              </Button>
              <Button
                size="sm"
                variant={images.length > 1 ? 'secondary' : 'primary'}
                icon={<Download />}
                onClick={() => void save(im)}
              >
                {S.output.download(imageName(im.kind))}
              </Button>
            </figcaption>
            {reduced ? (
              <p className="m-0 text-xs text-warning" data-testid="image-reduced">
                {S.output.reduced(MAX_IMAGE_PIXELS)}
              </p>
            ) : null}
          </figure>
        );
      })}
      <Dialog
        open={!!zoomed}
        onOpenChange={(o) => {
          if (!o) setZoom(null);
        }}
        title={S.output.zoomTitle}
        size="xl"
        footer={<DialogClose />}
      >
        {zoomed ? <PreviewCanvas image={zoomed} avatar={avatar} scale={2} /> : null}
      </Dialog>
    </div>
  );
}

/** 純文字（選項存在 useView；唯讀檢視也用） */
export function TextOutput({ data }: { data: ProfileData }) {
  const v = useView((s) => s.data);
  const patch = useView((s) => s.patch);
  const text = toText(data, {
    style: v.textStyle,
    profile: v.textProfile,
    jirai: v.textJirai,
    issuesOnly: v.textIssuesOnly,
  });
  return (
    <div className="flex flex-col gap-3">
      <Field
        label={S.output.textStyle}
        hint={v.textStyle === 'discord' ? S.output.textHint : undefined}
      >
        <Segmented<TextStyle>
          value={v.textStyle}
          onValueChange={(x) => patch({ textStyle: x })}
          options={[
            { value: 'plain', label: S.output.textStyles.plain },
            { value: 'discord', label: S.output.textStyles.discord },
          ]}
          size="sm"
        />
      </Field>
      <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-2 border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-medium text-fg">{S.output.textParts}</legend>
        <Checkbox
          checked={v.textProfile}
          onCheckedChange={(x) => patch({ textProfile: x })}
          label={S.output.textProfile}
        />
        <Checkbox
          checked={v.textJirai}
          onCheckedChange={(x) => patch({ textJirai: x })}
          label={S.output.textJirai}
        />
        <Checkbox
          checked={v.textIssuesOnly}
          disabled={!v.textJirai}
          onCheckedChange={(x) => patch({ textIssuesOnly: x })}
          label={S.output.textIssuesOnly}
        />
      </fieldset>
      <TextOutputPanel
        text={text}
        title={S.output.formats.text}
        count={(t) => S.output.chars(Array.from(t).length)}
        placeholder={S.output.textEmpty}
        messages={{ empty: S.output.textEmpty }}
      />
    </div>
  );
}

function ShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const data = useProfile((s) => s.data);
  const url = useMemo(() => {
    if (!open) return null;
    const base = `${location.origin}${location.pathname}${location.search}`;
    return shareUrlFor(data, base);
  }, [open, data]);
  return (
    <ShareLinkDialog
      open={open}
      onOpenChange={onOpenChange}
      strings={{
        title: S.share.title,
        lead: S.share.lead,
        note: S.share.note,
        generating: S.share.generating,
        tooLong: S.share.tooLong,
        link: S.share.link,
        copy: S.share.copy,
        copied: S.share.copied,
        count: S.share.count,
        open: S.share.open,
      }}
      url={url}
      tooLong={url !== null && shareTooLong(new URL(url).hash, SHARE_MAX_LENGTH)}
      maxLength={SHARE_MAX_LENGTH}
      data-testid="share-dialog"
    />
  );
}

/** 編輯畫面的輸出區 */
export function OutputPanel() {
  const data = useProfile((s) => s.data);
  const view = useView((s) => s.data.output);
  const patch = useView((s) => s.patch);
  const avatar = useAvatarSource(data);
  const [share, setShare] = useState(false);
  const openShare = useCallback(() => setShare(true), []);
  return (
    <section aria-label={S.output.title} className="flex flex-col gap-3" data-testid="output">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<OutputView>
          aria-label={S.output.formatAria}
          value={view}
          onValueChange={(v) => patch({ output: v })}
          options={[
            { value: 'image', label: S.output.formats.image },
            { value: 'text', label: S.output.formats.text },
          ]}
          size="sm"
        />
        <Button size="sm" icon={<Link2 />} onClick={openShare} className="ml-auto">
          {S.output.share}
        </Button>
      </div>
      {view === 'image' ? (
        <ImagesPreview data={data} avatar={avatar} />
      ) : (
        <TextOutput data={data} />
      )}
      <ShareDialog open={share} onOpenChange={setShare} />
    </section>
  );
}
