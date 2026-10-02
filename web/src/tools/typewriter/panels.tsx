/**
 * 四個模式的設定面板。同名的控制項在每個模式各自獨立（規格 F01）。
 */
import { Crop, Music, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { create } from 'zustand';
import { decodeAudio, type PcmAudio, pcmDuration, wavBlob } from '@/core/audio';
import { downloadSequentially } from '@/core/files';
import {
  AudioDrop,
  AudioPlayer,
  Button,
  Checkbox,
  Field,
  FieldRow,
  type NoticeTone,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  TextArea,
  TextInput,
  Toggle,
  useToast,
} from '@/ui';
import { clipSeconds, mixTypingSound, silenceAudio, silencePlan, typingSoundPlan } from './audio';
import { ColorCopyField, NumberField } from './controls';
import { segmentBaseName, silenceFileName, soundFileName } from './filename';
import { type FitMode, fitCanvasToText } from './fit';
import { fontOptions } from './fonts';
import {
  CUSTOM_FONT,
  type FadeKind,
  type HAlign,
  KARAOKE_PALETTES,
  type KaraokeShow,
  type Mode,
  RANGES,
  type ShapeKind,
  type TwData,
  type VAlign,
} from './settings';
import { patchMode, setField, useTw } from './store';
import { S } from './strings';
import { creditSegments, typingUnitCount } from './timeline';

type TextMode = 'typing' | 'glitch';
type StyledMode = 'typing' | 'glitch' | 'karaoke';

const ALIGN_OPTIONS = (['left', 'center', 'right'] as const).map((value) => ({
  value,
  label: S.aligns[value],
}));
const VALIGN_OPTIONS = (['top', 'middle', 'bottom'] as const).map((value) => ({
  value,
  label: S.valigns[value],
}));
const FONT_OPTIONS = fontOptions(S.font.custom);

const useMode = <M extends Mode>(mode: M): TwData[M] => useTw((st) => st.data[mode]);

/* ---------- 共通 ---------- */

function TextSection({ mode, label, hint }: { mode: Mode; label: string; hint: string }) {
  const s = useMode(mode);
  return (
    <Section title={mode === 'karaoke' ? S.sections.lyrics : S.sections.text} fixed>
      <Field label={label} hint={hint}>
        <TextArea
          value={s.text}
          rows={mode === 'credits' || mode === 'karaoke' ? 8 : 4}
          spellCheck={false}
          onChange={(e) => setField(mode, 'text', e.target.value)}
          data-testid={`${mode}-text`}
        />
      </Field>
    </Section>
  );
}

function FontFields({ mode }: { mode: Mode }) {
  const s = useMode(mode);
  return (
    <>
      <Field label={S.font.label}>
        <Select
          value={s.font}
          onValueChange={(v) => setField(mode, 'font', v)}
          options={FONT_OPTIONS}
        />
      </Field>
      <Show when={s.font === CUSTOM_FONT}>
        <Field label={S.font.customName} hint={S.font.customHint}>
          <TextInput
            value={s.customFont}
            spellCheck={false}
            onChange={(e) => setField(mode, 'customFont', e.target.value)}
          />
        </Field>
      </Show>
    </>
  );
}

function FontSection({ mode }: { mode: Mode }) {
  const s = useMode(mode);
  const styled = mode !== 'credits' ? (s as TwData[StyledMode]) : null;
  const deco = mode === 'typing' || mode === 'glitch' ? (s as TwData[TextMode]) : null;
  /* 圖形模式不套用水平縮放（規格 7.1） */
  const shapeOn = mode === 'typing' && (s as TwData['typing']).shape !== 'none';
  return (
    <Section title={S.sections.style} persistKey={`typewriter:${mode}:style`}>
      <FontFields mode={mode} />
      <FieldRow columns={2}>
        <NumberField
          label={S.font.size}
          value={s.size}
          onChange={(v) => setField(mode, 'size', v)}
          range={RANGES.size}
          unit="px"
        />
        <NumberField
          label={S.font.leading}
          value={s.leading}
          onChange={(v) => setField(mode, 'leading', v)}
          range={RANGES.leading}
          unit="倍"
        />
      </FieldRow>
      {styled ? (
        <FieldRow columns={2}>
          <NumberField
            label={S.font.scaleX}
            value={styled.scaleX}
            onChange={(v) => setField(mode as StyledMode, 'scaleX', v)}
            range={RANGES.scaleX}
            unit="%"
            disabled={shapeOn}
            hint={shapeOn ? S.font.scaleXShapeOff : undefined}
          />
          <NumberField
            label={S.font.tracking}
            value={styled.tracking}
            onChange={(v) => setField(mode as StyledMode, 'tracking', v)}
            range={RANGES.tracking}
            unit="px"
          />
        </FieldRow>
      ) : null}
      <p className="m-0 -mt-1 text-xs text-muted">{S.font.leadingHint}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Toggle
          label={S.font.bold}
          checked={s.bold}
          onCheckedChange={(v) => setField(mode, 'bold', v)}
        />
        {styled ? (
          <Toggle
            label={S.font.italic}
            checked={styled.italic}
            onCheckedChange={(v) => setField(mode as StyledMode, 'italic', v)}
          />
        ) : null}
        {deco ? (
          <>
            <Toggle
              label={S.font.underline}
              checked={deco.underline}
              onCheckedChange={(v) => setField(mode as TextMode, 'underline', v)}
            />
            <Toggle
              label={S.font.strike}
              checked={deco.strike}
              onCheckedChange={(v) => setField(mode as TextMode, 'strike', v)}
            />
          </>
        ) : null}
      </div>
    </Section>
  );
}

function LayoutSection({ mode }: { mode: Mode }) {
  const s = useMode(mode);
  const text = mode === 'typing' || mode === 'glitch' ? (s as TwData[TextMode]) : null;
  const styled = mode !== 'credits' ? (s as TwData[StyledMode]) : null;
  const shapeOn = mode === 'typing' && (s as TwData['typing']).shape !== 'none';
  return (
    <Section title={S.sections.layout} persistKey={`typewriter:${mode}:layout`}>
      {shapeOn ? <p className="m-0 text-xs text-muted">{S.layout.shapeOff}</p> : null}
      {text ? (
        <Field label={S.layout.direction} hint={text.vertical ? S.layout.verticalHint : undefined}>
          <Segmented
            value={text.vertical ? 'v' : 'h'}
            onValueChange={(v) => setField(mode as TextMode, 'vertical', v === 'v')}
            options={[
              { value: 'h', label: S.layout.horizontal },
              { value: 'v', label: S.layout.vertical },
            ]}
            fullWidth
          />
        </Field>
      ) : null}
      <Field label={S.layout.align}>
        <Segmented<HAlign>
          value={s.align}
          onValueChange={(v) => setField(mode, 'align', v)}
          options={ALIGN_OPTIONS}
          fullWidth
        />
      </Field>
      {styled ? (
        <Field label={S.layout.valign}>
          <Segmented<VAlign>
            value={styled.valign}
            onValueChange={(v) => setField(mode as StyledMode, 'valign', v)}
            options={VALIGN_OPTIONS}
            fullWidth
          />
        </Field>
      ) : null}
    </Section>
  );
}

function BackgroundFields({ mode }: { mode: Mode }) {
  const s = useMode(mode);
  return (
    <>
      <Field label={S.color.bgOn} layout="inline" hint={S.color.bgHint}>
        <Toggle checked={s.bgOn} onCheckedChange={(v) => setField(mode, 'bgOn', v)} />
      </Field>
      <Show when={s.bgOn}>
        <ColorCopyField
          label={S.color.bg}
          value={s.bgColor}
          onChange={(v) => setField(mode, 'bgColor', v)}
        />
      </Show>
    </>
  );
}

function ShadowFields({ mode }: { mode: Mode }) {
  const s = useMode(mode);
  return (
    <>
      <ColorCopyField
        label={S.color.shadow}
        value={s.shadowColor}
        onChange={(v) => setField(mode, 'shadowColor', v)}
      />
      <FieldRow columns={3}>
        <NumberField
          label={S.color.shadowBlur}
          value={s.shadowBlur}
          onChange={(v) => setField(mode, 'shadowBlur', v)}
          range={RANGES.shadowBlur}
        />
        <NumberField
          label={S.color.shadowX}
          value={s.shadowX}
          onChange={(v) => setField(mode, 'shadowX', v)}
          range={RANGES.offset}
        />
        <NumberField
          label={S.color.shadowY}
          value={s.shadowY}
          onChange={(v) => setField(mode, 'shadowY', v)}
          range={RANGES.offset}
        />
      </FieldRow>
    </>
  );
}

function StrokeWidthField({ mode }: { mode: Mode }) {
  const s = useMode(mode);
  return (
    <NumberField
      label={S.color.strokeWidth}
      value={s.strokeWidth}
      onChange={(v) => setField(mode, 'strokeWidth', v)}
      range={RANGES.strokeWidth}
      unit="px"
      hint={S.color.strokeHint}
    />
  );
}

/** 打字、故障、片尾名單的顏色 */
function ColorSection({ mode }: { mode: 'typing' | 'glitch' | 'credits' }) {
  const s = useMode(mode);
  return (
    <Section title={S.sections.color} persistKey={`typewriter:${mode}:color`}>
      <BackgroundFields mode={mode} />
      <ColorCopyField
        label={S.color.fill}
        value={s.fill}
        onChange={(v) => setField(mode, 'fill', v)}
      />
      <ColorCopyField
        label={S.color.stroke}
        value={s.strokeColor}
        onChange={(v) => setField(mode, 'strokeColor', v)}
      />
      <StrokeWidthField mode={mode} />
      <ShadowFields mode={mode} />
    </Section>
  );
}

function FpsHoldFields({ mode, fpsHint }: { mode: StyledMode; fpsHint: string }) {
  const s = useMode(mode);
  return (
    <FieldRow columns={2}>
      <NumberField
        label={S.anim.fps}
        value={s.fps}
        onChange={(v) => setField(mode, 'fps', v)}
        range={RANGES.fps}
        hint={fpsHint}
      />
      <NumberField
        label={S.anim.hold}
        value={s.holdMs}
        onChange={(v) => setField(mode, 'holdMs', v)}
        range={RANGES.holdMs}
        unit="ms"
        hint={S.anim.holdHint}
      />
    </FieldRow>
  );
}

function CanvasSection({ mode, fit }: { mode: Mode; fit: FitMode | null }) {
  const s = useMode(mode);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Section title={S.sections.canvas} persistKey={`typewriter:${mode}:canvas`}>
      <FieldRow columns={2}>
        <NumberField
          label={S.canvas.width}
          value={s.width}
          onChange={(v) => setField(mode, 'width', v)}
          range={RANGES.canvas}
          unit="px"
        />
        <NumberField
          label={S.canvas.height}
          value={s.height}
          onChange={(v) => setField(mode, 'height', v)}
          range={RANGES.canvas}
          unit="px"
        />
      </FieldRow>
      {fit ? (
        <Field label={S.canvas.fit} hint={S.canvas.fitHint}>
          <Button
            icon={<Crop />}
            loading={busy}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const size = await fitCanvasToText(fit, useTw.getState().data);
                if (!size) {
                  toast({ title: S.noText, description: S.noTextHint, tone: 'warning' });
                  return;
                }
                patchMode(mode, size);
                toast({ title: S.canvas.fitDone(size.width, size.height), tone: 'success' });
              } finally {
                setBusy(false);
              }
            }}
          >
            {S.canvas.fit}
          </Button>
        </Field>
      ) : null}
    </Section>
  );
}

