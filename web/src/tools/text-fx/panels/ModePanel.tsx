/** 「模式」分頁：模式、範本、登場、副文字登場、長文流程、每個字、換頁、停留、退場、雜訊顏色 */
import { RotateCcw, Sparkles } from 'lucide-react';
import { EASING_CHOICES } from '@/core/timeline';
import { Button, Section, Segmented, TemplateGallery, useConfirm } from '@/ui';
import { type GalleryKind, pickChar, pickIntro, pickOutro } from '../actions';
import {
  type Choice,
  ColorPathField,
  NumField,
  OptionalColorField,
  SelectField,
  ToggleField,
  useCfg,
} from '../controls';
import { TEMPLATES, type Template } from '../library';
import { useMine } from '../mine';
import { fxGroups, HOLD, INTRO, ORDER_CHOICES, OUTRO } from '../motion';
import { MODES, type Mode } from '../settings';
import { applyTemplate, resetTemplate, setMode, useTfx } from '../store';
import { S } from '../strings';
import { useTemplateThumbs } from '../thumbs';
import { MinePanel } from './MinePanel';

const CURVE_CHOICES: readonly Choice[] = [
  ['auto', '自動（依效果）'],
  ...EASING_CHOICES.map((c) => [c.value, c.label] as const),
];

const FLOW_CHOICES: readonly Choice[] = [
  ['seq', '逐字打出（打字機）'],
  ['big', '中央逐字（最後整段砸下）'],
  ['stack', '中央展開（先疊後散）'],
  ['line', '逐行'],
  ['scan', '流動掃過（行內依位置延遲）'],
  ['all', '整段浮現'],
  ['scroll', '向上捲動（片尾名單）'],
];

const SUB_CHOICES: readonly Choice[] = [
  ['same', '跟主文字相同'],
  ['fade', '淡入'],
  ['rise', '上浮淡入'],
  ['focus', '模糊對焦'],
  ['converge', '字距收攏'],
  ['slide', '滑入'],
  ['slideOpp', '反方向滑入（上下合流）'],
  ['type', '打字'],
];

function GalleryButton({ kind, onOpen }: { kind: GalleryKind; onOpen: (k: GalleryKind) => void }) {
  return (
    <Button size="sm" variant="ghost" icon={<Sparkles />} onClick={() => onOpen(kind)}>
      {S.gallery.open}
    </Button>
  );
}

function TemplateSection() {
  const mode = useTfx((st) => st.data.mode);
  const tplId = useTfx((st) => st.data.modes[st.data.mode].tpl);
  /* 套用中的是我的範本時，內建範本都不標示 */
  const mineId = useTfx((st) => st.data.modes[st.data.mode].mine);
  const mineOn = useMine((st) => !!mineId && st.data.items.some((t) => t.id === mineId));
  const thumbs = useTemplateThumbs(mode);
  const confirm = useConfirm();
  const list: readonly Template[] = TEMPLATES[mode];
  return (
    <Section
      title={S.template.title}
      description={S.template.note}
      persistKey="text-fx:template"
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw />}
          onClick={async () => {
            if (
              await confirm({
                title: S.template.reset,
                description: S.template.resetConfirm,
                confirmLabel: '重設',
              })
            )
              resetTemplate();
          }}
        >
          {S.template.reset}
        </Button>
      }
    >
      <div data-thumbs-ready={thumbs.ready ? 'true' : 'false'}>
        <TemplateGallery
          aria-label={`${MODES.find((m) => m[0] === mode)?.[1]}範本`}
          key={mode}
          confirm={false}
          size="sm"
          defaultTag={list.find((t) => t.id === tplId)?.group}
          activeId={mineOn ? null : tplId}
          onApply={(t) => applyTemplate(t.id)}
          templates={list.map((t) => ({
            id: t.id,
            name: t.name,
            description: [t.text.split('\n')[0], t.sub].filter(Boolean).join('／'),
            tags: [t.group],
            thumbnail: thumbs.urls[t.id],
            data: t,
          }))}
        />
      </div>
    </Section>
  );
}

