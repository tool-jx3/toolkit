/**
 * 私訊分頁（F134～F145）：顯示的畫面（訊息列表／對話）、我的泡泡顏色、對話（清單與欄位）、目前對話的訊息、私訊回到預設。
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useAssetBitmaps } from '@/core/assets';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  IconButton,
  Section,
  Segmented,
  ThumbnailImage,
  useToast,
} from '@/ui';
import { Check, ImageButtons, ListBar, ResetButton, TextField } from '../controls';
import {
  addMessage,
  addThread,
  BUBBLE_PRESETS,
  defaultDm,
  duplicateThread,
  LIMITS,
  MAX,
  MESSAGE_FROM,
  type Message,
  type MessageFrom,
  moveMessage,
  moveThread,
  removeMessage,
  removeThread,
  type Thread,
  threadTitle,
} from '../model';
import { thumbSource } from '../render/screens';
import {
  assets,
  type DmView,
  edit,
  gesture,
  setPrefs,
  useCurrentThread,
  useDoc,
  usePrefs,
} from '../store';
import { S } from '../strings';

const editThread = (id: string, recipe: (t: Thread) => void) =>
  edit((d) => {
    const t = d.dm.threads.find((x) => x.id === id);
    if (t) recipe(t);
  });

function BubbleSection() {
  const dm = useDoc((s) => s.data.dm);
  return (
    <Section title={S.sectionBubble} persistKey="social-post:dm-bubble">
      <div role="radiogroup" aria-label={S.sectionBubble} className="flex flex-wrap gap-2">
        {BUBBLE_PRESETS.map(([a, b, name]) => {
          const on = dm.c1 === a && dm.c2 === b;
          return (
            // biome-ignore lint/a11y/useSemanticElements: 色票用按鈕＋radio 角色（有底色的圓）
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={name}
              title={name}
              onClick={() =>
                edit((d) => {
                  d.dm.c1 = a;
                  d.dm.c2 = b;
                })
              }
              className="size-8 rounded-full border-2 border-surface outline-none ring-1 ring-border-strong focus-visible:ring-2 focus-visible:ring-focus aria-checked:ring-2 aria-checked:ring-accent"
              style={{ background: `linear-gradient(180deg, ${a}, ${b})` }}
            />
          );
        })}
      </div>
      <FieldRow columns={2}>
        <Field label={S.bubbleTop}>
          <ColorField
            value={dm.c1}
            onChange={gesture.live((v: string) =>
              edit((d) => {
                d.dm.c1 = v;
              }),
            )}
          />
        </Field>
        <Field label={S.bubbleBottom}>
          <ColorField
            value={dm.c2}
            onChange={gesture.live((v: string) =>
              edit((d) => {
                d.dm.c2 = v;
              }),
            )}
          />
        </Field>
      </FieldRow>
      <p className="m-0 text-xs text-muted">{S.bubbleHint}</p>
    </Section>
  );
}

function ThreadSection({ t }: { t: Thread }) {
  const threads = useDoc((s) => s.data.dm.threads);
  const toast = useToast();
  const src = thumbSource(t.avatar);
  const set = (recipe: (x: Thread) => void) => editThread(t.id, recipe);
  return (
    <Section title={S.sectionThreads} persistKey="social-post:dm-threads">
      <ListBar
        ids={threads.map((x) => x.id)}
        currentId={t.id}
        chip={S.threadChip}
        labels={threads.map(threadTitle)}
        ariaLabel={S.sectionThreads}
        onPick={(id) => setPrefs({ threadId: id })}
        addLabel={S.addThread}
        full={threads.length >= MAX.threads ? S.threadsFull(MAX.threads) : null}
        onAdd={() => {
          let id: string | null = null;
          edit((d) => {
            id = addThread(d);
          });
          if (id) setPrefs({ threadId: id });
        }}
        onMove={(delta) => edit((d) => void moveThread(d, t.id, delta))}
        onDuplicate={() => {
          let id: string | null = null;
          edit((d) => {
            id = duplicateThread(d, t.id);
          });
          if (id) {
            setPrefs({ threadId: id });
            toast({ title: S.threadDuplicated, tone: 'success' });
          }
        }}
        onRemove={() => {
          let next: string | null = null;
          edit((d) => {
            next = removeThread(d, t.id);
          });
          if (next) setPrefs({ threadId: next });
        }}
        confirmRemove={S.confirmRemoveThread(threadTitle(t))}
      />
      <Field label={S.threadAvatar}>
        <div className="flex items-center gap-3">
          <span
            className="size-10 shrink-0 overflow-hidden rounded-full bg-surface-3"
            data-testid="thread-avatar"
          >
            {src ? <ThumbnailImage source={src} /> : null}
          </span>
          <ImageButtons
            target={{ kind: 'thread-avatar', threadId: t.id }}
            hasImage={!!t.avatar}
            label={S.threadAvatar}
            onRemove={() =>
              set((x) => {
                x.avatar = null;
              })
            }
          />
        </div>
      </Field>
      <FieldRow columns={2}>
        <TextField
          label={S.threadUsername}
          value={t.username}
          max={LIMITS.username}
          onChange={(v) =>
            set((x) => {
              x.username = v;
            })
          }
        />
        <TextField
          label={S.threadName}
          hint={S.threadNameHint}
          value={t.name}
          max={LIMITS.threadName}
          onChange={(v) =>
            set((x) => {
              x.name = v;
            })
          }
        />
        <TextField
          label={S.threadTime}
          value={t.time}
          max={LIMITS.threadTime}
          onChange={(v) =>
            set((x) => {
              x.time = v;
            })
          }
        />
        <TextField
          label={S.threadActive}
          placeholder={S.threadActivePh}
          value={t.active}
          max={LIMITS.threadActive}
          onChange={(v) =>
            set((x) => {
              x.active = v;
            })
          }
        />
      </FieldRow>
      <TextField
        label={S.threadPreview}
        hint={S.threadPreviewHint}
        value={t.preview}
        max={LIMITS.threadPreview}
        onChange={(v) =>
          set((x) => {
            x.preview = v;
          })
        }
      />
      <TextField
        label={S.threadSeen}
        hint={S.threadSeenHint}
        placeholder={S.threadSeenPh}
        value={t.seen}
        max={LIMITS.threadSeen}
        onChange={(v) =>
          set((x) => {
            x.seen = v;
          })
        }
      />
      <Check
        label={S.threadUnread}
        checked={t.unread}
        onChange={(v) =>
          set((x) => {
            x.unread = v;
          })
        }
      />
      <Check
        label={S.threadOnline}
        checked={t.online}
        onChange={(v) =>
          set((x) => {
            x.online = v;
          })
        }
      />
      <Check
        label={S.threadVerified}
        checked={t.verified}
        onChange={(v) =>
          set((x) => {
            x.verified = v;
          })
        }
      />
      <Check
        label={S.threadIntro}
        checked={t.intro}
        onChange={(v) =>
          set((x) => {
            x.intro = v;
          })
        }
      />
    </Section>
  );
}

function MessageCard({ t, m, i, n }: { t: Thread; m: Message; i: number; n: number }) {
  const title = S.messageTitle(i + 1, S.msgFrom[m.from]);
  const set = (recipe: (x: Message) => void) =>
    editThread(t.id, (x) => {
      const y = x.messages.find((it) => it.id === m.id);
      if (y) recipe(y);
    });
  return (
    <li
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface px-2.5 py-2"
      data-message={m.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-fg">{title}</h3>
        <IconButton
          label={`${title}：${S.moveUp}`}
          icon={<ArrowUp />}
          size="sm"
          variant="ghost"
          disabled={i === 0}
          onClick={() => editThread(t.id, (x) => void moveMessage(x, m.id, -1))}
        />
        <IconButton
          label={`${title}：${S.moveDown}`}
          icon={<ArrowDown />}
          size="sm"
          variant="ghost"
          disabled={i === n - 1}
          onClick={() => editThread(t.id, (x) => void moveMessage(x, m.id, 1))}
        />
        <IconButton
          label={`${title}：${S.remove}`}
          icon={<Trash2 />}
          size="sm"
          variant="ghost"
          onClick={() => editThread(t.id, (x) => removeMessage(x, m.id))}
        />
      </div>
      <Segmented<MessageFrom>
        aria-label={`${title}：${S.msgFromLabel}`}
        value={m.from}
        onValueChange={(v) =>
          /* 改成時間時照片、反應、長的內容只是不畫，改回來還在（同原作） */
          set((x) => {
            x.from = v;
          })
        }
        options={MESSAGE_FROM.map((v) => ({ value: v, label: S.msgFrom[v] }))}
        size="sm"
      />
      {m.from === 'time' ? (
        <TextField
          label={S.msgTime}
          ariaLabel={`${title}：${S.msgTime}`}
          value={m.text}
          max={LIMITS.messageTime}
          onChange={(v) =>
            set((x) => {
              x.text = v;
            })
          }
        />
      ) : (
        <>
          <TextField
            label={S.msgText}
            ariaLabel={`${title}：${S.msgText}`}
            rows={2}
            value={m.text}
            max={LIMITS.message}
            onChange={(v) =>
              set((x) => {
                x.text = v;
              })
            }
          />
          <Field label={S.msgPhoto}>
            <ImageButtons
              target={{ kind: 'message-image', threadId: t.id, messageId: m.id }}
              hasImage={!!m.image}
              label={`${title}：${S.msgPhoto}`}
              onRemove={() =>
                set((x) => {
                  x.image = null;
                })
              }
            />
          </Field>
          <TextField
            label={S.msgReact}
            ariaLabel={`${title}：${S.msgReact}`}
            hint={S.msgReactHint}
            value={m.react}
            max={LIMITS.react}
            onChange={(v) =>
              set((x) => {
                x.react = v;
              })
            }
          />
        </>
      )}
    </li>
  );
}

