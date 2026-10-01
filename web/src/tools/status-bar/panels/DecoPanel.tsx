/**
 * 「裝飾」分頁：背景面板（F75）、整體外框（F76）、光澤（F77）、外圈光暈（F78）、前端光線（F79）、
 * 流動光線（F80）、掃描線（F81）、刻度（F82）、顆粒（F83）、角落括號（F84）。每一種都是開關＋說明，開了才出現設定。
 */
import type { ReactNode } from 'react';
import { Section, Toggle } from '@/ui';
import { ColorPathField, NumField, SegField, SelectField, ToggleField, useS } from '../controls';
import { getPath } from '../settings';
import { setSetting } from '../store';
import { S } from '../strings';

const D = S.deco;

function Deco({
  title,
  path,
  hint,
  children,
}: {
  title: string;
  path: string;
  hint: string;
  children: ReactNode;
}) {
  const s = useS();
  const on = !!getPath(s, `${path}.on`);
  return (
    <Section
      title={title}
      persistKey={`status-bar:deco:${path}`}
      actions={
        <Toggle
          aria-label={title}
          checked={on}
          onCheckedChange={(v) => setSetting(`${path}.on`, v)}
        />
      }
    >
      <p className="m-0 text-xs text-muted">{hint}</p>
      {on ? children : null}
    </Section>
  );
}

export function DecoPanel() {
  const s = useS();
  const f = s.frame;
  const cornerKinds = f.kind === 'corners' || f.kind === 'thin';
  return (
    <div className="flex flex-col gap-3">
      <Deco title={D.panel} path="panel" hint={D.panelHint}>
        <ColorPathField label={D.panelColor} path="panel.color" alpha />
        <NumField label={D.panelRadius} path="panel.radius" unit="px" />
        <NumField label={D.panelPadding} path="panel.padding" unit="px" />
        <NumField label={D.panelBorder} path="panel.borderWidth" unit="px" />
        <ColorPathField
          label={D.panelBorderColor}
          path="panel.borderColor"
          hidden={s.panel.borderWidth === 0}
        />
        <NumField
          label={D.panelBorderOpacity}
          path="panel.borderOpacity"
          unit="%"
          hidden={s.panel.borderWidth === 0}
        />
        <ToggleField label={D.strip} path="panel.strip" />
        <SegField label={D.texture} path="panel.texture" options={S.texture} />
      </Deco>
      <Deco title={D.frame} path="frame" hint={D.frameHint}>
        <SelectField label={D.frameKind} path="frame.kind" options={S.frameKind} />
        <NumField label={D.frameWidth} path="frame.width" unit="px" />
        <ToggleField label={D.frameUseChar} path="frame.useChar" />
        <ColorPathField label={D.frameColor} path="frame.color" hidden={f.useChar} />
        <NumField label={D.frameOpacity} path="frame.opacity" unit="%" />
        <NumField label={D.frameGap} path="frame.gap" unit="px" hint={D.frameGapHint} />
        <NumField label={D.frameRadius} path="frame.radius" unit="px" hidden={cornerKinds} />
        <NumField label={D.frameCorner} path="frame.corner" unit="px" hidden={!cornerKinds} />
      </Deco>
      <Deco title={D.gloss} path="gloss" hint={D.glossHint}>
        <NumField label={D.strength} path="gloss.strength" unit="%" />
      </Deco>
      <Deco title={D.glow} path="glow" hint={D.glowHint}>
        <NumField label={D.spread} path="glow.spread" unit="px" />
        <NumField label={D.strength} path="glow.strength" unit="%" />
      </Deco>
      <Deco title={D.lead} path="lead" hint={D.leadHint}>
        <NumField label={D.strength} path="lead.strength" unit="%" />
      </Deco>
      <Deco title={D.sweep} path="sweep" hint={D.sweepHint}>
        <NumField label={D.strength} path="sweep.strength" unit="%" />
        <NumField label={D.interval} path="sweep.interval" unit="秒" precision={1} />
      </Deco>
      <Deco title={D.scanlines} path="scanlines" hint={D.scanlinesHint}>
        <NumField label={D.density} path="scanlines.strength" unit="%" />
        <NumField label={D.period} path="scanlines.period" unit="px" />
      </Deco>
      <Deco title={D.ticks} path="ticks" hint={D.ticksHint}>
        <NumField label={D.tickCount} path="ticks.count" unit="格" />
        <ColorPathField label={D.color} path="ticks.color" />
        <NumField label={D.density} path="ticks.strength" unit="%" />
      </Deco>
      <Deco title={D.grain} path="grain" hint={D.grainHint}>
        <NumField label={D.density} path="grain.strength" unit="%" />
      </Deco>
      <Deco title={D.brackets} path="brackets" hint={D.bracketsHint}>
        <ColorPathField label={D.color} path="brackets.color" />
        <NumField label={D.density} path="brackets.strength" unit="%" />
        <NumField label={D.length} path="brackets.length" unit="px" />
        <NumField label={D.width} path="brackets.width" unit="px" />
        <NumField label={D.bracketGap} path="brackets.gap" unit="px" />
      </Deco>
    </div>
  );
}
