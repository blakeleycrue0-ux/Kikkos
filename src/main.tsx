import '@fontsource-variable/outfit';
import '@fontsource-variable/plus-jakarta-sans';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/motion.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import { initBackend } from './backend';
import { initUpdates } from './lib/updates';

// Decide demo vs online before the first render (cached after the first launch).
void initBackend().finally(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
});

if (import.meta.env.PROD) initUpdates();