/* ---------- 打字 ---------- */

/** 上傳的音效與合成結果（不存檔；切換模式時保留） */
const useSound = create<{
  clip: { name: string; pcm: PcmAudio } | null;
  status: { tone: NoticeTone; message: string } | null;
  mixed: { blob: Blob; name: string } | null;
}>(() => ({ clip: null, status: null, mixed: null }));

function SoundSection() {
  const s = useMode('typing');
  const { clip, status, mixed } = useSound();
  const toast = useToast();
  return (
    <Section title={S.sections.sound} persistKey="typewriter:typing:sound">
      <AudioDrop
        label={S.sound.drop}
        buttonLabel={S.sound.pick}
        hint={S.sound.dropHint}
        status={status}
        onFile={async (file) => {
          useSound.setState({ status: { tone: 'progress', message: S.sound.decoding(file.name) } });
          try {
            const pcm = await decodeAudio(file);
            useSound.setState({
              clip: { name: file.name, pcm },
              mixed: null,
              status: {
                tone: 'success',
                message: S.sound.loaded(
                  file.name,
                  pcmDuration(pcm),
                  pcm.channels.length,
                  pcm.sampleRate,
                ),
              },
            });
          } catch (e) {
            useSound.setState({
              clip: null,
              mixed: null,
              status: { tone: 'danger', message: e instanceof Error ? e.message : String(e) },
            });
          }
        }}
      />
      <Field label={S.sound.mode} hint={S.sound.modeHint}>
        <Segmented
          value={s.soundMode}
          onValueChange={(v) => setField('typing', 'soundMode', v)}
          options={[
            { value: 'each', label: S.sound.each },
            { value: 'skip', label: S.sound.skip },
          ]}
          fullWidth
        />
      </Field>
      <Field label={S.sound.make} hint={clip ? S.sound.makeHint : S.sound.needClip}>
        <Button
          icon={<Music />}
          disabled={!clip}
          onClick={() => {
            const st = useTw.getState().data.typing;
            const units = typingUnitCount(st.text);
            if (!clip) return;
            if (!units) {
              toast({ title: S.noText, description: S.noTextHint, tone: 'warning' });
              return;
            }
            const plan = typingSoundPlan({
              units,
              fps: st.fps,
              holdMs: st.holdMs,
              clipSeconds: clipSeconds(clip.pcm),
              mode: st.soundMode,
            });
            useSound.setState({
              mixed: {
                blob: wavBlob(mixTypingSound(clip.pcm, plan)),
                name: soundFileName(Date.now()),
              },
            });
            toast({ title: S.sound.made, tone: 'success' });
          }}
        >
          {S.sound.make}
        </Button>
      </Field>
      {mixed ? (
        <AudioPlayer
          blob={mixed.blob}
          fileName={mixed.name}
          downloadLabel={S.sound.download}
          aria-label={S.sound.player}
        />
      ) : null}
    </Section>
  );
}

