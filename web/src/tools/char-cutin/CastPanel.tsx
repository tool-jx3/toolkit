/**
 * 演員（規格 F02～F19）：放進立繪、清單（選取、拖曳或 Alt＋↑／↓ 排序、上移下移、拿掉、點縮圖或把圖拖到那一列換圖）、
 * ROUND 編號；選取的演員的名字、小標題、台詞、大小、臉的位置、代表色。
 */
import { ArrowDown, ArrowUp, Crosshair, ImageUp, ListOrdered, Trash2, X } from 'lucide-react';
import { type DragEvent, useState } from 'react';
import { useAssetBitmaps } from '@/core/assets';
import { pickFiles } from '@/core/files';
import {
  Button,
  ColorField,
  cn,
  Field,
  IconButton,
  ImageDrop,
  Notice,
  Section,
  Segmented,
  Slider,
  SortableList,
  TextInput,
  ThumbnailImage,
} from '@/ui';
import {
  addFiles,
  numberRounds,
  realign,
  removeActor,
  reorder,
  replaceImage,
  select,
  setActor,
} from './actions';
import { type Actor, clipChars, MAIN_SWATCHES, MAX_CHARS, RANGES } from './model';
import { seq2 } from './names';
import { assets, gesture, useDoc, usePrefs, useUi } from './store';
import { S } from './strings';

export const IMAGE_ACCEPT = 'image/png,image/webp,image/jpeg';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

async function chooseReplacement(id: string) {
  const [file] = await pickFiles({ accept: IMAGE_ACCEPT });
  if (file) await replaceImage(id, file);
}

function Row({
  actor,
  index,
  count,
  thumb,
  missing,
  isRival,
  selected,
}: {
  actor: Actor;
  index: number;
  count: number;
  thumb: ImageBitmap | undefined;
  missing: boolean;
  isRival: boolean;
  selected: boolean;
}) {
  const [over, setOver] = useState(false);
  const label = actor.name || S.unnamed;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 只接住拖到這一列的圖（換圖；鍵盤用縮圖按鈕）
    <div
      className={cn('flex items-center gap-2 p-1.5', over && 'rounded-md ring-2 ring-accent')}
      data-testid="cast-row"
      data-selected={selected || undefined}
      title={S.rowDropHint}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) void replaceImage(actor.id, file);
      }}
    >
      <span className="w-6 shrink-0 text-right font-mono text-xs text-muted tabular-nums">
        {seq2(index + 1)}
      </span>
      <button
        type="button"
        className="checker relative size-12 shrink-0 overflow-hidden rounded-sm border border-border focus-ring"
        aria-label={S.rowReplace(label)}
        onClick={(e) => {
          e.stopPropagation();
          void chooseReplacement(actor.id);
        }}
      >
        {missing ? (
          <span className="flex size-full items-center justify-center text-danger">
            <X aria-hidden className="size-5" />
          </span>
        ) : (
          <ThumbnailImage source={thumb ?? null} />
        )}
      </button>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium" data-testid="cast-name">
            {label}
          </span>
          {actor.color ? (
            <span
              className="size-3 shrink-0 rounded-full border border-border-strong"
              style={{ background: actor.color }}
              title={S.colorBadge}
              aria-label={S.colorBadge}
              role="img"
            />
          ) : null}
        </span>
        <span className="truncate text-xs text-muted">
          {isRival ? `${S.rivalBadge}　` : ''}
          {actor.tag}
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        <IconButton
          size="sm"
          variant="ghost"
          label={S.rowUp(label)}
          icon={<ArrowUp />}
          disabled={index === 0}
          onClick={(e) => {
            e.stopPropagation();
            reorder(index, index - 1);
          }}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.rowDown(label)}
          icon={<ArrowDown />}
          disabled={index === count - 1}
          onClick={(e) => {
            e.stopPropagation();
            reorder(index, index + 1);
          }}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.rowRemove(label)}
          icon={<Trash2 />}
          onClick={(e) => {
            e.stopPropagation();
            removeActor(actor.id);
          }}
        />
      </span>
    </div>
  );
}

