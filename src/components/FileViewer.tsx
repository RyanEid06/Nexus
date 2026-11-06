import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  Lock,
  Search,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { readProjectFile, type FilePreviewResult, FilePreviewError } from '../services/filePreview';
import { compactBytes } from '../utils/fileTypes';
import { highlightCodeLine, MarkdownRenderer } from '../utils/codeHighlighter';

export function FileViewer() {
  const project = useAppStore((s) => s.project);
  const previewFileId = useAppStore((s) => s.previewFileId);
  const closeFileViewer = useAppStore((s) => s.closeFileViewer);
  const selectNode = useAppStore((s) => s.selectNode);
  const setPage = useAppStore((s) => s.setPage);
  const revealNodeOnMap = useAppStore((s) => s.revealNodeOnMap);

  const [data, setData] = useState<FilePreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'source'>('preview');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Active dependency drawer state (null | 'imports' | 'importedBy')
  const [activeDepDrawer, setActiveDepDrawer] = useState<'imports' | 'importedBy' | null>(null);

  const node = useMemo(() => {
    if (!project || !previewFileId) return null;
    return project.nodes.find((n) => n.id === previewFileId) ?? null;
  }, [project, previewFileId]);

  const isMarkdown = node?.extension?.toLowerCase() === 'md' || node?.name.toLowerCase().endsWith('.md');

  // Compute resolved Imports and Imported By relationships (GEMINI.md Section 15)
  const { importedFiles, importedByFiles } = useMemo(() => {
    if (!project || !node) return { importedFiles: [], importedByFiles: [] };

    const pathToNode = new Map<string, (typeof project.nodes)[0]>();
    for (const n of project.nodes) {
      pathToNode.set(n.path, n);
    }

    const imports: Array<{ node: (typeof project.nodes)[0]; specifier: string }> = [];
    const importedBy: Array<{ node: (typeof project.nodes)[0]; specifier: string }> = [];

    if (project.dependencies?.edges) {
      for (const edge of project.dependencies.edges) {
        if (!edge.isExternal && edge.isResolved) {
          const targetPath = edge.targetResolvedPath ?? edge.targetPath;
          if (edge.sourcePath === node.path) {
            const targetNode = pathToNode.get(targetPath);
            if (targetNode && targetNode.id !== node.id) {
              imports.push({ node: targetNode, specifier: edge.specifier });
            }
          } else if (targetPath === node.path) {
            const sourceNode = pathToNode.get(edge.sourcePath);
            if (sourceNode && sourceNode.id !== node.id) {
              importedBy.push({ node: sourceNode, specifier: edge.specifier });
            }
          }
        }
      }
    }

    return { importedFiles: imports, importedByFiles: importedBy };
  }, [project, node]);

  // Save opener element on mount and restore on unmount (GEMINI.md Section 19)
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      openerRef.current?.focus?.();
    };
  }, []);

  // Initial focus on meaningful control
  useEffect(() => {
    if (previewFileId) {
      setTimeout(() => closeButtonRef.current?.focus(), 50);
    }
  }, [previewFileId]);

  // Load file contents
  useEffect(() => {
    if (!project || !node) return;
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    setActiveDepDrawer(null);

    readProjectFile(project, node)
      .then((res) => {
        if (!active) return;
        setData(res);
        setLoading(false);
        setActiveTab(isMarkdown ? 'preview' : 'source');
      })
      .catch((err) => {
        if (!active) return;
        setLoading(false);
        if (err instanceof FilePreviewError) {
          setError({ message: err.message, code: err.code });
        } else {
          setError({ message: err instanceof Error ? err.message : 'Failed to read file.', code: 'UNKNOWN' });
        }
      });

    return () => {
      active = false;
    };
  }, [project, node, isMarkdown]);

  // Keyboard shortcut listener (Escape to close, Ctrl+F for search, Focus Trap)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeDepDrawer) {
          setActiveDepDrawer(null);
        } else if (isSearchOpen) {
          setIsSearchOpen(false);
        } else {
          closeFileViewer();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === 'Tab' && modalRef.current) {
        // Focus trap inside modal
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSearchOpen, closeFileViewer, activeDepDrawer]);

  // Calculate search matches across lines
  const lines = useMemo(() => (data ? data.content.split('\n') : []), [data]);

  const matchingLineIndices = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const indices: number[] = [];
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes(q)) {
        indices.push(idx);
      }
    });
    return indices;
  }, [lines, searchQuery]);

  // Navigate between search matches
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  const goToNextMatch = () => {
    if (!matchingLineIndices.length) return;
    const nextIdx = (currentMatchIndex + 1) % matchingLineIndices.length;
    setCurrentMatchIndex(nextIdx);
    scrollToLine(matchingLineIndices[nextIdx]);
  };

  const goToPrevMatch = () => {
    if (!matchingLineIndices.length) return;
    const prevIdx = (currentMatchIndex - 1 + matchingLineIndices.length) % matchingLineIndices.length;
    setCurrentMatchIndex(prevIdx);
    scrollToLine(matchingLineIndices[prevIdx]);
  };

  const scrollToLine = (lineIdx: number) => {
    const el = document.getElementById(`line-${lineIdx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleCopy = () => {
    if (!data) return;
    void navigator.clipboard.writeText(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShowOnMap = () => {
    if (!node) return;
    revealNodeOnMap(node.id);
  };

  const handleNavigateToNode = (targetId: string) => {
    useAppStore.getState().openFileViewer(targetId);
  };

    if (!previewFileId || !node) return null;

  return (
    <div className="file-viewer-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeFileViewer(); }}>
      <section
        ref={modalRef}
        className="file-viewer-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${node.name}`}
      >
        {/* Top Header */}
        <header className="file-viewer-header">
          <div className="file-info-group">
            <span className="file-icon-box">
              {isMarkdown ? <FileText size={18} /> : <FileCode2 size={18} />}
            </span>
            <div className="file-names">
              <div className="file-title-row">
                <h2>{node.name}</h2>
                {node.language && <span className="lang-badge">{node.language}</span>}
                <span className="meta-text">{compactBytes(data?.sizeBytes ?? node.sizeBytes)}</span>
                {data && <span className="meta-text">{lines.length.toLocaleString()} lines</span>}
              </div>
              <p className="file-path">{node.path}</p>
            </div>
          </div>

          <div className="file-actions-group">
            {/* Dependency Navigation Shortcuts (GEMINI.md Section 15) */}
            <div className="file-dep-shortcuts">
              <button
                className={`dep-nav-btn ${activeDepDrawer === 'imports' ? 'active' : ''}`}
                title={`View ${importedFiles.length} imports`}
                aria-label={`View ${importedFiles.length} imports`}
                aria-expanded={activeDepDrawer === 'imports'}
                disabled={importedFiles.length === 0}
                onClick={() => setActiveDepDrawer(activeDepDrawer === 'imports' ? null : 'imports')}
              >
                <span>Imports</span>
                <b>{importedFiles.length}</b>
              </button>

              <button
                className={`dep-nav-btn ${activeDepDrawer === 'importedBy' ? 'active' : ''}`}
                title={`View ${importedByFiles.length} files importing this module`}
                aria-label={`View ${importedByFiles.length} files importing this module`}
                aria-expanded={activeDepDrawer === 'importedBy'}
                disabled={importedByFiles.length === 0}
                onClick={() => setActiveDepDrawer(activeDepDrawer === 'importedBy' ? null : 'importedBy')}
              >
                <span>Imported By</span>
                <b>{importedByFiles.length}</b>
              </button>
            </div>

            {isMarkdown && data && (
              <div className="view-toggle-pill">
                <button
                  className={activeTab === 'preview' ? 'active' : ''}
                  onClick={() => setActiveTab('preview')}
                >
                  Preview
                </button>
                <button
                  className={activeTab === 'source' ? 'active' : ''}
                  onClick={() => setActiveTab('source')}
                >
                  Source
                </button>
              </div>
            )}

            {data && activeTab === 'source' && (
              <button
                className={`ghost small ${isSearchOpen ? 'active' : ''}`}
                title="Search in file (Ctrl+F)"
                aria-label="Search in file"
                onClick={() => {
                  setIsSearchOpen(!isSearchOpen);
                  if (!isSearchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
              >
                <Search size={14} />
              </button>
            )}

            {data && (
              <button
                className="ghost small"
                title="Copy contents"
                aria-label="Copy contents"
                onClick={handleCopy}
              >
                {copied ? <Check size={14} className="icon-success" /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}

            <button
              className="ghost small"
              title="Show file location on Map"
              aria-label="Show on Map"
              onClick={handleShowOnMap}
            >
              <ExternalLink size={14} />
              <span>Show on Map</span>
            </button>

            <button
              ref={closeButtonRef}
              className="ghost small close-btn"
              title="Close viewer (Escape)"
              aria-label="Close viewer"
              onClick={closeFileViewer}
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Dependency Navigation Dropdown / Drawer */}
        {activeDepDrawer && (
          <div className="file-dep-drawer" role="region" aria-label="Dependencies list">
            <div className="dep-drawer-header">
              <span>
                {activeDepDrawer === 'imports'
                  ? `Modules imported by ${node.name} (${importedFiles.length})`
                  : `Modules importing ${node.name} (${importedByFiles.length})`}
              </span>
              <button
                className="clear-btn"
                aria-label="Close dependency drawer"
                onClick={() => setActiveDepDrawer(null)}
              >
                <X size={13} />
              </button>
            </div>
            <div className="dep-drawer-list">
              {(activeDepDrawer === 'imports' ? importedFiles : importedByFiles).map((item) => (
                <button
                  key={item.node.id}
                  className="dep-drawer-item"
                  onClick={() => {
                    handleNavigateToNode(item.node.id);
                  }}
                  title={`Open ${item.node.path}`}
                >
                  <FileCode2 size={13} className="dep-file-icon" />
                  <span className="dep-file-name">{item.node.name}</span>
                  <small className="dep-file-path">{item.node.path}</small>
                  {item.specifier && <code className="dep-specifier">{item.specifier}</code>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* In-File Search Bar */}
        {isSearchOpen && activeTab === 'source' && (
          <div className="file-search-bar">
            <Search size={14} className="search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Find in file…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.shiftKey) goToPrevMatch();
                  else goToNextMatch();
                }
              }}
            />
            {searchQuery && (
              <span className="search-count">
                {matchingLineIndices.length > 0
                  ? `${currentMatchIndex + 1} of ${matchingLineIndices.length}`
                  : 'No matches'}
              </span>
            )}
            <button
              disabled={!matchingLineIndices.length}
              onClick={goToPrevMatch}
              title="Previous match (Shift+Enter)"
              aria-label="Previous match"
            >
              <ArrowUp size={13} />
            </button>
            <button
              disabled={!matchingLineIndices.length}
              onClick={goToNextMatch}
              title="Next match (Enter)"
              aria-label="Next match"
            >
              <ArrowDown size={13} />
            </button>
            <button onClick={() => setIsSearchOpen(false)} aria-label="Close search">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="file-viewer-body" ref={codeContainerRef}>
          {loading && (
            <div className="viewer-state-box">
              <div className="spinner" />
              <p>Reading file from local disk…</p>
            </div>
          )}

          {error && (
            <div className="viewer-error-box">
              {error.code === 'SENSITIVE_BLOCKED' ? (
                <>
                  <Lock size={36} className="icon-warning" />
                  <h3>Sensitive File Safeguard</h3>
                  <p>{error.message}</p>
                  <small>NEXUS intentionally refuses to read credential and environment files into memory.</small>
                </>
              ) : (
                <>
                  <AlertTriangle size={36} className="icon-warning" />
                  <h3>Cannot Preview File</h3>
                  <p>{error.message}</p>
                </>
              )}
            </div>
          )}

          {!loading && !error && data && (
            <>
              {isMarkdown && activeTab === 'preview' ? (
                <div className="markdown-container">
                  <MarkdownRenderer content={data.content} />
                </div>
              ) : (
                <div className="code-editor-view">
                  <div className="code-lines">
                    {lines.map((line, idx) => {
                      const isMatch = matchingLineIndices.includes(idx);
                      const isCurrentMatch = matchingLineIndices[currentMatchIndex] === idx;
                      return (
                        <div
                          key={idx}
                          id={`line-${idx}`}
                          className={`code-line-row ${isMatch ? 'match-line' : ''} ${
                            isCurrentMatch ? 'current-match' : ''
                          }`}
                        >
                          <span className="line-num">{idx + 1}</span>
                          <span className="line-content">
                            {highlightCodeLine(line, data.language)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