function TypingAnimationSection() {
  const s = useMode('typing');
  return (
    <Section title={S.sections.animation} persistKey="typewriter:typing:anim">
      <FpsHoldFields mode="typing" fpsHint={S.anim.fpsHint} />
      <Field label={S.anim.direction} hint={S.anim.directionHint}>
        <Segmented
          value={s.direction}
          onValueChange={(v) => setField('typing', 'direction', v)}
          options={[
            { value: 'forward', label: S.anim.forward },
            { value: 'reverse', label: S.anim.reverse },
          ]}
          fullWidth
        />
      </Field>
      <Field label={S.anim.fade}>
        <Segmented<FadeKind>
          value={s.fade}
          onValueChange={(v) => setField('typing', 'fade', v)}
          options={(['none', 'whole', 'each'] as const).map((value) => ({
            value,
            label: S.fades[value],
          }))}
          fullWidth
        />
      </Field>
      <Show when={s.fade !== 'none'}>
        <NumberField
          label={S.anim.fadeMs}
          value={s.fadeMs}
          onChange={(v) => setField('typing', 'fadeMs', v)}
          range={RANGES.fadeMs}
          unit="ms"
          hint={S.anim.fadeHint}
        />
      </Show>
    </Section>
  );
}

function ShapeSection() {
  const s = useMode('typing');
  return (
    <Section title={S.sections.shape} persistKey="typewriter:typing:shape">
      <Field label={S.shape.kind}>
        <Segmented<ShapeKind>
          value={s.shape}
          onValueChange={(v) => setField('typing', 'shape', v)}
          options={(['none', 'circle', 'square', 'triangle'] as const).map((value) => ({
            value,
            label: S.shapes[value],
          }))}
          fullWidth
        />
      </Field>
      <Show when={s.shape !== 'none'}>
        <FieldRow columns={2}>
          <NumberField
            label={S.shape.size}
            value={s.shapeSize}
            onChange={(v) => setField('typing', 'shapeSize', v)}
            range={RANGES.shapeSize}
            unit="px"
          />
          <NumberField
            label={S.shape.rotate}
            value={s.rotate}
            onChange={(v) => setField('typing', 'rotate', v)}
            range={RANGES.rotate}
            unit="°"
          />
        </FieldRow>
        <p className="m-0 -mt-1 text-xs text-muted">
          {S.shape.sizeHint}
          {S.shape.rotateHint}
        </p>
      </Show>
    </Section>
  );
}

