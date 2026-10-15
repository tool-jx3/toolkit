/**
 * 設定欄（兩個分頁）：
 * - 卡片：題目（題目文字、關鍵字、補充說明、按鈕文字）、代表圖（放入、調整範圍、縮放、回到初始、拿掉）、
 *   外觀（主題色、格數、底部操作列）；
 * - 動畫：結尾（通過、失敗、錯誤文字、跳出視窗與各自的文字）、播放（游標、點選順序、速度）、動畫預覽。
 */
import { Crop, Image as ImageIcon, ImagePlus, RotateCcw, Shuffle, Trash2 } from 'lucide-react';
import {
  Button,
  ColorField,
  Field,
  FileDrop,
  GestureScope,
  Section,
  Segmented,
  Slider,
  TextArea,
  TextInput,
  Toggle,
  useToast,
} from '@/ui';
import { AnimPreview } from './AnimPreview';
import { useNotify } from './GridOverlay';
import { openFrame, placeFiles } from './media';
import {
  type CaptchaState,
  type ClickOrder,
  COLS,
  type Cols,
  clipChars,
  ENDINGS,
  type Ending,
  LIMITS,
  ORDERS,
  oneLine,
  POP_ICONS,
  type PopIcon,
  SPEEDS,
  type Speed,
  THEME_SWATCHES,
  ZOOM_MAX,
} from './model';
import {
  clearAvatar,
  edit,
  gesture,
  nextOrderSeed,
  setAvatarPlace,
  setAvatarZoom,
  setCols,
  useDoc,
} from './store';
import { S } from './strings';

type TextKey = 'prompt' | 'keyword' | 'note' | 'verify' | 'checkLabel' | 'errorText';

/** 單行文字欄：打字時截到上限，從聚焦到離開算一步復原 */
function LineField({
  k,
  label,
  max,
  hint,
}: {
  k: TextKey;
  label: string;
  max: number;
  hint?: string;
}) {
  const value = useDoc((s) => s.data[k]);
  return (
    <Field label={label} hint={hint}>
      <TextInput
        value={value}
        data-field={k}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) =>
          edit((d) => {
            d[k] = oneLine(e.target.value, max);
          })
        }
      />
    </Field>
  );
}

/* ---------- 卡片 ---------- */

export function TextSection() {
  return (
    <Section title={S.sectionText}>
      <LineField k="prompt" label={S.prompt} max={LIMITS.prompt} />
      <LineField
        k="keyword"
        label={S.keyword}
        max={LIMITS.keyword}
        hint={S.keywordHint(LIMITS.keyword)}
      />
      <LineField k="note" label={S.note} max={LIMITS.note} hint={S.textHint} />
      <LineField k="verify" label={S.verify} max={LIMITS.verify} hint={S.verifyHint} />
    </Section>
  );
}

export function AvatarSection() {
  const avatar = useDoc((s) => s.data.avatar);
  const notify = useNotify();
  const toast = useToast();
  const image = avatar.image;
  const name = !image ? '' : image.kind === 'sample' ? S.sampleName : image.name || '—';
  return (
    <Section title={S.sectionAvatar} description={S.avatarHint}>
      <div data-testid="avatar-load" data-state={image ? 'loaded' : 'empty'}>
        <FileDrop
          aria-label={S.avatarDropArea}
          accept="image/*"
          paste="focus"
          filterByAccept={false}
          compact={!!image}
          icon={image ? <ImageIcon /> : <ImagePlus />}
          label={
            image ? (
              <span className="flex min-w-0" data-testid="avatar-name">
                <span className="shrink-0">{S.currentImage}</span>
                <span className="truncate" title={name}>
                  {name}
                </span>
              </span>
            ) : (
              S.avatarDrop
            )
          }
          hint={S.avatarDropHint}
          buttonLabel={image ? S.changeImage : S.chooseImage}
          onFiles={(files) => void placeFiles(files, { kind: 'avatar' }).then(notify)}
        />
      </div>
      <Field label={S.avatarZoom}>
        <Slider
          value={Math.round(avatar.place.zoom * 100)}
          min={100}
          max={ZOOM_MAX * 100}
          step={1}
          unit="%"
          disabled={!image}
          onChange={gesture.live((v: number) => setAvatarZoom(v / 100))}
          onCommit={gesture.commit}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<Crop />}
          disabled={!image}
          onClick={() =>
            void openFrame({ kind: 'avatar' }).then((ok) => {
              if (!ok) toast({ title: S.imagesMissing, tone: 'warning' });
            })
          }
        >
          {S.adjust}
        </Button>
        <Button
          size="sm"
          icon={<RotateCcw />}
          disabled={!image}
          onClick={() => setAvatarPlace({ zoom: 1, x: 0, y: 0, turns: 0 })}
        >
          {S.avatarReset}
        </Button>
        <Button size="sm" icon={<Trash2 />} disabled={!image} onClick={clearAvatar}>
          {S.avatarRemove}
        </Button>
      </div>
    </Section>
  );
}

/** 一個色點按鈕 */
function Swatch({
  color,
  pressed,
  onClick,
}: {
  color: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={S.themeSwatch(color)}
      aria-pressed={pressed}
      title={color}
      onClick={onClick}
      data-swatch={color}
      className="size-8 shrink-0 rounded-full border-2 border-border-strong outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-focus aria-pressed:border-fg aria-pressed:ring-3 aria-pressed:ring-accent-soft"
      style={{ background: color }}
    />
  );
}

