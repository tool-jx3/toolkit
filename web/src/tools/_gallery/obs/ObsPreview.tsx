/**
 * 「OBS 疊加」分頁的預覽欄：CssPreviewFrame（模擬頁＋示範 CSS）＋CssExportPanel。
 */
import { useMemo } from 'react';
import { characterUrlFrom, chatUrlFrom, roomUrlFrom } from '@/ccfolia';
import { CssExportPanel, CssPreviewFrame } from '@/ui';
import { characterDemoCss, chatDemoCss, roomDemoCss, streamkitDemoCss } from './demoCss';
import {
  characterScene,
  chatScene,
  roomScene,
  SCENE_SIZES,
  STREAMKIT_USERS,
  streamkitScene,
  TACHIE,
} from './scenes';
import { useMeasured, useObsPreview, useObsSettings } from './store';

/** 測試用：網址加 ?pause=毫秒 時，預覽裡的動畫停在那個時間點 */
const PAUSE_AT = (() => {
  const v = new URLSearchParams(window.location.search).get('pause');
  return v === null ? null : Number(v);
})();

const SCENES = {
  character: characterScene,
  room: roomScene,
  chat: chatScene,
  streamkit: streamkitScene,
};

export function ObsPreview() {
  const s = useObsSettings((st) => st.data);
  const p = useObsPreview((st) => st.data);
  const setPreview = useObsPreview((st) => st.patch);
  const measured = useMeasured((st) => st.size);

  const url =
    p.scene === 'character'
      ? characterUrlFrom('CHAR0001', s.room)
      : p.scene === 'room'
        ? roomUrlFrom(s.room)
        : p.scene === 'chat'
          ? chatUrlFrom(s.room)
          : null;

  const css = useMemo(() => {
    switch (p.scene) {
      case 'character':
        return characterDemoCss({
          color: s.color,
          font: s.font,
          outline: s.outline,
          threshold: s.threshold,
          url,
        });
      case 'room':
        return roomDemoCss({ paper: s.paper, brackets: s.brackets, buttons: s.buttons, url });
      case 'chat':
        return chatDemoCss({ count: s.count, diceOnly: s.diceOnly, url });
      default: {
        const user = STREAMKIT_USERS.find((u) => u.id === s.tachieUser) ?? STREAMKIT_USERS[0];
        return streamkitDemoCss(
          {
            userId: user.id,
            name: user.name,
            anchor: s.anchor,
            bounce: s.bounce,
            dim: s.dim,
            hideWhenAway: s.hideWhenAway,
          },
          TACHIE,
        );
      }
    }
  }, [p.scene, s, url]);

  const size = p.scene === 'character' ? (measured ?? SCENE_SIZES.character) : SCENE_SIZES[p.scene];

  return (
    <>
      <CssPreviewFrame
        key={p.scene}
        width={size.width}
        height={size.height}
        css={css}
        scene={SCENES[p.scene]}
        maxScale={p.scene === 'character' ? 2 : 1}
        maxHeight={p.scene === 'chat' ? 620 : 560}
        background={p.background}
        onBackgroundChange={(background) => setPreview({ background })}
        backgrounds={['checker', 'dark', 'light', 'scene', 'color']}
        showBefore={p.before}
        onShowBeforeChange={(before) => setPreview({ before })}
        hover={p.hover}
        onHoverChange={(hover) => setPreview({ hover })}
        pointer={p.scene === 'chat' || p.scene === 'room' ? 'hover' : 'none'}
        onMeasure={p.scene === 'character' ? (sz) => useMeasured.setState({ size: sz }) : undefined}
        measureViewport={p.scene === 'character' ? { width: 1200, height: 900 } : undefined}
        sizeNote={p.scene === 'character' ? '依模擬頁量出來的大小' : undefined}
        label="OBS 預覽"
        pauseAt={PAUSE_AT}
      />
      <CssExportPanel
        css={css}
        fileName={`${s.fileName}_${p.scene}`}
        copiedMessage={`已複製 CSS，請貼到寬 ${size.width} × 高 ${size.height} 的瀏覽器來源的「自訂 CSS」欄。`}
      />
    </>
  );
}