export function TypingPanel() {
  return (
    <div className="flex flex-col gap-3">
      <TextSection mode="typing" label={S.text.label} hint={S.text.typingHint} />
      <TypingAnimationSection />
      <FontSection mode="typing" />
      <LayoutSection mode="typing" />
      <ColorSection mode="typing" />
      <ShapeSection />
      <SoundSection />
      <CanvasSection mode="typing" fit="typing" />
    </div>
  );
}

/* ---------- 故障 ---------- */

function GlitchSection() {
  const s = useMode('glitch');
  const cs = s.charsets;
  const setCs = (k: keyof typeof cs, v: boolean) =>
    useTw.getState().update((d) => {
      d.glitch.charsets[k] = v;
    });
  return (
    <Section title={S.sections.glitch} persistKey="typewriter:glitch:glitch">
      <FpsHoldFields mode="glitch" fpsHint={S.anim.glitchFpsHint} />
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-medium text-fg">{S.glitch.charsets}</legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {(['latin', 'kana', 'hangul', 'shapes'] as const).map((k) => (
            <Checkbox
              key={k}
              label={S.glitch[k]}
              checked={cs[k]}
              onCheckedChange={(v) => setCs(k, v)}
            />
          ))}
        </div>
        <p className="m-0 text-xs text-muted">{S.glitch.charsetsHint}</p>
      </fieldset>
      <NumberField
        label={S.glitch.intensity}
        value={s.intensity}
        onChange={(v) => setField('glitch', 'intensity', v)}
        range={RANGES.intensity}
        unit="格"
        hint={S.glitch.intensityHint}
      />
      <Field label={S.glitch.together} layout="inline" hint={S.glitch.togetherHint}>
        <Toggle checked={s.together} onCheckedChange={(v) => setField('glitch', 'together', v)} />
      </Field>
    </Section>
  );
}

