/**
 * 設定欄：
 * - 類別與範本（證件／票券、範本縮圖）；
 * - 內容分頁：照片、欄位（下拉選單、重新產生編號、清空、填入範例）、收據品項、票上的欄位名稱（進階）；
 * - 樣式分頁：證件的深淺色、主題色、背景漸層、掛繩；票券的配色。
 */
import {
  Crop,
  Image as ImageIcon,
  ImagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useAssetImage } from '@/core/assets';
import { pickFiles } from '@/core/files';
import {
  Button,
  ColorField,
  Field,
  FileDrop,
  GestureScope,
  IconButton,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  TextInput,
  ThumbChoice,
  Toggle,
  useAdvancedMode,
  useToast,
} from '@/ui';
import { cn } from '@/ui/cn';
import { alpha } from './colors';
import { useFontTick } from './fonts';
import { type BatchNotice, loadPhotoFiles, openFrame } from './media';
import {
  CAPTION_MAX,
  captionOf,
  formatAmount,
  ID_ZOOM_MAX,
  ITEM_NAME_MAX,
  KINDS,
  type Kind,
  PRICE_DECIMALS,
  PRICE_RANGE,
  QTY_RANGE,
  receiptTotals,
  TICKET_ZOOM_MAX,
} from './model';
import { autoGradient, qrDensity } from './render';
import { LanyardField, PhotoFxControls } from './SfPanel';
import { useIdleValue } from './schedule';
import { SF_BLANKS, type SfBlankId } from './sf/defs';
import { SF_ZOOM_MAX } from './sf/model';
import {
  addItem,
  assets,
  canGenerate,
  clearFields,
  currentFields,
  currentPhoto,
  fieldValue,
  fillSample,
  gesture,
  patchItem,
  photoSlot,
  regenerate,
  regenerateAll,
  removeItem,
  removePhoto,
  resetCaption,
  resetPhotoPlace,
  setCaption,
  setIdPhotoFx,
  setIdStyle,
  setIdTemplate,
  setKind,
  setPhotoZoom,
  setReceiptPhoto,
  setSfBlank,
  setSfPhotoFx,
  setTheme,
  setTicketTemplate,
  setValue,
  TOOL_ID,
  useDoc,
} from './store';
import { S } from './strings';
import {
  type FieldDef,
  fieldMax,
  GRADIENT_PRESETS,
  ID_SWATCHES,
  ID_TEMPLATES,
  type IdTemplateId,
  idTemplate,
  QR_KEY,
  RECEIPT_CAPTIONS,
  RECEIPT_ITEM_MAX,
  TICKET_TEMPLATES,
  TICKET_THEMES,
  type TicketTemplateId,
  ticketTemplate,
} from './templates';
import { THUMB, THUMB_IDLE_MS, ThumbPainter, thumbRender } from './thumbs';

/** 一批檔案的結果：一則通知 */
export function useNotify() {
  const toast = useToast();
  return useCallback(
    (n: BatchNotice | null) => {
      if (n) toast({ title: n.title, description: n.description, tone: n.tone, replace: true });
    },
    [toast],
  );
}

/** 照片的選檔、拖放、貼上 */
export function usePhotoLoader() {
  const notify = useNotify();
  const load = useCallback(async (files: File[]) => notify(await loadPhotoFiles(files)), [notify]);
  const pick = useCallback(async () => {
    const files = await pickFiles({ accept: 'image/*' });
    if (files.length) await load(files);
  }, [load]);
  return { load, pick };
}

/** 調整範圍（照片讀不回來時通知） */
export function useOpenFrame() {
  const toast = useToast();
  return useCallback(() => {
    void openFrame().then((ok) => {
      if (!ok) toast({ title: S.photoMissing, tone: 'warning', replace: true });
    });
  }, [toast]);
}

/* ======================================================================
 * 類別與範本
 * ==================================================================== */

