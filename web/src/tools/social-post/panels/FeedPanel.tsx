/**
 * 首頁動態分頁（F116～F122）：上方列（字、未讀數、通知的紅點）、限時動態列（我的限時動態放哪幾則、看過了、
 * 朋友的限時動態）、首頁的貼文（在首頁動態顯示、新增朋友的或自己的貼文）、首頁動態回到預設。
 */
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAssetBitmaps } from '@/core/assets';
import { Button, Section, ThumbnailImage, useConfirm } from '@/ui';
import { Check, ResetButton, TextField } from '../controls';
import {
  addPost,
  addStory,
  defaultFeed,
  type ImageRef,
  LIMITS,
  MAX,
  removeStory,
  type SocialState,
  setMyStory,
  storyCover,
} from '../model';
import { thumbSource } from '../render/screens';
import { assets, edit, setPrefs, setTab, useDoc } from '../store';
import { S } from '../strings';

const setFeed = (recipe: (f: SocialState['feed']) => void) => edit((d) => recipe(d.feed));

function Thumb({ img, round }: { img: ImageRef | null; round?: boolean }) {
  const src = thumbSource(img);
  return (
    <span
      className={`size-9 shrink-0 overflow-hidden bg-surface-3 ${round ? 'rounded-full' : 'rounded-sm'}`}
    >
      {src ? <ThumbnailImage source={src} /> : null}
    </span>
  );
}

function Card({
  img,
  round,
  title,
  sub,
  children,
  testId,
}: {
  img: ImageRef | null;
  round?: boolean;
  title: string;
  sub?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <li
      className="flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-surface px-2.5 py-2"
      data-testid={testId}
    >
      <div className="flex items-center gap-2">
        <Thumb img={img} round={round} />
        <h4 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-fg">
          {title}
          {sub ? <span className="ml-1.5 text-xs font-normal text-muted">{sub}</span> : null}
        </h4>
      </div>
      {children}
    </li>
  );
}

/** 到限時動態分頁編輯那一則 */
const editStoryTab = (id: string) => {
  setPrefs({ storyId: id, sticker: null, cell: 0 });
  setTab('story');
};
const editPostTab = (id: string) => {
  setPrefs({ postId: id });
  setTab('post');
};

