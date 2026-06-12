import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  createDefaultProject,
  deserializeProject,
  exportNotebookPdf,
  exportNotebookStrip,
  getProjectTitle,
  getSelectableParagraphRanges,
  HANDWRITING_OPTIONS,
  type LineLayoutMode,
  type LineLayoutRule,
  loadAutosavedProject,
  type ParagraphRange,
  PAPER_OPTIONS,
  randomSeed,
  renderNotebookPages,
  saveAutosavedProject,
  serializeProject,
  type ProjectData,
} from '@inknote/inknote-core';
import {
  chooseFileToSave,
  chooseProjectToOpen,
  ensureExtension,
  isTauri,
  openTextFileWithBrowser,
  readTextFile,
  saveBlobWithBrowser,
  writeBinaryFile,
  writeTextFile,
} from './lib/platform';
import NotesWorkbench from './NotesWorkbench';

interface PreviewPage {
  pageNumber: number;
  dataUrl: string;
}

interface LineRange {
  startLine: number;
  endLine: number;
}

type ViewMode = 'edit' | 'preview';
type WorkspaceMode = 'content' | 'notebook';

const PREVIEW_SCALE = 0.76;
const LINE_LAYOUT_OPTIONS: Array<{ value: LineLayoutMode; label: string }> = [
  { value: 'left', label: '靠左' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '靠右' },
  { value: 'centerLongest', label: '按最长行居中' },
];

function getLineRangeFromSelection(content: string, selectionStart: number, selectionEnd: number): LineRange {
  const safeStart = Math.max(0, Math.min(selectionStart, content.length));
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, content.length));
  const inclusiveEnd =
    safeEnd > safeStart && content[safeEnd - 1] === '\n' ? Math.max(safeStart, safeEnd - 1) : safeEnd;

  return {
    startLine: content.slice(0, safeStart).split('\n').length,
    endLine: content.slice(0, inclusiveEnd).split('\n').length,
  };
}

function rangesOverlap(left: LineRange, right: LineRange): boolean {
  return left.startLine <= right.endLine && right.startLine <= left.endLine;
}

function formatParagraphRange(range: LineRange): string {
  return range.startLine === range.endLine ? `第 ${range.startLine} 行段落` : `第 ${range.startLine}-${range.endLine} 行段落`;
}

function getSelectionSummary(ranges: ParagraphRange[]): string {
  if (ranges.length === 0) {
    return '先在编辑器中选中文字，程序会自动识别它所属的段落。';
  }

  if (ranges.length === 1) {
    return `当前选中：${formatParagraphRange(ranges[0])}`;
  }

  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  return `当前选中 ${ranges.length} 段：${first.startLine}-${last.endLine} 行`;
}

function getLineLayoutModeLabel(mode: LineLayoutMode): string {
  return LINE_LAYOUT_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toSafeFilename(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').trim();
  return sanitized || '未命名笔记';
}

function mergeRules(rules: LineLayoutRule[]): LineLayoutRule[] {
  const sorted = [...rules].sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
  const merged: LineLayoutRule[] = [];

  for (const rule of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.mode === rule.mode && rule.startLine <= last.endLine + 1) {
      last.endLine = Math.max(last.endLine, rule.endLine);
      continue;
    }

    merged.push({ ...rule });
  }

  return merged;
}

function getSelectedParagraphRanges(content: string, selectionStart: number, selectionEnd: number): ParagraphRange[] {
  const lineRange = getLineRangeFromSelection(content, selectionStart, selectionEnd);
  return getSelectableParagraphRanges(content).filter((range) => rangesOverlap(range, lineRange));
}

function getLastSpreadStart(pageCount: number): number {
  if (pageCount <= 2) {
    return 0;
  }

  return pageCount % 2 === 0 ? pageCount - 2 : pageCount - 1;
}

function clampSpreadStart(value: number, pageCount: number): number {
  const last = getLastSpreadStart(pageCount);
  return Math.max(0, Math.min(last, value));
}

