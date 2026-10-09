/**
 * 基本資料分頁（規格 F09～F16）：姓名等 7 欄、頭像（選擇圖片 → 裁切；調整裁切、移除）、自訂欄。
 */
import { Crop, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { centeredCrop, type Rect } from '@/core/image';
import { Button, CropDialog, Field, FieldRow, ImageDrop, Notice, Section, TextInput } from '@/ui';
import { removePortrait, setPortrait, setPortraitCrop, updateSheet } from './actions';
import { TextAreaField, TextField } from './controls';
import { CUSTOM_LINES, type InfoKey, PORTRAIT_ASPECT, type Sheet } from './model';
import { usePortraitUrl } from './portrait';
import { assets, usePortraitWarning } from './store';
import { S, SHEET } from './strings';

interface Pending {
  file: Blob | null;
  bitmap: ImageBitmap;
  rect: Rect;
}

function PortraitField({ sheet }: { sheet: Sheet }) {
  const url = usePortraitUrl(sheet.portrait);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const warning = usePortraitWarning((s) => s.reason);

  const recrop = async () => {
    const p = sheet.portrait;
    if (!p) return;
    const bitmap = await assets.bitmap(p.assetId);
    if (bitmap) setPending({ file: null, bitmap, rect: p.crop });
    else setError(S.info.readFailed);
  };

  const confirm = async (rect: Rect) => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (!p.file) {
      setPortraitCrop(rect);
      return;
    }
    const r = await setPortrait(p.file, rect, sheet.id);
    if (!r.persisted) usePortraitWarning.setState({ reason: (r.reason as never) ?? 'unavailable' });
  };

  return (
    <Field label={S.info.portrait} hint={S.info.portraitHint}>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="checker flex h-20 w-[65px] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border"
            data-testid="portrait-thumb"
          >
            {url ? (
              <img src={url} alt={S.info.portrait} className="size-full object-cover" />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <ImageDrop
              compact
              paste="focus"
              label={S.info.drop}
              buttonLabel={S.info.choose}
              onImages={(imgs) => {
                const img = imgs[0];
                if (!img) return;
                setError(null);
                setPending({
                  file: img.file,
                  bitmap: img.bitmap,
                  rect: centeredCrop(img, PORTRAIT_ASPECT),
                });
              }}
              onError={() => setError(S.info.readFailed)}
            />
            {sheet.portrait ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<Crop />} onClick={() => void recrop()}>
                  {S.info.recrop}
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={removePortrait}>
                  {S.info.remove}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {warning ? <Notice tone="warning">{S.info.notSaved}</Notice> : null}
      </div>
      <CropDialog
        open={!!pending}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        image={pending?.bitmap ?? null}
        aspect={PORTRAIT_ASPECT}
        initialRect={pending?.rect}
        title={S.info.cropTitle}
        confirmLabel={S.info.cropApply}
        onConfirm={(rect) => void confirm(rect)}
      />
    </Field>
  );
}

export function InfoTab({ sheet }: { sheet: Sheet }) {
  const setInfo = (key: InfoKey) => (v: string) =>
    updateSheet((s) => {
      s.info[key] = v;
    });
  const I = SHEET.info;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.info.section} persistKey="coc-sheet:info" fixed>
        <TextField label={I.name} value={sheet.info.name} onChange={setInfo('name')} />
        <TextField label={I.player} value={sheet.info.player} onChange={setInfo('player')} />
        <TextField
          label={I.occupation}
          value={sheet.info.occupation}
          onChange={setInfo('occupation')}
        />
        <FieldRow columns={2}>
          <TextField
            label={I.age}
            value={sheet.info.age}
            onChange={setInfo('age')}
            placeholder={S.info.agePlaceholder}
          />
          <TextField label={I.sex} value={sheet.info.sex} onChange={setInfo('sex')} />
        </FieldRow>
        <FieldRow columns={2}>
          <TextField
            label={I.residence}
            value={sheet.info.residence}
            onChange={setInfo('residence')}
          />
          <TextField
            label={I.birthplace}
            value={sheet.info.birthplace}
            onChange={setInfo('birthplace')}
          />
        </FieldRow>
        <PortraitField sheet={sheet} />
      </Section>
      <Section title={S.info.custom} persistKey="coc-sheet:custom">
        <Field label={S.info.customTitle}>
          <TextInput
            value={sheet.custom.title}
            placeholder={SHEET.customTitle}
            onChange={(e) =>
              updateSheet((s) => {
                s.custom.title = e.target.value;
              })
            }
          />
        </Field>
        <TextAreaField
          label={S.info.customText}
          hint={S.info.customHint}
          rows={CUSTOM_LINES}
          value={sheet.custom.text}
          onChange={(v) =>
            updateSheet((s) => {
              s.custom.text = v;
            })
          }
        />
      </Section>
    </div>
  );
}
