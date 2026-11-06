import '@/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyCrFromUrl } from './store';
import { readCrFromUrl } from './url';

/* 網址的 ?cr=：在第一次畫面之前套用（F22） */
applyCrFromUrl(readCrFromUrl());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
