/**
 * 留言分頁（F37～F47）：哪一則貼文、疊在貼文上與面板高度、留言清單（每則的欄位與勾選、順序、刪除、新增）、留言回到預設。
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useAssetBitmaps } from '@/core/assets';
import {
  Button,
  Field,
  FieldRow,
  IconButton,
  NumberInput,
  Section,
  Segmented,
  ThumbnailImage,
} from '@/ui';
import { Check, ImageButtons, ResetButton, TextField } from '../controls';
import {
  addComment,
  type Comment,
  defaultComments,
  LIMITS,
  MAX,
  MORE_RANGE,
  moveComment,
  nextId,
  type Post,
  removeComment,
  type SheetHeight,
} from '../model';
import { thumbSource } from '../render/screens';
import { assets, editPost, useCurrentPost, useDoc } from '../store';
import { S } from '../strings';
import { PostListSection } from './PostPanel';

function CommentCard({ post, c, i, n }: { post: Post; c: Comment; i: number; n: number }) {
  const profile = useDoc((s) => s.data.profile);
  const set = (recipe: (x: Comment) => void) =>
    editPost(post.id, (p) => {
      const x = p.sheet.items.find((it) => it.id === c.id);
      if (x) recipe(x);
    });
  const name = c.author ? S.commentAuthorName(profile.username) : c.username || '—';
  const title = S.commentTitle(i + 1, name);
  const avatar = c.author ? profile.avatar : c.avatar;
  const src = thumbSource(avatar);
  return (
    <li
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface px-2.5 py-2"
      data-comment={c.id}
    >
      <div className="flex items-center gap-2">
        <span className="size-8 shrink-0 overflow-hidden rounded-full bg-surface-3">
          {src ? <ThumbnailImage source={src} /> : null}
        </span>
        <h3 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-fg">{title}</h3>
        <IconButton
          label={`${title}：${S.moveUp}`}
          icon={<ArrowUp />}
          size="sm"
          variant="ghost"
          disabled={i === 0}
          onClick={() => editPost(post.id, (p) => void moveComment(p, c.id, -1))}
        />
        <IconButton
          label={`${title}：${S.moveDown}`}
          icon={<ArrowDown />}
          size="sm"
          variant="ghost"
          disabled={i === n - 1}
          onClick={() => editPost(post.id, (p) => void moveComment(p, c.id, 1))}
        />
        <IconButton
          label={`${title}：${S.remove}`}
          icon={<Trash2 />}
          size="sm"
          variant="ghost"
          onClick={() => editPost(post.id, (p) => removeComment(p, c.id))}
        />
      </div>
      {c.author ? (
        <p className="m-0 text-xs text-muted">{S.commentAuthorHint}</p>
      ) : (
        <Field label={S.commentAvatar}>
          <ImageButtons
            target={{ kind: 'comment-avatar', postId: post.id, commentId: c.id }}
            hasImage={!!c.avatar}
            label={`${title}：${S.commentAvatar}`}
            onRemove={() =>
              set((x) => {
                x.avatar = null;
              })
            }
          />
        </Field>
      )}
      <FieldRow columns={2}>
        {c.author ? null : (
          <TextField
            label={S.commentUser}
            ariaLabel={`${title}：${S.commentUser}`}
            value={c.username}
            max={LIMITS.commentUser}
            onChange={(v) =>
              set((x) => {
                x.username = v;
              })
            }
          />
        )}
        <TextField
          label={S.commentTime}
          ariaLabel={`${title}：${S.commentTime}`}
          value={c.time}
          max={LIMITS.commentTime}
          onChange={(v) =>
            set((x) => {
              x.time = v;
            })
          }
        />
      </FieldRow>
      <TextField
        label={S.commentText}
        ariaLabel={`${title}：${S.commentText}`}
        rows={2}
        value={c.text}
        max={LIMITS.commentText}
        onChange={(v) =>
          set((x) => {
            x.text = v;
          })
        }
      />
      <FieldRow columns={2}>
        <TextField
          label={S.commentLikes}
          ariaLabel={`${title}：${S.commentLikes}`}
          value={c.likes}
          max={LIMITS.count}
          onChange={(v) =>
            set((x) => {
              x.likes = v;
            })
          }
        />
        <Field label={S.commentMore}>
          <NumberInput
            aria-label={`${title}：${S.commentMore}`}
            value={c.more}
            min={MORE_RANGE[0]}
            max={MORE_RANGE[1]}
            step={1}
            precision={0}
            onChange={(v) =>
              set((x) => {
                x.more = Math.round(v);
              })
            }
          />
        </Field>
      </FieldRow>
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Check
          label={S.commentAuthor}
          checked={c.author}
          onChange={(v) =>
            set((x) => {
              x.author = v;
            })
          }
        />
        {c.author ? null : (
          <Check
            label={S.commentVerified}
            checked={c.verified}
            onChange={(v) =>
              set((x) => {
                x.verified = v;
              })
            }
          />
        )}
        <Check
          label={S.commentReply}
          checked={c.reply}
          onChange={(v) =>
            set((x) => {
              x.reply = v;
            })
          }
        />
        <Check
          label={S.commentLiked}
          checked={c.liked}
          onChange={(v) =>
            set((x) => {
              x.liked = v;
            })
          }
        />
        <Check
          label={S.commentAuthorLiked}
          checked={c.authorLiked}
          onChange={(v) =>
            set((x) => {
              x.authorLiked = v;
            })
          }
        />
        <Check
          label={S.commentPinned}
          checked={c.pinned}
          onChange={(v) =>
            set((x) => {
              x.pinned = v;
            })
          }
        />
      </div>
    </li>
  );
}

export function CommentsPanel() {
  const post = useCurrentPost();
  const allPosts = useDoc((s) => s.data.posts);
  const items = post.sheet.items;
  useAssetBitmaps(
    assets,
    items.flatMap((c) => (c.avatar?.kind === 'asset' ? [c.avatar.id] : [])),
  );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PostListSection title={S.sectionWhich} />
      <Section title={S.sectionSheet} persistKey="social-post:sheet">
        <Check
          label={S.backdrop}
          hint={S.backdropHint}
          checked={post.sheet.backdrop}
          onChange={(v) =>
            editPost(post.id, (p) => {
              p.sheet.backdrop = v;
            })
          }
        />
        <Field label={S.sheetHeight}>
          <Segmented<SheetHeight>
            value={post.sheet.height}
            onValueChange={(v) =>
              editPost(post.id, (p) => {
                p.sheet.height = v;
              })
            }
            options={(['half', 'full'] as const).map((v) => ({
              value: v,
              label: S.sheetHeights[v],
              disabled: !post.sheet.backdrop,
            }))}
            fullWidth
          />
        </Field>
      </Section>
      <Section title={S.sectionComments} persistKey="social-post:comments">
        {items.length ? (
          <ol aria-label={S.sectionComments} className="m-0 flex list-none flex-col gap-2 p-0">
            {items.map((c, i) => (
              <CommentCard key={c.id} post={post} c={c} i={i} n={items.length} />
            ))}
          </ol>
        ) : (
          <p className="m-0 text-xs text-muted">{S.commentsEmpty}</p>
        )}
        <div>
          <Button
            icon={<Plus />}
            disabled={items.length >= MAX.comments}
            onClick={() =>
              editPost(post.id, (p, d) => {
                addComment(
                  p,
                  d.posts.flatMap((x) => x.sheet.items.map((c) => c.id)),
                );
              })
            }
          >
            {S.addComment}
          </Button>
        </div>
        {items.length >= MAX.comments ? (
          <p className="m-0 text-xs text-muted">{S.commentsFull(MAX.comments)}</p>
        ) : null}
      </Section>
      <ResetButton
        label={S.resetComments}
        confirmText={S.confirmResetComments}
        onReset={() =>
          editPost(post.id, (p) => {
            const used = new Set(
              allPosts.flatMap((x) => (x.id === post.id ? [] : x.sheet.items.map((c) => c.id))),
            );
            const fresh = defaultComments();
            for (const c of fresh) {
              c.id = nextId('c', used);
              used.add(c.id);
            }
            p.sheet.items = fresh;
          })
        }
      />
    </div>
  );
}
