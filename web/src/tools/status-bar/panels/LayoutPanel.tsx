/**
 * 「排列」分頁：範本（F01、F02）、條數與排列（F03～F09、F16）、文字位置（F10～F15）。
 */
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Button, Field, Section, Select } from '@/ui';
import { NumField, SegField, SelectField, ToggleField, useS } from '../controls';
import { setStatus, useSettings } from '../store';
import { S } from '../strings';
import { applyStatusTemplate, TEMPLATES, templateById } from '../templates';

function TemplatePicker() {
  const s = useS();
  const [picked, setPicked] = useState(s.templateId ?? TEMPLATES[0].id);
  const tpl = templateById(picked) ?? TEMPLATES[0];
  const current = templateById(s.templateId);
  const apply = () => {
    useSettings.getState().replace(applyStatusTemplate(useSettings.getState().data, tpl.id));
    setStatus(S.template.applied(tpl.name), 'success');
  };
  return (
    <Section title={S.template.title} persistKey="status-bar:template">
      <Field label={S.template.pick}>
        <div className="flex min-w-0 gap-2">
          <Select
            value={picked}
            onValueChange={setPicked}
            options={TEMPLATES.map((t) => ({ value: t.id, label: t.name }))}
            className="min-w-0 flex-1"
          />
          <Button variant="primary" icon={<Check />} onClick={apply}>
            {S.template.apply}
          </Button>
        </div>
      </Field>
      <div
        className="flex flex-col gap-1.5 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted"
        data-testid="template-info"
      >
        <p className="m-0 text-sm text-fg">{tpl.description}</p>
        <p className="m-0">{S.template.replaces}</p>
        <p className="m-0">{S.template.keeps}</p>
      </div>
      {current ? (
        <p className="m-0 text-xs text-muted" data-testid="template-current">
          {S.template.current(current.name)}
        </p>
      ) : null}
    </Section>
  );
}

export function LayoutPanel() {
  const s = useS();
  const inside = s.textPos === 'inside';
  const cols = s.textPos === 'three' || s.textPos === 'two';
  return (
    <div className="flex flex-col gap-3">
      <TemplatePicker />
      <Section title={S.layout.section} persistKey="status-bar:layout">
        <NumField
          label={S.layout.count}
          path="barCount"
          unit={S.layout.countUnit}
          hint={S.layout.countHint}
        />
        <ToggleField label={S.layout.hideExtra} path="hideExtra" hint={S.layout.hideExtraHint} />
        <SegField label={S.layout.direction} path="direction" options={S.direction} />
        <NumField
          label={S.layout.columns}
          path="columns"
          unit="欄"
          hidden={s.direction !== 'grid'}
        />
        <NumField
          label={S.layout.barWidth}
          path="barWidth"
          unit="px"
          hint={S.layout.barWidthHint}
        />
        <NumField label={S.layout.barHeight} path="barHeight" unit="px" />
        <NumField label={S.layout.barGap} path="barGap" unit="px" />
        <NumField label={S.layout.margin} path="margin" unit="px" hint={S.layout.marginHint} />
      </Section>
      <Section title={S.layout.textSection} persistKey="status-bar:textpos">
        <SelectField
          label={S.layout.textPos}
          path="textPos"
          options={S.textPos}
          hint={S.textPosHint[s.textPos]}
        />
        <SegField
          label={S.layout.insideAlign}
          path="insideAlign"
          options={S.insideAlign}
          hidden={!inside}
        />
        <NumField
          label={S.layout.textInset}
          path="textInset"
          unit="px"
          hidden={!(inside || s.textPos === 'two')}
        />
        <NumField label={S.layout.labelWidth} path="labelWidth" unit="px" hidden={!cols} />
        <NumField
          label={S.layout.valueWidth}
          path="valueWidth"
          unit="px"
          hidden={s.textPos !== 'three'}
        />
        <NumField label={S.layout.textGap} path="textGap" unit="px" hidden={inside} />
      </Section>
    </div>
  );
}
