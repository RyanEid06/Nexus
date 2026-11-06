import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  Layers,
} from 'lucide-react';
import type { Node2DPosition } from '../services/layout';
import {
  buildGraphIndex,
  computeGraphViewport,
  resolveBoundedHoverDependencies,
  type ViewportOverflowNode,
} from '../services/graphViewport';
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
  active?: boolean;
  relationshipMode?: RelationshipFilterMode;
}

export function ProjectGraph2D({
  active = true,
  relationshipMode = 'hierarchy',
}: ProjectGraph2DProps) {
  const project = useAppStore((s) => s.project);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  const selectNode = useAppStore((s) => s.selectNode);
  const openFileViewer = useAppStore((s) => s.openFileViewer);
  const setPage = useAppStore((s) => s.setPage);
  const expandedNodeIds = useAppStore((s) => s.expandedNodeIds);
  const toggleExpandNode = useAppStore((s) => s.toggleExpandNode);
  const mapFocusNodeId = useAppStore((s) => s.mapFocusNodeId);
  const drillDownNode = useAppStore((s) => s.drillDownNode);

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

  const graphIndex = useMemo(() => (project ? buildGraphIndex(project) : null), [project]);

  // Compute unified graph viewport (decoupled from hover to avoid recomputing viewport on pointer move)
  const viewport = useMemo(() => {
    if (!project) return null;
    return computeGraphViewport({
      project,
      graphIndex: graphIndex ?? undefined,
      mapFocusNodeId,
      selectedNodeId: selectedId,
      expandedNodeIds,
      relationshipMode,
    });
  }, [project, graphIndex, mapFocusNodeId, selectedId, expandedNodeIds, relationshipMode]);

  const layout = useMemo(() => viewport?.positions2D ?? new Map<string, Node2DPosition>(), [viewport]);
  const visibleNodes = useMemo(() => viewport?.visibleNodes ?? [], [viewport]);
  const overflowNodes = useMemo(() => viewport?.overflowNodes ?? [], [viewport]);

  // Edges calculation with clean origin points
  const hierarchyEdges = useMemo(() => {
    if (!viewport || !project) return [];
    const list: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      isOverflow: boolean;
      pathD: string;
      targetKind: string;
      targetName: string;
    }> = [];

    for (const edge of viewport.hierarchyEdges) {
      const sPos = viewport.positions2D.get(edge.sourceId);
      const tPos = viewport.positions2D.get(edge.targetId);
      const sNode = viewport.visibleNodesMap.get(edge.sourceId);
      const tNode = edge.isOverflow ? null : viewport.visibleNodesMap.get(edge.targetId);

      if (sPos && tPos && sNode) {
        const angle = Math.atan2(tPos.y - sPos.y, tPos.x - sPos.x);
        const sOffset = sNode.kind === 'project' ? 68 : 34;
        const sx = sPos.x + Math.cos(angle) * sOffset;
        const sy = sPos.y + Math.sin(angle) * (sNode.kind === 'project' ? sOffset : 22);

        let pathD = `M ${sx} ${sy} L ${tPos.x} ${tPos.y}`;
        if (tNode && tNode.kind === 'file') {
          const midX = (sx + tPos.x) / 2;
          const midY = (sy + tPos.y) / 2;
          pathD = `M ${sx} ${sy} Q ${midX} ${midY} ${tPos.x} ${tPos.y}`;
        }

        list.push({
          id: edge.id,
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          isOverflow: Boolean(edge.isOverflow),
          pathD,
          targetKind: tNode?.kind ?? 'overflow',
          targetName: tNode?.name ?? '',
        });
      }
    }
    return list;
  }, [viewport, project]);

  // Bounded hover processing over <=60 visible dependency relationships (consumes precomputed candidates)
  const { visibleDependencyEdges, visibleOutgoingByNodeId, visibleIncomingByNodeId } = useMemo(() => {
    if (!viewport || !project) {
      return {
        visibleDependencyEdges: [],
        visibleOutgoingByNodeId: new Map(),
        visibleIncomingByNodeId: new Map(),
      };
    }
    if (!hoveredNodeId) {
      return {
        visibleDependencyEdges: viewport.visibleDependencyEdges,
        visibleOutgoingByNodeId: viewport.visibleOutgoingByNodeId,
        visibleIncomingByNodeId: viewport.visibleIncomingByNodeId,
      };
    }
    return resolveBoundedHoverDependencies(viewport, {
      hoveredNodeId,
      selectedNodeId: selectedId,
      focusNodeId: viewport.focusNode.id,
    });
  }, [viewport, project, hoveredNodeId, selectedId]);

  const dependencyEdges = useMemo(() => {
    if (!viewport || !project) return [];
    const list: Array<{ id: string; sourceId: string; targetId: string; pathD: string }> = [];

    for (const dep of visibleDependencyEdges) {
      const sPos = viewport.positions2D.get(dep.sourceId);
      const tPos = viewport.positions2D.get(dep.targetId);
      if (sPos && tPos) {
        const midX = (sPos.x + tPos.x) / 2;
        const midY = (sPos.y + tPos.y) / 2;
        const dist = Math.hypot(tPos.x - sPos.x, tPos.y - sPos.y);
        const curveDist = Math.min(80, Math.max(30, dist * 0.22));
        const angleFromCenter = Math.atan2(midY, midX);
        const controlX = midX + Math.cos(angleFromCenter) * curveDist;
        const controlY = midY + Math.sin(angleFromCenter) * curveDist;

        const pathD = `M ${sPos.x} ${sPos.y} Q ${controlX} ${controlY} ${tPos.x} ${tPos.y}`;
        list.push({ id: dep.id, sourceId: dep.sourceId, targetId: dep.targetId, pathD });
      }
    }
    return list;
  }, [viewport, project, visibleDependencyEdges]);

  // Hover and selection relationship sets for visual highlighting
  // Strictly bounded over the <= 60 visible dependency relationships
  const activeHighlightedIds = useMemo(() => {
    const targetId = hoveredNodeId ?? selectedId;
    if (!targetId || !viewport || !project) return null;

    const set = new Set<string>();
    set.add(targetId);

    const node = viewport.visibleNodesMap.get(targetId);
    if (node?.parentId) set.add(node.parentId);

    for (const item of viewport.visibleNodes) {
      if (item.parentId === targetId) set.add(item.id);
    }

    const outgoing = visibleOutgoingByNodeId.get(targetId) ?? [];
    for (const item of outgoing) {
      set.add(item.targetId);
    }
    const incoming = visibleIncomingByNodeId.get(targetId) ?? [];
    for (const item of incoming) {
      set.add(item.sourceId);
    }

    return set;
  }, [hoveredNodeId, selectedId, viewport, project, visibleOutgoingByNodeId, visibleIncomingByNodeId]);

  // Mouse pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!active) return;
      if (e.button !== 0 && e.button !== 1) return;
      setIsDragging(true);
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        startX: transform.x,
        startY: transform.y,
      };
    },
    [active, transform.x, transform.y]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!active || !isDragging) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setTransform((prev) => ({
        ...prev,
        x: dragStartRef.current.startX + dx,
        y: dragStartRef.current.startY + dy,
      }));
    },
    [active, isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel zoom handler centered on cursor
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!active) return;
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;

      setTransform((prev) => {
        const nextK = Math.min(3.5, Math.max(0.2, prev.k * zoomFactor));
        const nextX = mouseX - (mouseX - prev.x) * (nextK / prev.k);
        const nextY = mouseY - (mouseY - prev.y) * (nextK / prev.k);
        return { x: nextX, y: nextY, k: nextK };
      });
    },
    [active]
  );

  // Bounding-box Fit View
  const fitMap = useCallback(() => {
    if (!containerRef.current || !viewport || !layout.size) return;
    const rect = containerRef.current.getBoundingClientRect();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const pos of layout.values()) {
      minX = Math.min(minX, pos.x - 110);
      maxX = Math.max(maxX, pos.x + 110);
      minY = Math.min(minY, pos.y - 50);
      maxY = Math.max(maxY, pos.y + 50);
    }

    const width = Math.max(400, maxX - minX);
    const height = Math.max(300, maxY - minY);

    const padding = 70;
    const scaleX = (rect.width - padding * 2) / width;
    const scaleY = (rect.height - padding * 2) / height;
    const nextK = Math.min(1.2, Math.max(0.35, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setTransform({
      x: rect.width / 2 - centerX * nextK,
      y: rect.height / 2 - centerY * nextK,
      k: nextK,
    });
  }, [viewport, layout]);

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
    const handleToolbarAction = (e: CustomEvent<{ action: string; nodeId?: string; targetMode?: string }>) => {
      if (!active) return;
      if (e.detail.targetMode && e.detail.targetMode !== '2d') return;
      if (e.detail.action === 'fit') fitMap();
      if (e.detail.action === 'reset') resetView();
      if (e.detail.action === 'focus' && e.detail.nodeId) focusNode(e.detail.nodeId);
    };
    window.addEventListener('nexus:map-action' as any, handleToolbarAction as any);
    return () => window.removeEventListener('nexus:map-action' as any, handleToolbarAction as any);
  }, [active, fitMap, resetView, focusNode]);

  if (!project || !viewport) return null;

  const showHierarchy = relationshipMode === 'hierarchy' || relationshipMode === 'both';
  const showDependencies = relationshipMode === 'dependencies' || relationshipMode === 'both';
  const isLowLOD = transform.k < 0.6;

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
          <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#A78BFA" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
          </radialGradient>

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

          {/* Central Halo Aura Ring */}
          <circle cx={0} cy={0} r={115} fill="url(#rootAura)" />
          <circle cx={0} cy={0} r={80} fill="none" stroke="#8B5CF6" strokeWidth={1} strokeOpacity={0.25} />

          {/* Hierarchy Edges */}
          {showHierarchy &&
            hierarchyEdges.map(({ id, sourceId, targetId, isOverflow, pathD, targetKind, targetName }) => {
              const isHighlighted =
                activeHighlightedIds &&
                activeHighlightedIds.has(sourceId) &&
                activeHighlightedIds.has(targetId);
              const isDimmed = activeHighlightedIds && !isHighlighted;
              const dirColor = targetKind === 'directory' ? getDirectoryColor(targetName) : isOverflow ? '#6366F1' : '#7C8BA1';

              return (
                <path
                  key={id}
                  d={pathD}
                  fill="none"
                  stroke={isHighlighted ? '#C4B5FD' : dirColor}
                  strokeWidth={isHighlighted ? 2.2 : targetKind === 'directory' ? 1.5 : 1}
                  strokeOpacity={isDimmed ? 0.12 : isHighlighted ? 0.95 : 0.45}
                  strokeDasharray={isOverflow ? '3, 3' : undefined}
                  strokeLinecap="round"
                />
              );
            })}

          {/* Dependency Edges (Curved dashed lines) */}
          {showDependencies &&
            dependencyEdges.map(({ id, sourceId, targetId, pathD }) => {
              const isHighlighted =
                activeHighlightedIds &&
                activeHighlightedIds.has(sourceId) &&
                activeHighlightedIds.has(targetId);
              const isDimmed = activeHighlightedIds && !isHighlighted;

              return (
                <path
                  key={id}
                  d={pathD}
                  fill="none"
                  stroke={isHighlighted ? '#F472B6' : '#A855F7'}
                  strokeWidth={isHighlighted ? 2 : 1.4}
                  strokeDasharray="4, 4"
                  strokeOpacity={isDimmed ? 0.12 : isHighlighted ? 0.95 : 0.65}
                  filter="url(#softGlow)"
                />
              );
            })}
        </g>
      </svg>

      {/* HTML Interactive Nodes Layer */}
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
          const isFocusedNode = node.id === viewport.focusNode.id;

          // 1. Central Focused Node
          if (isFocusedNode) {
            if (viewport.isProjectRootFocused) {
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
                    <div className="root-glyph-box">
                      <Layers size={28} className="root-icon" />
                    </div>
                    <span className="root-title">{project.name.toUpperCase()}</span>
                    <span className="root-sub">PROJECT</span>
                  </div>
                </div>
              );
            } else {
              // Directory is focused as the central hub
              const color = getDirectoryColor(node.name);
              return (
                <div
                  key={node.id}
                  className={`node-2d-focused-dir ${isSelected ? 'selected' : ''}`}
                  style={{
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                    borderColor: isSelected ? '#DDD6FE' : color,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectNode(node.id);
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                >
                  <FolderOpen size={20} style={{ color }} />
                  <span className="focused-dir-title">{node.name}/</span>
                  <span className="focused-dir-sub">{node.descendantFiles ?? 0} FILES</span>
                </div>
              );
            }
          }

          // 2. Directory Hub Node
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
                  drillDownNode(node.id);
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                title={`${node.name}/ (${descendantCount} files) · Double-click to focus folder`}
              >
                <div className="dir-icon-col" style={{ color }}>
                  {isExpanded ? <FolderOpen size={17} /> : <Folder size={17} />}
                </div>
                <div className="dir-text-col">
                  <span className="dir-name">{node.name}/</span>
                  {!isLowLOD && (
                    <span className="dir-count">
                      {descendantCount} file{descendantCount === 1 ? '' : 's'}
                    </span>
                  )}
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

          // 3. File Node
          return (
            <div
              key={node.id}
              className={`node-2d-file ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isLowLOD ? 'lod-low' : ''}`}
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

        {/* 4. Overflow Badges (+ N more files/folders) */}
        {overflowNodes.map((overflow: ViewportOverflowNode) => {
          const pos = layout.get(overflow.id);
          if (!pos) return null;

          return (
            <button
              key={overflow.id}
              className="node-2d-overflow-btn"
              style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
              onClick={(e) => {
                e.stopPropagation();
                selectNode(overflow.parentId);
                setPage('structure');
              }}
              title={`View all ${overflow.hiddenCount.toLocaleString()} additional items in Structure View`}
            >
              <span>{overflow.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
