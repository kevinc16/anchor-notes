import React from 'react';
import { watchTheme } from '@/lib/browser-theme';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@/styles/app.css';

watchTheme((theme) => {
  document.documentElement.dataset.anchorTheme = theme;
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
