/**
 * 詳細設定的四個分頁（F95）：基本、外觀、插圖、進階。只在相關時出現的設定用 Show／條件包起來（F14，隱藏時設定值保留）。
 */
import { ImageUp, Link2, Plus, RotateCcw, Trash2, UserRound, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { formatLimitBytes, pickFiles } from '@/core/files';
import {
  Button,
  Checkbox,
  ColorField,
  Field,
  FieldRow,
  IconButton,
  NativeNumberInput,
  Notice,
  NumberInput,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  TextInput,
  Toggle,
  useToast,
} from '@/ui';
import {
  addIllustration,
  clearProfile,
  removeIllustration,
  renameTab,
  scheduleReprocess,
  setProfileUrl,
  totalAvatarBytes,
  uploadIllustration,
  uploadProfile,
} from './actions';
import { channelCounts, sourceSpeakers, sourceTabs } from './load';
import { DEFAULT_NARRATOR } from './pipeline';
import {
  COLOR_PRESETS,
  CUSTOM_PRESET,
  customSizeEstimate,
  DEFAULT_SUB_NARRATOR_COLOR,
  DEFAULT_TAB_TEXT,
  FONT_SIZES,
  type LcSettings,
  LINE_HEIGHTS,
  PAGE_WIDTHS,
  type Palette,
  presetById,
  type QualityPreset,
  type SubNarratorStyle,
  type TabStyle,
} from './settings';
import {
  blankProfile,
  patchSettings,
  setChoices,
  setProfile,
  updateIllustration,
  useSession,
  useSettings,
} from './store';
import { S } from './strings';

const useS = <K extends keyof LcSettings>(k: K): LcSettings[K] => useSettings((st) => st.data[k]);
const set =
  <K extends keyof LcSettings>(k: K) =>
  (v: LcSettings[K]) =>
    patchSettings({ [k]: v } as Partial<LcSettings>);
const opts = <V extends string>(labels: Record<V, string>) =>
  (Object.keys(labels) as V[]).map((value) => ({ value, label: labels[value] }));
const speakerLabel = (s: string) => s || S.basic.emptySpeaker;

/** 新加入的卡片約 0.3 秒淡入下滑（F20；減少動態效果時不動） */
function useEnterAnimation<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [
        { opacity: 0, transform: 'translateY(-10px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 300, easing: 'ease-out' },
    );
  }, []);
  return ref;
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Field label={label} hint={hint} layout="inline">
      <Toggle checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}

/* ---------- 基本 ---------- */

function SubNarratorCard({ speaker }: { speaker: string }) {
  const subs = useS('subNarrators');
  const sub = subs.find((x) => x.speaker === speaker)!;
  const ref = useEnterAnimation<HTMLLIElement>();
  const update = (patch: Partial<typeof sub>) =>
    patchSettings({
      subNarrators: subs.map((x) => (x.speaker === speaker ? { ...x, ...patch } : x)),
    });
  const name = speakerLabel(speaker);
  return (
    <li
      ref={ref}
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3"
      data-sub-narrator={speaker}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
        <IconButton
          size="sm"
          variant="ghost"
          label={S.sub.remove(name)}
          icon={<X />}
          onClick={() => patchSettings({ subNarrators: subs.filter((x) => x.speaker !== speaker) })}
        />
      </div>
      <Select<SubNarratorStyle>
        aria-label={S.sub.styleLabel(name)}
        value={sub.style}
        onValueChange={(style) => update({ style })}
        options={opts(S.sub.styles)}
      />
      {sub.style === 'colored-narration' && (
        <ColorField
          value={sub.color}
          onChange={(color) => update({ color })}
          aria-label={S.sub.colorLabel(name)}
        />
      )}
    </li>
  );
}

