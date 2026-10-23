/**
 * 遊玩畫面的外殼：把引擎（engine.ts 的 mountClueMap，和互動 HTML 裡的是同一份）掛在一個元素上，並放進樣式（markup.ts）。
 * 設定一變就重新掛載；進度（找到的、顯示所有熱點、翻開的線索卡）由呼叫端放在工具的狀態裡帶回去（試玩）。
 */
import { useEffect, useMemo, useRef } from 'react';
import { type ClueMapConfig, type ClueMapHooks, mountClueMap } from './engine';
import { widgetId } from './exportHtml';
import { clueMapCss } from './markup';

export function PlayView({
  config,
  hooks,
  testId = 'play-host',
}: {
  config: ClueMapConfig;
  hooks?: ClueMapHooks;
  testId?: string;
}) {
  const id = useMemo(() => widgetId(), []);
  const css = useMemo(() => clueMapCss(`#${id}`), [id]);
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(hooks);
  latest.current = hooks;
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const handle = mountClueMap(root, config, {
      onChange: (s) => latest.current?.onChange?.(s),
    });
    return () => handle.destroy();
  }, [config]);
  return (
    <>
      <style>{css}</style>
      <div id={id} ref={ref} data-testid={testId} />
    </>
  );
}
