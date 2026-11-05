import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  Layers,
} from 'lucide-react';
import type { DependencyEdge, ProjectNode } from '../domain/models';
import { calculate2DLayout, type Node2DPosition } from '../services/layout';
import { useAppStore, type RelationshipFilterMode } from '../store/useAppStore';
import { getDirectoryColor } from '../utils/fileTypes';

// Deterministic sparse starfield (GEMINI.md Section 14)
const STAR_COUNT = 90;
const DETERMINISTIC_STARS = Array.from({ length: STAR_COUNT }, (_, i) => {
  const seed = (i + 1) * 9301 + 49297;
  const x = ((seed * 233) % 2800) - 1400;
  const y = ((seed * 433) % 2200) - 1100;
  const r = ((seed * 7) % 3) * 0.5 + 0.7;
  const opacity = (((seed * 19) % 55) + 20) / 100;
  return { id: i, x, y, r, opacity };
});

interface ProjectGraph2DProps {
  relationshipMode?: RelationshipFilterMode;
  onFitRequest?: () => void;
  onFocusRequest?: (nodeId: string) => void;
}

export function ProjectGraph2D({
  relationshipMode = 'hierarchy',
}: ProjectGraph2DProps) {
  const project = useAppStore((s) => s.project);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  const selectNode = useAppStore((s) => s.selectNode);
  const openFileViewer = useAppStore((s) => s.openFileViewer);
  const setPage = useAppStore((s) => s.setPage);
  const expandedNodeIds = useAppStore((s) => s.expandedNodeIds);
  const toggleExpandNode = useAppStore((s) => s.toggleExpandNode);

  const containerRef = useRef<HTMLDivElement>(null);

  // Transform state for Pan & Zoom
  const [transform, setTransform] = useState<{ x: number; y: number; k: number }>({
    x: 0,
    y: 0,
    k: 0.88,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });

  // Hover relationship state
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Center initial view on mount
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTransform({
        x: rect.width / 2,
        y: rect.height / 2,
        k: 0.85,
      });
    }
  }, []);

  const allById = useMemo(
    () => new Map((project?.nodes ?? []).map((node) => [node.id, node])),
    [project]
  );

  // Calculate 2D positions deterministically matching 2D_APPROVED.png
  const layout = useMemo(() => {
    if (!project) return new Map<string, Node2DPosition>();
    return calculate2DLayout(project.nodes, expandedNodeIds, project.nodes[0]?.id);
  }, [project, expandedNodeIds]);

  // Visible nodes in 2D
  const visibleNodes = useMemo(() => {
    if (!project) return [];
    const list: ProjectNode[] = [];
    for (const node of project.nodes) {
      if (layout.has(node.id)) {
        list.push(node);
      }
    }
    return list;
  }, [project, layout]);

  // Overflow indicator positions (for > 36 direct children)
  const overflowEntries = useMemo(() => {
    const list: Array<{ parentId: string; pos: Node2DPosition }> = [];
    for (const [id, pos] of layout.entries()) {
      if (pos.isOverflowIndicator) {
        list.push({ parentId: id.replace('__more', ''), pos });
      }
    }
    return list;
  }, [layout]);

  // Edges calculation with clean origin points
  const { hierarchyEdges, dependencyEdges } = useMemo(() => {
    const hier: Array<{
      id: string;
      source: ProjectNode;
      target: ProjectNode;
      sourcePos: Node2DPosition;
      targetPos: Node2DPosition;
      pathD: string;
    }> = [];
    const dep: Array<{ edge: DependencyEdge; sourcePos: Node2DPosition; targetPos: Node2DPosition; pathD: string }> = [];

    if (!project) return { hierarchyEdges: hier, dependencyEdges: dep };

    // Hierarchy edges
    for (const node of visibleNodes) {
      if (node.parentId && layout.has(node.parentId) && layout.has(node.id)) {
        const parent = allById.get(node.parentId);
        if (parent) {
          const sPos = layout.get(parent.id)!;
          const tPos = layout.get(node.id)!;

          // Compute clean boundary offsets
          const angle = Math.atan2(tPos.y - sPos.y, tPos.x - sPos.x);
          const sOffset = parent.kind === 'project' ? 68 : 32;
          const sx = sPos.x + Math.cos(angle) * sOffset;
          const sy = sPos.y + Math.sin(angle) * (parent.kind === 'project' ? sOffset : 20);

          let pathD = `M ${sx} ${sy} L ${tPos.x} ${tPos.y}`;
          if (node.kind === 'file') {
            // Smooth curved branch radiating out to file node
            const midX = (sx + tPos.x) / 2;
            const midY = (sy + tPos.y) / 2;
            pathD = `M ${sx} ${sy} Q ${midX} ${midY} ${tPos.x} ${tPos.y}`;
          }

          hier.push({
            id: `hier-${parent.id}-${node.id}`,
            source: parent,
            target: node,
            sourcePos: sPos,
            targetPos: tPos,
            pathD,
          });
        }
      }
    }

    // Dependency edges
    if (project.dependencies?.edges) {
      const pathToNode = new Map<string, ProjectNode>();
      for (const n of project.nodes) {
        pathToNode.set(n.path, n);
      }

      for (const edge of project.dependencies.edges) {
        if (!edge.isExternal && edge.isResolved) {
          const sNode = pathToNode.get(edge.sourcePath);
          const tNode = pathToNode.get(edge.targetResolvedPath ?? edge.targetPath);
          if (sNode && tNode && sNode.id !== tNode.id) {
            let sVisibleId: string | null = sNode.id;
            let tVisibleId: string | null = tNode.id;

            let curS: ProjectNode | undefined = sNode;
            while (curS && !layout.has(curS.id)) {
              curS = curS.parentId ? allById.get(curS.parentId) : undefined;
            }
            if (curS && layout.has(curS.id)) sVisibleId = curS.id;

            let curT: ProjectNode | undefined = tNode;
            while (curT && !layout.has(curT.id)) {
              curT = curT.parentId ? allById.get(curT.parentId) : undefined;
            }
            if (curT && layout.has(curT.id)) tVisibleId = curT.id;

            if (sVisibleId && tVisibleId && sVisibleId !== tVisibleId) {
              const sPos = layout.get(sVisibleId);
              const tPos = layout.get(tVisibleId);
              if (sPos && tPos) {
                // Curved quadratic bezier arc
                const midX = (sPos.x + tPos.x) / 2;
                const midY = (sPos.y + tPos.y) / 2;
                const dist = Math.hypot(tPos.x - sPos.x, tPos.y - sPos.y);
                const curveDist = Math.min(80, Math.max(30, dist * 0.22));
                const angleFromCenter = Math.atan2(midY, midX);
                const controlX = midX + Math.cos(angleFromCenter) * curveDist;
                const controlY = midY + Math.sin(angleFromCenter) * curveDist;

                const pathD = `M ${sPos.x} ${sPos.y} Q ${controlX} ${controlY} ${tPos.x} ${tPos.y}`;
                dep.push({ edge, sourcePos: sPos, targetPos: tPos, pathD });
              }
            }
          }
        }
      }
    }

    return { hierarchyEdges: hier, dependencyEdges: dep };
  }, [project, visibleNodes, layout, allById]);

  // Hover and selection relationship sets for visual highlighting
  const activeHighlightedIds = useMemo(() => {
    const targetId = hoveredNodeId ?? selectedId;
    if (!targetId) return null;

    const set = new Set<string>();
    set.add(targetId);

    const node = allById.get(targetId);
    if (node?.parentId) set.add(node.parentId);

    // Add children
    for (const item of visibleNodes) {
      if (item.parentId === targetId) set.add(item.id);
    }

    // Add dependencies
    if (node?.path && project?.dependencies?.edges) {
      for (const edge of project.dependencies.edges) {
        if (edge.sourcePath === node.path && edge.targetResolvedPath) {
          const tNode = project.nodes.find((n) => n.path === edge.targetResolvedPath);
          if (tNode) set.add(tNode.id);
        }
        if (edge.targetResolvedPath === node.path) {
          const sNode = project.nodes.find((n) => n.path === edge.sourcePath);
          if (sNode) set.add(sNode.id);
        }
      }
    }

    return set;
  }, [hoveredNodeId, selectedId, allById, visibleNodes, project]);

  // Mouse pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      setIsDragging(true);
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        startX: transform.x,
        startY: transform.y,
      };
    },
    [transform.x, transform.y]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setTransform((prev) => ({
        ...prev,
        x: dragStartRef.current.startX + dx,
        y: dragStartRef.current.startY + dy,
      }));
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel zoom handler centered on cursor
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;

    setTransform((prev) => {
      const nextK = Math.min(3.5, Math.max(0.18, prev.k * zoomFactor));
      const nextX = mouseX - (mouseX - prev.x) * (nextK / prev.k);
      const nextY = mouseY - (mouseY - prev.y) * (nextK / prev.k);
      return { x: nextX, y: nextY, k: nextK };
    });
  }, []);

  // Bounding-box Fit View
  const fitMap = useCallback(() => {
    if (!containerRef.current || !visibleNodes.length) return;
    const rect = containerRef.current.getBoundingClientRect();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const [, pos] of layout.entries()) {
      minX = Math.min(minX, pos.x - 90);
      maxX = Math.max(maxX, pos.x + 90);
      minY = Math.min(minY, pos.y - 45);
      maxY = Math.max(maxY, pos.y + 45);
    }

    const width = maxX - minX || 600;
    const height = maxY - minY || 600;

    const padding = 80;
    const scaleX = (rect.width - padding * 2) / width;
    const scaleY = (rect.height - padding * 2) / height;
    const nextK = Math.min(1.2, Math.max(0.25, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setTransform({
      x: rect.width / 2 - centerX * nextK,
      y: rect.height / 2 - centerY * nextK,
      k: nextK,
    });
  }, [visibleNodes, layout]);

  const resetView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTransform({
      x: rect.width / 2,
      y: rect.height / 2,
      k: 0.85,
    });
  }, []);

  const focusNode = useCallback(
    (nodeId: string) => {
      if (!containerRef.current) return;
      const pos = layout.get(nodeId);
      if (!pos) return;
      const rect = containerRef.current.getBoundingClientRect();
      setTransform((prev) => ({
        x: rect.width / 2 - pos.x * prev.k,
        y: rect.height / 2 - pos.y * prev.k,
        k: Math.max(prev.k, 1.05),
      }));
    },
    [layout]
  );

  useEffect(() => {
    const handleToolbarAction = (e: CustomEvent<{ action: string; nodeId?: string }>) => {
      if (e.detail.action === 'fit') fitMap();
      if (e.detail.action === 'reset') resetView();
      if (e.detail.action === 'focus' && e.detail.nodeId) focusNode(e.detail.nodeId);
    };
    window.addEventListener('nexus:map-action' as any, handleToolbarAction as any);
    return () => window.removeEventListener('nexus:map-action' as any, handleToolbarAction as any);
  }, [fitMap, resetView, focusNode]);

  if (!project) return null;

  const showHierarchy = relationshipMode === 'hierarchy' || relationshipMode === 'both';
  const showDependencies = relationshipMode === 'dependencies' || relationshipMode === 'both';

  return (
    <div
      ref={containerRef}
      className="graph-canvas-2d"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <svg className="graph-svg-layer" width="100%" height="100%">
        <defs>
          {/* Subtle star particle glow */}
          <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#A78BFA" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
          </radialGradient>

          {/* Central Root Multi-layered Violet Aura */}
          <radialGradient id="rootAura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45" />
            <stop offset="60%" stopColor="#6D28D9" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#4C1D95" stopOpacity="0" />
          </radialGradient>

          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {/* Deterministic Cosmic Starfield Backdrop */}
          {DETERMINISTIC_STARS.map((star) => (
            <circle
              key={`star-${star.id}`}
              cx={star.x}
              cy={star.y}
              r={star.r}
              fill="#A78BFA"
              opacity={star.opacity}
            />
          ))}

          {/* Central Root Halo Aura Ring */}
          <circle cx={0} cy={0} r={115} fill="url(#rootAura)" />
          <circle cx={0} cy={0} r={80} fill="none" stroke="#8B5CF6" strokeWidth={1} strokeOpacity={0.25} />

          {/* Hierarchy Edges */}
          {showHierarchy &&
            hierarchyEdges.map(({ id, source, target, pathD }) => {
              const isHighlighted =
                activeHighlightedIds &&
                activeHighlightedIds.has(source.id) &&
                activeHighlightedIds.has(target.id);
              const isDimmed = activeHighlightedIds && !isHighlighted;
              const dirColor = target.kind === 'directory' ? getDirectoryColor(target.name) : '#7C8BA1';

              return (
                <path
                  key={id}
                  d={pathD}
                  fill="none"
                  stroke={isHighlighted ? '#C4B5FD' : dirColor}
                  strokeWidth={isHighlighted ? 2.2 : target.kind === 'directory' ? 1.5 : 1}
                  strokeOpacity={isDimmed ? 0.15 : isHighlighted ? 0.95 : 0.45}
                  strokeLinecap="round"
                />
              );
            })}

          {/* Dependency Edges (Curved dashed lines) */}
          {showDependencies &&
            dependencyEdges.map(({ edge, pathD }) => (
              <path
                key={`dep-${edge.id}`}
                d={pathD}
                fill="none"
                stroke="#A855F7"
                strokeWidth={1.5}
                strokeDasharray="4, 4"
                strokeOpacity={0.7}
                filter="url(#softGlow)"
              />
            ))}
        </g>
      </svg>

      {/* HTML Interactive Nodes Layer matching 2D_APPROVED.png */}
      <div
        className="graph-nodes-layer"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
        }}
      >
        {visibleNodes.map((node) => {
          const pos = layout.get(node.id);
          if (!pos) return null;

          const isSelected = node.id === selectedId;
          const isHovered = node.id === hoveredNodeId;
          const isExpanded = expandedNodeIds.has(node.id);

          // 1. Central Project Root Node (Layered cosmic hub with isometric 3-tier glyph)
          if (node.kind === 'project') {
            return (
              <div
                key={node.id}
                className={`node-2d-root ${isSelected ? 'selected' : ''}`}
                style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectNode(node.id);
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
              >
                <div className="root-inner">
                  {/* Isometric 3-Tier Diamond Mark */}
                  <div className="root-glyph-box">
                    <Layers size={28} className="root-icon" />
                  </div>
                  <span className="root-title">{project.name.toUpperCase()}</span>
                  <span className="root-sub">PROJECT</span>
                </div>
              </div>
            );
          }

          // 2. Directory Hub Node (Rounded pill capsule matching 2D_APPROVED.png)
          if (node.kind === 'directory') {
            const color = getDirectoryColor(node.name);
            const descendantCount = node.descendantFiles ?? 0;

            return (
              <div
                key={node.id}
                className={`node-2d-dir ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                  borderColor: isSelected ? '#DDD6FE' : color,
                  boxShadow: isSelected
                    ? `0 0 24px ${color}AA, inset 0 0 12px ${color}44`
                    : `0 4px 18px rgba(0,0,0,0.6), 0 0 10px ${color}33`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectNode(node.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  toggleExpandNode(node.id);
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
              >
                <div className="dir-icon-col" style={{ color }}>
                  {isExpanded ? <FolderOpen size={17} /> : <Folder size={17} />}
                </div>
                <div className="dir-text-col">
                  <span className="dir-name">{node.name}/</span>
                  <span className="dir-count">
                    {descendantCount} file{descendantCount === 1 ? '' : 's'}
                  </span>
                </div>
                <button
                  className={`dir-expand-btn ${isExpanded ? 'expanded' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpandNode(node.id);
                  }}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                  aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            );
          }

          // 3. File Node (Compact dark chip card matching 2D_APPROVED.png)
          return (
            <div
              key={node.id}
              className={`node-2d-file ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                borderColor: isSelected ? '#A78BFA' : '#2A2C40',
              }}
              onClick={(e) => {
                e.stopPropagation();
                selectNode(node.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                openFileViewer(node.id);
              }}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
              title={`${node.path} (${node.loc} lines) · Double-click to open`}
            >
              <FileCode2 size={13} className="file-badge-icon" />
              <span className="file-name">{node.name}</span>
            </div>
          );
        })}

        {/* 4. Overflow Badges (+ N more files) */}
        {overflowEntries.map(({ parentId, pos }) => (
          <button
            key={`overflow-${parentId}`}
            className="node-2d-overflow-btn"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
            onClick={(e) => {
              e.stopPropagation();
              selectNode(parentId);
              setPage('structure');
            }}
            title={`View all ${pos.overflowCount} additional files in Structure`}
          >
            <span>+ {pos.overflowCount} more</span>
          </button>
        ))}
      </div>
    </div>
  );
}
