/**
 * 「名稱」分頁：角色名稱的位置、外觀、字型、顏色、對齊、太長時的處理、直書、距離（F53～F61）。
 */
import { Section } from '@/ui';
import { ColorPathField, NumField, SegField, SelectField, ToggleField, useS } from '../controls';
import { S } from '../strings';
import { FontRefField, WeightField } from './TextPanel';

export function NamePanel() {
  const s = useS();
  const n = s.name;
  const shown = n.pos !== 'none';
  const avatarPos = n.pos === 'avatar';
  const left = n.pos === 'left';
  const bg = n.look === 'plate' || n.look === 'side' || avatarPos;
  const accent =
    n.look === 'underline' || n.look === 'side' || n.look === 'tab' || n.look === 'badge';
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.name.section} description={S.name.intro} persistKey="status-bar:name">
        <SelectField label={S.name.pos} path="name.pos" options={S.namePos} />
        {avatarPos && !s.avatar.show ? (
          <p className="m-0 text-xs text-warning">{S.name.avatarOff}</p>
        ) : null}
        {shown ? (
          <>
            <SelectField label={S.name.look} path="name.look" options={S.nameLook} />
            <FontRefField
              label={S.name.font}
              path="name.font"
              value={n.font}
              weight={n.weight}
              previewText={S.name.preview}
            />
            <WeightField
              label={S.text.weight}
              path="name.weight"
              value={n.weight}
              fonts={[n.font]}
            />
            <NumField label={S.name.size} path="name.size" unit="px" />
            <ColorPathField label={S.name.color} path="name.color" />
            <ColorPathField label={S.name.background} path="name.background" alpha hidden={!bg} />
            <ToggleField label={S.name.accentUseChar} path="name.accentUseChar" hidden={!accent} />
            <ColorPathField
              label={S.name.accent}
              path="name.accent"
              hint={S.name.accentHint}
              hidden={!accent || n.accentUseChar}
            />
            <SegField
              label={S.name.align}
              path="name.align"
              options={S.nameAlign}
              hidden={avatarPos}
            />
            <SegField
              label={S.name.overflow}
              path="name.overflow"
              options={S.nameOverflow}
              hidden={left}
            />
            <ToggleField label={S.name.vertical} path="name.vertical" hidden={!left} />
            <ToggleField
              label={S.name.verticalWrap}
              path="name.verticalWrap"
              hidden={!left || !n.vertical}
            />
            <NumField label={S.name.gap} path="name.gap" unit="px" hidden={avatarPos} />
          </>
        ) : null}
      </Section>
    </div>
  );
}
