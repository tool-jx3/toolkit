/**
 * 設定欄：最上面選版面，下面三個分頁——文字（標題、頁首頁尾、字型、本文編輯器、我的字型）、背景（單色／漸層／圖片、
 * 預設字色、紙張紋理）、版面（圖示符號、照片）。
 */
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BookOpen,
  Crop,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { type ReactNode, useCallback, useRef } from 'react';
import { parseColor, relativeLuminance } from '@/core/color';
import { pickFiles } from '@/core/files';
import { FONT_FILE_ACCEPT, fontFamilyCss } from '@/core/fonts';
import type { RichAlign } from '@/core/richtext';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  FileDrop,
  NumberInput,
  RichTextEditor,
  type RichTextEditorHandle,
  Section,
  Segmented,
  Select,
  Slider,
  Tabs,
  TextInput,
  Toggle,
  useConfirm,
  useToast,
} from '@/ui';
import { addFontFile, FontFileError, fontOptions, removeFont, useUploadedFonts } from './fonts';
import { type ImageSlot, loadImageFiles, openFrame, removeImage, resetPlacement } from './media';
import {
  ANGLE_RANGE,
  BG_KINDS,
  type BgKind,
  BLUR_RANGE,
  BODY_MAX,
  BODY_SIZES,
  DIM_RANGE,
  HIGHLIGHT_SWATCHES,
  ICON_MAX,
  INLINE_SIZES,
  LAYOUTS,
  type Layout,
  LINE_HEIGHTS,
  PAGE_START_RANGE,
  PHOTO_FITS,
  PHOTO_HEIGHT,
  type PhotoFit,
  type ProseState,
  SATURATION_RANGE,
  TEXT_MAX,
  TEXT_SWATCHES,
} from './model';
import { bodySizeOf } from './render';
import { edit, historyStep, setBody, setPrefs, type TabId, useDoc, usePrefs } from './store';
import { S } from './strings';

const LAYOUT_ICONS: Record<Layout, ReactNode> = {
  cover: <BookOpen />,
  page: <FileText />,
  photo: <ImageIcon />,
};
const ALIGN_ICONS: Record<RichAlign, ReactNode> = {
  left: <AlignLeft />,
  center: <AlignCenter />,
  right: <AlignRight />,
  justify: <AlignJustify />,
};

/** 編輯區的「紙」：單色／漸層用背景的顏色，圖片背景依字色挑深或淺 */
export function paperColor(s: ProseState): string {
  if (s.bg.kind === 'solid') return s.bg.color;
  if (s.bg.kind === 'gradient') return s.bg.from;
  const c = parseColor(s.textColor);
  return c && relativeLuminance(c) > 0.45 ? '#34322d' : '#fbfaf6';
}

function useNotify() {
  const toast = useToast();
  return useCallback(
    (
      n: {
        title: string;
        description?: string;
        tone: 'success' | 'warning' | 'danger' | 'info';
      } | null,
    ) => {
      if (n) toast({ title: n.title, description: n.description, tone: n.tone });
    },
    [toast],
  );
}

/** 選圖片（選檔、拖放、貼上）→ 換上 */
export function useImageLoader() {
  const notify = useNotify();
  return useCallback(
    (slot: ImageSlot, files: File[]) => void loadImageFiles(slot, files).then(notify),
    [notify],
  );
}

/* ---------- 版面 ---------- */

export function LayoutPicker() {
  const layout = useDoc((s) => s.data.layout);
  return (
    <Field label={S.layoutLabel} hint={`${S.layoutTips[layout]}${S.continuedTip}`}>
      <Segmented<Layout>
        value={layout}
        fullWidth
        onValueChange={(v) => {
          edit((d) => {
            d.layout = v;
          });
          if (v === 'photo') setPrefs({ tab: 'page' });
        }}
        options={LAYOUTS.map((l) => ({ value: l, label: S.layouts[l], icon: LAYOUT_ICONS[l] }))}
      />
    </Field>
  );
}

/* ---------- 文字 ---------- */

