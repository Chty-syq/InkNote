import { useDeferredValue, useEffect, useState } from 'react';
import {
  HANDWRITING_OPTIONS,
  PAPER_OPTIONS,
  randomSeed,
  renderNotebookPages,
  type ProjectData,
} from '@inknote/inknote-core';

interface InkNoteProjectPanelProps {
  project: ProjectData | null;
  projectPath: string | null;
  status: string;
  isLoading?: boolean;
  onChange?: (nextProject: ProjectData) => void;
}

interface PreviewPage {
  pageNumber: number;
  dataUrl: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function patchProject(current: ProjectData, patch: Partial<ProjectData>): ProjectData {
  return {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function getProjectPathLabel(projectPath: string | null): string {
  return projectPath ? `content/${projectPath}` : 'No linked notebook file yet.';
}

export function InkNoteProjectEditorPanel({
  project,
  projectPath,
  status,
  isLoading = false,
  onChange,
}: InkNoteProjectPanelProps) {
  if (!project || !onChange) {
    return (
      <section className="linked-inknote-card">
        <div className="linked-inknote-header">
          <div>
            <h3>Notebook Project</h3>
            <p>{status || 'Create or load a linked notebook project to start editing.'}</p>
          </div>
        </div>
      </section>
    );
  }

  const updateProject = (patch: Partial<ProjectData>) => {
    onChange(patchProject(project, patch));
  };

  return (
    <section className="linked-inknote-card">
      <div className="linked-inknote-header">
        <div>
          <h3>Notebook Project</h3>
          <p>{getProjectPathLabel(projectPath)}</p>
        </div>
        <span>{isLoading ? 'Loading...' : status || 'Ready'}</span>
      </div>

      <div className="linked-inknote-grid">
        <label className="content-field">
          <span>Paper</span>
          <select
            value={project.paperStyle}
            onChange={(event) => updateProject({ paperStyle: event.target.value as ProjectData['paperStyle'] })}
          >
            {PAPER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="content-field">
          <span>Handwriting</span>
          <select
            value={project.handwritingStyle}
            onChange={(event) =>
              updateProject({ handwritingStyle: event.target.value as ProjectData['handwritingStyle'] })
            }
          >
            {HANDWRITING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="content-field">
          <span>Paragraph Indent</span>
          <input
            type="range"
            min="0"
            max="6"
            step="1"
            value={project.paragraphIndent}
            onChange={(event) => updateProject({ paragraphIndent: Number(event.target.value) })}
          />
        </label>

        <label className="content-field">
          <span>Lines Per Page</span>
          <input
            type="range"
            min="10"
            max="30"
            step="1"
            value={project.linesPerPage}
            onChange={(event) => updateProject({ linesPerPage: clamp(Number(event.target.value), 10, 30) })}
          />
        </label>

        <label className="content-field">
          <span>Font Size</span>
          <input
            type="range"
            min="24"
            max="56"
            step="1"
            value={project.fontSize}
            onChange={(event) => updateProject({ fontSize: clamp(Number(event.target.value), 24, 56) })}
          />
        </label>

        <label className="content-field">
          <span>Character Spacing</span>
          <input
            type="range"
            min="0"
            max="16"
            step="1"
            value={project.charSpacing}
            onChange={(event) => updateProject({ charSpacing: clamp(Number(event.target.value), 0, 16) })}
          />
        </label>
      </div>

      <div className="linked-inknote-seed">
        <div>
          <span className="field-label">Seed</span>
          <strong>{project.seed}</strong>
        </div>
        <button type="button" onClick={() => updateProject({ seed: randomSeed() })}>
          Reroll
        </button>
      </div>

      <label className="content-body-field">
        <span>Notebook Content</span>
        <textarea
          className="markdown-editor linked-inknote-editor"
          value={project.content}
          onChange={(event) => updateProject({ content: event.target.value })}
          placeholder="Edit the linked notebook.inknote.json content here..."
          spellCheck={false}
        />
      </label>
    </section>
  );
}

export function InkNoteProjectPreviewPanel({
  project,
  projectPath,
  status,
}: Pick<InkNoteProjectPanelProps, 'project' | 'projectPath' | 'status'>) {
  const [previewPages, setPreviewPages] = useState<PreviewPage[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const deferredProject = useDeferredValue(project);

  useEffect(() => {
    if (!deferredProject) {
      setPreviewPages([]);
      setRenderError(null);
      return;
    }

    try {
      const renderedPages = renderNotebookPages(deferredProject, 0.42).map((canvas, index) => ({
        pageNumber: index + 1,
        dataUrl: canvas.toDataURL('image/png'),
      }));
      setPreviewPages(renderedPages);
      setRenderError(null);
    } catch (error) {
      setPreviewPages([]);
      setRenderError(error instanceof Error ? error.message : 'Failed to render notebook preview.');
    }
  }, [deferredProject]);

  if (!project) {
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

  return (
    <section className="linked-inknote-card linked-inknote-preview-card">
      <div className="linked-inknote-header">
        <div>
          <h3>Notebook Preview</h3>
          <p>{getProjectPathLabel(projectPath)}</p>
        </div>
        <span>{renderError ? 'Preview error' : `${previewPages.length || 1} page(s)`}</span>
      </div>

      {renderError ? (
        <div className="content-empty">
          <p>{renderError}</p>
        </div>
      ) : (
        <div className="linked-inknote-preview-stack">
          {previewPages.length > 0 ? (
            previewPages.map((page) => (
              <figure className="page-card" key={page.pageNumber}>
                <img src={page.dataUrl} alt={`Notebook preview page ${page.pageNumber}`} />
                <figcaption>{`Page ${page.pageNumber}`}</figcaption>
              </figure>
            ))
          ) : (
            <div className="content-empty">
              <p>{status || 'Rendering notebook preview...'}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
