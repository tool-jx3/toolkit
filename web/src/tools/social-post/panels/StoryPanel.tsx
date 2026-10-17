/**
 * 限時動態分頁（F48～F72）：清單、版面與格子（照片、位置與縮放、清空、格線）、背景、貼紙（加入、選取中的貼紙的欄位、
 * 大小與旋轉、排列）、畫面上的介面、重設這則限時動態。
 */
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Crosshair,
  Eraser,
  ImagePlus,
  Link2,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback } from 'react';
import { useAssetBitmaps } from '@/core/assets';
import { pickFiles } from '@/core/files';
import { DEFAULT_PLACEMENT } from '@/core/image';
import {
  Button,
  Chips,
  ColorField,
  Field,
  FieldRow,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  ThumbChoice,
  useToast,
} from '@/ui';
import {
  Check,
  ImageButtons,
  ListBar,
  openFrame,
  openUrlDialog,
  PlaceButtons,
  ResetButton,
  TextField,
  useNotify,
} from '../controls';
import { addImageFiles } from '../media';
import {
  ALIGNS,
  type Align,
  addSticker,
  addStory,
  BG_PRESETS,
  BG_SWATCHES,
  blankStory,
  CHIP_STYLES,
  type ChipStyle,
  cellCount,
  clearCell,
  duplicateStory,
  imageSize,
  isBgPreset,
  LAYOUT_GRID,
  LIMITS,
  MAX,
  moveStory,
  QUICK_EMOJI,
  removeStory,
  SEGMENTS_RANGE,
  SOLID_LABELS,
  STICKER_SCALE_RANGE,
  STICKER_TYPES,
  STORY_FONTS,
  STORY_LAYOUTS,
  type Sticker,
  type StickerAction,
  type StickerType,
  type Story,
  type StoryBottom,
  type StoryFont,
  type StoryLayout,
  setStoryGap,
  setStoryLayout,
  stickerAction,
  storyCellRects,
  TEXT_BGS,
  TEXT_SWATCHES,
  type TextBg,
  ZOOM_MAX,
} from '../model';
import { zoomPlace } from '../place';
import { loadImageSource } from '../render/screens';
import { cellRects } from '../render/story';
import {
  assets,
  edit,
  editStory,
  gesture,
  setPrefs,
  useCurrentStory,
  useDoc,
  usePrefs,
} from '../store';
import { S } from '../strings';

/** 漸層色票的 CSS（設定欄的色塊） */
export const bgCss = (bg: string): string =>
  isBgPreset(bg)
    ? `linear-gradient(160deg, ${BG_PRESETS[bg].stops.map(([o, c]) => `${c} ${Math.round(o * 100)}%`).join(', ')})`
    : bg;

const bgLabel = (bg: string): string =>
  isBgPreset(bg) ? BG_PRESETS[bg].label : (SOLID_LABELS[bg] ?? bg);

function StoryListSection() {
  const stories = useDoc((s) => s.data.stories);
  const story = useCurrentStory();
  const toast = useToast();
  return (
    <Section title={S.sectionStories} description={S.storiesHint} persistKey="social-post:stories">
      <ListBar
        ids={stories.map((s) => s.id)}
        currentId={story.id}
        chip={S.storyChip}
        ariaLabel={S.sectionStories}
        onPick={(id) => setPrefs({ storyId: id, sticker: null, cell: 0 })}
        addLabel={S.addStory}
        full={stories.length >= MAX.stories ? S.storiesFull(MAX.stories) : null}
        onAdd={() => {
          let id: string | null = null;
          edit((d) => {
            id = addStory(d);
          });
          if (id) setPrefs({ storyId: id, sticker: null, cell: 0 });
        }}
        onMove={(delta) => edit((d) => void moveStory(d, story.id, delta))}
        onDuplicate={() => {
          let id: string | null = null;
          edit((d) => {
            id = duplicateStory(d, story.id);
          });
          if (id) {
            setPrefs({ storyId: id, sticker: null });
            toast({ title: S.storyDuplicated, tone: 'success' });
          }
        }}
        onRemove={() => {
          let next: string | null = null;
          edit((d) => {
            next = removeStory(d, story.id);
          });
          if (next) setPrefs({ storyId: next, sticker: null, cell: 0 });
        }}
        confirmRemove={S.confirmRemoveStory(stories.indexOf(story) + 1)}
      />
    </Section>
  );
}