function TitlesSection() {
  const s = useDoc((st) => st.data);
  const { list } = useUploadedFonts();
  const fonts = fontOptions(list);
  const set = <K extends keyof ProseState>(key: K, v: ProseState[K]) =>
    edit((d) => {
      d[key] = v;
    });
  return (
    <Section title={S.secTitles} persistKey="prose-card:titles">
      <FieldRow columns={2}>
        <Field label={S.title}>
          <TextInput
            value={s.title}
            maxLength={TEXT_MAX}
            placeholder={S.titlePh}
            onChange={(e) => set('title', e.target.value)}
            data-field="title"
          />
        </Field>
        <Field label={S.kicker} hint={S.kickerHint}>
          <TextInput
            value={s.kicker}
            maxLength={TEXT_MAX}
            placeholder={S.kickerPh}
            onChange={(e) => set('kicker', e.target.value)}
            data-field="kicker"
          />
        </Field>
      </FieldRow>
      <Field label={S.font} hint={S.fontHint}>
        <Select
          value={s.font}
          onValueChange={(v) => set('font', v)}
          options={[
            ...fonts,
            ...(fonts.some((f) => f.value === s.font) ? [] : [{ value: s.font, label: s.font }]),
          ]}
          data-field="font"
        />
      </Field>
      <Field label={S.header}>
        <TextInput
          value={s.header}
          maxLength={TEXT_MAX}
          placeholder={S.headerPh}
          onChange={(e) => set('header', e.target.value)}
          data-field="header"
        />
      </Field>
      <FieldRow columns={2}>
        <Field label={S.footerLeft}>
          <TextInput
            value={s.footerLeft}
            maxLength={TEXT_MAX}
            placeholder={S.footerLeftPh}
            onChange={(e) => set('footerLeft', e.target.value)}
            data-field="footerLeft"
          />
        </Field>
        <Field label={S.footerRight}>
          <TextInput
            value={s.autoNumber ? '' : s.footerRight}
            maxLength={TEXT_MAX}
            disabled={s.autoNumber}
            placeholder={s.autoNumber ? S.footerRightAuto : S.footerRightPh}
            onChange={(e) => set('footerRight', e.target.value)}
            data-field="footerRight"
          />
        </Field>
      </FieldRow>
      <Field label={S.autoNumber} layout="inline">
        <Toggle checked={s.autoNumber} onCheckedChange={(v) => set('autoNumber', v)} />
      </Field>
      <Field label={S.pageStart} hint={S.pageStartHint} hidden={!s.autoNumber}>
        <NumberInput
          value={s.pageStart}
          min={PAGE_START_RANGE.min}
          max={PAGE_START_RANGE.max}
          step={1}
          precision={0}
          onChange={(v) => set('pageStart', Math.round(v))}
          className="w-28"
        />
      </Field>
    </Section>
  );
}

