/**
 * 設定面板的六個分頁：基本、視窗、訊息、文字、動態、OBS。
 */
import { type Ref, useState } from 'react';
import { chatUrlFrom } from '@/ccfolia';
import { getTool, hrefToTool } from '@/registry';
import {
  Button,
  Field,
  FieldRow,
  Notice,
  ObsGuide,
  Section,
  Select,
  Show,
  SourceUrlField,
} from '@/ui';
import {
  ColorRow,
  FontRow,
  ObsBadge,
  SegmentRow,
  SliderRow,
  SourceSizeInput,
  TextRow,
  ToggleRow,
  useSettings,
  useVisibility,
} from './controls';
import {
  anyLocalFont,
  namePrefixActive,
  SIZE_PRESETS,
  scrollActive,
  titleHasTab,
  titleHasText,
} from './settings';
import { setStatus, useChat } from './store';
import { S } from './strings';
import { applyChatTemplate, getTemplate, TEMPLATES } from './templates';

const opts = <V extends string>(labels: Record<V, string>) =>
  (Object.keys(labels) as V[]).map((value) => ({ value, label: labels[value] }));

/* ---------- 基本 ---------- */

function TemplateSection() {
  const current = useChat((st) => st.data.templateId);
  const [picked, setPicked] = useState<string>(current ?? TEMPLATES[0].id);
  const tpl = getTemplate(picked) ?? TEMPLATES[0];
  const apply = () => {
    const st = useChat.getState();
    st.replace(applyChatTemplate(st.data, tpl));
    setStatus(S.template.applied(tpl.name), 'success');
  };
  return (
    <Section title={S.template.section} persistKey="chat-window:template">
      <Field label={S.template.label}>
        <div className="flex min-w-0 gap-2">
          <Select
            value={tpl.id}
            onValueChange={setPicked}
            options={TEMPLATES.map((t) => ({ value: t.id, label: t.name }))}
            className="min-w-0 flex-1"
          />
          <Button variant="primary" onClick={apply}>
            {S.template.apply}
          </Button>
        </div>
      </Field>
      <p className="m-0 text-xs text-muted" data-testid="template-description">
        {tpl.description}
        <br />
        {S.template.keepNote}
      </p>
    </Section>
  );
}

function MessagesSection() {
  const v = useVisibility();
  return (
    <Section
      title={S.messages.section}
      description={S.messages.description}
      persistKey="chat-window:messages"
    >
      <SliderRow k="count" label={S.messages.count} unit={S.messages.countUnit} />
      <ToggleRow k="diceOnly" label={S.messages.diceOnly} hint={S.messages.diceOnlyHint} badge />
      <ToggleRow k="hideSystem" label={S.messages.hideSystem} badge hidden={v.diceOnly} />
      <SegmentRow
        k="order"
        label={S.messages.order}
        hint={S.messages.orderHint}
        options={[
          { value: 'newest-bottom', label: S.messages.orderBottom },
          { value: 'newest-top', label: S.messages.orderTop },
        ]}
      />
      <SliderRow k="gap" label={S.messages.gap} unit="px" />
    </Section>
  );
}

function SourceSection() {
  return (
    <Section
      title={S.source.section}
      description={S.source.description}
      persistKey="chat-window:source"
    >
      <FieldRow>
        <SourceSizeInput axis="width" label={S.source.width} />
        <SourceSizeInput axis="height" label={S.source.height} />
      </FieldRow>
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-medium text-fg">{S.source.presets}</legend>
        {SIZE_PRESETS.map((p, i) => (
          <Button
            key={`${p.width}x${p.height}`}
            size="sm"
            onClick={() => useChat.getState().patch({ width: p.width, height: p.height })}
          >
            {S.source.presetLabels[i]}
          </Button>
        ))}
      </fieldset>
    </Section>
  );
}

export function BasicPanel() {
  return (
    <div className="flex flex-col gap-3">
      <TemplateSection />
      <MessagesSection />
      <SourceSection />
    </div>
  );
}