export function ModePanel({ onGallery }: { onGallery: (k: GalleryKind) => void }) {
  const c = useCfg();
  const mode = useTfx((st) => st.data.mode);
  const isLong = c.mode === 'long';
  const isShort = !isLong;
  const isScroll = isLong && c.flow.kind === 'scroll';
  const introDef = INTRO[c.intro.fx] || INTRO.fade;
  const outroDef = OUTRO[c.outro.fx] || OUTRO.fadeOut;
  const charDef = INTRO[c.flow.charFx] || INTRO.fade;
  const hasSub = !!c.sub.trim();
  const usesGlitch =
    c.hold.fx === 'glitchPulse' ||
    (isShort && c.introOn !== false && c.intro.fx === 'glitch') ||
    (c.outroOn && c.outro.fx === 'glitchOut');
  const introOn = c.introOn !== false;
  const charSection = isLong && introOn && !['big', 'stack', 'scroll'].includes(c.flow.kind);

  return (
    <div className="flex flex-col gap-3">
      <Section title="模式" fixed>
        <Segmented
          aria-label="模式"
          value={mode}
          onValueChange={(m) => setMode(m as Mode)}
          options={MODES.map(([value, label], i) => ({
            value,
            label,
            ariaLabel: `${label}（${S.modeDesc[value]}，快捷鍵 ${i + 1}）`,
          }))}
          fullWidth
        />
        <p className="m-0 -mt-1 text-xs text-muted">{S.modeDesc[mode]}</p>
      </Section>

      <TemplateSection />

      <MinePanel />

      {isShort ? (
        <Section title={S.intro.title} persistKey="text-fx:intro">
          <ToggleField label={S.introSwitch.label} path="introOn" hint={S.introSwitch.hint} />
          {introOn ? (
            <>
              <SelectField
                label="效果"
                path="intro.fx"
                options={fxGroups(INTRO)}
                onPick={pickIntro}
                hint={introDef.unit === 'block' ? S.intro.blockNote : S.intro.glyphNote}
                labelSuffix={<GalleryButton kind="intro" onOpen={onGallery} />}
              />
              {introDef.dirs ? (
                <SelectField label="方向" path="intro.dir" options={introDef.dirs} />
              ) : null}
              {!introDef.instant ? (
                <NumField
                  label="時長"
                  path="intro.dur"
                  min={0.05}
                  max={4}
                  step={0.01}
                  unit="秒"
                  digits={2}
                />
              ) : null}
              {introDef.unit === 'glyph' ? (
                <>
                  <NumField
                    label="字間隔"
                    path="intro.gap"
                    min={0}
                    max={0.6}
                    step={0.005}
                    unit="秒"
                    digits={3}
                  />
                  <SelectField label="順序" path="intro.order" options={ORDER_CHOICES} />
                </>
              ) : null}
              {!introDef.instant && introDef.curve !== null ? (
                <SelectField label="曲線" path="intro.curve" options={CURVE_CHOICES} />
              ) : null}
              {introDef.power !== false && !introDef.instant ? (
                <NumField
                  label="強度"
                  path="intro.power"
                  min={0.2}
                  max={2.5}
                  step={0.05}
                  unit="倍"
                  digits={2}
                />
              ) : null}
            </>
          ) : null}
        </Section>
      ) : null}

      {isShort && hasSub && introOn ? (
        <Section title={S.sub.title} persistKey="text-fx:sub-intro">
          <SelectField label="方式" path="subIntro" options={SUB_CHOICES} />
          <NumField
            label="時差"
            path="subOffset"
            min={-2}
            max={2}
            step={0.05}
            unit="秒"
            digits={2}
            hint={S.sub.offsetHint}
          />
          <p className="m-0 text-xs text-muted">
            {c.subIntro === 'same' && introDef.unit === 'block' ? S.sub.blockSame : S.sub.normal}
          </p>
        </Section>
      ) : null}

      {isLong ? (
        <Section title={S.flow.title} persistKey="text-fx:flow">
          {!isScroll ? (
            <ToggleField label={S.introSwitch.label} path="introOn" hint={S.introSwitch.hint} />
          ) : null}
          <SelectField
            label="流程"
            path="flow.kind"
            options={FLOW_CHOICES}
            labelSuffix={<GalleryButton kind="flow" onOpen={onGallery} />}
          />
          {!introOn && !isScroll ? (
            <p className="m-0 text-xs text-muted" data-testid="intro-off-note">
              {S.introSwitch.longOff}
            </p>
          ) : null}
          {introOn && ['seq', 'big'].includes(c.flow.kind) ? (
            <NumField label="每秒字數" path="flow.cps" min={2} max={40} step={1} unit="字" />
          ) : null}
          {introOn && c.flow.kind === 'seq' ? (
            <>
              <NumField
                label="句讀停頓"
                path="flow.punctPause"
                min={0}
                max={1.5}
                step={0.05}
                unit="秒"
                digits={2}
                hint={S.flow.punctHint}
              />
              <NumField
                label="行尾停頓"
                path="flow.linePause"
                min={0}
                max={2}
                step={0.05}
                unit="秒"
                digits={2}
              />
              <ToggleField label="顯示打字游標" path="flow.cursor" />
              {c.flow.cursor ? (
                <OptionalColorField
                  label="游標顏色"
                  path="flow.cursorColor"
                  sameLabel="同文字"
                  fallback="#ffffff"
                />
              ) : null}
            </>
          ) : null}
          {introOn && c.flow.kind === 'big' ? (
            <>
              <NumField
                label="大字尺寸"
                path="flow.bigRatio"
                min={15}
                max={90}
                step={1}
                scale={100}
                unit="%"
                hint={S.flow.bigHint}
              />
              <NumField
                label="整段出現前停頓"
                path="flow.bigPause"
                min={0}
                max={2}
                step={0.05}
                unit="秒"
                digits={2}
              />
              <NumField
                label="衝擊強度"
                path="flow.impact"
                min={0}
                max={2}
                step={0.05}
                unit="倍"
                digits={2}
              />
            </>
          ) : null}
          {introOn && c.flow.kind === 'stack' ? (
            <>
              <NumField
                label="疊合停留"
                path="flow.stackHold"
                min={0}
                max={3}
                step={0.05}
                unit="秒"
                digits={2}
              />
              <NumField
                label="展開時間"
                path="flow.spreadTime"
                min={0.1}
                max={3}
                step={0.05}
                unit="秒"
                digits={2}
              />
            </>
          ) : null}
          {introOn && ['line', 'scan'].includes(c.flow.kind) ? (
            <NumField
              label="行間隔"
              path="flow.lineGap"
              min={0.1}
              max={4}
              step={0.05}
              unit="秒"
              digits={2}
            />
          ) : null}
          {introOn && c.flow.kind === 'scan' ? (
            <NumField
              label="一行掃完"
              path="flow.scanTime"
              min={0.2}
              max={5}
              step={0.05}
              unit="秒"
              digits={2}
            />
          ) : null}
          {isScroll ? (
            <>
              <NumField
                label="捲動速度"
                path="flow.speed"
                min={10}
                max={400}
                step={1}
                unit="px/秒"
              />
              <ToggleField label="畫面邊緣淡出" path="flow.edgeFade" />
              <p className="m-0 text-xs text-muted">{S.flow.scrollNote}</p>
            </>
          ) : null}
        </Section>
      ) : null}

      {charSection ? (
        <Section title={S.flow.charTitle} persistKey="text-fx:char">
          <SelectField
            label="效果"
            path="flow.charFx"
            options={fxGroups(INTRO, (_id, d) => d.unit === 'glyph' && !d.shortOnly)}
            onPick={pickChar}
            labelSuffix={<GalleryButton kind="char" onOpen={onGallery} />}
          />
          {!charDef.instant ? (
            <NumField
              label="單字出現時間"
              path="flow.charDur"
              min={0}
              max={2}
              step={0.01}
              unit="秒"
              digits={2}
            />
          ) : null}
          {charDef.dirs ? (
            <SelectField label="方向" path="intro.dir" options={charDef.dirs} />
          ) : null}
          {!charDef.instant ? (
            <SelectField label="曲線" path="intro.curve" options={CURVE_CHOICES} />
          ) : null}
          {charDef.power !== false && !charDef.instant ? (
            <NumField
              label="強度"
              path="intro.power"
              min={0.2}
              max={2.5}
              step={0.05}
              unit="倍"
              digits={2}
            />
          ) : null}
        </Section>
      ) : null}

      {isLong && !isScroll ? (
        <Section title={S.paging.title} persistKey="text-fx:paging" description={S.paging.note}>
          <ToggleField label="空白行＝換頁" path="paging" />
          {c.paging ? (
            <NumField
              label="頁與頁之間"
              path="flow.pageGap"
              min={0}
              max={3}
              step={0.05}
              unit="秒"
              digits={2}
            />
          ) : null}
        </Section>
      ) : null}

      <Section title={S.hold.title} persistKey="text-fx:hold">
        <SelectField
          label="效果"
          path="hold.fx"
          options={Object.entries(HOLD).map(([id, d]) => [id, d.name] as const)}
          hint={HOLD[c.hold.fx]?.note || S.hold.none}
          labelSuffix={<GalleryButton kind="hold" onOpen={onGallery} />}
        />
        {c.hold.fx !== 'none' ? (
          <NumField
            label="強度"
            path="hold.power"
            min={0.2}
            max={3}
            step={0.05}
            unit="倍"
            digits={2}
          />
        ) : null}
        {!isScroll ? (
          <NumField
            label="停留時間"
            path="holdTime"
            min={0}
            max={10}
            step={0.1}
            unit="秒"
            digits={1}
          />
        ) : null}
      </Section>

      {!isScroll ? (
        <Section title={S.outro.title} persistKey="text-fx:outro">
          <ToggleField
            label="要有退場"
            path="outroOn"
            hint="關掉時停在完成狀態，素材出現後一直留著。"
          />
          {c.outroOn ? (
            <>
              <SelectField
                label="效果"
                path="outro.fx"
                options={fxGroups(OUTRO)}
                onPick={pickOutro}
                labelSuffix={<GalleryButton kind="outro" onOpen={onGallery} />}
              />
              {outroDef.dirs ? (
                <SelectField label="方向" path="outro.dir" options={outroDef.dirs} />
              ) : null}
              {!outroDef.instant ? (
                <NumField
                  label="時長"
                  path="outro.dur"
                  min={0.05}
                  max={4}
                  step={0.01}
                  unit="秒"
                  digits={2}
                />
              ) : null}
              {outroDef.unit === 'glyph' ? (
                <NumField
                  label="字間隔"
                  path="outro.gap"
                  min={0}
                  max={0.6}
                  step={0.005}
                  unit="秒"
                  digits={3}
                />
              ) : null}
              {outroDef.unit === 'glyph' && !outroDef.forceOrder ? (
                <SelectField label="順序" path="outro.order" options={ORDER_CHOICES} />
              ) : null}
              {outroDef.forceOrder ? (
                <p className="m-0 text-xs text-muted">{S.outro.backspaceNote}</p>
              ) : null}
              {!outroDef.instant ? (
                <SelectField label="曲線" path="outro.curve" options={CURVE_CHOICES} />
              ) : null}
              {outroDef.power !== false && !outroDef.instant ? (
                <NumField
                  label="強度"
                  path="outro.power"
                  min={0.2}
                  max={2.5}
                  step={0.05}
                  unit="倍"
                  digits={2}
                />
              ) : null}
            </>
          ) : null}
        </Section>
      ) : null}

      {usesGlitch ? (
        <Section title={S.glitch.title} persistKey="text-fx:glitch">
          <ColorPathField label="往左的分色" path="glitchA" />
          <ColorPathField label="往右的分色" path="glitchB" />
        </Section>
      ) : null}
    </div>
  );
}