function BodySection({ pages }: { pages: number }) {
  const s = useDoc((st) => st.data);
  const prefs = usePrefs((p) => p.data);
  const { list } = useUploadedFonts();
  const toast = useToast();
  const editor = useRef<RichTextEditorHandle>(null);
  const fonts = fontOptions(list);
  const fontCss = useCallback((f: string) => fontFamilyCss(f), []);
  return (
    <Section title={S.secBody} persistKey="prose-card:body">
      <Field label={S.body} hint={S.bodyHint(pages)}>
        <RichTextEditor
          ref={editor}
          aria-label={S.body}
          value={s.body}
          onChange={setBody}
          fontFamily={fontFamilyCss(s.font)}
          baseFont={s.font}
          fontCss={fontCss}
          baseSize={bodySizeOf(s)}
          displaySize={16}
          lineHeight={s.lineHeight}
          color={s.textColor}
          background={paperColor(s)}
          align={s.align}
          maxLength={BODY_MAX}
          placeholder={S.bodyPh}
          minHeight="16rem"
          maxHeight="min(60dvh, 34rem)"
          onHistory={historyStep}
          onNotice={(m, tone) =>
            toast({ title: m, tone: tone === 'warning' ? 'warning' : 'info', replace: true })
          }
          toolbar={{
            fonts: fonts.map((f) => ({ value: f.value, label: f.label })),
            sizes: INLINE_SIZES,
            textSwatches: TEXT_SWATCHES,
            highlightSwatches: HIGHLIGHT_SWATCHES,
            textPresets: prefs.textPresets,
            onTextPresetsChange: (next) => setPrefs({ textPresets: next }),
            highlightPresets: prefs.highlightPresets,
            onHighlightPresetsChange: (next) => setPrefs({ highlightPresets: next }),
          }}
        />
      </Field>
      <Field label={S.align}>
        <Segmented<RichAlign>
          value={s.align}
          fullWidth
          onValueChange={(v) =>
            edit((d) => {
              d.align = v;
            })
          }
          options={(['left', 'center', 'right', 'justify'] as const).map((a) => ({
            value: a,
            label: S.aligns[a],
            icon: ALIGN_ICONS[a],
            ariaLabel: `${S.align}：${S.aligns[a]}`,
          }))}
        />
      </Field>
      <FieldRow columns={2}>
        <Field label={S.lineHeight}>
          <Select
            value={String(s.lineHeight)}
            onValueChange={(v) =>
              edit((d) => {
                d.lineHeight = Number(v);
              })
            }
            options={LINE_HEIGHTS.map((v) => ({ value: String(v), label: String(v) }))}
            data-field="lineHeight"
          />
        </Field>
        <Field label={S.bodySize} hint={S.bodySizeHint}>
          <Select
            value={String(s.bodySize)}
            onValueChange={(v) =>
              edit((d) => {
                d.bodySize = Number(v);
              })
            }
            options={BODY_SIZES.map((v) => ({ value: String(v), label: `${v} px` }))}
            data-field="bodySize"
          />
        </Field>
      </FieldRow>
    </Section>
  );
}

