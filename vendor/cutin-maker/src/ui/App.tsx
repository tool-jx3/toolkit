import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureFont, getFont } from '../core/fonts';
import { renderFrames, renderStill } from '../core/frames';
import { textOf } from '../core/render';
import { decodeState, encodeState } from '../core/serialize';
import {
  adaptForTarget, applyTargetDefaults, DEFAULT_TARGET_ID, getTarget, lighten, validate,
  type TargetDrivenField,
} from '../core/targets';
import {
  applyDeco, applyEffect, applyMotion, applyTheme, buildParams, DEFAULT_PARAMS, RECIPES, type Recipe,
} from '../core/templates';
import type { BackgroundSpec, OutputFormat, RenderParams } from '../core/types';
import { t as tr, useLocale } from '../i18n';
import { encodeFrames } from '../worker/encoder';
import { ExportPanel } from './Controls/ExportPanel';
import { LookPanel } from './Controls/LookPanel';
import { MotionPanel } from './Controls/MotionPanel';
import { TextPanel } from './Controls/TextPanel';
import { AboutDialog, Footer } from './AboutDialog';
import { GalleryScreen } from './GalleryScreen';
import { AdvancedProvider, Button, Segmented, useAdvanced } from './kit';
import { Preview } from './Preview';
import { ResultDialog, type ExportResult } from './ResultDialog';
import { TARGETS } from '../core/targets';

type Tab = 'look' | 'motion' | 'export';
/* label は i18n key。描画のたびに t() を引くので言語切替に追従する。 */
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'look', label: 'tab.look' },
  { id: 'motion', label: 'tab.motion' },
  { id: 'export', label: 'tab.export' },
];

/** 3形式とも常に押せるようにしておく。選び直しに行かせない */
const EXPORT_FORMATS: OutputFormat[] = ['apng', 'gif', 'png'];

type Axes = { decoId: string; themeId: string; effectId: string };
const DEFAULT_AXES: Axes = { decoId: 'outline-gold', themeId: 'rainbow-gold', effectId: 'radiate' };