function SubNarrators() {
  const source = useSession((s) => s.source);
  const subs = useS('subNarrators');
  const [picked, setPicked] = useState('');
  if (!source) return null;
  const speakers = sourceSpeakers(source);
  const available = speakers.filter((s) => !subs.some((x) => x.speaker === s));
  const pickedValid = picked && available.includes(picked.slice(2)) ? picked : '';
  const add = () => {
    if (!pickedValid) return;
    patchSettings({
      subNarrators: [
        ...subs,
        {
          speaker: pickedValid.slice(2),
          style: 'italic-narration',
          color: DEFAULT_SUB_NARRATOR_COLOR,
        },
      ],
    });
    setPicked('');
  };
  return (
    <Section
      title={S.sub.title}
      description={S.sub.description}
      defaultOpen
      persistKey="log-converter:sub"
    >
      <div className="flex min-w-0 gap-2">
        <Select
          aria-label={S.sub.pickLabel}
          className="min-w-0 flex-1"
          value={pickedValid || 'none'}
          onValueChange={(v) => setPicked(v === 'none' ? '' : v)}
          options={[
            { value: 'none', label: S.sub.pick },
            ...available.map((s) => ({ value: `s:${s}`, label: speakerLabel(s) })),
          ]}
        />
        <Button variant="secondary" icon={<Plus />} onClick={add} disabled={!available.length}>
          {S.sub.add}
        </Button>
      </div>
      {subs.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.sub.title}>
          {subs.map((x) => (
            <SubNarratorCard key={x.speaker} speaker={x.speaker} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-muted" data-testid="sub-empty">
          {S.sub.empty}
        </p>
      )}
    </Section>
  );
}

export function BasicPanel() {
  const source = useSession((s) => s.source);
  const choices = useSession((s) => s.choices);
  const mode = useS('narrationMode');
  const center = useS('narrationCenter');
  if (!source) return null;
  const speakers = sourceSpeakers(source);
  const tabs = sourceTabs(source);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.basic.titleSection} persistKey="log-converter:title">
        <Field label={S.basic.title} hint={S.basic.titleHint}>
          <TextInput
            value={choices.title}
            onChange={(e) => setChoices({ title: e.target.value })}
          />
        </Field>
        <Field label={S.basic.subtitle}>
          <TextInput
            value={choices.subtitle}
            onChange={(e) => setChoices({ subtitle: e.target.value })}
          />
        </Field>
        <Field label={S.basic.summary}>
          <TextInput
            value={choices.summary}
            placeholder={S.basic.summaryPlaceholder}
            onChange={(e) => setChoices({ summary: e.target.value })}
          />
        </Field>
      </Section>
      <Section title={S.basic.narratorSection} persistKey="log-converter:narrator">
        <Field label={S.basic.narrator} hint={S.basic.narratorHint}>
          <Select
            value={choices.narrator === null ? 'default' : `s:${choices.narrator}`}
            onValueChange={(v) => setChoices({ narrator: v === 'default' ? null : v.slice(2) })}
            options={[
              { value: 'default', label: S.basic.narratorDefault },
              ...speakers.map((s) => ({ value: `s:${s}`, label: speakerLabel(s) })),
            ]}
          />
        </Field>
        <Field label={S.basic.narrationMode} hint={S.basic.narrationModeHint[mode]}>
          <Segmented
            value={mode}
            onValueChange={set('narrationMode')}
            options={opts(S.basic.narrationModes)}
            fullWidth
          />
        </Field>
        <Show when={mode === 'block'}>
          <ToggleField
            label={S.basic.narrationCenter}
            hint={S.basic.narrationCenterHint}
            checked={center}
            onChange={set('narrationCenter')}
          />
        </Show>
        <Field label={S.basic.chatTab} hint={S.basic.chatTabHint}>
          <Select
            value={choices.chatTab === null ? 'none' : `t:${choices.chatTab}`}
            onValueChange={(v) => setChoices({ chatTab: v === 'none' ? null : v.slice(2) })}
            options={[
              { value: 'none', label: S.basic.chatTabNone },
              ...tabs.map((t) => ({ value: `t:${t}`, label: t || S.basic.emptySpeaker })),
            ]}
          />
        </Field>
      </Section>
      <SubNarrators />
    </div>
  );
}

/** 給 e2e 與說明用：目前選到的旁白角色名稱 */
export const narratorName = (n: string | null): string => n ?? DEFAULT_NARRATOR;

/* ---------- 外觀 ---------- */