function FontsSection() {
  const { list } = useUploadedFonts();
  const toast = useToast();
  const confirm = useConfirm();
  const add = async () => {
    const files = await pickFiles({ accept: FONT_FILE_ACCEPT, multiple: true });
    for (const f of files) {
      try {
        const name = await addFontFile(f);
        toast({ title: S.fontAdded(name), tone: 'success' });
      } catch (e) {
        toast({
          title: e instanceof FontFileError ? e.message : S.fontFailed,
          description: f.name,
          tone: 'danger',
        });
      }
    }
  };
  return (
    <Section title={S.secFonts} persistKey="prose-card:fonts" defaultOpen={false}>
      <p className="m-0 text-xs text-muted">{S.fontsHint}</p>
      {list.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={S.secFonts}>
          {list.map((f) => (
            <li
              key={f.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-3 text-sm text-fg"
              style={{ fontFamily: fontFamilyCss(f.family) }}
            >
              {f.family}
              <button
                type="button"
                aria-label={S.fontRemove(f.family)}
                className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface-3 [&_svg]:size-3.5"
                onClick={async () => {
                  const ok = await confirm({
                    title: S.fontRemoveTitle(f.family),
                    description: S.fontRemoveDesc,
                    confirmLabel: S.fontRemoveConfirm,
                    danger: true,
                  });
                  if (!ok) return;
                  await removeFont(f);
                  toast({ title: S.fontRemoved(f.family) });
                }}
              >
                <X aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-muted">{S.noFonts}</p>
      )}
      <Button icon={<Plus />} onClick={() => void add()} className="self-start">
        {S.addFont}
      </Button>
    </Section>
  );
}

export function TextTab({ pages }: { pages: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <TitlesSection />
      <BodySection pages={pages} />
      <FontsSection />
    </div>
  );
}

/* ---------- 圖片的載入區（照片、背景圖片共用） ---------- */

function ImageSlotControls({
  slot,
  onFiles,
  paste,
}: {
  slot: ImageSlot;
  onFiles: (files: File[]) => void;
  paste: boolean;
}) {
  const image = useDoc((s) => (slot === 'photo' ? s.data.photo.image : s.data.bg.image));
  const toast = useToast();
  return (
    <>
      <div data-testid={`${slot}-load`} data-state={image ? 'loaded' : 'empty'}>
        <FileDrop
          aria-label={slot === 'photo' ? S.photoDrop : S.bgImageDrop}
          accept="image/*"
          paste={paste ? 'document' : 'focus'}
          /* 全部交給 loadImageFiles：用第一張圖片，其他不是圖片的檔列在通知裡 */
          multiple
          filterByAccept={false}
          compact={!!image}
          icon={image ? <ImageIcon /> : <ImagePlus />}
          label={
            image ? (
              <span className="flex min-w-0" data-testid={`${slot}-name`}>
                <span className="shrink-0">{S.current}</span>
                <span className="truncate" title={image.name}>
                  {image.name || '—'}
                </span>
              </span>
            ) : slot === 'photo' ? (
              S.photoDrop
            ) : (
              S.bgImageDrop
            )
          }
          hint={slot === 'photo' ? S.photoHint : S.bgImageHint}
          buttonLabel={image ? S.changeImage : S.chooseImage}
          onFiles={onFiles}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={<Crop />}
          disabled={!image}
          onClick={() =>
            void openFrame(slot).then((ok) => {
              if (!ok) toast({ title: S.imageMissing[slot], tone: 'warning' });
            })
          }
        >
          {slot === 'photo' ? S.photoAdjust : S.bgAdjust}
        </Button>
        {slot === 'photo' ? (
          <Button icon={<RotateCcw />} disabled={!image} onClick={() => resetPlacement(slot)}>
            {S.photoReset}
          </Button>
        ) : null}
        <Button icon={<Trash2 />} disabled={!image} onClick={() => removeImage(slot)}>
          {slot === 'photo' ? S.photoRemove : S.bgRemove}
        </Button>
      </div>
    </>
  );
}

/* ---------- 背景 ---------- */

export function BgTab({ onFiles, active }: { onFiles: (files: File[]) => void; active: boolean }) {
  const s = useDoc((st) => st.data);
  const bg = s.bg;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.secBg} persistKey="prose-card:bg">
        <Field label={S.bgKind}>
          <Segmented<BgKind>
            value={bg.kind}
            fullWidth
            onValueChange={(v) =>
              edit((d) => {
                d.bg.kind = v;
              })
            }
            options={BG_KINDS.map((k) => ({ value: k, label: S.bgKinds[k] }))}
          />
        </Field>
        {bg.kind !== 'gradient' ? (
          <Field
            label={S.bgColor}
            hint={bg.kind === 'image' && !bg.image ? S.bgNoImage : undefined}
          >
            <ColorField
              aria-label={S.bgColor}
              value={bg.color}
              onChange={(v) =>
                edit((d) => {
                  d.bg.color = v;
                })
              }
            />
          </Field>
        ) : (
          <>
            <FieldRow columns={2}>
              <Field label={S.gradFrom}>
                <ColorField
                  aria-label={S.gradFrom}
                  value={bg.from}
                  onChange={(v) =>
                    edit((d) => {
                      d.bg.from = v;
                    })
                  }
                />
              </Field>
              <Field label={S.gradTo}>
                <ColorField
                  aria-label={S.gradTo}
                  value={bg.to}
                  onChange={(v) =>
                    edit((d) => {
                      d.bg.to = v;
                    })
                  }
                />
              </Field>
            </FieldRow>
            <Field label={S.gradAngle}>
              <Slider
                value={bg.angle}
                min={ANGLE_RANGE.min}
                max={ANGLE_RANGE.max}
                unit="°"
                onChange={(v) =>
                  edit((d) => {
                    d.bg.angle = v;
                  })
                }
              />
            </Field>
          </>
        )}
        {bg.kind === 'image' ? (
          <>
            <ImageSlotControls slot="bg" onFiles={onFiles} paste={active} />
            <Field label={S.blur}>
              <Slider
                value={bg.blur}
                min={BLUR_RANGE.min}
                max={BLUR_RANGE.max}
                unit="px"
                onChange={(v) =>
                  edit((d) => {
                    d.bg.blur = v;
                  })
                }
              />
            </Field>
            <Field label={S.saturation}>
              <Slider
                value={bg.saturation}
                min={SATURATION_RANGE.min}
                max={SATURATION_RANGE.max}
                unit="%"
                onChange={(v) =>
                  edit((d) => {
                    d.bg.saturation = v;
                  })
                }
              />
            </Field>
            <Field label={S.dim}>
              <Slider
                value={bg.dim}
                min={DIM_RANGE.min}
                max={DIM_RANGE.max}
                unit="%"
                onChange={(v) =>
                  edit((d) => {
                    d.bg.dim = v;
                  })
                }
              />
            </Field>
          </>
        ) : null}
      </Section>
      <Section title={S.secTextColor} persistKey="prose-card:textcolor">
        <Field label={S.textColor} hint={S.textColorHint}>
          <ColorField
            aria-label={S.textColor}
            value={s.textColor}
            swatches={TEXT_SWATCHES}
            onChange={(v) =>
              edit((d) => {
                d.textColor = v;
              })
            }
          />
        </Field>
        <Field label={S.texture} hint={S.textureHint} layout="inline">
          <Toggle
            checked={s.texture}
            onCheckedChange={(v) =>
              edit((d) => {
                d.texture = v;
              })
            }
          />
        </Field>
      </Section>
    </div>
  );
}

/* ---------- 版面 ---------- */

export function PageTab({
  onFiles,
  active,
}: {
  onFiles: (files: File[]) => void;
  active: boolean;
}) {
  const s = useDoc((st) => st.data);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.secPage} persistKey="prose-card:page">
        <Field label={S.icon} hint={S.iconHint}>
          <TextInput
            value={s.icon}
            placeholder="✦"
            onChange={(e) => {
              const v = Array.from(e.target.value).slice(0, ICON_MAX).join('');
              edit((d) => {
                d.icon = v;
              });
            }}
            className="w-32 text-center text-lg"
            data-field="icon"
          />
        </Field>
      </Section>
      <Section title={S.secPhoto} persistKey="prose-card:photo">
        {s.layout === 'photo' ? (
          <>
            <ImageSlotControls slot="photo" onFiles={onFiles} paste={active} />
            {!s.photo.image ? <p className="m-0 text-xs text-muted">{S.photoNone}</p> : null}
            <Field label={S.photoHeight}>
              <Slider
                value={s.photo.height}
                min={PHOTO_HEIGHT.min}
                max={PHOTO_HEIGHT.max}
                step={PHOTO_HEIGHT.step}
                unit="px"
                onChange={(v) =>
                  edit((d) => {
                    d.photo.height = Math.round(v / 10) * 10;
                  })
                }
              />
            </Field>
            <Field label={S.photoFit}>
              <Segmented<PhotoFit>
                value={s.photo.fit}
                fullWidth
                onValueChange={(v) =>
                  edit((d) => {
                    d.photo.fit = v;
                  })
                }
                options={PHOTO_FITS.map((f) => ({ value: f, label: S.fits[f] }))}
              />
            </Field>
          </>
        ) : (
          <p className="m-0 flex items-center gap-2 text-sm text-muted [&_svg]:size-4">
            <ImagePlus aria-hidden />
            {S.photoTip}
          </p>
        )}
      </Section>
    </div>
  );
}

/* ---------- 分頁 ---------- */

export function SettingsTabs({ pages }: { pages: number }) {
  const tab = usePrefs((p) => p.data.tab);
  const layout = useDoc((s) => s.data.layout);
  const load = useImageLoader();
  return (
    <Tabs<TabId>
      aria-label={S.tabsLabel}
      value={tab}
      onValueChange={(v) => setPrefs({ tab: v })}
      keepMounted
      items={[
        { value: 'text', label: S.tabs.text, content: <TextTab pages={pages} /> },
        {
          value: 'bg',
          label: S.tabs.bg,
          content: <BgTab onFiles={(f) => load('bg', f)} active={tab === 'bg'} />,
        },
        {
          value: 'page',
          label: S.tabs.page,
          content: (
            <PageTab
              onFiles={(f) => load('photo', f)}
              active={tab === 'page' && layout === 'photo'}
            />
          ),
        },
      ]}
    />
  );
}
