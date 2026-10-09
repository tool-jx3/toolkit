/**
 * 「說話者」分頁（規格 1.5）：每位說話者的名稱、其他寫法、立繪、差分、從圖片庫建立差分、效果差分；
 * 新增說話者；差分名稱加進標題。
 */
import { Plus, Trash2, UserPlus, Wand2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button, cn, Field, IconButton, Section, TextInput, Toggle, useConfirm } from '@/ui';
import {
  addFace,
  addSpeaker,
  makeEffect,
  makeFacesFromNames,
  removeFace,
  removeSpeaker,
  setOpts,
  updateFace,
  updateSpeaker,
} from './actions';
import { lookupOf } from './derived';
import { EFFECTS } from './effects';
import { isTooBig, type ShelfImage, type Speaker, sizeText } from './model';
import { ImageSelect, StatusLine, Thumb, useImageDrop } from './parts';
import { useDoc, useUi } from './store';
import { S } from './strings';

/** 把焦點移到剛新增的欄位（id 對上時） */
let focusNext: string | null = null;
export const requestFocus = (id: string): void => {
  focusNext = id;
};

function useAutoFocus(id: string) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusNext === id) {
      focusNext = null;
      ref.current?.focus();
    }
  });
  return ref;
}

function ImageWarning({ image }: { image: ShelfImage | null }) {
  const missing = useUi((s) => (image?.kind === 'file' ? s.missing.has(image.asset) : false));
  if (!image) return null;
  if (missing) return <p className="m-0 text-xs text-warning">{S.warnMissing(image.name)}</p>;
  if (isTooBig(image) && image.kind === 'file') {
    return (
      <p className="m-0 text-xs text-warning">{S.warnBig(image.name, sizeText(image.size))}</p>
    );
  }
  return null;
}

function DropThumb({
  image,
  onImage,
  className,
  title,
}: {
  image: ShelfImage | null;
  onImage: (id: string) => void;
  className: string;
  title: string;
}) {
  const drop = useImageDrop(onImage, 'speakers');
  return (
    <div {...drop.handlers} title={title} data-drop-target="" data-over={drop.over || undefined}>
      <Thumb
        image={image}
        className={cn(className, drop.over && 'border-solid border-accent bg-accent-soft')}
      />
    </div>
  );
}

function FaceRow({
  speaker,
  faceId,
  images,
}: {
  speaker: Speaker;
  faceId: string;
  images: readonly ShelfImage[];
}) {
  const face = speaker.faces.find((f) => f.id === faceId);
  const ref = useAutoFocus(faceId);
  const L = lookupOf(useDoc.getState().data);
  if (!face) return null;
  const img = L.image(face.imageId);
  const spName = speaker.name || S.speakerFallback;
  const setImage = (id: string | null) => updateFace(speaker.id, face.id, { imageId: id });
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)] items-start gap-2" data-testid="face-row">
      <DropThumb image={img} onImage={setImage} className="h-[52px] w-10" title={S.dropOnThumb} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <TextInput
            ref={ref}
            aria-label={S.faceLabelOf(spName)}
            placeholder={S.facePlaceholder}
            value={face.label}
            onChange={(e) => updateFace(speaker.id, face.id, { label: e.target.value })}
            className="flex-1"
          />
          <IconButton
            label={S.deleteFace(face.label)}
            icon={<Trash2 />}
            size="sm"
            variant="ghost"
            onClick={() => removeFace(speaker.id, face.id)}
          />
        </div>
        <ImageSelect
          images={images}
          value={face.imageId}
          onChange={setImage}
          label={S.faceImageOf(face.label)}
          area="speakers"
        />
        <ImageWarning image={img} />
      </div>
    </li>
  );
}

