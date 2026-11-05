import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  Network,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import type { ProjectNode } from '../domain/models';
import { useAppStore } from '../store/useAppStore';
import { compactBytes } from '../utils/fileTypes';
import { Inspector } from './Inspector';
import { WorkspaceTabs } from './WorkspaceTabs';

const ROW_HEIGHT = 38;
const OVERSCAN = 10;

export function StructurePage() {
  const project = useAppStore((s) => s.project);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  const selectNode = useAppStore((s) => s.selectNode);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  // Set of collapsed directory IDs.
  // By default, directories at depth >= 2 start collapsed.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    const collapsed = new Set<string>();
    if (project) {
      for (const node of project.nodes) {
        if (node.kind === 'directory' && node.depth >= 2) {
          collapsed.add(node.id);
        }
      }
    }
    return collapsed;
  });

  // Fast lookups
  const { nodeById, childrenByParent } = useMemo(() => {
    const byId = new Map<string, ProjectNode>();
    const byParent = new Map<string, ProjectNode[]>();

    if (project) {
      for (const node of project.nodes) {
        byId.set(node.id, node);
        const parentKey = node.parentId ?? '';
        const list = byParent.get(parentKey) ?? [];
        list.push(node);
        byParent.set(parentKey, list);
      }
      // Sort children: directories first, then alphabetical
      for (const list of byParent.values()) {
        list.sort((a, b) => {
          if (a.kind !== b.kind) {
            return a.kind === 'directory' || a.kind === 'project' ? -1 : 1;
          }
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });
      }
    }
    return { nodeById: byId, childrenByParent: byParent };
  }, [project]);

  // Ensure all ancestors of selectedId are expanded so the selected node is visible
  useEffect(() => {
    if (!selectedId || !project) return;
    const toExpand = new Set<string>();
    let current = nodeById.get(selectedId);
    while (current?.parentId) {
      toExpand.add(current.parentId);
      current = nodeById.get(current.parentId);
    }
    if (toExpand.size > 0) {
      setCollapsedIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of toExpand) {
          if (next.has(id)) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [selectedId, project, nodeById]);

  // Container resize listener
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const toggleDirectory = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    if (!project) return;
    const collapsed = new Set<string>();
    for (const node of project.nodes) {
      if (node.kind === 'directory') {
        collapsed.add(node.id);
      }
    }
    setCollapsedIds(collapsed);
  }, [project]);

  // Flatten visible nodes according to current collapsed state
  const visibleRows = useMemo(() => {
    if (!project) return [];
    const rows: ProjectNode[] = [];
    const rootNodes = childrenByParent.get('') ?? [];

    function traverse(nodes: ProjectNode[]) {
      for (const node of nodes) {
        rows.push(node);
        if (node.kind === 'project' || (node.kind === 'directory' && !collapsedIds.has(node.id))) {
          const children = childrenByParent.get(node.id);
          if (children) traverse(children);
        }
      }
    }

    traverse(rootNodes);
    return rows;
  }, [project, childrenByParent, collapsedIds]);

  // Scroll handler for virtualization
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Keyboard navigation
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!visibleRows.length) return;
      const currentIndex = visibleRows.findIndex((r) => r.id === selectedId);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = Math.min(visibleRows.length - 1, currentIndex + 1);
        selectNode(visibleRows[nextIndex].id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = Math.max(0, currentIndex - 1);
        selectNode(visibleRows[prevIndex].id);
      } else if (e.key === 'ArrowRight') {
        if (currentIndex >= 0) {
          const node = visibleRows[currentIndex];
          if ((node.kind === 'directory' || node.kind === 'project') && collapsedIds.has(node.id)) {
            e.preventDefault();
            toggleDirectory(node.id);
          }
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex >= 0) {
          const node = visibleRows[currentIndex];
          if ((node.kind === 'directory' || node.kind === 'project') && !collapsedIds.has(node.id)) {
            e.preventDefault();
            toggleDirectory(node.id);
          } else if (node.parentId) {
            e.preventDefault();
            selectNode(node.parentId);
          }
        }
      }
    },
    [visibleRows, selectedId, collapsedIds, selectNode, toggleDirectory]
  );

  if (!project) return null;

  // Virtual slice calculation
  const totalCount = visibleRows.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(totalCount, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
  const slice = visibleRows.slice(startIndex, endIndex);
  const topPadding = startIndex * ROW_HEIGHT;
  const bottomPadding = Math.max(0, (totalCount - endIndex) * ROW_HEIGHT);

  return (
    <main className="workspace">
      <section className="workspace-main" onKeyDown={onKeyDown} tabIndex={0}>
        <WorkspaceTabs />

        {/* Structure View Controls Bar */}
        <div className="structure-header">
          <div className="tree-controls">
            <span>NAME ({totalCount.toLocaleString()} items)</span>
            <button
              className="tree-btn"
              onClick={expandAll}
              title="Expand all folders"
              aria-label="Expand all folders"
            >
              <ChevronsUpDown size={12} /> Expand
            </button>
            <button
              className="tree-btn"
              onClick={collapseAll}
              title="Collapse all folders"
              aria-label="Collapse all folders"
            >
              <ChevronsDownUp size={12} /> Collapse
            </button>
          </div>
          <span>LINES</span>
          <span>SIZE</span>
        </div>

        {/* Windowed Virtual Tree View */}
        <div
          ref={containerRef}
          className="structure-view"
          onScroll={onScroll}
          role="tree"
          aria-label="Project Structure"
        >
          {topPadding > 0 && <div style={{ height: `${topPadding}px` }} />}

          {slice.map((node) => {
            const isDir = node.kind === 'directory';
            const isProj = node.kind === 'project';
            const isCollapsed = collapsedIds.has(node.id);
            const isSelected = node.id === selectedId;

            return (
              <button
                key={node.id}
                role="treeitem"
                aria-selected={isSelected}
                aria-expanded={isDir ? !isCollapsed : undefined}
                className={isSelected ? 'selected' : ''}
                style={{ height: `${ROW_HEIGHT}px` }}
                onClick={() => {
                  if (isDir) {
                    toggleDirectory(node.id);
                  }
                  selectNode(node.id);
                }}
              >
                <span
                  className="structure-name"
                  style={{ paddingLeft: `${Math.min(node.depth, 14) * 16 + 8}px` }}
                >
                  {isDir ? (
                    <span
                      className="expander-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDirectory(node.id);
                      }}
                      title={isCollapsed ? 'Expand directory' : 'Collapse directory'}
                    >
                      {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </span>
                  ) : (
                    <span style={{ width: '13px' }} />
                  )}

                  {isProj ? (
                    <Network size={14} className="node-icon root" />
                  ) : isDir ? (
                    isCollapsed ? (
                      <Folder size={14} className="node-icon dir" />
                    ) : (
                      <FolderOpen size={14} className="node-icon dir-open" />
                    )
                  ) : (
                    <FileCode2 size={14} className="node-icon file" />
                  )}

                  <span className="truncate" title={node.path}>
                    {node.name}
                  </span>
                </span>

                <span>{node.loc ? node.loc.toLocaleString() : '—'}</span>
                <span>{node.sizeBytes ? compactBytes(node.sizeBytes) : '—'}</span>
              </button>
            );
          })}

          {bottomPadding > 0 && <div style={{ height: `${bottomPadding}px` }} />}
        </div>
      </section>

      <Inspector />
    </main>
  );
}
