/**
 * 預覽與輸出用的 CSS：
 * - 輸出（第 3 步）：實際的人、實際的圖片與量到的尺寸。
 * - 預覽：沒有圖片時用佔位立繪；寬度原尺寸又還量不到尺寸時暫用 384px（F49）；
 *   第 2 步的名字用第 3 步選中的人（沒選就第一個人），沒有人或名字空白時用暫定的「名字」（F50）。
 */
import { useMemo } from 'react';
import { buildTachieCss, cssAlignLost } from './css';
import { cssFileName, nameText, type Size } from './logic';
import { effectiveCombo, PROVISIONAL_WIDTH, type Preset, type TachieUser } from './model';
import { PLACEHOLDER_IMAGE, PLACEHOLDER_SIZE } from './placeholder';
import { useImages, useTachie } from './store';
import { S } from './strings';

/** 第 2 步沒有使用者時，預覽用的假 ID */
export const PREVIEW_USER_ID = '100000000000000001';

function usePresetImage(preset: Preset | null): {
  src: string | null;
  natural: Size | null;
  loading: boolean;
  missing: boolean;
} {
  const key = preset?.image ?? null;
  const src = useImages((s) => (key ? (s.map[key] ?? null) : null));
  const size = useImages((s) => (key ? (s.sizes[key] ?? null) : null));
  const ready = useImages((s) => s.ready);
  return useMemo(
    () => ({
      src,
      natural: size?.status === 'ok' ? size.size : null,
      loading: !!key && (src ? !size || size.status === 'loading' : !ready),
      missing: !!key && ready && !src,
    }),
    [key, src, size, ready],
  );
}

/** 預覽的 CSS（佔位立繪、暫定寬度、暫定名字） */
function previewCss(
  user: TachieUser,
  preset: Preset,
  img: { src: string | null; natural: Size | null },
  nameOverride: string | null,
): string {
  const hasImage = !!img.src;
  const usePreset =
    hasImage && !img.natural && preset.width === null
      ? { ...preset, width: PROVISIONAL_WIDTH }
      : preset;
  return buildTachieCss({
    user,
    preset: usePreset,
    image: hasImage ? img.src : PLACEHOLDER_IMAGE,
    natural: hasImage ? img.natural : PLACEHOLDER_SIZE,
    nameOverride,
  });
}

/** 第 2 步：編輯中的預設集的預覽 */
export function usePresetPreview(preset: Preset | null) {
  const data = useTachie((s) => s.data);
  const img = usePresetImage(preset);
  return useMemo(() => {
    if (!preset) return null;
    const { user: chosen } = effectiveCombo(data);
    const text = nameText(chosen);
    const provisional = !text;
    const user: TachieUser = chosen ?? { id: PREVIEW_USER_ID, memo: '', name: '' };
    return {
      css: previewCss(user, preset, img, provisional ? S.preview.provisionalName : null),
      userId: user.id,
      userName: text || S.preview.provisionalName,
      provisional: provisional && preset.label.show,
    };
  }, [data, preset, img]);
}

/** 第 3 步：目前的組合的預覽與輸出 */
export function useComboOutput() {
  const data = useTachie((s) => s.data);
  const { user, preset } = effectiveCombo(data);
  const img = usePresetImage(preset);
  return useMemo(() => {
    if (!user || !preset) return null;
    const text = nameText(user);
    return {
      user,
      preset,
      css: buildTachieCss({ user, preset, image: img.src, natural: img.natural }),
      previewCss: previewCss(user, preset, img, null),
      fileName: cssFileName(user, preset.name),
      alignLost: cssAlignLost(preset, img.src, img.natural),
      emptyName: preset.label.show && !text,
      noImage: !preset.image || img.missing,
      loading: img.loading,
      userName: text,
    };
  }, [user, preset, img]);
}
