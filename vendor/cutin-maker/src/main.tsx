import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';

/* 合輯共用的語言切換器。掛在 React 樹之外，因此只在這裡掛載一次。 */
window.I18N?.mountSwitcher(document.getElementById('localeSelect') as HTMLSelectElement | null);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
