/**
 * 從圖片讀種子（規格 1.12 的 F87、F88、3.16）：設定欄的「從圖片讀種子」區塊（選檔、拖放、貼上、讀目前的圖）、
 * 拖進視窗的圖片，都打開讀種子的對話框：顯示讀的圖與找到的圖形，點漏掉的圖形的中心再讀，讀出來後「用這個種子重畫」。
 * 讀在自己的 Worker 裡做（大圖要好幾秒，畫面照常）。
 */
import { ScanSearch } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import {
  Button,
  Dialog,
  DialogClose,
  Field,
  FileDrop,
  Notice,
  Section,
  Segmented,
  useToast,
  WindowDrop,
} from '@/ui';
import { createDecoder, type Decoder, exportPng } from './client';
import type { DecodeAttempt, DecodeMode, DecodeResult } from './decode';
import { applySettingsDiff } from './settings';
import { settingsNow, step, TOOL_ID, useSettings } from './store';
import { S } from './strings';

interface DecodeState {
  /** 要讀的圖（null＝對話框關著） */
  source: Blob | null;
  /** 讀目前的圖：先畫成全尺寸的 PNG */
  current: boolean;
}

const useDecodeState = create<DecodeState>(() => ({ source: null, current: false }));

/** 讀這張圖（打開對話框） */
export const openDecode = (source: Blob) => useDecodeState.setState({ source, current: false });

const openCurrent = () => useDecodeState.setState({ source: null, current: true });

const DECODE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif';

/** 設定欄的區塊 */
export function DecodeSection() {
  return (
    <Section title={S.sections.decode} persistKey={`${TOOL_ID}:decode`}>
      <p className="m-0 text-xs text-muted">{S.decodeHint}</p>
      <FileDrop
        onFiles={(files) => {
          if (files[0]) openDecode(files[0]);
        }}
        accept={DECODE_ACCEPT}
        label={S.decodeDrop}
        buttonLabel={S.decodeButton}
        hint={S.dropHint}
        icon={<ScanSearch />}
        compact
      />
      <Field label={S.decodeCurrent} hint={S.decodeCurrentHint} layout="inline">
        <Button size="sm" onClick={openCurrent} data-testid="decode-current">
          {S.decodeCurrent}
        </Button>
      </Field>
    </Section>
  );
}

/** 拖進視窗的圖片也讀種子 */
export function DecodeWindowDrop() {
  return (
    <WindowDrop
      accept="image/*"
      label={S.dropLabel}
      hint={S.dropHint}
      onDrop={(files) => {
        if (files[0]) openDecode(files[0]);
      }}
    />
  );
}

const MODE_OPTIONS = (['auto', 'v2', 'v1'] as const).map((value) => ({
  value,
  label: S.decodeModes[value],
}));

/** 結果的說明（每一行） */
function describe(result: DecodeResult): string[] {
  const lines: string[] = [];
  const fellBack = result.attempts.length > 1;
  for (const a of result.attempts) lines.push(...describeAttempt(a, result.ms));
  if (fellBack) lines.unshift(S.decodeFellBack);
  if (result.ok && result.seed !== undefined) {
    lines.push('', `✔ ${S.decodeOk}`, S.decodeSeed(result.seed));
    lines.push(S.decodeSettings(result.settings ? result.settings.split(';').length : 0));
  }
  return lines;
}

function describeAttempt(a: DecodeAttempt, ms: number): string[] {
  if (a.version === 'v2') {
    if (a.failure === 'none') return [S.decodeV2None];
    const out = [S.decodeV2Found(a.nodes.length, a.nodes.filter((n) => n.read).length)];
    if (a.failure === 'pattern') return [...out, S.decodeV2Pattern];
    out.push(S.decodeV2Bits(a.bits, a.unit ?? 0, ms));
    if (!a.packet) out.push(`✘ ${S.decodeV2Fail}`);
    return out;
  }
  const out = [
    S.decodeV1Found(a.candidates ?? 0, a.nodes.length, a.chunks ?? 0),
    S.decodeV1Ranges((a.ranges ?? []).join('、')),
    S.decodeV1Assembled(a.bits, a.packet?.bits ?? null),
  ];
  if (!a.packet) {
    const chunks = a.chunks ?? 0;
    out.push(
      `✘ ${chunks && !a.bits ? S.decodeV1NoHead : chunks ? S.decodeV1Short : S.decodeV1Fail}`,
    );
  }
  return out;
}

const TAU = Math.PI * 2;

