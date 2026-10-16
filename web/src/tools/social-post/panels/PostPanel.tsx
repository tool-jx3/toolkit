/**
 * 貼文分頁（F13～F36）：貼文清單、照片（加入、清單、位置與縮放、格狀縮圖、比例）、帳號列、反應、內文、重設這則貼文。
 */
import { Link2 } from 'lucide-react';
import { useAssetBitmaps } from '@/core/assets';
import { DEFAULT_PLACEMENT } from '@/core/image';
import {
  Button,
  Field,
  FieldRow,
  FileDrop,
  Section,
  Segmented,
  Select,
  Slider,
  ThumbnailList,
  useToast,
} from '@/ui';
import {
  Check,
  ListBar,
  openFrame,
  openUrlDialog,
  PlaceButtons,
  ResetButton,
  TextField,
  useNotify,
} from '../controls';
import { addImageFiles, type ImageTarget } from '../media';
import {
  addPost,
  blankPost,
  type CountStyle,
  duplicatePost,
  LIMITS,
  MAX,
  movePhoto,
  movePost,
  nextId,
  type Post,
  RATIO_VALUE,
  RATIOS,
  type Ratio,
  removePhoto,
  removePost,
  ZOOM_MAX,
} from '../model';
import { loadImageSource, thumbSource } from '../render/screens';
import {
  assets,
  docNow,
  edit,
  editPost,
  gesture,
  setPrefs,
  useCurrentPost,
  useDoc,
} from '../store';
import { S } from '../strings';

/** 貼文清單（貼文、留言分頁共用） */
export function PostListSection({ title }: { title: string }) {
  const posts = useDoc((s) => s.data.posts);
  const post = useCurrentPost();
  const toast = useToast();
  return (
    <Section title={title} description={S.postsHint} persistKey="social-post:posts">
      <ListBar
        ids={posts.map((p) => p.id)}
        currentId={post.id}
        chip={S.postChip}
        ariaLabel={S.sectionPosts}
        onPick={(id) => setPrefs({ postId: id })}
        addLabel={S.addPost}
        full={posts.length >= MAX.posts ? S.postsFull(MAX.posts) : null}
        onAdd={() => {
          let id: string | null = null;
          edit((d) => {
            id = addPost(d);
          });
          if (id) setPrefs({ postId: id });
        }}
        onMove={(delta) =>
          edit((d) => {
            movePost(d, post.id, delta);
          })
        }
        onDuplicate={() => {
          let id: string | null = null;
          edit((d) => {
            id = duplicatePost(d, post.id);
          });
          if (id) {
            setPrefs({ postId: id });
            toast({ title: S.postDuplicated, tone: 'success' });
          }
        }}
        onRemove={() => {
          let next: string | null = null;
          edit((d) => {
            next = removePost(d, post.id);
          });
          if (next) setPrefs({ postId: next });
        }}
        confirmRemove={S.confirmRemovePost(posts.indexOf(post) + 1)}
      />
    </Section>
  );
}