export function GlitchPanel() {
  return (
    <div className="flex flex-col gap-3">
      <TextSection mode="glitch" label={S.text.label} hint={S.text.glitchHint} />
      <GlitchSection />
      <FontSection mode="glitch" />
      <LayoutSection mode="glitch" />
      <ColorSection mode="glitch" />
      <CanvasSection mode="glitch" fit="glitch" />
    </div>
  );
}

/* ---------- 片尾名單 ---------- */

function CreditsAnimationSection() {
  const s = useMode('credits');
  const segs = s.split ? creditSegments(s.text, s.duration, s.fps).length : 0;
  return (
    <Section title={S.sections.animation} persistKey="typewriter:credits:anim">
      <FieldRow columns={2}>
        <NumberField
          label={S.anim.fps}
          value={s.fps}
          onChange={(v) => setField('credits', 'fps', v)}
          range={RANGES.fps}
          hint={S.anim.creditsFpsHint}
        />
        <NumberField
          label={S.credits.duration}
          value={s.duration}
          onChange={(v) => setField('credits', 'duration', v)}
          range={RANGES.duration}
          unit="秒"
        />
      </FieldRow>
      <Field
        label={S.credits.split}
        hint={
          s.split ? `${S.credits.splitHint}${S.credits.segmentInfo(segs)}。` : S.credits.splitHint
        }
      >
        <Segmented
          value={s.split ? 'split' : 'single'}
          onValueChange={(v) => setField('credits', 'split', v === 'split')}
          options={[
            { value: 'single', label: S.credits.single },
            { value: 'split', label: S.credits.segments },
          ]}
          fullWidth
        />
      </Field>
    </Section>
  );
}

