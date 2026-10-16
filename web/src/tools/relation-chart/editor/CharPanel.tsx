/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 角色的編輯面板（原作的角色編輯：身分、頭像、外觀、進階）。改動立刻套用（D10），文字欄離開才記一步。
 * 名字、頭像、顏色、形狀、框、外框、背景、尺寸、標籤、數值寫在目前穿的變體上（第三批；同一件變體的其他角色跟著變），
 * 角色資訊與字型寫在條目上，座標、重要度、釘選、關係線忽略留在這位角色身上。
 */
import { Copy, Crop, Link2, Minus, Plus, Smile, Trash2, Upload, X } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { pickFiles } from '@/core/files';
import { Button, Field, IconButton, Section, Segmented, TextInput, Toggle, useToast } from '@/ui';
import {
  borderFlags,
  charBgFillColor,
  charHasBg,
  charHasBorder,
  charLevel,
  charRingColor,
  displayName,
  type SheetCtx,
} from '../engine/geom';
import { CHAR_ICONS } from '../engine/icons';
import { labelColor } from '../engine/labels';
import { charHasLabel } from '../model/charLabels';
import { typeLabel } from '../model/factory';
import type { Char, Sheet } from '../model/types';
import {
  addLabel,
  copyChars,
  deleteChars,
  toggleLabel,
  updateChar,
  updateCharSeparate,
} from '../state/actions';
import { avatarFromBlob, fetchImage } from '../state/images';
import { setUi, usePrefs, useProject } from '../state/store';
import { S } from '../strings';
import {
  CharFontField,
  FrameField,
  InfoCardButtons,
  VariantFields,
  ViewsSection,
} from './CharExtras';
import { GrelsOf } from './GrelPanels';
import { useCtx, useHref, useSheet } from './hooks';
import { RadarSection } from './RadarUi';
import { CharThumb } from './thumbs';
import { AutoNumber, Block, ColorPair, LiveText } from './widgets';

const baseName = (name: string) => name.replace(/\.[^.]+$/, '').trim();

/** 頭像換成一張圖（上傳、貼上、網址）；回傳錯誤訊息 */
export async function setAvatarFromBlob(
  id: number,
  blob: Blob,
  name?: string,
): Promise<string | null> {
  try {
    const { avatar, persisted } = await avatarFromBlob(blob, name);
    const useName = usePrefs.getState().data.nameFromFile && name ? baseName(name) : '';
    updateChar(id, (c) => {
      c.avatar = avatar;
      c.icon = null;
      if (useName) c.name = useName;
    });
    return persisted ? null : S.msg.imageNotSaved;
  } catch {
    return S.char.imageFail;
  }
}

