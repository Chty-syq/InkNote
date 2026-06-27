import React from 'react';
import ReactDOM from 'react-dom/client';
import NotesWorkbench from './NotesWorkbench';
import './notebook.css';

interface RootErrorBoundaryState {
  message: string | null;
}

class RootErrorBoundary extends React.Component<React.PropsWithChildren, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    message: null,
  };

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return {
      message: error instanceof Error ? error.message : '应用渲染时发生未知错误。',
    };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.message) {
      return this.props.children;
    }

    return (
      <main className="root-error-screen">
        <section>
          <strong>应用界面渲染失败</strong>
          <p>{this.state.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </section>
      </main>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <NotesWorkbench />
    </RootErrorBoundary>
  </React.StrictMode>,
);
