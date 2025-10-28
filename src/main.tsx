import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ensurePromiseWithResolvers } from './utils/ensurePromiseWithResolvers';

// Polyfill pour Promise.withResolvers (nécessaire pour pdf.js sur iOS Safari)
ensurePromiseWithResolvers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
