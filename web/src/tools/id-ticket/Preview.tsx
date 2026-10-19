/**
 * 預覽區（規格 F30～F37、F50～F52）：
 * - 證件：正面／背面（翻面的動畫）、掛繩（只在預覽）、可以點的字與照片與條碼；匯出卡片／印刷的 600 dpi PNG；
 * - 票券：墊紙＋票、可以點的字與照片與條碼；匯出 PNG／GIF。
 * 預覽與匯出同一套畫法（render.ts）；欄位空白時預覽上以淡色顯示欄位名稱（不會匯出）。
 */
import { type ReactNode, type RefObject, useEffect, useMemo, useRef } from 'react';
import { useAssetImage } from '@/core/assets';
import { ExportPanel, type ExportSettings, Field, Notice, Segmented, Stage, Toggle } from '@/ui';
import { shade } from './colors';
import { exportId, exportTicket, idOutputSize, ticketOutputSize } from './exporter';
import { type FocusTarget, focusTarget } from './focus';
import { useEnsureFonts, useFontTick } from './fonts';
import type { Region } from './kit';
import {
  CARD_RADIUS_U,
  cardMm,
  cardUnits,
  ID_EXPORT_MODES,
  ID_FACES,
  type IdExportMode,
  type IdFaces,
  type Side,
} from './model';
import { useOpenFrame, usePhotoLoader } from './Panel';
import {
  type AnyCanvas,
  composeTicket,
  idFontUses,
  MAT_PAD,
  PREVIEW_SCALE,
  renderIdFace,
  renderTicketLayer,
  TICKET_PREVIEW_SCALE,
  ticketFontUses,
  ticketStageSize,
} from './render';
import {
  assets,
  docNow,
  fieldDef,
  GIF_LONGS,
  PNG_SCALES,
  regenerate,
  setPrefs,
  type TicketFormat,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';
import { idTemplate, ticketTemplate } from './templates';

/** 掛繩的高度（預覽單位） */
export const STRAP_H = 110;

/** 把畫好的圖貼到頁面上的畫布 */
function blit(target: HTMLCanvasElement | null, src: AnyCanvas): void {
  if (!target) return;
  if (target.width !== src.width) target.width = src.width;
  if (target.height !== src.height) target.height = src.height;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(src, 0, 0);
}

/* ---------- 可以點的範圍 ---------- */

function regionLabel(r: Region, hasPhoto: boolean): string {
  if (r.kind === 'photo') return hasPhoto ? S.regionPhoto : S.regionPhotoEmpty;
  if (r.kind === 'qr') return S.regionQr;
  if (r.kind === 'code') return S.regionCode(fieldDef(r.key)?.label ?? r.key);
  if (r.key.startsWith('item:')) {
    const id = r.key.slice(5);
    return S.regionItem(docNow().receiptItems.find((x) => x.id === id)?.name ?? '');
  }
  if (r.key.startsWith('caption:')) {
    const key = r.key.slice(8);
    return S.regionCaption(fieldDef(key)?.label ?? S.captionNames[key] ?? key);
  }
  return S.regionField(fieldDef(r.key)?.label ?? r.key);
}

function RegionLayer({
  regions,
  ox,
  oy,
  hasPhoto,
}: {
  regions: readonly Region[];
  ox: number;
  oy: number;
  hasPhoto: boolean;
}) {
  const loader = usePhotoLoader();
  const frame = useOpenFrame();
  const pick = (r: Region) => {
    if (r.kind === 'photo') {
      if (hasPhoto) frame();
      else void loader.pick();
      return;
    }
    if (r.kind === 'code') {
      if (fieldDef(r.key)?.gen) regenerate(r.key);
      else focusTarget({ kind: 'field', key: r.key });
      return;
    }
    let t: FocusTarget;
    if (r.kind === 'qr') t = { kind: 'field', key: 'qr' };
    else if (r.key.startsWith('item:')) t = { kind: 'item', id: r.key.slice(5) };
    else if (r.key.startsWith('caption:')) t = { kind: 'caption', key: r.key.slice(8) };
    else t = { kind: 'field', key: r.key };
    focusTarget(t);
  };
  return (
    <div className="absolute inset-0" data-testid="regions">
      {regions
        .filter((r) => r.w > 1 && r.h > 1)
        .map((r, i) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: 範圍依畫的順序，同一個欄位可能出現好幾次
            key={i}
            type="button"
            aria-label={regionLabel(r, hasPhoto)}
            title={regionLabel(r, hasPhoto)}
            data-region={`${r.kind}:${r.key}`}
            className="focus-visible:focus-ring absolute cursor-pointer rounded-[3px] border-0 bg-transparent p-0 outline-offset-1 hover:outline hover:outline-1 hover:outline-dashed hover:outline-accent"
            style={{ left: ox + r.x, top: oy + r.y, width: r.w, height: r.h }}
            onClick={() => pick(r)}
          />
        ))}
    </div>
  );
}