/* ---------- 視窗 ---------- */

function WindowSection() {
  const v = useVisibility();
  const scroll = scrollActive(v);
  return (
    <Section title={S.window.section} persistKey="chat-window:window">
      <SegmentRow
        k="sizeMode"
        label={S.window.sizeMode}
        hint={S.window.fitHint}
        options={[
          { value: 'fill', label: S.window.fill },
          { value: 'fit', label: S.window.fit },
        ]}
      />
      <SegmentRow
        k="anchor"
        label={S.window.anchor}
        options={[
          { value: 'bottom', label: S.window.bottom },
          { value: 'top', label: S.window.top },
        ]}
      />
      {scroll && v.sizeMode === 'fit' ? (
        <p className="m-0 text-xs text-muted">{S.window.scrollFillNote}</p>
      ) : null}
      <SliderRow k="margin" label={S.window.margin} unit="px" />
      <SliderRow k="padding" label={S.window.padding} unit="px" />
      <ColorRow k="bg" label={S.window.bg} alpha />
      <SegmentRow k="texture" label={S.window.texture} options={opts(S.window.textures)} />
      <SliderRow k="borderWidth" label={S.window.border} unit="px" />
      <ColorRow k="borderColor" label={S.window.borderColor} alpha hidden={v.borderWidth === 0} />
      <SliderRow k="radius" label={S.window.radius} unit="px" />
      <SliderRow k="shadow" label={S.window.shadow} unit="%" />
      <ToggleRow k="brackets" label={S.window.brackets} />
      <ColorRow k="bracketColor" label={S.window.bracketColor} alpha hidden={!v.brackets} />
    </Section>
  );
}

function TitleSection() {
  const v = useVisibility();
  const on = v.titleMode !== 'none';
  const lineStyle = ['underline', 'tab', 'lines'].includes(v.titleStyle);
  return (
    <Section title={S.title.section} persistKey="chat-window:title">
      <Field label={S.title.mode}>
        <Select
          value={useSettings().titleMode}
          onValueChange={(m) => {
            useChat.getState().update((d) => {
              d.titleMode = m;
            });
          }}
          options={opts(S.title.modes)}
        />
      </Field>
      <TextRow k="titleText" label={S.title.text} hidden={!titleHasText(v.titleMode)} />
      {titleHasTab(v.titleMode) ? (
        <p className="m-0 text-xs text-muted" data-testid="title-tab-note">
          {S.title.tabNote}
        </p>
      ) : null}
      <Show when={on}>
        <SegmentRow k="titleStyle" label={S.title.style} options={opts(S.title.styles)} />
        <FontRow k="titleFont" label={S.title.font} previewText="聊天紀錄 Chat Log" />
        <SliderRow k="titleSize" label={S.title.size} unit="px" />
        <ColorRow k="titleColor" label={S.title.color} />
        <ColorRow k="titleLineColor" label={S.title.lineColor} hidden={!lineStyle} />
        <ColorRow
          k="titleBandColor"
          label={S.title.bandColor}
          alpha
          hidden={v.titleStyle !== 'band'}
        />
        <SegmentRow
          k="titleAlign"
          label={S.title.align}
          hint={S.title.alignHint}
          options={opts(S.title.aligns)}
        />
        <SliderRow k="titleGap" label={S.title.gap} unit="px" />
        <ToggleRow k="titleLock" label={S.title.lock} hidden={!titleHasTab(v.titleMode)} />
      </Show>
    </Section>
  );
}

