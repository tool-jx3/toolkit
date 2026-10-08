/**
 * 設定欄：搜尋設定、全部收合／展開，以及各區塊（自動、表情預設、參數、錨點、攝影機與麥克風、匯出、儲存與設定、背景、圖層、
 * 模型資訊與診斷、使用方式）。
 */
import { Search } from 'lucide-react';
import { type ReactNode, useContext, useEffect, useMemo } from 'react';
import { historyGesture } from '@/core/storage';
import { recordingFormats } from '@/core/video';
import {
  Button,
  Field,
  Kbd,
  type ModelCache,
  ModelDownloadPanel,
  Section,
  Segmented,
  Select,
  Slider,
  TextInput,
  Toggle,
  UsageSection,
  withShortcut,
} from '@/ui';
import {
  calibrate,
  canRecord,
  clearCalibration,
  exportSettingsJson,
  pickSettingsJson,
  resetAnchors,
  resetParam,
  resetParams,
  restoreSaved,
  saveCleanPsd,
  savePng,
  saveSettings,
  setAuto,
  setCamera,
  setMicrophone,
  setParam,
  toggleAnchorMode,
  togglePreset,
  toggleRecording,
} from './actions';
import { DiagnosticsPanel } from './Diagnostics';
import { faceModelSpec } from './faceModel';
import { LayersPanel } from './LayersPanel';
import { BackgroundPicker } from './Preview';
import {
  AUTO_KEYS,
  EXPORT_BACKGROUNDS,
  type ExportBackground,
  PARAM_DEFS,
  type ParamKey,
  type ParamSection,
  PREF_RANGES,
  PRESET_IDS,
  type PrefNumberKey,
  REC_FPS,
  REC_SECONDS,
} from './params';
import { hit, SearchCtx } from './search';
import { setPrefs, useAuto, useEdit, usePrefs, useSession } from './store';
import { S, SECTION_IDS, type SectionId } from './strings';
import { Usage } from './Usage';
import { useDirty } from './useDirty';

const g = historyGesture(useEdit);

/* ---------- 搜尋（規格 F86） ---------- */

/** 搜尋中不符合的項目不顯示 */
function Item({ text, children }: { text: string | string[]; children: ReactNode }) {
  const { q, all } = useContext(SearchCtx);
  if (!q || all || hit(q, ...(Array.isArray(text) ? text : [text]))) return <>{children}</>;
  return null;
}

const paramKeysOf = (section: ParamSection) =>
  PARAM_DEFS.filter((d) => d.section === section).map((d) => d.key);

const PARAM_SECTIONS = ['head', 'eyes', 'brow', 'mouth', 'bangs', 'body'] as const;

/** 每個區塊裡可以搜尋的文字 */
function sectionTexts(id: SectionId): string[] {
  const model = useSession.getState().model;
  switch (id) {
    case 'auto':
      return [...AUTO_KEYS.map((k) => S.auto[k]), S.cam, S.mic];
    case 'preset':
      return PRESET_IDS.map((p) => S.presets[p]);
    case 'head':
    case 'eyes':
    case 'brow':
    case 'mouth':
    case 'bangs':
    case 'body':
      return paramKeysOf(id).map((k) => S.params[k]);
    case 'anchors':
      return [S.anchorEdit, S.anchorReset];
    case 'tracking':
      return [
        S.calibrate,
        S.calibrateClear,
        S.linkEyes,
        S.trackBrow,
        S.trackSmile,
        S.camPreview,
        ...Object.values(S.gains),
        S.micMeter,
      ];
    case 'export':
      return [S.exportBg, S.recSeconds, S.recFps, S.recFormat, S.savePng, S.recordStart];
    case 'save':
      return [
        S.saveSettings,
        S.restoreSettings,
        S.exportJson,
        S.importJson,
        S.resetParams,
        S.savePsd,
      ];
    case 'background':
      return Object.values(S.backgrounds);
    case 'layers':
      return (model?.layers ?? []).flatMap((l) => [l.source, l.name, S.roles[l.bn] ?? '']);
    case 'info':
      return [];
  }
}

