/** 「裝飾」分頁：裝飾（線條、框、色帶、膠帶）與整張背景 */
import { Section } from '@/ui';
import { ColorPathField, NumField, SegField, SelectField, ToggleField, useCfg } from '../controls';
import { BACKDROP_CHOICES, DECO_CHOICES, LINE_DECOS } from '../ornament';
import { S } from '../strings';

export function DecoPanel() {
  const c = useCfg();
  const k = c.deco.kind;
  const on = k !== 'none';
  const lineish = LINE_DECOS.has(k) || k === 'roundBox';
  const isScroll = c.mode === 'long' && c.flow.kind === 'scroll';
  const fillable = ['band', 'roundBox', 'frame'].includes(k);
  return (
    <div className="flex flex-col gap-3">
      <Section title="裝飾" fixed>
        <SelectField
          label="種類"
          path="deco.kind"
          options={DECO_CHOICES}
          hint={S.deco.notes[k] ?? ''}
        />
        {isScroll ? <p className="m-0 text-xs text-warning">{S.deco.scrollNote}</p> : null}
        {on ? (
          <>
            <SegField
              label="動畫"
              path="deco.anim"
              options={[
                ['grow', '生長'],
                ['fade', '淡入淡出'],
                ['none', '無'],
              ]}
            />
            {c.deco.anim !== 'none' ? (
              <NumField
                label="動畫時間"
                path="deco.animTime"
                min={0.1}
                max={2.5}
                step={0.05}
                unit="秒"
                digits={2}
              />
            ) : null}
            <NumField
              label="與文字的距離"
              path="deco.gap"
              min={0}
              max={2}
              step={0.01}
              unit="× 字級"
              digits={2}
            />
          </>
        ) : null}
        {lineish ? (
          <>
            <NumField
              label="線寬"
              path="deco.lineWidth"
              min={0}
              max={16}
              step={0.5}
              unit="px"
              digits={1}
            />
            <ColorPathField label="線色" path="deco.lineColor" />
          </>
        ) : null}
        {LINE_DECOS.has(k) && (c.stroke.on || c.outer.on) ? (
          <ToggleField label="線條也套用文字外框" path="deco.outline" />
        ) : null}
        {['frame', 'rails', 'underline', 'dashes'].includes(k) ? (
          <NumField
            label="左右延伸"
            path="deco.extend"
            min={0}
            max={12}
            step={0.05}
            unit="× 字級"
            digits={2}
          />
        ) : null}
        {k === 'frame' ? (
          <SelectField
            label="角落裝飾"
            path="deco.corner"
            options={[
              ['none', '無'],
              ['square', '方塊'],
              ['diamond', '菱形'],
            ]}
          />
        ) : null}
        {k === 'roundBox' ? (
          <NumField
            label="圓角"
            path="deco.radius"
            min={0}
            max={1}
            step={0.01}
            unit="× 字級"
            digits={2}
          />
        ) : null}
        {fillable ? (
          <>
            <ColorPathField label="填色" path="deco.fillColor" />
            <NumField
              label="填色濃度"
              path="deco.fillAlpha"
              min={0}
              max={100}
              step={1}
              scale={100}
              unit="%"
            />
          </>
        ) : null}
        {k === 'band' ? (
          <>
            <NumField
              label="上下柔邊"
              path="deco.softEdge"
              min={0}
              max={100}
              step={1}
              scale={100}
              unit="%"
            />
            <NumField
              label="左右淡出"
              path="deco.sideFade"
              min={0}
              max={100}
              step={1}
              scale={100}
              unit="%"
            />
          </>
        ) : null}
        {k === 'tape' ? (
          <>
            <NumField label="膠帶粗細" path="deco.tapeWidth" min={8} max={120} step={1} unit="px" />
            <NumField
              label="斜紋流動"
              path="deco.tapeSpeed"
              min={0}
              max={400}
              step={5}
              unit="px/秒"
              hint="0＝不流動"
            />
            <NumField
              label="閃爍變暗"
              path="deco.tapeBlink"
              min={0}
              max={100}
              step={1}
              scale={100}
              unit="%"
            />
            <ColorPathField label="底色" path="deco.tapeA" />
            <ColorPathField label="斜紋色" path="deco.tapeB" />
          </>
        ) : null}
      </Section>

      <Section title="整張背景" persistKey="text-fx:backdrop">
        <SelectField label="種類" path="bg.kind" options={BACKDROP_CHOICES} />
        {c.bg.kind !== 'none' ? (
          <>
            <ColorPathField label="顏色" path="bg.color" />
            <NumField
              label="濃度"
              path="bg.alpha"
              min={0}
              max={100}
              step={1}
              scale={100}
              unit="%"
            />
            <ToggleField label="跟著文字淡入淡出" path="bg.sync" />
            <p className="m-0 text-xs text-muted">{S.deco.bgNote}</p>
          </>
        ) : null}
      </Section>
    </div>
  );
}
