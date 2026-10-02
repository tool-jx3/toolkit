/**
 * 淡入淡出動態圖（F095～F102）：原圖、開始與結束、顏色、時間與循環、摘要、預覽（循環播放，每輪結束停約 0.3 秒，最大 720 px）、
 * 產生（產生中不能關閉）。完成後依開啟的地方回填（場景演出、演出預設、選圖欄）或只加入素材。
 */
import { useEffect, useRef, useState } from 'react';
import { Button, ColorField, Dialog, Select, TextInput } from '@/ui';
import { updateEffect } from '../actions';
import { Hint, Labeled, Row, useNotify } from '../common';
import {
  encodeFade,
  FADE,
  type FadeEndpoint,
  fadeFileName,
  fadeFrameCount,
  fadeSize,
  initialEndpoints,
  normalizeEndpoints,
  normalizeFadeMs,
  setEndpoint,
} from '../fade';
import { importFiles } from '../importer';
import { setEffectPresetImage } from '../library';
import { formatKb, LARGE_FADE_BYTES } from '../materials';
import { applyPending } from '../ops';
import { assets, commit, type FadeState, setSession, useProject } from '../store';
import { S } from '../strings';
import { editReturn } from './Edit';

const TEMP = '__temp__';

export function FadeDialog({ initial }: { initial: FadeState }) {
  const n = useNotify();
  const materials = useProject((s) => s.data.materials);
  const [st, setSt] = useState<FadeState>(initial);
  const [secText, setSecText] = useState(String(initial.seconds));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ size: number; name: string; message: string } | null>(
    null,
  );
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [sel, setSel] = useState<string>(initial.temp ? TEMP : (initial.source ?? ''));
  const source = sel && sel !== TEMP ? materials.find((m) => m.name === sel) : undefined;
  const temp = sel === TEMP ? st.temp : null;
  const hasImage = !!source || !!temp;
  const ms = normalizeFadeMs(st.seconds);
  const frames = fadeFrameCount(ms);
  const statics = materials.filter((m) => !m.animated);

  /* 預覽用的原圖 */
  useEffect(() => {
    let alive = true;
    setImg(null);
    const url = temp?.url;
    const load = async () => {
      const u = url ?? (source ? await assets.url(source.name) : undefined);
      if (!u || !alive) return;
      const im = new Image();
      im.onload = () => alive && setImg(im);
      im.src = u;
    };
    void load();
    return () => {
      alive = false;
    };
  }, [source, temp]);

  /* 預覽：循環播放 */
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const sw = hasImage
      ? (img?.naturalWidth ?? temp?.width ?? source?.width ?? 128)
      : FADE.colorSize;
    const sh = hasImage
      ? (img?.naturalHeight ?? temp?.height ?? source?.height ?? 128)
      : FADE.colorSize;
    const k = Math.min(1, FADE.previewMaxEdge / Math.max(sw, sh));
    c.width = Math.max(1, Math.round(sw * k));
    c.height = Math.max(1, Math.round(sh * k));
    const cx = c.getContext('2d');
    if (!cx) return;
    let raf = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      const el = (now - t0) % (ms + FADE.previewPauseMs);
      const p = el >= ms ? 1 : el / ms;
      cx.clearRect(0, 0, c.width, c.height);
      const imgColor =
        (st.start === 'image' && st.end === 'color') ||
        (st.start === 'color' && st.end === 'image');
      const ia = imgColor ? 1 : st.end === 'image' ? p : st.start === 'image' ? 1 - p : 0;
      if (ia > 0 && img) {
        cx.globalAlpha = ia;
        cx.drawImage(img, 0, 0, c.width, c.height);
      }
      let ca = 0;
      if (st.end === 'color') ca = p;
      else if (st.start === 'color') ca = 1 - p;
      if (ca > 0) {
        cx.globalAlpha = ca;
        cx.fillStyle = st.color;
        cx.fillRect(0, 0, c.width, c.height);
      }
      cx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [img, st.start, st.end, st.color, ms, hasImage, temp, source]);

  const close = () => {
    if (busy) return;
    if (st.temp) URL.revokeObjectURL(st.temp.url);
    setSession({ modal: null });
    const back = editReturn.current;
    if (st.context.kind === 'edit' && back) {
      editReturn.current = null;
      setSession({ modal: { kind: 'edit', ...back } });
    }
  };
  /**
   * Esc（F285）：與關閉鈕不同，從加工開啟的也不回到加工對話框；產生中也照樣關閉
   * （產生會在背景做完並加入素材，同舊版）。
   */
  const closeByEscape = () => {
    if (st.temp) URL.revokeObjectURL(st.temp.url);
    editReturn.current = null;
    setSession({ modal: null });
  };

  /** 換原圖（F096）：換成另一張靜態圖時開始／結束自動設成「圖片 → 透明」 */
  const chooseSource = (v: string) => {
    if (v === sel) return;
    setSel(v);
    setSt({
      ...st,
      rejected: false,
      ...(v ? initialEndpoints(true) : normalizeEndpoints(st, false)),
    });
  };

  const generate = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      let src: Uint8ClampedArray | null = null;
      let size = fadeSize(null);
      if (hasImage) {
        const blob = temp?.blob ?? (source ? await assets.get(source.name) : undefined);
        if (!blob) throw new Error(S.fadeFailed('原圖'));
        const bmp = await createImageBitmap(blob);
        size = fadeSize(bmp);
        const c = document.createElement('canvas');
        c.width = size.width;
        c.height = size.height;
        const cx = c.getContext('2d', { willReadFrequently: true });
        if (!cx) throw new Error('canvas');
        cx.drawImage(bmp, 0, 0, size.width, size.height);
        bmp.close();
        src = cx.getImageData(0, 0, size.width, size.height).data;
      }
      const out = await encodeFade({
        start: st.start,
        end: st.end,
        source: src,
        ...size,
        color: st.color,
        ms,
        loop: st.loop,
      });
      const fileName = fadeFileName(
        temp ? `${temp.label}.png` : (source?.originalName ?? null),
        st,
      );
      const r = await importFiles([new File([out.bytes], fileName, { type: 'image/png' })]);
      const name = r.names[0];
      if (!name) throw new Error('import');
      let assigned = false;
      const ctx = st.context;
      if (ctx.kind === 'scene') {
        commit((d, c) => {
          const s = d.scenes.find((x) => x.id === ctx.sceneId);
          if (s?.markers.some((m) => m.id === ctx.effectId)) {
            updateEffect(d, ctx.sceneId, ctx.effectId, { imageUrl: name }, c);
            assigned = true;
          }
        });
      } else if (ctx.kind === 'preset') {
        await setEffectPresetImage(ctx.presetId, name);
        assigned = true;
      } else if (ctx.kind === 'picker') assigned = applyPending(name);
      const message =
        ctx.kind !== 'material' && ctx.kind !== 'edit' && ctx.kind !== 'room' && !assigned
          ? S.fadeLost
          : assigned
            ? S.fadeAssigned
            : '';
      setResult({ size: out.bytes.byteLength, name: fileName, message });
      n(S.fadeDone, 'success');
    } catch (e) {
      const msg = S.fadeFailed(e instanceof Error ? e.message : String(e));
      setError(msg);
      n(msg, 'warning');
    } finally {
      setBusy(false);
    }
  };

  const endpointOptions = (['transparent', 'image', 'color'] as const).map((v) => ({
    value: v,
    label: S.fadeEndpoints[v],
    disabled: v === 'image' && !hasImage,
  }));
  const usesColor = st.start === 'color' || st.end === 'color';

  return (
    <Dialog
      open
      size="lg"
      title={S.fadeTitle}
      dismissOnOutside={false}
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        closeByEscape();
      }}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      footer={
        <Button variant="primary" loading={busy} onClick={() => void generate()} disabled={busy}>
          {busy ? S.fadeBusy : S.fadeGo}
        </Button>
      }
    >
      <div
        className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_260px]"
        data-testid="fade-dialog"
      >
        <div className="flex min-w-0 flex-col items-center gap-2">
          <div className="checker flex max-h-[50dvh] max-w-full items-center justify-center overflow-hidden rounded-md">
            <canvas ref={canvas} className="max-h-[50dvh] max-w-full" data-testid="fade-preview" />
          </div>
          <Hint>{S.fadePreviewNote}</Hint>
        </div>
        <div className="flex min-w-0 flex-col gap-2 text-sm">
          <Hint>
            {S.fadeTarget}
            <b>{S.fadeTargets[st.context.kind]}</b>
          </Hint>
          <Labeled label={S.fadeSource}>
            <Select
              aria-label={S.fadeSource}
              value={sel || '__none__'}
              onValueChange={(v) => chooseSource(v === '__none__' ? '' : v)}
              options={[
                { value: '__none__', label: S.fadeNoSource },
                ...(st.temp ? [{ value: TEMP, label: S.fadeEdited }] : []),
                ...statics.map((m) => ({ value: m.name, label: m.label })),
              ]}
            />
          </Labeled>
          {st.rejected ? <Hint className="text-warning">{S.fadeRejected}</Hint> : null}
          <Row>
            <Labeled label={S.fadeStart}>
              <Select
                aria-label={S.fadeStart}
                value={st.start}
                onValueChange={(v) =>
                  setSt({ ...st, ...setEndpoint(st, 'start', v as FadeEndpoint, hasImage) })
                }
                options={endpointOptions}
              />
            </Labeled>
            <span aria-hidden>→</span>
            <Labeled label={S.fadeEnd}>
              <Select
                aria-label={S.fadeEnd}
                value={st.end}
                onValueChange={(v) =>
                  setSt({ ...st, ...setEndpoint(st, 'end', v as FadeEndpoint, hasImage) })
                }
                options={endpointOptions}
              />
            </Labeled>
          </Row>
          {usesColor ? (
            <Labeled label={S.fadeColor}>
              <ColorField value={st.color} onChange={(v) => setSt({ ...st, color: v })} />
            </Labeled>
          ) : null}
          <Row>
            <Labeled label={`${S.fadeTime}（秒）`}>
              <TextInput
                aria-label={S.fadeTime}
                type="number"
                min={0.5}
                max={4}
                step={0.5}
                value={secText}
                onChange={(e) => {
                  setSecText(e.target.value);
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) setSt({ ...st, seconds: v });
                }}
                onBlur={() => {
                  const sec = normalizeFadeMs(Number(secText)) / 1000;
                  setSecText(String(sec));
                  setSt({ ...st, seconds: sec });
                }}
                className="w-20"
              />
            </Labeled>
            <Labeled label={S.fadeLoop}>
              <Select
                aria-label={S.fadeLoop}
                value={st.loop ? 'on' : 'off'}
                onValueChange={(v) => setSt({ ...st, loop: v === 'on' })}
                options={[
                  { value: 'off', label: S.fadeLoopOff },
                  { value: 'on', label: S.fadeLoopOn },
                ]}
              />
            </Labeled>
          </Row>
          <div
            className="flex flex-col gap-0.5 rounded-md bg-surface-2 p-2 text-xs"
            data-testid="fade-summary"
          >
            <b>{S.fadeSummary((ms / 1000).toFixed(1), frames)}</b>
            <span>{S.fadeSummaryLoop(st.loop)}</span>
            <span>{S.fadeSummaryEdge}</span>
            <span>{S.fadeSummarySize}</span>
          </div>
          {result ? (
            <div
              className="flex flex-col gap-0.5 rounded-md border border-success bg-success-soft p-2 text-xs"
              data-testid="fade-result"
            >
              <b>{S.fadeResult(formatKb(result.size), result.name)}</b>
              {result.size > LARGE_FADE_BYTES ? <span>{S.fadeLarge}</span> : null}
              {result.message ? <span>{result.message}</span> : null}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="m-0 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