function LayoutSection({ story }: { story: Story }) {
  const cell = usePrefs((p) => p.data.cell);
  const n = cellCount(story.layout);
  const sel = Math.min(cell, n - 1);
  const c = story.cells[sel];
  useAssetBitmaps(
    assets,
    story.cells.flatMap((x) => (x.image?.kind === 'asset' ? [x.image.id] : [])),
  );
  const draw = useCallback((ctx: CanvasRenderingContext2D, v: StoryLayout) => {
    const { cols, rows } = LAYOUT_GRID[v];
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const w = H * (9 / 16);
    const x0 = (W - w) / 2;
    const g = 6;
    const cw = (w - g * (cols + 1)) / cols;
    const ch = (H - g * (rows + 1)) / rows;
    ctx.fillStyle = '#7d8696';
    ctx.fillRect(x0, 0, w, H);
    ctx.fillStyle = '#d9dee7';
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < cols; k++) ctx.fillRect(x0 + g + k * (cw + g), g + r * (ch + g), cw, ch);
  }, []);
  return (
    <Section title={S.sectionLayout} persistKey="social-post:layout">
      <Field label={S.layout}>
        <ThumbChoice<StoryLayout>
          aria-label={S.layout}
          options={STORY_LAYOUTS.map((v) => ({ value: v, label: S.layouts[v] }))}
          value={story.layout}
          onValueChange={(v) => {
            editStory(story.id, (s) => {
              setStoryLayout(s, v);
            });
            setPrefs({ cell: 0 });
          }}
          draw={draw}
          thumbWidth={120}
          thumbHeight={160}
          minItemWidth={72}
        />
      </Field>
      <Field label={S.cells}>
        <Chips
          aria-label={S.cells}
          items={Array.from({ length: n }, (_, i) => ({
            value: String(i),
            label: S.cellButton(i + 1),
          }))}
          value={String(sel)}
          onPick={(v) => setPrefs({ cell: Number(v), sticker: null })}
        />
      </Field>
      <ImageButtons
        target={{ kind: 'cell', storyId: story.id, index: sel }}
        pickLabel={S.cellPick(sel + 1, !!c.image)}
        label={S.cellButton(sel + 1)}
        extra={
          c.image ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Eraser />}
              onClick={() => editStory(story.id, (s) => clearCell(s, sel))}
            >
              {S.cellClear}
            </Button>
          ) : null
        }
      />
      {c.image ? (
        <>
          <Field label={`${S.cellButton(sel + 1)}：${S.zoom}`}>
            <Slider
              value={Math.round(c.place.zoom * 100)}
              min={100}
              max={ZOOM_MAX * 100}
              unit="%"
              onChange={gesture.live((v: number) =>
                editStory(story.id, (s) => {
                  const cell = s.cells[sel];
                  if (cell.image)
                    cell.place = zoomPlace(
                      imageSize(cell.image),
                      storyCellRects(s.layout, s.gap)[sel],
                      cell.place,
                      v / 100,
                    );
                }),
              )}
              onCommit={gesture.commit}
            />
          </Field>
          <PlaceButtons
            onAdjust={() => {
              const img = c.image;
              if (!img) return;
              const r = cellRects(story)[sel];
              void loadImageSource(img).then((image) => {
                if (!image) return;
                openFrame({
                  image,
                  aspect: r.width / r.height,
                  initial: c.place,
                  title: `${S.frameTitle}：${S.cellButton(sel + 1)}`,
                  onApply: (place) =>
                    editStory(story.id, (s) => {
                      s.cells[sel].place = place;
                    }),
                });
              });
            }}
            onReset={() =>
              editStory(story.id, (s) => {
                s.cells[sel].place = { ...DEFAULT_PLACEMENT };
              })
            }
          />
        </>
      ) : null}
      <FieldRow columns={2}>
        <Field label={S.gap}>
          <Slider
            value={story.gap}
            min={0}
            max={3}
            step={0.25}
            precision={2}
            onChange={gesture.live((v: number) =>
              editStory(story.id, (s) => {
                setStoryGap(s, v);
              }),
            )}
            onCommit={gesture.commit}
          />
        </Field>
        <Field label={S.gapColor}>
          <ColorField
            value={story.gapColor}
            onChange={gesture.live((v: string) =>
              editStory(story.id, (s) => {
                s.gapColor = v;
              }),
            )}
          />
        </Field>
      </FieldRow>
    </Section>
  );
}