function StoriesSection() {
  const stories = useDoc((s) => s.data.stories);
  const my = useDoc((s) => s.data.feed.myStories);
  const confirm = useConfirm();
  const full = stories.length >= MAX.stories;
  const add = (kind: 'mine' | 'friend') => {
    let id: string | null = null;
    edit((d) => {
      id = addStory(d, kind);
    });
    if (id) editStoryTab(id);
  };
  const mine = stories.flatMap((s, k) => (s.friend ? [] : [{ s, k }]));
  const friends = stories.flatMap((s, k) => (s.friend ? [{ s, k }] : []));
  return (
    <Section title={S.sectionTray} persistKey="social-post:feed-tray">
      <h3 className="m-0 text-sm font-semibold text-fg">{S.trayMine}</h3>
      <p className="m-0 text-xs text-muted">{S.trayMineHint}</p>
      {mine.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.trayMine}>
          {mine.map(({ s, k }) => (
            <Card
              key={s.id}
              img={storyCover(s)}
              title={S.storyChip(k + 1)}
              testId={`feed-story-${s.id}`}
            >
              <Check
                label={S.trayInclude}
                checked={my.includes(s.id)}
                onChange={(v) => edit((d) => setMyStory(d, s.id, v))}
              />
              <Check
                label={S.seenShort}
                checked={s.seen}
                onChange={(v) =>
                  edit((d) => {
                    const x = d.stories.find((it) => it.id === s.id);
                    if (x) x.seen = v;
                  })
                }
              />
              <div>
                <Button size="sm" icon={<Pencil />} onClick={() => editStoryTab(s.id)}>
                  {S.editThis}
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-xs text-muted">{S.trayMineEmpty}</p>
      )}
      <div>
        <Button size="sm" icon={<Plus />} disabled={full} onClick={() => add('mine')}>
          {S.addMyStory}
        </Button>
      </div>
      <h3 className="m-0 mt-2 text-sm font-semibold text-fg">{S.trayFriends}</h3>
      <p className="m-0 text-xs text-muted">{S.trayFriendsHint}</p>
      {friends.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.trayFriends}>
          {friends.map(({ s, k }) => (
            <Card
              key={s.id}
              img={s.owner.avatar}
              round
              title={s.owner.username || 'friend'}
              sub={S.storyChip(k + 1)}
              testId={`feed-story-${s.id}`}
            >
              <Check
                label={S.seenShort}
                checked={s.seen}
                onChange={(v) =>
                  edit((d) => {
                    const x = d.stories.find((it) => it.id === s.id);
                    if (x) x.seen = v;
                  })
                }
              />
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" icon={<Pencil />} onClick={() => editStoryTab(s.id)}>
                  {S.editThis}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 />}
                  disabled={stories.length <= 1}
                  onClick={() =>
                    void confirm({ ...S.confirmRemoveStory(k + 1), danger: true }).then((ok) => {
                      if (!ok) return;
                      let next: string | null = null;
                      edit((d) => {
                        next = removeStory(d, s.id);
                      });
                      if (next) setPrefs({ storyId: next, sticker: null, cell: 0 });
                    })
                  }
                >
                  {S.remove}
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-xs text-muted">{S.trayFriendsEmpty}</p>
      )}
      <div>
        <Button size="sm" icon={<Plus />} disabled={full} onClick={() => add('friend')}>
          {S.addFriendStory}
        </Button>
      </div>
      {full ? <p className="m-0 text-xs text-muted">{S.storiesFull(MAX.stories)}</p> : null}
    </Section>
  );
}

function PostsSection() {
  const posts = useDoc((s) => s.data.posts);
  const profile = useDoc((s) => s.data.profile);
  const full = posts.length >= MAX.posts;
  const add = (friend: boolean) => {
    let id: string | null = null;
    edit((d) => {
      id = addPost(d, friend);
    });
    if (id) editPostTab(id);
  };
  return (
    <Section
      title={S.sectionFeedPosts}
      description={S.feedPostsHint}
      persistKey="social-post:feed-posts"
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.sectionFeedPosts}>
        {posts.map((p, k) => (
          <Card
            key={p.id}
            img={p.photos[0]?.image ?? null}
            title={S.postChip(k + 1)}
            sub={`${p.friend ? p.owner.username || 'friend' : profile.username}・${p.friend ? S.friendTag : S.mineTag}`}
            testId={`feed-post-${p.id}`}
          >
            <Check
              label={S.inFeed}
              checked={p.inFeed}
              onChange={(v) =>
                edit((d) => {
                  const x = d.posts.find((it) => it.id === p.id);
                  if (x) x.inFeed = v;
                })
              }
            />
            <div>
              <Button size="sm" icon={<Pencil />} onClick={() => editPostTab(p.id)}>
                {S.editThis}
              </Button>
            </div>
          </Card>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon={<Plus />} disabled={full} onClick={() => add(true)}>
          {S.addFriendPost}
        </Button>
        <Button size="sm" icon={<Plus />} disabled={full} onClick={() => add(false)}>
          {S.addMyPost}
        </Button>
      </div>
      {full ? <p className="m-0 text-xs text-muted">{S.postsFull(MAX.posts)}</p> : null}
    </Section>
  );
}

export function FeedPanel() {
  const feed = useDoc((s) => s.data.feed);
  const stories = useDoc((s) => s.data.stories);
  const posts = useDoc((s) => s.data.posts);
  useAssetBitmaps(assets, [
    ...stories.flatMap((s) => {
      const c = storyCover(s);
      return [
        ...(c?.kind === 'asset' ? [c.id] : []),
        ...(s.owner.avatar?.kind === 'asset' ? [s.owner.avatar.id] : []),
      ];
    }),
    ...posts.flatMap((p) => (p.photos[0]?.image.kind === 'asset' ? [p.photos[0].image.id] : [])),
  ]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sectionFeedTop} persistKey="social-post:feed-top">
        <TextField
          label={S.feedLogo}
          hint={S.feedLogoHint}
          value={feed.logo}
          max={LIMITS.feedLogo}
          onChange={(v) =>
            setFeed((f) => {
              f.logo = v;
            })
          }
        />
        <TextField
          label={S.feedBadge}
          hint={S.feedBadgeHint}
          value={feed.dmBadge}
          max={LIMITS.dmBadge}
          onChange={(v) =>
            setFeed((f) => {
              f.dmBadge = v;
            })
          }
        />
        <Check
          label={S.feedDot}
          checked={feed.heartDot}
          onChange={(v) =>
            setFeed((f) => {
              f.heartDot = v;
            })
          }
        />
      </Section>
      <StoriesSection />
      <PostsSection />
      <ResetButton
        label={S.resetFeed}
        confirmText={S.confirmResetFeed}
        onReset={() =>
          edit((d) => {
            const first = d.stories.find((s) => !s.friend);
            d.feed = defaultFeed(first ? [first.id] : []);
          })
        }
      />
    </div>
  );
}