export function sectionVisible(id: SectionId, q: string): boolean {
  return !q || hit(q, S.sections[id]) || hit(q, ...sectionTexts(id));
}

function RigSection({
  id,
  children,
  description,
}: {
  id: SectionId;
  children: ReactNode;
  description?: ReactNode;
}) {
  const q = useSession((s) => s.search.trim().toLowerCase());
  const collapsed = usePrefs((s) => s.data.collapsed.includes(id));
  useSession((s) => s.model);
  if (!sectionVisible(id, q)) return null;
  const all = !q || hit(q, S.sections[id]);
  return (
    <Section
      title={S.sections[id]}
      open={q ? true : !collapsed}
      onOpenChange={(open) => setCollapsed(id, !open)}
      description={all ? description : undefined}
    >
      <div className="flex flex-col gap-3" data-section={id}>
        <SearchCtx.Provider value={{ q, all }}>{children}</SearchCtx.Provider>
      </div>
    </Section>
  );
}

function setCollapsed(id: SectionId, collapsed: boolean) {
  const cur = usePrefs.getState().data.collapsed;
  const next = collapsed ? [...new Set([...cur, id])] : cur.filter((c) => c !== id);
  setPrefs({ collapsed: next });
}

/** 展開某個區塊（模型下載的提示用） */
export function revealSection(id: SectionId): void {
  setCollapsed(id, false);
  requestAnimationFrame(() =>
    document.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: 'nearest' }),
  );
}

function SearchBar() {
  const search = useSession((s) => s.search);
  const collapsed = usePrefs((s) => s.data.collapsed);
  const allCollapsed = SECTION_IDS.every((id) => collapsed.includes(id));
  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-2 left-2 size-4 text-muted"
        />
        <TextInput
          type="search"
          aria-label={S.searchLabel}
          placeholder={S.searchPlaceholder}
          value={search}
          autoComplete="off"
          className="pl-8"
          onChange={(e) => useSession.setState({ search: e.target.value })}
        />
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setPrefs({ collapsed: allCollapsed ? [] : [...SECTION_IDS] })}
      >
        {allCollapsed ? S.expandAll : S.collapseAll}
      </Button>
    </div>
  );
}

/* ---------- 自動 ---------- */

function AutoSection() {
  const auto = useAuto();
  const cam = useSession((s) => s.cam);
  const mic = useSession((s) => s.mic);
  return (
    <RigSection id="auto">
      {AUTO_KEYS.map((k) => (
        <Item key={k} text={S.auto[k]}>
          <Field label={S.auto[k]} layout="inline" hint={S.autoHints[k]}>
            <Toggle checked={auto[k]} onCheckedChange={(v) => setAuto(k, v)} />
          </Field>
        </Item>
      ))}
      <Item text={S.cam}>
        <Field
          label={S.cam}
          layout="inline"
          hint={cam === 'loading' ? S.camLoading : cam === 'on' ? S.camOn : undefined}
        >
          <Toggle checked={auto.cam} onCheckedChange={(v) => void setCamera(v)} />
        </Field>
      </Item>
      <Item text={S.mic}>
        <Field
          label={S.mic}
          layout="inline"
          hint={mic === 'loading' ? S.micLoading : mic === 'on' ? S.micOn : undefined}
        >
          <Toggle checked={auto.mic} onCheckedChange={(v) => void setMicrophone(v)} />
        </Field>
      </Item>
    </RigSection>
  );
}

/* ---------- 表情預設 ---------- */

function PresetSection() {
  const preset = useEdit((s) => s.data.preset);
  const hasModel = useSession((s) => !!s.model);
  return (
    <RigSection id="preset" description={S.presetHint}>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_IDS.map((p, i) => (
          <Item key={p} text={S.presets[p]}>
            <Button
              size="sm"
              variant={preset === p ? 'primary' : 'secondary'}
              aria-pressed={preset === p}
              disabled={!hasModel}
              onClick={() => togglePreset(p)}
              data-preset={p}
            >
              {S.presets[p]}
              <Kbd className="ml-1">{i + 1}</Kbd>
            </Button>
          </Item>
        ))}
      </div>
    </RigSection>
  );
}

/* ---------- 參數 ---------- */

