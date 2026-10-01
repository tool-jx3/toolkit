/**
 * 設定面板的五個分頁：基本（範本、來源大小、房間網址）、方框（位置、方框）、名稱與結果、內文、立繪與骰子。
 * 依設定出現／隱藏的欄位看「確定後」的設定（拖曳滑桿中不切換，放開才更新）。
 */
import { useEffect, useState } from 'react';
import { roomUrlFrom } from '@/ccfolia';
import { localFontNames } from '@/core/css';
import { getTool, hrefToTool } from '@/registry';
import {
  Button,
  Field,
  FieldRow,
  NativeNumberInput,
  Notice,
  Section,
  Select,
  Show,
  SourceUrlField,
  TextInput,
} from '@/ui';
import {
  ColorOnly,
  ColorOpacity,
  FontField,
  NumField,
  SegField,
  setSetting,
  ToggleField,
} from './controls';
import { commitSourceSize, isPlate, RANGES, SOURCE_PRESETS, usedFonts } from './settings';
import { gesture, setStatus, useCommittedSettings, usePreview, useSettings } from './store';
import { S } from './strings';
import { applyTemplateTo, TEMPLATES, templateById } from './templates';

/** 聊天視窗產生器（同站另一個工具）的網址：新版還沒登記時連到目前上線的版本 */
export const CHAT_WINDOW_HREF = hrefToTool(
  getTool('chat-window') ?? { id: 'chat-window', status: 'live' },
);

/* ---------- 基本 ---------- */

export function applyTemplateById(id: string): void {
  const t = templateById(id);
  if (!t) return;
  const cur = useSettings.getState().data;
  useSettings.getState().replace(applyTemplateTo(cur, t));
  setStatus(S.templateApplied(t.name), 'success');
}

function TemplateSection() {
  const pick = usePreview((st) => st.data.pick);
  const applied = useSettings((st) => st.data.template);
  const t = templateById(pick) ?? TEMPLATES[0];
  return (
    <Section title={S.templateSection} persistKey="message-box:template" fixed>
      <Field label={S.templatePick} hint={t.description}>
        <div className="flex min-w-0 gap-2">
          <Select
            value={t.id}
            onValueChange={(v) => usePreview.getState().patch({ pick: v })}
            options={TEMPLATES.map((x) => ({ value: x.id, label: x.name }))}
            className="min-w-0 flex-1"
          />
          <Button variant="primary" onClick={() => applyTemplateById(t.id)}>
            {S.templateApply}
          </Button>
        </div>
      </Field>
      <p className="m-0 text-xs text-muted">{S.templateReplaces}</p>
      <p className="m-0 text-xs text-muted" data-testid="template-current">
        {S.templateCurrent(templateById(applied)?.name ?? null)}
      </p>
    </Section>
  );
}

/** 來源寬高：離開欄位或按 Enter 才生效（F03） */
function SourceSizeInput({ axis }: { axis: 'width' | 'height' }) {
  const value = useSettings((st) => st.data[axis]);
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const v = commitSourceSize(draft, axis);
    setDraft(String(v));
    if (v !== useSettings.getState().data[axis]) setSetting(axis, v);
  };
  const r = RANGES[axis];
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 只是接住數字欄的離開與 Enter
    <div
      onFocus={() => setEditing(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit();
      }}
    >
      <NativeNumberInput
        value={draft}
        onChange={(v) => {
          setEditing(true);
          setDraft(v);
        }}
        min={r.min}
        max={r.max}
        step={r.step}
        unit="px"
      />
    </div>
  );
}

function SourceSection() {
  return (
    <Section title={S.sourceSection} description={S.sourceHint} persistKey="message-box:source">
      <FieldRow columns={2}>
        <Field label={S.sourceWidth}>
          <SourceSizeInput axis="width" />
        </Field>
        <Field label={S.sourceHeight}>
          <SourceSizeInput axis="height" />
        </Field>
      </FieldRow>
      <p className="m-0 text-xs text-muted">{S.sourceFieldHint}</p>
      <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
        <legend className="sr-only">{S.presetsLabel}</legend>
        {SOURCE_PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            onClick={() => {
              useSettings.getState().update((d) => {
                d.width = p.width;
                d.height = p.height;
              });
              setStatus(S.sizeSet(p.width, p.height));
            }}
          >
            {S.presets[p.id]}
          </Button>
        ))}
      </fieldset>
    </Section>
  );
}

export const ROOM_FIELD_ID = 'message-box-room';

