import '@/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PlayerApp } from './PlayerApp';

/* `#player`：玩家視圖（另開的視窗，只顯示 GM 分頁送來的內容） */
const player = location.hash === '#player';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{player ? <PlayerApp /> : <App />}</StrictMode>,
);
