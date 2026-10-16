/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 頭像框（F058）的介面：選框的下拉（角色、批次、標籤、分頁預設）、上傳（原作的 frameFile：內容去重、
 * 大檔確認、動態圖說明）、管理（改名、大小、使用數、刪除）、下載範本（程式現畫，比例跟著 FRAME_SCALE）。
 */
import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { downloadBlob, pickFiles } from '@/core/files';
import { canvasToBlob, makeCanvas } from '@/core/image';
import { Dialog, IconButton, Select, TextInput, useConfirm } from '@/ui';
import { FRAME_SCALE, frameRefSource, frameSource, type SheetCtx, sheetCtx } from '../engine/geom';
import type { Char, FrameItem, Project } from '../model/types';
import { useImageUrls } from '../state/images';
import { addFrames, deleteFrame, renameFrame } from '../state/libActions';
import { assets, projectNow, setUi, useProject, useUi } from '../state/store';
import { S } from '../strings';

const T = S.frame;
const FOLLOW = '__follow';
const NONE = '__none';

/** 框庫的物件網址 */
export function useFrameUrls(): Map<string, string> {
  const frames = useProject((s) => s.data.frames);
  const ids = useMemo(() => frames.map((f) => f.id), [frames]);
  return useImageUrls(ids);
}

function FrameOption({ f, url }: { f: FrameItem; url?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-surface-3">
        {url ? <img src={url} alt="" className="size-6 object-contain" /> : null}
      </span>
      <span className="truncate">{f.name}</span>
    </span>
  );
}

/** 「跟隨標籤」那一項的字樣：照實際的來源寫（原作只找「哪個標籤的框是這張」，會說錯來源） */
export function followText(ctx: SheetCtx, c: Pick<Char, 'labels'>, frames: readonly FrameItem[]) {
  const src = frameRefSource(ctx, { frame: null, labels: c.labels });
  if (src?.from === 'label' && src.label) return T.followOf(src.label.text);
  if (src?.from === 'sheet') return T.sheetOf(frames.find((f) => f.id === src.id)?.name ?? '');
  return T.followNone;
}

/**
 * 選框：kind＝char（跟隨／不使用／每張）、label 與 sheet（不使用／每張）。
 * value：null＝跟隨、''＝不使用、id＝那張；undefined＝混合（批次）。
 */
export function FrameSelect({
  kind,
  value,
  onChange,
  followLabel,
  testId,
}: {
  kind: 'char' | 'label' | 'sheet';
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  followLabel?: string;
  testId?: string;
}) {
  const frames = useProject((s) => s.data.frames);
  const urls = useFrameUrls();
  const label = kind === 'label' ? T.lblLabel : kind === 'sheet' ? T.defLabel : T.label;
  const cur =
    value === undefined
      ? ''
      : value === null
        ? FOLLOW
        : value === ''
          ? NONE
          : frames.some((f) => f.id === value)
            ? value
            : NONE;
  const options = [
    ...(kind === 'char' ? [{ value: FOLLOW, label: followLabel ?? T.follow }] : []),
    { value: NONE, label: T.none },
    ...frames.map((f) => ({ value: f.id, label: <FrameOption f={f} url={urls.get(f.id)} /> })),
  ];
  return (
    <Select
      size="sm"
      value={cur}
      placeholder={S.batch.mixed}
      onValueChange={(v) => onChange(v === FOLLOW ? null : v === NONE ? '' : v)}
      options={options}
      aria-label={label}
      data-testid={testId}
    />
  );
}

/* ---------- 上傳 ---------- */

/** 真的會動的才算（GIF 有 ≥ 2 個圖形控制區塊、PNG 有 acTL；原作的 frameIsAnimated） */
export function frameIsAnimated(b: Uint8Array): boolean {
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    let n = 0;
    for (let i = 0; i < b.length - 1 && n < 2; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9) n++;
    return n >= 2;
  }
  if (b[0] === 0x89 && b[1] === 0x50) {
    for (let i = 8; i < b.length - 8; ) {
      const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
      const tag = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      if (tag === 'acTL') return true;
      if (tag === 'IDAT' || tag === 'IEND') return false;
      i += 12 + len;
    }
  }
  return false;
}

const MB = 1024 * 1024;
const mb = (n: number) => (n / MB).toFixed(1);

async function frameBytes(frames: readonly FrameItem[]): Promise<number> {
  let n = 0;
  for (const f of frames) n += (await assets.get(f.id).catch(() => undefined))?.size ?? 0;
  return n;
}

/**
 * 上傳頭像框：只收圖片；同一張圖只存一份；單張 > 1 MB 或整庫 > 10 MB 逐張確認；動態圖整批說明一次。
 * 不縮圖、不壓縮（原作刻意如此：框可能畫得很精細）。
 */
