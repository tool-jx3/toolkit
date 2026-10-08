import '@/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { UiProvider } from '@/ui';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UiProvider>
      <App />
    </UiProvider>
  </StrictMode>,
);