function ParticipantsSection() {
  const v = useVisibility();
  return (
    <Section
      title={S.participants.section}
      description={S.participants.description}
      persistKey="chat-window:participants"
    >
      <ToggleRow k="participants" label={S.participants.show} />
      <Show when={v.participants}>
        <TextRow
          k="participantPrefix"
          label={S.participants.prefix}
          hint={S.participants.prefixHint}
          placeholder={S.participants.prefixPlaceholder}
        />
        <SliderRow
          k="participantPrefixSize"
          label={S.participants.prefixSize}
          unit="px"
          hidden={!v.participantPrefix.trim()}
        />
        <SliderRow k="participantSize" label={S.participants.size} unit="px" />
        <SliderRow
          k="participantGap"
          label={S.participants.gap}
          unit="px"
          hint={S.participants.gapHint}
        />
        <SliderRow k="participantRing" label={S.participants.ring} unit="px" />
        <ColorRow
          k="participantRingColor"
          label={S.participants.ringColor}
          alpha
          hidden={v.participantRing === 0}
        />
      </Show>
    </Section>
  );
}

export function WindowPanel() {
  return (
    <div className="flex flex-col gap-3">
      <WindowSection />
      <TitleSection />
      <ParticipantsSection />
    </div>
  );
}

/* ---------- 訊息 ---------- */

function BoxSection() {
  const v = useVisibility();
  const framed = v.boxShape !== 'none';
  return (
    <Section title={S.box.section} persistKey="chat-window:box">
      <SegmentRow k="boxShape" label={S.box.shape} options={opts(S.box.shapes)} />
      <Show when={framed}>
        <ColorRow k="boxBg" label={S.box.bg} alpha />
        <SliderRow k="boxBorderWidth" label={S.box.border} unit="px" />
        <ColorRow
          k="boxBorderColor"
          label={S.box.borderColor}
          alpha
          hidden={v.boxBorderWidth === 0}
        />
        <SliderRow k="boxRadius" label={S.box.radius} unit="px" />
        <SliderRow k="boxShadow" label={S.box.shadow} unit="%" />
      </Show>
      <SliderRow k="boxPadX" label={S.box.padX} unit="px" />
      <SliderRow k="boxPadY" label={S.box.padY} unit="px" />
      <Field
        label={
          <>
            {S.box.accent}
            {v.accent === 'outcome' ? <ObsBadge /> : null}
          </>
        }
      >
        <Select
          value={useSettings().accent}
          onValueChange={(a) =>
            useChat.getState().update((d) => {
              d.accent = a;
            })
          }
          options={opts(S.box.accents)}
        />
      </Field>
      <SliderRow k="accentWidth" label={S.box.accentWidth} unit="px" hidden={v.accent === 'none'} />
      <ColorRow
        k="accentColor"
        label={v.accent === 'outcome' ? S.box.accentColorOutcome : S.box.accentColor}
        hidden={v.accent !== 'custom' && v.accent !== 'outcome'}
      />
      <p className="m-0 text-xs text-muted">{S.box.accentNote}</p>
      <ToggleRow
        k="outcomeGlow"
        label={S.box.outcomeGlow}
        hint={S.box.outcomeGlowHint}
        badge
        hidden={!framed}
      />
      <ToggleRow k="divider" label={S.box.divider} />
      <ColorRow k="dividerColor" label={S.box.dividerColor} alpha hidden={!v.divider} />
    </Section>
  );
}

function AvatarSection() {
  const v = useVisibility();
  return (
    <Section title={S.avatar.section} persistKey="chat-window:avatar">
      <ToggleRow k="avatar" label={S.avatar.show} />
      <Show when={v.avatar}>
        <SliderRow k="avatarSize" label={S.avatar.size} unit="px" />
        <SegmentRow k="avatarShape" label={S.avatar.shape} options={opts(S.avatar.shapes)} />
        <SliderRow k="avatarBorder" label={S.avatar.border} unit="px" />
        <ColorRow
          k="avatarBorderColor"
          label={S.avatar.borderColor}
          alpha
          hidden={v.avatarBorder === 0}
        />
        <SliderRow k="avatarGap" label={S.avatar.gap} unit="px" />
        <SegmentRow
          k="avatarAlign"
          label={S.avatar.align}
          hint={S.avatar.alignHint}
          options={opts(S.avatar.aligns)}
        />
      </Show>
    </Section>
  );
}