function ParamSlider({ k, section }: { k: ParamKey; section: ParamSection }) {
  const v = useEdit((s) => s.data.params[k]);
  const def = PARAM_DEFS.find((d) => d.key === k) as (typeof PARAM_DEFS)[number];
  return (
    <Item text={S.params[k]}>
      <Field label={S.params[k]}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: 在滑桿上按兩下還原（數值欄也可以直接輸入） */}
        <div
          title={S.resetHint}
          data-param={k}
          data-section-label={S.paramSections[section]}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('input')) return;
            resetParam(k);
          }}
        >
          <Slider
            value={v}
            onChange={g.live((x: number) => setParam(k, x))}
            onCommit={g.commit}
            min={def.min}
            max={def.max}
            step={0.01}
            precision={2}
          />
        </div>
      </Field>
    </Item>
  );
}

function ParamSectionBlock({ section }: { section: ParamSection }) {
  return (
    <RigSection id={section} description={S.resetHint}>
      {paramKeysOf(section).map((k) => (
        <ParamSlider key={k} k={k} section={section} />
      ))}
    </RigSection>
  );
}

/* ---------- 錨點 ---------- */

function AnchorSection() {
  const anchorMode = useSession((s) => s.anchorMode);
  const hasModel = useSession((s) => !!s.model);
  const n = useEdit((s) => Object.keys(s.data.anchors).length);
  return (
    <RigSection id="anchors" description={S.anchorsHint}>
      <div className="flex flex-wrap gap-1.5">
        <Item text={S.anchorEdit}>
          <Button
            size="sm"
            variant={anchorMode ? 'primary' : 'secondary'}
            aria-pressed={anchorMode}
            disabled={!hasModel}
            onClick={toggleAnchorMode}
          >
            {S.anchorEdit}
            <Kbd className="ml-1">E</Kbd>
          </Button>
        </Item>
        <Item text={S.anchorReset}>
          <Button size="sm" variant="secondary" disabled={!hasModel} onClick={resetAnchors}>
            {S.anchorReset}
          </Button>
        </Item>
      </div>
      {hasModel ? (
        <p className="m-0 text-xs text-muted" data-testid="anchor-summary">
          {n ? S.anchorManual(n) : S.anchorAuto}
        </p>
      ) : null}
    </RigSection>
  );
}

/* ---------- 攝影機與麥克風 ---------- */

function PrefSlider({ k, step = 0.01 }: { k: PrefNumberKey; step?: number }) {
  const v = usePrefs((s) => s.data[k]);
  const [min, max, def] = PREF_RANGES[k];
  return (
    <Item text={S.gains[k]}>
      <Field label={S.gains[k]}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: 在滑桿上按兩下還原 */}
        <div
          title={S.resetHint}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('input')) return;
            setPrefs({ [k]: def });
          }}
        >
          <Slider
            value={v}
            onChange={(x) => setPrefs({ [k]: x })}
            min={min}
            max={max}
            step={step}
            precision={2}
          />
        </div>
      </Field>
    </Item>
  );
}

function PrefToggle({
  k,
  label,
}: {
  k: 'linkEyes' | 'trackBrow' | 'trackSmile' | 'camPreview';
  label: string;
}) {
  const v = usePrefs((s) => s.data[k]);
  return (
    <Item text={label}>
      <Field label={label} layout="inline">
        <Toggle checked={v} onCheckedChange={(x) => setPrefs({ [k]: x })} />
      </Field>
    </Item>
  );
}

function MicMeter() {
  const raw = useSession((s) => s.micRaw);
  const gate = usePrefs((s) => s.data.micGate);
  return (
    <Item text={S.micMeter}>
      <div className="flex flex-col gap-1">
        <meter
          className="sr-only"
          min={0}
          max={1}
          value={raw}
          aria-label={S.micMeter}
          data-testid="mic-meter"
        />
        <div
          aria-hidden
          className="relative h-2 overflow-hidden rounded-full bg-surface-3"
          title={S.micMeter}
        >
          <span
            className="absolute inset-y-0 left-0 bg-accent"
            style={{ width: `${Math.round(raw * 100)}%` }}
          />
          <span
            className="absolute inset-y-0 w-0.5 bg-warning"
            style={{ left: `${Math.round(gate * 100)}%` }}
          />
        </div>
      </div>
    </Item>
  );
}