function SpeakerCard({ speaker, index }: { speaker: Speaker; index: number }) {
  const images = useDoc((s) => s.data.images);
  const fxBusy = useUi((s) => s.busy.fx);
  const missing = useUi((s) => s.missing);
  const confirm = useConfirm();
  const nameRef = useAutoFocus(speaker.id);
  const L = lookupOf(useDoc.getState().data);
  const img = L.image(speaker.imageId);
  const spName = speaker.name || S.speakerFallback;
  const setPortrait = (id: string | null) => updateSpeaker(speaker.id, { imageId: id });
  const fxReady = img?.kind === 'file' && !missing.has(img.asset);

  const remove = async () => {
    if (
      (speaker.imageId || speaker.faces.length) &&
      !(await confirm({
        title: S.deleteSpeakerTitle(speaker.name || S.noName),
        description: S.deleteSpeakerBody,
        confirmLabel: S.deleteConfirm,
        danger: true,
      }))
    ) {
      return;
    }
    removeSpeaker(speaker.id);
  };

  return (
    <li
      className="grid grid-cols-[64px_minmax(0,1fr)] gap-2.5 rounded-lg border border-border bg-surface-2 p-2.5"
      data-testid="speaker"
    >
      <DropThumb
        image={img}
        onImage={setPortrait}
        className="h-[84px] w-16"
        title={S.dropOnThumb}
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <Field label={S.speakerName}>
          <TextInput
            ref={nameRef}
            aria-label={S.speakerNameOf(index + 1)}
            value={speaker.name}
            onChange={(e) => updateSpeaker(speaker.id, { name: e.target.value })}
          />
        </Field>
        <Field label={S.speakerAliases}>
          <TextInput
            aria-label={S.speakerAliasesOf(spName)}
            value={speaker.aliases}
            placeholder={S.aliasesPlaceholder}
            onChange={(e) => updateSpeaker(speaker.id, { aliases: e.target.value })}
          />
        </Field>
        <div className="flex min-w-0 items-center gap-1.5">
          <ImageSelect
            images={images}
            value={speaker.imageId}
            onChange={setPortrait}
            label={S.portraitOf(spName)}
            area="speakers"
            className="flex-1"
          />
          <IconButton
            label={S.deleteSpeaker(index + 1)}
            icon={<Trash2 />}
            size="sm"
            variant="ghost"
            onClick={() => void remove()}
          />
        </div>
        <ImageWarning image={img} />

        <div className="mt-1 flex flex-col gap-1.5 border-t border-dashed border-border pt-2">
          <span className="text-xs font-medium text-muted">{S.facesTitle}</span>
          {speaker.faces.length ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {speaker.faces.map((f) => (
                <FaceRow key={f.id} speaker={speaker} faceId={f.id} images={images} />
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" icon={<Plus />} onClick={() => requestFocus(addFace(speaker.id))}>
              {S.addFace}
            </Button>
            <Button
              size="sm"
              icon={<Wand2 />}
              title={S.facesFromNamesHint(speaker.name || S.speakerFallback)}
              onClick={() => makeFacesFromNames(speaker.id)}
            >
              {S.facesFromNames}
            </Button>
          </div>
          <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-1 border-0 p-0">
            <legend className="float-left mr-1 p-0 text-xs text-muted">{S.effectsLabel}</legend>
            {EFFECTS.map((fx) => (
              <Button
                key={fx}
                size="sm"
                variant="ghost"
                disabled={!fxReady || fxBusy}
                aria-label={S.effectOf(S.effects[fx], spName)}
                onClick={() => void makeEffect(speaker.id, fx)}
              >
                {S.effects[fx]}
              </Button>
            ))}
          </fieldset>
          <p className="m-0 text-xs text-muted">{fxReady ? S.effectsHint : S.effectsDisabled}</p>
        </div>
      </div>
    </li>
  );
}

export function SpeakersPanel() {
  const speakers = useDoc((s) => s.data.speakers);
  const faceInTitle = useDoc((s) => s.data.opts.faceInTitle);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.speakersTitle} fixed description={S.speakersHelp}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.speakersTitle}>
          {speakers.map((sp, i) => (
            <SpeakerCard key={sp.id} speaker={sp} index={i} />
          ))}
        </ul>
        <StatusLine area="speakers" />
        <div>
          <Button icon={<UserPlus />} onClick={() => requestFocus(addSpeaker())}>
            {S.addSpeaker}
          </Button>
        </div>
        <Field label={S.faceInTitle} layout="inline" hint={S.faceInTitleHint}>
          <Toggle checked={faceInTitle} onCheckedChange={(v) => setOpts({ faceInTitle: v })} />
        </Field>
      </Section>
    </div>
  );
}
