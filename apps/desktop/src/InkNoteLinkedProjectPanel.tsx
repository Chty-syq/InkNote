import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  renderNotebookPages,
  type ProjectData,
} from '@inknote/inknote-core';

interface InkNoteProjectPanelProps {
  project: ProjectData | null;
  projectPath: string | null;
  status: string;
}
interface PreviewPage {
  pageNumber: number;
  dataUrl: string;
}

const NOTEBOOK_PREVIEW_SCALE = 0.92;

function getProjectPathLabel(projectPath: string | null): string {
  return projectPath ? `content/${projectPath}` : 'No linked notebook file yet.';
}

function getLastSpreadStart(pageCount: number): number {
  return Math.max(0, pageCount - 1);
}

function clampSpreadStart(value: number, pageCount: number): number {
  return Math.max(0, Math.min(getLastSpreadStart(pageCount), value));
}

export function InkNoteProjectPreviewPanel({
  project,
  projectPath,
  status,
  embedded = false,
}: Pick<InkNoteProjectPanelProps, 'project' | 'projectPath' | 'status'> & { embedded?: boolean }) {
  const [previewPages, setPreviewPages] = useState<PreviewPage[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRenderPending, setIsRenderPending] = useState(false);
  const [previewSpreadStart, setPreviewSpreadStart] = useState(0);
  const wheelTurnLockRef = useRef(0);
  const deferredProject = useDeferredValue(project);
  const currentSpreadPages = previewPages.slice(previewSpreadStart, previewSpreadStart + 1);
  const canGoPrevSpread = previewSpreadStart > 0;
  const canGoNextSpread = previewSpreadStart < getLastSpreadStart(previewPages.length);

  useEffect(() => {
    if (!deferredProject) {
      setPreviewPages([]);
      setRenderError(null);
      setIsRenderPending(false);
      return;
    }

    let cancelled = false;
    setIsRenderPending(true);

    const timeout = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      try {
        const renderedPages = renderNotebookPages(deferredProject, NOTEBOOK_PREVIEW_SCALE).map((canvas, index) => ({
          pageNumber: index + 1,
          dataUrl: canvas.toDataURL('image/png'),
        }));

        if (cancelled) {
          return;
        }

        setPreviewPages(renderedPages);
        setRenderError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPreviewPages([]);
        setRenderError(error instanceof Error ? error.message : 'Failed to render notebook preview.');
      } finally {
        if (!cancelled) {
          setIsRenderPending(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [deferredProject]);

  useEffect(() => {
    setPreviewSpreadStart((current) => clampSpreadStart(current, previewPages.length));
  }, [previewPages.length]);

  const goToPrevSpread = () => {
    setPreviewSpreadStart((current) => clampSpreadStart(current - 1, previewPages.length));
  };

  const goToNextSpread = () => {
    setPreviewSpreadStart((current) => clampSpreadStart(current + 1, previewPages.length));
  };

  const handlePreviewWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 28) {
      return;
    }

    const now = Date.now();
    if (now - wheelTurnLockRef.current < 420) {
      event.preventDefault();
      return;
    }

    wheelTurnLockRef.current = now;
    event.preventDefault();
    if (delta > 0) {
      goToNextSpread();
    } else {
      goToPrevSpread();
    }
  };

  const handlePreviewStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;

    if (relativeX < rect.width / 2) {
      goToPrevSpread();
    } else {
      goToNextSpread();
    }
  };

  const handlePreviewKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      goToNextSpread();
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      goToPrevSpread();
    }
  };

  if (!project) {
    if (embedded) {
      return (
        <div className="linked-inknote-preview-embedded">
          <div className="content-empty">
            <p>{status || 'No linked notebook project loaded.'}</p>
          </div>
        </div>
      );
    }

    return (
      <section className="linked-inknote-card linked-inknote-preview-card">
        <div className="linked-inknote-header">
          <div>
            <h3>Notebook Preview</h3>
            <p>{status || 'No linked notebook project loaded.'}</p>
          </div>
        </div>
      </section>
    );
  }

  const statusText = isRenderPending
    ? 'Rendering...'
    : renderError
      ? 'Preview error'
      : `第 ${currentSpreadPages[0]?.pageNumber ?? 1} / ${previewPages.length || 1} 页`;

  if (embedded) {
    return (
      <div className="linked-inknote-preview-embedded">
        <span className="linked-inknote-preview-badge">{statusText}</span>
        {renderError ? (
          <div className="content-empty">
            <p>{renderError}</p>
          </div>
        ) : (
          <div className="linked-inknote-spread-shell">
            <button type="button" className="spread-nav" onClick={goToPrevSpread} disabled={!canGoPrevSpread}>
              上一页
            </button>

            <div
              className="spread-stage linked-inknote-spread-stage"
              onWheel={handlePreviewWheel}
              onClick={handlePreviewStageClick}
              onKeyDown={handlePreviewKeyDown}
              role="button"
              tabIndex={0}
              aria-label="双页手写本预览翻页区域"
            >
              {currentSpreadPages.length > 0 ? (
                currentSpreadPages.map((page) => (
                  <article className="spread-page" key={page.pageNumber}>
                    <img src={page.dataUrl} alt={`Notebook preview page ${page.pageNumber}`} />
                    <span>{`第 ${page.pageNumber} 页`}</span>
                  </article>
                ))
              ) : (
                <article className="spread-page spread-page-empty">
                  <span>{status || 'Rendering notebook preview...'}</span>
                </article>
              )}

              {currentSpreadPages.length === 1 ? (
                <article className="spread-page spread-page-empty">
                  <span>空白页</span>
                </article>
              ) : null}
            </div>

            <button type="button" className="spread-nav" onClick={goToNextSpread} disabled={!canGoNextSpread}>
              下一页
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="linked-inknote-card linked-inknote-preview-card">
      <div className="linked-inknote-header">
        <div>
          <h3>Notebook Preview</h3>
          <p>{getProjectPathLabel(projectPath)}</p>
        </div>
        <span>
          {isRenderPending
              ? 'Rendering...'
              : renderError
                ? 'Preview error'
                : `第 ${currentSpreadPages[0]?.pageNumber ?? 1} / ${previewPages.length || 1} 页`}
        </span>
      </div>

      {renderError ? (
        <div className="content-empty">
          <p>{renderError}</p>
        </div>
      ) : (
        <div className="linked-inknote-spread-shell">
          <button type="button" className="spread-nav" onClick={goToPrevSpread} disabled={!canGoPrevSpread}>
            上一页
          </button>

          <div
            className="spread-stage linked-inknote-spread-stage"
            onWheel={handlePreviewWheel}
            onClick={handlePreviewStageClick}
            onKeyDown={handlePreviewKeyDown}
            role="button"
            tabIndex={0}
            aria-label="双页手写本预览翻页区域"
          >
            {currentSpreadPages.length > 0 ? (
              currentSpreadPages.map((page) => (
                <article className="spread-page" key={page.pageNumber}>
                  <img src={page.dataUrl} alt={`Notebook preview page ${page.pageNumber}`} />
                  <span>{`第 ${page.pageNumber} 页`}</span>
                </article>
              ))
            ) : (
              <article className="spread-page spread-page-empty">
                <span>{status || 'Rendering notebook preview...'}</span>
              </article>
            )}

            {currentSpreadPages.length === 1 ? (
              <article className="spread-page spread-page-empty">
                <span>空白页</span>
              </article>
            ) : null}
          </div>

          <button type="button" className="spread-nav" onClick={goToNextSpread} disabled={!canGoNextSpread}>
            下一页
          </button>
        </div>
      )}
    </section>
  );
}