function MessagesSection({ t }: { t: Thread }) {
  const full = t.messages.length >= MAX.messages;
  const add = (from: MessageFrom) => edit((d) => void addMessage(d, t.id, from));
  return (
    <Section
      title={S.sectionMessages}
      description={S.messagesHint(threadTitle(t))}
      persistKey="social-post:dm-messages"
    >
      {t.messages.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.sectionMessages}>
          {t.messages.map((m, i) => (
            <MessageCard key={m.id} t={t} m={m} i={i} n={t.messages.length} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-xs text-muted">{S.messagesEmpty}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon={<Plus />} disabled={full} onClick={() => add('me')}>
          {S.addMsgMe}
        </Button>
        <Button size="sm" icon={<Plus />} disabled={full} onClick={() => add('them')}>
          {S.addMsgThem}
        </Button>
        <Button size="sm" icon={<Plus />} disabled={full} onClick={() => add('time')}>
          {S.addMsgTime}
        </Button>
      </div>
      {full ? <p className="m-0 text-xs text-muted">{S.messagesFull(MAX.messages)}</p> : null}
    </Section>
  );
}

export function DmPanel() {
  const view = usePrefs((p) => p.data.dmView);
  const t = useCurrentThread();
  const threads = useDoc((s) => s.data.dm.threads);
  useAssetBitmaps(
    assets,
    threads.flatMap((x) => [
      ...(x.avatar?.kind === 'asset' ? [x.avatar.id] : []),
      ...x.messages.flatMap((m) => (m.image?.kind === 'asset' ? [m.image.id] : [])),
    ]),
  );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sectionDmView} persistKey="social-post:dm-view">
        <Segmented<DmView>
          aria-label={S.sectionDmView}
          value={view}
          onValueChange={(v) => setPrefs({ dmView: v })}
          options={(['list', 'chat'] as const).map((v) => ({ value: v, label: S.dmViews[v] }))}
          fullWidth
        />
      </Section>
      <BubbleSection />
      <ThreadSection t={t} />
      <MessagesSection t={t} />
      <ResetButton
        label={S.resetDm}
        confirmText={S.confirmResetDm}
        onReset={() => {
          edit((d) => {
            d.dm = defaultDm();
          });
          setPrefs({ threadId: 't1', dmView: 'list' });
        }}
      />
    </div>
  );
}
