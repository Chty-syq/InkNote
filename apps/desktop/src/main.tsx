import React from 'react';
import ReactDOM from 'react-dom/client';
import NotebookApp from './NotebookApp';
import './notebook.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NotebookApp />
  </React.StrictMode>,
);
