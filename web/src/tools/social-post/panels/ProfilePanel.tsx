/**
 * 個人頁分頁（F73～F84）：自己的帳號、不公開、底部分頁列、數字、簡介、精選動態、其他照片、空格數、個人頁回到預設。
 */
import { Link2, Plus, Trash2 } from 'lucide-react';
import { useAssetBitmaps } from '@/core/assets';
import {
  Button,
  Field,
  FieldRow,
  FileDrop,
  IconButton,
  NumberInput,
  Section,
  Select,
  ThumbnailImage,
  ThumbnailList,
} from '@/ui';
import { Check, ImageButtons, openUrlDialog, ResetButton, TextField, useNotify } from '../controls';
import { addImageFiles } from '../media';
import {
  type Account,
  defaultAccount,
  type Highlight,
  LIMITS,
  MAX,
  nextId,
  PLACEHOLDER_RANGE,
  storyCover,
} from '../model';
import { thumbSource } from '../render/screens';
import { assets, edit, useDoc } from '../store';
import { S } from '../strings';

const setAcc = (recipe: (a: Account) => void) => edit((d) => recipe(d.account));

/*
 * 「連到」選單的值（F78）：Radix Select 把空字串當成沒有選取（顯示空白），所以「無」不用空字串；
 * 限時動態的 id 加前綴，不會和「無」撞在一起（存檔仍是 story：id 或 null）。
 */
const LINK_NONE = 'none';
const LINK_PREFIX = 'story:';
const linkValue = (id: string) => `${LINK_PREFIX}${id}`;

function HighlightCard({ h, i }: { h: Highlight; i: number }) {
  const stories = useDoc((s) => s.data.stories);
  const linked = h.story ? stories.find((s) => s.id === h.story) : undefined;
  const cover = h.image ?? (linked ? storyCover(linked) : null);
  const src = thumbSource(cover);
  const title = S.highlightLabel(i + 1, h.title);
  const set = (recipe: (x: Highlight) => void) =>
    setAcc((a) => {
      const x = a.highlights.find((it) => it.id === h.id);
      if (x) recipe(x);
    });
  return (
    <li
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface px-2.5 py-2"
      data-highlight={h.id}
    >
      <div className="flex items-center gap-2">
        <span className="size-10 shrink-0 overflow-hidden rounded-full bg-surface-3">
          {src ? <ThumbnailImage source={src} /> : null}
        </span>
        <h3 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-fg">{title}</h3>
        <IconButton
          label={`${title}：${S.remove}`}
          icon={<Trash2 />}
          size="sm"
          variant="ghost"
          onClick={() =>
            setAcc((a) => {
              a.highlights = a.highlights.filter((x) => x.id !== h.id);
            })
          }
        />
      </div>
      <TextField
        label={S.highlightTitle}
        ariaLabel={`${title}：${S.highlightTitle}`}
        value={h.title}
        max={LIMITS.highlightTitle}
        onChange={(v) =>
          set((x) => {
            x.title = v;
          })
        }
      />
      <Field label={S.highlightCover} hint={S.highlightCoverHint}>
        <ImageButtons
          target={{ kind: 'highlight', id: h.id }}
          hasImage={!!h.image}
          label={`${title}：${S.highlightCover}`}
          onRemove={() =>
            set((x) => {
              x.image = null;
            })
          }
        />
      </Field>
      <Field label={S.highlightStory}>
        <Select
          aria-label={`${title}：${S.highlightStory}`}
          value={h.story ? linkValue(h.story) : LINK_NONE}
          onValueChange={(v) =>
            set((x) => {
              x.story = v.startsWith(LINK_PREFIX) ? v.slice(LINK_PREFIX.length) : null;
            })
          }
          options={[
            { value: LINK_NONE, label: S.highlightNone },
            ...stories.map((s, k) => ({ value: linkValue(s.id), label: S.storyChip(k + 1) })),
          ]}
        />
      </Field>
    </li>
  );
}

