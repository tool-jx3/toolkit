/**
 * 設定欄：卡片（進階設定、寬高）、內容、圖片、塗層、抽獎（種子）、背景與刮開區（進階）、標題（進階）。
 */
import { ImagePlus, Images, Link2, Shuffle, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  AnchorPicker,
  Button,
  ColorField,
  Field,
  FieldRow,
  FileDrop,
  GestureScope,
  IconButton,
  NumberInput,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  TextArea,
  TextInput,
  ThumbnailList,
  Toggle,
  useToast,
} from '@/ui';
import { loadImageFiles, useThumbUrls } from './images';
import {
  BG_FITS,
  CONTENT_KINDS,
  COVER_SHAPES,
  type ContentKind,
  type CoverShape,
  cleanImageUrl,
  IMAGE_STYLES,
  type ImageStyle,
  imageKey,
  LIMITS,
  multiLine,
  oneLine,
  type ScratchState,
  sentenceList,
  urlImageName,
} from './model';
import { addNotice } from './notices';
import {
  appendImages,
  edit,
  gesture,
  removeImage,
  scratchNow,
  setBgImage,
  shuffleSeed,
  useScratch,
} from './store';
import { S } from './strings';

const count = (s: string) => Array.from(s).length;

function useData<T>(pick: (d: ScratchState) => T): T {
  return useScratch((s) => pick(s.data));
}

/** 數字欄（px 等單位） */
function Num({
  label,
  value,
  range,
  unit,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  range: readonly [number, number];
  unit?: string;
  onChange: (v: number) => void;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      <NumberInput
        value={value}
        min={range[0]}
        max={range[1]}
        step={1}
        precision={0}
        unit={unit}
        onChange={onChange}
      />
    </Field>
  );
}

/** 單行文字欄：從聚焦到離開算一步 */
function Line({
  label,
  value,
  max,
  placeholder,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  placeholder?: string;
  hint?: ReactNode;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={hint} labelSuffix={`${count(value)}／${max}`}>
      <TextInput
        value={value}
        placeholder={placeholder}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => onChange(oneLine(e.target.value, max))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
        }}
      />
    </Field>
  );
}

function Color({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <GestureScope gesture={gesture}>
        <ColorField value={value} onChange={onChange} />
      </GestureScope>
    </Field>
  );
}

/* ---------- 卡片 ---------- */

export function CardSection() {
  const expert = useData((d) => d.expert);
  const width = useData((d) => d.width);
  const height = useData((d) => d.height);
  return (
    <Section title={S.sectionCard} persistKey="scratch-card:card">
      <Field label={S.expert} layout="inline" hint={S.expertHint}>
        <Toggle
          checked={expert}
          onCheckedChange={(v) =>
            edit((d) => {
              d.expert = v;
            })
          }
        />
      </Field>
      <FieldRow>
        <Num
          label={S.width}
          value={width}
          range={LIMITS.width}
          unit={S.px}
          onChange={(v) =>
            edit((d) => {
              d.width = v;
            })
          }
        />
        <Num
          label={S.height}
          value={height}
          range={LIMITS.height}
          unit={S.px}
          onChange={(v) =>
            edit((d) => {
              d.height = v;
            })
          }
        />
      </FieldRow>
    </Section>
  );
}

/* ---------- 內容 ---------- */

