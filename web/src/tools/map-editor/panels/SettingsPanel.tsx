/**
 * 地圖設定（1.14）：網格（顯示、顏色、粗細、線型）、吸附、自動儲存，以及這張地圖的資訊。
 */
import { Checkbox, ColorField, Field, NumberInput, Section, Segmented, Toggle } from '@/ui';
import { dashArray, gridStyleOfDash } from '../geometry';
import { CELL_SIZE } from '../model';
import { setMapPrefs, useAutoSave, useEditor, useMapPrefs, usePrefs } from '../stores';
import { S } from '../strings';

export function SettingsPanel() {
  const mp = useMapPrefs();
  const pr = usePrefs((s) => s.data);
  const autoSave = useAutoSave((s) => s.enabled);
  const setAutoSave = useAutoSave((s) => s.set);
  const gridType = useEditor((s) => s.gridType);
  const style = gridStyleOfDash(mp.gridDashArray);
  const patch = usePrefs.getState().patch;
  return (
    <div className="flex flex-col gap-3" data-testid="settings-panel">
      <Section title={S.settings.grid} persistKey="map-editor:set-grid">
        <div className="flex flex-col gap-3">
          <Field label={S.settings.gridVisible} layout="inline">
            <Toggle
              checked={mp.gridVisible}
              onCheckedChange={(gridVisible) => setMapPrefs({ gridVisible })}
            />
          </Field>
          <Field label={S.settings.gridColor}>
            <ColorField
              value={mp.gridColor}
              onChange={(gridColor) => setMapPrefs({ gridColor })}
              alpha
            />
          </Field>
          <Field label={S.settings.gridWidth}>
            <NumberInput
              value={mp.gridLineWidth}
              onChange={(w) =>
                setMapPrefs({
                  gridLineWidth: w,
                  gridDashArray: style === 'solid' ? null : dashArray(style, w),
                })
              }
              min={1}
              max={10}
              unit="px"
            />
          </Field>
          <Field label={S.settings.gridStyle}>
            <Segmented
              value={style}
              onValueChange={(s) =>
                setMapPrefs({
                  gridDashArray: s === 'solid' ? null : dashArray(s, mp.gridLineWidth),
                })
              }
              options={(['solid', 'dashed', 'dotted'] as const).map((v) => ({
                value: v,
                label: S.settings.gridStyles[v],
              }))}
              fullWidth
              size="sm"
            />
          </Field>
        </div>
      </Section>
      <Section title={S.settings.snap} persistKey="map-editor:set-snap">
        <div className="flex flex-col gap-2">
          <Field label={S.settings.snapEnabled} layout="inline" hint={S.settings.snapShift}>
            <Toggle
              checked={pr.snapEnabled}
              onCheckedChange={(snapEnabled) => patch({ snapEnabled })}
            />
          </Field>
          <Checkbox
            checked={pr.snapIntersection}
            onCheckedChange={(snapIntersection) => patch({ snapIntersection })}
            label={S.settings.snapIntersection}
            disabled={!pr.snapEnabled}
          />
          <Checkbox
            checked={pr.snapCenter}
            onCheckedChange={(snapCenter) => patch({ snapCenter })}
            label={S.settings.snapCenter}
            disabled={!pr.snapEnabled}
          />
          <Checkbox
            checked={pr.snapMidpoint}
            onCheckedChange={(snapMidpoint) => patch({ snapMidpoint })}
            label={S.settings.snapMidpoint}
            disabled={!pr.snapEnabled}
          />
        </div>
      </Section>
      <Section title={S.settings.save} persistKey="map-editor:set-save">
        <Field label={S.settings.autoSave} layout="inline" hint={S.settings.autoSaveHint}>
          <Toggle checked={autoSave} onCheckedChange={setAutoSave} />
        </Field>
      </Section>
      <Section title={S.settings.info} persistKey="map-editor:set-info" defaultOpen={false}>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">{S.settings.gridType}</dt>
          <dd className="m-0">{S.gridTypes[gridType]}</dd>
          <dt className="text-muted">{S.settings.cellSize}</dt>
          <dd className="m-0">{CELL_SIZE} px</dd>
        </dl>
      </Section>
    </div>
  );
}