export function LookSection() {
  const theme = useDoc((s) => s.data.theme);
  const cols = useDoc((s) => s.data.cols);
  const showFoot = useDoc((s) => s.data.showFoot);
  const isPreset = (THEME_SWATCHES as readonly string[]).includes(theme);
  const setTheme = (hex: string) =>
    edit((d) => {
      d.theme = hex.slice(0, 7).toLowerCase();
    });
  return (
    <Section title={S.sectionLook}>
      <Field label={S.theme} hint={S.themeHint}>
        <div className="flex flex-col gap-2">
          {/* biome-ignore lint/a11y/useSemanticElements: 一排切換按鈕（色點），不是表單分組 */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={S.theme}>
            {THEME_SWATCHES.map((c) => (
              <Swatch key={c} color={c} pressed={theme === c} onClick={() => setTheme(c)} />
            ))}
          </div>
          <div
            className="flex min-w-0 items-center gap-2"
            data-testid="custom-theme"
            data-active={!isPreset || undefined}
          >
            <span className={isPreset ? 'text-xs text-muted' : 'text-xs font-medium text-fg'}>
              {S.customColor}
            </span>
            <div className="min-w-0 flex-1">
              <GestureScope gesture={gesture}>
                <ColorField
                  aria-label={`${S.theme}：${S.customColor}`}
                  value={theme}
                  swatches={THEME_SWATCHES}
                  onChange={setTheme}
                />
              </GestureScope>
            </div>
          </div>
        </div>
      </Field>
      <Field label={S.cols} hint={S.colsHint}>
        <Segmented<string>
          value={String(cols)}
          onValueChange={(v) => setCols(Number(v) as Cols)}
          options={COLS.map((n) => ({ value: String(n), label: S.colsOption(n) }))}
        />
      </Field>
      <Field label={S.showFoot} hint={S.showFootHint} layout="inline">
        <Toggle
          checked={showFoot}
          onCheckedChange={(on) =>
            edit((d) => {
              d.showFoot = on;
            })
          }
        />
      </Field>
    </Section>
  );
}

/* ---------- 動畫 ---------- */

function PopupFields() {
  const pop = useDoc((s) => s.data.popup);
  const setPop = (patch: Partial<CaptchaState['popup']>) =>
    edit((d) => {
      Object.assign(d.popup, patch);
    });
  return (
    <div className="flex flex-col gap-3" data-testid="popup-fields">
      <Field label={S.popIcon}>
        <Segmented<PopIcon>
          value={pop.icon}
          onValueChange={(icon) => setPop({ icon })}
          options={POP_ICONS.map((v) => ({ value: v, label: S.popIcons[v] }))}
          fullWidth
        />
      </Field>
      <Field label={S.popTitle}>
        <TextInput
          value={pop.title}
          data-field="popTitle"
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => setPop({ title: oneLine(e.target.value, LIMITS.popTitle) })}
        />
      </Field>
      <Field label={S.popMessage} hint={S.popMessageHint(LIMITS.popMessage)}>
        <TextArea
          value={pop.message}
          rows={3}
          data-field="popMessage"
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => setPop({ message: clipChars(e.target.value, LIMITS.popMessage) })}
        />
      </Field>
      <Field label={S.popButton}>
        <TextInput
          value={pop.button}
          data-field="popButton"
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => setPop({ button: oneLine(e.target.value, LIMITS.popButton) })}
        />
      </Field>
    </div>
  );
}

export function EndingSection() {
  const ending = useDoc((s) => s.data.ending);
  return (
    <Section title={S.sectionEnding}>
      <Field label={S.ending} hint={<span data-testid="ending-desc">{S.endingDesc[ending]}</span>}>
        <Segmented<Ending>
          value={ending}
          onValueChange={(v) =>
            edit((d) => {
              d.ending = v;
            })
          }
          options={ENDINGS.map((v) => ({ value: v, label: S.endings[v] }))}
          fullWidth
        />
      </Field>
      {ending === 'pass' || ending === 'fail' ? (
        <LineField k="checkLabel" label={S.checkLabel} max={LIMITS.check} />
      ) : null}
      {ending === 'error' ? (
        <LineField k="errorText" label={S.errorText} max={LIMITS.errorText} hint={S.textHint} />
      ) : null}
      {ending === 'popup' ? <PopupFields /> : null}
    </Section>
  );
}

export function PlaySection() {
  const cursor = useDoc((s) => s.data.cursor);
  const order = useDoc((s) => s.data.order);
  const speed = useDoc((s) => s.data.speed);
  return (
    <Section title={S.sectionPlay}>
      <Field label={S.cursor} hint={S.cursorHint} layout="inline">
        <Toggle
          checked={cursor}
          onCheckedChange={(on) =>
            edit((d) => {
              d.cursor = on;
            })
          }
        />
      </Field>
      <Field label={S.order} hint={S.orderHint}>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<ClickOrder>
            value={order}
            onValueChange={(v) =>
              edit((d) => {
                d.order = v;
              })
            }
            options={ORDERS.map((v) => ({ value: v, label: S.orders[v] }))}
          />
          {order === 'random' ? (
            <Button size="sm" icon={<Shuffle />} onClick={nextOrderSeed}>
              {S.reshuffle}
            </Button>
          ) : null}
        </div>
      </Field>
      <Field label={S.speed}>
        <Segmented<Speed>
          value={speed}
          onValueChange={(v) =>
            edit((d) => {
              d.speed = v;
            })
          }
          options={SPEEDS.map((v) => ({ value: v, label: S.speeds[v] }))}
        />
      </Field>
    </Section>
  );
}

export function MiniSection({ onExportGif }: { onExportGif: () => void }) {
  return (
    <Section title={S.sectionMini}>
      <AnimPreview onExportGif={onExportGif} />
    </Section>
  );
}