/** 沒有圖時的佔位圖（本站自畫） */
function AvatarPreview({ image, name }: { image: string | null; name: string }) {
  return (
    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-border-strong bg-surface-3 text-muted">
      {image ? (
        <img src={image} alt={name} className="size-full object-cover object-top" />
      ) : (
        <UserRound aria-hidden className="size-7" />
      )}
    </span>
  );
}

function ProfileCard({ speaker }: { speaker: string }) {
  const p = useSession((s) => s.profiles[speaker]) ?? blankProfile();
  const logAvatars = useSession((s) => s.logAvatars);
  const source = useSession((s) => s.source);
  const toast = useToast();
  const name = speakerLabel(speaker);
  const main = source?.format === 'v2' ? source.merged.mainAvatars[speaker] : undefined;
  const fromLog = main ? (logAvatars[main] ?? main) : null;
  const image = p.image ?? fromLog;
  const onError = (msg: string) => toast({ title: msg, tone: 'danger' });
  const choose = async () => {
    const [file] = await pickFiles({ accept: 'image/*' });
    if (file) await uploadProfile(speaker, file, onError);
  };
  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3"
      data-profile={speaker}
    >
      <div className="flex items-center gap-3">
        <AvatarPreview image={image} name={name} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-semibold">{name}</p>
          <p className="m-0 text-xs text-muted" data-testid="profile-state">
            {p.image
              ? p.source?.kind === 'file'
                ? p.source.name
                : p.url
              : fromLog
                ? S.avatar.fromLog
                : S.avatar.none}
          </p>
        </div>
        {p.image && (
          <IconButton
            size="sm"
            variant="ghost"
            label={S.avatar.clear(name)}
            icon={<X />}
            onClick={() => clearProfile(speaker)}
          />
        )}
      </div>
      <Segmented<'file' | 'url'>
        aria-label={S.avatar.source(name)}
        size="sm"
        value={p.mode}
        onValueChange={(mode) => setProfile(speaker, { mode })}
        options={[
          { value: 'file', label: S.avatar.sourceFile, icon: <ImageUp /> },
          { value: 'url', label: S.avatar.sourceUrl, icon: <Link2 /> },
        ]}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={p.mode !== 'file' || p.busy}
          onClick={() => void choose()}
        >
          {S.avatar.pickFile}
        </Button>
        <TextInput
          aria-label={S.avatar.urlLabel(name)}
          className="min-w-0 flex-1"
          disabled={p.mode !== 'url'}
          placeholder={S.avatar.urlPlaceholder}
          value={p.url}
          onChange={(e) => void setProfileUrl(speaker, e.target.value, onError)}
        />
      </div>
    </li>
  );
}

function AvatarSection() {
  const source = useSession((s) => s.source);
  const useLogImages = useSession((s) => s.choices.useLogImages);
  const imageStatus = useSession((s) => s.imageStatus);
  useSession((s) => s.profiles);
  useSession((s) => s.logAvatars);
  const resize = useS('resizeImages');
  const keepExternal = useS('keepExternalUrl');
  const quality = useS('quality');
  const custom = useS('customQuality');
  if (!source) return null;
  const total = totalAvatarBytes();
  const tone =
    total > 5 * 1024 * 1024 ? 'text-danger' : total > 1024 * 1024 ? 'text-warning' : 'text-success';
  return (
    <Section
      title={S.avatar.title}
      description={S.avatar.onlyFor}
      persistKey="log-converter:avatar"
    >
      <ToggleField
        label={S.avatar.resize}
        hint={S.avatar.resizeHint}
        checked={resize}
        onChange={(v) => {
          patchSettings({ resizeImages: v });
          scheduleReprocess();
        }}
      />
      <ToggleField
        label={S.avatar.keepExternal}
        hint={S.avatar.keepExternalHint}
        checked={keepExternal}
        onChange={set('keepExternalUrl')}
      />
      <div
        className={resize ? '' : 'pointer-events-none opacity-40'}
        data-testid="quality-field"
        aria-disabled={!resize || undefined}
      >
        <Field label={S.avatar.quality}>
          <Select<QualityPreset>
            value={quality}
            disabled={!resize}
            onValueChange={(v) => {
              patchSettings({ quality: v });
              if (v !== 'custom') scheduleReprocess();
            }}
            options={opts(S.avatar.qualityOptions)}
          />
        </Field>
      </div>
      <Show when={resize && quality === 'custom'}>
        <Field
          label={S.avatar.custom}
          labelSuffix={
            <span className="text-xs text-muted" data-testid="custom-estimate">
              {S.avatar.customEstimate(customSizeEstimate(custom))}
            </span>
          }
        >
          <Slider
            value={custom}
            onChange={set('customQuality')}
            onCommit={() => scheduleReprocess(300)}
            min={0}
            max={100}
            step={5}
          />
        </Field>
        <p className="m-0 flex justify-between text-xs text-muted">
          <span>{S.avatar.customSmall}</span>
          <span>{S.avatar.customLarge}</span>
        </p>
      </Show>
      {source.format === 'v2' && (
        <ToggleField
          label={S.avatar.perMessage}
          hint={S.avatar.perMessageHint}
          checked={useLogImages}
          onChange={(v) => setChoices({ useLogImages: v })}
        />
      )}
      {imageStatus && <Notice tone="progress">{imageStatus}</Notice>}
      {total > 0 && (
        <p className="m-0 text-sm" data-testid="avatar-total">
          {S.avatar.total}：<span className={`font-mono ${tone}`}>{formatLimitBytes(total)}</span>
        </p>
      )}
      <ul
        className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2"
        aria-label={S.avatar.title}
      >
        {sourceSpeakers(source).map((sp) => (
          <ProfileCard key={`p-${sp}`} speaker={sp} />
        ))}
      </ul>
    </Section>
  );
}

