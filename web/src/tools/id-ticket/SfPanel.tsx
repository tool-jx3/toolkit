/**
 * SF 證件的設定欄（規格 1.11～1.15）：
 * - 內容分頁：執照（12 格、改名稱與圖示）、證件上的欄位名稱（進階）；
 * - 樣式分頁：配色、裝飾、照片框、條碼的種類、掛繩、浮水印、裝飾圖；
 * - 照片效果（SF 證件與既有的證件共用）、掛繩的選擇（證件與 SF 證件共用）、裁切對話框。
 */
import {
  ArrowDown,
  ArrowUp,
  Crop,
  Crosshair,
  ImagePlus,
  Pencil,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAssetBitmaps, useAssetImage } from '@/core/assets';
import { pickFiles } from '@/core/files';
import {
  Button,
  ColorField,
  Dialog,
  Field,
  FileDrop,
  GestureScope,
  IconButton,
  Section,
  Segmented,
  Select,
  Slider,
  TextInput,
  ThumbnailList,
  Toggle,
  useAdvancedMode,
  useToast,
} from '@/ui';
import { CropDialog } from '@/ui/CropDialog';
import { cn } from '@/ui/cn';
import { LANYARD_MODES, type LanyardMode } from './lanyard';
import {
  PHOTO_DOT_RANGE,
  PHOTO_FX_IDS,
  PHOTO_LEVEL_RANGE,
  type PhotoFx,
  type PhotoFxId,
} from './photofx';
import {
  SF_CAPTION_LABELS,
  SF_CAPTIONS,
  SF_SCHEMES,
  type SfDecor,
  sfBlank,
  sfCaptionMax,
} from './sf/defs';
import { drawLicenseShapes, licenseCaption } from './sf/draw';
import { SF_FRAME_IDS, SF_FRAME_LABELS, type SfFrameId } from './sf/frames';
import { LICENSE_CAP_MAX, LICENSES } from './sf/licenses';
import {
  applyElementCrop,
  applyLicenseCrop,
  closeCrop,
  cropElement,
  cropLicenseIcon,
  cropToRect,
  loadElementFiles,
  loadLicenseIcon,
  loadWatermarkImage,
  rectToCrop,
} from './sf/media';
import {
  ELEMENT_SIZE_RANGE,
  SF_ELEMENT_MAX,
  type SfCodeType,
  type WatermarkMode,
  type WatermarkTone,
  WM_RANGES,
  WM_TEXT_MAX,
} from './sf/model';
import { sfCodeDensity } from './sf/render';
import {
  assets,
  currentElements,
  gesture,
  moveElement,
  patchElement,
  removeElement,
  resetLicense,
  resetSfCaption,
  setLicenseCap,
  setPrefs,
  setSfCaption,
  setSfStyle,
  setWatermark,
  TOOL_ID,
  toggleLicense,
  useDoc,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';

/* ======================================================================
 * 共用：照片效果、掛繩
 * ==================================================================== */

export function PhotoFxControls({
  fx,
  onChange,
  disabled,
}: {
  fx: PhotoFx;
  onChange: (patch: Partial<PhotoFx>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="photo-fx">
      <Field label={S.photoFx} hint={S.photoFxHints[fx.fx]}>
        <Segmented<PhotoFxId>
          value={fx.fx}
          onValueChange={(v) => onChange({ fx: v })}
          options={PHOTO_FX_IDS.map((id) => ({ value: id, label: S.photoFxs[id] }))}
          fullWidth
          disabled={disabled}
        />
      </Field>
      {fx.fx !== 'none' ? (
        <Field label={S.photoLevel}>
          <Slider
            value={fx.level}
            min={PHOTO_LEVEL_RANGE.min}
            max={PHOTO_LEVEL_RANGE.max}
            step={1}
            onChange={gesture.live((v: number) => onChange({ level: v }))}
            onCommit={gesture.commit}
          />
        </Field>
      ) : null}
      {fx.fx === 'halftone' ? (
        <Field label={S.photoDot}>
          <Slider
            value={fx.dot}
            min={PHOTO_DOT_RANGE.min}
            max={PHOTO_DOT_RANGE.max}
            step={1}
            unit="px"
            onChange={gesture.live((v: number) => onChange({ dot: v }))}
            onCommit={gesture.commit}
          />
        </Field>
      ) : null}
    </div>
  );
}

/** 掛繩：只在預覽／不要／掛繩孔／掛繩孔＋掛繩（不列入復原） */
export function LanyardField({ note }: { note?: string }) {
  const mode = usePrefs((p) => p.data.lanyard);
  return (
    <Field
      label={S.strap}
      hint={
        <>
          {S.lanyardHints[mode]}
          {note ? ` ${note}` : ''}
        </>
      }
    >
      <Select<LanyardMode>
        value={mode}
        onValueChange={(v) => setPrefs({ lanyard: v })}
        options={LANYARD_MODES.map((m) => ({ value: m, label: S.lanyardModes[m] }))}
        aria-label={S.strap}
        data-testid="lanyard"
      />
    </Field>
  );
}

/**
 * SF 證件的碼太密的提醒（給「編號」或「QR code 內容」欄位；匯出時每格不到 1.5 px，規格 D39、D40 修訂）：
 * 條碼的提醒放在編號的欄位、QR code 的放在 QR code 內容的欄位；不是 SF 證件、不密時空字串。
 */
export function useSfCodeDense(key: string): string {
  const sf = useDoc((s) => (s.data.kind === 'sf' ? s.data.sf : null));
  const box = useUi((u) => u.sfCode);
  const k = usePrefs((p) => p.data.sfScale);
  if (!sf) return '';
  const d = sfCodeDensity(sf, box, k);
  if (!d?.dense) return '';
  if (d.kind === 'qr' ? key !== 'qr' : key !== sfBlank(sf.blank).codeKey) return '';
  return S.sfCodeDense(d.kind, d.module, k);
}

/* ======================================================================
 * 內容：執照
 * ==================================================================== */

/** 執照的圖示（設定欄的格子用；自訂的圖示照實際裁切畫） */
function LicenseGlyph({ shapesKey, on }: { shapesKey: string; on: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const icon = useDoc((s) => s.data.sf.licenseIcons[shapesKey]);
  const img = useAssetImage(assets, icon?.image.id);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on 改了按鈕的字色（圖示跟著換顏色）
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const color = getComputedStyle(c).color || '#888';
    if (icon && img.bitmap) {
      const b = img.bitmap;
      const sx = icon.crop.x * b.width;
      const sy = icon.crop.y * b.height;
      const sw = icon.crop.w * b.width;
      const sh = icon.crop.h * b.height;
      const f = c.width / Math.max(sw, sh, 1);
      ctx.drawImage(
        b,
        sx,
        sy,
        sw,
        sh,
        (c.width - sw * f) / 2,
        (c.height - sh * f) / 2,
        sw * f,
        sh * f,
      );
      return;
    }
    const def = LICENSES.find((l) => l.key === shapesKey);
    if (def) drawLicenseShapes(ctx, def.shapes(), color, c.width / 100);
  }, [shapesKey, icon, img.bitmap, on]);
  return <canvas ref={ref} width={40} height={40} aria-hidden className="size-6 text-current" />;
}

export function LicensesSection() {
  const sf = useDoc((s) => s.data.sf);
  const kind = useDoc((s) => s.data.kind);
  /* 打開對話框的鉛筆按鈕：關掉（含 Esc）後焦點回到它 */
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  if (kind !== 'sf' || sf.blank !== 'license') return null;
  return (
    <Section
      title={`${S.sectionLicenses}（${sf.licenses.length}／${LICENSES.length}）`}
      persistKey="id-ticket:licenses"
      description={S.licensesHint}
    >
      <ul
        className="m-0 grid min-w-0 list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-3"
        data-testid="licenses"
      >
        {LICENSES.map((l) => {
          const on = sf.licenses.includes(l.key);
          const custom = !!(sf.licenseCaps[l.key] || sf.licenseIcons[l.key]);
          return (
            <li key={l.key} className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                aria-pressed={on}
                aria-label={S.licenseToggle(l.label)}
                data-license={l.key}
                className={cn(
                  'focus-visible:focus-ring flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-xs',
                  on
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-border bg-transparent text-muted opacity-80',
                )}
                onClick={() => toggleLicense(l.key)}
              >
                <LicenseGlyph shapesKey={l.key} on={on} />
                <span className="min-w-0 truncate">
                  {l.label}
                  {custom ? '＊' : ''}
                </span>
              </button>
              <IconButton
                size="sm"
                variant="ghost"
                label={S.licenseEdit(l.label)}
                icon={<Pencil />}
                onClick={(ev) => {
                  setOpener(ev.currentTarget);
                  useUi.setState({ license: l.key });
                }}
              />
            </li>
          );
        })}
      </ul>
      <LicenseDialog opener={opener} />
    </Section>
  );
}

function LicenseDialog({ opener }: { opener: HTMLElement | null }) {
  const key = useUi((s) => s.license);
  const sf = useDoc((s) => s.data.sf);
  const toast = useToast();
  const def = LICENSES.find((l) => l.key === key);
  const custom = key ? !!(sf.licenseCaps[key] || sf.licenseIcons[key]) : false;
  return (
    <Dialog
      open={!!def}
      onOpenChange={(o) => {
        if (!o) useUi.setState({ license: null });
      }}
      title={def ? S.licenseDialogTitle(def.label) : ''}
      returnFocus={opener}
      size="sm"
      footer={
        <Button
          size="sm"
          icon={<Undo2 />}
          disabled={!custom}
          onClick={() => key && resetLicense(key)}
        >
          {S.licenseReset}
        </Button>
      }
    >
      {def && key ? (
        <div className="flex min-w-0 flex-col gap-3">
          <Field label={S.licenseCap} hint={S.licenseCapHint}>
            <TextInput
              value={sf.licenseCaps[key] ?? ''}
              placeholder={def.cap}
              maxLength={LICENSE_CAP_MAX * 2}
              data-license-cap={key}
              onFocus={gesture.begin}
              onBlur={gesture.commit}
              onChange={(e) => setLicenseCap(key, e.target.value)}
            />
          </Field>
          <Field label={S.licenseIcon} hint={S.licenseIconHint}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">
                <LicenseGlyph shapesKey={key} on={false} />
              </span>
              <Button
                size="sm"
                icon={<ImagePlus />}
                onClick={async () => {
                  const files = await pickFiles({ accept: 'image/*' });
                  if (!files[0]) return;
                  const n = await loadLicenseIcon(key, files[0]);
                  if (n) toast({ ...n, replace: true });
                }}
              >
                {S.licenseIconUpload}
              </Button>
              <Button
                size="sm"
                icon={<Crop />}
                disabled={!sf.licenseIcons[key]}
                onClick={() => void cropLicenseIcon(key)}
              >
                {S.licenseIconCrop}
              </Button>
            </div>
          </Field>
          <p className="m-0 text-xs text-muted">{licenseCaption(sf, key)}</p>
        </div>
      ) : null}
    </Dialog>
  );
}

/* ======================================================================
 * 內容：證件上的欄位名稱（進階）
 * ==================================================================== */

export function SfCaptionsSection() {
  const sf = useDoc((s) => s.data.sf);
  const kind = useDoc((s) => s.data.kind);
  const [on, setOn] = useAdvancedMode(TOOL_ID);
  const keys = sfBlank(sf.blank).captions;
  if (kind !== 'sf' || !keys.length) return null;
  return (
    <Section
      title={S.sectionSfCaptions}
      persistKey="id-ticket:sf-captions"
      description={S.sfCaptionsHint}
    >
      <Toggle label={S.sfCaptionsToggle} checked={on} onCheckedChange={setOn} />
      {on ? (
        <div className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-3" data-testid="sf-captions">
          {keys.map((key) => {
            const own = sf.captions[key];
            const label = SF_CAPTION_LABELS[key] ?? key;
            return (
              <Field
                key={key}
                label={S.captionLabel(label)}
                className={key === 'fine' ? 'col-span-2' : ''}
                labelSuffix={
                  own !== undefined ? (
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={`${S.captionReset}：${label}`}
                      icon={<Undo2 />}
                      onClick={() => resetSfCaption(key)}
                    />
                  ) : undefined
                }
              >
                <TextInput
                  value={own ?? SF_CAPTIONS[key] ?? ''}
                  placeholder={SF_CAPTIONS[key]}
                  data-caption={key}
                  maxLength={sfCaptionMax(key) * 2}
                  onFocus={gesture.begin}
                  onBlur={gesture.commit}
                  onChange={(e) => setSfCaption(key, e.target.value)}
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
 * 樣式
 * ==================================================================== */

export function SfStyleSection() {
  const sf = useDoc((s) => s.data.sf);
  const st = sf.style;
  const def = sfBlank(sf.blank);
  const has = (d: SfDecor) => def.decor.includes(d);
  return (
    <>
      <Section title={S.sectionScheme} persistKey="id-ticket:sf-scheme">
        <fieldset
          className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
          aria-label={S.schemePresets}
        >
          {SF_SCHEMES.map((c) => {
            const on = st.card === c.card && st.ink === c.ink && st.accent === c.accent;
            return (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                title={c.name}
                aria-pressed={on}
                data-scheme={c.id}
                className={cn(
                  'focus-visible:focus-ring flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border px-2 text-xs',
                  on && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                )}
                style={{ background: c.card, color: c.ink }}
                onClick={() => setSfStyle({ card: c.card, ink: c.ink, accent: c.accent })}
              >
                <span
                  aria-hidden
                  className="size-3 rounded-full"
                  style={{ background: c.accent }}
                />
                {c.name}
              </button>
            );
          })}
        </fieldset>
        <GestureScope gesture={gesture}>
          <div className="grid min-w-0 grid-cols-3 gap-2">
            <Field label={S.sfCard}>
              <ColorField value={st.card} onChange={(c) => setSfStyle({ card: c })} />
            </Field>
            <Field label={S.sfInk}>
              <ColorField value={st.ink} onChange={(c) => setSfStyle({ ink: c })} />
            </Field>
            <Field label={S.sfAccent}>
              <ColorField value={st.accent} onChange={(c) => setSfStyle({ accent: c })} />
            </Field>
          </div>
        </GestureScope>
      </Section>
      <Section title={S.sectionDecor} persistKey="id-ticket:sf-decor">
        <div className="grid min-w-0 grid-cols-2 gap-2" data-testid="sf-decor">
          {(['stripes', 'slashes', 'barcode', 'edge', 'chip', 'dna', 'mrz'] as const)
            .filter(has)
            .map((d) => (
              <Toggle
                key={d}
                label={S.decor[d]}
                checked={st[d]}
                onCheckedChange={(on) => setSfStyle({ [d]: on })}
              />
            ))}
        </div>
        {has('dna') && st.dna ? (
          <Field label={S.dnaMode}>
            <Segmented<'helix' | 'text'>
              value={st.dnaText ? 'text' : 'helix'}
              onValueChange={(v) => setSfStyle({ dnaText: v === 'text' })}
              options={[
                { value: 'helix', label: S.dnaModes.helix },
                { value: 'text', label: S.dnaModes.text },
              ]}
              fullWidth
            />
          </Field>
        ) : null}
        {st.barcode ? (
          <Field label={S.codeType} hint={S.codeTypeHint}>
            <Segmented<SfCodeType>
              value={st.code}
              onValueChange={(v) => setSfStyle({ code: v })}
              options={[
                { value: 'barcode', label: S.codeTypes.barcode },
                { value: 'qr', label: S.codeTypes.qr },
              ]}
              fullWidth
            />
          </Field>
        ) : null}
        <Field label={S.frame}>
          <Select<SfFrameId>
            value={st.frame}
            onValueChange={(v) => setSfStyle({ frame: v })}
            options={SF_FRAME_IDS.map((f) => ({ value: f, label: SF_FRAME_LABELS[f] }))}
            aria-label={S.frame}
          />
        </Field>
        <LanyardField note={sf.blank === 'pass' ? S.lanyardPassNote : undefined} />
      </Section>
      <WatermarkSection />
      <ElementsSection />
    </>
  );
}

/* ---------- 浮水印 ---------- */

function WatermarkSection() {
  const wm = useDoc((s) => s.data.sf.watermark);
  const toast = useToast();
  const r = WM_RANGES;
  const slider = (
    label: string,
    key: 'amount' | 'scale' | 'rotate' | 'overlap' | 'shift',
    unit: string,
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      <Slider
        value={wm[key]}
        min={r[key].min}
        max={r[key].max}
        step={1}
        unit={unit}
        onChange={gesture.live((v: number) => setWatermark({ [key]: v }))}
        onCommit={gesture.commit}
      />
    </Field>
  );
  return (
    <Section
      title={S.sectionWatermark}
      persistKey="id-ticket:sf-watermark"
      description={S.watermarkHint}
    >
      <Segmented<WatermarkMode>
        aria-label={S.sectionWatermark}
        value={wm.mode}
        onValueChange={(v) => setWatermark({ mode: v })}
        options={(['off', 'text', 'image'] as const).map((m) => ({
          value: m,
          label: S.wmModes[m],
        }))}
        fullWidth
      />
      {wm.mode === 'text' ? (
        <Field label={S.wmText}>
          <TextInput
            value={wm.text}
            maxLength={WM_TEXT_MAX * 2}
            data-field="wm-text"
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => setWatermark({ text: e.target.value.slice(0, WM_TEXT_MAX) })}
          />
        </Field>
      ) : null}
      {wm.mode === 'image' ? (
        <div className="flex min-w-0 flex-col gap-2">
          <FileDrop
            aria-label={S.wmImageDrop}
            accept="image/*"
            paste="focus"
            compact={!!wm.image}
            label={wm.image ? wm.image.name || S.wmImage : S.wmImageDrop}
            buttonLabel={wm.image ? S.changePhoto : S.choosePhoto}
            onFiles={async (files) => {
              if (!files[0]) return;
              const n = await loadWatermarkImage(files[0]);
              if (n) toast({ ...n, replace: true });
            }}
          />
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <Toggle
              label={S.wmTint}
              checked={wm.tint}
              onCheckedChange={(v) => setWatermark({ tint: v })}
            />
            <Toggle
              label={S.wmTile}
              checked={wm.tile}
              onCheckedChange={(v) => setWatermark({ tile: v })}
            />
            <Toggle
              label={S.wmSmart}
              checked={wm.smart}
              onCheckedChange={(v) => setWatermark({ smart: v })}
            />
            <Toggle
              label={S.wmInvert}
              checked={wm.invert}
              disabled={wm.tint}
              onCheckedChange={(v) => setWatermark({ invert: v })}
            />
          </div>
          {wm.image ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 />}
              onClick={() => setWatermark({ image: null })}
            >
              {S.wmRemoveImage}
            </Button>
          ) : null}
        </div>
      ) : null}
      {wm.mode !== 'off' ? (
        <>
          {wm.mode === 'text' || wm.tint ? (
            <Field label={S.wmTone}>
              <div className="flex min-w-0 flex-col gap-2">
                <Segmented<WatermarkTone>
                  value={wm.tone}
                  onValueChange={(v) => setWatermark({ tone: v })}
                  options={(['ink', 'accent', 'custom'] as const).map((t) => ({
                    value: t,
                    label: S.wmTones[t],
                  }))}
                  fullWidth
                />
                {wm.tone === 'custom' ? (
                  <GestureScope gesture={gesture}>
                    <ColorField value={wm.color} onChange={(c) => setWatermark({ color: c })} />
                  </GestureScope>
                ) : null}
              </div>
            </Field>
          ) : null}
          {slider(S.wmAmount, 'amount', '%')}
          {slider(S.wmScale, 'scale', '%')}
          {slider(S.wmRotate, 'rotate', '°')}
          {wm.mode === 'text' || wm.tile
            ? slider(S.wmOverlap, 'overlap', '%', S.wmOverlapHint)
            : null}
          {wm.mode === 'text' || wm.tile ? slider(S.wmShift, 'shift', '%', S.wmShiftHint) : null}
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <Field label={S.wmX}>
              <Slider
                value={Math.round(wm.x * 100)}
                min={-50}
                max={50}
                step={1}
                unit="%"
                onChange={gesture.live((v: number) => setWatermark({ x: v / 100 }))}
                onCommit={gesture.commit}
              />
            </Field>
            <Field label={S.wmY}>
              <Slider
                value={Math.round(wm.y * 100)}
                min={-50}
                max={50}
                step={1}
                unit="%"
                onChange={gesture.live((v: number) => setWatermark({ y: v / 100 }))}
                onCommit={gesture.commit}
              />
            </Field>
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={<Crosshair />}
            disabled={!wm.x && !wm.y}
            onClick={() => setWatermark({ x: 0, y: 0 })}
          >
            {S.wmCenter}
          </Button>
        </>
      ) : null}
    </Section>
  );
}

/* ---------- 裝飾圖 ---------- */

function ElementsSection() {
  const doc = useDoc((s) => s.data);
  const sel = useUi((s) => s.element);
  const spot = useUi((s) => s.spot);
  const toast = useToast();
  const list = currentElements(doc);
  const { bitmaps } = useAssetBitmaps(
    assets,
    list.map((e) => e.image.id),
  );
  const el = list.find((e) => e.id === sel) ?? null;
  const items = useMemo(
    () =>
      list.map((e, i) => ({
        id: e.id,
        name: e.image.name || S.elementLabel(i + 1),
        image: bitmaps.get(e.image.id) ?? null,
      })),
    [list, bitmaps],
  );
  const full = list.length >= SF_ELEMENT_MAX;
  return (
    <Section
      title={`${S.sectionElements}（${list.length}）`}
      persistKey="id-ticket:sf-elements"
      description={S.elementsHint(SF_ELEMENT_MAX)}
    >
      <FileDrop
        aria-label={S.elementsDrop}
        accept="image/*"
        paste="focus"
        multiple
        filterByAccept={false}
        compact={list.length > 0}
        disabled={full}
        icon={<ImagePlus />}
        label={S.elementsDrop}
        hint={S.elementsDropHint}
        onFiles={async (files) => {
          const n = await loadElementFiles(files, spot);
          if (n) toast({ ...n, replace: true });
        }}
      />
      {list.length ? (
        <ThumbnailList
          aria-label={S.elementList}
          items={items}
          selectedId={sel}
          onSelect={(id) => useUi.setState({ element: id })}
          onRemove={removeElement}
          minItemWidth={84}
          data-testid="elements"
        />
      ) : null}
      {el ? (
        <div className="flex min-w-0 flex-col gap-3" data-testid="element-editor">
          <Field label={S.elementSize}>
            <Slider
              value={Math.round(el.size * 100)}
              min={ELEMENT_SIZE_RANGE.min * 100}
              max={ELEMENT_SIZE_RANGE.max * 100}
              step={1}
              unit="%"
              onChange={gesture.live((v: number) => patchElement(el.id, { size: v / 100 }))}
              onCommit={gesture.commit}
            />
          </Field>
          <Field label={S.elementAlpha}>
            <Slider
              value={el.alpha}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={gesture.live((v: number) => patchElement(el.id, { alpha: v }))}
              onCommit={gesture.commit}
            />
          </Field>
          <Toggle
            label={S.elementTint}
            checked={el.tint}
            onCheckedChange={(v) => patchElement(el.id, { tint: v })}
          />
          {el.tint ? (
            <Field label={S.elementThr} hint={S.elementThrHint}>
              <Slider
                value={el.thr}
                min={0}
                max={100}
                step={1}
                onChange={gesture.live((v: number) => patchElement(el.id, { thr: v }))}
                onCommit={gesture.commit}
              />
            </Field>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={<Crop />} onClick={() => void cropElement(el.id)}>
              {S.elementCrop}
            </Button>
            <Button
              size="sm"
              icon={<ArrowUp />}
              disabled={list[list.length - 1]?.id === el.id}
              onClick={() => moveElement(el.id, 1)}
            >
              {S.elementForward}
            </Button>
            <Button
              size="sm"
              icon={<ArrowDown />}
              disabled={list[0]?.id === el.id}
              onClick={() => moveElement(el.id, -1)}
            >
              {S.elementBackward}
            </Button>
            <Button
              size="sm"
              icon={<Crosshair />}
              onClick={() => patchElement(el.id, { x: 0.5, y: 0.5 })}
            >
              {S.elementCenter}
            </Button>
            <Button size="sm" icon={<Trash2 />} onClick={() => removeElement(el.id)}>
              {S.elementRemove}
            </Button>
          </div>
        </div>
      ) : list.length ? (
        <p className="m-0 text-xs text-muted">{S.elementNone}</p>
      ) : null}
      <Field label={S.photoOverElements} hint={S.photoOverElementsHint} layout="inline">
        <Toggle
          checked={doc.sf.style.photoOverElements}
          onCheckedChange={(v) => setSfStyle({ photoOverElements: v })}
        />
      </Field>
    </Section>
  );
}

/* ======================================================================
 * 裁切對話框（裝飾圖、執照的圖示）
 * ==================================================================== */

export function SfCropDialog() {
  const req = useUi((s) => s.crop);
  const bw = req?.bitmap.width ?? 1;
  const bh = req?.bitmap.height ?? 1;
  const isLicense = req?.target.kind === 'license';
  return (
    <CropDialog
      open={!!req}
      onOpenChange={(o) => {
        if (!o) closeCrop();
      }}
      image={req?.bitmap ?? null}
      title={isLicense ? S.licenseCropTitle : S.elementCropTitle}
      aspect={isLicense ? 1 : undefined}
      freeDraw
      initialRect={req ? cropToRect(req.crop, bw, bh) : undefined}
      onConfirm={(rect) => {
        if (!req) return;
        const crop = rectToCrop(rect, bw, bh);
        if (req.target.kind === 'license') applyLicenseCrop(req.target.key, crop);
        else applyElementCrop(req.target.id, crop, req.fresh);
      }}
    />
  );
}
