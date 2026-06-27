import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import {
  deserializeProject,
  renderNotebookPages,
  type ProjectData,
} from '@inknote/inknote-core';

interface InkNoteNotebookViewerProps {
  projectPayload: string | null;
  title: string;
  fallback?: ReactNode;
}

interface PreviewPage {
  pageNumber: number;
  dataUrl: string;
}

const NOTEBOOK_WEB_PREVIEW_SCALE = 0.94;

function getSpreadStart(value: number): number {
  return Math.max(0, Math.floor(value / 2) * 2);
}

function clampSpreadStart(value: number, pageCount: number): number {
  const lastSpreadStart = getSpreadStart(Math.max(0, pageCount - 1));
  return Math.max(0, Math.min(lastSpreadStart, getSpreadStart(value)));
}

function parseProject(payload: string | null): ProjectData | null {
  if (!payload) {
    return null;
  }

  try {
    return deserializeProject(payload);
  } catch {
    return null;
  }
}

export function InkNoteNotebookViewer({
  projectPayload,
  title,
  fallback,
}: InkNoteNotebookViewerProps) {
  const [previewPages, setPreviewPages] = useState<PreviewPage[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [spreadStart, setSpreadStart] = useState(0);
  const wheelTurnLockRef = useRef(0);
  const project = useMemo(() => parseProject(projectPayload), [projectPayload]);
  const deferredProject = useDeferredValue(project);
  const currentPages = previewPages.slice(spreadStart, spreadStart + 2);
  const firstPage = currentPages[0] ?? null;
  const secondPage = currentPages[1] ?? null;
  const canGoPrev = spreadStart > 0;
  const canGoNext = spreadStart + 2 < previewPages.length;

  useEffect(() => {
    if (!deferredProject) {
      setPreviewPages([]);
      setRenderError(projectPayload ? 'InkNote project could not be loaded.' : null);
      setIsRendering(false);
      return;
    }

    let cancelled = false;
    setIsRendering(true);

    const timer = window.setTimeout(() => {
      try {
        const pages = renderNotebookPages(deferredProject, NOTEBOOK_WEB_PREVIEW_SCALE).map((canvas, index) => ({
          pageNumber: index + 1,
          dataUrl: canvas.toDataURL('image/png'),
        }));

        if (cancelled) {
          return;
        }

        setPreviewPages(pages);
        setRenderError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPreviewPages([]);
        setRenderError(error instanceof Error ? error.message : 'Failed to render InkNote project.');
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredProject, projectPayload]);

  useEffect(() => {
    setSpreadStart((current) => clampSpreadStart(current, previewPages.length));
  }, [previewPages.length]);

  useEffect(() => {
    setSpreadStart(0);
  }, [projectPayload]);

  const goToPrevSpread = () => {
    setSpreadStart((current) => clampSpreadStart(current - 2, previewPages.length));
  };

  const goToNextSpread = () => {
    setSpreadStart((current) => clampSpreadStart(current + 2, previewPages.length));
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 24) {
      return;
    }

    const now = Date.now();
    if (now - wheelTurnLockRef.current < 360) {
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

  const handleStageClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    if (relativeX < rect.width / 2) {
      goToPrevSpread();
    } else {
      goToNextSpread();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

  const spreadLabel = secondPage
    ? `${firstPage?.pageNumber ?? 1}-${secondPage.pageNumber}`
    : `${firstPage?.pageNumber ?? 1}`;

  if (renderError || !project) {
    return (
      <section className="blog-inknote-viewer blog-inknote-viewer-fallback">
        <div className="blog-inknote-empty">
          <strong>{renderError ?? 'No linked InkNote project.'}</strong>
          <span>{fallback ? 'Showing the entry text instead.' : 'Please check the project file path.'}</span>
        </div>
        {fallback ? <div className="markdown-body blog-inknote-fallback-body">{fallback}</div> : null}
      </section>
    );
  }

  return (
    <section className="blog-inknote-viewer" aria-label={`${title} InkNote preview`}>
      <span className="blog-inknote-page-badge">
        {isRendering ? 'Rendering' : `${spreadLabel} / ${previewPages.length || 1}`}
      </span>

      <div
        className="blog-inknote-stage"
        onWheel={handleWheel}
        onClick={handleStageClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label="InkNote page viewer"
      >
        {firstPage ? (
          <>
            <figure className="blog-inknote-page">
              <img src={firstPage.dataUrl} alt={`${title} page ${firstPage.pageNumber}`} />
            </figure>
            {secondPage ? (
              <figure className="blog-inknote-page">
                <img src={secondPage.dataUrl} alt={`${title} page ${secondPage.pageNumber}`} />
              </figure>
            ) : (
              <figure className="blog-inknote-page blog-inknote-page-blank" aria-hidden="true">
                <span>空白页</span>
              </figure>
            )}
          </>
        ) : (
          <div className="blog-inknote-empty">
            <strong>{isRendering ? 'Rendering notebook...' : 'No pages rendered.'}</strong>
          </div>
        )}
      </div>

      <div className="blog-inknote-controls">
        <button type="button" onClick={goToPrevSpread} disabled={!canGoPrev}>
          上一页
        </button>
        <span>
          第 {spreadLabel} 页 / 共 {previewPages.length || 1} 页
        </span>
        <button type="button" onClick={goToNextSpread} disabled={!canGoNext}>
          下一页
        </button>
      </div>
    </section>
  );
}