function NameColors() {
  const source = useSession((s) => s.source);
  const colors = useSession((s) => s.choices.nameColors);
  if (!source) return null;
  return (
    <Section
      title={S.colors.title}
      description={S.colors.description}
      persistKey="log-converter:names"
    >
      <ul
        className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2"
        aria-label={S.colors.title}
      >
        {sourceSpeakers(source).map((sp) => {
          const c = colors[sp] ?? '#ffffff';
          return (
            <li key={`c-${sp}`} className="flex min-w-0 flex-col gap-1 rounded-md bg-surface-2 p-2">
              <span className="truncate text-sm font-semibold" style={{ color: c }}>
                {speakerLabel(sp)}
              </span>
              <ColorField
                value={c}
                aria-label={S.colors.label(speakerLabel(sp))}
                onChange={(v) =>
                  setChoices({
                    nameColors: { ...useSession.getState().choices.nameColors, [sp]: v },
                  })
                }
              />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function LayoutSection() {
  const style = useS('style');
  const typo = useS('novelTypography');
  const fontUrl = useS('fontUrl');
  const fontFamily = useS('fontFamily');
  const fontSize = useS('fontSize');
  const lineHeight = useS('lineHeight');
  const pageWidth = useS('pageWidth');
  return (
    <Section title={S.layout.title} persistKey="log-converter:layout">
      <Show when={style === 'novel'}>
        <ToggleField
          label={S.layout.novelTypography}
          hint={S.layout.novelTypographyHint}
          checked={typo}
          onChange={set('novelTypography')}
        />
      </Show>
      <Field label={S.layout.fontUrl} hint={S.layout.fontUrlHint}>
        <TextInput
          value={fontUrl}
          placeholder={S.layout.fontUrlPlaceholder}
          onChange={(e) => patchSettings({ fontUrl: e.target.value })}
        />
      </Field>
      <Field label={S.layout.fontFamily} hint={S.layout.fontFamilyHint}>
        <TextInput
          value={fontFamily}
          placeholder={S.layout.fontFamilyPlaceholder}
          onChange={(e) => patchSettings({ fontFamily: e.target.value })}
        />
      </Field>
      <Section title={S.layout.fontHelpTitle} defaultOpen={false}>
        <ol className="m-0 list-decimal pl-5 text-sm">
          {S.layout.fontHelp.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </Section>
      <Field label={S.layout.fontSize}>
        <Segmented
          value={String(fontSize)}
          onValueChange={(v) => patchSettings({ fontSize: Number(v) })}
          options={FONT_SIZES.map((v) => ({ value: String(v), label: `${v} px` }))}
          fullWidth
        />
      </Field>
      <Field label={S.layout.lineHeight}>
        <Segmented
          value={String(lineHeight)}
          onValueChange={(v) => patchSettings({ lineHeight: Number(v) })}
          options={LINE_HEIGHTS.map((v) => ({ value: String(v), label: v.toFixed(1) }))}
          fullWidth
        />
      </Field>
      <Field label={S.layout.pageWidth}>
        <Segmented
          value={String(pageWidth)}
          onValueChange={(v) => patchSettings({ pageWidth: Number(v) })}
          options={PAGE_WIDTHS.map((v) => ({ value: String(v), label: `${v} px` }))}
          fullWidth
        />
      </Field>
    </Section>
  );
}

export function AppearancePanel() {
  const style = useS('style');
  return (
    <div className="flex flex-col gap-3">
      {style !== 'novel' && <AvatarSection />}
      <NameColors />
      <LayoutSection />
    </div>
  );
}

/* ---------- 插圖 ---------- */

function IllustrationCard({ id, index }: { id: string; index: number }) {
  const it = useSession((s) => s.illustrations.find((x) => x.id === id));
  const toast = useToast();
  const [urlError, setUrlError] = useState(false);
  const ref = useEnterAnimation<HTMLLIElement>();
  if (!it) return null;
  const n = index + 1;
  const choose = async () => {
    const [file] = await pickFiles({ accept: 'image/*' });
    if (file) await uploadIllustration(id, file, (msg) => toast({ title: msg, tone: 'danger' }));
  };
  const preview = it.source === 'file' ? it.fileData : it.url.trim();
  return (
    <li
      ref={ref}
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3"
      data-illustration={n}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{S.ill.itemTitle(n)}</span>
        <IconButton
          size="sm"
          variant="ghost"
          label={S.ill.remove(n)}
          icon={<Trash2 />}
          onClick={() => removeIllustration(id)}
        />
      </div>
      <Field label={S.ill.position}>
        <NativeNumberInput
          value={it.position}
          min={1}
          step={1}
          onChange={(position) => updateIllustration(id, { position })}
          stepLabels={{ up: `${S.ill.position}：增加`, down: `${S.ill.position}：減少` }}
        />
      </Field>
      <FieldRow>
        <Field label={S.ill.size}>
          <Select
            value={it.size}
            onValueChange={(size) => updateIllustration(id, { size })}
            options={opts(S.ill.sizes)}
          />
        </Field>
        <Field label={S.ill.align}>
          <Select
            value={it.align}
            onValueChange={(align) => updateIllustration(id, { align })}
            options={opts(S.ill.aligns)}
          />
        </Field>
      </FieldRow>
      <Field label={S.ill.source}>
        <Segmented<'file' | 'url'>
          size="sm"
          value={it.source}
          onValueChange={(source) => updateIllustration(id, { source })}
          options={[
            { value: 'file', label: S.ill.sourceFile, icon: <ImageUp /> },
            { value: 'url', label: S.ill.sourceUrl, icon: <Link2 /> },
          ]}
        />
      </Field>
      {it.source === 'file' ? (
        <Button size="sm" variant="secondary" className="self-start" onClick={() => void choose()}>
          {S.ill.pickFile}
        </Button>
      ) : (
        <Field label={S.ill.url}>
          <TextInput
            value={it.url}
            placeholder={S.ill.urlPlaceholder}
            onChange={(e) => {
              setUrlError(false);
              updateIllustration(id, { url: e.target.value });
            }}
          />
        </Field>
      )}
      <p className="m-0 text-xs text-warning">
        {it.source === 'file' ? S.ill.warnFile : S.ill.warnUrl}
      </p>
      {preview &&
        (urlError && it.source === 'url' ? (
          <p className="m-0 text-xs text-danger" data-testid="ill-error">
            {S.ill.urlError}
          </p>
        ) : (
          <img
            src={preview}
            alt={S.ill.itemTitle(n)}
            className="max-h-32 max-w-full self-start rounded-sm border border-border object-contain"
            onError={() => setUrlError(true)}
          />
        ))}
    </li>
  );
}

export function IllustrationPanel() {
  const list = useSession((s) => s.illustrations);
  const show = useS('showLogNumbers');
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.ill.title} description={S.ill.description} fixed>
        <ToggleField
          label={S.ill.showNumbers}
          hint={S.ill.showNumbersHint}
          checked={show}
          onChange={set('showLogNumbers')}
        />
        {list.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.ill.title}>
            {list.map((it, i) => (
              <IllustrationCard key={it.id} id={it.id} index={i} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{S.ill.empty}</p>
        )}
        <Button
          variant="secondary"
          icon={<Plus />}
          onClick={addIllustration}
          className="self-start"
        >
          {S.ill.add}
        </Button>
      </Section>
    </div>
  );
}

/* ---------- 進階 ---------- */

function ContentSection() {
  const style = useS('style');
  const layout = useS('dialogueLayout');
  const sepType = useS('separatorType');
  const sep = useS('customSeparator');
  const chatMode = useS('chatMode');
  const merge = useS('mergeConsecutive');
  const wrap = useS('longNameWrap');
  const showCount = useS('showChatCount');
  const hideSystem = useS('hideSystem');
  return (
    <Section title={S.adv.contentTitle} persistKey="log-converter:content">
      <ToggleField
        label={S.adv.merge}
        hint={S.adv.mergeHint}
        checked={merge}
        onChange={set('mergeConsecutive')}
      />
      <ToggleField
        label={S.adv.longNameWrap}
        hint={S.adv.longNameWrapHint}
        checked={wrap}
        onChange={set('longNameWrap')}
      />
      <Show when={style === 'timeline'}>
        <Field label={S.adv.layout} hint={S.adv.layoutHint}>
          <Segmented
            value={layout}
            onValueChange={set('dialogueLayout')}
            options={opts(S.adv.layouts)}
            fullWidth
          />
        </Field>
        <Show when={layout === 'inline'}>
          <Field label={S.adv.separator}>
            <Segmented
              value={sepType}
              onValueChange={set('separatorType')}
              options={opts(S.adv.separators)}
              fullWidth
            />
          </Field>
          <Show when={sepType === 'custom'}>
            <Field label={S.adv.customSeparator} hint={S.adv.customSeparatorHint}>
              <TextInput
                value={sep}
                onChange={(e) =>
                  patchSettings({
                    customSeparator: Array.from(e.target.value).slice(0, 3).join(''),
                  })
                }
                className="w-28"
              />
            </Field>
          </Show>
        </Show>
      </Show>
      <Field label={S.adv.chatMode}>
        <Segmented
          value={chatMode}
          onValueChange={set('chatMode')}
          options={opts(S.adv.chatModes)}
          fullWidth
        />
      </Field>
      <ToggleField
        label={S.adv.showChatCount}
        hint={S.adv.showChatCountHint}
        checked={showCount}
        onChange={set('showChatCount')}
      />
      <Field label={S.adv.system}>
        <Segmented
          value={hideSystem ? 'hide' : 'show'}
          onValueChange={(v) => patchSettings({ hideSystem: v === 'hide' })}
          options={opts(S.adv.systemModes)}
          fullWidth
        />
      </Field>
    </Section>
  );
}

function ChannelNameRow({ code, name, count }: { code: string; name: string; count: number }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => renameTab(code, draft);
  return (
    <li className="flex min-w-0 items-center gap-2" data-channel={code}>
      <code className="w-24 shrink-0 truncate text-xs text-muted" title={code || '—'}>
        {code || '—'}
      </code>
      <TextInput
        aria-label={S.adv.channelLabel(code || '—')}
        className="min-w-0 flex-1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit();
        }}
      />
      <span className="shrink-0 text-xs text-muted">{S.adv.channelCount(count)}</span>
    </li>
  );
}

function ChannelNames() {
  const source = useSession((s) => s.source);
  if (source?.format !== 'v2') return null;
  return (
    <Section
      title={S.adv.channelTitle}
      description={S.adv.channelDescription}
      persistKey="log-converter:channels"
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.adv.channelTitle}>
        {channelCounts(source).map((c) => (
          <ChannelNameRow key={c.code} code={c.code} name={c.name} count={c.count} />
        ))}
      </ul>
    </Section>
  );
}

function TabsSection() {
  const source = useSession((s) => s.source);
  const choices = useSession((s) => s.choices);
  const style = useS('style');
  if (!source) return null;
  const tabs = sourceTabs(source);
  if (tabs.length < 2) return null;
  return (
    <Section title={S.adv.tabsTitle} persistKey="log-converter:tabs">
      <fieldset
        className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
        data-testid="visible-tabs"
      >
        <legend className="mb-1 p-0 text-sm font-medium">{S.adv.visibleTabs}</legend>
        {tabs.map((t) => (
          <Checkbox
            key={`v-${t}`}
            label={`[${t}]`}
            checked={!choices.hiddenTabs.includes(t)}
            onCheckedChange={(on) =>
              setChoices({
                hiddenTabs: on
                  ? choices.hiddenTabs.filter((x) => x !== t)
                  : [...choices.hiddenTabs, t],
              })
            }
          />
        ))}
        <p className="m-0 text-xs text-muted">{S.adv.visibleTabsHint}</p>
      </fieldset>
      <Show when={style === 'ccfolia'}>
        <div className="flex flex-col gap-2" data-testid="tab-styles">
          <p className="m-0 text-sm font-medium">{S.adv.tabStyle}</p>
          {tabs.map((t) => (
            <div key={`s-${t}`} className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">[{t}]</span>
              <Select<TabStyle>
                aria-label={S.adv.tabStyleLabel(t)}
                size="sm"
                value={choices.tabStyles[t] ?? 'none'}
                onValueChange={(v) => setChoices({ tabStyles: { ...choices.tabStyles, [t]: v } })}
                options={opts(S.adv.tabStyles)}
              />
            </div>
          ))}
        </div>
      </Show>
    </Section>
  );
}

function PaletteGroup({ title, keys }: { title: string; keys: (keyof Palette)[] }) {
  const palette = useS('palette');
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-medium">{title}</legend>
      {keys.map((k) => (
        <div key={k} className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="w-16 shrink-0 text-sm text-muted">
            {S.adv.colorNames[k]}
          </span>
          <ColorField
            className="min-w-0 flex-1"
            value={palette[k]}
            aria-label={S.adv.colorLabel(title, S.adv.colorNames[k])}
            onChange={(v) => {
              const next = { ...useSettings.getState().data.palette, [k]: v };
              const preset = presetById(useSettings.getState().data.colorPreset);
              const same =
                preset &&
                (Object.keys(next) as (keyof Palette)[]).every(
                  (x) => preset.palette[x] === next[x],
                );
              patchSettings({ palette: next, colorPreset: same ? preset.id : CUSTOM_PRESET });
            }}
          />
        </div>
      ))}
    </fieldset>
  );
}

function TabColors() {
  const source = useSession((s) => s.source);
  const enabled = useS('tabColorsEnabled');
  const colors = useS('tabColors');
  if (!source) return null;
  const tabs = sourceTabs(source);
  if (tabs.length < 2) return null;
  const update = (t: string, patch: Partial<{ text: string; bg: string | null }>) => {
    const cur = useSettings.getState().data.tabColors;
    patchSettings({
      tabColors: { ...cur, [t]: { ...(cur[t] ?? { text: DEFAULT_TAB_TEXT, bg: null }), ...patch } },
    });
  };
  return (
    <>
      <ToggleField
        label={S.adv.tabColors}
        hint={S.adv.tabColorsHint}
        checked={enabled}
        onChange={set('tabColorsEnabled')}
      />
      <Show when={enabled}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.adv.tabColors}>
          {tabs.map((t) => {
            const c = colors[t] ?? { text: DEFAULT_TAB_TEXT, bg: null };
            return (
              <li
                key={`tc-${t}`}
                className="flex min-w-0 flex-col gap-2 rounded-md bg-surface-2 p-2"
                data-tab-color={t}
              >
                <span className="text-sm font-semibold">[{t}]</span>
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="w-10 shrink-0 text-sm text-muted">
                    {S.adv.colorNames.text}
                  </span>
                  <ColorField
                    className="min-w-0 flex-1"
                    value={c.text}
                    aria-label={S.adv.tabText(t)}
                    onChange={(v) => update(t, { text: v })}
                  />
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="w-10 shrink-0 text-sm text-muted">
                    {S.adv.colorNames.narrationBg}
                  </span>
                  <ColorField
                    className="min-w-0 flex-1"
                    value={c.bg ?? '#000000'}
                    aria-label={S.adv.tabBg(t)}
                    onChange={(v) => update(t, { bg: v })}
                  />
                  {c.bg === null ? (
                    <span className="text-xs text-muted" data-testid="tab-bg-transparent">
                      {S.adv.transparent}
                    </span>
                  ) : (
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={S.adv.clearBg}
                      icon={<RotateCcw />}
                      onClick={() => update(t, { bg: null })}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Show>
    </>
  );
}

function ColorSection() {
  const preset = useS('colorPreset');
  return (
    <Section title={S.adv.colorTitle} persistKey="log-converter:colors">
      <Field label={S.adv.preset} hint={S.adv.presetHint}>
        <Select
          value={preset}
          onValueChange={(v) => {
            const p = presetById(v);
            if (p) patchSettings({ colorPreset: p.id, palette: { ...p.palette } });
            else patchSettings({ colorPreset: CUSTOM_PRESET });
          }}
          options={[
            ...COLOR_PRESETS.map((p) => ({ value: p.id, label: p.name })),
            { value: CUSTOM_PRESET, label: S.adv.custom },
          ]}
        />
      </Field>
      <PaletteGroup title={S.adv.systemColors} keys={['systemBg', 'systemBorder', 'systemText']} />
      <PaletteGroup title={S.adv.narrationColors} keys={['narrationBg', 'narrationText']} />
      <PaletteGroup title={S.adv.pageColors} keys={['pageBg', 'containerBg', 'text', 'accent']} />
      <TabColors />
    </Section>
  );
}

function SplitSection() {
  const method = useS('splitMethod');
  const count = useS('splitCount');
  const size = useS('splitSizeKb');
  const files = useS('splitFiles');
  useSession((s) => s.profiles);
  useSession((s) => s.logAvatars);
  const total = totalAvatarBytes();
  return (
    <Section title={S.adv.splitTitle} persistKey="log-converter:split">
      <Field label={S.adv.split}>
        <Segmented
          value={method}
          onValueChange={set('splitMethod')}
          options={opts(S.adv.splitMethods)}
          fullWidth
        />
      </Field>
      <FieldRow columns={3}>
        <Field label={S.adv.splitCount}>
          <NumberInput
            value={count}
            onChange={set('splitCount')}
            min={1}
            max={100000}
            step={1}
            unit="則"
            disabled={method !== 'count'}
          />
        </Field>
        <Field label={S.adv.splitSize}>
          <NumberInput
            value={size}
            onChange={set('splitSizeKb')}
            min={1}
            max={100000}
            step={1}
            unit="KB"
            disabled={method !== 'size'}
          />
        </Field>
        <Field label={S.adv.splitFiles}>
          <NumberInput
            value={files}
            onChange={set('splitFiles')}
            min={2}
            max={1000}
            step={1}
            unit="個"
            disabled={method !== 'files'}
          />
        </Field>
      </FieldRow>
      {total > 0 && (
        <p className="m-0 text-xs text-warning" data-testid="split-warn">
          {S.adv.splitWarn(Math.ceil(total / 1024))}
        </p>
      )}
    </Section>
  );
}

export function AdvancedPanel() {
  const blog = useS('blogMode');
  return (
    <div className="flex flex-col gap-3">
      <ContentSection />
      <ChannelNames />
      <TabsSection />
      <ColorSection />
      <SplitSection />
      <Section title={S.adv.blogTitle} persistKey="log-converter:blog">
        <ToggleField
          label={S.adv.blogMode}
          hint={S.adv.blogHint}
          checked={blog}
          onChange={set('blogMode')}
        />
      </Section>
      <Section title={S.adv.settingsTitle} persistKey="log-converter:file">
        <p className="m-0 text-sm text-muted">{S.adv.settingsHint}</p>
      </Section>
    </div>
  );
}