function IconPicker({ c }: { c: Char }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button size="sm" icon={<Smile />} data-testid="avatar-icon">
          {S.char.icon}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[min(18rem,calc(100vw-1rem))] rounded-md border border-border bg-surface p-2 shadow-2"
          aria-label={S.char.iconPick}
        >
          <div className="grid grid-cols-6 gap-1">
            {CHAR_ICONS.map((ic) => (
              <button
                key={ic.key}
                type="button"
                title={ic.name}
                aria-label={ic.name}
                aria-pressed={c.icon === ic.key && !c.avatar}
                className={`grid aspect-square place-items-center rounded-sm border text-fg hover:bg-surface-2 ${c.icon === ic.key && !c.avatar ? 'border-accent' : 'border-transparent'}`}
                onClick={() => {
                  updateChar(c.id, (d) => {
                    d.icon = ic.key;
                    d.avatar = null;
                  });
                  setOpen(false);
                }}
                data-testid={`icon-${ic.key}`}
              >
                <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden>
                  {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 內建圖示（固定的向量資料） */}
                  <g dangerouslySetInnerHTML={{ __html: ic.svg }} />
                </svg>
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => {
              updateChar(c.id, (d) => {
                d.icon = null;
              });
              setOpen(false);
            }}
          >
            {S.char.iconNone}
          </Button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AvatarBlock({ c, ctx, sheet }: { c: Char; ctx: SheetCtx; sheet: Sheet }) {
  const href = useHref(sheet);
  const toast = useToast();
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const notify = (m: string | null) => {
    if (m) toast({ title: m, tone: 'warning' });
  };
  const upload = async () => {
    const [f] = await pickFiles({ accept: 'image/*' });
    if (!f) return;
    notify(await setAvatarFromBlob(c.id, f, f.name));
  };
  const fromUrl = async () => {
    const u = url.trim();
    if (!/^(https?:\/\/|data:image\/)/i.test(u)) {
      setErr(S.char.urlBad);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const blob = await fetchImage(u);
      const m = await setAvatarFromBlob(c.id, blob, u.split(/[?#]/)[0].split('/').pop());
      if (m === S.char.imageFail) setErr(S.char.urlFail);
      else {
        notify(m);
        setUrl('');
        setUrlOpen(false);
      }
    } catch {
      setErr(S.char.urlFail);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Block title={S.char.avatar}>
      <div className="flex items-start gap-3">
        <CharThumb ctx={ctx} c={c} href={href} size={64} />
        <div className="flex min-w-0 flex-wrap gap-1">
          <Button
            size="sm"
            icon={<Upload />}
            onClick={() => void upload()}
            data-testid="avatar-upload"
          >
            {S.char.upload}
          </Button>
          <Button
            size="sm"
            icon={<Link2 />}
            onClick={() => setUrlOpen((v) => !v)}
            aria-expanded={urlOpen}
            data-testid="avatar-url"
          >
            {S.char.url}
          </Button>
          <Button
            size="sm"
            icon={<Crop />}
            disabled={!c.avatar?.src}
            onClick={() => setUi({ dialog: 'crop', cropFor: c.id })}
            data-testid="avatar-crop"
          >
            {S.char.crop}
          </Button>
          <IconPicker c={c} />
          <Button
            size="sm"
            icon={<X />}
            disabled={!c.avatar && !c.icon}
            onClick={() =>
              updateChar(c.id, (d) => {
                d.avatar = null;
                d.icon = null;
              })
            }
            data-testid="avatar-clear"
          >
            {S.char.clearAvatar}
          </Button>
        </div>
      </div>
      {urlOpen ? (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <TextInput
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={S.char.urlPh}
              aria-label={S.char.url}
              className="h-8 min-w-0 flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void fromUrl();
                }
              }}
              data-testid="avatar-url-input"
            />
            <Button size="sm" loading={busy} onClick={() => void fromUrl()}>
              {S.char.urlGo}
            </Button>
          </div>
          {busy ? <p className="text-xs text-muted">{S.char.urlLoading}</p> : null}
          {err ? <p className="text-xs text-danger">{err}</p> : null}
        </div>
      ) : null}
      <p className="text-xs text-muted">{S.char.avatarNote}</p>
      <div data-testid="char-show-avatar">
        <Toggle
          checked={!c.noAvatar}
          onCheckedChange={(v) =>
            updateCharSeparate(c.id, (d) => {
              d.noAvatar = !v;
            })
          }
          label={S.char.showAvatar}
        />
      </div>
      {c.noAvatar ? <p className="text-xs text-muted">{S.char.showAvatarHint}</p> : null}
    </Block>
  );
}

function RelsOf({ c, sheet }: { c: Char; sheet: Sheet }) {
  const rows = sheet.rels.filter((r) => r.from === c.id || r.to === c.id);
  if (!rows.length) return <p className="text-xs text-muted">{S.char.relsNone}</p>;
  const name = (id: number) => {
    const x = sheet.chars.find((k) => k.id === id);
    return x ? displayName(x) : '?';
  };
  const byType = sheet.types
    .map((t) => ({ t, list: rows.filter((r) => r.type === t.id) }))
    .filter((g) => g.list.length);
  return (
    <div className="flex flex-col gap-1">
      {byType.map(({ t, list }) => (
        <details key={t.id} open className="rounded-md border border-border">
          <summary className="cursor-pointer px-2 py-1 text-sm">
            {typeLabel(t, sheet.types)} <span className="text-xs text-muted">{list.length}</span>
          </summary>
          <ul className="px-1 pb-1">
            {list.map((r) => {
              const self = r.from === r.to;
              const mine = r.from === c.id;
              const arrow = self ? '↻' : r.both ? '⇄' : mine ? '→' : '←';
              const other = self ? S.char.self : name(mine ? r.to : r.from);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left text-sm hover:bg-surface-2"
                    title={S.char.relsOpen}
                    onClick={() =>
                      setUi({ panel: { kind: 'rel', id: r.id }, focus: { kind: 'edge', id: r.id } })
                    }
                  >
                    <span className="w-4 text-muted">{arrow}</span>
                    <span className="min-w-0 truncate">{other}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </div>
  );
}

/** 標籤色的小圓點 */
function LabelDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full border border-border"
      style={{ background: color }}
      aria-hidden
    />
  );
}

export function LabelChips({ ids }: { ids: readonly number[] }) {
  const sheet = useSheet();
  const ctx = useCtx(sheet);
  const labels = useProject((s) => s.data.labels);
  const [text, setText] = useState('');
  const chars = sheet.chars.filter((c) => ids.includes(c.id));
  const union = labels.filter((l) => chars.some((c) => charHasLabel(c, l.id)));
  const rest = labels.filter((l) => !union.includes(l));
  return (
    <div className="flex flex-col gap-2">
      {union.length ? (
        <ul className="flex flex-wrap gap-1" aria-label={S.char.labels}>
          {union.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2 text-xs"
              data-testid="label-chip"
            >
              <LabelDot color={labelColor(ctx, l)} />
              {l.text}
              <button
                type="button"
                className="grid size-4 place-items-center rounded-full text-muted hover:text-danger [&_svg]:size-3"
                aria-label={S.char.labelRemove(l.text)}
                onClick={() => toggleLabel(ids, l.id, false)}
              >
                <X />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <TextInput
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={S.char.labelPh}
        aria-label={S.char.labels}
        className="h-8 text-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (addLabel(ids, text) !== null) setText('');
          }
        }}
        data-testid="label-input"
      />
      {rest.length ? (
        <fieldset className="m-0 flex flex-wrap gap-1 border-0 p-0" aria-label={S.char.labelPick}>
          {rest.map((l) => (
            <button
              key={l.id}
              type="button"
              className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted hover:text-fg"
              onClick={() => toggleLabel(ids, l.id, true)}
            >
              ＋ <LabelDot color={labelColor(ctx, l)} />
              {l.text}
            </button>
          ))}
        </fieldset>
      ) : null}
      <p className="text-xs text-muted">{S.char.labelHint}</p>
    </div>
  );
}

export function LevelField({
  value,
  onSet,
  onShift,
  mixed,
}: {
  value: number | null;
  onSet: (v: number) => void;
  onShift: (d: number) => void;
  mixed?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : String(value));
  const commit = () => {
    if (draft === null) return;
    const n = Math.trunc(Number(draft));
    if (draft.trim() !== '' && Number.isFinite(n)) onSet(n);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-1">
      <IconButton size="sm" icon={<Minus />} label="−1" onClick={() => onShift(-1)} />
      <TextInput
        value={shown}
        inputMode="numeric"
        placeholder={mixed ? S.batch.mixed : ''}
        aria-label={S.char.level}
        className="h-8 w-20 text-center text-sm tabular-nums"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        data-testid="level-input"
      />
      <IconButton size="sm" icon={<Plus />} label="+1" onClick={() => onShift(1)} />
    </div>
  );
}

export function CharPanel({ id }: { id: number }) {
  const sheet = useSheet();
  const ctx = useCtx(sheet);
  const toast = useToast();
  const nameFromFile = usePrefs((p) => p.data.nameFromFile);
  const c = sheet.chars.find((x) => x.id === id);
  if (!c) return null;
  const s = sheet.settings;
  const autoFill = charBgFillColor(ctx, { ...c, nameColor: 'auto' });
  const autoRing = charRingColor(ctx, { ...c, color: 'auto' });
  return (
    <div
      className="flex flex-col gap-3"
      data-testid="char-panel"
      onPaste={(e) => {
        const item = [...e.clipboardData.items].find((it) => it.type.startsWith('image/'));
        const f = item?.getAsFile();
        if (!f) return;
        e.preventDefault();
        void setAvatarFromBlob(c.id, f, nameFromFile ? f.name : undefined).then((m) => {
          if (m) toast({ title: m, tone: 'warning' });
        });
      }}
    >
      <Block>
        <Field label={S.char.name} hint={S.char.nameHint}>
          <LiveText
            multiline
            rows={2}
            value={c.name}
            placeholder={displayName(c)}
            onChange={(v) =>
              updateChar(c.id, (d) => {
                d.name = v.slice(0, 500);
              })
            }
            data-testid="char-name"
          />
        </Field>
      </Block>
      <AvatarBlock c={c} ctx={ctx} sheet={sheet} />
      <Block title={S.char.colors}>
        <ColorPair
          a={c.nameColor}
          b={c.color}
          labels={[S.char.fill, S.char.ring]}
          autoA={autoFill}
          autoB={autoRing}
          onA={(v) =>
            updateChar(c.id, (d) => {
              d.nameColor = v;
            })
          }
          onB={(v) =>
            updateChar(c.id, (d) => {
              d.color = v;
            })
          }
          onSwap={() =>
            updateChar(c.id, (d) => {
              const t = d.color;
              d.color = d.nameColor;
              d.nameColor = t;
            })
          }
          testId="char-colors"
        />
      </Block>
      <Section title={S.char.advanced} defaultOpen={false} persistKey="relation-chart:char-adv">
        <div className="flex flex-col gap-3">
          <VariantFields c={c} />
          <div data-testid="char-lock">
            <Toggle
              checked={c.locked}
              onCheckedChange={(v) =>
                updateChar(c.id, (d) => {
                  d.locked = v;
                })
              }
              label={S.char.lock}
            />
          </div>
          <Toggle
            checked={c.relIgnore}
            onCheckedChange={(v) =>
              updateChar(c.id, (d) => {
                d.relIgnore = v;
              })
            }
            label={S.char.relIgnore}
          />
          <Field label={S.char.shape}>
            <Segmented
              size="sm"
              value={c.shape || 'auto'}
              onValueChange={(v) =>
                updateCharSeparate(c.id, (d) => {
                  d.shape = v === 'auto' ? '' : v;
                })
              }
              options={[
                { value: 'auto', label: S.char.shapeAuto },
                { value: 'circle', label: S.char.shapeCircle },
                { value: 'square', label: S.char.shapeSquare },
              ]}
            />
          </Field>
          <FrameField c={c} ctx={ctx} />
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Toggle
              checked={charHasBorder(ctx, c)}
              onCheckedChange={(v) =>
                updateChar(c.id, (d) => void Object.assign(d, borderFlags(s, 'border', v)))
              }
              label={S.char.border}
            />
            <Toggle
              checked={charHasBg(ctx, c)}
              onCheckedChange={(v) =>
                updateChar(c.id, (d) => void Object.assign(d, borderFlags(s, 'bg', v)))
              }
              label={S.char.bg}
            />
          </div>
          <Field label={S.variant.sizeSec} hint={S.char.sizeHint}>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1 text-xs text-muted">
                {S.char.avatarSize}
                <AutoNumber
                  value={c.size}
                  min={32}
                  max={2000}
                  aria-label={S.char.avatarSize}
                  onChange={(v) =>
                    updateCharSeparate(c.id, (d) => {
                      d.size = v;
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1 text-xs text-muted">
                {S.char.nameSize}
                <AutoNumber
                  value={c.nameSize}
                  min={1}
                  max={400}
                  aria-label={S.char.nameSize}
                  onChange={(v) =>
                    updateChar(c.id, (d) => {
                      d.nameSize = v;
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1 text-xs text-muted">
                {S.char.borderW}
                <AutoNumber
                  value={c.borderW}
                  min={1}
                  max={100}
                  aria-label={S.char.borderW}
                  onChange={(v) =>
                    updateChar(c.id, (d) => {
                      d.borderW = v;
                    })
                  }
                />
              </div>
            </div>
          </Field>
          <Field label={S.char.labels}>
            <LabelChips ids={[c.id]} />
          </Field>
          <Field label={S.char.rels}>
            <RelsOf c={c} sheet={sheet} />
          </Field>
          <GrelsOf c={c} />
          <InfoCardButtons c={c} />
          <RadarSection c={c} />
          <Field label={S.char.level} hint={S.char.levelHint}>
            <LevelField
              value={charLevel(c)}
              onSet={(v) =>
                updateCharSeparate(c.id, (d) => {
                  d.level = v;
                })
              }
              onShift={(k) =>
                updateCharSeparate(c.id, (d) => {
                  d.level = charLevel(d as Char) + k;
                })
              }
            />
          </Field>
          <CharFontField c={c} />
          <ViewsSection c={c} sheet={sheet} />
        </div>
      </Section>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<Copy />}
          onClick={() => {
            const [nid] = copyChars([c.id]);
            if (nid) setUi({ panel: { kind: 'char', id: nid } });
          }}
          data-testid="char-copy"
        >
          {S.char.copy}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 />}
          onClick={() => deleteChars([c.id])}
          data-testid="char-delete"
        >
          {S.char.remove}
        </Button>
      </div>
    </div>
  );
}
