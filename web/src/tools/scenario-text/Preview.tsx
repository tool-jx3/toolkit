/**
 * 送出時的樣子（規格 1.7、3.6）：照 CCFOLIA 的尺寸畫訊息框（立繪寬固定、高依比例），整體縮進共用 Stage；
 * 下面是聊天欄（日誌）的頭像樣子與資訊文字。
 */
import { useState } from 'react';
import { MESSAGE_BOX_LAYOUT, messageBoxSize } from '@/ccfolia';
import { Field, Select, Stage, type StageAnyBackgroundKind } from '@/ui';
import { lookupOf } from './derived';
import type { Entry } from './model';
import { useImageSrc } from './parts';
import { imageOf, titleOf } from './resolve';
import { useDoc, usePrefs, type ViewSize } from './store';
import { S } from './strings';

/** 三種視窗寬度的示範寬（px）：電腦、小畫面（< 900）、手機（< 600） */
export const VIEW_WIDTHS: Record<ViewSize, number> = { pc: 1280, mid: 800, phone: 375 };
const VIEWS: ViewSize[] = ['pc', 'mid', 'phone'];
const L = MESSAGE_BOX_LAYOUT;
/** 預覽四周的留白（原作：訊息框貼左下各 24 px） */
const MARGIN = 24;
/** 預覽高度算式裡訊息框的高（原作：標題列 48＋內文區 80＋16，上方多留 16 px） */
const BOX_HEIGHT = L.toolbarHeight + L.bodyHeight + 16;

/** 預覽的原尺寸：寬＝訊息框＋48，高＝min(720, max(190, 24＋立繪高＋144＋24)) */
export function previewSize(
  box: number,
  portraitHeight: number,
): { width: number; height: number } {
  return {
    width: box + MARGIN * 2,
    height: Math.min(720, Math.max(190, MARGIN + portraitHeight + BOX_HEIGHT + MARGIN)),
  };
}

/** 立繪顯示的高（寬固定、依比例） */
export const portraitHeight = (width: number, natural: { w: number; h: number } | null): number =>
  natural && natural.w > 0 ? Math.round((width * natural.h) / natural.w) : 0;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden fill="currentColor">
      <path d={d} />
    </svg>
  );
}