export function ContentSection() {
  const kind = useData((d) => d.kind);
  const expert = useData((d) => d.expert);
  const n = useData((d) => d.count);
  const sentences = useData((d) => d.sentences);
  const sentenceSize = useData((d) => d.sentenceSize);
  const sentenceColor = useData((d) => d.sentenceColor);
  const imageSize = useData((d) => d.imageSize);
  const imageStyle = useData((d) => d.imageStyle);
  const trim = useData((d) => d.trim);
  return (
    <Section title={S.sectionContent} persistKey="scratch-card:content">
      <Field label={S.kind} hint={S.kindHints[kind]}>
        <Select<ContentKind>
          value={kind}
          onValueChange={(v) =>
            edit((d) => {
              d.kind = v;
            })
          }
          options={CONTENT_KINDS.map((k) => ({ value: k, label: S.kinds[k] }))}
          data-testid="kind-select"
        />
      </Field>
      <Show when={kind === 'icons' || kind === 'image-icon'}>
        <Num
          label={S.count}
          value={n}
          range={LIMITS.count}
          hint={kind === 'icons' ? S.countHint : undefined}
          onChange={(v) =>
            edit((d) => {
              d.count = v;
            })
          }
        />
      </Show>
      <Show when={kind === 'sentence'}>
        <Field
          label={S.sentences}
          hint={S.sentencesHint(sentenceList(sentences).length)}
          labelSuffix={`${count(sentences)}／${LIMITS.sentences}`}
        >
          <TextArea
            rows={6}
            value={sentences}
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => {
              const v = multiLine(e.target.value, LIMITS.sentences);
              edit((d) => {
                d.sentences = v;
              });
            }}
          />
        </Field>
        <FieldRow>
          <Num
            label={S.sentenceSize}
            value={sentenceSize}
            range={LIMITS.sentenceSize}
            unit={S.px}
            onChange={(v) =>
              edit((d) => {
                d.sentenceSize = v;
              })
            }
          />
          <Show when={expert}>
            <Color
              label={S.sentenceColor}
              value={sentenceColor}
              onChange={(v) =>
                edit((d) => {
                  d.sentenceColor = v;
                })
              }
            />
          </Show>
        </FieldRow>
      </Show>
      <Show when={kind === 'image-icon'}>
        <Num
          label={S.imageSize}
          value={imageSize}
          range={LIMITS.imageSize}
          unit={S.px}
          onChange={(v) =>
            edit((d) => {
              d.imageSize = v;
            })
          }
        />
        <Field label={S.imageStyle}>
          <Select<ImageStyle>
            value={imageStyle}
            onValueChange={(v) =>
              edit((d) => {
                d.imageStyle = v;
              })
            }
            options={IMAGE_STYLES.map((k) => ({ value: k, label: S.imageStyles[k] }))}
          />
        </Field>
        <Field label={S.trim} layout="inline" hint={S.trimHint}>
          <Toggle
            checked={trim}
            onCheckedChange={(v) =>
              edit((d) => {
                d.trim = v;
              })
            }
          />
        </Field>
      </Show>
    </Section>
  );
}

/* ---------- 圖片 ---------- */

export function ImagesSection() {
  const toast = useToast();
  const images = useData((d) => d.images);
  const urls = useThumbUrls(images);
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const addFiles = async (files: File[]) => {
    const { loaded, notImages, failed } = await loadImageFiles(files);
    const over = appendImages(loaded.map((l) => l.ref));
    const n = addNotice({
      added: loaded.length - over,
      notImages,
      failed,
      over,
      notSaved: loaded.some((l) => !l.persisted),
    });
    if (n) toast(n);
  };

  const addUrl = () => {
    const clean = cleanImageUrl(url);
    if (!clean) {
      setUrlError(url.trim() ? S.urlInvalid : null);
      return;
    }
    if (scratchNow().images.length >= LIMITS.images) {
      setUrlError(S.urlFull);
      return;
    }
    appendImages([{ kind: 'url', url: clean, name: urlImageName(clean) }]);
    setUrl('');
    setUrlError(null);
  };

  return (
    <Section
      title={S.imagesTitle(images.length)}
      persistKey="scratch-card:images"
      description={images.length ? undefined : S.imagesEmpty}
    >
      <FileDrop
        aria-label={S.imagesDrop}
        accept="image/*"
        multiple
        paste="document"
        compact
        icon={<Images />}
        label={S.imagesDrop}
        buttonLabel={S.imagesChoose}
        hint={S.imagesDropHint}
        filterByAccept={false}
        onFiles={(files) => void addFiles(files)}
      />
      <Field label={S.urlLabel} error={urlError ?? undefined}>
        <div className="flex min-w-0 gap-2">
          <TextInput
            className="min-w-0 flex-1"
            type="url"
            inputMode="url"
            value={url}
            placeholder={S.urlPlaceholder}
            maxLength={LIMITS.url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (urlError) setUrlError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                addUrl();
              }
            }}
          />
          <Button icon={<Link2 />} onClick={addUrl}>
            {S.urlAdd}
          </Button>
        </div>
      </Field>
      <ThumbnailList
        aria-label={S.imagesListLabel}
        layout="list"
        thumbSize={48}
        numbered
        items={images.map((im, i) => ({
          id: `${i}:${imageKey(im)}`,
          name: im.name || (im.kind === 'url' ? im.url : ''),
          image: im.kind === 'url' ? im.url : (urls.get(imageKey(im)) ?? null),
          meta: im.kind === 'url' ? S.urlTag : `${im.width} × ${im.height}`,
        }))}
        removeLabel={(item) => S.removeImage(item.name)}
        onRemove={(id) => removeImage(Number.parseInt(id, 10))}
      />
    </Section>
  );
}

