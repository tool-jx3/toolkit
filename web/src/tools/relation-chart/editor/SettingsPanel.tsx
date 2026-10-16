/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 分頁設定（原作的整體設定／顯示設定，每張分頁各自記）：畫布、角色、關係線、圖例與名冊、聚焦、間距與磁鐵。
 */
import { Download, FileType, ImageOff, ImagePlus, ListChecks, Ruler, Upload } from 'lucide-react';
import { pickFiles } from '@/core/files';
import {
  Button,
  Field,
  Section,
  Segmented,
  Select,
  Slider,
  Toggle,
  useConfirm,
  useToast,
} from '@/ui';
import { PALETTES } from '../engine/geom';
import { LEGEND_POSITIONS, SETTINGS_DEFAULTS } from '../model/normalize';
import type { FontValue, LegendPos, SheetSettings } from '../model/types';
import { editSheet, setSpacing, updateSettings } from '../state/actions';
import { backgroundFromBlob } from '../state/images';
import { gesture, setPrefs, setUi, updateProject, usePrefs, useProject } from '../state/store';
import { S } from '../strings';
import { fontOptions, importFonts } from './FontUi';
import { downloadFrameTemplate, FrameSelect, uploadFrames } from './FrameUi';
import { useSheet } from './hooks';
import { kickSim } from './sim';
import { AutoNumber, ColorPair } from './widgets';

const T = S.settings;

const set =
  <K extends keyof SheetSettings>(key: K) =>
  (v: SheetSettings[K]) =>
    updateSettings((s) => {
      (s as SheetSettings)[key] = v;
    });

const liveSet = <K extends keyof SheetSettings>(key: K) =>
  gesture.live((v: SheetSettings[K]) =>
    updateSettings((s) => {
      (s as SheetSettings)[key] = v;
    }),
  );

export async function importBackground(notify: (m: string, warn?: boolean) => void): Promise<void> {
  const [f] = await pickFiles({ accept: 'image/*' });
  if (!f) return;
  try {
    const r = await backgroundFromBlob(f, f.name);
    editSheet((s) => {
      s.bg = r.id;
    });
    if (!r.persisted) notify(S.msg.imageNotSaved, true);
  } catch {
    notify(S.msg.bgFail, true);
  }
}