export function Preview({ entry }: { entry: Entry | null }) {
  const doc = useDoc((s) => s.data);
  const view = usePrefs((s) => s.data.view);
  const setView = (v: ViewSize) => usePrefs.getState().patch({ view: v });
  const Lk = lookupOf(doc);
  const image = entry ? imageOf(entry, Lk) : null;
  const { src, missing } = useImageSrc(image);
  const [natural, setNatural] = useState<{ src: string; w: number; h: number } | null>(null);
  /* 讀不到的網址（換了圖就重新試） */
  const [failed, setFailed] = useState<string | null>(null);

  const { box, portrait } = messageBoxSize(VIEW_WIDTHS[view]);
  const nat = natural && natural.src === src ? natural : null;
  const shown = !!src && !!nat && failed !== src;
  const ph = shown ? portraitHeight(portrait, nat) : 0;
  const size = previewSize(box, ph);
  const title = entry ? titleOf(entry, Lk) : '';

  let info = '';
  if (entry) {
    if (shown && nat) {
      info = S.infoSize(portrait, ph, nat.w, nat.h);
      if (nat.h / nat.w < 0.75) info += S.infoWide;
      else if (ph > 560) info += S.infoTall;
    } else if (image && (missing || failed === src)) info = S.infoError;
    else if (image) info = S.infoLoading;
    else info = S.infoNone;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="preview">
      <Field label={S.viewLabel}>
        <Select
          value={view}
          onValueChange={setView}
          options={VIEWS.map((v) => ({ value: v, label: S.views[v] }))}
        />
      </Field>
      {entry ? (
        <Stage<StageAnyBackgroundKind>
          width={size.width}
          height={size.height}
          backgrounds={['scene', 'dark', 'light', 'color', 'image']}
          defaultBackground={{ kind: 'scene' }}
          aria-label={S.previewStage}
        >
          <div
            className="relative overflow-hidden"
            style={{ width: size.width, height: size.height }}
            data-testid="preview-native"
            data-width={size.width}
            data-height={size.height}
          >
            <div
              className="absolute"
              style={{ left: MARGIN, bottom: MARGIN, width: box }}
              data-testid="mbox"
              data-box={box}
            >
              {src && failed !== src ? (
                <img
                  key={src}
                  src={src}
                  alt=""
                  draggable={false}
                  data-testid="mbox-portrait"
                  className="absolute block max-w-none"
                  style={{
                    left: L.portraitLeft,
                    bottom: '100%',
                    width: portrait,
                    height: ph || 'auto',
                  }}
                  onLoad={(e) =>
                    setNatural({
                      src,
                      w: e.currentTarget.naturalWidth,
                      h: e.currentTarget.naturalHeight,
                    })
                  }
                  onError={() => setFailed(src)}
                />
              ) : null}
              <div
                className="relative"
                style={{
                  background: L.background,
                  color: L.color,
                  boxShadow: '0 3px 5px -1px rgba(0,0,0,.2), 0 6px 10px rgba(0,0,0,.14)',
                }}
              >
                <div
                  className="flex items-center"
                  style={{
                    height: L.toolbarHeight,
                    padding: `0 ${L.toolbarPaddingX}px`,
                    fontSize: L.nameSize,
                    fontWeight: 500,
                  }}
                >
                  <span
                    data-testid="mbox-name"
                    className="truncate"
                    style={title ? undefined : { color: '#9a9aa5', fontWeight: 400 }}
                  >
                    {title || S.previewEmptyName}
                  </span>
                  <span className="ml-auto flex shrink-0 gap-3 opacity-70" aria-hidden>
                    <Icon d={L.icons.skip} />
                    <Icon d={L.icons.close} />
                  </span>
                </div>
                <div
                  data-testid="mbox-text"
                  className="overflow-hidden whitespace-pre-wrap"
                  style={{
                    height: L.bodyHeight,
                    padding: L.bodyPadding,
                    fontSize: L.textSize,
                    lineHeight: L.lineHeight,
                  }}
                >
                  {entry.text}
                </div>
              </div>
            </div>
          </div>
        </Stage>
      ) : (
        <div
          className="flex min-h-28 items-center justify-center rounded-lg border border-border bg-surface-2 px-4 text-center text-sm text-muted"
          data-testid="preview-hint"
        >
          {S.previewHint}
        </div>
      )}
      {entry ? (
        <>
          <p className="m-0 text-xs text-muted" data-testid="preview-info">
            {info}
          </p>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{S.logCaption}</span>
            <div
              className="flex max-w-[380px] gap-2.5 rounded-md px-3 py-2.5"
              style={{ background: 'rgba(44, 44, 44, 0.87)', color: '#ffffff' }}
              data-testid="log-row"
            >
              {src && failed !== src ? (
                <img
                  src={src}
                  alt=""
                  className="block shrink-0 rounded-sm object-cover"
                  style={{
                    width: L.logIconSize,
                    height: L.logIconSize,
                    objectPosition: '50% 0',
                  }}
                  data-testid="log-icon"
                />
              ) : (
                <span
                  className="block shrink-0 rounded-sm"
                  style={{ width: L.logIconSize, height: L.logIconSize, background: '#3a3a3a' }}
                />
              )}
              <span className="min-w-0">
                <span className="block text-xs" style={{ color: '#c7c7cf' }} data-testid="log-name">
                  {title || S.logEmptyName}
                </span>
                <span
                  className="block overflow-hidden text-sm whitespace-pre-wrap"
                  style={{ maxHeight: '3em', lineHeight: 1.5 }}
                >
                  {entry.text}
                </span>
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