function NameSection() {
  const v = useVisibility();
  const prefix = namePrefixActive(v);
  return (
    <Section title={S.name.section} persistKey="chat-window:name">
      <ToggleRow k="name" label={S.name.show} />
      <Show when={v.name}>
        <SegmentRow
          k="nameStyle"
          label={S.name.style}
          hint={S.name.styleHint}
          options={opts(S.name.styles)}
        />
        <FontRow k="nameFont" label={S.name.font} previewText="林晴 卡洛斯 KP" />
        <SliderRow k="nameSize" label={S.name.size} unit="px" />
        <SegmentRow k="nameColorMode" label={S.name.colorMode} options={opts(S.name.colorModes)} />
        <ColorRow k="nameColor" label={S.name.color} hidden={v.nameColorMode !== 'custom'} />
        <SliderRow k="nameGap" label={S.name.gap} unit="px" hidden={prefix} />
        <ToggleRow k="time" label={S.name.time} hidden={prefix} />
        <ColorRow k="timeColor" label={S.name.timeColor} alpha hidden={prefix || !v.time} />
      </Show>
    </Section>
  );
}

export function MessagePanel() {
  return (
    <div className="flex flex-col gap-3">
      <BoxSection />
      <AvatarSection />
      <NameSection />
    </div>
  );
}

/* ---------- 文字 ---------- */

function BodySection() {
  const v = useVisibility();
  return (
    <Section title={S.body.section} persistKey="chat-window:body">
      <FontRow k="bodyFont" label={S.body.font} previewText="置物櫃裡有東西在呼吸。" />
      <SliderRow k="bodySize" label={S.body.size} unit="px" />
      <ColorRow k="bodyColor" label={S.body.color} hint={S.body.colorHint} />
      <SliderRow k="lineHeight" label={S.body.lineHeight} />
      <SliderRow k="letterSpacing" label={S.body.letterSpacing} unit="em" />
      <SegmentRow
        k="effect"
        label={S.body.effect}
        hint={S.body.effectHint}
        options={opts(S.body.effects)}
      />
      <ColorRow k="effectColor" label={S.body.effectColor} alpha hidden={v.effect === 'none'} />
      <SliderRow
        k="effectWidth"
        label={S.body.effectWidth}
        unit="px"
        hidden={v.effect !== 'stroke'}
      />
      <SliderRow
        k="clampLines"
        label={S.body.clamp}
        hint={S.body.clampHint}
        hidden={namePrefixActive(v)}
        valueLabel={(n) => (n === 0 ? S.body.clampOff : `${n} ${S.body.clampUnit}`)}
      />
    </Section>
  );
}

function ResultSection() {
  return (
    <Section title={S.result.section} persistKey="chat-window:result">
      <FontRow k="resultFont" label={S.result.font} previewText="＞ 23 ＞ 成功" />
      <SliderRow k="resultSize" label={S.result.size} unit="px" />
      <SegmentRow k="resultStyle" label={S.result.style} options={opts(S.result.styles)} />
      <ToggleRow k="resultBreak" label={S.result.break} />
      <FieldRow columns={3}>
        <ColorRow k="successColor" label={S.result.success} />
        <ColorRow k="failureColor" label={S.result.failure} />
        <ColorRow k="otherColor" label={S.result.other} />
      </FieldRow>
      <ToggleRow k="resultGlow" label={S.result.glow} />
      <ToggleRow k="resultFlash" label={S.result.flash} />
      <p className="m-0 text-xs text-muted">{S.result.note}</p>
    </Section>
  );
}

export function TextPanel() {
  const s = useSettings();
  return (
    <div className="flex flex-col gap-3">
      {anyLocalFont(s) ? (
        <Notice tone="warning" className="text-xs">
          {S.body.localFontNote}
        </Notice>
      ) : null}
      <BodySection />
      <ResultSection />
    </div>
  );
}

