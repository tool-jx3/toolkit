/**
 * 設定欄（三個分頁）：
 * - 訊息：訊息清單（1～4 則：寄件人、收到時間、內容；順序、刪除、加一則）、通知樣式（App 名稱、不透明度、模糊、間隔）；
 * - 手機畫面：桌布（照片、重新裁切、預設桌布、變暗）、鎖定畫面（時間、日期、狀態列）；
 * - 外框構圖：外框背景（照片、重新裁切、預設背景、變暗）、漸層（開關、顏色、方向、長度）、手機的位置。
 *   外框構圖的設定改了就把預覽切到「完整構圖」（F15）。
 */
import {
  ArrowDown,
  ArrowUp,
  Crop,
  Image as ImageIcon,
  ImagePlus,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { type ChangeEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  FileDrop,
  GestureScope,
  IconButton,
  Section,
  Segmented,
  Slider,
  TextArea,
  TextInput,
  Toggle,
  useToast,
} from '@/ui';
import { recrop } from './media';
import {
  APP_NAME_MAX,
  BLUR_RANGE,
  BODY_MAX,
  clipChars,
  DIM_RANGE,
  dateLabel,
  GRADIENT_DIRECTIONS,
  type GradientDirection,
  INTERVAL_RANGE,
  LENGTH_RANGE,
  MESSAGE_MAX,
  normalizeClock,
  OPACITY_RANGE,
  PHONE_SIDES,
  type PhoneSide,
  RECEIVED_MAX,
  SENDER_MAX,
  tidyReceived,
  typeClock,
} from './model';
import { useCardLayouts } from './Preview';
import {
  addMessage,
  clearPhoto,
  docNow,
  edit,
  gesture,
  moveMessage,
  type PhotoSlot,
  patchMessage,
  removeMessage,
  setPrefs,
  useDoc,
} from './store';
import { S } from './strings';

/** 外框構圖的設定：改了之後預覽切到完整構圖 */
const editOuter = (recipe: Parameters<typeof edit>[0]) => {
  edit(recipe);
  setPrefs({ preview: 'full' });
};

/* ---------- 訊息 ---------- */

export function MessagesSection() {
  const messages = useDoc((s) => s.data.messages);
  const cards = useCardLayouts();
  const list = useRef<HTMLOListElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  /* 加一則之後：游標移到新訊息的寄件人 */
  useEffect(() => {
    if (!focusId) return;
    list.current?.querySelector<HTMLInputElement>(`[data-sender="${focusId}"]`)?.focus();
    setFocusId(null);
  }, [focusId]);
  const n = messages.length;
  return (
    <Section
      title={S.sectionMessages}
      actions={
        <span className="text-xs text-muted tabular-nums" data-testid="message-count">
          {S.messageCount(n, MESSAGE_MAX)}
        </span>
      }
    >
      <p className="m-0 text-xs text-muted">{S.messagesHint}</p>
      <ol ref={list} aria-label="訊息清單" className="m-0 flex list-none flex-col gap-2 p-0">
        {messages.map((m, i) => (
          <li
            key={m.id}
            className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface px-2.5 py-2"
            data-message={m.id}
          >
            <div className="flex items-center gap-1">
              <h3 className="m-0 flex-1 text-sm font-semibold text-fg">{S.messageTitle(i + 1)}</h3>
              <IconButton
                label={S.moveUp(i + 1)}
                icon={<ArrowUp />}
                size="sm"
                variant="ghost"
                disabled={i === 0}
                onClick={() => moveMessage(m.id, -1)}
              />
              <IconButton
                label={S.moveDown(i + 1)}
                icon={<ArrowDown />}
                size="sm"
                variant="ghost"
                disabled={i === n - 1}
                onClick={() => moveMessage(m.id, 1)}
              />
              <IconButton
                label={S.removeMessage(i + 1)}
                icon={<Trash2 />}
                size="sm"
                variant="ghost"
                disabled={n <= 1}
                onClick={() => removeMessage(m.id)}
              />
            </div>
            <FieldRow columns={2}>
              <Field label={S.sender}>
                <TextInput
                  data-sender={m.id}
                  aria-label={`${S.messageTitle(i + 1)}：${S.sender}`}
                  value={m.sender}
                  placeholder={S.senderPlaceholder}
                  onFocus={gesture.begin}
                  onBlur={gesture.commit}
                  onChange={(e) =>
                    patchMessage(m.id, { sender: clipChars(e.target.value, SENDER_MAX) })
                  }
                />
              </Field>
              <Field label={S.received}>
                <TextInput
                  aria-label={`${S.messageTitle(i + 1)}：${S.received}`}
                  value={m.received}
                  placeholder={S.receivedPlaceholder}
                  onFocus={gesture.begin}
                  onBlur={(e) => {
                    const tidy = tidyReceived(e.target.value);
                    if (tidy !== m.received) patchMessage(m.id, { received: tidy });
                    gesture.commit();
                  }}
                  onChange={(e) =>
                    patchMessage(m.id, { received: clipChars(e.target.value, RECEIVED_MAX) })
                  }
                />
              </Field>
            </FieldRow>
            <Field label={S.body} error={cards[i]?.clipped ? S.bodyClipped : undefined}>
              <TextArea
                aria-label={`${S.messageTitle(i + 1)}：${S.body}`}
                value={m.body}
                rows={2}
                placeholder={S.bodyPlaceholder}
                onFocus={gesture.begin}
                onBlur={gesture.commit}
                onChange={(e) => patchMessage(m.id, { body: clipChars(e.target.value, BODY_MAX) })}
              />
            </Field>
          </li>
        ))}
      </ol>
      <Button icon={<Plus />} disabled={n >= MESSAGE_MAX} onClick={() => setFocusId(addMessage())}>
        {S.addMessage}
      </Button>
      <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-xs text-muted">
        {n >= MESSAGE_MAX ? (
          <li data-testid="messages-full">{S.messagesFull(MESSAGE_MAX)}</li>
        ) : null}
        <li>{S.receivedHint}</li>
        <li>{S.linesNote}</li>
      </ul>
    </Section>
  );
}

export function CardStyleSection() {
  const appName = useDoc((s) => s.data.appName);
  const opacity = useDoc((s) => s.data.opacity);
  const blur = useDoc((s) => s.data.blur);
  const interval = useDoc((s) => s.data.interval);
  return (
    <Section title={S.sectionCard}>
      <Field label={S.appName} hint={S.appNameHint}>
        <TextInput
          value={appName}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) =>
            edit((d) => {
              d.appName = clipChars(e.target.value, APP_NAME_MAX);
            })
          }
        />
      </Field>
      <Field label={S.opacity}>
        <Slider
          value={opacity}
          min={OPACITY_RANGE.min}
          max={OPACITY_RANGE.max}
          unit="%"
          onChange={gesture.live((v: number) =>
            edit((d) => {
              d.opacity = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.blur}>
        <Slider
          value={blur}
          min={BLUR_RANGE.min}
          max={BLUR_RANGE.max}
          unit="px"
          onChange={gesture.live((v: number) =>
            edit((d) => {
              d.blur = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.interval} hint={S.intervalHint}>
        <Slider
          value={interval}
          min={INTERVAL_RANGE.min}
          max={INTERVAL_RANGE.max}
          step={INTERVAL_RANGE.step}
          unit={S.seconds}
          onChange={gesture.live((v: number) =>
            edit((d) => {
              d.interval = Math.round(v * 10) / 10;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
    </Section>
  );
}

/* ---------- 照片（桌布、外框背景） ---------- */

function PhotoDrop({
  slot,
  onFiles,
  paste,
}: {
  slot: PhotoSlot;
  onFiles: (files: File[]) => void;
  paste: boolean;
}) {
  const photo = useDoc((s) => s.data[slot]);
  const toast = useToast();
  const image = photo.image;
  return (
    <>
      <div data-testid={`${slot}-load`} data-state={image ? 'loaded' : 'empty'}>
        <FileDrop
          aria-label={slot === 'wallpaper' ? S.wallpaperDropArea : S.outerDropArea}
          accept="image/*"
          paste={paste ? 'document' : 'focus'}
          filterByAccept={false}
          compact={!!image}
          icon={image ? <ImageIcon /> : <ImagePlus />}
          label={
            image ? (
              <span className="flex min-w-0" data-testid={`${slot}-name`}>
                <span className="shrink-0">{S.currentPhoto}</span>
                <span className="truncate" title={image.name}>
                  {image.name || '—'}
                </span>
              </span>
            ) : slot === 'wallpaper' ? (
              S.wallpaperDrop
            ) : (
              S.outerDrop
            )
          }
          hint={slot === 'wallpaper' ? S.dropHint : S.outerDropHint}
          buttonLabel={image ? S.changePhoto : S.choosePhoto}
          onFiles={onFiles}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={<Crop />}
          disabled={!image}
          onClick={() =>
            void recrop(slot).then((ok) => {
              if (!ok) toast({ title: S.photoMissing[slot], tone: 'warning' });
            })
          }
        >
          {S.recrop}
        </Button>
        <Button
          icon={<RotateCcw />}
          disabled={!image}
          onClick={() => {
            clearPhoto(slot);
            if (slot === 'outer') setPrefs({ preview: 'full' });
          }}
        >
          {S.useDefault[slot]}
        </Button>
      </div>
    </>
  );
}

export function WallpaperSection({
  onFiles,
  paste,
}: {
  onFiles: (files: File[]) => void;
  paste: boolean;
}) {
  const dim = useDoc((s) => s.data.wallpaper.dim);
  return (
    <Section title={S.sectionWallpaper}>
      <PhotoDrop slot="wallpaper" onFiles={onFiles} paste={paste} />
      <p className="m-0 text-xs text-muted">{S.defaultWallpaperNote}</p>
      <Field label={S.dim}>
        <Slider
          value={dim}
          min={DIM_RANGE.min}
          max={DIM_RANGE.max}
          unit="%"
          onChange={gesture.live((v: number) =>
            edit((d) => {
              d.wallpaper.dim = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <p className="m-0 text-xs text-muted">{S.privacy}</p>
    </Section>
  );
}

/** 時間欄：打字時只留數字、自動加「:」；不合法時標示錯誤，離開時改回上一個合法的時間（F16） */
function ClockField() {
  const time = useDoc((s) => s.data.time);
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const caret = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (caret.current !== null && input.current) {
      input.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });
  const value = draft ?? time;
  const invalid = draft !== null && !normalizeClock(draft);
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const r = typeClock(el.value, el.selectionStart ?? el.value.length);
    caret.current = r.caret;
    setDraft(r.text);
    const ok = normalizeClock(r.text);
    if (ok && ok !== docNow().time)
      edit((d) => {
        d.time = ok;
      });
  };
  return (
    <Field label={S.time} hint={S.timeHint} error={invalid ? S.timeInvalid : undefined}>
      <TextInput
        ref={input}
        value={value}
        inputMode="numeric"
        maxLength={5}
        placeholder="HH:MM"
        autoComplete="off"
        onFocus={() => {
          gesture.begin();
          setDraft(time);
        }}
        onBlur={(e) => {
          const ok = normalizeClock(e.target.value);
          if (!ok) toast({ title: S.timeReverted(docNow().time), tone: 'warning' });
          setDraft(null);
          gesture.commit();
        }}
        onChange={onChange}
      />
    </Field>
  );
}

function DateField() {
  const date = useDoc((s) => s.data.date);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? date;
  const label = dateLabel(value);
  return (
    <Field
      label={S.date}
      hint={label ? <span data-testid="date-label">{S.dateLabel(label)}</span> : undefined}
      error={label ? undefined : S.dateInvalid}
    >
      <TextInput
        type="date"
        value={value}
        onFocus={gesture.begin}
        onBlur={() => {
          setDraft(null);
          gesture.commit();
        }}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          if (dateLabel(v))
            edit((d) => {
              d.date = v;
            });
        }}
      />
    </Field>
  );
}

export function LockSection() {
  const showStatus = useDoc((s) => s.data.showStatus);
  return (
    <Section title={S.sectionLock}>
      <FieldRow columns={2}>
        <ClockField />
        <DateField />
      </FieldRow>
      <Field label={S.showStatus} layout="inline" hint={S.statusHint}>
        <Toggle
          checked={showStatus}
          onCheckedChange={(on) =>
            edit((d) => {
              d.showStatus = on;
            })
          }
        />
      </Field>
    </Section>
  );
}

/* ---------- 外框構圖 ---------- */

export function OuterSection({
  onFiles,
  paste,
}: {
  onFiles: (files: File[]) => void;
  paste: boolean;
}) {
  const dim = useDoc((s) => s.data.outer.dim);
  return (
    <Section title={S.sectionOuter}>
      <p className="m-0 text-xs text-muted">{S.outerHint}</p>
      <PhotoDrop slot="outer" onFiles={onFiles} paste={paste} />
      <p className="m-0 text-xs text-muted">{S.defaultOuterNote}</p>
      <Field label={S.outerDim}>
        <Slider
          value={dim}
          min={DIM_RANGE.min}
          max={DIM_RANGE.max}
          unit="%"
          onChange={gesture.live((v: number) =>
            editOuter((d) => {
              d.outer.dim = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
    </Section>
  );
}

const GRADIENT_SWATCHES = [
  '#000000',
  '#ffffff',
  '#1d2b55',
  '#3b2a4a',
  '#5a1f24',
  '#2f4a3a',
] as const;

export function GradientSection() {
  const g = useDoc((s) => s.data.outer.gradient);
  return (
    <Section title={S.sectionGradient}>
      <Field label={S.gradientOn} layout="inline">
        <Toggle
          checked={g.on}
          onCheckedChange={(on) =>
            editOuter((d) => {
              d.outer.gradient.on = on;
            })
          }
        />
      </Field>
      <Field label={S.gradientColor}>
        <GestureScope gesture={gesture}>
          <ColorField
            value={g.color}
            swatches={GRADIENT_SWATCHES}
            onChange={(v) =>
              editOuter((d) => {
                d.outer.gradient.color = v.slice(0, 7).toLowerCase();
              })
            }
          />
        </GestureScope>
      </Field>
      <Field label={S.gradientDirection}>
        <Segmented<GradientDirection>
          value={g.direction}
          onValueChange={(v) =>
            editOuter((d) => {
              d.outer.gradient.direction = v;
            })
          }
          options={GRADIENT_DIRECTIONS.map((v) => ({
            value: v,
            label: S.directions[v],
            ariaLabel: S.directionAria[v],
          }))}
          fullWidth
        />
      </Field>
      <Field label={S.gradientLength}>
        <Slider
          value={g.length}
          min={LENGTH_RANGE.min}
          max={LENGTH_RANGE.max}
          unit="%"
          onChange={gesture.live((v: number) =>
            editOuter((d) => {
              d.outer.gradient.length = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
    </Section>
  );
}

export function PhoneSection() {
  const side = useDoc((s) => s.data.outer.side);
  return (
    <Section title={S.sectionPhone}>
      <Field label={S.phoneSide}>
        <Segmented<PhoneSide>
          value={side}
          onValueChange={(v) =>
            editOuter((d) => {
              d.outer.side = v;
            })
          }
          options={PHONE_SIDES.map((v) => ({ value: v, label: S.sides[v] }))}
          fullWidth
        />
      </Field>
    </Section>
  );
}
