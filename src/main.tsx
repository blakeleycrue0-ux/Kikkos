import '@fontsource-variable/outfit';
import '@fontsource-variable/plus-jakarta-sans';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/motion.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