export function SettingsPanel() {
  const sheet = useSheet();
  const bgLocked = !!sheet.tl?.locked.includes('bg');
  const s = sheet.settings;
  const font = useProject((p) => p.data.font);
  const fonts = useProject((p) => p.data.fonts);
  const frameCount = useProject((p) => p.data.frames.length);
  const nameFromFile = usePrefs((p) => p.data.nameFromFile);
  const toast = useToast();
  const confirm = useConfirm();
  const ask = (m: string) => confirm({ title: S.msg.bigFile, description: m });
  const pal = PALETTES[s.palette];
  const legendOptions = LEGEND_POSITIONS.map((v) => ({ value: v, label: S.legendPos[v] }));
  const notify = (m: string, warn?: boolean) =>
    toast({ title: m, tone: warn ? 'warning' : 'success' });
  return (
    <div className="flex flex-col gap-2" data-testid="settings-panel">
      <Section title={T.secCanvas} persistKey="relation-chart:set-canvas">
        <div className="flex flex-col gap-3">
          <Field label={T.palette}>
            <Segmented
              size="sm"
              value={s.palette}
              onValueChange={set('palette')}
              options={[
                { value: 'dark', label: T.dark },
                { value: 'light', label: T.light },
              ]}
            />
          </Field>
          <Field label={T.font} hint={T.fontHint}>
            <Select
              size="sm"
              value={font}
              onValueChange={(v) =>
                updateProject((p) => {
                  p.font = v as FontValue;
                })
              }
              options={fontOptions(fonts)}
              aria-label={T.font}
              data-testid="doc-font"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon={<FileType />}
              onClick={() => void importFonts(notify, ask)}
              data-testid="font-import"
            >
              {S.font.import}
            </Button>
            {fonts.length ? (
              <Button
                size="sm"
                icon={<ListChecks />}
                onClick={() => setUi({ dialog: 'fonts' })}
                data-testid="font-manage"
              >
                {S.font.manage}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted">{S.font.license}</p>
          <Field label={T.guides}>
            <Segmented
              size="sm"
              value={s.bgMode}
              onValueChange={set('bgMode')}
              options={[
                { value: 'none', label: T.guideNone },
                { value: 'grid', label: T.guideGrid },
                { value: 'axis', label: T.guideAxis },
              ]}
            />
          </Field>
          <Field label={T.gridStep} hint={T.gridStepHint}>
            <Slider
              min={10}
              max={200}
              step={5}
              value={s.gridStep}
              unit="px"
              onChange={liveSet('gridStep')}
              onCommit={gesture.commit}
              aria-label={T.gridStep}
            />
          </Field>
          <Toggle checked={s.gridSnap} onCheckedChange={set('gridSnap')} label={T.gridSnap} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted" data-testid="canvas-size">
              {T.size(sheet.W, sheet.H)}
            </span>
            <Button size="sm" icon={<Ruler />} onClick={() => setUi({ dialog: 'canvas' })}>
              {S.more.canvasSize}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{T.bgImage}</span>
            <Button
              size="sm"
              icon={<ImagePlus />}
              disabled={bgLocked}
              title={bgLocked ? S.tl.lockBg : undefined}
              onClick={() => void importBackground(notify)}
            >
              {S.more.bgImport}
            </Button>
            <Button
              size="sm"
              icon={<ImageOff />}
              disabled={!sheet.bg || bgLocked}
              onClick={() =>
                editSheet((d) => {
                  d.bg = null;
                })
              }
            >
              {S.more.bgRemove}
            </Button>
          </div>
        </div>
      </Section>

      <Section title={S.frame.sec} persistKey="relation-chart:set-frames" defaultOpen={false}>
        <div className="flex flex-col gap-3" data-testid="frame-settings">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon={<Upload />}
              onClick={() => void uploadFrames(notify, ask)}
              data-testid="frame-upload"
            >
              {S.frame.upload}
            </Button>
            {frameCount ? (
              <Button
                size="sm"
                icon={<ListChecks />}
                onClick={() => setUi({ dialog: 'frames' })}
                data-testid="frame-manage"
              >
                {S.frame.manage}
              </Button>
            ) : null}
            <Button size="sm" icon={<Download />} onClick={() => void downloadFrameTemplate()}>
              {S.frame.template}
            </Button>
          </div>
          <p className="text-xs text-muted">{S.frame.note}</p>
          {frameCount ? (
            <Field label={S.frame.defLabel} hint={S.frame.defHint}>
              <FrameSelect
                kind="sheet"
                value={s.defFrame}
                onChange={(v) => set('defFrame')(v ?? '')}
                testId="def-frame"
              />
            </Field>
          ) : null}
        </div>
      </Section>

      <Section title={T.secChars} persistKey="relation-chart:set-chars">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Toggle checked={s.showNames} onCheckedChange={set('showNames')} label={T.showNames} />
            <Toggle
              checked={!s.noCollision}
              onCheckedChange={(v) => set('noCollision')(!v)}
              label={T.collision}
            />
          </div>
          <Field label={T.defShape} hint={T.defHint}>
            <Segmented
              size="sm"
              value={s.shapeSquare ? 'square' : 'circle'}
              onValueChange={(v) => set('shapeSquare')(v === 'square')}
              options={[
                { value: 'circle', label: S.char.shapeCircle },
                { value: 'square', label: S.char.shapeSquare },
              ]}
            />
          </Field>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Toggle
              checked={!s.defNoBorder}
              onCheckedChange={(v) => set('defNoBorder')(!v)}
              label={T.defBorder}
            />
            <Toggle
              checked={!s.defNoBg}
              onCheckedChange={(v) => set('defNoBg')(!v)}
              label={T.defBg}
            />
          </div>
          <ColorPair
            a={s.colAvatarBg}
            b={s.colAvatarRing}
            labels={[T.avatarFill, T.avatarRing]}
            autoA={pal.panel}
            autoB={pal.auto}
            onA={(v) =>
              updateSettings((d) => {
                d.colAvatarBg = v;
                d.colNameText = v;
              })
            }
            onB={(v) =>
              updateSettings((d) => {
                d.colAvatarRing = v;
                d.colNameStroke = v;
              })
            }
            onSwap={() =>
              updateSettings((d) => {
                const a = d.colAvatarBg;
                d.colAvatarBg = d.colAvatarRing;
                d.colNameText = d.colAvatarRing;
                d.colAvatarRing = a;
                d.colNameStroke = a;
              })
            }
          />
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['defCharSize', T.avatarSize, 32, 2000],
                ['defBorderW', T.borderW, 1, 100],
                ['defNameSize', T.nameSize, 1, 400],
              ] as const
            ).map(([key, label, min, max]) => (
              <div key={key} className="flex flex-col gap-1 text-xs text-muted">
                {label}
                <AutoNumber
                  value={s[key]}
                  min={min}
                  max={max}
                  aria-label={label}
                  onChange={(v) => set(key)(v ?? 0)}
                />
              </div>
            ))}
          </div>
          <Toggle
            checked={nameFromFile}
            onCheckedChange={(v) => setPrefs({ nameFromFile: v })}
            label={T.nameFromFile}
          />
        </div>
      </Section>

      <Section title={T.secRels} persistKey="relation-chart:set-rels">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <div data-testid="set-rel-name">
              <Toggle
                checked={s.showRelName}
                onCheckedChange={set('showRelName')}
                label={T.showRelName}
              />
            </div>
            <Toggle
              checked={s.showRelNote}
              onCheckedChange={set('showRelNote')}
              label={T.showRelNote}
            />
            <Toggle
              checked={s.edgeStraight}
              onCheckedChange={set('edgeStraight')}
              label={T.straight}
            />
            <Toggle checked={s.bridgeMode} onCheckedChange={set('bridgeMode')} label={T.bridge} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['defRelNameSize', T.relNameSize, 1, 200],
                ['defNoteSize', T.noteSize, 1, 200],
                ['defLineW', T.lineW, 1, 60],
              ] as const
            ).map(([key, label, min, max]) => (
              <div key={key} className="flex flex-col gap-1 text-xs text-muted">
                {label}
                <AutoNumber
                  value={s[key]}
                  min={min}
                  max={max}
                  aria-label={label}
                  onChange={(v) => set(key)(v ?? 0)}
                />
              </div>
            ))}
          </div>
          <ColorPair
            a={s.colRelLine}
            b={s.colRelOutline}
            labels={[T.relLine, T.relOutline]}
            autoA={pal.panel}
            autoB={pal.auto}
            onA={set('colRelLine')}
            onB={set('colRelOutline')}
            onSwap={() =>
              updateSettings((d) => {
                const a = d.colRelLine;
                d.colRelLine = d.colRelOutline;
                d.colRelOutline = a;
              })
            }
          />
          <Field label={T.relOpacity} hint={T.relOpacityHint}>
            <Slider
              min={25}
              max={100}
              step={5}
              unit="%"
              value={Math.round(s.relOpacity * 100)}
              onChange={gesture.live((v: number) =>
                updateSettings((d) => {
                  d.relOpacity = v / 100;
                }),
              )}
              onCommit={gesture.commit}
              aria-label={T.relOpacity}
            />
          </Field>
          <Field label={T.edgeGap}>
            <Slider
              min={0}
              max={200}
              step={1}
              unit="px"
              value={s.edgeGapPx}
              onChange={liveSet('edgeGapPx')}
              onCommit={gesture.commit}
              aria-label={T.edgeGap}
            />
          </Field>
        </div>
      </Section>

      <Section title={T.secLegend} persistKey="relation-chart:set-legend">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Toggle
              checked={s.showLegend}
              onCheckedChange={set('showLegend')}
              label={T.showLegend}
            />
            <Select
              size="sm"
              value={s.legendPos}
              onValueChange={(v) => set('legendPos')(v as LegendPos)}
              options={legendOptions}
              aria-label={T.legendPos}
              className="ml-auto w-32"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Toggle
              checked={s.showCharLegend}
              onCheckedChange={set('showCharLegend')}
              label={T.showCharLegend}
            />
            <Select
              size="sm"
              value={s.charLegendPos}
              onValueChange={(v) => set('charLegendPos')(v as LegendPos)}
              options={legendOptions}
              aria-label={T.charLegendPos}
              className="ml-auto w-32"
            />
          </div>
          <p className="text-xs text-muted">{T.charLegendHint}</p>
        </div>
      </Section>

      <Section title={T.secFocus} persistKey="relation-chart:set-focus">
        <Field label={T.focusDim} hint={T.focusDimHint}>
          <Slider
            min={0}
            max={60}
            step={1}
            unit="%"
            value={Math.round(s.focusDim * 100)}
            valueText={(v) => (v >= 60 ? T.focusDimOff : `${v}%`)}
            onChange={gesture.live((v: number) =>
              updateSettings((d) => {
                d.focusDim = v / 100;
              }),
            )}
            onCommit={gesture.commit}
            aria-label={T.focusDim}
          />
        </Field>
      </Section>

      <Section title={T.secSpacing} persistKey="relation-chart:set-spacing">
        <div className="flex flex-col gap-3">
          <Field label={T.spacing} hint={T.spacingHint}>
            <Slider
              min={40}
              max={300}
              step={5}
              unit="%"
              inputMin={10}
              inputMax={1000}
              value={s.spacingPct}
              onChange={gesture.live((v: number) => setSpacing(v))}
              onCommit={gesture.commit}
              aria-label={T.spacing}
            />
          </Field>
          {(
            [
              ['magCenter', T.magCenter, 0, 1, 0.05],
              ['magRepel', T.magRepel, 0, 20, 0.5],
              ['magLink', T.magLink, 0, 1, 0.05],
              ['magDist', T.magDist, 30, 500, 5],
            ] as const
          ).map(([key, label, min, max, step]) => (
            <Field key={key} label={label}>
              <Slider
                min={min}
                max={max}
                step={step}
                precision={step < 1 ? 2 : step < 1.5 ? 1 : 0}
                value={s[key]}
                onChange={gesture.live((v: number) => {
                  updateSettings((d) => {
                    d[key] = v;
                  });
                  kickSim(0.5);
                })}
                onCommit={gesture.commit}
                aria-label={label}
              />
            </Field>
          ))}
          <Button
            size="sm"
            className="self-start"
            onClick={() =>
              updateSettings((d) => {
                d.magCenter = SETTINGS_DEFAULTS.magCenter;
                d.magRepel = SETTINGS_DEFAULTS.magRepel;
                d.magLink = SETTINGS_DEFAULTS.magLink;
                d.magDist = SETTINGS_DEFAULTS.magDist;
              })
            }
          >
            {T.magReset}
          </Button>
          {!s.snapMode ? <p className="text-xs text-muted">{T.magOff}</p> : null}
        </div>
      </Section>
    </div>
  );
}
