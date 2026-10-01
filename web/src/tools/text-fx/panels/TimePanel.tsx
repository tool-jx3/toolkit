/** 「時間與尺寸」分頁：畫面尺寸、fps、各段時間與總長 */
import { useState } from 'react';
import { frameCount } from '@/core/timeline';
import { Field, FieldRow, NumberInput, Section, Select } from '@/ui';
import { NumField, SegField, setCfg, useCfg } from '../controls';
import { INTRO, OUTRO } from '../motion';
import type { Scene } from '../scene';
import { FPS_CHOICES } from '../settings';
import { updateCfg } from '../store';
import { S } from '../strings';

const SIZE_PRESETS: readonly (readonly [string, string])[] = [
  ['1920x1080', '1920×1080（16:9）'],
  ['1280x720', '1280×720（16:9）'],
  ['960x540', '960×540（16:9）'],
  ['1280x360', '1280×360（橫長帶狀）'],
  ['1024x256', '1024×256（橫長帶狀）'],
  ['1080x1080', '1080×1080（正方形）'],
  ['1080x1920', '1080×1920（直式）'],
  ['720x1280', '720×1280（直式）'],
  ['custom', '自訂…'],
];

export function TimePanel({ scene }: { scene: Scene }) {
  const c = useCfg();
  const [customOpen, setCustomOpen] = useState(false);
  const key = `${c.canvasW}x${c.canvasH}`;
  const sizeVal = SIZE_PRESETS.some((s) => s[0] === key) && !customOpen ? key : 'custom';
  const isLong = c.mode === 'long';
  const isScroll = isLong && c.flow.kind === 'scroll';
  const introDef = INTRO[c.intro.fx] || INTRO.fade;
  const charDef = INTRO[c.flow.charFx] || INTRO.fade;
  const outroDef = OUTRO[c.outro.fx] || OUTRO.fadeOut;
  const n = frameCount(scene.duration, c.fps);

  return (
    <div className="flex flex-col gap-3">
      <Section title={S.time.size} fixed>
        <Field label="尺寸">
          <Select
            value={sizeVal}
            onValueChange={(v) => {
              if (v === 'custom') {
                setCustomOpen(true);
                return;
              }
              setCustomOpen(false);
              const [w, h] = v.split('x').map(Number);
              updateCfg((s) => {
                s.canvasW = w;
                s.canvasH = h;
              });
            }}
            options={SIZE_PRESETS.map(([value, label]) => ({ value, label }))}
          />
        </Field>
        {sizeVal === 'custom' ? (
          <FieldRow>
            <Field label="寬">
              <NumberInput
                value={c.canvasW}
                onChange={(v) => setCfg('canvasW', Math.round(v))}
                min={16}
                max={2048}
                unit="px"
              />
            </Field>
            <Field label="高">
              <NumberInput
                value={c.canvasH}
                onChange={(v) => setCfg('canvasH', Math.round(v))}
                min={16}
                max={2048}
                unit="px"
              />
            </Field>
          </FieldRow>
        ) : null}
      </Section>

      <Section title={S.time.timing} fixed>
        <SegField
          label="fps"
          path="fps"
          parse={Number}
          options={FPS_CHOICES.map((f) => [String(f), String(f)] as const)}
        />
        <NumField
          label="開始前空白"
          path="preBlank"
          min={0}
          max={3}
          step={0.05}
          unit="秒"
          digits={2}
        />
        {!isLong && !introDef.instant ? (
          <NumField
            label="登場時長"
            path="intro.dur"
            min={0.05}
            max={4}
            step={0.01}
            unit="秒"
            digits={2}
          />
        ) : null}
        {isLong && !['big', 'stack', 'scroll'].includes(c.flow.kind) && !charDef.instant ? (
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
        {c.outroOn && !isScroll && !outroDef.instant ? (
          <NumField
            label="退場時長"
            path="outro.dur"
            min={0.05}
            max={4}
            step={0.01}
            unit="秒"
            digits={2}
          />
        ) : null}
        <NumField
          label="結束後空白"
          path="postBlank"
          min={0}
          max={5}
          step={0.05}
          unit="秒"
          digits={2}
        />
        <p
          className="m-0 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted"
          data-testid="total-note"
        >
          總長 {scene.duration.toFixed(2)} 秒・{c.fps} fps 共 {n} 格
          {isLong ? `・${scene.pages.length} 頁` : ''}・完成狀態在 {scene.repTime.toFixed(2)} 秒
        </p>
      </Section>
    </div>
  );
}
