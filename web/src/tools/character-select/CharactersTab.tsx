/**
 * 分頁 01「角色」（規格 1.3）：新增圖片、角色清單（名稱、替換、排序、複製、刪除、位置與縮放、兩種裁切範圍）、
 * 還原內建角色、全部刪除。
 */
import { ArrowDown, ArrowUp, Copy, ImagePlus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { pickFiles } from '@/core/files';
import {
  Button,
  Field,
  FieldRow,
  FileDrop,
  IconButton,
  NumberInput,
  Section,
  Slider,
  TextInput,
  ThumbnailList,
  useConfirm,
} from '@/ui';
import {
  addFiles,
  clearCharacters,
  duplicateCharacter,
  moveCharacter,
  removeCharacter,
  renameCharacter,
  reorderCharacter,
  replaceImage,
  restoreDemo,
  tuneCharacter,
} from './actions';
import { CropEditor, type CropTarget } from './CropEditor';
import { type Character, playerLabel, type Settings } from './model';
import { playbackPlayers } from './motion';
import { useSession, useSettings } from './store';
import { S } from './strings';
import { NextStep } from './widgets';

export const IMAGE_ACCEPT = 'image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.avif';

function Assigned({ s, index }: { s: Settings; index: number }) {
  const owners = playbackPlayers(s).filter((p) => s.players.targets[p] === index);
  if (!owners.length) return null;
  return (
    <span className="flex flex-wrap gap-1" title={S.chars.assigned}>
      {owners.map((p) => (
        <span
          key={p}
          className="inline-flex h-5 items-center rounded-full px-1.5 text-xs font-semibold text-[#061018]"
          style={{ background: s.players.colors[p] }}
          data-testid="assigned"
        >
          {playerLabel(s, p)}
        </span>
      ))}
    </span>
  );
}

function CharacterFields({
  c,
  index,
  count,
  s,
  disabled,
  onCrop,
  missing,
}: {
  c: Character;
  index: number;
  count: number;
  s: Settings;
  disabled: boolean;
  onCrop: (t: CropTarget) => void;
  /** 圖片讀不到（瀏覽器的資料被清掉） */
  missing: boolean;
}) {
  const replace = async () => {
    const [file] = await pickFiles({ accept: IMAGE_ACCEPT });
    if (file) void replaceImage(c.id, file);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="character-row">
      <TextInput
        value={c.name}
        onChange={(e) => renameCharacter(c.id, e.currentTarget.value)}
        maxLength={60}
        aria-label={S.chars.nameAria(index)}
        disabled={disabled}
        className="h-8"
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="tabular-nums">{S.chars.position(index, c.demo)}</span>
        <Assigned s={s} index={index} />
      </div>
      {missing ? (
        <p className="m-0 text-xs text-danger" role="status">
          {S.chars.missing}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          icon={<RefreshCw />}
          onClick={() => void replace()}
          disabled={disabled}
          aria-label={S.chars.replaceAria(c.name)}
        >
          {S.chars.replace}
        </Button>
        <IconButton
          size="sm"
          icon={<ArrowUp />}
          label={S.chars.actionAria(S.chars.up, c.name)}
          onClick={() => moveCharacter(index, -1)}
          disabled={disabled || index === 0}
        />
        <IconButton
          size="sm"
          icon={<ArrowDown />}
          label={S.chars.actionAria(S.chars.down, c.name)}
          onClick={() => moveCharacter(index, 1)}
          disabled={disabled || index === count - 1}
        />
        <IconButton
          size="sm"
          icon={<Copy />}
          label={S.chars.actionAria(S.chars.duplicate, c.name)}
          onClick={() => duplicateCharacter(index)}
          disabled={disabled}
        />
      </div>
      <Section title={S.chars.tune} defaultOpen={false} className="bg-surface-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => onCrop({ characterId: c.id, target: 'list' })}
            disabled={disabled}
          >
            {S.chars.cropList}
          </Button>
          <span className="text-xs text-muted">{S.chars.cropListState(!!c.listCrop)}</span>
        </div>
        <p className="m-0 text-xs text-muted">{S.chars.tuneHint}</p>
        <Field label={S.chars.scale}>
          <Slider
            value={c.scale}
            onChange={(v) => tuneCharacter(c.id, { scale: v })}
            min={0.1}
            max={5}
            step={0.01}
            unit="×"
            disabled={disabled}
          />
        </Field>
        <Field label={S.chars.offsetX}>
          <Slider
            value={c.offsetX}
            onChange={(v) => tuneCharacter(c.id, { offsetX: v })}
            min={-c.moveRangeX}
            max={c.moveRangeX}
            step={1}
            unit="%"
            disabled={disabled}
          />
        </Field>
        <Field label={S.chars.offsetY}>
          <Slider
            value={c.offsetY}
            onChange={(v) => tuneCharacter(c.id, { offsetY: v })}
            min={-c.moveRangeY}
            max={c.moveRangeY}
            step={1}
            unit="%"
            disabled={disabled}
          />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.chars.rangeX}>
            <NumberInput
              value={c.moveRangeX}
              onChange={(v) => tuneCharacter(c.id, { moveRangeX: v })}
              min={25}
              max={500}
              step={1}
              precision={0}
              disabled={disabled}
            />
          </Field>
          <Field label={S.chars.rangeY}>
            <NumberInput
              value={c.moveRangeY}
              onChange={(v) => tuneCharacter(c.id, { moveRangeY: v })}
              min={25}
              max={500}
              step={1}
              precision={0}
              disabled={disabled}
            />
          </Field>
        </FieldRow>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => onCrop({ characterId: c.id, target: 'main' })}
            disabled={disabled}
          >
            {S.chars.cropMain}
          </Button>
          <span className="text-xs text-muted">{S.chars.cropMainState(!!c.mainCrop)}</span>
        </div>
      </Section>
    </div>
  );
}

export function CharactersTab() {
  const s = useSettings((st) => st.data);
  const images = useSession((st) => st.images);
  const exporting = useSession((st) => st.exporting);
  const confirm = useConfirm();
  const [crop, setCrop] = useState<CropTarget | null>(null);
  const items = s.characters.map((c) => ({
    id: c.id,
    name: c.name,
    /* 讀不到的圖（資料被清掉）顯示破圖圖示 */
    image: c.image in images ? (images[c.image] ?? 'data:,') : null,
  }));
  return (
    <div className="flex flex-col gap-3">
      <Section
        title={S.chars.heading}
        fixed
        actions={
          <span
            className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted tabular-nums"
            data-testid="character-count"
          >
            {S.chars.count(s.characters.length)}
          </span>
        }
        description={S.chars.lead}
      >
        <FileDrop
          onFiles={(files) => void addFiles(files)}
          accept={IMAGE_ACCEPT}
          multiple
          filterByAccept={false}
          paste="document"
          clickable
          icon={<ImagePlus />}
          label={S.chars.dropLabel}
          buttonLabel={S.chars.dropButton}
          hint={S.chars.dropHint}
          disabled={exporting}
          aria-label={S.chars.dropLabel}
        />
        <ThumbnailList
          aria-label={S.chars.listAria}
          layout="list"
          thumbSize={72}
          items={items}
          onReorder={exporting ? undefined : reorderCharacter}
          onRemove={
            exporting
              ? undefined
              : (id) => removeCharacter(s.characters.findIndex((c) => c.id === id))
          }
          removeLabel={(it) => S.chars.actionAria(S.chars.remove, it.name)}
          empty={<p className="m-0 py-4 text-center text-sm text-muted">{S.chars.empty}</p>}
          renderFields={(_, i) => (
            <CharacterFields
              c={s.characters[i]}
              index={i}
              count={s.characters.length}
              s={s}
              disabled={exporting}
              onCrop={setCrop}
              missing={images[s.characters[i].image] === null}
            />
          )}
        />
        <Section title={S.chars.manage} defaultOpen={false} className="bg-surface-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<RotateCcw />}
              disabled={exporting}
              onClick={async () => {
                if (
                  s.characters.length &&
                  !(await confirm({
                    title: S.chars.restoreTitle,
                    description: S.chars.restoreText,
                  }))
                )
                  return;
                restoreDemo();
              }}
            >
              {S.chars.restore}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 />}
              disabled={exporting}
              onClick={async () => {
                if (
                  s.characters.length &&
                  !(await confirm({
                    title: S.chars.clearTitle,
                    description: S.chars.clearText,
                    danger: true,
                  }))
                )
                  return;
                clearCharacters();
              }}
            >
              {S.chars.clear}
            </Button>
          </div>
        </Section>
      </Section>
      <NextStep to="appearance" />
      <CropEditor value={crop} onClose={() => setCrop(null)} />
    </div>
  );
}