function SilenceSection() {
  const s = useMode('credits');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Section title={S.sections.silence} persistKey="typewriter:credits:silence">
      <NumberField
        label={S.credits.silenceExtra}
        value={s.silenceExtra}
        onChange={(v) => setField('credits', 'silenceExtra', v)}
        range={RANGES.silenceExtra}
        unit="秒"
        hint={S.credits.silenceHint}
      />
      <Button
        icon={<VolumeX />}
        loading={busy}
        disabled={busy}
        className="self-start"
        onClick={async () => {
          const st = useTw.getState().data.credits;
          const plan = silencePlan({
            split: st.split,
            duration: st.duration,
            extra: st.silenceExtra,
            segments: creditSegments(st.text, st.duration, st.fps),
          });
          if (!plan.length) {
            toast({ title: S.credits.silenceNone, tone: 'warning' });
            return;
          }
          setBusy(true);
          try {
            const ts = Date.now();
            await downloadSequentially(
              plan.map((it) => ({
                name: it.segment
                  ? `${segmentBaseName(it.segment.number, it.segment.text, ts)}.wav`
                  : silenceFileName(ts),
                blob: () => Promise.resolve(wavBlob(silenceAudio(it.seconds))),
              })),
              { intervalMs: 500 },
            );
            toast({ title: S.credits.silenceDone(plan.length), tone: 'success' });
          } finally {
            setBusy(false);
          }
        }}
      >
        {S.credits.makeSilence}
      </Button>
    </Section>
  );
}

export function CreditsPanel() {
  return (
    <div className="flex flex-col gap-3">
      <TextSection mode="credits" label={S.text.label} hint={S.text.creditsHint} />
      <CreditsAnimationSection />
      <FontSection mode="credits" />
      <LayoutSection mode="credits" />
      <ColorSection mode="credits" />
      <SilenceSection />
      <CanvasSection mode="credits" fit={null} />
    </div>
  );
}

/* ---------- 卡拉 OK ---------- */

function KaraokeTimingSection() {
  const s = useMode('karaoke');
  return (
    <Section title={S.sections.timing} persistKey="typewriter:karaoke:timing">
      <FieldRow columns={2}>
        <NumberField
          label={S.karaoke.duration}
          value={s.duration}
          onChange={(v) => setField('karaoke', 'duration', v)}
          range={RANGES.duration}
          unit="秒"
        />
        <NumberField
          label={S.karaoke.intro}
          value={s.intro}
          onChange={(v) => setField('karaoke', 'intro', v)}
          range={RANGES.intro}
          unit="秒"
          hint={S.karaoke.introHint}
        />
      </FieldRow>
      <Field label={S.karaoke.alloc}>
        <Segmented
          value={s.alloc}
          onValueChange={(v) => setField('karaoke', 'alloc', v)}
          options={[
            { value: 'chars', label: S.karaoke.allocChars },
            { value: 'equal', label: S.karaoke.allocEqual },
          ]}
          fullWidth
        />
      </Field>
      <FpsHoldFields mode="karaoke" fpsHint={S.anim.karaokeFpsHint} />
    </Section>
  );
}

function KaraokeShowSection() {
  const s = useMode('karaoke');
  const fixed = s.show === 'rotate' || s.show === 'page';
  return (
    <Section title={S.sections.show} persistKey="typewriter:karaoke:show">
      <Field label={S.karaoke.show}>
        <Select<KaraokeShow>
          value={s.show}
          onValueChange={(v) => setField('karaoke', 'show', v)}
          options={(['all', 'reveal', 'current', 'rotate', 'page'] as const).map((value) => ({
            value,
            label: S.shows[value],
          }))}
        />
      </Field>
      <Show when={fixed}>
        <Field label={S.karaoke.rows}>
          <Slider
            value={s.rows}
            onChange={(v) => setField('karaoke', 'rows', v)}
            min={1}
            max={10}
            step={1}
            inputMin={RANGES.rows.min}
            inputMax={RANGES.rows.max}
            unit="行"
          />
        </Field>
        <NumberField
          label={S.karaoke.swapFade}
          value={s.swapFade}
          onChange={(v) => setField('karaoke', 'swapFade', v)}
          range={RANGES.swapFade}
          unit="秒"
          hint={S.karaoke.swapFadeHint}
        />
      </Show>
    </Section>
  );
}