export function App() {
  useLocale(); // 言語が変わったら全体を描き直す
  const [screen, setScreen] = useState<'gallery' | 'edit'>('gallery');
  const [params, setParams] = useState<RenderParams>(DEFAULT_PARAMS);
  const [axes, setAxes] = useState<Axes>(DEFAULT_AXES);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [customized, setCustomized] = useState(false);
  const [targetId, setTargetId] = useState(DEFAULT_TARGET_ID);
  const [tab, setTab] = useState<Tab>('look');
  const [advanced, setAdvanced] = useState<boolean>(false);
  const [storedAdvanced, setStoredAdvanced] = useAdvanced();
  const [fontEpoch, setFontEpoch] = useState(0);
  const [progress, setProgress] = useState<{ phase: string; done: number; total: number } | null>(null);
  const [runningFormat, setRunningFormat] = useState<OutputFormat | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const touched = useRef(new Set<TargetDrivenField>());

  const target = getTarget(targetId);
  useEffect(() => setAdvanced(storedAdvanced), [storedAdvanced]);

  // 共有URLからの復元。開いた瞬間にその絵が出るようギャラリーは飛ばす
  useEffect(() => {
    const state = decodeState(location.hash);
    if (state) {
      setParams(state.params);
      setAxes(state.axes);
      setTargetId(state.targetId);
      setScreen('edit');
      setCustomized(true);
      // 共有された値は「ユーザーが決めた値」として扱い、ターゲット既定で上書きしない
      touched.current = new Set<TargetDrivenField>(['canvas', 'frameCount', 'fps', 'format', 'matte']);
    }
  }, []);

  // 描画前に必ずフォントを待つ（省くと豆腐になる）
  useEffect(() => {
    let cancelled = false;
    ensureFont(getFont(params.text.fontId), textOf(params)).then(() => {
      if (!cancelled) setFontEpoch((e) => e + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [params.text.fontId, params.text.lines.join('\n')]);

  const adapted = useMemo(() => adaptForTarget(params, target), [params, target]);
  const issues = useMemo(() => validate(params, target, result?.bytes), [params, target, result]);
  const recipe = recipeId ? RECIPES.find((r) => r.id === recipeId) ?? null : null;

  const patch = useCallback((p: Partial<RenderParams>) => setParams((cur) => ({ ...cur, ...p })), []);
  /** テンプレそのものを触る操作。ヘッダに「カスタム」を出すために印を付ける */
  const patchCustom = useCallback((p: Partial<RenderParams>) => {
    setCustomized(true);
    setParams((cur) => ({ ...cur, ...p }));
  }, []);

  const setTarget = (id: string) => {
    const t = getTarget(id);
    setTargetId(id);
    setParams((cur) => applyTargetDefaults(cur, t, touched.current));
  };

  const pickRecipe = (r: Recipe) => {
    setAxes({ decoId: r.decoId, themeId: r.themeId, effectId: r.effectId });
    setRecipeId(r.id);
    setCustomized(false);
    setParams((cur) => applyTargetDefaults(buildParams({ ...r }, cur), target, touched.current));
    setScreen('edit');
  };

  /** テキストは残したまま、選んだテンプレの見た目に戻す */
  const resetToRecipe = () => {
    if (!recipe) return;
    setAxes({ decoId: recipe.decoId, themeId: recipe.themeId, effectId: recipe.effectId });
    setCustomized(false);
    setParams((cur) => buildParams({ ...recipe, text: cur.text.lines.join('\n') }, cur));
  };

  const setDeco = (decoId: string) => {
    setAxes((a) => ({ ...a, decoId }));
    setCustomized(true);
    setParams((cur) => applyDeco(cur, decoId, axes.themeId));
  };

  const setTheme = (themeId: string) => {
    setAxes((a) => ({ ...a, themeId }));
    setCustomized(true);
    setParams((cur) => applyTheme(cur, themeId, axes.decoId));
  };

  const setEffect = (effectId: string) => {
    setAxes((a) => ({ ...a, effectId }));
    setCustomized(true);
    setParams((cur) => applyEffect(cur, effectId));
  };

  const exportNow = async (override?: RenderParams) => {
    const base = override ?? params;
    const p = adaptForTarget(base, target);
    setError(null);
    setNotice(null);
    setRunningFormat(p.output.format);
    try {
      await ensureFont(getFont(p.text.fontId), textOf(p));
      setProgress({ phase: 'app.phase.render', done: 0, total: p.frameCount });
      // 描画は同期ループなので、進捗を1回描かせてから走らせる
      await new Promise((r) => setTimeout(r, 0));
      const frames =
        p.output.format === 'png'
          ? [renderStill(p)]
          : renderFrames(p, (done, total) => setProgress({ phase: 'app.phase.render', done, total }));
      setProgress({ phase: 'app.phase.encode', done: 0, total: frames.length });
      const res = await encodeFrames(p, frames, (done, total) => setProgress({ phase: 'app.phase.encode', done, total }));
      const ext = res.format === 'gif' ? 'gif' : 'png';
      const name = `${p.text.lines.join('_') || 'cutin'}_${p.canvas.w}x${p.canvas.h}.${ext}`;
      setResult((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { url: URL.createObjectURL(res.blob), bytes: res.bytes, format: res.format, filename: name };
      });
      setResultOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      setRunningFormat(null);
    }
  };

  /** 形式を選び直さずにその場で書き出す。選択状態も揃えて「形式」タブと食い違わないようにする */
  const exportAs = (format: OutputFormat) => {
    touched.current.add('format');
    const next = { ...params, output: { ...params.output, format } };
    setParams(next);
    return exportNow(next);
  };

  const autoLighten = async () => {
    const step = lighten(params, target);
    if (!step) {
      setNotice(tr('app.noMoreLighten'));
      return;
    }
    setParams(step.params);
    setNotice(step.applied);
    await exportNow(step.params);
  };

  const share = async () => {
    const hash = encodeState({ params, targetId, axes });
    location.hash = hash;
    try {
      await navigator.clipboard.writeText(location.href);
      setNotice(tr('app.shareCopied'));
    } catch {
      setNotice(tr('app.shareNoCopy'));
    }
  };

  if (screen === 'gallery') {
    return (
      <>
        <GalleryScreen target={target} onTarget={setTarget} onPick={pickRecipe} />
        <Footer onAbout={() => setAboutOpen(true)} />
        <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      </>
    );
  }

  const busy = progress !== null;
  const templateName = recipe ? `${recipe.label}${customized ? tr('app.customSuffix') : ''}` : tr('app.custom');

  return (
    <AdvancedProvider value={advanced}>
      <div className="mx-auto max-w-[1400px] p-3 sm:p-4">
        <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="ghost" onClick={() => setScreen('gallery')}>{tr('app.backToGallery')}</Button>
          <span className="text-sm font-semibold text-neutral-200">{templateName}</span>
          {recipe && customized && (
            <button type="button" onClick={resetToRecipe} className="text-xs text-sky-300 underline">
              {tr('app.resetToTemplate')}
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Segmented value={targetId} onChange={setTarget} items={TARGETS.map((tg) => ({ id: tg.id, label: tg.label }))} />
            <Button variant="ghost" onClick={share}>{tr('app.share')}</Button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="self-start rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            <Preview params={adapted} epoch={fontEpoch} />

            <div className="mt-4">
              <TextPanel params={params} maxChars={target.maxChars} onText={(text) => patch({ text: { ...params.text, lines: text.split('\n') } })} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {EXPORT_FORMATS.map((f) => (
                <Button key={f} variant="primary" onClick={() => exportAs(f)} disabled={busy}>
                  {/* runningFormat は progress より先に立つ。両方揃うまでは通常表示のまま */}
                  {runningFormat === f && progress
                    ? `${tr(progress.phase)} ${progress.done}/${progress.total}`
                    : tr('app.exportAs', f.toUpperCase())}
                </Button>
              ))}
              {result && !busy && (
                <Button variant="ghost" onClick={() => setResultOpen(true)}>
                  {tr('app.openLast')}
                </Button>
              )}
            </div>

            {(issues.length > 0 || error || notice) && (
              <ul className="mt-3 space-y-1 text-xs">
                {error && <li className="text-red-400">{tr('app.error', error)}</li>}
                {notice && <li className="text-sky-300">{notice}</li>}
                {issues.map((it, i) => (
                  <li key={i} className={it.level === 'error' ? 'text-red-400' : it.level === 'warn' ? 'text-amber-400' : 'text-neutral-400'}>
                    {it.level === 'error' ? '× ' : it.level === 'warn' ? '△ ' : 'ⓘ '}
                    {it.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="mb-4 flex gap-1">
              {TABS.map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setTab(tb.id)}
                  className={`flex-1 rounded-md px-2 py-2 text-sm transition ${
                    tab === tb.id ? 'bg-sky-400/15 text-sky-200' : 'text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  {tr(tb.label)}
                </button>
              ))}
            </div>

            {tab === 'look' && (
              <LookPanel
                params={params}
                axes={axes}
                onFont={(fontId) => patchCustom({ text: { ...params.text, fontId } })}
                onDeco={setDeco}
                onTheme={setTheme}
                onBackground={(background: BackgroundSpec) => patchCustom({ background })}
                onPatchText={(p) => patchCustom({ text: { ...params.text, ...p } })}
              />
            )}
            {tab === 'motion' && (
              <MotionPanel
                params={params}
                axes={axes}
                onEffect={setEffect}
                onLayerParam={(i, key, value) => {
                  setCustomized(true);
                  setParams((cur) => ({
                    ...cur,
                    layers: cur.layers.map((l, li) => (li === i ? { ...l, params: { ...l.params, [key]: value } } : l)),
                  }));
                }}
                onMotionType={(t) => {
                  setCustomized(true);
                  setParams((cur) => applyMotion(cur, t));
                }}
                onMotionAmount={(amount) => patchCustom({ motion: { ...params.motion, amount } })}
                onSeed={(seed) => patchCustom({ seed })}
              />
            )}
            {tab === 'export' && (
              <ExportPanel
                params={params}
                target={target}
                onSize={(w, h) => {
                  touched.current.add('canvas');
                  patch({ canvas: { w, h } });
                }}
                onFrames={(frameCount) => {
                  touched.current.add('frameCount');
                  patch({ frameCount });
                }}
                onFps={(fps) => {
                  touched.current.add('fps');
                  patch({ fps });
                }}
                onContentScale={(contentScale) => patch({ contentScale })}
                onFormat={(format: OutputFormat) => {
                  touched.current.add('format');
                  patch({ output: { ...params.output, format } });
                }}
                onOutput={(p) => {
                  if ('matte' in p) touched.current.add('matte');
                  patch({ output: { ...params.output, ...p } });
                }}
              />
            )}

            <label className="mt-6 flex items-center gap-2 border-t border-neutral-800 pt-4 text-xs text-neutral-400">
              <input type="checkbox" checked={advanced} onChange={(e) => setStoredAdvanced(e.target.checked)} />
              {tr('app.advanced')}
            </label>
          </div>
        </div>

        <Footer onAbout={() => setAboutOpen(true)} />
        <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

        <ResultDialog
          result={resultOpen ? result : null}
          target={target}
          triggerWord={params.text.lines[0] ?? ''}
          onClose={() => setResultOpen(false)}
          onLighten={autoLighten}
        />
      </div>
    </AdvancedProvider>
  );
}