export function TemplateSection() {
  const kind = useDoc((s) => s.data.kind);
  const idT = useDoc((s) => s.data.idTemplate);
  const tkT = useDoc((s) => s.data.ticketTemplate);
  const sfT = useDoc((s) => s.data.sf.blank);
  /* 縮圖：內容停下之後才重畫、只畫看得到的、一個工作一張（打字時不卡，規格 F02） */
  const doc = useIdleValue(
    useDoc((s) => s.data),
    THUMB_IDLE_MS,
  );
  const photoId =
    kind === 'id' ? doc.idPhoto?.image.id : kind === 'sf' ? doc.sf.photo?.image.id : undefined;
  /* 縮圖用的照片（證件共用一張；讀好了才畫進縮圖） */
  const photo = useAssetImage(assets, photoId);
  /* 字型載好後重畫（縮圖用到的字型在畫的時候要求） */
  const tick = useFontTick();
  const painter = useMemo(() => new ThumbPainter(), []);
  useEffect(() => () => painter.dispose(), [painter]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重畫
  const version = useMemo(() => ({}), [doc, kind, photo.bitmap, tick]);
  useLayoutEffect(() => {
    painter.update(version, thumbRender(doc, kind, photo.bitmap));
  }, [painter, version, doc, kind, photo.bitmap]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version 換了就要重畫
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, value: string) => painter.paint(ctx, value),
    [painter, version],
  );
  return (
    <Section title={S.sectionTemplate} fixed>
      <Field label={S.kindLabel} hint={S.kindHints[kind]}>
        <Segmented<Kind>
          value={kind}
          onValueChange={setKind}
          options={KINDS.map((k) => ({ value: k, label: S.kinds[k] }))}
          fullWidth
        />
      </Field>
      <div data-testid="template-list" data-kind={kind}>
        {kind === 'id' ? (
          <ThumbChoice<string>
            aria-label={S.templateList(S.kinds.id)}
            value={idT}
            onValueChange={(v) => setIdTemplate(v as IdTemplateId)}
            options={ID_TEMPLATES.map((t) => ({
              value: t.id,
              label: t.name,
              description: t.description,
            }))}
            draw={draw}
            thumbWidth={THUMB.w}
            thumbHeight={THUMB.h}
            minItemWidth={92}
            frames={1}
            fps={1}
          />
        ) : kind === 'sf' ? (
          <ThumbChoice<string>
            aria-label={S.templateList(S.kinds.sf)}
            value={sfT}
            onValueChange={(v) => setSfBlank(v as SfBlankId)}
            options={SF_BLANKS.map((t) => ({
              value: t.id,
              label: t.name,
              description: t.description,
            }))}
            draw={draw}
            thumbWidth={THUMB.w}
            thumbHeight={THUMB.h}
            minItemWidth={92}
            frames={1}
            fps={1}
          />
        ) : (
          <ThumbChoice<string>
            aria-label={S.templateList(S.kinds.ticket)}
            value={tkT}
            onValueChange={(v) => setTicketTemplate(v as TicketTemplateId)}
            options={TICKET_TEMPLATES.map((t) => ({
              value: t.id,
              label: t.name,
              description: t.description,
            }))}
            draw={draw}
            thumbWidth={THUMB.w}
            thumbHeight={THUMB.h}
            minItemWidth={92}
            frames={1}
            fps={1}
          />
        )}
      </div>
    </Section>
  );
}

/* ======================================================================
 * 照片
 * ==================================================================== */