function KaraokeColorSection() {
  const s = useMode('karaoke');
  return (
    <Section title={S.sections.color} persistKey="typewriter:karaoke:color">
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-medium text-fg">{S.karaoke.palette}</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {KARAOKE_PALETTES.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant="secondary"
              data-palette={p.id}
              onClick={() =>
                patchMode('karaoke', {
                  beforeFill: p.beforeFill,
                  beforeStroke: p.beforeStroke,
                  afterFill: p.afterFill,
                  afterStroke: p.afterStroke,
                })
              }
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-3.5 rounded-sm border border-border-strong"
                  style={{ background: p.beforeFill, outline: `2px solid ${p.beforeStroke}` }}
                />
                <span
                  aria-hidden
                  className="inline-block size-3.5 rounded-sm border border-border-strong"
                  style={{ background: p.afterFill, outline: `2px solid ${p.afterStroke}` }}
                />
                {S.karaoke.paletteNames[p.id] ?? p.id}
              </span>
            </Button>
          ))}
        </div>
      </fieldset>
      <ColorCopyField
        label={S.karaoke.beforeFill}
        value={s.beforeFill}
        onChange={(v) => setField('karaoke', 'beforeFill', v)}
      />
      <ColorCopyField
        label={S.karaoke.beforeStroke}
        value={s.beforeStroke}
        onChange={(v) => setField('karaoke', 'beforeStroke', v)}
      />
      <ColorCopyField
        label={S.karaoke.afterFill}
        value={s.afterFill}
        onChange={(v) => setField('karaoke', 'afterFill', v)}
      />
      <ColorCopyField
        label={S.karaoke.afterStroke}
        value={s.afterStroke}
        onChange={(v) => setField('karaoke', 'afterStroke', v)}
      />
      <StrokeWidthField mode="karaoke" />
      <BackgroundFields mode="karaoke" />
      <ShadowFields mode="karaoke" />
    </Section>
  );
}

function KaraokeScanSection() {
  const s = useMode('karaoke');
  return (
    <Section title={S.sections.scan} persistKey="typewriter:karaoke:scan">
      <Field label={S.karaoke.direction}>
        <Segmented
          value={s.direction}
          onValueChange={(v) => setField('karaoke', 'direction', v)}
          options={[
            { value: 'ltr', label: S.karaoke.ltr },
            { value: 'rtl', label: S.karaoke.rtl },
          ]}
          fullWidth
        />
      </Field>
      <NumberField
        label={S.karaoke.softness}
        value={s.softness}
        onChange={(v) => setField('karaoke', 'softness', v)}
        range={RANGES.softness}
        unit="px"
        hint={S.karaoke.softnessHint}
      />
      <Field label={S.karaoke.glowOn} layout="inline">
        <Toggle checked={s.glowOn} onCheckedChange={(v) => setField('karaoke', 'glowOn', v)} />
      </Field>
      <Show when={s.glowOn}>
        <ColorCopyField
          label={S.karaoke.glowColor}
          value={s.glowColor}
          onChange={(v) => setField('karaoke', 'glowColor', v)}
        />
        <NumberField
          label={S.karaoke.glowWidth}
          value={s.glowWidth}
          onChange={(v) => setField('karaoke', 'glowWidth', v)}
          range={RANGES.glowWidth}
          unit="px"
        />
      </Show>
    </Section>
  );
}

export function KaraokePanel() {
  return (
    <div className="flex flex-col gap-3">
      <TextSection mode="karaoke" label={S.text.lyricsLabel} hint={S.text.lyricsHint} />
      <KaraokeTimingSection />
      <KaraokeShowSection />
      <FontSection mode="karaoke" />
      <LayoutSection mode="karaoke" />
      <KaraokeColorSection />
      <KaraokeScanSection />
      <CanvasSection mode="karaoke" fit="karaoke" />
    </div>
  );
}
