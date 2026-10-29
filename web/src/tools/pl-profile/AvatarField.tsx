/**
 * 頭像（規格 F04）：選檔、拖放、貼上 → 存進資產庫（長邊最多 1024 px）→ 圓形的範圍（共用的 ImageFrameDialog：
 * 1:1、蓋滿、圓以外變暗、沿著圓畫虛線）。換一張、拿掉；圖片不在這個瀏覽器時提醒重新選。
 */
import { Crop, ImageUp, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { addImageFile, splitImageFiles, useAssetImage } from '@/core/assets';
import { pickFiles } from '@/core/files';
import { DEFAULT_PLACEMENT, drawPlacedCrop } from '@/core/image';
import { Button, ImageDrop, ImageFrameDialog, Notice, useToast } from '@/ui';
import { setAvatar, setAvatarPlacement } from './actions';
import { AVATAR_MAX_SIDE, AVATAR_MAX_ZOOM, type AvatarRef } from './model';
import { assets, useProfile } from './store';
import { S } from './strings';

/** 卡片上頭像的直徑（800 px 寬、2 倍時；對話框顯示的輸出大小） */
const AVATAR_OUTPUT = 288;

/** 測試與說明用：位置的文字（置中時 center） */
export const placementKey = (p: { zoom: number; x: number; y: number; turns: number } | null) =>
  p ? `${p.zoom.toFixed(3)},${p.x.toFixed(4)},${p.y.toFixed(4)},${p.turns}` : 'center';

function AvatarPreview({ bitmap, avatar }: { bitmap: ImageBitmap; avatar: AvatarRef }) {
  const placement = useProfile((s) => s.data.profile.avatarPlacement);
  const ref = useRef<HTMLCanvasElement>(null);
  const size = 72;
  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);
    el.width = px;
    el.height = px;
    ctx.clearRect(0, 0, px, px);
    ctx.save();
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
    ctx.clip();
    drawPlacedCrop(
      ctx,
      bitmap,
      { width: avatar.width, height: avatar.height },
      { x: 0, y: 0, width: px, height: px },
      placement ?? DEFAULT_PLACEMENT,
    );
    ctx.restore();
  }, [bitmap, avatar, placement]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      data-testid="avatar-preview"
      data-placement={placementKey(placement)}
      className="shrink-0 rounded-full border border-border-strong bg-surface-2"
      style={{ width: size, height: size }}
    />
  );
}

/** 讀一張圖當頭像（要在 ToolShell 裡面用：通知） */
export function useAvatarLoader() {
  const toast = useToast();
  return async (files: File[]) => {
    const { images, others } = await splitImageFiles(files);
    const file = images[0];
    if (!file) {
      const name = others[0]?.name ?? '';
      toast({
        title: S.profile.avatarFailed(name),
        description: S.profile.avatarFailedHint,
        tone: 'danger',
      });
      return;
    }
    try {
      const r = await addImageFile(assets, file, { maxSide: AVATAR_MAX_SIDE });
      setAvatar(r.ref);
      toast(
        r.persisted
          ? { title: S.profile.avatarAdded, description: file.name, tone: 'success' }
          : {
              title: S.profile.avatarAdded,
              description: S.profile.avatarNotSaved,
              tone: 'warning',
            },
      );
    } catch {
      toast({
        title: S.profile.avatarFailed(file.name),
        description: S.profile.avatarFailedHint,
        tone: 'danger',
      });
    }
  };
}

export function AvatarField() {
  const avatar = useProfile((s) => s.data.profile.avatar);
  const placement = useProfile((s) => s.data.profile.avatarPlacement);
  const { bitmap, status } = useAssetImage(assets, avatar?.id);
  const [cropOpen, setCropOpen] = useState(false);
  const load = useAvatarLoader();

  const pick = async () => {
    const files = await pickFiles({ accept: 'image/*' });
    if (files.length) await load(files);
  };

  if (!avatar)
    return (
      <div data-testid="avatar-drop">
        <ImageDrop
          compact
          label={S.profile.avatarDrop}
          hint={S.profile.avatarHint}
          onFiles={(files) => void load(files)}
        />
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {bitmap ? (
          <AvatarPreview bitmap={bitmap} avatar={avatar} />
        ) : (
          <div
            aria-hidden
            className="size-[72px] shrink-0 rounded-full border border-border-strong bg-surface-2"
          />
        )}
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button size="sm" icon={<Crop />} disabled={!bitmap} onClick={() => setCropOpen(true)}>
            {S.profile.avatarCrop}
          </Button>
          <Button size="sm" icon={<ImageUp />} onClick={() => void pick()}>
            {S.profile.avatarReplace}
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setAvatar(null)}>
            {S.profile.avatarRemove}
          </Button>
        </div>
      </div>
      {status === 'loading' ? (
        <p className="m-0 text-xs text-muted">{S.profile.avatarLoading}</p>
      ) : null}
      {status === 'missing' ? <Notice tone="warning">{S.profile.avatarMissing}</Notice> : null}
      <ImageFrameDialog
        open={cropOpen && !!bitmap}
        onOpenChange={setCropOpen}
        image={bitmap}
        aspect={1}
        output={{ width: AVATAR_OUTPUT, height: AVATAR_OUTPUT }}
        cover={{ maxZoom: AVATAR_MAX_ZOOM }}
        shape="circle"
        outline="shape"
        initialPlacement={placement}
        title={S.profile.avatarTitle}
        note={S.profile.avatarNote}
        onApply={(p) => setAvatarPlacement(p)}
      />
    </div>
  );
}