function PhotosSection({ post }: { post: Post }) {
  const notify = useNotify();
  const ids = post.photos.flatMap((x) => (x.image.kind === 'asset' ? [x.image.id] : []));
  useAssetBitmaps(assets, ids);
  const cur = post.photos[post.current];
  const target: ImageTarget = { kind: 'post-photos', postId: post.id };
  return (
    <Section title={S.sectionPhotos} persistKey="social-post:photos">
      <FileDrop
        aria-label={S.addPhotos}
        accept="image/*"
        multiple
        paste="off"
        compact={post.photos.length > 0}
        filterByAccept={false}
        label={S.addPhotos}
        buttonLabel={S.addPhotos}
        hint={S.photosHint}
        onFiles={(files) => void addImageFiles(files, target).then(notify)}
      />
      <div>
        <Button size="sm" icon={<Link2 />} onClick={() => openUrlDialog(target, S.addPhotos)}>
          {S.addPhotosUrl}
        </Button>
      </div>
      <ThumbnailList
        aria-label={S.photosList}
        items={post.photos.map((x, i) => ({
          id: x.id,
          name: x.image.kind === 'asset' && x.image.name ? x.image.name : S.photoName(i + 1),
          image: thumbSource(x.image),
        }))}
        empty={<p className="m-0 text-xs text-muted">{S.photosEmpty}</p>}
        minItemWidth={78}
        thumbAspect={RATIO_VALUE[post.ratio]}
        thumbFit="cover"
        selectedId={cur?.id ?? null}
        onSelect={(id) =>
          editPost(post.id, (p) => {
            p.current = Math.max(
              0,
              p.photos.findIndex((x) => x.id === id),
            );
          })
        }
        onRemove={(id) =>
          editPost(post.id, (p) => {
            removePhoto(
              p,
              p.photos.findIndex((x) => x.id === id),
            );
          })
        }
        onReorder={(from, to) =>
          editPost(post.id, (p) => {
            movePhoto(p, from, to);
          })
        }
      />
      {post.photos.length >= MAX.photos ? (
        <p className="m-0 text-xs text-muted">{S.photosFull(MAX.photos)}</p>
      ) : null}
      {cur ? (
        <>
          <Field label={`${S.photoName(post.current + 1)}：${S.zoom}`}>
            <Slider
              value={Math.round(cur.place.zoom * 100)}
              min={100}
              max={ZOOM_MAX * 100}
              unit="%"
              onChange={gesture.live((v: number) =>
                editPost(post.id, (p) => {
                  const ph = p.photos[p.current];
                  if (ph) ph.place = { ...ph.place, zoom: v / 100 };
                }),
              )}
              onCommit={gesture.commit}
            />
          </Field>
          <PlaceButtons
            onAdjust={() =>
              void loadImageSource(cur.image).then((image) => {
                if (!image) return;
                openFrame({
                  image,
                  aspect: RATIO_VALUE[post.ratio],
                  initial: cur.place,
                  title: `${S.frameTitle}：${S.photoName(post.current + 1)}`,
                  onApply: (place) =>
                    editPost(post.id, (p) => {
                      const ph = p.photos.find((x) => x.id === cur.id);
                      if (ph) ph.place = place;
                    }),
                });
              })
            }
            onReset={() =>
              editPost(post.id, (p) => {
                const ph = p.photos.find((x) => x.id === cur.id);
                if (ph) ph.place = { ...DEFAULT_PLACEMENT };
              })
            }
          />
          <Field label={S.thumb} hint={S.thumbHint}>
            <PlaceButtons
              adjustLabel={S.adjustThumb}
              onAdjust={() => {
                const first = post.photos[0];
                if (!first) return;
                void loadImageSource(first.image).then((image) => {
                  if (!image) return;
                  openFrame({
                    image,
                    aspect: 1,
                    initial: post.thumb,
                    title: S.frameThumbTitle,
                    onApply: (place) =>
                      editPost(post.id, (p) => {
                        p.thumb = place;
                      }),
                  });
                });
              }}
              onReset={() =>
                editPost(post.id, (p) => {
                  p.thumb = { ...DEFAULT_PLACEMENT };
                })
              }
            />
          </Field>
        </>
      ) : null}
      <Field label={S.ratio}>
        <Select
          value={post.ratio}
          onValueChange={(v) =>
            editPost(post.id, (p) => {
              p.ratio = v as Ratio;
            })
          }
          options={RATIOS.map((r) => ({ value: r, label: S.ratios[r] }))}
        />
      </Field>
    </Section>
  );
}

