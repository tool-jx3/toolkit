/**
 * 預覽區（規格 F30～F37、F50～F52）：
 * - 證件：正面／背面（翻面的動畫）、掛繩（只在預覽）、可以點的字與照片與條碼；匯出卡片／印刷的 600 dpi PNG；
 * - 票券：墊紙＋票、可以點的字與照片與條碼；匯出 PNG／GIF。
 * 預覽與匯出同一套畫法（render.ts）；欄位空白時預覽上以淡色顯示欄位名稱（不會匯出）。
 */
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAssetImage } from '@/core/assets';
import { makeCanvas } from '@/core/image';
import { ExportPanel, type ExportSettings, Field, Notice, Segmented, Stage, Toggle } from '@/ui';
import { shade } from './colors';
import { exportId, exportTicket, idOutputSize, ticketOutputSize } from './exporter';
import { type FocusTarget, focusTarget } from './focus';
import { requestFonts, useFontTick } from './fonts';
import { fontUses, type Region } from './kit';
import { ID_STRAP_MM, idSlot, lanyardHole, lanyardStrap } from './lanyard';
import {
  CARD_RADIUS_U,
  cardMm,
  cardUnits,
  ID_EXPORT_MODES,
  ID_FACES,
  type IdExportMode,
  type IdFaces,
  type IdTicketState,
  type Side,
} from './model';
import { useOpenFrame, usePhotoLoader } from './Panel';
import {
  type AnyCanvas,
  composeTicket,
  MAT_PAD,
  PREVIEW_SCALE,
  renderIdFace,
  renderIdStrap,
  renderTicketLayer,
  TICKET_PREVIEW_SCALE,
  ticketStageSize,
} from './render';
import { SfPreview } from './SfPreview';
import { afterPaint } from './schedule';
import { licenseDef } from './sf/licenses';
import {
  assets,
  canGenerate,
  docNow,
  fieldDef,
  GIF_LONGS,
  PNG_SCALES,
  regenerate,
  setPrefs,
  setSfStyle,
  type TicketFormat,
  toggleLicense,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';
import { idTemplate, ticketTemplate } from './templates';

/** 掛繩的高度（預覽單位） */
export const STRAP_H = 110;

/** 看不到的那一面（證件的背面等）：內容停下多久之後再畫 */
export const HIDDEN_FACE_MS = 300;

/** 範圍的指紋（位置取整數）：沒變時不更新 React 的狀態 */
const regionsKey = (rs: readonly Region[]): string =>
  rs
    .map(
      (r) =>
        `${r.kind}:${r.key}:${Math.round(r.x)}:${Math.round(r.y)}:${Math.round(r.w)}:${Math.round(r.h)}`,
    )
    .join('|');

/** 畫好的範圍（內容沒變時不觸發重畫） */
function useRegions<K extends string>(init: Record<K, Region[]>) {
  const [regions, setRegions] = useState(init);
  const keys = useRef<Partial<Record<K, string>>>({});
  const set = useCallback((which: K, rs: Region[]) => {
    const k = regionsKey(rs);
    if (keys.current[which] === k) return;
    keys.current[which] = k;
    setRegions((prev) => ({ ...prev, [which]: rs }));
  }, []);
  return [regions, set] as const;
}

/* ---------- 可以點的範圍 ---------- */

function regionLabel(r: Region, hasPhoto: boolean): string {
  if (r.kind === 'photo') return hasPhoto ? S.regionPhoto : S.regionPhotoEmpty;
  if (r.kind === 'license') return S.regionLicense(licenseDef(r.key)?.label ?? r.key);
  if (r.kind === 'dna') return S.regionDna;
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

export function RegionLayer({
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
      const f = fieldDef(r.key);
      if (f && canGenerate(f)) regenerate(r.key);
      else focusTarget({ kind: 'field', key: r.key });
      return;
    }
    if (r.kind === 'license') {
      toggleLicense(r.key);
      return;
    }
    if (r.kind === 'dna') {
      setSfStyle({ dnaText: !docNow().sf.style.dnaText });
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

/** 掛繩＋扣環（「只在預覽」；u＝放大倍數，SF 證件依孔的寬度放大） */
export function Strap({
  color,
  width,
  u = 1,
  top = 0,
}: {
  color: string;
  width: number;
  u?: number;
  top?: number;
}) {
  return (
    <div
      aria-hidden
      data-testid="strap"
      className="pointer-events-none absolute top-0 origin-top"
      style={{
        left: width / 2 - 10 * u,
        top,
        width: 20,
        height: STRAP_H - 14,
        transform: u === 1 ? undefined : `scale(${u})`,
        transformOrigin: 'left top',
        zIndex: u === 1 ? undefined : 2,
      }}
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

/** 「掛繩孔＋掛繩」：畫進匯出的那一條（畫布；卡片翻面時不動） */
function StrapLayer({ s, width }: { s: IdTicketState; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tpl = idTemplate(s.idTemplate);
  const color = s.idStyles[tpl.id].color;
  const slot = idSlot(tpl.orientation);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只跟著範本與主題色重畫
  useLayoutEffect(() => {
    if (ref.current) renderIdStrap(s, PREVIEW_SCALE, ref.current);
  }, [tpl.id, color]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      data-testid="strap-canvas"
      className="pointer-events-none absolute top-0 left-0 block"
      style={{ width, height: STRAP_H + slot.y + slot.h, zIndex: 2 }}
    />
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
  const tick = useFontTick();
  const side = prefs.side;
  const front = useRef<HTMLCanvasElement>(null);
  const back = useRef<HTMLCanvasElement>(null);
  const [regions, setRegions] = useRegions<Side>({ front: [], back: [] });
  /*
   * 重畫（規格 F02）：直接畫在頁面上的畫布。看得到的那一面在畫面更新之後畫（打字時輸入框先出字）、
   * 看不到的那一面停下 HIDDEN_FACE_MS 之後畫；開頁、翻面、換範本時要顯示的那一面還沒畫好就馬上畫。
   * 用到的字型在畫的時候順便要求（fonts.ts）。
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重畫
  const version = useMemo(
    () => ({ s, bitmap: photo.bitmap, lanyard: prefs.lanyard }),
    [s, photo.bitmap, tick, prefs.lanyard],
  );
  const drawn = useRef<Record<Side, object | null>>({ front: null, back: null });
  const paint = useCallback(
    (which: Side) => {
      const canvas = (which === 'front' ? front : back).current;
      if (!canvas || drawn.current[which] === version) return;
      drawn.current[which] = version;
      const fonts = new Map<string, Set<string>>();
      const r = renderIdFace(
        version.s,
        which,
        PREVIEW_SCALE,
        'card',
        { preview: true, photo: version.bitmap, fonts },
        undefined,
        canvas,
        lanyardHole(version.lanyard) ? { hole: true, strap: false } : undefined,
      );
      requestFonts(fontUses(fonts));
      setRegions(which, r.regions);
    },
    [version, setRegions],
  );
  const latest = useRef(paint);
  latest.current = paint;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 翻面、換範本時馬上畫要顯示的那一面（畫法在 latest 裡）
  useLayoutEffect(() => {
    latest.current(side);
  }, [side, tpl.id]);
  useEffect(() => afterPaint(() => paint(side)), [paint, side]);
  useEffect(() => {
    const t = setTimeout(() => paint(side === 'front' ? 'back' : 'front'), HIDDEN_FACE_MS);
    return () => clearTimeout(t);
  }, [paint, side]);
  const lanyard = prefs.lanyard;
  const strapH = lanyard === 'preview' || lanyard === 'strap' ? STRAP_H : 0;
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
        <RegionLayer regions={regions[which]} ox={0} oy={0} hasPhoto={!!s.idPhoto} />
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
        {lanyard === 'preview' ? <Strap color={strapColor} width={w} /> : null}
        {lanyard === 'strap' ? <StrapLayer s={s} width={w} /> : null}
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
  const out = idOutputSize(s, { mode: prefs.idMode, faces: prefs.idFaces, lanyard: prefs.lanyard });
  const strapMm = lanyardStrap(prefs.lanyard) && prefs.idMode === 'card' ? ID_STRAP_MM : 0;
  const mm = cardMm(tpl.orientation);
  const mmW = prefs.idMode === 'print' ? mm.w + 4 : mm.w;
  const mmH = (prefs.idMode === 'print' ? mm.h + 4 : mm.h) + strapMm;
  const settings: ExportSettings = { format: 'png', fps: 20, plays: 0, scale: 1, quantize: false };
  const resetKey = useMemo(
    () => ({ s, mode: prefs.idMode, faces: prefs.idFaces, side: prefs.side, l: prefs.lanyard }),
    [s, prefs.idMode, prefs.idFaces, prefs.side, prefs.lanyard],
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
          { mode: prefs.idMode, faces: prefs.idFaces, side: prefs.side, lanyard: prefs.lanyard },
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
  const tick = useFontTick();
  const ref = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<AnyCanvas | null>(null);
  const [regions, setRegions] = useRegions<'ticket'>({ ticket: [] });
  /* 重畫：同證件（畫面更新之後畫；換範本、墊紙時馬上畫） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重畫
  const version = useMemo(
    () => ({ s, bitmap: photo.bitmap, mat: prefs.mat }),
    [s, photo.bitmap, prefs.mat, tick],
  );
  const drawn = useRef<object | null>(null);
  const paint = useCallback(() => {
    const canvas = ref.current;
    if (!canvas || drawn.current === version) return;
    drawn.current = version;
    layerRef.current ??= makeCanvas(1, 1);
    const fonts = new Map<string, Set<string>>();
    const layer = renderTicketLayer(
      version.s,
      TICKET_PREVIEW_SCALE,
      { preview: true, photo: version.bitmap, fonts },
      layerRef.current,
    );
    composeTicket(version.s, layer.canvas, TICKET_PREVIEW_SCALE, version.mat, canvas);
    requestFonts(fontUses(fonts));
    setRegions('ticket', layer.regions);
  }, [version, setRegions]);
  const latest = useRef(paint);
  latest.current = paint;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 換範本、墊紙時馬上畫（畫法在 latest 裡）
  useLayoutEffect(() => {
    latest.current();
  }, [tpl.id, prefs.mat]);
  useEffect(() => afterPaint(paint), [paint]);
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
        <RegionLayer regions={regions.ticket} ox={off} oy={off} hasPhoto={!!photoRef} />
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
  if (kind === 'sf') return <SfPreview />;
  return kind === 'id' ? <IdPreview /> : <TicketPreview />;
}