/* ---------- 動態 ---------- */

export function MotionPanel() {
  const v = useVisibility();
  const s = useSettings();
  const toggleScroll = (on: boolean) => {
    const cur = useChat.getState().data;
    const parts: string[] = [];
    if (on && cur.count !== 1) parts.push(S.motion.scrollAdjustCount);
    if (on && cur.sizeMode !== 'fill') parts.push(S.motion.scrollAdjustFill);
    useChat.getState().update((d) => {
      d.scroll = on;
      if (on) {
        d.count = 1;
        d.sizeMode = 'fill';
      }
    });
    if (parts.length) setStatus(S.motion.scrollAdjusted(parts), 'info');
  };
  return (
    <Section title={S.motion.section} persistKey="chat-window:motion">
      <Field label={S.motion.enter}>
        <Select
          value={s.enter}
          onValueChange={(e) =>
            useChat.getState().update((d) => {
              d.enter = e;
            })
          }
          options={opts(S.motion.enters)}
        />
      </Field>
      <SliderRow
        k="enterDuration"
        label={S.motion.enterDuration}
        unit="秒"
        hidden={v.enter === 'none'}
      />
      <ToggleRow
        k="scroll"
        label={S.motion.scroll}
        hint={S.motion.scrollHint}
        badge
        onChange={toggleScroll}
      />
      <Show when={v.scroll}>
        {s.count !== 1 ? (
          <Notice tone="warning" className="text-xs">
            {S.motion.scrollWarn}
          </Notice>
        ) : null}
        <SliderRow k="scrollDelay" label={S.motion.scrollDelay} unit="秒" />
        <SliderRow k="scrollDuration" label={S.motion.scrollDuration} unit="秒" />
      </Show>
      <ToggleRow k="fade" label={S.motion.fade} />
      <Show when={v.fade}>
        <SliderRow k="fadeStay" label={S.motion.fadeStay} unit="秒" />
        <SliderRow k="fadeDuration" label={S.motion.fadeDuration} unit="秒" />
      </Show>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-xs text-muted">
        {S.motion.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- OBS ---------- */

export function ObsPanel({ roomRef }: { roomRef: Ref<HTMLInputElement> }) {
  const s = useSettings();
  const url = chatUrlFrom(s.room);
  const messageBox = hrefToTool(getTool('message-box') ?? { id: 'message-box', status: 'live' });
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.obs.section} persistKey="chat-window:obs">
        <TextRow
          k="room"
          label={S.obs.room}
          hint={S.obs.roomHint}
          placeholder={S.obs.roomPlaceholder}
          inputRef={roomRef}
        />
        <Field label={S.obs.url}>
          <SourceUrlField
            url={url}
            placeholder={S.obs.urlPlaceholder}
            copiedMessage={S.output.urlCopied}
            onCopy={(ok) =>
              setStatus(ok ? S.output.urlCopied : S.output.urlCopyFailed, ok ? 'success' : 'danger')
            }
          />
        </Field>
        <ToggleRow k="hoverTabs" label={S.obs.hoverTabs} hint={S.obs.hoverTabsHint} />
      </Section>
      <Section title={S.obs.guide} persistKey="chat-window:guide">
        <ObsGuide
          title={null}
          urlLabel={S.obs.guideUrlLabel}
          url={url}
          size={{ width: s.width, height: s.height }}
          login="swap-url"
          loginOnly
          obs={{ version: 31 }}
          multipleSources
          localFonts
          disclaimer={S.usage.disclaimer}
        >
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-muted">
            <li>{S.obs.twoSources}</li>
            <li>{S.obs.rememberTab}</li>
            <li>{S.obs.troubleshoot}</li>
            <li>
              {S.obs.messageBox}
              <a href={messageBox} className="text-accent underline">
                {S.obs.messageBoxLink}
              </a>
              {S.obs.messageBoxTail}
            </li>
          </ul>
        </ObsGuide>
      </Section>
    </div>
  );
}