export function PostPanel() {
  const post = useCurrentPost();
  const set = (recipe: (p: Post) => void) => editPost(post.id, recipe);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PostListSection title={S.sectionPosts} />
      <PhotosSection post={post} />
      <Section title={S.sectionHeader} persistKey="social-post:header">
        <TextField
          label={S.location}
          hint={S.locationHint}
          value={post.location}
          max={LIMITS.location}
          onChange={(v) =>
            set((p) => {
              p.location = v;
            })
          }
        />
        <TextField
          label={S.collab}
          hint={S.collabHint}
          value={post.collab}
          max={LIMITS.collab}
          onChange={(v) =>
            set((p) => {
              p.collab = v;
            })
          }
        />
        <Check
          label={S.follow}
          checked={post.follow}
          onChange={(v) =>
            set((p) => {
              p.follow = v;
            })
          }
        />
      </Section>
      <Section title={S.sectionReactions} persistKey="social-post:reactions">
        <Field label={S.countStyle}>
          <Segmented<CountStyle>
            value={post.countStyle}
            onValueChange={(v) =>
              set((p) => {
                p.countStyle = v;
              })
            }
            options={(['inline', 'classic'] as const).map((v) => ({
              value: v,
              label: S.countStyles[v],
            }))}
            fullWidth
          />
        </Field>
        <FieldRow columns={2}>
          <TextField
            label={S.likes}
            value={post.likes}
            max={LIMITS.count}
            onChange={(v) =>
              set((p) => {
                p.likes = v;
              })
            }
          />
          <TextField
            label={S.commentsCount}
            value={post.comments}
            max={LIMITS.count}
            onChange={(v) =>
              set((p) => {
                p.comments = v;
              })
            }
          />
          <TextField
            label={S.reposts}
            value={post.reposts}
            max={LIMITS.count}
            onChange={(v) =>
              set((p) => {
                p.reposts = v;
              })
            }
          />
          <TextField
            label={S.shares}
            value={post.shares}
            max={LIMITS.count}
            onChange={(v) =>
              set((p) => {
                p.shares = v;
              })
            }
          />
        </FieldRow>
        <TextField
          label={S.likedBy}
          hint={S.likedByHint}
          value={post.likedBy}
          max={LIMITS.likedBy}
          onChange={(v) =>
            set((p) => {
              p.likedBy = v;
            })
          }
        />
        <Check
          label={S.liked}
          checked={post.liked}
          onChange={(v) =>
            set((p) => {
              p.liked = v;
            })
          }
        />
        <Check
          label={S.saved}
          checked={post.saved}
          onChange={(v) =>
            set((p) => {
              p.saved = v;
            })
          }
        />
        <Check
          label={S.showRepost}
          checked={post.showRepost}
          onChange={(v) =>
            set((p) => {
              p.showRepost = v;
            })
          }
        />
        <Check
          label={S.showShare}
          checked={post.showShare}
          onChange={(v) =>
            set((p) => {
              p.showShare = v;
            })
          }
        />
        <Check
          label={S.commentsOff}
          checked={post.commentsOff}
          onChange={(v) =>
            set((p) => {
              p.commentsOff = v;
            })
          }
        />
      </Section>
      <Section title={S.sectionBody} persistKey="social-post:body">
        <TextField
          label={S.caption}
          hint={S.captionHint}
          rows={5}
          value={post.caption}
          max={LIMITS.caption}
          onChange={(v) =>
            set((p) => {
              p.caption = v;
            })
          }
        />
        <Check
          label={S.collapse}
          checked={post.collapse}
          onChange={(v) =>
            set((p) => {
              p.collapse = v;
            })
          }
        />
        <TextField
          label={S.postTime}
          value={post.time}
          max={LIMITS.postTime}
          onChange={(v) =>
            set((p) => {
              p.time = v;
            })
          }
        />
      </Section>
      <ResetButton
        label={S.resetPost}
        confirmText={S.confirmResetPost}
        onReset={() =>
          edit((d) => {
            const i = d.posts.findIndex((p) => p.id === post.id);
            if (i < 0) return;
            const fresh = blankPost(post.id);
            const used = new Set(
              d.posts.flatMap((p) => (p.id === post.id ? [] : p.sheet.items.map((c) => c.id))),
            );
            for (const c of fresh.sheet.items) {
              c.id = nextId('c', used);
              used.add(c.id);
            }
            d.posts[i] = fresh;
          })
        }
      />
    </div>
  );
}

/** 目前貼文的留言（留言分頁用） */
export const currentPostNow = (id: string): Post | undefined =>
  docNow().posts.find((p) => p.id === id);
