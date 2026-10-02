/**
 * 「專案」分頁：上傳字型（F72）、預覽背景圖片（F51）。存檔、開啟、全部重來在頁首的「專案」選單（F85～F87）。
 */
import { ImagePlus, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pickFiles } from '@/core/files';
import {
  FONT_FILE_ACCEPT,
  fontFamilyCss,
  listUploadedFonts,
  registerUploadedFonts,
  removeUploadedFont,
  type UploadedFont,
} from '@/core/fonts';
import { Button, IconButton, Section } from '@/ui';
import { addFontFiles, removePreviewBgImage, setPreviewBgImage } from '../actions';
import { bump, setStatus, usePreview, useSession } from '../store';
import { S } from '../strings';

function FontsSection() {
  const [fonts, setFonts] = useState<UploadedFont[] | null>(null);
  const tick = useSession((st) => st.tick);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 變了（上傳、拖放）就重讀清單
  useEffect(() => {
    let alive = true;
    registerUploadedFonts()
      .then(() => listUploadedFonts())
      .then((list) => alive && setFonts(list))
      .catch(() => alive && setFonts([]));
    return () => {
      alive = false;
    };
  }, [tick]);
  return (
    <Section
      title={S.project.fontsSection}
      description={S.project.fontsHint}
      persistKey="foreground-frame:fonts"
    >
      <div>
        <Button
          icon={<Upload />}
          onClick={async () => {
            const files = await pickFiles({ accept: FONT_FILE_ACCEPT, multiple: true });
            if (files.length) await addFontFiles(files);
          }}
        >
          {S.project.addFont}
        </Button>
      </div>
      {fonts?.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="font-list">
          {fonts.map((f) => (
            <li
              key={f.id}
              className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1"
            >
              <span
                className="min-w-0 flex-1 truncate text-base"
                style={{ fontFamily: fontFamilyCss(f.family) }}
              >
                {f.family}
              </span>
              <IconButton
                label={S.project.removeFont(f.family)}
                icon={<Trash2 />}
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await removeUploadedFont(f.id);
                  setStatus(S.status.fontRemoved(f.family), 'success');
                  bump();
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-muted">{S.project.fontsEmpty}</p>
      )}
    </Section>
  );
}

function BackgroundSection() {
  const bgAsset = usePreview((st) => st.data.bgAsset);
  return (
    <Section
      title={S.project.bgSection}
      description={S.project.bgHint}
      persistKey="foreground-frame:bg"
    >
      <p className="m-0 text-sm text-muted" data-testid="bg-image-state">
        {bgAsset ? S.project.bgHas : S.project.bgNone}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<ImagePlus />}
          onClick={async () => {
            const [f] = await pickFiles({ accept: 'image/*' });
            if (f) await setPreviewBgImage(f);
          }}
        >
          {S.project.bgPick}
        </Button>
        <Button icon={<X />} disabled={!bgAsset} onClick={removePreviewBgImage}>
          {S.project.bgRemove}
        </Button>
      </div>
    </Section>
  );
}

export function ProjectPanel() {
  return (
    <div className="flex flex-col gap-3 pt-3">
      <FontsSection />
      <BackgroundSection />
    </div>
  );
}
