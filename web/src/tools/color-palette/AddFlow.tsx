/**
 * 新增角色的流程（規格 1.1 F43～F47）與編輯視窗裡的「換立繪」「調整頭像範圍」、色票櫃的「從立繪補取色」（F52）：
 * 1. 圈頭像：共用的 ImageFrameDialog（1:1、蓋滿、圓形）；「同上一張的範圍」「換一張圖」「跳過這張」。
 * 2. 取色：圓形頭像上的滴管（CirclePicker）、髮色與瞳色的格子（各最多 5 格）、色碼、「自動取色」、「無」、名字。
 *    第一格髮色一開始是頭像裡的主色（自動取色）；取了第一個髮色之後自動換到瞳色的格子。
 * 一次選好幾張時一張一張做（標題顯示第幾張／共幾張）；關掉視窗＝剩下的不加入。
 */
import { ImagePlus, SkipForward, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type AssetImageRef, addImageFile } from '@/core/assets';
import { pickFiles } from '@/core/files';
import { DEFAULT_PLACEMENT, type FramePlacement } from '@/core/image';
import { Button, ColorField, Dialog, Field, ImageFrameDialog, TextInput, useToast } from '@/ui';
import { CirclePicker } from './CirclePicker';
import { type KeyRole, type PartColor, roleColors, roomLeft } from './characters';
import {
  dominantOf,
  endJob,
  type FlowJob,
  getLastPlacement,
  setLastPlacement,
  useFlow,
} from './flow';
import { LIMITS, MAX_BARS } from './logic';
import { RoleSlots } from './RoleSlots';
import { actions, assets, settingsNow } from './store';
import { S } from './strings';

interface Loaded {
  ref: AssetImageRef;
  bitmap: ImageBitmap;
  fileName: string;
}

/** 圖片存不進瀏覽器（這次可以用，重新整理之後就不見了）：這次開頁提醒過一次就好 */
let warnedNotSaved = false;

async function loadFile(file: File): Promise<Loaded & { notSaved: boolean }> {
  const { ref, persisted } = await addImageFile(assets, file, { maxSide: LIMITS.imageSide });
  const bitmap = await assets.bitmap(ref.id);
  if (!bitmap) throw new Error(file.name);
  const notSaved = !persisted && !warnedNotSaved;
  if (notSaved) warnedNotSaved = true;
  return { ref, bitmap, fileName: file.name, notSaved };
}

/* ---------- 取色視窗 ---------- */

export interface PickResult {
  hair: PartColor[];
  eye: PartColor[];
  name: string;
}

interface PickDialogProps {
  open: boolean;
  /** 換了這個值（下一張、下一位）時才重新帶入顏色；回去重新圈頭像時已取的顏色留著 */
  itemKey: string;
  title: string;
  description?: string;
  bitmap: ImageBitmap | null;
  size: { width: number; height: number } | null;
  placement: FramePlacement;
  roles: readonly KeyRole[];
  initial: { hair: PartColor[]; eye: PartColor[] };
  /** null＝不顯示名字欄 */
  initialName: string | null;
  saveLabel: string;
  onSave: (r: PickResult) => void;
  onSkip?: () => void;
  onBack?: () => void;
  onCancel: () => void;
}

type Slot = PartColor | null;