function TrackingSection({ model }: { model: ModelCache }) {
  const cam = useSession((s) => s.cam);
  const calibrating = useSession((s) => s.calibrating);
  const needModel = useSession((s) => s.needFaceModel);
  const calibrated = usePrefs((s) => !!s.data.calibration);
  const ready = model.state.status === 'ready';
  /* 按攝影機追蹤時模型還沒下載：下載好就接著開 */
  useEffect(() => {
    if (ready && needModel) {
      useSession.setState({ needFaceModel: false });
      void setCamera(true);
    }
  }, [ready, needModel]);
  return (
    <RigSection id="tracking" description={S.trackHint}>
      <ModelDownloadPanel
        spec={faceModelSpec()}
        {...model}
        intro={<span>{S.modelIntro}</span>}
        deleteDisabled={cam !== 'off'}
        className={needModel ? 'ring-2 ring-warning' : undefined}
      />
      <div className="flex flex-wrap gap-1.5">
        <Item text={S.calibrate}>
          <Button
            size="sm"
            variant="secondary"
            disabled={cam !== 'on' || calibrating}
            title={S.calibrateHint}
            onClick={calibrate}
          >
            {S.calibrate}
          </Button>
        </Item>
        <Item text={S.calibrateClear}>
          <Button size="sm" variant="secondary" disabled={!calibrated} onClick={clearCalibration}>
            {S.calibrateClear}
          </Button>
        </Item>
      </div>
      <p className="m-0 text-xs text-muted" data-testid="calibration-status">
        {calibrated ? S.calDone : S.calNone}
      </p>
      <PrefToggle k="linkEyes" label={S.linkEyes} />
      <PrefToggle k="trackBrow" label={S.trackBrow} />
      <PrefToggle k="trackSmile" label={S.trackSmile} />
      <PrefToggle k="camPreview" label={S.camPreview} />
      <PrefSlider k="headGain" />
      <PrefSlider k="eyeGain" />
      <PrefSlider k="mouthGain" />
      <PrefSlider k="browGain" />
      <PrefSlider k="gazeGain" />
      <PrefSlider k="smoothing" />
      <PrefSlider k="micGain" />
      <PrefSlider k="micGate" />
      <MicMeter />
    </RigSection>
  );
}

/* ---------- 匯出 ---------- */

function ExportSection() {
  const prefs = usePrefs((s) => s.data);
  const hasModel = useSession((s) => !!s.model);
  const recording = useSession((s) => !!s.recording);
  const formats = useMemo(() => recordingFormats(), []);
  const recordable = canRecord();
  const format = formats.find((f) => f.mimeType === prefs.recFormat) ?? formats[0];
  return (
    <RigSection id="export">
      <Item text={S.exportBg}>
        <Field label={S.exportBg}>
          <Segmented<ExportBackground>
            value={prefs.exportBg}
            onValueChange={(v) => setPrefs({ exportBg: v })}
            options={EXPORT_BACKGROUNDS.map((b) => ({ value: b, label: S.exportBgs[b] }))}
          />
        </Field>
      </Item>
      <Item text={S.recSeconds}>
        <Field label={S.recSeconds}>
          <Select<string>
            value={String(prefs.recSeconds)}
            onValueChange={(v) => setPrefs({ recSeconds: Number(v) })}
            options={REC_SECONDS.map((s) => ({ value: String(s), label: S.recSecondsValue(s) }))}
          />
        </Field>
      </Item>
      <Item text={S.recFps}>
        <Field label={S.recFps}>
          <Segmented<string>
            value={String(prefs.recFps)}
            onValueChange={(v) => setPrefs({ recFps: Number(v) })}
            options={REC_FPS.map((f) => ({ value: String(f), label: `${f} fps` }))}
          />
        </Field>
      </Item>
      <Item text={S.recFormat}>
        <Field label={S.recFormat}>
          <Select<string>
            value={format?.mimeType ?? ''}
            disabled={!formats.length}
            onValueChange={(v) => setPrefs({ recFormat: v })}
            options={
              formats.length
                ? formats.map((f) => ({ value: f.mimeType, label: f.label }))
                : [{ value: '', label: S.recFormatNone }]
            }
          />
        </Field>
      </Item>
      <div className="flex flex-wrap gap-1.5">
        <Item text={S.savePng}>
          <Button size="sm" variant="secondary" disabled={!hasModel} onClick={() => void savePng()}>
            {S.savePng}
          </Button>
        </Item>
        <Item text={S.recordStart}>
          <Button
            size="sm"
            variant={recording ? 'danger' : 'secondary'}
            disabled={!hasModel || !recordable}
            onClick={toggleRecording}
          >
            {recording ? S.recordStop : S.recordStart}
          </Button>
        </Item>
      </div>
      <p className="m-0 text-xs text-muted">{recordable ? S.exportHint : S.recUnsupported}</p>
    </RigSection>
  );
}

