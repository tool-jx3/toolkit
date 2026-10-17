/**
 * 預覽區：畫面名稱與淺色／深色、舞台（canvas＋操作層）、說明、讀不到的圖的提醒、匯出（PNG、HTML）。
 * 舞台以 3 倍畫（＝PNG 的預設倍率），操作層的座標是 3 倍的內容座標：
 * - 貼文：照片框上拖曳、滾輪、捏合調整目前照片的位置；
 * - 個人頁：點貼文縮圖到那則貼文、點有連結的精選動態到那則限時動態；
 * - 限時動態：格子（點一下選取、空格子開選檔、拖曳與縮放照片）、貼紙（LayoutCanvas：拖曳、控點、滾輪、捏合、方向鍵、Delete）。
 */
import { ArrowUpToLine, Copy, Trash2 } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useAssetBitmaps } from '@/core/assets';
import { pickFiles } from '@/core/files';
import type { FramePlacement } from '@/core/image';
import type { Placement } from '@/core/scene';
import {
  ExportPanel,
  type ExportSettings,
  Field,
  IconButton,
  LayoutCanvas,
  type LayoutSticker,
  Notice,
  Segmented,
  Stage,
} from '@/ui';
import { useNotify } from './controls';
import { exportPng } from './exporter';
import { useEnsureFonts, useFontTick } from './fonts';
import { addImageFiles } from './media';
import {
  clampStickerPos,
  imageSize,
  type Post,
  STICKER_SCALE_RANGE,
  type Story,
  stickerAction,
  type Theme,
} from './model';
import { PanZone } from './PanZone';
import type { Rect, ScreenLayout } from './render/ops';
import { createCanvasMeasure, paintScreen } from './render/paint';
import { assetIdsOf, buildScreen, fontLoadsOf, imageSource, makeEnv } from './render/screens';
import { SH, type StickerLayout, SW } from './render/story';
import {
  assets,
  docNow,
  type ExportFormat,
  edit,
  editPost,
  editStory,
  gesture,
  type HtmlScope,
  prefsNow,
  SCALES,
  setPrefs,
  setTab,
  useCurrentPost,
  useCurrentStory,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';
import { exportHtml } from './viewerBuild';

/** 預覽畫布的倍率（＝PNG 的預設倍率） */
export const K = 3;

const scaleRect = (r: Rect): Rect => ({
  x: r.x * K,
  y: r.y * K,
  width: r.width * K,
  height: r.height * K,
});

/** 目前畫面的版面（字型載好後重排） */
export function usePreviewLayout(): ScreenLayout & { stickers?: Map<string, StickerLayout> } {
  const d = useDoc((s) => s.data);
  const prefs = usePrefs((p) => p.data);
  const tick = useFontTick();
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick＝字型載好了，要換新的量字
  const measure = useMemo(() => createCanvasMeasure(), [tick]);
  const env = useMemo(() => makeEnv(d, measure, true), [d, measure]);
  return useMemo(
    () =>
      buildScreen(env, prefs.screen, {
        postId: prefs.postId,
        storyId: prefs.storyId,
        cell: prefs.cell,
      }),
    [env, prefs.screen, prefs.postId, prefs.storyId, prefs.cell],
  );
}

/* ---------- 操作層 ---------- */

function PostOverlay({ post, layout }: { post: Post; layout: ScreenLayout }) {
  const cur = post.photos[post.current];
  const media = layout.parts.media;
  if (!cur || !media) return null;
  const set = (place: FramePlacement) =>
    editPost(post.id, (p) => {
      const ph = p.photos.find((x) => x.id === cur.id);
      if (ph) ph.place = place;
    });
  return (
    <div className="absolute inset-0">
      <PanZone
        box={scaleRect(media)}
        size={imageSize(cur.image)}
        place={cur.place}
        label={S.hits.media}
        testId="media-zone"
        onBegin={gesture.begin}
        onEnd={gesture.commit}
        onChange={set}
        onStep={set}
      />
    </div>
  );
}

function ProfileOverlay({ layout }: { layout: ScreenLayout }) {
  const regions = layout.hits.map((h) => ({ ...h, box: scaleRect(h.box) }));
  return (
    <LayoutCanvas
      width={Math.round(layout.width * K)}
      height={Math.round(layout.height * K)}
      aria-label={S.previewLabel(S.screenName.profile)}
      regions={regions}
      onPick={(key) => {
        if (key.startsWith('post:')) {
          setPrefs({ postId: key.slice(5) });
          setTab('post');
        } else if (key.startsWith('story:')) {
          setPrefs({ storyId: key.slice(6), sticker: null, cell: 0 });
          setTab('story');
        }
      }}
    />
  );
}

const normDeg = (d: number) => {
  let x = ((((d + 180) % 360) + 360) % 360) - 180;
  if (x === -180 && d > 0) x = 180;
  return Math.round(x * 10) / 10;
};

function StoryOverlay({
  story,
  layout,
}: {
  story: Story;
  layout: ScreenLayout & { stickers?: Map<string, StickerLayout> };
}) {
  const prefs = usePrefs((p) => p.data);
  const notify = useNotify();
  const W = Math.round(SW * K);
  const H = Math.round(SH * K);
  const nat = layout.stickers ?? new Map<string, StickerLayout>();
  const stickers: LayoutSticker[] = story.stickers.map((k, i) => {
    const l = nat.get(k.id);
    return {
      id: k.id,
      label: S.stickerLabel(S.stickerTypes[k.type], i + 1),
      placement: {
        cx: (k.x / 100) * W,
        cy: (k.y / 100) * H,
        width: Math.max(1, (l?.w ?? 40) * k.scale * K),
        height: Math.max(1, (l?.h ?? 40) * k.scale * K),
        rotation: k.rot,
      },
    };
  });
  /* 中心夾在畫面的 −10%～110%（同原作；拖曳中、方向鍵、放開都是） */
  const apply = (id: string, p: Placement) =>
    editStory(story.id, (s) => {
      const k = s.stickers.find((x) => x.id === id);
      const l = nat.get(id);
      if (!k || !l) return;
      k.x = clampStickerPos((p.cx / W) * 100);
      k.y = clampStickerPos((p.cy / H) * 100);
      k.scale = Math.min(
        STICKER_SCALE_RANGE[1],
        Math.max(STICKER_SCALE_RANGE[0], p.width / (l.w * K)),
      );
      k.rot = normDeg(p.rotation);
    });
  const cellRects = Object.entries(layout.parts)
    .filter(([key]) => key.startsWith('cell'))
    .map(([key, r]) => ({ i: Number(key.slice(4)), r }));
  const act = (id: string, a: 'front' | 'dup' | 'delete') => {
    let nid: string | null = null;
    edit((d) => {
      const s = d.stories.find((x) => x.id === story.id);
      if (s)
        nid = stickerAction(
          s,
          id,
          a,
          d.stories.flatMap((x) => x.stickers.map((y) => y.id)),
        );
    });
    if (a === 'delete') setPrefs({ sticker: null });
    if (a === 'dup' && nid) setPrefs({ sticker: nid });
  };
  return (
    <LayoutCanvas
      width={W}
      height={H}
      aria-label={S.previewLabel(S.screenName.story)}
      stickers={stickers}
      selectedSticker={prefs.sticker}
      onSelectSticker={(id) => setPrefs({ sticker: id })}
      stickerGestures
      stickerRange={{ min: 6, max: Math.max(W, H) * 6 }}
      stickerClamp={(p) => ({
        ...p,
        cx: (clampStickerPos((p.cx / W) * 100) / 100) * W,
        cy: (clampStickerPos((p.cy / H) * 100) / 100) * H,
      })}
      onStickerChange={(id, p, phase) => {
        if (phase === 'start') {
          gesture.begin();
          return;
        }
        apply(id, p);
        if (phase === 'end') gesture.commit();
      }}
      onStickerDelete={(id) => act(id, 'delete')}
      stickerToolbar={(id) => (
        <>
          <IconButton
            label={S.stickerFront}
            icon={<ArrowUpToLine />}
            size="sm"
            variant="ghost"
            onClick={() => act(id, 'front')}
          />
          <IconButton
            label={S.stickerDup}
            icon={<Copy />}
            size="sm"
            variant="ghost"
            onClick={() => act(id, 'dup')}
          />
          <IconButton
            label={S.stickerDelete}
            icon={<Trash2 />}
            size="sm"
            variant="ghost"
            onClick={() => act(id, 'delete')}
          />
        </>
      )}
    >
      {cellRects.map(({ i, r }) => {
        const c = story.cells[i];
        const set = (place: FramePlacement) =>
          editStory(story.id, (s) => {
            s.cells[i].place = place;
          });
        return (
          <PanZone
            key={i}
            box={scaleRect(r)}
            size={c?.image ? imageSize(c.image) : null}
            place={c?.place ?? { zoom: 1, x: 0, y: 0, turns: 0 }}
            label={S.hits.cell(i + 1)}
            selected={prefs.cell === i}
            testId={`cell-zone-${i}`}
            onBegin={gesture.begin}
            onEnd={gesture.commit}
            onChange={set}
            onStep={set}
            onTap={() => {
              setPrefs({ cell: i, sticker: null });
              if (!c?.image)
                void pickFiles({ accept: 'image/*', multiple: true }).then((files) =>
                  addImageFiles(files, { kind: 'cell', storyId: story.id, index: i }).then(notify),
                );
            }}
          />
        );
      })}
    </LayoutCanvas>
  );
}

/* ---------- 預覽 ---------- */

export function Preview() {
  const prefs = usePrefs((p) => p.data);
  const theme = useDoc((s) => s.data.theme);
  const post = useCurrentPost();
  const story = useCurrentStory();
  const posts = useDoc((s) => s.data.posts);
  const stories = useDoc((s) => s.data.stories);
  const layout = usePreviewLayout();
  const loads = useMemo(() => fontLoadsOf(layout.ops), [layout]);
  useEnsureFonts(loads);
  const ids = useMemo(() => assetIdsOf(layout.ops), [layout]);
  const { bitmaps, missing } = useAssetBitmaps(assets, ids);
  const W = Math.round(layout.width * K);
  const H = Math.round(layout.height * K);
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    void bitmaps;
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    paintScreen(ctx, layout, K, imageSource);
  }, [layout, bitmaps]);

  const screen = prefs.screen;
  const name =
    screen === 'post' || screen === 'comments'
      ? `${S.screenName[screen]} ${posts.indexOf(post) + 1}`
      : screen === 'story'
        ? `${S.screenName.story} ${stories.indexOf(story) + 1}`
        : S.screenName.profile;

  const settings: ExportSettings = {
    format: prefs.format,
    fps: 1,
    plays: 0,
    scale: prefs.format === 'png' ? prefs.scale : 1,
    quantize: false,
  };
  const formats = useMemo(
    () =>
      (['png', 'html'] as const).map((id) => ({
        id,
        label: S.formats[id],
        description: S.formatDesc[id],
      })),
    [],
  );
  const resetKey = useMemo(
    () => ({ layout, format: prefs.format, scope: prefs.htmlScope, scale: prefs.scale }),
    [layout, prefs.format, prefs.htmlScope, prefs.scale],
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base font-semibold text-fg" data-testid="preview-title">
          {S.previewTitle(name)}
        </h2>
        {screen !== 'story' ? (
          <Segmented<Theme>
            aria-label={S.themeLabel}
            value={theme}
            onValueChange={(v) =>
              edit((d) => {
                d.theme = v;
              })
            }
            options={(['light', 'dark'] as const).map((v) => ({ value: v, label: S.themes[v] }))}
          />
        ) : null}
      </div>
      <Stage width={W} height={H} aria-label={S.previewLabel(name)} className="shrink-0">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          className="block size-full"
          data-testid="sp-canvas"
          data-screen={screen}
          data-size={`${W}x${H}`}
        />
        {screen === 'post' ? <PostOverlay post={post} layout={layout} /> : null}
        {screen === 'profile' ? <ProfileOverlay layout={layout} /> : null}
        {screen === 'story' ? <StoryOverlay story={story} layout={layout} /> : null}
      </Stage>
      <p className="m-0 px-1 text-xs text-muted">{S.previewHint[screen]}</p>
      {missing.length ? (
        <Notice tone="warning">
          <span data-testid="missing-images">{S.missingImages(missing.length)}</span>
        </Notice>
      ) : null}
      <ExportPanel
        title={S.exportTitle}
        formats={formats}
        settings={settings}
        onSettingsChange={(next) =>
          setPrefs({
            format: next.format as ExportFormat,
            ...(next.format === 'png'
              ? { scale: (SCALES as readonly number[]).includes(next.scale) ? next.scale : 3 }
              : {}),
          })
        }
        baseSize={
          prefs.format === 'png' ? { width: layout.width, height: layout.height } : undefined
        }
        scaleOptions={SCALES}
        resetKey={resetKey}
        extra={
          prefs.format === 'html' ? (
            <Field label={S.htmlScope} hint={S.htmlScopeHint}>
              <Segmented<HtmlScope>
                value={prefs.htmlScope}
                onValueChange={(v) => setPrefs({ htmlScope: v })}
                options={(['one', 'all'] as const).map((v) => ({
                  value: v,
                  label: S.htmlScopes[v],
                }))}
                fullWidth
              />
            </Field>
          ) : null
        }
        onExport={async (s, { signal, onProgress }) => {
          const p = prefsNow();
          const sel = { postId: p.postId, storyId: p.storyId };
          const state = docNow();
          if (s.format === 'html')
            return exportHtml(state, p.screen, sel, p.htmlScope, { signal, onProgress });
          onProgress(0.1, S.exporting);
          return exportPng(state, p.screen, sel, s.scale);
        }}
      />
    </>
  );
}
