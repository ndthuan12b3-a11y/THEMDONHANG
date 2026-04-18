// Patch window.fetch to prevent "Cannot set property fetch of #<Window> which has only a getter"
if (typeof window !== 'undefined') {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (descriptor && !descriptor.set && descriptor.configurable) {
      const originalFetch = window.fetch;
      Object.defineProperty(window, 'fetch', {
        get: () => originalFetch,
        set: (v) => { 
          console.warn('Attempted to overwrite window.fetch with:', v);
          // We don't actually set it, to avoid the error and keep the native fetch
        },
        configurable: true,
        enumerable: true
      });
    }
  } catch (e) {
    // Ignore errors during patching
  }
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