export function CastSection() {
  const actors = useDoc((s) => s.data.actors);
  const rival = useDoc((s) => (s.data.kind === 'versus' ? s.data.rival : null));
  const selected = usePrefs((s) => s.data.selected);
  const missing = useUi((u) => u.missing);
  const status = useUi((u) => u.castStatus);
  const { bitmaps } = useAssetBitmaps(
    assets,
    actors.map((a) => a.image),
  );
  const current = actors.find((a) => a.id === selected)?.id ?? actors[0]?.id ?? null;
  return (
    <Section title={S.castTitle} persistKey="char-cutin:cast">
      <ImageDrop
        multiple
        accept={IMAGE_ACCEPT}
        onFiles={(files) => void addFiles(files)}
        label={S.dropLabel}
        hint={S.dropHint}
        compact
      />
      <SortableList
        aria-label={S.castList}
        items={actors}
        getId={(a) => a.id}
        selectedId={current}
        onSelect={select}
        onMove={reorder}
        onMoveStart={gesture.begin}
        onMoveEnd={gesture.commit}
        empty={S.castEmpty}
        renderItem={(a, st) => (
          <Row
            actor={a}
            index={st.index}
            count={actors.length}
            thumb={bitmaps.get(a.image)}
            missing={missing.has(a.image)}
            isRival={rival === a.id}
            selected={st.selected}
          />
        )}
      />
      <div className="flex flex-col gap-1">
        <Button
          size="sm"
          icon={<ListOrdered />}
          disabled={!actors.length}
          onClick={numberRounds}
          className="self-start"
        >
          {S.numberRounds}
        </Button>
        <p className="m-0 text-xs text-muted">{S.numberRoundsHint}</p>
      </div>
      {status ? (
        <Notice key={status.seq} tone={status.tone}>
          <span data-testid="cast-status">{status.text}</span>
        </Notice>
      ) : null}
    </Section>
  );
}

/** 文字欄：打字中即時更新、離開欄位才記一步復原；超過字數就截掉 */
function TextField({
  label,
  hint,
  value,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  max: number;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <TextInput
        value={value}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => onChange(clipChars(e.target.value.replace(/[\r\n]+/g, ' '), max))}
      />
    </Field>
  );
}

export function ActorSection() {
  const actors = useDoc((s) => s.data.actors);
  const selected = usePrefs((s) => s.data.selected);
  const main = useDoc((s) => s.data.styles[s.data.kind].main);
  const missing = useUi((u) => u.missing);
  const a = actors.find((x) => x.id === selected) ?? actors[0];
  if (!a) return null;
  const R = RANGES;
  return (
    <Section title={S.editTitle} persistKey="char-cutin:actor">
      {missing.has(a.image) ? <Notice tone="danger">{S.missingImage}</Notice> : null}
      <TextField
        label={S.fName}
        value={a.name}
        max={MAX_CHARS.name}
        onChange={(v) => setActor(a.id, 'name', v)}
      />
      <TextField
        label={S.fTag}
        hint={S.fTagHint}
        value={a.tag}
        max={MAX_CHARS.tag}
        onChange={(v) => setActor(a.id, 'tag', v)}
      />
      <TextField
        label={S.fQuote}
        value={a.quote}
        max={MAX_CHARS.quote}
        onChange={(v) => setActor(a.id, 'quote', v)}
      />
      <Field label={S.fScale}>
        <Slider
          value={a.scale}
          min={R.scale.min}
          max={R.scale.max}
          step={R.scale.step}
          unit="%"
          onChange={gesture.live((v) => setActor(a.id, 'scale', v))}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.fEyeY} hint={S.fEyeYHint}>
        <Slider
          value={a.eyeY}
          min={R.eyeY.min}
          max={R.eyeY.max}
          step={R.eyeY.step}
          precision={1}
          unit="%"
          onChange={gesture.live((v) => setActor(a.id, 'eyeY', v))}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.fEyeX}>
        <Slider
          value={a.eyeX}
          min={R.eyeX.min}
          max={R.eyeX.max}
          step={R.eyeX.step}
          precision={1}
          unit="%"
          onChange={gesture.live((v) => setActor(a.id, 'eyeX', v))}
          onCommit={gesture.commit}
        />
      </Field>
      <Button
        size="sm"
        icon={<Crosshair />}
        className="self-start"
        disabled={missing.has(a.image)}
        onClick={() => void realign(a.id)}
      >
        {S.realign}
      </Button>
      <Field label={S.fColor} hint={S.fColorHint}>
        <Segmented
          value={a.color ? 'own' : 'same'}
          onValueChange={(v) => setActor(a.id, 'color', v === 'own' ? (a.color ?? main) : null)}
          options={[
            { value: 'same', label: S.colorSame },
            { value: 'own', label: S.colorOwn },
          ]}
        />
      </Field>
      {a.color ? (
        <Field label={S.fColorPick}>
          <ColorField
            value={a.color}
            swatches={MAIN_SWATCHES}
            onChange={(v) => setActor(a.id, 'color', v.slice(0, 7))}
          />
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<ImageUp />} onClick={() => void chooseReplacement(a.id)}>
          {S.replace}
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => removeActor(a.id)}>
          {S.remove}
        </Button>
      </div>
    </Section>
  );
}