function RoomSection() {
  const room = useSettings((st) => st.data.room);
  return (
    <Section title={S.roomSection} persistKey="message-box:room">
      <Field id={ROOM_FIELD_ID} label={S.room} hint={S.roomHint}>
        <TextInput
          value={room}
          placeholder={S.roomPlaceholder}
          spellCheck={false}
          autoComplete="off"
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) gesture.commit();
          }}
          onChange={(e) => {
            gesture.begin();
            setSetting('room', e.target.value);
          }}
        />
      </Field>
      <Field label={S.sourceUrl}>
        <SourceUrlField
          url={roomUrlFrom(room)}
          placeholder={S.sourceUrlPlaceholder}
          copiedMessage={S.urlCopied}
          onCopy={(ok) => {
            if (ok) setStatus(S.urlCopied, 'success');
          }}
        />
      </Field>
    </Section>
  );
}

export function BasicPanel() {
  return (
    <div className="flex flex-col gap-3">
      <TemplateSection />
      <SourceSection />
      <RoomSection />
    </div>
  );
}

/* ---------- 方框 ---------- */

export function BoxPanel() {
  const c = useCommittedSettings();
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.positionSection} persistKey="message-box:position">
        <NumField k="maxWidth" label={S.maxWidth} hint={S.maxWidthHint} />
        <SegField k="align" label={S.align} options={S.alignOptions} />
        <FieldRow columns={2}>
          <NumField k="bottom" label={S.bottom} />
          <NumField k="side" label={S.side} />
        </FieldRow>
        <SegField
          k="entrance"
          label={S.entrance}
          options={S.entranceOptions}
          hint={S.entranceHint}
        />
      </Section>
      <Section title={S.boxSection} persistKey="message-box:box">
        <ColorOpacity colorKey="boxColor" opacityKey="boxOpacity" label={S.boxColor} />
        <SegField k="texture" label={S.texture} options={S.textureOptions} hint={S.textureHint} />
        <NumField k="borderWidth" label={S.borderWidth} />
        <Show when={c.borderWidth > 0}>
          <ColorOpacity colorKey="borderColor" opacityKey="borderOpacity" label={S.borderColor} />
        </Show>
        <NumField k="radius" label={S.radius} />
        <NumField k="shadow" label={S.shadow} unit="%" hint={S.shadowHint} />
        <ToggleField k="brackets" label={S.brackets} />
        <Show when={c.brackets}>
          <ColorOpacity
            colorKey="bracketColor"
            opacityKey="bracketOpacity"
            label={S.bracketColor}
          />
        </Show>
        <NumField k="padX" label={S.padX} />
        <NumField k="padY" label={S.padY} />
        <NumField k="lines" label={S.lines} unit={S.linesUnit} hint={S.linesHint} />
        <SegField k="buttons" label={S.buttons} options={S.buttonsOptions} hint={S.buttonsHint} />
      </Section>
    </div>
  );
}

/* ---------- 名稱與結果 ---------- */

export function ChatWindowLink() {
  return (
    <a href={CHAT_WINDOW_HREF} className="text-accent underline underline-offset-2">
      {S.chatWindowLink}
    </a>
  );
}

export function NamePanel() {
  const c = useCommittedSettings();
  const plate = isPlate(c);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.nameSection} description={S.nameNote} persistKey="message-box:name">
        <ToggleField k="showName" label={S.showName} />
        <Show when={c.showName}>
          <SegField k="namePos" label={S.namePos} options={S.namePosOptions} hint={S.namePosHint} />
          <FontField k="nameFont" label={S.nameFont} previewText="蘇芮 伊凡 陳警官" />
          <NumField k="nameSize" label={S.nameSize} />
          <ColorOnly k="nameColor" label={S.nameColor} />
          <Show when={!plate}>
            <NumField k="nameGap" label={S.nameGap} />
          </Show>
          <Show when={plate}>
            <ColorOpacity colorKey="plateColor" opacityKey="plateOpacity" label={S.plateColor} />
            <NumField k="plateRadius" label={S.plateRadius} />
            <NumField k="plateBorder" label={S.plateBorder} />
            <Show when={c.plateBorder > 0}>
              <ColorOnly k="plateBorderColor" label={S.plateBorderColor} />
            </Show>
            <NumField k="plateInset" label={S.plateInset} hint={S.plateInsetHint} />
            <NumField k="plateLift" label={S.plateLift} hint={S.plateLiftHint} />
            <NumField k="plateGap" label={S.plateGap} />
          </Show>
        </Show>
      </Section>
      <Section
        title={S.resultSection}
        description={
          <>
            {S.resultNote}
            {S.resultChatWindow[0]}
            <ChatWindowLink />
            {S.resultChatWindow[1]}
          </>
        }
        persistKey="message-box:result"
      >
        <ToggleField k="showResult" label={S.showResult} />
        <Show when={c.showResult}>
          {plate ? (
            <p className="m-0 text-xs text-muted">{S.resultPosPlate}</p>
          ) : (
            <SegField k="resultPos" label={S.resultPos} options={S.resultPosOptions} />
          )}
          <SegField
            k="resultStyle"
            label={S.resultStyle}
            options={S.resultStyleOptions}
            hint={S.resultStyleHint}
          />
          <FontField k="resultFont" label={S.resultFont} previewText="🎲 ＞ 成功 ＞ 9" />
          <NumField k="resultSize" label={S.resultSize} />
          <FieldRow columns={3}>
            <ColorOnly k="colorSuccess" label={S.colorSuccess} />
            <ColorOnly k="colorFailure" label={S.colorFailure} />
            <ColorOnly k="colorOther" label={S.colorOther} />
          </FieldRow>
          <p className="m-0 text-xs text-muted">{S.outcomeHint}</p>
        </Show>
      </Section>
    </div>
  );
}