function BgSection({ story }: { story: Story }) {
  const custom = isBgPreset(story.bg) ? '#222222' : story.bg;
  return (
    <Section title={S.sectionBg} persistKey="social-post:bg">
      <div role="radiogroup" aria-label={S.bg} className="flex flex-wrap items-center gap-2">
        {BG_SWATCHES.map((bg) => {
          const on = story.bg === bg;
          return (
            // biome-ignore lint/a11y/useSemanticElements: 色票用按鈕＋radio 角色（有底色的圓）
            <button
              key={bg}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={bgLabel(bg)}
              title={bgLabel(bg)}
              data-bg={bg}
              onClick={() =>
                editStory(story.id, (s) => {
                  s.bg = bg;
                })
              }
              className="size-8 rounded-full border-2 border-surface outline-none ring-1 ring-border-strong focus-visible:ring-2 focus-visible:ring-focus aria-checked:ring-2 aria-checked:ring-accent"
              style={{ background: bgCss(bg) }}
            />
          );
        })}
      </div>
      <Field label={S.bgCustom}>
        <ColorField
          value={custom}
          onChange={gesture.live((v: string) =>
            editStory(story.id, (s) => {
              s.bg = v;
            }),
          )}
        />
      </Field>
    </Section>
  );
}

function Swatches({
  value,
  onPick,
  label,
}: {
  value: string;
  onPick: (c: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {TEXT_SWATCHES.map((c) => (
          // biome-ignore lint/a11y/useSemanticElements: 色票用按鈕＋radio 角色
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            onClick={() => onPick(c)}
            className="size-6 rounded-full border-2 border-surface outline-none ring-1 ring-border-strong focus-visible:ring-2 focus-visible:ring-focus aria-checked:ring-2 aria-checked:ring-accent"
            style={{ background: c }}
          />
        ))}
      </div>
      <ColorField aria-label={label} value={value} onChange={gesture.live(onPick)} />
    </div>
  );
}

function StickerFields({ story, k, n }: { story: Story; k: Sticker; n: number }) {
  const set = (recipe: (x: Sticker) => void) =>
    editStory(story.id, (s) => {
      const x = s.stickers.find((it) => it.id === k.id);
      if (x) recipe(x);
    });
  const title = S.stickerLabel(S.stickerTypes[k.type], n);
  const act = (a: StickerAction) => {
    let id: string | null = null;
    edit((d) => {
      const s = d.stories.find((x) => x.id === story.id);
      if (s)
        id = stickerAction(
          s,
          k.id,
          a,
          d.stories.flatMap((x) => x.stickers.map((y) => y.id)),
        );
    });
    if (a === 'delete') setPrefs({ sticker: null });
    if (a === 'dup' && id) setPrefs({ sticker: id });
  };
  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-border bg-surface px-2.5 py-2"
      data-testid="sticker-editor"
      data-sticker-type={k.type}
    >
      <h3 className="m-0 text-sm font-semibold text-fg">{title}</h3>
      {k.type === 'text' ? (
        <>
          <TextField
            label={S.stickerText}
            rows={2}
            value={k.text}
            max={LIMITS.stickerText}
            onChange={(v) =>
              set((x) => {
                if (x.type === 'text') x.text = v;
              })
            }
          />
          <Field label={S.stickerFont}>
            <Chips
              aria-label={S.stickerFont}
              items={STORY_FONTS.map((f) => ({ value: f, label: S.fonts[f] }))}
              value={k.font}
              onPick={(v) =>
                set((x) => {
                  if (x.type === 'text') x.font = v as StoryFont;
                })
              }
            />
          </Field>
          <Field label={S.stickerColor}>
            <Swatches
              label={S.stickerColor}
              value={k.color}
              onPick={(c) =>
                set((x) => {
                  if (x.type === 'text') x.color = c;
                })
              }
            />
          </Field>
          <Field label={S.stickerBg}>
            <Segmented<TextBg>
              value={k.bg}
              onValueChange={(v) =>
                set((x) => {
                  if (x.type === 'text') x.bg = v;
                })
              }
              options={TEXT_BGS.map((v) => ({ value: v, label: S.textBgs[v] }))}
              fullWidth
            />
          </Field>
          <Field label={S.stickerAlign}>
            <Segmented<Align>
              value={k.align}
              onValueChange={(v) =>
                set((x) => {
                  if (x.type === 'text') x.align = v;
                })
              }
              options={ALIGNS.map((v) => ({ value: v, label: S.aligns[v] }))}
              fullWidth
            />
          </Field>
        </>
      ) : null}
      {k.type === 'emoji' ? (
        <>
          <TextField
            label={S.emoji}
            hint={S.emojiHint}
            value={k.text}
            max={LIMITS.emoji}
            onChange={(v) =>
              set((x) => {
                if (x.type === 'emoji') x.text = v;
              })
            }
          />
          <Field label={S.emojiQuick}>
            <Chips
              aria-label={S.emojiQuick}
              items={[...QUICK_EMOJI]}
              value={k.text}
              onPick={(v) =>
                set((x) => {
                  if (x.type === 'emoji') x.text = v;
                })
              }
            />
          </Field>
        </>
      ) : null}
      {k.type === 'mention' ||
      k.type === 'hashtag' ||
      k.type === 'location' ||
      k.type === 'link' ? (
        <>
          <TextField
            label={S.chipText[k.type]}
            value={k.text}
            max={LIMITS.chipText}
            onChange={(v) =>
              set((x) => {
                if ('style' in x) x.text = v;
              })
            }
          />
          <Field label={S.chipStyle}>
            <Segmented<ChipStyle>
              value={k.style}
              onValueChange={(v) =>
                set((x) => {
                  if ('style' in x) x.style = v;
                })
              }
              options={CHIP_STYLES.map((v) => ({ value: v, label: S.chipStyles[v] }))}
              fullWidth
            />
          </Field>
        </>
      ) : null}
      {k.type === 'music' ? (
        <>
          <TextField
            label={S.musicTitle}
            value={k.title}
            max={LIMITS.musicTitle}
            onChange={(v) =>
              set((x) => {
                if (x.type === 'music') x.title = v;
              })
            }
          />
          <TextField
            label={S.musicArtist}
            value={k.artist}
            max={LIMITS.musicArtist}
            onChange={(v) =>
              set((x) => {
                if (x.type === 'music') x.artist = v;
              })
            }
          />
          <Field label={S.musicCover}>
            <ImageButtons
              target={{ kind: 'music', storyId: story.id, stickerId: k.id }}
              hasImage={!!k.image}
              label={`${title}：${S.musicCover}`}
              onRemove={() =>
                set((x) => {
                  if (x.type === 'music') x.image = null;
                })
              }
            />
          </Field>
          <Check
            label={S.musicDark}
            checked={k.dark}
            onChange={(v) =>
              set((x) => {
                if (x.type === 'music') x.dark = v;
              })
            }
          />
        </>
      ) : null}
      {k.type === 'question' ? (
        <>
          <TextField
            label={S.questionTitle}
            rows={2}
            value={k.title}
            max={LIMITS.questionTitle}
            onChange={(v) =>
              set((x) => {
                if (x.type === 'question') x.title = v;
              })
            }
          />
          <TextField
            label={S.questionHint}
            value={k.hint}
            max={LIMITS.questionHint}
            onChange={(v) =>
              set((x) => {
                if (x.type === 'question') x.hint = v;
              })
            }
          />
          <Field label={S.questionColor}>
            <Swatches
              label={S.questionColor}
              value={k.color}
              onPick={(c) =>
                set((x) => {
                  if (x.type === 'question') x.color = c;
                })
              }
            />
          </Field>
        </>
      ) : null}
      {k.type === 'image' ? (
        <Check
          label={S.imageFrame}
          checked={k.frame}
          onChange={(v) =>
            set((x) => {
              if (x.type === 'image') x.frame = v;
            })
          }
        />
      ) : null}
      <Field label={S.stickerScale}>
        <Slider
          value={k.scale}
          min={STICKER_SCALE_RANGE[0]}
          max={STICKER_SCALE_RANGE[1]}
          step={0.01}
          precision={2}
          unit="×"
          onChange={gesture.live((v: number) =>
            set((x) => {
              x.scale = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.stickerRot}>
        <Slider
          value={k.rot}
          min={-180}
          max={180}
          step={1}
          unit="°"
          onChange={gesture.live((v: number) =>
            set((x) => {
              x.rot = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon={<ArrowUpToLine />} onClick={() => act('front')}>
          {S.stickerFront}
        </Button>
        <Button size="sm" icon={<ArrowDownToLine />} onClick={() => act('back')}>
          {S.stickerBack}
        </Button>
        <Button size="sm" icon={<Copy />} onClick={() => act('dup')}>
          {S.stickerDup}
        </Button>
        <Button size="sm" icon={<Crosshair />} onClick={() => act('center')}>
          {S.stickerCenter}
        </Button>
        <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => act('delete')}>
          {S.stickerDelete}
        </Button>
        <Button size="sm" variant="ghost" icon={<X />} onClick={() => setPrefs({ sticker: null })}>
          {S.stickerDeselect}
        </Button>
      </div>
    </div>
  );
}

function StickerSection({ story }: { story: Story }) {
  const selected = usePrefs((p) => p.data.sticker);
  const username = useDoc((s) => s.data.profile.username);
  const notify = useNotify();
  const full = story.stickers.length >= MAX.stickers;
  const k = story.stickers.find((x) => x.id === selected) ?? null;
  const add = (type: StickerType) => {
    let id: string | null = null;
    edit((d) => {
      const s = d.stories.find((x) => x.id === story.id);
      if (s)
        id = addSticker(
          s,
          type,
          { username },
          d.stories.flatMap((x) => x.stickers.map((y) => y.id)),
        );
    });
    if (id) setPrefs({ sticker: id });
  };
  return (
    <Section title={S.sectionStickers} persistKey="social-post:stickers">
      <Field label={S.stickerAdd}>
        <div className="grid grid-cols-3 gap-1.5" data-testid="sticker-add">
          {STICKER_TYPES.filter((t) => t !== 'image').map((t) => (
            <Button key={t} size="sm" disabled={full} onClick={() => add(t)}>
              {S.stickerTypes[t]}
            </Button>
          ))}
          <Button
            size="sm"
            icon={<ImagePlus />}
            disabled={full}
            onClick={() =>
              void pickFiles({ accept: 'image/*' }).then((files) =>
                addImageFiles(files, { kind: 'sticker', storyId: story.id }).then(notify),
              )
            }
          >
            {S.stickerTypes.image}
          </Button>
          <Button
            size="sm"
            icon={<Link2 />}
            disabled={full}
            onClick={() => openUrlDialog({ kind: 'sticker', storyId: story.id }, S.stickerImageUrl)}
          >
            {S.stickerImageUrl}
          </Button>
        </div>
      </Field>
      {full ? <p className="m-0 text-xs text-muted">{S.stickersFull(MAX.stickers)}</p> : null}
      {k ? (
        <StickerFields story={story} k={k} n={story.stickers.indexOf(k) + 1} />
      ) : story.stickers.length ? (
        <p className="m-0 text-xs text-muted">{S.stickerNone}</p>
      ) : null}
    </Section>
  );
}

function StoryUiSection({ story }: { story: Story }) {
  const status = useDoc((s) => s.data.screen.status);
  const set = (recipe: (s: Story) => void) => editStory(story.id, recipe);
  return (
    <Section title={S.sectionStoryUi} persistKey="social-post:story-ui">
      <Check
        label={S.status}
        checked={status}
        onChange={(v) =>
          edit((d) => {
            d.screen.status = v;
          })
        }
      />
      <Check
        label={S.storyTop}
        checked={story.showTop}
        onChange={(v) =>
          set((s) => {
            s.showTop = v;
          })
        }
      />
      <FieldRow columns={2}>
        <Field label={S.storyCount}>
          <NumberInput
            value={story.count}
            min={SEGMENTS_RANGE[0]}
            max={SEGMENTS_RANGE[1]}
            step={1}
            precision={0}
            onChange={(v) =>
              set((s) => {
                s.count = Math.round(v);
              })
            }
          />
        </Field>
        <Field label={S.storyCurrent}>
          <NumberInput
            value={story.current}
            min={SEGMENTS_RANGE[0]}
            max={SEGMENTS_RANGE[1]}
            step={1}
            precision={0}
            onChange={(v) =>
              set((s) => {
                s.current = Math.round(v);
              })
            }
          />
        </Field>
      </FieldRow>
      <Field label={S.storyProgress}>
        <Slider
          value={story.progress}
          min={0}
          max={100}
          unit="%"
          onChange={gesture.live((v: number) =>
            set((s) => {
              s.progress = Math.round(v);
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <TextField
        label={S.storyTime}
        value={story.time}
        max={LIMITS.storyTime}
        onChange={(v) =>
          set((s) => {
            s.time = v;
          })
        }
      />
      <Field label={S.storyBottom}>
        <Select
          value={story.bottom}
          onValueChange={(v) =>
            set((s) => {
              s.bottom = v as StoryBottom;
            })
          }
          options={(['reply', 'own', 'none'] as const).map((v) => ({
            value: v,
            label: S.bottoms[v],
          }))}
        />
      </Field>
      <p className="m-0 text-xs text-muted">{S.storyRawHint}</p>
    </Section>
  );
}

export function StoryPanel() {
  const story = useCurrentStory();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <StoryListSection />
      <LayoutSection story={story} />
      <BgSection story={story} />
      <StickerSection story={story} />
      <StoryUiSection story={story} />
      <ResetButton
        label={S.resetStory}
        confirmText={S.confirmResetStory}
        onReset={() => {
          edit((d) => {
            const i = d.stories.findIndex((s) => s.id === story.id);
            if (i >= 0) d.stories[i] = blankStory(story.id);
          });
          setPrefs({ sticker: null, cell: 0 });
        }}
      />
    </div>
  );
}