export function PhotoSection() {
  const doc = useDoc((s) => s.data);
  const slot = photoSlot(doc);
  const photo = currentPhoto(doc);
  const loader = usePhotoLoader();
  const frame = useOpenFrame();
  const isReceipt = doc.kind === 'ticket' && doc.ticketTemplate === 'receipt';
  const hasSlot = doc.kind !== 'ticket' || ticketTemplate(doc.ticketTemplate).photo;
  if (!hasSlot)
    return (
      <Section title={S.sectionPhoto} persistKey="id-ticket:photo">
        <p className="m-0 text-sm text-muted">{S.noPhotoSlot}</p>
      </Section>
    );
  const maxZoom =
    doc.kind === 'id' ? ID_ZOOM_MAX : doc.kind === 'sf' ? SF_ZOOM_MAX : TICKET_ZOOM_MAX;
  const name = photo?.image.name || '—';
  return (
    <Section
      title={S.sectionPhoto}
      persistKey="id-ticket:photo"
      description={
        doc.kind === 'id' ? S.photoShared : doc.kind === 'sf' ? S.sfPhotoShared : undefined
      }
    >
      {isReceipt ? (
        <Field label={S.receiptPhoto} hint={S.receiptPhotoHint} layout="inline">
          <Toggle checked={doc.receiptPhoto} onCheckedChange={setReceiptPhoto} />
        </Field>
      ) : null}
      {slot ? (
        <>
          <div data-testid="photo-load" data-state={photo ? 'loaded' : 'empty'}>
            <FileDrop
              aria-label={S.photoDrop}
              accept="image/*"
              paste="focus"
              multiple
              filterByAccept={false}
              compact={!!photo}
              icon={photo ? <ImageIcon /> : <ImagePlus />}
              label={
                photo ? (
                  <span className="flex min-w-0" data-testid="photo-name">
                    <span className="shrink-0">{S.currentPhoto}</span>
                    <span className="truncate" title={name}>
                      {name}
                    </span>
                  </span>
                ) : (
                  S.photoDrop
                )
              }
              hint={S.photoDropHint}
              buttonLabel={photo ? S.changePhoto : S.choosePhoto}
              onFiles={(files) => void loader.load(files)}
            />
          </div>
          <Field label={S.photoZoom}>
            <Slider
              value={Math.round((photo?.place.zoom ?? 1) * 100)}
              min={100}
              max={maxZoom * 100}
              step={1}
              unit="%"
              disabled={!photo}
              onChange={gesture.live((v: number) => setPhotoZoom(v / 100))}
              onCommit={gesture.commit}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={<Crop />} disabled={!photo} onClick={frame}>
              {S.photoFrame}
            </Button>
            <Button size="sm" icon={<RotateCcw />} disabled={!photo} onClick={resetPhotoPlace}>
              {S.photoReset}
            </Button>
            <Button size="sm" icon={<Trash2 />} disabled={!photo} onClick={removePhoto}>
              {S.photoRemove}
            </Button>
          </div>
          {doc.kind === 'id' ? (
            <PhotoFxControls fx={doc.idPhotoFx} onChange={setIdPhotoFx} />
          ) : doc.kind === 'sf' ? (
            <PhotoFxControls fx={doc.sf.style.photoFx} onChange={setSfPhotoFx} />
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

/* ======================================================================
 * 欄位
 * ==================================================================== */

const NONE = '__none__';

/** QR code 內容太長、太密時的提醒（門檻見 render 的 QR_MIN_MODULE_*） */
function qrDenseText(f: FieldDef, data: Parameters<typeof qrDensity>[0]): string {
  if (f.key !== QR_KEY) return '';
  const d = qrDensity(data);
  return d?.dense ? S.qrDense(d.module, d.unit) : '';
}

/** 一個欄位（只在自己的值改變時重畫：打字時其他欄位不跟著重畫） */
const FieldControl = memo(function FieldControl({ f }: { f: FieldDef }) {
  const value = useDoc((s) => fieldValue(f.key, s.data));
  const dense = useDoc((s) => qrDenseText(f, s.data));
  const suffix = canGenerate(f) ? (
    <IconButton
      size="sm"
      variant="ghost"
      label={S.regenerateLabel(f.label)}
      icon={<RefreshCw />}
      data-regen={f.key}
      onClick={() => regenerate(f.key)}
    />
  ) : undefined;
  return (
    <Field
      label={f.label}
      hint={
        dense ? (
          <>
            {f.hint}
            <span className="mt-1 block text-warning" data-testid="qr-dense">
              {dense}
            </span>
          </>
        ) : (
          f.hint
        )
      }
      labelSuffix={suffix}
      className={f.half ? '' : 'col-span-2'}
    >
      {f.options ? (
        <Select<string>
          value={value || NONE}
          onValueChange={(v) => setValue(f.key, v === NONE ? '' : v)}
          options={[
            { value: NONE, label: S.selectEmpty },
            ...f.options.map((o) => ({ value: o, label: o })),
          ]}
          data-field={f.key}
        />
      ) : (
        <TextInput
          value={value}
          data-field={f.key}
          placeholder={f.placeholder}
          maxLength={fieldMax(f) * 2}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => setValue(f.key, e.target.value)}
        />
      )}
    </Field>
  );
});

export function FieldsSection() {
  const doc = useDoc((s) => s.data);
  const fields = currentFields(doc);
  const toast = useToast();
  const hasGen = doc.kind === 'ticket' && fields.some((f) => f.gen);
  const tplKey =
    doc.kind === 'id' ? doc.idTemplate : doc.kind === 'sf' ? doc.sf.blank : doc.ticketTemplate;
  return (
    <Section
      title={S.sectionFields}
      persistKey="id-ticket:fields"
      description={S.fieldsHint}
      actions={
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearFields();
              toast({ title: S.clearFieldsDone, replace: true });
            }}
          >
            {S.clearFields}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              fillSample();
              toast({ title: S.fillSampleDone, replace: true });
            }}
          >
            {S.fillSample}
          </Button>
        </div>
      }
    >
      <div
        className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-3"
        data-testid="fields"
        data-template={tplKey}
      >
        {fields.map((f) => (
          <FieldControl key={`${tplKey}:${f.key}`} f={f} />
        ))}
      </div>
      {hasGen ? (
        <div className="flex flex-col gap-1">
          <Button size="sm" icon={<RefreshCw />} onClick={() => regenerateAll()}>
            {S.regenerateAll}
          </Button>
          <p className="m-0 text-xs text-muted">{S.regenerateAllHint}</p>
        </div>
      ) : null}
    </Section>
  );
}

/** 票上的欄位名稱（進階） */
export function CaptionsSection() {
  const doc = useDoc((s) => s.data);
  const [on, setOn] = useAdvancedMode(TOOL_ID);
  if (doc.kind !== 'ticket') return null;
  const tpl = ticketTemplate(doc.ticketTemplate);
  const keys: { key: string; label: string; def: string }[] = [
    ...tpl.fields
      .filter((f) => f.caption)
      .map((f) => ({ key: f.key, label: f.label, def: f.caption as string })),
    ...(tpl.id === 'receipt'
      ? Object.entries(RECEIPT_CAPTIONS).map(([key, def]) => ({
          key,
          label: S.captionNames[key] ?? key,
          def,
        }))
      : []),
  ];
  if (!keys.length) return null;
  return (
    <Section title={S.sectionCaptions} persistKey="id-ticket:captions" description={S.captionsHint}>
      <Toggle label={S.captionsToggle} checked={on} onCheckedChange={setOn} />
      {on ? (
        <div className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-3" data-testid="captions">
          {keys.map(({ key, label, def }) => {
            const own = doc.ticketCaptions[tpl.id]?.[key];
            return (
              <Field
                key={key}
                label={S.captionLabel(label)}
                labelSuffix={
                  own !== undefined ? (
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={`${S.captionReset}：${label}`}
                      icon={<Undo2 />}
                      onClick={() => resetCaption(key)}
                    />
                  ) : undefined
                }
              >
                <TextInput
                  value={captionOf(doc, tpl, key)}
                  placeholder={def}
                  data-caption={key}
                  maxLength={CAPTION_MAX * 2}
                  onFocus={gesture.begin}
                  onBlur={gesture.commit}
                  onChange={(e) => setCaption(key, e.target.value)}
                />
              </Field>
            );
          })}
        </div>
      ) : null}
    </Section>
  );
}

/* ======================================================================
 * 收據品項
 * ==================================================================== */

export function ItemsSection() {
  const doc = useDoc((s) => s.data);
  const toast = useToast();
  if (doc.kind !== 'ticket' || doc.ticketTemplate !== 'receipt') return null;
  const items = doc.receiptItems;
  const cur = doc.ticketValues.receipt.rc_currency ?? '';
  const t = receiptTotals(items, doc.ticketValues.receipt.rc_discount ?? '');
  const full = items.length >= RECEIPT_ITEM_MAX;
  return (
    <Section
      title={`${S.sectionItems}（${items.length}）`}
      persistKey="id-ticket:items"
      description={S.itemsHint(RECEIPT_ITEM_MAX)}
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="receipt-items">
        {items.map((it, i) => (
          <li
            key={it.id}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_4.5rem_6rem_auto] items-center gap-1.5"
            data-testid="receipt-item"
            onFocus={gesture.begin}
            onBlur={gesture.commit}
          >
            <TextInput
              aria-label={`${S.itemName} ${i + 1}`}
              value={it.name}
              data-item={it.id}
              maxLength={ITEM_NAME_MAX * 2}
              onChange={(e) => patchItem(it.id, { name: e.target.value })}
            />
            <NumberInput
              aria-label={`${S.itemQty} ${i + 1}`}
              value={it.qty}
              min={QTY_RANGE.min}
              max={QTY_RANGE.max}
              step={1}
              onChange={(v) => patchItem(it.id, { qty: v })}
            />
            <NumberInput
              aria-label={`${S.itemPrice} ${i + 1}`}
              value={it.price}
              min={PRICE_RANGE.min}
              max={PRICE_RANGE.max}
              step={1}
              precision={PRICE_DECIMALS}
              onChange={(v) => patchItem(it.id, { price: v })}
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={S.removeItem(it.name)}
              icon={<Trash2 />}
              onClick={() => removeItem(it.id)}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          size="sm"
          icon={<Plus />}
          disabled={full}
          onClick={() => {
            const id = addItem(S.newItemName);
            if (!id) {
              toast({ title: S.itemsFull(RECEIPT_ITEM_MAX), tone: 'warning', replace: true });
              return;
            }
            requestAnimationFrame(() => {
              const el = document.querySelector<HTMLInputElement>(
                `[data-item="${CSS.escape(id)}"]`,
              );
              el?.focus();
              el?.select();
            });
          }}
        >
          {S.addItem}
        </Button>
        <span className="text-xs text-muted tabular-nums" data-testid="receipt-totals">
          {S.totalsLine(
            `${cur}${formatAmount(t.subtotal)}`,
            formatAmount(t.discount),
            `${cur}${formatAmount(t.total)}`,
          )}
        </span>
      </div>
    </Section>
  );
}

/* ======================================================================
 * 樣式
 * ==================================================================== */

export function IdStyleSection() {
  const doc = useDoc((s) => s.data);
  const tpl = idTemplate(doc.idTemplate);
  const st = doc.idStyles[tpl.id];
  const auto = autoGradient(st.color);
  const g1 = st.g1 ?? auto[0];
  const g2 = st.g2 ?? auto[1];
  return (
    <>
      <Section title={S.sectionLook} persistKey="id-ticket:look">
        <Field label={S.theme}>
          <Segmented<'light' | 'dark'>
            value={st.dark ? 'dark' : 'light'}
            onValueChange={(v) => setIdStyle({ dark: v === 'dark' })}
            options={[
              { value: 'light', label: S.themeLight },
              { value: 'dark', label: S.themeDark },
            ]}
          />
        </Field>
        <Field label={S.color} hint={S.colorHint}>
          <div className="flex min-w-0 flex-col gap-2">
            <fieldset
              className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
              aria-label={`${S.color}：色票`}
            >
              {ID_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={st.color.toLowerCase() === c}
                  className={cn(
                    'focus-visible:focus-ring size-7 cursor-pointer rounded-full border border-border p-0',
                    st.color.toLowerCase() === c &&
                      'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                  )}
                  style={{ background: c }}
                  onClick={() => setIdStyle({ color: c })}
                />
              ))}
            </fieldset>
            <GestureScope gesture={gesture}>
              <ColorField
                aria-label={S.color}
                value={st.color}
                onChange={(c) => setIdStyle({ color: c })}
              />
            </GestureScope>
          </div>
        </Field>
        <LanyardField />
      </Section>
      {tpl.gradient ? (
        <Section
          title={S.sectionGradient}
          persistKey="id-ticket:gradient"
          description={S.gradientHint}
          actions={
            <Button
              size="sm"
              variant="ghost"
              disabled={st.g1 === null && st.g2 === null}
              onClick={() => setIdStyle({ g1: null, g2: null })}
            >
              {S.gradientAuto}
            </Button>
          }
        >
          <fieldset
            className="m-0 grid min-w-0 grid-cols-6 gap-1.5 border-0 p-0"
            aria-label={S.gradientPresets}
          >
            {GRADIENT_PRESETS.map(([a, b], i) => {
              const on = st.g1 === a && st.g2 === b;
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: 預設組合的順序固定
                  key={i}
                  type="button"
                  aria-label={S.gradientPreset(i + 1)}
                  aria-pressed={on}
                  className={cn(
                    'focus-visible:focus-ring h-8 cursor-pointer rounded-md border border-border p-0',
                    on && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                  )}
                  style={{ background: `linear-gradient(180deg, ${a}, ${b})` }}
                  onClick={() => setIdStyle({ g1: a, g2: b })}
                />
              );
            })}
          </fieldset>
          <GestureScope gesture={gesture}>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <Field label={S.gradientTop}>
                <ColorField value={g1} onChange={(c) => setIdStyle({ g1: c, g2 })} />
              </Field>
              <Field label={S.gradientBottom}>
                <ColorField value={g2} onChange={(c) => setIdStyle({ g1, g2: c })} />
              </Field>
            </div>
          </GestureScope>
          <div
            aria-hidden
            className="h-3 rounded-sm border border-border"
            style={{ background: `linear-gradient(90deg, ${g1}, ${g2})` }}
          />
        </Section>
      ) : null}
    </>
  );
}

export function TicketStyleSection() {
  const theme = useDoc((s) => s.data.theme);
  return (
    <Section title={S.sectionPalette} persistKey="id-ticket:palette" description={S.paletteHint}>
      <fieldset
        className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
        aria-label={S.palettePresets}
      >
        {TICKET_THEMES.map((t) => {
          const on = theme.c1 === t.c1 && theme.c2 === t.c2;
          return (
            <button
              key={t.name}
              type="button"
              aria-label={t.name}
              title={t.name}
              aria-pressed={on}
              className={cn(
                'focus-visible:focus-ring size-8 cursor-pointer rounded-full border border-border p-0',
                on && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
              )}
              style={{ background: `linear-gradient(135deg, ${t.c1}, ${t.c2})` }}
              onClick={() => setTheme({ c1: t.c1, c2: t.c2 })}
            />
          );
        })}
      </fieldset>
      <GestureScope gesture={gesture}>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <Field label={S.c1}>
            <ColorField value={theme.c1} onChange={(c) => setTheme({ c1: c })} />
          </Field>
          <Field label={S.c2}>
            <ColorField value={theme.c2} onChange={(c) => setTheme({ c2: c })} />
          </Field>
        </div>
      </GestureScope>
      <div
        aria-hidden
        className="h-3 rounded-sm border border-border"
        style={{
          background: `linear-gradient(90deg, ${theme.c1}, ${theme.c2}, ${alpha(theme.c2, 0.6)})`,
        }}
      />
    </Section>
  );
}