/* ---------- 內文 ---------- */

/** 名稱、結果、內文任一處用電腦字型時的提醒（F39） */
export function LocalFontWarning() {
  const s = useSettings((st) => st.data);
  const names = localFontNames(usedFonts(s));
  if (!names.length) return null;
  return (
    <div data-testid="local-font-warning">
      <Notice tone="warning" className="text-xs">
        {S.localFontsWarning(names)}
      </Notice>
    </div>
  );
}

export function TextPanel() {
  const c = useCommittedSettings();
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.textSection} persistKey="message-box:text">
        <FontField k="textFont" label={S.textFont} previewText="地下室的燈閃了兩下，終於亮起。" />
        <NumField k="textSize" label={S.textSize} />
        <ColorOnly k="textColor" label={S.textColor} />
        <NumField
          k="lineHeight"
          label={S.lineHeight}
          unit=""
          hint={S.lineHeightHint}
          precision={2}
        />
        <NumField
          k="letterSpacing"
          label={S.letterSpacing}
          unit=""
          hint={S.letterSpacingHint}
          precision={2}
        />
        <SegField k="outline" label={S.outline} options={S.outlineOptions} hint={S.outlineHint} />
        <Show when={c.outline !== 'none'}>
          <ColorOpacity
            colorKey="outlineColor"
            opacityKey="outlineOpacity"
            label={S.outlineColor}
          />
        </Show>
        <Show when={c.outline === 'stroke'}>
          <NumField k="outlineWidth" label={S.outlineWidth} precision={1} />
        </Show>
      </Section>
      <Section title={S.ccfoliaSection} persistKey="message-box:ccfolia" defaultOpen={false}>
        {S.ccfoliaNote.map((t) => (
          <p key={t} className="m-0 text-xs leading-relaxed text-muted">
            {t}
          </p>
        ))}
      </Section>
    </div>
  );
}

/* ---------- 立繪與骰子 ---------- */

export function PortraitPanel() {
  const c = useCommittedSettings();
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.portraitSection} persistKey="message-box:portrait">
        <ToggleField k="showPortrait" label={S.showPortrait} hint={S.showPortraitHint} />
        <Show when={c.showPortrait}>
          <NumField k="portraitWidth" label={S.portraitWidth} hint={S.portraitWidthHint} />
          <NumField
            k="portraitMaxHeight"
            label={S.portraitMaxHeight}
            hint={S.portraitMaxHeightHint}
          />
          <SegField k="portraitSide" label={S.portraitSide} options={S.sideOptions} />
          <NumField k="portraitOffset" label={S.portraitOffset} hint={S.portraitOffsetHint} />
          <NumField k="portraitSink" label={S.portraitSink} hint={S.portraitSinkHint} />
          <ToggleField k="portraitFront" label={S.portraitFront} hint={S.portraitFrontHint} />
          <ToggleField k="portraitFlip" label={S.portraitFlip} />
        </Show>
      </Section>
      <Section title={S.diceSection} persistKey="message-box:dice">
        <ToggleField k="showDice" label={S.showDice} hint={S.showDiceHint} />
        <Show when={c.showDice}>
          <NumField k="diceSize" label={S.diceSize} hint={S.diceSizeHint} />
        </Show>
      </Section>
    </div>
  );
}