/* ---------- 儲存與設定 ---------- */

function SaveSection() {
  const hasModel = useSession((s) => !!s.model);
  const dirty = useDirty();
  return (
    <RigSection id="save" description={S.saveHint}>
      <div className="flex flex-wrap gap-1.5">
        <Item text={S.saveSettings}>
          <Button
            size="sm"
            variant={dirty ? 'primary' : 'secondary'}
            disabled={!hasModel}
            title={withShortcut(dirty ? S.saveTitleDirty : S.saveTitle, 'mod+s')}
            onClick={saveSettings}
            data-testid="save-settings"
            data-dirty={dirty || undefined}
          >
            {dirty ? S.saveSettingsDirty : S.saveSettings}
          </Button>
        </Item>
        <Item text={S.restoreSettings}>
          <Button size="sm" variant="secondary" disabled={!hasModel} onClick={() => restoreSaved()}>
            {S.restoreSettings}
          </Button>
        </Item>
        <Item text={S.exportJson}>
          <Button size="sm" variant="secondary" disabled={!hasModel} onClick={exportSettingsJson}>
            {S.exportJson}
          </Button>
        </Item>
        <Item text={S.importJson}>
          <Button
            size="sm"
            variant="secondary"
            disabled={!hasModel}
            onClick={() => void pickSettingsJson()}
          >
            {S.importJson}
          </Button>
        </Item>
        <Item text={S.resetParams}>
          <Button size="sm" variant="secondary" onClick={resetParams}>
            {S.resetParams}
          </Button>
        </Item>
        <Item text={S.savePsd}>
          <Button
            size="sm"
            variant="secondary"
            disabled={!hasModel}
            onClick={() => void saveCleanPsd()}
          >
            {S.savePsd}
          </Button>
        </Item>
      </div>
    </RigSection>
  );
}

/* ---------- 其他區塊 ---------- */

function BackgroundSection() {
  return (
    <RigSection id="background">
      <BackgroundPicker size="md" />
    </RigSection>
  );
}

function LayersSection() {
  return (
    <RigSection id="layers" description={S.layersHint}>
      <LayersPanel />
    </RigSection>
  );
}

function InfoSection() {
  return (
    <RigSection id="info">
      <DiagnosticsPanel />
    </RigSection>
  );
}

function NoMatch() {
  const q = useSession((s) => s.search.trim().toLowerCase());
  useSession((s) => s.model);
  if (!q || SECTION_IDS.some((id) => sectionVisible(id, q))) return null;
  return <p className="m-0 text-sm text-muted">{S.searchEmpty}</p>;
}

export function SettingsPanel({ faceModel }: { faceModel: ModelCache }) {
  return (
    <>
      <SearchBar />
      <NoMatch />
      <AutoSection />
      <PresetSection />
      {PARAM_SECTIONS.map((s) => (
        <ParamSectionBlock key={s} section={s} />
      ))}
      <AnchorSection />
      <TrackingSection model={faceModel} />
      <ExportSection />
      <SaveSection />
      <BackgroundSection />
      <LayersSection />
      <InfoSection />
      <UsageSection persistKey="anime-rig">
        <Usage />
      </UsageSection>
    </>
  );
}
