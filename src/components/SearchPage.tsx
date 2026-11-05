import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  FileCode2,
  Folder,
  Network,
  Search,
  ExternalLink,
  Layers,
  ArrowRight,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { FileViewer } from './FileViewer';
import type { ProjectNode } from '../domain/models';

function subsequenceMatch(text: string, query: string): boolean {
  let qIdx = 0;
  for (let tIdx = 0; tIdx < text.length && qIdx < query.length; tIdx += 1) {
    if (text[tIdx].toLowerCase() === query[qIdx].toLowerCase()) {
      qIdx += 1;
    }
  }
  return qIdx === query.length;
}

export function rankNode(name: string, path: string, query: string): number {
  const n = name.toLowerCase();
  const p = path.toLowerCase();
  const q = query.toLowerCase();

  if (n === q) return 0; // Exact name match
  if (n.startsWith(q)) return 1; // Prefix match in name
  if (n.includes(q)) return 2; // Substring match in name
  if (subsequenceMatch(n, q)) return 3; // Subsequence / fuzzy in name
  if (p === q || p.startsWith(q)) return 4; // Path prefix
  if (p.includes(q)) return 5; // Path substring
  if (subsequenceMatch(p, q)) return 6; // Subsequence in path
  return 99;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;

  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {
    return <span>{text}</span>;
  }

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return (
    <span>
      {before}
      <mark className="search-match">{match}</mark>
      {after}
    </span>
  );
}

export function SearchPage() {
  const [q, setQ] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const project = useAppStore((s) => s.project);
  const selectNode = useAppStore((s) => s.selectNode);
  const setPage = useAppStore((s) => s.setPage);
  const openFileViewer = useAppStore((s) => s.openFileViewer);
  const expandNode = useAppStore((s) => s.expandNode);

  const inputRef = useRef<HTMLInputElement>(null);
  const query = q.trim();

  const results = useMemo(() => {
    if (!project || !query) return [];
    return project.nodes
      .map((node) => ({ node, score: rankNode(node.name, node.path, query) }))
      .filter((item) => item.score < 99)
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.node.path.localeCompare(b.node.path);
      })
      .slice(0, 60)
      .map((item) => item.node);
  }, [project, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  const handleActivateNode = (node: ProjectNode) => {
    selectNode(node.id);
    if (node.kind === 'file') {
      openFileViewer(node.id);
    } else {
      expandNode(node.id);
      setPage('graph');
    }
  };

  const handleShowOnMap = (e: React.MouseEvent, node: ProjectNode) => {
    e.stopPropagation();
    selectNode(node.id);
    expandNode(node.id);
    setPage('graph');
  };

  const handleViewInStructure = (e: React.MouseEvent, node: ProjectNode) => {
    e.stopPropagation();
    selectNode(node.id);
    expandNode(node.id);
    setPage('structure');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(results.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = results[activeIndex];
      if (current) handleActivateNode(current);
    } else if (e.key === 'Escape') {
      setQ('');
    }
  };

  if (!project) return null;

  return (
    <main className="page search-page">
      <div className="page-title">
        <div>
          <p>SEARCH</p>
          <h1>Find anything</h1>
          <span>Fuzzy search across indexed filenames, directories, and relative paths.</span>
        </div>
      </div>

      <div className="big-search">
        <Search size={18} />
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search files, folders, or paths (↑↓ to navigate, Enter to open)…"
          aria-label="Search project files"
        />
        {q && (
          <button className="clear-btn" onClick={() => setQ('')} aria-label="Clear query">
            <X size={15} />
          </button>
        )}
      </div>

      {!query ? (
        <section className="panel empty-state">
          <h2>Search your project</h2>
          <p>Type a filename, folder name, or relative path. Matching occurs entirely on your machine.</p>
        </section>
      ) : (
        <section className="panel search-results-container" role="listbox">
          {results.map((node, index) => {
            const isSelected = index === activeIndex;
            const isFile = node.kind === 'file';
            const isDir = node.kind === 'directory';

            return (
              <div
                key={node.id}
                role="option"
                aria-selected={isSelected}
                className={`search-result-row ${isSelected ? 'active' : ''}`}
                onClick={() => handleActivateNode(node)}
              >
                <div className="result-main-col">
                  <span className="result-icon">
                    {node.kind === 'project' ? (
                      <Network size={16} />
                    ) : isDir ? (
                      <Folder size={16} />
                    ) : (
                      <FileCode2 size={16} />
                    )}
                  </span>
                  <div className="result-text">
                    <b>
                      <HighlightedText text={node.name} query={query} />
                    </b>
                    <span className="result-path">
                      <HighlightedText text={node.path} query={query} />
                    </span>
                  </div>
                </div>

                <div className="result-meta-col">
                  <span className={`badge ${node.kind}`}>{node.kind}</span>
                  {node.loc > 0 && <span className="meta-loc">{node.loc.toLocaleString()} loc</span>}
                </div>

                <div className="result-actions-col">
                  {isFile ? (
                    <button
                      className="result-action-btn primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectNode(node.id);
                        openFileViewer(node.id);
                      }}
                      title="Open file viewer"
                    >
                      <ArrowRight size={13} />
                      <span>Open</span>
                    </button>
                  ) : null}

                  <button
                    className="result-action-btn"
                    onClick={(e) => handleShowOnMap(e, node)}
                    title="Show on Map"
                  >
                    <ExternalLink size={13} />
                    <span>Map</span>
                  </button>

                  <button
                    className="result-action-btn"
                    onClick={(e) => handleViewInStructure(e, node)}
                    title="View in Structure"
                  >
                    <Layers size={13} />
                    <span>Tree</span>
                  </button>
                </div>
              </div>
            );
          })}

          {results.length === 0 && (
            <div className="empty-result">No indexed paths match “{q}”.</div>
          )}
        </section>
      )}

      {/* Real File Viewer Modal */}
      <FileViewer />
    </main>
  );
}
