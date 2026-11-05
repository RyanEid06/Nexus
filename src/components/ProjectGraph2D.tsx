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

const CLUSTER_COLORS = [
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#38BDF8', // Sky
  '#84CC16', // Lime
];

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  }
  return result >>> 0;
}

function topLevelAncestor(node: ProjectNode, byId: Map<string, ProjectNode>): ProjectNode {
  let current = node;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent || parent.kind === 'project') break;
    current = parent;
  }
  return current;
}

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
  const expandedNodeIds = useAppStore((s) => s.expandedNodeIds);
  const toggleExpandNode = useAppStore((s) => s.toggleExpandNode);

  const containerRef = useRef<HTMLDivElement>(null);

  // Transform state for Pan & Zoom
  const [transform, setTransform] = useState<{ x: number; y: number; k: number }>({
    x: 0,
    y: 0,
    k: 1,
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
        k: 0.88,
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

  // Edges calculation
  const { hierarchyEdges, dependencyEdges } = useMemo(() => {
    const hier: Array<{ source: ProjectNode; target: ProjectNode; sourcePos: Node2DPosition; targetPos: Node2DPosition }> = [];
    const dep: Array<{ edge: DependencyEdge; sourcePos: Node2DPosition; targetPos: Node2DPosition }> = [];

    if (!project) return { hierarchyEdges: hier, dependencyEdges: dep };

    // Hierarchy edges
    for (const node of visibleNodes) {
      if (node.parentId && layout.has(node.parentId) && layout.has(node.id)) {
        const parent = allById.get(node.parentId);
        if (parent) {
          hier.push({
            source: parent,
            target: node,
            sourcePos: layout.get(parent.id)!,
            targetPos: layout.get(node.id)!,
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
            // Find visible representative for sNode and tNode if deep
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
                dep.push({ edge, sourcePos: sPos, targetPos: tPos });
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
      if (e.button !== 0 && e.button !== 1) return; // left or middle click
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
      const nextK = Math.min(3.5, Math.max(0.2, prev.k * zoomFactor));
      // Zoom centered on cursor
      const nextX = mouseX - (mouseX - prev.x) * (nextK / prev.k);
      const nextY = mouseY - (mouseY - prev.y) * (nextK / prev.k);
      return { x: nextX, y: nextY, k: nextK };
    });
  }, []);

  // Viewport action helpers exposed via window / events or controls
  const fitMap = useCallback(() => {
    if (!containerRef.current || !visibleNodes.length) return;
    const rect = containerRef.current.getBoundingClientRect();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of visibleNodes) {
      const pos = layout.get(node.id);
      if (pos) {
        minX = Math.min(minX, pos.x - 80);
        maxX = Math.max(maxX, pos.x + 80);
        minY = Math.min(minY, pos.y - 40);
        maxY = Math.max(maxY, pos.y + 40);
      }
    }

    const width = maxX - minX || 600;
    const height = maxY - minY || 600;

    const scaleX = (rect.width - 120) / width;
    const scaleY = (rect.height - 120) / height;
    const nextK = Math.min(1.2, Math.max(0.3, Math.min(scaleX, scaleY)));

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
      k: 0.88,
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
        k: Math.max(prev.k, 1.0),
      }));
    },
    [layout]
  );

  // Listen for toolbar events
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
          {/* Subtle star particle pattern */}
          <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
          </radialGradient>

          {/* Central root gradient */}
          <radialGradient id="rootBgGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1E1736" />
            <stop offset="70%" stopColor="#131024" />
            <stop offset="100%" stopColor="#0D0B18" />
          </radialGradient>
          <filter id="rootGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {/* Hierarchy Edges (Solid clean lines) */}
          {showHierarchy &&
            hierarchyEdges.map(({ source, target, sourcePos, targetPos }) => {
              const isHighlighted =
                activeHighlightedIds &&
                activeHighlightedIds.has(source.id) &&
                activeHighlightedIds.has(target.id);
              const isDimmed = activeHighlightedIds && !isHighlighted;

              return (
                <line
                  key={`hier-${source.id}-${target.id}`}
                  x1={sourcePos.x}
                  y1={sourcePos.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  stroke={isHighlighted ? '#9D76FF' : '#37384D'}
                  strokeWidth={isHighlighted ? 2.2 : 1.2}
                  strokeOpacity={isDimmed ? 0.18 : isHighlighted ? 0.95 : 0.55}
                  strokeLinecap="round"
                />
              );
            })}

          {/* Dependency Edges (Curved dashed lines) */}
          {showDependencies &&
            dependencyEdges.map(({ edge, sourcePos, targetPos }) => {
              // Quadratic Bezier curve offset to curve around center
              const midX = (sourcePos.x + targetPos.x) / 2;
              const midY = (sourcePos.y + targetPos.y) / 2;
              // Curve outward from center (0, 0)
              const curveDist = 45;
              const angleFromCenter = Math.atan2(midY, midX);
              const controlX = midX + Math.cos(angleFromCenter) * curveDist;
              const controlY = midY + Math.sin(angleFromCenter) * curveDist;

              const pathData = `M ${sourcePos.x} ${sourcePos.y} Q ${controlX} ${controlY} ${targetPos.x} ${targetPos.y}`;

              return (
                <path
                  key={`dep-${edge.id}`}
                  d={pathData}
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth={1.4}
                  strokeDasharray="4, 4"
                  strokeOpacity={0.65}
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

          const cluster = topLevelAncestor(node, allById);
          const color = CLUSTER_COLORS[hash(cluster.path) % CLUSTER_COLORS.length];

          // 1. Central Project Root Node
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
                  <Layers size={24} className="root-icon" />
                  <span className="root-title">{project.name.toUpperCase()}</span>
                  <span className="root-sub">PROJECT</span>
                </div>
              </div>
            );
          }

          // 2. Directory Hub Node (Capsule card matching 2D_APPROVED.png)
          if (node.kind === 'directory') {
            const descendantCount = node.descendantFiles ?? 0;
            return (
              <div
                key={node.id}
                className={`node-2d-dir ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                  borderColor: isSelected ? '#C4B5FD' : color,
                  boxShadow: isSelected
                    ? `0 0 20px ${color}88, inset 0 0 12px ${color}33`
                    : `0 4px 18px rgba(0,0,0,0.5)`,
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
                  {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
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
                  <ChevronRight size={13} />
                </button>
              </div>
            );
          }

          // 3. File Node (Small card badge with file icon and name)
          return (
            <div
              key={node.id}
              className={`node-2d-file ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                borderColor: isSelected ? '#A78BFA' : '#2F3247',
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
      </div>
    </div>
  );
}