/* ======================================================================
 * 證件
 * ==================================================================== */

/** 掛繩＋扣環（只在預覽） */
function Strap({ color, width }: { color: string; width: number }) {
  return (
    <div
      aria-hidden
      data-testid="strap"
      className="pointer-events-none absolute top-0"
      style={{ left: width / 2 - 10, width: 20, height: STRAP_H - 14 }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(90deg, rgba(0,0,0,.22), rgba(0,0,0,0) 22%, rgba(255,255,255,.1) 50%, rgba(0,0,0,0) 78%, rgba(0,0,0,.22)), repeating-linear-gradient(0deg, rgba(255,255,255,.07) 0 2px, transparent 2px 4px), ${color}`,
        }}
      />
      <div
        className="absolute"
        style={{
          left: -5,
          bottom: -16,
          width: 30,
          height: 24,
          borderRadius: '6px 6px 10px 10px',
          background: 'linear-gradient(180deg, #f1f2f4, #b4b8bf)',
          boxShadow: '0 2px 4px rgba(0,0,0,.25), inset 0 1px 0 #fff',
          zIndex: 3,
        }}
      />
      <div
        className="absolute"
        style={{
          left: 5,
          bottom: -26,
          width: 10,
          height: 13,
          border: '2.5px solid #a9adb5',
          borderTop: 0,
          borderRadius: '0 0 6px 6px',
          zIndex: 3,
        }}
      />
    </div>
  );
}

const FACE_SHADOW =
  '0 1px 1px rgba(0,0,0,.05), 0 3px 8px rgba(0,0,0,.06), 0 24px 48px -16px rgba(0,0,0,.32)';

function IdPreview() {
  const s = useDoc((st) => st.data);
  const prefs = usePrefs((p) => p.data);
  const tpl = idTemplate(s.idTemplate);
  const { w, h } = cardUnits(tpl.orientation);
  const photo = useAssetImage(assets, s.idPhoto?.image.id);
  const fonts = useMemo(() => idFontUses(s), [s]);
  useEnsureFonts(fonts);
  const tick = useFontTick();
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重畫
  const faces = useMemo(
    () => ({
      front: renderIdFace(s, 'front', PREVIEW_SCALE, 'card', {
        preview: true,
        photo: photo.bitmap,
      }),
      back: renderIdFace(s, 'back', PREVIEW_SCALE, 'card', { preview: true, photo: photo.bitmap }),
    }),
    [s, photo.bitmap, tick],
  );
  const front = useRef<HTMLCanvasElement>(null);
  const back = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    blit(front.current, faces.front.canvas);
    blit(back.current, faces.back.canvas);
  }, [faces]);
  const side = prefs.side;
  const strapH = prefs.strap ? STRAP_H : 0;
  const strapColor = shade(s.idStyles[tpl.id].color, 0.1);
  const face = (which: Side, ref: RefObject<HTMLCanvasElement | null>) => (
    <div
      className="absolute inset-0"
      data-face={which}
      aria-hidden={side !== which}
      style={{
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: which === 'back' ? 'rotateY(180deg)' : undefined,
        borderRadius: CARD_RADIUS_U,
        boxShadow: FACE_SHADOW,
      }}
    >
      <canvas
        ref={ref}
        className="block size-full"
        data-testid={`card-${which}`}
        data-template={tpl.id}
      />
      {side === which ? (
        <RegionLayer regions={faces[which].regions} ox={0} oy={0} hasPhoto={!!s.idPhoto} />
      ) : null}
    </div>
  );
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Side>
          aria-label={S.sideLabel}
          value={side}
          onValueChange={(v) => setPrefs({ side: v })}
          options={[
            { value: 'front', label: S.sides.front },
            { value: 'back', label: S.sides.back },
          ]}
        />
      </div>
      <Stage width={w} height={strapH + h} aria-label={S.previewId} className="shrink-0">
        {prefs.strap ? <Strap color={strapColor} width={w} /> : null}
        <div
          className="absolute left-0"
          style={{ top: strapH, width: w, height: h, perspective: 1800 }}
        >
          <div
            data-testid="flip"
            data-side={side}
            className="relative size-full transition-transform duration-[750ms] ease-[cubic-bezier(.3,.7,.2,1)] motion-reduce:transition-none"
            style={{
              transformStyle: 'preserve-3d',
              transform: side === 'back' ? 'rotateY(180deg)' : undefined,
            }}
          >
            {face('front', front)}
            {face('back', back)}
          </div>
        </div>
      </Stage>
      <p className="m-0 px-1 text-xs text-muted">{S.previewHint}</p>
      {photo.status === 'missing' ? <Notice tone="warning">{S.photoMissing}</Notice> : null}
      <IdExport photo={photo.bitmap} />
    </>
  );
}

function IdExport({ photo }: { photo: ImageBitmap | null }) {
  const s = useDoc((st) => st.data);
  const prefs = usePrefs((p) => p.data);
  const tpl = idTemplate(s.idTemplate);
  const out = idOutputSize(s, { mode: prefs.idMode, faces: prefs.idFaces });
  const mm = cardMm(tpl.orientation);
  const mmW = prefs.idMode === 'print' ? mm.w + 4 : mm.w;
  const mmH = prefs.idMode === 'print' ? mm.h + 4 : mm.h;
  const settings: ExportSettings = { format: 'png', fps: 20, plays: 0, scale: 1, quantize: false };
  const resetKey = useMemo(
    () => ({ s, mode: prefs.idMode, faces: prefs.idFaces, side: prefs.side }),
    [s, prefs.idMode, prefs.idFaces, prefs.side],
  );
  const formats = useMemo(
    () => [{ id: 'png', label: S.formats.png, description: S.formatDesc.idPng }],
    [],
  );
  return (
    <ExportPanel
      title={S.exportTitle}
      formats={formats}
      settings={settings}
      resetKey={resetKey}
      extra={
        <div className="flex min-w-0 flex-col gap-3">
          <Field label={S.idMode} hint={S.idModeHints[prefs.idMode]}>
            <Segmented<IdExportMode>
              value={prefs.idMode}
              onValueChange={(v) => setPrefs({ idMode: v })}
              options={ID_EXPORT_MODES.map((m) => ({ value: m, label: S.idModes[m] }))}
              fullWidth
            />
          </Field>
          <Field
            label={S.idFacesLabel}
            hint={
              <span data-testid="export-dims">
                {S.outputSize(out.width, out.height)}
                {prefs.idFaces !== 'sheet' ? S.outputMm(mmW, mmH) : ''}
              </span>
            }
          >
            <Segmented<IdFaces>
              value={prefs.idFaces}
              onValueChange={(v) => setPrefs({ idFaces: v })}
              options={ID_FACES.map((f) => ({
                value: f,
                label: S.idFaces[f],
                ariaLabel: S.idFacesAria[f],
              }))}
              fullWidth
            />
          </Field>
        </div>
      }
      onExport={(_settings, ctx) =>
        exportId(
          docNow(),
          photo,
          { mode: prefs.idMode, faces: prefs.idFaces, side: prefs.side },
          ctx,
        )
      }
    />
  );
}

/* ======================================================================
 * 票券
 * ==================================================================== */

function TicketPreview() {
  const s = useDoc((st) => st.data);
  const prefs = usePrefs((p) => p.data);
  const tpl = ticketTemplate(s.ticketTemplate);
  const photoRef = tpl.photo ? s.ticketPhotos[tpl.id] : undefined;
  const photo = useAssetImage(assets, photoRef?.image.id);
  const fonts = useMemo(() => ticketFontUses(s), [s]);
  useEnsureFonts(fonts);
  const tick = useFontTick();
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重畫
  const view = useMemo(() => {
    const layer = renderTicketLayer(s, TICKET_PREVIEW_SCALE, {
      preview: true,
      photo: photo.bitmap,
    });
    return {
      canvas: composeTicket(s, layer.canvas, TICKET_PREVIEW_SCALE, prefs.mat),
      regions: layer.regions,
    };
  }, [s, photo.bitmap, prefs.mat, tick]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => blit(ref.current, view.canvas), [view]);
  const size = ticketStageSize(s, prefs.mat);
  const off = prefs.mat ? MAT_PAD : 0;
  return (
    <>
      <Stage
        width={size.width}
        height={size.height}
        aria-label={S.previewTicket}
        className="shrink-0"
      >
        <canvas
          ref={ref}
          className="block size-full"
          data-testid="ticket-canvas"
          data-template={tpl.id}
        />
        <RegionLayer regions={view.regions} ox={off} oy={off} hasPhoto={!!photoRef} />
      </Stage>
      <p className="m-0 px-1 text-xs text-muted">{S.previewHint}</p>
      {photo.status === 'missing' ? <Notice tone="warning">{S.photoMissing}</Notice> : null}
      <TicketExport photo={photo.bitmap} />
    </>
  );
}

function TicketExport({ photo }: { photo: ImageBitmap | null }) {
  const s = useDoc((st) => st.data);
  const prefs = usePrefs((p) => p.data);
  const job = {
    format: prefs.ticketFormat,
    pngScale: prefs.pngScale,
    mat: prefs.mat,
    gifLong: prefs.gifLong,
    plays: prefs.plays,
  };
  const out = ticketOutputSize(s, job);
  const settings: ExportSettings = {
    format: prefs.ticketFormat,
    fps: 20,
    plays: prefs.plays,
    scale: 1,
    quantize: false,
  };
  const resetKey = useMemo(
    () => ({
      s,
      f: prefs.ticketFormat,
      k: prefs.pngScale,
      m: prefs.mat,
      g: prefs.gifLong,
      p: prefs.plays,
    }),
    [s, prefs.ticketFormat, prefs.pngScale, prefs.mat, prefs.gifLong, prefs.plays],
  );
  const formats = useMemo(
    () =>
      (['png', 'gif'] as const).map((id) => ({
        id,
        label: S.formats[id],
        description: S.formatDesc[id],
        supportsLoop: id === 'gif',
      })),
    [],
  );
  let extra: ReactNode;
  if (prefs.ticketFormat === 'png')
    extra = (
      <div className="flex min-w-0 flex-col gap-3">
        <Field
          label={S.pngScale}
          hint={<span data-testid="export-dims">{S.outputSize(out.width, out.height)}</span>}
        >
          <Segmented<string>
            value={String(prefs.pngScale)}
            onValueChange={(v) => setPrefs({ pngScale: Number(v) })}
            options={PNG_SCALES.map((n) => ({ value: String(n), label: S.pngScales(n) }))}
            fullWidth
          />
        </Field>
        <Field label={S.mat} hint={S.matHint} layout="inline">
          <Toggle checked={prefs.mat} onCheckedChange={(on) => setPrefs({ mat: on })} />
        </Field>
      </div>
    );
  else
    extra = (
      <Field
        label={S.gifLong}
        hint={
          <span data-testid="export-dims">{`${S.gifHint}${S.outputSize(out.width, out.height)}`}</span>
        }
      >
        <Segmented<string>
          value={String(prefs.gifLong)}
          onValueChange={(v) => setPrefs({ gifLong: Number(v) })}
          options={GIF_LONGS.map((n) => ({ value: String(n), label: S.gifLongOption(n) }))}
          fullWidth
        />
      </Field>
    );
  return (
    <ExportPanel
      title={S.exportTitle}
      formats={formats}
      settings={settings}
      onSettingsChange={(next) =>
        setPrefs({ ticketFormat: next.format as TicketFormat, plays: Math.max(0, next.plays) })
      }
      loopHint={S.loopHint}
      resetKey={resetKey}
      extra={extra}
      onExport={(set, ctx) =>
        exportTicket(
          docNow(),
          photo,
          { ...job, format: set.format as TicketFormat, plays: set.plays },
          ctx,
        )
      }
    />
  );
}

export function Preview() {
  const kind = useDoc((s) => s.data.kind);
  return kind === 'id' ? <IdPreview /> : <TicketPreview />;
}
