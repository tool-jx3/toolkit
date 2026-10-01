/** 「文字」分頁：主文字、副文字、書寫方向、排列、位置、換行與縮小 */
import { AnchorPicker, type AnchorValue, Field, Section, TextArea, TextInput } from '@/ui';
import { NumField, parseBool, SegField, setCfg, ToggleField, useCfg } from '../controls';
import { S } from '../strings';

export function TextPanel() {
  const c = useCfg();
  const isLong = c.mode === 'long';
  const hasSub = !!c.sub.trim();
  const note = isLong
    ? c.paging && c.flow.kind !== 'scroll'
      ? S.text.longPaging
      : S.text.longOne
    : c.mode === 'caption'
      ? S.text.caption
      : S.text.title;
  const alignLabels = c.vertical ? ['靠上', '置中', '靠下'] : ['靠左', '置中', '靠右'];
  const subPosLabels = c.vertical ? ['右側（前）', '左側（後）'] : ['上方', '下方'];

  return (
    <div className="flex flex-col gap-3">
      <Section title="文字" fixed>
        <Field label="主文字" hint={note}>
          <TextArea
            value={c.text}
            onChange={(e) => setCfg('text', e.target.value)}
            rows={isLong ? 10 : 3}
            spellCheck={false}
            placeholder={S.text.placeholder}
            className="text-base"
          />
        </Field>
        {!isLong ? (
          <Field label="副文字（可留空）">
            <TextInput
              value={c.sub}
              onChange={(e) => setCfg('sub', e.target.value)}
              spellCheck={false}
              placeholder={S.text.subPlaceholder}
            />
          </Field>
        ) : null}
      </Section>

      <Section title="書寫方向" persistKey="text-fx:direction">
        <SegField
          label="方向"
          path="vertical"
          parse={parseBool}
          options={[
            ['false', '橫書'],
            ['true', '直書'],
          ]}
        />
        {c.vertical ? (
          <>
            <SegField
              label="直書英數"
              path="latinUpright"
              parse={parseBool}
              options={[
                ['false', '旋轉 90°'],
                ['true', '直立'],
              ]}
            />
            <SegField
              label="直書標點"
              path="punctCenter"
              parse={parseBool}
              options={[
                ['false', '靠右上'],
                ['true', '置中'],
              ]}
            />
            <p className="m-0 text-xs text-muted">{S.text.verticalNote}</p>
          </>
        ) : null}
      </Section>

      <Section title="排列" persistKey="text-fx:arrange">
        <SegField
          label="對齊"
          path="align"
          options={[
            ['start', alignLabels[0]],
            ['center', alignLabels[1]],
            ['end', alignLabels[2]],
          ]}
        />
        {!isLong && hasSub ? (
          <SegField
            label="副文字位置"
            path="subPos"
            options={[
              ['before', subPosLabels[0]],
              ['after', subPosLabels[1]],
            ]}
          />
        ) : null}
      </Section>

      <Section title="位置" persistKey="text-fx:position">
        <Field label="錨點">
          <AnchorPicker value={c.anchor} onChange={(a: AnchorValue) => setCfg('anchor', a)} />
        </Field>
        <NumField label="左右邊距" path="marginX" min={0} max={400} step={1} unit="px" />
        <NumField label="上下邊距" path="marginY" min={0} max={400} step={1} unit="px" />
        <NumField label="水平微調" path="offsetX" min={-800} max={800} step={1} unit="px" />
        <NumField label="垂直微調" path="offsetY" min={-800} max={800} step={1} unit="px" />
      </Section>

      <Section title="換行與縮小" persistKey="text-fx:wrap">
        <NumField
          label="每行最多"
          path="wrapChars"
          min={0}
          max={60}
          step={1}
          unit="字"
          hint={S.text.wrapCharsHint}
        />
        {!(c.wrapChars > 0) ? (
          <ToggleField label="超出畫面寬度時自動換行" path="wrapWidth" />
        ) : null}
        <p className="m-0 text-xs text-muted">{S.text.wrapNote}</p>
        <ToggleField
          label="放不下時自動縮小"
          path="autoShrink"
          hint="外框、光暈、陰影、裝飾都算進去。"
        />
        {c.autoShrink ? (
          <NumField label="最小字級" path="minSize" min={6} max={120} step={1} unit="px" />
        ) : null}
      </Section>
    </div>
  );
}