export default function NotebookApp() {
  const [project, setProject] = useState<ProjectData>(() => loadAutosavedProject());
  const [previewPages, setPreviewPages] = useState<PreviewPage[]>([]);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [status, setStatus] = useState('已恢复最近一次自动保存。');
  const [isBusy, setIsBusy] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('content');
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [previewSpreadStart, setPreviewSpreadStart] = useState(0);
  const [selectedParagraphRanges, setSelectedParagraphRanges] = useState<ParagraphRange[]>([]);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const wheelTurnLockRef = useRef(0);
  const deferredProject = useDeferredValue(project);
  const isRendering = deferredProject !== project;
  const title = getProjectTitle(project.content);
  const safeTitle = toSafeFilename(title);
  const activePaper = PAPER_OPTIONS.find((option) => option.value === project.paperStyle);
  const activeHandwriting = HANDWRITING_OPTIONS.find((option) => option.value === project.handwritingStyle);
  const contentLineCount = project.content.replace(/\r/g, '').split('\n').length;
  const visibleRules = project.lineLayoutRules.filter((rule) => rule.startLine <= contentLineCount);
  const currentSpreadPages = previewPages.slice(previewSpreadStart, previewSpreadStart + 2);
  const canGoPrevSpread = previewSpreadStart > 0;
  const canGoNextSpread = previewSpreadStart < getLastSpreadStart(previewPages.length);

  useEffect(() => {
    saveAutosavedProject(project);
  }, [project]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    setSelectedParagraphRanges(getSelectedParagraphRanges(project.content, editor.selectionStart, editor.selectionEnd));
  }, [project.content]);

  useEffect(() => {
    const renderedPages = renderNotebookPages(deferredProject, PREVIEW_SCALE).map((canvas, index) => ({
      pageNumber: index + 1,
      dataUrl: canvas.toDataURL('image/png'),
    }));

    startTransition(() => {
      setPreviewPages(renderedPages);
    });
  }, [deferredProject]);

  useEffect(() => {
    setPreviewSpreadStart((current) => clampSpreadStart(current, previewPages.length));
  }, [previewPages.length]);

  useEffect(() => {
    if (viewMode !== 'preview') {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        setPreviewSpreadStart((current) => clampSpreadStart(current + 2, previewPages.length));
      }

      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setPreviewSpreadStart((current) => clampSpreadStart(current - 2, previewPages.length));
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [previewPages.length, viewMode]);

  const patchProject = (patch: Partial<ProjectData>) => {
    setProject((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
  };

  const resetProject = () => {
    setProject(createDefaultProject());
    setCurrentFilePath(null);
    setPreviewSpreadStart(0);
    setStatus('已创建新的示例笔记。');
  };

  const syncSelectedParagraphs = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    setSelectedParagraphRanges(getSelectedParagraphRanges(project.content, editor.selectionStart, editor.selectionEnd));
  };

  const applyParagraphLayoutRule = (mode: LineLayoutMode) => {
    if (selectedParagraphRanges.length === 0) {
      return;
    }

    const nextRules = mergeRules([
      ...project.lineLayoutRules.filter(
        (rule) => !selectedParagraphRanges.some((range) => rangesOverlap(rule, range)),
      ),
      ...selectedParagraphRanges.map((range) => ({
        startLine: range.startLine,
        endLine: range.endLine,
        mode,
      })),
    ]);

    patchProject({ lineLayoutRules: nextRules });
    setStatus(`已将 ${selectedParagraphRanges.length} 段设置为${getLineLayoutModeLabel(mode)}。`);
  };

  const clearSelectedParagraphLayout = () => {
    if (selectedParagraphRanges.length === 0) {
      return;
    }

    const nextRules = project.lineLayoutRules.filter(
      (rule) => !selectedParagraphRanges.some((range) => rangesOverlap(rule, range)),
    );
    patchProject({ lineLayoutRules: nextRules });
    setStatus(`已清除所选 ${selectedParagraphRanges.length} 段的局部对齐。`);
  };

  const removeLineLayoutRule = (ruleToRemove: LineLayoutRule) => {
    patchProject({
      lineLayoutRules: project.lineLayoutRules.filter(
        (rule) =>
          !(
            rule.startLine === ruleToRemove.startLine &&
            rule.endLine === ruleToRemove.endLine &&
            rule.mode === ruleToRemove.mode
          ),
      ),
    });
    setStatus(`已删除 ${formatParagraphRange(ruleToRemove)} 的局部对齐。`);
  };

  const handleOpenProject = async () => {
    setIsBusy(true);
    try {
      if (isTauri()) {
        const path = await chooseProjectToOpen();
        if (!path) {
          return;
        }

        const contents = await readTextFile(path);
        setProject(deserializeProject(contents));
        setCurrentFilePath(path);
        setPreviewSpreadStart(0);
        setStatus(`已打开项目：${path}`);
        return;
      }

      const contents = await openTextFileWithBrowser();
      if (!contents) {
        return;
      }

      setProject(deserializeProject(contents));
      setCurrentFilePath(null);
      setPreviewSpreadStart(0);
      setStatus('已在浏览器模式下导入项目文件。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '打开项目失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const saveProjectToDisk = async (forceChoosePath = false) => {
    setIsBusy(true);
    try {
      const payload = serializeProject(project);

      if (isTauri()) {
        let path = currentFilePath;
        if (!path || forceChoosePath) {
          const suggested = ensureExtension(`${safeTitle}.inknote`, '.json');
          const selected = await chooseFileToSave(suggested);
          if (!selected) {
            return;
          }
          path = ensureExtension(selected, '.json');
        }

        await writeTextFile(path, payload);
        setCurrentFilePath(path);
        setStatus(`项目已保存到：${path}`);
        return;
      }

      saveBlobWithBrowser(
        new Blob([payload], { type: 'application/json;charset=utf-8' }),
        `${safeTitle}.inknote.json`,
      );
      setStatus('浏览器模式已下载项目文件。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存项目失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const exportPng = async () => {
    setIsBusy(true);
    try {
      const bytes = await exportNotebookStrip(project);
      const filename = `${safeTitle}.png`;

      if (isTauri()) {
        const selected = await chooseFileToSave(filename);
        if (!selected) {
          return;
        }
        await writeBinaryFile(ensureExtension(selected, '.png'), bytes);
        setStatus('PNG 长图已导出。');
        return;
      }

      saveBlobWithBrowser(new Blob([toBlobPart(bytes)], { type: 'image/png' }), filename);
      setStatus('浏览器模式已下载 PNG 长图。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'PNG 导出失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const exportPdf = async () => {
    setIsBusy(true);
    try {
      const bytes = await exportNotebookPdf(project);
      const filename = `${safeTitle}.pdf`;

      if (isTauri()) {
        const selected = await chooseFileToSave(filename);
        if (!selected) {
          return;
        }
        await writeBinaryFile(ensureExtension(selected, '.pdf'), bytes);
        setStatus('PDF 已导出。');
        return;
      }

      saveBlobWithBrowser(new Blob([toBlobPart(bytes)], { type: 'application/pdf' }), filename);
      setStatus('浏览器模式已下载 PDF。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'PDF 导出失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const goToPrevSpread = () => {
    setPreviewSpreadStart((current) => clampSpreadStart(current - 2, previewPages.length));
  };

  const goToNextSpread = () => {
    setPreviewSpreadStart((current) => clampSpreadStart(current + 2, previewPages.length));
  };

  const handlePreviewWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 28) {
      return;
    }

    const now = Date.now();
    if (now - wheelTurnLockRef.current < 260) {
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

  if (workspaceMode === 'content') {
    return <NotesWorkbench onSwitchToNotebook={() => setWorkspaceMode('notebook')} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-intro">
          <p className="eyebrow">InkNote Desktop</p>
          <h1>{title}</h1>
          <p className="subtle">输入中文纯文本，自动生成可翻页的伪手写笔记。</p>
          <div className="topbar-meta">
            <span>{activePaper?.label ?? project.paperStyle}</span>
            <span>{activeHandwriting?.label ?? project.handwritingStyle}</span>
            <span>{`${previewPages.length || 1} 页`}</span>
          </div>
        </div>

        <div className="actions">
          <div className="mode-switch" role="tablist" aria-label="工作台模式">
            <button type="button" onClick={() => setWorkspaceMode('content')}>
              内容库
            </button>
            <button type="button" className="active">
              手写笔记
            </button>
          </div>
          <div className="mode-switch" role="tablist" aria-label="界面模式">
            <button
              type="button"
              className={viewMode === 'edit' ? 'active' : undefined}
              onClick={() => setViewMode('edit')}
            >
              编辑模式
            </button>
            <button
              type="button"
              className={viewMode === 'preview' ? 'active' : undefined}
              onClick={() => setViewMode('preview')}
            >
              预览模式
            </button>
          </div>

          <div className="action-row">
            <button type="button" onClick={resetProject} disabled={isBusy}>
              新建
            </button>
            <button type="button" onClick={handleOpenProject} disabled={isBusy}>
              打开
            </button>
            <button type="button" onClick={() => saveProjectToDisk(false)} disabled={isBusy}>
              保存项目
            </button>
            <button type="button" onClick={() => saveProjectToDisk(true)} disabled={isBusy}>
              另存为
            </button>
            <button type="button" onClick={exportPng} disabled={isBusy}>
              导出 PNG
            </button>
            <button type="button" className="primary" onClick={exportPdf} disabled={isBusy}>
              导出 PDF
            </button>
          </div>
        </div>
      </header>

      {viewMode === 'edit' ? (
        <main className="edit-shell">
          <aside className="sidebar-pane">
            <div className="pane-header pane-header-compact">
              <h2>设置</h2>
            </div>

            <div className="compact-fields">
              <label className="compact-field compact-field-select">
                <span className="compact-field-name">纸张</span>
                <select
                  value={project.paperStyle}
                  onChange={(event) => patchProject({ paperStyle: event.target.value as ProjectData['paperStyle'] })}
                >
                  {PAPER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="compact-field compact-field-select">
                <span className="compact-field-name">笔迹</span>
                <select
                  value={project.handwritingStyle}
                  onChange={(event) =>
                    patchProject({ handwritingStyle: event.target.value as ProjectData['handwritingStyle'] })
                  }
                >
                  {HANDWRITING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="compact-field">
                <span className="compact-field-name">缩进</span>
                <input
                  type="range"
                  min="0"
                  max="6"
                  step="1"
                  value={project.paragraphIndent}
                  onChange={(event) => patchProject({ paragraphIndent: Number(event.target.value) })}
                />
                <span className="compact-field-value">{`${project.paragraphIndent}字`}</span>
              </label>

              <label className="compact-field">
                <span className="compact-field-name">行数</span>
                <input
                  type="range"
                  min="10"
                  max="30"
                  step="1"
                  value={project.linesPerPage}
                  onChange={(event) => patchProject({ linesPerPage: Number(event.target.value) })}
                />
                <span className="compact-field-value">{`${project.linesPerPage}行`}</span>
              </label>

              <label className="compact-field">
                <span className="compact-field-name">字号</span>
                <input
                  type="range"
                  min="24"
                  max="56"
                  step="1"
                  value={project.fontSize}
                  onChange={(event) => patchProject({ fontSize: Number(event.target.value) })}
                />
                <span className="compact-field-value">{`${project.fontSize}px`}</span>
              </label>

              <label className="compact-field">
                <span className="compact-field-name">字间</span>
                <input
                  type="range"
                  min="0"
                  max="16"
                  step="1"
                  value={project.charSpacing}
                  onChange={(event) => patchProject({ charSpacing: Number(event.target.value) })}
                />
                <span className="compact-field-value">{`${project.charSpacing}px`}</span>
              </label>
            </div>

            <div className="seed-row">
              <div>
                <span className="field-label">随机种子</span>
                <strong>{project.seed}</strong>
              </div>
              <button type="button" onClick={() => patchProject({ seed: randomSeed() })}>
                重排
              </button>
            </div>

            <div className="sidebar-divider" />

            <div className="sidebar-section">
              <h3>段落对齐</h3>
              <p className="field-tip">{getSelectionSummary(selectedParagraphRanges)}</p>
              <div className="line-layout-actions">
                {LINE_LAYOUT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => applyParagraphLayoutRule(option.value)}
                    disabled={selectedParagraphRanges.length === 0 || isBusy}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={clearSelectedParagraphLayout}
                disabled={selectedParagraphRanges.length === 0 || isBusy}
              >
                清除选中段落对齐
              </button>
            </div>

            <div className="rule-list">
              {visibleRules.length > 0 ? (
                visibleRules.map((rule) => (
                  <div className="rule-item" key={`${rule.startLine}-${rule.endLine}-${rule.mode}`}>
                    <div>
                      <strong>{formatParagraphRange(rule)}</strong>
                      <p>{getLineLayoutModeLabel(rule.mode)}</p>
                    </div>
                    <button type="button" onClick={() => removeLineLayoutRule(rule)} disabled={isBusy}>
                      删除
                    </button>
                  </div>
                ))
              ) : (
                <p className="field-tip">还没有为任何段落设置局部对齐。</p>
              )}
            </div>

            <div className="sidebar-divider" />

            <div className="status-list">
              <div className="status-row">
                <span>状态</span>
                <p>{status}</p>
              </div>
              <div className="status-row">
                <span>文件</span>
                <p>{currentFilePath ?? '尚未保存到磁盘'}</p>
              </div>
              <div className="status-row">
                <span>预览</span>
                <p>{isRendering ? '正在重新排版…' : '已同步完成'}</p>
              </div>
            </div>
          </aside>

          <section className="editor-pane">
            <div className="pane-header">
              <h2>文本编辑器</h2>
              <span>{project.content.length} 字符</span>
            </div>
            <textarea
              ref={editorRef}
              className="editor"
              value={project.content}
              onChange={(event) => patchProject({ content: event.target.value })}
              onSelect={syncSelectedParagraphs}
              onKeyUp={syncSelectedParagraphs}
              onClick={syncSelectedParagraphs}
              placeholder="在这里输入中文笔记内容..."
              spellCheck={false}
            />
          </section>

          <section className="preview-pane">
            <div className="pane-header">
              <h2>页面预览</h2>
              <span>{isBusy ? '处理中…' : '实时更新'}</span>
            </div>
            <div className="preview-stack">
              {previewPages.map((page) => (
                <figure className="page-card" key={page.pageNumber}>
                  <img src={page.dataUrl} alt={`预览页 ${page.pageNumber}`} />
                  <figcaption>第 {page.pageNumber} 页</figcaption>
                </figure>
              ))}
            </div>
          </section>
        </main>
      ) : (
        <main className="reader-shell">
          <div className="reader-toolbar">
            <div>
              <h2>双页预览</h2>
              <p>可用左右方向键、PageUp/PageDown、空格键、鼠标滚轮或点击左右半边翻页。</p>
            </div>
            <div className="reader-status">
              <span>{`第 ${currentSpreadPages[0]?.pageNumber ?? 1}${currentSpreadPages[1] ? `-${currentSpreadPages[1].pageNumber}` : ''} 页`}</span>
              <span>{`共 ${previewPages.length || 1} 页`}</span>
            </div>
          </div>

          <div className="spread-shell">
            <button type="button" className="spread-nav" onClick={goToPrevSpread} disabled={!canGoPrevSpread}>
              上一组
            </button>

            <div
              className="spread-stage"
              onWheel={handlePreviewWheel}
              onClick={handlePreviewStageClick}
              role="button"
              tabIndex={0}
              aria-label="双页预览翻页区域"
            >
              {currentSpreadPages.length > 0 ? (
                currentSpreadPages.map((page) => (
                  <article className="spread-page" key={page.pageNumber}>
                    <img src={page.dataUrl} alt={`预览页 ${page.pageNumber}`} />
                    <span>{`第 ${page.pageNumber} 页`}</span>
                  </article>
                ))
              ) : (
                <article className="spread-page spread-page-empty">
                  <span>暂无页面</span>
                </article>
              )}

              {currentSpreadPages.length === 1 ? (
                <article className="spread-page spread-page-empty">
                  <span>空白页</span>
                </article>
              ) : null}
            </div>

            <button type="button" className="spread-nav" onClick={goToNextSpread} disabled={!canGoNextSpread}>
              下一组
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
