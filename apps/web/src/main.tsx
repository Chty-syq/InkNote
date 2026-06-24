import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeRuntimeContent } from './lib/content';
import './site-modern.css';

async function bootstrap() {
  try {
    await initializeRuntimeContent();
  } catch (error) {
    console.error(error);
  }

  const { default: SiteApp } = await import('./SiteAppWide');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <SiteApp />
    </React.StrictMode>,
  );
}

void bootstrap();