export function ProfilePanel() {
  const a = useDoc((s) => s.data.account);
  const notify = useNotify();
  useAssetBitmaps(assets, [
    ...a.grid.flatMap((g) => (g.image.kind === 'asset' ? [g.image.id] : [])),
    ...a.highlights.flatMap((h) => (h.image?.kind === 'asset' ? [h.image.id] : [])),
  ]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sectionProfilePage} persistKey="social-post:profile">
        <Check
          label={S.own}
          checked={a.own}
          onChange={(v) =>
            setAcc((x) => {
              x.own = v;
            })
          }
        />
        <Check
          label={S.privateAcc}
          checked={a.private}
          onChange={(v) =>
            setAcc((x) => {
              x.private = v;
            })
          }
        />
        <Check
          label={S.nav}
          hint={S.navHint}
          checked={a.nav}
          onChange={(v) =>
            setAcc((x) => {
              x.nav = v;
            })
          }
        />
        <FieldRow columns={3}>
          <TextField
            label={S.statPosts}
            value={a.posts}
            max={LIMITS.count}
            onChange={(v) =>
              setAcc((x) => {
                x.posts = v;
              })
            }
          />
          <TextField
            label={S.statFollowers}
            value={a.followers}
            max={LIMITS.count}
            onChange={(v) =>
              setAcc((x) => {
                x.followers = v;
              })
            }
          />
          <TextField
            label={S.statFollowing}
            value={a.following}
            max={LIMITS.count}
            onChange={(v) =>
              setAcc((x) => {
                x.following = v;
              })
            }
          />
        </FieldRow>
        <TextField
          label={S.category}
          value={a.category}
          max={LIMITS.category}
          onChange={(v) =>
            setAcc((x) => {
              x.category = v;
            })
          }
        />
        <TextField
          label={S.bio}
          rows={3}
          value={a.bio}
          max={LIMITS.bio}
          onChange={(v) =>
            setAcc((x) => {
              x.bio = v;
            })
          }
        />
        <TextField
          label={S.link}
          value={a.link}
          max={LIMITS.link}
          onChange={(v) =>
            setAcc((x) => {
              x.link = v;
            })
          }
        />
        <TextField
          label={S.mutual}
          value={a.mutual}
          max={LIMITS.mutual}
          onChange={(v) =>
            setAcc((x) => {
              x.mutual = v;
            })
          }
        />
      </Section>
      <Section title={S.sectionHighlights} persistKey="social-post:highlights">
        <Check
          label={S.showHL}
          checked={a.showHL}
          onChange={(v) =>
            setAcc((x) => {
              x.showHL = v;
            })
          }
        />
        {a.highlights.length ? (
          <ol aria-label={S.sectionHighlights} className="m-0 flex list-none flex-col gap-2 p-0">
            {a.highlights.map((h, i) => (
              <HighlightCard key={h.id} h={h} i={i} />
            ))}
          </ol>
        ) : null}
        <div>
          <Button
            icon={<Plus />}
            disabled={a.highlights.length >= MAX.highlights}
            onClick={() =>
              setAcc((x) => {
                x.highlights.push({
                  id: nextId(
                    'h',
                    x.highlights.map((h) => h.id),
                  ),
                  title: S.highlightDefault,
                  image: null,
                  story: null,
                });
              })
            }
          >
            {S.addHighlight}
          </Button>
        </div>
        {a.highlights.length >= MAX.highlights ? (
          <p className="m-0 text-xs text-muted">{S.highlightsFull(MAX.highlights)}</p>
        ) : null}
      </Section>
      <Section title={S.sectionGrid} description={S.gridHint} persistKey="social-post:grid">
        <FileDrop
          aria-label={S.sectionGrid}
          accept="image/*"
          multiple
          paste="off"
          compact={a.grid.length > 0}
          filterByAccept={false}
          label={S.addPhotos}
          buttonLabel={S.addPhotos}
          onFiles={(files) => void addImageFiles(files, { kind: 'grid' }).then(notify)}
        />
        <div>
          <Button
            size="sm"
            icon={<Link2 />}
            onClick={() => openUrlDialog({ kind: 'grid' }, S.sectionGrid)}
          >
            {S.addPhotosUrl}
          </Button>
        </div>
        <ThumbnailList
          aria-label={S.gridList}
          items={a.grid.map((g, i) => ({
            id: g.id,
            name: g.image.kind === 'asset' && g.image.name ? g.image.name : S.photoName(i + 1),
            image: thumbSource(g.image),
          }))}
          empty={<p className="m-0 text-xs text-muted">{S.gridEmpty}</p>}
          minItemWidth={78}
          thumbFit="cover"
          onRemove={(id) =>
            setAcc((x) => {
              x.grid = x.grid.filter((g) => g.id !== id);
            })
          }
          onReorder={(from, to) =>
            setAcc((x) => {
              const [g] = x.grid.splice(from, 1);
              x.grid.splice(to, 0, g);
            })
          }
        />
        {a.grid.length >= MAX.grid ? (
          <p className="m-0 text-xs text-muted">{S.gridFull(MAX.grid)}</p>
        ) : null}
        <Field label={S.placeholders} hint={S.placeholdersHint}>
          <NumberInput
            value={a.placeholders}
            min={PLACEHOLDER_RANGE[0]}
            max={PLACEHOLDER_RANGE[1]}
            step={1}
            precision={0}
            onChange={(v) =>
              setAcc((x) => {
                x.placeholders = Math.round(v);
              })
            }
          />
        </Field>
      </Section>
      <ResetButton
        label={S.resetProfile}
        confirmText={S.confirmResetProfile}
        onReset={() =>
          edit((d) => {
            const fresh = defaultAccount();
            const ids = new Set(d.stories.map((s) => s.id));
            for (const h of fresh.highlights) if (h.story && !ids.has(h.story)) h.story = null;
            d.account = fresh;
          })
        }
      />
    </div>
  );
}
