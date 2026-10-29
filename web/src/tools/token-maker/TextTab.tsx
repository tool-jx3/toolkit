/**
 * 「名字」分頁（eidolon-ui 的名字牌、弧形文字、徽章）：名稱與徽章文字是每個棋子的；
 * 顯示與否、樣式、顏色、位置、字型是外觀（所有棋子共用）。位置在預覽上拖曳（Preview）。
 */
import { RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import {
  Button,
  ColorField,
  Field,
  FontPicker,
  GestureScope,
  Notice,
  Section,
  Segmented,
  Select,
  Show,
  TextInput,
  Toggle,
} from '@/ui';
import { lookColors } from './labels';
import {
  BADGE_MAX,
  COLOR_SOURCES,
  type ColorSource,
  DEFAULT_LOOK,
  type LabelStyle,
  type Look,
  NAME_MAX,
  type TokenItem,
} from './model';
import { imagePalette, useTokenData } from './sources';
import { currentToken, edit, editCurrent, editLook, gesture, useDoc } from './store';
import { S } from './strings';

type Source = ColorSource | 'auto';
type ColorKey = 'plateColor' | 'labelColor' | 'badgeColor' | 'badgeTextColor';
type FromKey = 'plateFrom' | 'labelFrom' | 'badgeFrom' | 'badgeTextFrom';

function usePalette(token: TokenItem | null): string[] {
  const data = useTokenData(token?.image ?? null, null);
  return useMemo(() => (data.work ? imagePalette(data.work.work) : []), [data.work]);
}

/** 顏色來源（外框色、第二色、背景色、自訂；徽章文字另有自動）＋自訂時的顏色欄 */
function SourceColorField({
  label,
  look,
  fromKey,
  colorKey,
  allowAuto,
  pal,
  testId,
}: {
  label: string;
  look: Look;
  fromKey: FromKey;
  colorKey: ColorKey;
  allowAuto?: boolean;
  pal: string[];
  testId: string;
}) {
  const from = look[fromKey] as Source;
  const c = lookColors(look);
  const shown =
    from === 'frame' ? c.frame : from === 'accent' ? c.accent : from === 'bg' ? c.bg : null;
  const options = [
    ...(allowAuto ? [{ value: 'auto' as Source, label: S.colorAuto }] : []),
    ...COLOR_SOURCES.map((v) => ({ value: v as Source, label: S.colorSources[v] })),
  ];
  return (
    <Field label={label}>
      <div className="flex min-w-0 items-center gap-2">
        <div className="w-28 shrink-0">
          <Select<Source>
            value={from}
            options={options}
            data-testid={testId}
            onValueChange={(v) =>
              editLook((l) => {
                (l[fromKey] as Source) = v;
              })
            }
          />
        </div>
        {from === 'custom' ? (
          <div className="min-w-0 flex-1">
            <GestureScope gesture={gesture}>
              <ColorField
                aria-label={label}
                value={look[colorKey]}
                swatches={pal}
                onChange={(v) =>
                  editLook((l) => {
                    l[colorKey] = v.slice(0, 7).toLowerCase();
                  })
                }
              />
            </GestureScope>
          </div>
        ) : shown ? (
          <span
            aria-hidden
            className="size-8 shrink-0 rounded-md border border-border-strong"
            style={{ background: shown }}
          />
        ) : null}
      </div>
    </Field>
  );
}

export function TextTab() {
  const look = useDoc((s) => s.data.look);
  const token = useDoc((s) => currentToken(s.data));
  const pal = usePalette(token);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {!token ? <Notice tone="info">{S.noTokenText}</Notice> : null}
      <Section title={S.nameSection} persistKey="token-maker:name">
        {token ? (
          <Field label={S.nameLabel} hint={S.nameHint}>
            <TextInput
              value={token.name}
              maxLength={NAME_MAX}
              placeholder={S.namePlaceholder}
              data-testid="token-name"
              onFocus={gesture.begin}
              onBlur={gesture.commit}
              onChange={(e) => {
                const v = e.target.value;
                editCurrent((t) => {
                  t.name = v;
                });
              }}
            />
          </Field>
        ) : null}
        <Field label={S.labelOn} layout="inline">
          <Toggle
            checked={look.labelOn}
            onCheckedChange={(v) =>
              edit((d) => {
                d.look.labelOn = v;
                /* 打開時名稱是空的就先填一個，看得到名字牌 */
                const t = d.tokens.find((x) => x.id === d.current);
                if (v && t && !t.name.trim()) t.name = S.labelDefault;
              })
            }
          />
        </Field>
        <Show when={look.labelOn}>
          <Field label={S.labelStyle}>
            <Segmented<LabelStyle>
              value={look.labelStyle}
              onValueChange={(v) =>
                editLook((l) => {
                  l.labelStyle = v;
                })
              }
              options={(['plate', 'arc'] as LabelStyle[]).map((v) => ({
                value: v,
                label: S.labelStyles[v],
              }))}
            />
          </Field>
          {look.labelStyle === 'plate' ? (
            <SourceColorField
              label={S.plateColor}
              look={look}
              fromKey="plateFrom"
              colorKey="plateColor"
              pal={pal}
              testId="plate-from"
            />
          ) : null}
          <SourceColorField
            label={S.labelColor}
            look={look}
            fromKey="labelFrom"
            colorKey="labelColor"
            pal={pal}
            testId="label-from"
          />
        </Show>
      </Section>

      <Section title={S.badgeSection} persistKey="token-maker:badge">
        {token ? (
          <Field label={S.badgeLabel} hint={S.badgeHint}>
            <TextInput
              value={token.badge}
              maxLength={BADGE_MAX}
              placeholder={S.badgePlaceholder}
              data-testid="token-badge"
              onFocus={gesture.begin}
              onBlur={gesture.commit}
              onChange={(e) => {
                const v = e.target.value;
                editCurrent((t) => {
                  t.badge = v;
                });
              }}
            />
          </Field>
        ) : null}
        <Field label={S.badgeOn} layout="inline">
          <Toggle
            checked={look.badgeOn}
            onCheckedChange={(v) =>
              edit((d) => {
                d.look.badgeOn = v;
                const t = d.tokens.find((x) => x.id === d.current);
                if (v && t && !t.badge.trim()) t.badge = '1';
              })
            }
          />
        </Field>
        <Show when={look.badgeOn}>
          <SourceColorField
            label={S.badgeColor}
            look={look}
            fromKey="badgeFrom"
            colorKey="badgeColor"
            pal={pal}
            testId="badge-from"
          />
          <SourceColorField
            label={S.badgeTextColor}
            look={look}
            fromKey="badgeTextFrom"
            colorKey="badgeTextColor"
            allowAuto
            pal={pal}
            testId="badge-text-from"
          />
        </Show>
      </Section>

      <Section title={S.fontSection} persistKey="token-maker:font">
        <Field label={S.fontLabel}>
          <FontPicker
            value={look.font}
            previewText="哥布林 GOBLIN 12"
            onChange={(v) =>
              editLook((l) => {
                l.font = { ...v };
              })
            }
          />
        </Field>
        <p className="m-0 text-xs text-muted">{S.overlayHint}</p>
        <div>
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw />}
            onClick={() =>
              editLook((l) => {
                l.labelX = DEFAULT_LOOK.labelX;
                l.labelY = DEFAULT_LOOK.labelY;
                l.badgeX = DEFAULT_LOOK.badgeX;
                l.badgeY = DEFAULT_LOOK.badgeY;
              })
            }
          >
            {S.resetPositions}
          </Button>
        </div>
      </Section>
    </div>
  );
}
