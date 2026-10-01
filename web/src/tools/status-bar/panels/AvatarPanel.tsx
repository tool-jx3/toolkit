/**
 * 「頭像」分頁：頭像（F17～F24）與先攻值徽章（F25）。
 */
import { FieldRow, Section } from '@/ui';
import { ColorPathField, NumField, SegField, ToggleField, useS } from '../controls';
import { S } from '../strings';

export function AvatarPanel() {
  const s = useS();
  const on = s.avatar.show;
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.avatar.section} persistKey="status-bar:avatar">
        <ToggleField label={S.avatar.show} path="avatar.show" hint={S.avatar.showHint} />
        {on ? (
          <>
            <SegField label={S.avatar.pos} path="avatar.pos" options={S.avatarPos} />
            <NumField label={S.avatar.width} path="avatar.width" unit="px" />
            <NumField label={S.avatar.height} path="avatar.height" unit="px" />
            <SegField label={S.avatar.fit} path="avatar.fit" options={S.avatarFit} />
            <NumField label={S.avatar.radius} path="avatar.radius" unit="px" />
            <NumField label={S.avatar.borderWidth} path="avatar.borderWidth" unit="px" />
            <ToggleField label={S.avatar.borderUseChar} path="avatar.borderUseChar" />
            <ColorPathField
              label={S.avatar.borderColor}
              path="avatar.borderColor"
              alpha
              hidden={s.avatar.borderUseChar}
            />
            <ColorPathField
              label={S.avatar.background}
              path="avatar.background"
              alpha
              hint={S.avatar.backgroundHint}
            />
            <NumField label={S.avatar.gap} path="avatar.gap" unit="px" />
          </>
        ) : null}
      </Section>
      <Section title={S.avatar.iniSection} persistKey="status-bar:initiative">
        <ToggleField label={S.avatar.ini} path="initiative.show" hint={S.avatar.iniHint} />
        {s.initiative.show && on ? (
          <>
            <SegField label={S.avatar.iniCorner} path="initiative.corner" options={S.corner} />
            <NumField label={S.avatar.iniSize} path="initiative.size" unit="px" />
            <FieldRow>
              <ColorPathField label={S.avatar.iniColor} path="initiative.color" />
              <ColorPathField label={S.avatar.iniBackground} path="initiative.background" />
            </FieldRow>
          </>
        ) : null}
        {s.initiative.show && !on ? (
          <p className="m-0 text-xs text-warning">{S.avatar.showHint}</p>
        ) : null}
      </Section>
    </div>
  );
}