export function PickDialog({
  open,
  itemKey,
  title,
  description,
  bitmap,
  size,
  placement,
  roles,
  initial,
  initialName,
  saveLabel,
  onSave,
  onSkip,
  onBack,
  onCancel,
}: PickDialogProps) {
  const [slots, setSlots] = useState<Record<KeyRole, Slot[]>>({ hair: [], eye: [] });
  const [active, setActive] = useState<{ role: KeyRole; i: number } | null>(null);
  const [name, setName] = useState('');
  /** 第一格髮色還是自動取的主色（還沒自己取過）：重新圈頭像時跟著換 */
  const autoHair = useRef(false);
  const toast = useToast();
  const auto = () => (bitmap && size ? dominantOf(bitmap, size, placement) : '#888888');

  /* 換了一張圖（一位角色）：帶入既有的顏色；新角色的第一格髮色是頭像的主色，瞳色先留一格未指定 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在換了一張圖時重來
  useEffect(() => {
    if (!itemKey) return;
    const next: Record<KeyRole, Slot[]> = { hair: [], eye: [] };
    autoHair.current = false;
    for (const r of roles) {
      const have = initial[r];
      if (have.length) next[r] = have.slice();
      else if (r === 'hair' && roles.includes('eye')) {
        next[r] = [{ color: auto(), none: false }];
        autoHair.current = true;
      } else next[r] = [null];
    }
    setSlots(next);
    setActive({ role: roles[0], i: 0 });
    setName(initialName ?? '');
  }, [itemKey]);

  /* 重新圈了頭像：還沒自己取過的第一格髮色換成新範圍的主色 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在範圍換了時
  useEffect(() => {
    if (!autoHair.current) return;
    const c = auto();
    setSlots((s) =>
      s.hair.length ? { ...s, hair: [{ color: c, none: false }, ...s.hair.slice(1)] } : s,
    );
  }, [placement]);

  const cur = active ? (slots[active.role][active.i] ?? null) : null;
  const setCur = (c: PartColor) => {
    if (!active) return;
    if (active.role === 'hair' && active.i === 0) autoHair.current = false;
    setSlots((s) => ({
      ...s,
      [active.role]: s[active.role].map((x, i) => (i === active.i ? c : x)),
    }));
  };
  /** 取了第一個髮色之後換到還沒指定的瞳色 */
  const advance = () => {
    if (active?.role === 'hair' && active.i === 0 && roles.includes('eye') && slots.eye[0] == null)
      setActive({ role: 'eye', i: 0 });
  };

  const save = () => {
    const pick = (r: KeyRole) => slots[r].filter((c): c is PartColor => !!c);
    onSave({ hair: pick('hair'), eye: pick('eye'), name });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      title={title}
      description={description ?? S.pickDesc}
      size="lg"
      dismissOnOutside={false}
      footer={
        <>
          {onBack ? (
            <Button className="mr-auto" onClick={onBack}>
              {S.backToCrop}
            </Button>
          ) : null}
          {onSkip ? <Button onClick={onSkip}>{S.skip}</Button> : null}
          <Button variant="primary" onClick={save} data-testid="pick-save">
            {saveLabel}
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <CirclePicker
            bitmap={bitmap}
            size={size}
            placement={placement}
            diameter={208}
            canPick={!!active}
            onNoTarget={() => toast({ title: S.pickNoTarget, tone: 'info', replace: true })}
            onPick={(hex) => setCur({ color: hex, none: false })}
            onPickEnd={advance}
            label={S.pickCircle}
          />
          <p className="m-0 max-w-56 text-center text-xs text-muted" data-testid="pick-target">
            {active
              ? S.pickTarget(S.slotLabel(S.roles[active.role], active.i + 1))
              : S.pickNoTarget}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {roles.map((r) => (
            <div key={r} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-fg">{S.roles[r]}</span>
                <span className="text-xs text-muted">{S.multiHint[r]}</span>
              </div>
              <RoleSlots
                label={S.roles[r]}
                slots={slots[r]}
                active={active?.role === r ? active.i : null}
                onSelect={(i) => setActive({ role: r, i })}
                onAdd={() => {
                  setSlots((s) => ({ ...s, [r]: [...s[r], s[r][s[r].length - 1] ?? null] }));
                  setActive({ role: r, i: slots[r].length });
                }}
                onRemove={(i) => {
                  setSlots((s) => ({ ...s, [r]: s[r].filter((_, k) => k !== i) }));
                  setActive({ role: r, i: Math.max(0, Math.min(i, slots[r].length - 2)) });
                }}
                max={LIMITS.roleColors}
                testId={`slots-${r}`}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <ColorField
              aria-label={S.hexLabel}
              value={cur && !cur.none ? cur.color : '#888888'}
              onChange={(hex) => setCur({ color: hex, none: false })}
              disabled={!active}
              className="min-w-0 flex-1"
            />
            <Button
              size="sm"
              icon={<Wand2 />}
              title={S.autoPickHint}
              disabled={!active || !bitmap || !size}
              onClick={() => {
                if (bitmap && size)
                  setCur({ color: dominantOf(bitmap, size, placement), none: false });
              }}
            >
              {S.autoPick}
            </Button>
            <Button
              size="sm"
              title={S.noneHint}
              aria-pressed={!!cur?.none}
              disabled={!active}
              onClick={() => setCur({ color: cur?.color ?? '#000000', none: !cur?.none })}
            >
              {S.markNone}
            </Button>
          </div>
          {initialName !== null ? (
            <Field label={S.nameLabel}>
              <TextInput
                value={name}
                maxLength={LIMITS.name}
                placeholder={S.namePlaceholder}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    save();
                  }
                }}
              />
            </Field>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- 流程 ---------- */

type Step =
  | { kind: 'idle' }
  | { kind: 'crop'; item: Loaded; placement: FramePlacement | null; index: number; total: number }
  | { kind: 'pick'; item: Loaded; placement: FramePlacement; index: number; total: number };

export function AddFlow() {
  const job = useFlow((s) => s.job);
  const toast = useToast();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  /* 'add' 的佇列 */
  const queue = useRef<{
    files: File[];
    index: number;
    added: string[];
    failed: string[];
    full: number;
    notSaved?: boolean;
  }>({
    files: [],
    index: 0,
    added: [],
    failed: [],
    full: 0,
  });
  const applied = useRef(false);
  const running = useRef<FlowJob | null>(null);

  /** 結束（cancelled：在某一張的中途關掉，那一張也算沒加入） */
  const finish = (cancelled = false) => {
    const q = queue.current;
    const j = running.current;
    running.current = null;
    setStep({ kind: 'idle' });
    endJob();
    if (j?.kind !== 'add') return;
    const left = cancelled ? q.files.length - q.index + 1 : 0;
    const notes = [
      q.failed.length ? S.decodeError(q.failed.join('、')) : '',
      q.full ? S.listFullSkipped(MAX_BARS, q.full) : '',
      left > 0 ? S.queueLeft(left) : '',
      q.notSaved ? S.imageNotSaved : '',
    ].filter(Boolean);
    const n = q.added.length;
    if (!n && !notes.length) return;
    toast({
      title: n === 1 ? S.addedOne(q.added[0] || S.unnamed) : n ? S.addedMany(n) : notes.shift(),
      description: notes.length ? notes.join('') : undefined,
      tone: notes.length || !n ? 'warning' : 'success',
      replace: true,
    });
  };

  /** 佇列的下一張（讀不了的跳過、清單滿了就停） */
  const next = async () => {
    const q = queue.current;
    while (q.index < q.files.length) {
      if (!roomLeft(settingsNow().bars)) {
        q.full = q.files.length - q.index;
        q.index = q.files.length;
        break;
      }
      const file = q.files[q.index];
      q.index++;
      try {
        const item = await loadFile(file);
        if (item.notSaved) q.notSaved = true;
        applied.current = false;
        setStep({ kind: 'crop', item, placement: null, index: q.index, total: q.files.length });
        return;
      } catch {
        q.failed.push(file.name);
      }
    }
    finish();
  };

  /* 開始一個工作 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在工作換了時開始
  useEffect(() => {
    if (!job || running.current === job) return;
    running.current = job;
    queue.current = { files: [], index: 0, added: [], failed: [], full: 0 };
    void (async () => {
      if (job.kind === 'add') {
        queue.current.files = job.files;
        await next();
      } else if (job.kind === 'image') {
        try {
          const item = await loadFile(job.file);
          if (item.notSaved) toast({ title: S.imageNotSaved, tone: 'warning' });
          applied.current = false;
          setStep({ kind: 'crop', item, placement: null, index: 1, total: 1 });
        } catch {
          toast({ title: S.decodeError(job.file.name), tone: 'danger' });
          finish();
        }
      } else if (job.kind === 'avatar' || job.kind === 'refill') {
        const ids = job.kind === 'avatar' ? [job.barId] : job.ids;
        refill.current = { ids, index: 0, done: 0 };
        await nextRefill();
      }
    })();
  }, [job]);

  /* ---------- 補取色、調整頭像（既有的角色） ---------- */
  const refill = useRef<{ ids: string[]; index: number; done: number }>({
    ids: [],
    index: 0,
    done: 0,
  });
  const nextRefill = async () => {
    const r = refill.current;
    const j = running.current;
    while (r.index < r.ids.length) {
      const bar = settingsNow().bars.find((b) => b.id === r.ids[r.index]);
      r.index++;
      if (!bar?.image) continue;
      const bitmap = await assets.bitmap(bar.image.id).catch(() => undefined);
      if (!bitmap) continue;
      const item: Loaded = {
        ref: { ...bar.image, name: bar.name ?? '' },
        bitmap,
        fileName: bar.name ?? '',
      };
      applied.current = false;
      if (j?.kind === 'avatar')
        setStep({ kind: 'crop', item, placement: bar.avatar ?? null, index: 1, total: 1 });
      else
        setStep({
          kind: 'pick',
          item,
          placement: bar.avatar ?? DEFAULT_PLACEMENT,
          index: r.index,
          total: r.ids.length,
        });
      return;
    }
    if (j?.kind === 'refill' && r.done)
      toast({ title: S.refillSaved(r.done), tone: 'success', replace: true });
    finish();
  };

  const j = running.current;
  const crop = step.kind === 'crop' ? step : null;
  const pick = step.kind === 'pick' ? step : null;
  const curBar =
    j && (j.kind === 'image' || j.kind === 'avatar')
      ? settingsNow().bars.find((b) => b.id === j.barId)
      : j?.kind === 'refill' && pick
        ? settingsNow().bars.find((b) => b.id === refill.current.ids[refill.current.index - 1])
        : undefined;

  const cropTitle =
    j?.kind === 'add' && crop
      ? S.cropTitle(crop.index, crop.total)
      : S.avatarTitle((curBar?.name ?? '').trim() || S.unnamed);

  return (
    <>
      <ImageFrameDialog
        open={!!crop}
        onOpenChange={(o) => {
          if (o || !crop) return;
          if (applied.current) return;
          /* 取消、Esc：新增角色時剩下的都不加入；換立繪、調整頭像就是不改 */
          finish(true);
        }}
        image={crop?.item.bitmap ?? null}
        aspect={1}
        cover={{ maxZoom: LIMITS.avatarZoom }}
        shape="circle"
        outline="shape"
        initialPlacement={crop?.placement ?? null}
        title={cropTitle}
        note={S.cropNote}
        placementPresets={
          j?.kind === 'add'
            ? [{ label: S.sameCrop, title: S.sameCropHint, placement: getLastPlacement() }]
            : undefined
        }
        extraActions={
          j?.kind === 'add' && crop ? (
            <>
              <Button
                size="sm"
                icon={<ImagePlus />}
                onClick={async () => {
                  const [f] = await pickFiles({ accept: 'image/*' });
                  if (!f) return;
                  try {
                    const item = await loadFile(f);
                    setStep({ ...crop, item, placement: null });
                  } catch {
                    toast({ title: S.decodeError(f.name), tone: 'danger' });
                  }
                }}
              >
                {S.replaceImage}
              </Button>
              <Button
                size="sm"
                icon={<SkipForward />}
                onClick={() => {
                  applied.current = true;
                  void next();
                }}
              >
                {S.skipImage}
              </Button>
            </>
          ) : undefined
        }
        onApply={(p) => {
          if (!crop || !j) return;
          applied.current = true;
          if (j.kind === 'add') {
            setStep({
              kind: 'pick',
              item: crop.item,
              placement: p,
              index: crop.index,
              total: crop.total,
            });
          } else if (j.kind === 'image') {
            actions.setImage(
              j.barId,
              { id: crop.item.ref.id, width: crop.item.ref.width, height: crop.item.ref.height },
              p,
            );
            finish();
          } else if (j.kind === 'avatar') {
            actions.setAvatar(j.barId, p);
            finish();
          }
        }}
      />
      <PickDialog
        open={!!pick}
        itemKey={pick ? `${pick.index}:${pick.item.ref.id}:${curBar?.id ?? ''}` : ''}
        title={
          j?.kind === 'refill' && pick
            ? S.refillPickTitle(S.roles[j.role], pick.index, pick.total)
            : pick
              ? S.pickTitle(pick.index, pick.total)
              : ''
        }
        description={
          j?.kind === 'refill'
            ? `${(curBar?.name ?? '').trim() || S.unnamed}：${S.pickDesc}`
            : pick
              ? `${pick.item.fileName}：${S.pickDesc}`
              : undefined
        }
        bitmap={pick?.item.bitmap ?? null}
        size={pick ? { width: pick.item.ref.width, height: pick.item.ref.height } : null}
        placement={pick?.placement ?? DEFAULT_PLACEMENT}
        roles={j?.kind === 'refill' ? [j.role] : ['hair', 'eye']}
        initial={
          j?.kind === 'refill' && curBar
            ? { hair: roleColors(curBar, 'hair'), eye: roleColors(curBar, 'eye') }
            : { hair: [], eye: [] }
        }
        initialName={j?.kind === 'refill' ? null : ''}
        saveLabel={pick && pick.index < pick.total ? S.saveNext : S.saveDone}
        onBack={
          j?.kind === 'add' && pick
            ? () => {
                applied.current = false;
                setStep({
                  kind: 'crop',
                  item: pick.item,
                  placement: pick.placement,
                  index: pick.index,
                  total: pick.total,
                });
              }
            : undefined
        }
        onSkip={() => {
          if (j?.kind === 'refill') void nextRefill();
          else void next();
        }}
        onCancel={() => finish(true)}
        onSave={(r) => {
          if (!pick || !j) return;
          if (j.kind === 'refill' && curBar) {
            actions.setRoleColors(curBar.id, j.role, r[j.role]);
            refill.current.done++;
            void nextRefill();
            return;
          }
          const id = actions.addCharacter({
            name: r.name,
            image: {
              id: pick.item.ref.id,
              width: pick.item.ref.width,
              height: pick.item.ref.height,
            },
            avatar: pick.placement,
            hair: r.hair,
            eye: r.eye,
          });
          setLastPlacement(pick.placement);
          if (id) queue.current.added.push(r.name.trim());
          void next();
        }}
      />
    </>
  );
}