/** 讀的圖＋找到的圖形（新方式：循線的連線、讀到的同心圓、往外的線；舊方式：基準圈、同步弧、斷片的範圍） */
function drawOverlay(canvas: HTMLCanvasElement, image: ImageBitmap, result: DecodeResult | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = image.width;
  canvas.width = W;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);
  const a = result?.attempts[result.attempts.length - 1];
  if (!a) return;
  const lw = Math.max(1.5, W / 800);
  ctx.save();
  ctx.lineWidth = lw;
  if (a.version === 'v2') {
    ctx.strokeStyle = '#ffd34f';
    for (const [x1, y1, x2, y2] of a.edges) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    for (const n of a.nodes) {
      ctx.strokeStyle = n.read ? (a.packet ? '#5be37a' : '#ffb24f') : '#888888';
      ctx.setLineDash(n.read ? [] : [4, 4]);
      ctx.beginPath();
      ctx.arc(n.cx, n.cy, n.r + lw * 3, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      if (n.lines) {
        ctx.fillStyle = '#ff4fd8';
        n.lines.forEach((v, q) => {
          if (!v || q === n.pslot) return;
          const ang = (q * TAU) / 12;
          const R = n.r + lw * 7;
          ctx.beginPath();
          ctx.arc(
            n.cx + Math.cos(ang) * R,
            n.cy + Math.sin(ang) * R,
            Math.max(2.5, W / 500),
            0,
            TAU,
          );
          ctx.fill();
        });
      }
    }
  } else {
    ctx.font = `${Math.max(11, W / 90)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const n of a.nodes) {
      ctx.strokeStyle = '#4fd1ff';
      ctx.beginPath();
      ctx.arc(n.cx, n.cy, n.f2 ?? 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = n.chunk ? '#5be37a' : '#ff6b6b';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(n.cx, n.cy, n.r + lw * 3, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      if (n.syncA != null) {
        ctx.strokeStyle = '#ff4fd8';
        ctx.beginPath();
        ctx.moveTo(n.cx, n.cy);
        ctx.lineTo(
          n.cx + Math.cos(n.syncA) * (n.r + lw * 6),
          n.cy + Math.sin(n.syncA) * (n.r + lw * 6),
        );
        ctx.stroke();
      }
      if (n.chunk) {
        ctx.fillStyle = '#5be37a';
        ctx.fillText(
          `${n.chunk.off}–${n.chunk.off + n.chunk.len - 1}`,
          n.cx,
          n.cy + n.r + lw * 6 + 12,
        );
      }
    }
  }
  ctx.restore();
}

/** 讀種子的對話框 */
export function DecodeDialog() {
  const { source, current } = useDecodeState();
  const open = !!source || current;
  const [mode, setMode] = useState<DecodeMode>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const decoder = useRef<Decoder | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const toast = useToast();
  /* 打開時用當時的讀的方式（之後換方式時另外重讀，不重新解碼圖片） */
  const modeRef = useRef(mode);
  modeRef.current = mode;

  /* 打開時讀圖（讀目前的圖：先畫成全尺寸的 PNG） */
  useEffect(() => {
    if (!open) return;
    const d = createDecoder();
    decoder.current = d;
    let alive = true;
    setBusy(true);
    setError(null);
    setResult(null);
    setImage(null);
    setCenter(null);
    (async () => {
      const blob = source ?? (await exportPng(settingsNow()));
      return d.load(blob, modeRef.current);
    })()
      .then(({ result: r, image: img }) => {
        if (!alive) return;
        setResult(r);
        setImage(img);
      })
      .catch(() => {
        if (alive) setError(S.decodeFailedLoad);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
      d.dispose();
      decoder.current = null;
    };
  }, [open, source]);

  /* 換讀的方式、點了中心：同一張圖再讀 */
  const reread = (m: DecodeMode, c: [number, number] | null) => {
    const d = decoder.current;
    if (!d || !image) return;
    setBusy(true);
    d.again(m, c)
      .then((r) => {
        if (r) setResult(r);
      })
      .catch(() => setError(S.decodeFailedLoad))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    if (canvas.current && image) drawOverlay(canvas.current, image, result);
  }, [image, result]);

  useEffect(() => {
    if (!open && image) {
      image.close();
      setImage(null);
    }
  }, [open, image]);

  const close = () => useDecodeState.setState({ source: null, current: false });

  const apply = () => {
    if (!result?.ok || result.seed === undefined) return;
    const seed = result.seed;
    const settings = result.settings;
    step(() => {
      const st = useSettings.getState();
      const next = settings ? applySettingsDiff(settings, seed) : { ...st.data, seed };
      st.replace({ ...next, seed, lockSeed: true });
    });
    toast({ title: S.decodeApplied(seed), tone: 'success' });
    close();
  };

  const lines = result ? describe(result) : [];
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={S.decodeTitle}
      description={S.decodeClickHint}
      size="lg"
      footer={
        <>
          <DialogClose>{S.close}</DialogClose>
          <Button
            variant="primary"
            onClick={apply}
            disabled={!result?.ok || busy}
            data-testid="decode-apply"
          >
            {S.decodeApply}
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-3" data-testid="decode-dialog">
        <Field label={S.decodeMode}>
          <Segmented
            fullWidth
            value={mode}
            onValueChange={(v) => {
              setMode(v);
              reread(v, center);
            }}
            options={MODE_OPTIONS}
          />
        </Field>
        <div className="flex max-h-[50vh] min-h-24 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
          {image ? (
            <canvas
              ref={canvas}
              aria-label={S.decodeImageLabel}
              className="block max-h-[50vh] max-w-full cursor-crosshair object-contain"
              data-testid="decode-canvas"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const k = e.currentTarget.width / r.width;
                const c: [number, number] = [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
                setCenter(c);
                reread(mode, c);
              }}
            />
          ) : (
            <span className="p-4 text-sm text-muted">{busy ? S.decoding : ''}</span>
          )}
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div
          role="status"
          className="m-0 whitespace-pre-wrap text-sm tabular-nums"
          data-testid="decode-output"
          data-ok={result?.ok ? 'true' : 'false'}
          data-busy={busy ? 'true' : 'false'}
        >
          {busy ? S.decoding : lines.join('\n')}
        </div>
      </div>
    </Dialog>
  );
}
