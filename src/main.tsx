import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/tokens.css';
import { App } from './App';
import { listenForInstall } from './lib/install';
import { collectGarbage, requestPersistence } from './storage/db';

listenForInstall();
requestPersistence();
// Clean up files left behind by deleted pages from earlier sessions.
collectGarbage().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