export async function uploadFrames(
  notify: (m: string, warn?: boolean) => void,
  ask: (m: string) => Promise<boolean>,
): Promise<void> {
  const files = await pickFiles({ accept: 'image/*', multiple: true });
  if (!files.length) return;
  let total = await frameBytes(projectNow().frames);
  const have = new Set(projectNow().frames.map((f) => f.id));
  const items: FrameItem[] = [];
  let dup = 0;
  let anim = '';
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (!anim && frameIsAnimated(bytes)) anim = f.name;
    let id: string;
    try {
      const r = await assets.add(new Blob([bytes], { type: f.type }));
      id = r.id;
    } catch {
      continue;
    }
    if (have.has(id)) {
      dup++;
      continue;
    }
    if ((f.size > MB || total + f.size > 10 * MB) && !(await ask(T.bigWarn(f.name, mb(f.size)))))
      continue;
    have.add(id);
    total += f.size;
    items.push({ id, name: f.name.replace(/\.[^.]+$/, '').slice(0, 60) || id.slice(0, 8) });
  }
  if (anim) notify(T.animNote(anim));
  const r = addFrames(items);
  if (r.added) notify(T.added(r.added));
  else if (dup) notify(T.dupNote, true);
}

/** 範本：512 × 512 透明 PNG（可繪製區、頭像可視區 320 的圓與直角方框、外圈） */
export async function downloadFrameTemplate(): Promise<void> {
  const size = 512;
  const mid = size / 2;
  const d = Math.round(size / FRAME_SCALE);
  const r = d / 2;
  const cv = makeCanvas(size, size) as HTMLCanvasElement;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  g.strokeStyle = 'rgba(120,120,120,.85)';
  g.lineWidth = 2;
  g.setLineDash([10, 8]);
  g.strokeRect(1, 1, size - 2, size - 2);
  g.setLineDash([]);
  g.strokeStyle = 'rgba(0,140,255,.9)';
  g.beginPath();
  g.arc(mid, mid, r, 0, Math.PI * 2);
  g.stroke();
  /* 方形頭像是直角方塊（原作的範本畫了 22% 圓角，和實際的方形頭像不符） */
  g.strokeStyle = 'rgba(255,90,0,.9)';
  g.strokeRect(mid - r, mid - r, d, d);
  g.strokeStyle = 'rgba(120,120,120,.6)';
  g.beginPath();
  g.moveTo(mid, mid - 16);
  g.lineTo(mid, mid + 16);
  g.moveTo(mid - 16, mid);
  g.lineTo(mid + 16, mid);
  g.stroke();
  g.fillStyle = 'rgba(120,120,120,.95)';
  g.font = '16px sans-serif';
  g.textAlign = 'center';
  g.fillText(T.tplCanvas, mid, 26);
  g.fillText(T.tplAvatar, mid, mid - r - 10);
  g.fillText(T.tplPad, mid, size - 14);
  downloadBlob(await canvasToBlob(cv, 'image/png'), T.tplFile);
}

/* ---------- 管理 ---------- */

/** 每張框實際被幾位角色戴著（所有分頁；含跟著標籤、分頁預設戴上的） */
export function frameUsage(p: Project): Map<string, number> {
  const out = new Map<string, number>();
  if (!p.frames.length) return out;
  for (const s of p.sheets) {
    const ctx = sheetCtx(s, p.labels, { frames: p.frames });
    for (const c of s.chars) {
      const src = frameSource(ctx, c);
      if (src) out.set(src.id, (out.get(src.id) ?? 0) + 1);
    }
  }
  return out;
}

const sizeText = (n: number) =>
  n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function FrameRow({ f, url, used }: { f: FrameItem; url?: string; used: number }) {
  const confirm = useConfirm();
  const [name, setName] = useState(f.name);
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => setName(f.name), [f.name]);
  useEffect(() => {
    let live = true;
    void assets.get(f.id).then((b) => live && setBytes(b?.size ?? null));
    return () => {
      live = false;
    };
  }, [f.id]);
  return (
    <li className="flex items-center gap-2" data-testid="frame-row">
      <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-3">
        {url ? <img src={url} alt="" className="size-10 object-contain" /> : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <TextInput
          value={name}
          maxLength={60}
          aria-label={T.rename}
          className="h-7 text-sm"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim()) renameFrame(f.id, name);
            else setName(f.name);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="text-xs text-muted">
          {bytes === null ? '' : `${sizeText(bytes)} · `}
          {T.usage(used)}
        </span>
      </div>
      <IconButton
        size="sm"
        icon={<Trash2 />}
        label={T.remove(f.name)}
        onClick={async () => {
          const ok = await confirm({
            title: T.remove(f.name),
            description: T.delConfirm(f.name, used),
            danger: true,
          });
          if (ok) deleteFrame(f.id);
        }}
        data-testid="frame-del"
      />
    </li>
  );
}

export function FramesDialog() {
  const open = useUi((u) => u.dialog === 'frames');
  const p = useProject((s) => s.data);
  const urls = useFrameUrls();
  const usage = useMemo(() => (open ? frameUsage(p) : new Map<string, number>()), [open, p]);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && setUi({ dialog: null })}
      title={T.mgrTitle}
      size="md"
    >
      {p.frames.length ? (
        <ul className="flex flex-col gap-2" data-testid="frame-manager">
          {p.frames.map((f) => (
            <FrameRow key={f.id} f={f} url={urls.get(f.id)} used={usage.get(f.id) ?? 0} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{T.mgrEmpty}</p>
      )}
    </Dialog>
  );
}