/* ---------- 塗層 ---------- */

export function CoverSection() {
  const expert = useData((d) => d.expert);
  const kind = useData((d) => d.kind);
  const coverText = useData((d) => d.coverText);
  const coverColor = useData((d) => d.coverColor);
  const brush = useData((d) => d.brush);
  const coverShape = useData((d) => d.coverShape);
  return (
    <Section title={S.sectionCover} persistKey="scratch-card:cover">
      <Line
        label={S.coverText}
        value={coverText}
        max={LIMITS.coverText}
        onChange={(v) =>
          edit((d) => {
            d.coverText = v;
          })
        }
      />
      <Color
        label={S.coverColor}
        value={coverColor}
        onChange={(v) =>
          edit((d) => {
            d.coverColor = v;
          })
        }
      />
      <Field label={S.brush}>
        <Slider
          value={brush}
          min={LIMITS.brush[0]}
          max={LIMITS.brush[1]}
          step={1}
          unit={S.px}
          onChange={gesture.live((v: number) =>
            edit((d) => {
              d.brush = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <Show when={expert}>
        <Field
          label={S.coverShape}
          hint={kind === 'icons' || kind === 'image-icon' ? undefined : S.coverShapeHint}
        >
          <Select<CoverShape>
            value={coverShape}
            onValueChange={(v) =>
              edit((d) => {
                d.coverShape = v;
              })
            }
            options={COVER_SHAPES.map((k) => ({ value: k, label: S.coverShapes[k] }))}
          />
        </Field>
      </Show>
    </Section>
  );
}

/* ---------- 抽獎（種子） ---------- */

export function DrawSection() {
  const fixedSeed = useData((d) => d.fixedSeed);
  const seed = useData((d) => d.seed);
  return (
    <Section title={S.sectionDraw} persistKey="scratch-card:draw">
      <Field
        label={S.fixedSeed}
        layout="inline"
        hint={fixedSeed ? S.fixedSeedHint : S.currentSeed(seed)}
      >
        <Toggle
          checked={fixedSeed}
          onCheckedChange={(v) =>
            edit((d) => {
              d.fixedSeed = v;
            })
          }
        />
      </Field>
      <Show when={fixedSeed}>
        <Field label={S.seed}>
          <div className="flex min-w-0 gap-2">
            <div className="min-w-0 flex-1">
              <NumberInput
                value={seed}
                min={LIMITS.seed[0]}
                max={LIMITS.seed[1]}
                step={1}
                precision={0}
                onChange={(v) =>
                  edit((d) => {
                    d.seed = v;
                  })
                }
              />
            </div>
            <IconButton label={S.shuffleSeed} icon={<Shuffle />} onClick={shuffleSeed} />
          </div>
        </Field>
      </Show>
    </Section>
  );
}

/* ---------- 背景與刮開區（進階） ---------- */

export function BackgroundSection() {
  const toast = useToast();
  const bgColor = useData((d) => d.bgColor);
  const bgImage = useData((d) => d.bgImage);
  const bgFit = useData((d) => d.bgFit);
  const zone = useData((d) => d.zone);
  const urls = useThumbUrls(bgImage ? [bgImage] : []);
  const thumb = bgImage
    ? bgImage.kind === 'url'
      ? bgImage.url
      : urls.get(imageKey(bgImage))
    : null;

  const pickBg = async (files: File[]) => {
    const { loaded, notImages, failed } = await loadImageFiles(files.slice(0, 1));
    const first = loaded[0];
    if (first) setBgImage(first.ref);
    const n = addNotice({
      added: first ? 1 : 0,
      notImages,
      failed,
      over: 0,
      notSaved: !!first && !first.persisted,
      background: true,
    });
    if (n) toast(n);
  };

  const setZone = (key: 'x' | 'y' | 'w' | 'h', v: number) =>
    edit((d) => {
      d.zone[key] = v;
    });

  return (
    <Section title={S.sectionBackground} persistKey="scratch-card:background">
      <Color
        label={S.bgColor}
        value={bgColor}
        onChange={(v) =>
          edit((d) => {
            d.bgColor = v;
          })
        }
      />
      <Field label={S.bgImage}>
        <div className="flex min-w-0 flex-col gap-2" data-testid="bg-image">
          {bgImage ? (
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="checker flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-sm"
              >
                {thumb ? <img src={thumb} alt="" className="size-full object-contain" /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm" title={bgImage.name}>
                {bgImage.name || '—'}
              </span>
              <Button size="sm" variant="ghost" icon={<X />} onClick={() => setBgImage(null)}>
                {S.bgRemove}
              </Button>
            </div>
          ) : null}
          <FileDrop
            aria-label={S.bgDrop}
            accept="image/*"
            paste="off"
            compact
            icon={<ImagePlus />}
            label={bgImage ? S.bgChange : S.bgDrop}
            buttonLabel={S.bgChoose}
            filterByAccept={false}
            onFiles={(files) => void pickBg(files)}
          />
        </div>
      </Field>
      <Field label={S.bgFit}>
        <Segmented
          value={bgFit}
          fullWidth
          onValueChange={(v) =>
            edit((d) => {
              d.bgFit = v as ScratchState['bgFit'];
            })
          }
          options={BG_FITS.map((k) => ({ value: k, label: S.bgFits[k] }))}
        />
      </Field>
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-medium">{S.zone}</legend>
        <FieldRow>
          <Num
            label={S.zoneX}
            value={zone.x}
            range={LIMITS.zoneXY}
            unit={S.px}
            onChange={(v) => setZone('x', v)}
          />
          <Num
            label={S.zoneY}
            value={zone.y}
            range={LIMITS.zoneXY}
            unit={S.px}
            onChange={(v) => setZone('y', v)}
          />
        </FieldRow>
        <FieldRow>
          <Num
            label={S.zoneW}
            value={zone.w}
            range={LIMITS.zoneWH}
            unit={S.px}
            onChange={(v) => setZone('w', v)}
          />
          <Num
            label={S.zoneH}
            value={zone.h}
            range={LIMITS.zoneWH}
            unit={S.px}
            onChange={(v) => setZone('h', v)}
          />
        </FieldRow>
        <p className="m-0 text-xs text-muted">{S.zoneHint}</p>
      </fieldset>
    </Section>
  );
}

/* ---------- 標題（進階） ---------- */

export function TitleSection() {
  const titleText = useData((d) => d.titleText);
  const titleColor = useData((d) => d.titleColor);
  const titleSize = useData((d) => d.titleSize);
  const titlePos = useData((d) => d.titlePos);
  return (
    <Section title={S.sectionTitle} persistKey="scratch-card:title">
      <Line
        label={S.titleText}
        value={titleText}
        max={LIMITS.titleText}
        placeholder={S.titlePlaceholder}
        hint={S.titleHint}
        onChange={(v) =>
          edit((d) => {
            d.titleText = v;
          })
        }
      />
      <FieldRow>
        <Color
          label={S.titleColor}
          value={titleColor}
          onChange={(v) =>
            edit((d) => {
              d.titleColor = v;
            })
          }
        />
        <Num
          label={S.titleSize}
          value={titleSize}
          range={LIMITS.titleSize}
          unit={S.px}
          onChange={(v) =>
            edit((d) => {
              d.titleSize = v;
            })
          }
        />
      </FieldRow>
      <Field label={S.titlePos}>
        <AnchorPicker
          value={titlePos}
          onChange={(v) =>
            edit((d) => {
              d.titlePos = v;
            })
          }
        />
      </Field>
    </Section>
  );
}
