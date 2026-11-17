import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Cpu,
  FileCode2,
  Folder,
  FolderOpen,
  Layers,
  Package,
} from 'lucide-react';
import type { ProjectIndex } from '../domain/models';
import type { Node2DPosition } from '../services/layout';
import {
  buildGraphIndex,
  computeGraphViewport,
  resolveBoundedHoverDependencies,
  type ViewportOverflowNode,
} from '../services/graphViewport';
import { computeMultiProjectConstellation } from '../services/constellation';
import { useAppStore, type RelationshipFilterMode } from '../store/useAppStore';
import { getDirectoryColor } from '../utils/fileTypes';

interface ProjectGraph2DProps {
  active?: boolean;
  relationshipMode?: RelationshipFilterMode;
}

const LANGUAGE_ACCENT: Record<string, string> = {
  TypeScript: '#38BDF8',
  JavaScript: '#FBBF24',
  Python: '#34D399',
  Rust: '#FB923C',
  Go: '#22D3EE',
  SQL: '#A78BFA',
  Markdown: '#94A3B8',
  YAML: '#F472B6',
  JSON: '#94A3B8',
  GLSL: '#FB7185',
};

export function ProjectGraph2D({
  active = true,
  relationshipMode = 'hierarchy',
}: ProjectGraph2DProps) {
  const project = useAppStore((s) => s.project);
  const workspaceProjects = useAppStore((s) => s.workspaceProjects);
  const constellationProjectIds = useAppStore((s) => s.constellationProjectIds);
  const constellationMode = useAppStore((s) => s.constellationMode);
  const switchProject = useAppStore((s) => s.switchProject);

  const selectedId = useAppStore((s) => s.selectedNodeId);
  const selectNode = useAppStore((s) => s.selectNode);
  const openFileViewer = useAppStore((s) => s.openFileViewer);
  const setPage = useAppStore((s) => s.setPage);
  const expandedNodeIds = useAppStore((s) => s.expandedNodeIds);
  const toggleExpandNode = useAppStore((s) => s.toggleExpandNode);
  const previewFolderBranch = useAppStore((s) => s.previewFolderBranch);
  const mapFocusNodeId = useAppStore((s) => s.mapFocusNodeId);
  const mapPageOffset = useAppStore((s) => s.mapPageOffset);
  const nextMapPage = useAppStore((s) => s.nextMapPage);
  const drillDownNode = useAppStore((s) => s.drillDownNode);

  const containerRef = useRef<HTMLDivElement>(null);

  const [transform, setTransform] = useState<{ x: number; y: number; k: number }>({
    x: 0,
    y: 0,
    k: 0.85,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    startX: number;
    startY: number;
    moved: boolean;
  }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
    moved: false,
  });

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredBridgePkg, setHoveredBridgePkg] = useState<string | null>(null);

  const constellationProjects: ProjectIndex[] = useMemo(() => {
    if (!constellationMode) return [];
    const selectedSet = new Set(constellationProjectIds);
    const list = workspaceProjects.filter((p) => selectedSet.has(p.id));
    return list.length >= 2 ? list : workspaceProjects;
  }, [constellationMode, workspaceProjects, constellationProjectIds]);

  const constellation = useMemo(() => {
    if (!constellationMode || constellationProjects.length < 2) return null;
    return computeMultiProjectConstellation(constellationProjects);
  }, [constellationMode, constellationProjects]);

  const graphIndex = useMemo(() => (project ? buildGraphIndex(project) : null), [project]);

  const viewport = useMemo(() => {
    if (!project || constellationMode) return null;
    return computeGraphViewport({
      project,
      graphIndex: graphIndex ?? undefined,
      mapFocusNodeId,
      selectedNodeId: selectedId,
      expandedNodeIds,
      relationshipMode,
      directPageOffset: mapPageOffset,
      expandedBranchLimit: 15,
    });
  }, [project, graphIndex, constellationMode, mapFocusNodeId, mapPageOffset, selectedId, expandedNodeIds, relationshipMode]);

  const layout = useMemo(() => viewport?.positions2D ?? new Map<string, Node2DPosition>(), [viewport]);
  const visibleNodes = useMemo(() => viewport?.visibleNodes ?? [], [viewport]);
  const overflowNodes = useMemo(() => viewport?.overflowNodes ?? [], [viewport]);

  // Fit bounds helper for both Single Project & Multi-Project Constellation
  const fitMap = useCallback((): boolean => {
    const container = containerRef.current;
    if (!container) return false;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    if (constellation) {
      for (const p of constellation.projects) {
        minX = Math.min(minX, p.center2D.x - p.radius2D - 45);
        maxX = Math.max(maxX, p.center2D.x + p.radius2D + 45);
        minY = Math.min(minY, p.center2D.y - p.radius2D - 55);
        maxY = Math.max(maxY, p.center2D.y + p.radius2D + 55);
      }
      for (const b of constellation.bridges) {
        minX = Math.min(minX, b.x - 80);
        maxX = Math.max(maxX, b.x + 80);
        minY = Math.min(minY, b.y - 40);
        maxY = Math.max(maxY, b.y + 40);
      }
    } else if (layout.size > 0) {
      for (const pos of layout.values()) {
        minX = Math.min(minX, pos.x - 135);
        maxX = Math.max(maxX, pos.x + 135);
        minY = Math.min(minY, pos.y - 60);
        maxY = Math.max(maxY, pos.y + 60);
      }
    }

    if (!Number.isFinite(minX)) {
      setTransform({ x: rect.width / 2, y: rect.height / 2, k: 0.85 });
      return true;
    }

    const width = Math.max(460, maxX - minX);
    const height = Math.max(360, maxY - minY);
    const paddingX = 96;
    const paddingTop = 132;
    const paddingBottom = 96;
    const scaleX = (rect.width - paddingX * 2) / width;
    const scaleY = (rect.height - paddingTop - paddingBottom) / height;
    const nextK = Math.min(1.05, Math.max(0.28, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const verticalCenter = paddingTop + (rect.height - paddingTop - paddingBottom) / 2;

    setTransform({
      x: rect.width / 2 - centerX * nextK,
      y: verticalCenter - centerY * nextK,
      k: nextK,
    });
    return true;
  }, [constellation, layout]);

  const resetView = useCallback(() => {
    fitMap();
  }, [fitMap]);

  const focusNode = useCallback(
    (nodeId: string) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (constellation) {
        const match = constellation.nodes.find((n) => n.sourceNode.id === nodeId || n.id === nodeId);
        if (!match) return;
        setTransform((prev) => ({
          x: rect.width / 2 - match.x * Math.max(prev.k, 0.85),
          y: rect.height / 2 - match.y * Math.max(prev.k, 0.85),
          k: Math.max(prev.k, 0.85),
        }));
        return;
      }
      const pos = layout.get(nodeId);
      if (!pos) return;
      setTransform((prev) => ({
        x: rect.width / 2 - pos.x * Math.max(prev.k, 1.0),
        y: rect.height / 2 - pos.y * Math.max(prev.k, 1.0),
        k: Math.max(prev.k, 1.0),
      }));
    },
    [constellation, layout]
  );

  // Auto-fit when switching project, focus node, page offset, or constellation mode
  // Do NOT refit on single-click branch expand so double-clicks never lose hit target mid-gesture
  const lastFitSignatureRef = useRef<string>('');
  const fitSignature = constellation
    ? `constellation:${constellation.projects.map((p) => p.projectId).join(',')}`
    : `single:${project?.id ?? ''}:${viewport?.focusNode.id ?? ''}:${mapPageOffset}`;

  useEffect(() => {
    if (!active) return;
    if (fitSignature !== lastFitSignatureRef.current) {
      if (fitMap()) {
        lastFitSignatureRef.current = fitSignature;
      }
    }
  }, [active, fitSignature, fitMap]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      if (!active) return;
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          if (lastFitSignatureRef.current !== fitSignature) {
            if (fitMap()) {
              lastFitSignatureRef.current = fitSignature;
            }
          }
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, fitSignature, fitMap]);

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

  // Hierarchy edges (clean center-to-center anchors since nodes use -50% -50% centering)
  const hierarchyEdges = useMemo(() => {
    if (!viewport || !project) return [];
    const list: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      isOverflow: boolean;
      sx: number;
      sy: number;
      tx: number;
      ty: number;
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
        const dx = tPos.x - sPos.x;
        const dy = tPos.y - sPos.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;

        // Subtle curved spline for file branches; crisp radial spoke for top-level folders
        const midX = (sPos.x + tPos.x) / 2;
        const midY = (sPos.y + tPos.y) / 2;
        const perpOffset = tNode?.kind === 'file' ? Math.min(18, len * 0.08) : 0;
        const cx = midX - uy * perpOffset;
        const cy = midY + ux * perpOffset;

        const pathD =
          perpOffset > 0
            ? `M ${sPos.x} ${sPos.y} Q ${cx} ${cy} ${tPos.x} ${tPos.y}`
            : `M ${sPos.x} ${sPos.y} L ${tPos.x} ${tPos.y}`;

        list.push({
          id: edge.id,
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          isOverflow: Boolean(edge.isOverflow),
          sx: sPos.x,
          sy: sPos.y,
          tx: tPos.x,
          ty: tPos.y,
          pathD,
          targetKind: tNode?.kind ?? 'overflow',
          targetName: tNode?.name ?? '',
        });
      }
    }
    return list;
  }, [viewport, project]);

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
    const list: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      pathD: string;
      direction: 'outgoing' | 'incoming' | 'neutral';
    }> = [];

    const activeId = hoveredNodeId ?? selectedId;

    for (const dep of visibleDependencyEdges) {
      const sPos = viewport.positions2D.get(dep.sourceId);
      const tPos = viewport.positions2D.get(dep.targetId);
      if (sPos && tPos) {
        const dx = tPos.x - sPos.x;
        const dy = tPos.y - sPos.y;
        const dist = Math.hypot(dx, dy) || 1;
        // Pull endpoint slightly back from target card center so arrowhead stays clearly visible
        const trim = Math.min(26, dist * 0.16);
        const endX = tPos.x - (dx / dist) * trim;
        const endY = tPos.y - (dy / dist) * trim;

        const midX = (sPos.x + endX) / 2;
        const midY = (sPos.y + endY) / 2;
        const curveDist = Math.min(72, Math.max(26, dist * 0.2));
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const controlX = midX + perpX * curveDist;
        const controlY = midY + perpY * curveDist;

        const pathD = `M ${sPos.x} ${sPos.y} Q ${controlX} ${controlY} ${endX} ${endY}`;
        const direction: 'outgoing' | 'incoming' | 'neutral' =
          activeId && dep.sourceId === activeId
            ? 'outgoing'
            : activeId && dep.targetId === activeId
            ? 'incoming'
            : 'neutral';

        list.push({ id: dep.id, sourceId: dep.sourceId, targetId: dep.targetId, pathD, direction });
      }
    }
    return list;
  }, [viewport, project, visibleDependencyEdges, hoveredNodeId, selectedId]);

  const activeHighlightedIds = useMemo(() => {
    if (!viewport || !project) return null;
    const isHovering = hoveredNodeId !== null;
    const selectedNode = selectedId ? viewport.visibleNodesMap.get(selectedId) : null;
    const shouldSpotlightSelection =
      relationshipMode !== 'hierarchy' || selectedNode?.kind === 'file';

    if (!isHovering && !shouldSpotlightSelection) {
      return null;
    }

    const targetId = hoveredNodeId ?? selectedId;
    if (!targetId) return null;

    const set = new Set<string>();
    set.add(targetId);

    const node = viewport.visibleNodesMap.get(targetId);
    if (node?.parentId) set.add(node.parentId);

    for (const item of viewport.visibleNodes) {
      if (item.parentId === targetId) set.add(item.id);
    }

    const outgoing = visibleOutgoingByNodeId.get(targetId) ?? [];
    for (const item of outgoing) set.add(item.targetId);

    const incoming = visibleIncomingByNodeId.get(targetId) ?? [];
    for (const item of incoming) set.add(item.sourceId);

    return set;
  }, [hoveredNodeId, selectedId, viewport, project, relationshipMode, visibleOutgoingByNodeId, visibleIncomingByNodeId]);

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
        moved: false,
      };
    },
    [active, transform.x, transform.y]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!active || !isDragging) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      if (Math.hypot(dx, dy) > 4) {
        dragStartRef.current.moved = true;
      }
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

  const handleBackgroundClick = useCallback(() => {
    if (dragStartRef.current.moved) return;
    if (!constellationMode) {
      selectNode(null);
    }
  }, [constellationMode, selectNode]);

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
        const nextK = Math.min(3.0, Math.max(0.22, prev.k * zoomFactor));
        const nextX = mouseX - (mouseX - prev.x) * (nextK / prev.k);
        const nextY = mouseY - (mouseY - prev.y) * (nextK / prev.k);
        return { x: nextX, y: nextY, k: nextK };
      });
    },
    [active]
  );

  if (!project) return null;

  const showHierarchy = relationshipMode === 'hierarchy' || relationshipMode === 'both';
  const showDependencies = relationshipMode === 'dependencies' || relationshipMode === 'both';
  const isLowLOD = transform.k < 0.56;

  // ==================== MULTI-PROJECT CONSTELLATION 2D ====================
  if (constellation) {
    const hoveredPkgProjects = hoveredBridgePkg
      ? new Set(constellation.bridges.find((b) => b.packageName === hoveredBridgePkg)?.projectIds ?? [])
      : null;

    return (
      <div
        ref={containerRef}
        className="graph-canvas-2d"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleBackgroundClick}
        onWheel={handleWheel}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <svg className="graph-svg-layer" width="100%" height="100%">
          <defs>
            <pattern id="cadGridConstellation" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(148, 163, 184, 0.05)" strokeWidth="1" />
            </pattern>
          </defs>

          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            <rect x={-2600} y={-2200} width={5200} height={4400} fill="url(#cadGridConstellation)" />

            {/* Outer System Ring */}
            <circle cx={0} cy={0} r={460} fill="none" stroke="rgba(34, 211, 238, 0.08)" strokeDasharray="6 8" strokeWidth={1} />
            <line x1={-600} y1={0} x2={600} y2={0} stroke="rgba(148, 163, 184, 0.06)" strokeWidth={1} />
            <line x1={0} y1={-600} x2={0} y2={600} stroke="rgba(148, 163, 184, 0.06)" strokeWidth={1} />

            {/* Project Cluster Orbital Rings */}
            {constellation.projects.map((proj) => {
              const isActiveProj = proj.projectId === project.id;
              const isBridgeMatch = hoveredPkgProjects?.has(proj.projectId);
              return (
                <g key={`orbit-${proj.projectId}`}>
                  <circle
                    cx={proj.center2D.x}
                    cy={proj.center2D.y}
                    r={proj.radius2D}
                    fill={isActiveProj ? 'rgba(34, 211, 238, 0.035)' : 'rgba(15, 23, 42, 0.28)'}
                    stroke={isActiveProj || isBridgeMatch ? proj.accentColor : 'rgba(148, 163, 184, 0.16)'}
                    strokeWidth={isActiveProj || isBridgeMatch ? 1.5 : 1}
                    strokeDasharray={isActiveProj ? undefined : '4 6'}
                  />
                  <circle
                    cx={proj.center2D.x}
                    cy={proj.center2D.y}
                    r={proj.radius2D * 0.62}
                    fill="none"
                    stroke="rgba(148, 163, 184, 0.08)"
                    strokeWidth={1}
                  />
                </g>
              );
            })}

            {/* Hierarchy & Shared Package Bridge Edges */}
            {constellation.edges.map((edge) => {
              const sNode = constellation.nodeById.get(edge.sourceId);
              if (!sNode) return null;

              if (edge.kind === 'bridge') {
                const pkgName = edge.targetId.replace('pkg::', '');
                const bridge = constellation.bridges.find((b) => b.packageName === pkgName);
                if (!bridge) return null;
                const activeBridge = hoveredBridgePkg === pkgName;
                const dimmed = hoveredBridgePkg !== null && !activeBridge;
                const midX = (sNode.x + bridge.x) / 2;
                const midY = (sNode.y + bridge.y) / 2 - 22;

                return (
                  <path
                    key={edge.id}
                    d={`M ${sNode.x} ${sNode.y} Q ${midX} ${midY} ${bridge.x} ${bridge.y}`}
                    fill="none"
                    stroke={activeBridge ? '#22D3EE' : '#38BDF8'}
                    strokeWidth={activeBridge ? 2.2 : 1.3}
                    strokeDasharray="5 4"
                    strokeOpacity={dimmed ? 0.15 : activeBridge ? 0.95 : 0.55}
                  />
                );
              }

              const tNode = constellation.nodeById.get(edge.targetId);
              if (!tNode) return null;
              return (
                <line
                  key={edge.id}
                  x1={sNode.x}
                  y1={sNode.y}
                  x2={tNode.x}
                  y2={tNode.y}
                  stroke={edge.color}
                  strokeWidth={1.25}
                  strokeOpacity={0.38}
                />
              );
            })}
          </g>
        </svg>

        {/* Constellation Interactive Nodes Layer */}
        <div
          className="graph-nodes-layer"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}
        >
          {constellation.nodes.map((cNode) => {
            const isActiveProj = cNode.projectId === project.id;
            const isSelected = isActiveProj && cNode.sourceNode.id === selectedId;

            if (cNode.kind === 'project') {
              return (
                <div
                  key={cNode.id}
                  className={`node-2d-anchor node-2d-constellation-root ${isActiveProj ? 'active-project' : ''} ${isSelected ? 'selected' : ''}`}
                  style={{
                    transform: `translate(${cNode.x}px, ${cNode.y}px) translate(-50%, -50%)`,
                    borderColor: isActiveProj ? cNode.color : 'rgba(148, 163, 184, 0.28)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cNode.projectId !== project.id) {
                      switchProject(cNode.projectId, 'graph');
                      useAppStore.getState().setConstellationMode(true);
                    }
                    selectNode(cNode.sourceNode.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    switchProject(cNode.projectId, 'graph');
                  }}
                  title={`${cNode.label} · Click to inspect · Double-click to enter project`}
                >
                  <div className="constellation-root-head">
                    <Cpu size={16} style={{ color: cNode.color }} />
                    <span>{cNode.label}</span>
                  </div>
                  <small>{cNode.subtitle}</small>
                </div>
              );
            }

            return (
              <div
                key={cNode.id}
                className={`node-2d-anchor node-2d-constellation-sub ${isSelected ? 'selected' : ''}`}
                style={{
                  transform: `translate(${cNode.x}px, ${cNode.y}px) translate(-50%, -50%)`,
                  borderColor: isSelected ? '#22D3EE' : `${cNode.color}66`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (cNode.projectId !== project.id) {
                    switchProject(cNode.projectId, 'graph');
                    useAppStore.getState().setConstellationMode(true);
                  }
                  selectNode(cNode.sourceNode.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  switchProject(cNode.projectId, 'graph');
                  if (cNode.kind === 'directory') {
                    useAppStore.getState().drillDownNode(cNode.sourceNode.id);
                  } else {
                    useAppStore.getState().openFileViewer(cNode.sourceNode.id);
                  }
                }}
                title={`${cNode.label} (${cNode.subtitle}) · Double-click to open in ${cNode.projectId}`}
              >
                <span className="constellation-sub-bar" style={{ background: cNode.color }} />
                {cNode.kind === 'directory' ? (
                  <Folder size={13} style={{ color: cNode.color }} />
                ) : (
                  <FileCode2 size={12} style={{ color: cNode.color }} />
                )}
                <span className="constellation-sub-name">{cNode.label}</span>
              </div>
            );
          })}

          {/* Shared Package Bridges */}
          {constellation.bridges.map((bridge) => (
            <div
              key={`bridge-${bridge.packageName}`}
              className={`node-2d-anchor node-2d-bridge ${hoveredBridgePkg === bridge.packageName ? 'hovered' : ''}`}
              style={{
                transform: `translate(${bridge.x}px, ${bridge.y}px) translate(-50%, -50%)`,
              }}
              onMouseEnter={() => setHoveredBridgePkg(bridge.packageName)}
              onMouseLeave={() => setHoveredBridgePkg(null)}
              title={`Shared external dependency: ${bridge.packageName} (used by ${bridge.usageCount} projects)`}
            >
              <Package size={12} />
              <span>{bridge.packageName}</span>
              <small>{bridge.usageCount}x</small>
            </div>
          ))}
        </div>

        <div className="graph-zoom-readout">{Math.round(transform.k * 100)}%</div>
      </div>
    );
  }

  // ==================== SINGLE PROJECT 2D TOPOLOGY ====================
  if (!viewport) return null;

  return (
    <div
      ref={containerRef}
      className="graph-canvas-2d"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleBackgroundClick}
      onWheel={handleWheel}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <svg className="graph-svg-layer" width="100%" height="100%">
        <defs>
          <pattern id="cadGrid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M 56 0 L 0 0 0 56" fill="none" stroke="rgba(148, 163, 184, 0.045)" strokeWidth="1" />
          </pattern>

          <marker id="depArrowOutgoing" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#22D3EE" />
          </marker>
          <marker id="depArrowIncoming" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#F59E0B" />
          </marker>
          <marker id="depArrowNeutral" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 2 L 8 5 L 0 8 z" fill="#38BDF8" fillOpacity="0.85" />
          </marker>
        </defs>

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {/* Architectural Blueprint Coordinate Grid */}
          <rect x={-2400} y={-2000} width={4800} height={4000} fill="url(#cadGrid)" />

          {/* Precision Concentric Telemetry Rings */}
          <circle cx={0} cy={0} r={108} fill="rgba(34, 211, 238, 0.035)" stroke="rgba(34, 211, 238, 0.22)" strokeWidth={1} />
          <circle cx={0} cy={0} r={280} fill="none" stroke="rgba(148, 163, 184, 0.09)" strokeDasharray="4 6" strokeWidth={1} />
          <circle cx={0} cy={0} r={470} fill="none" stroke="rgba(148, 163, 184, 0.06)" strokeDasharray="2 8" strokeWidth={1} />
          <line x1={-520} y1={0} x2={520} y2={0} stroke="rgba(148, 163, 184, 0.06)" strokeWidth={1} />
          <line x1={0} y1={-520} x2={0} y2={520} stroke="rgba(148, 163, 184, 0.06)" strokeWidth={1} />

          {/* Hierarchy Edges */}
          {showHierarchy &&
            hierarchyEdges.map(({ id, sourceId, targetId, isOverflow, pathD, targetKind, targetName }) => {
              const isHighlighted =
                activeHighlightedIds &&
                activeHighlightedIds.has(sourceId) &&
                activeHighlightedIds.has(targetId);
              const isDimmed = activeHighlightedIds && !isHighlighted;
              const dirColor = targetKind === 'directory' ? getDirectoryColor(targetName) : isOverflow ? '#64748B' : '#475569';

              return (
                <path
                  key={id}
                  d={pathD}
                  fill="none"
                  stroke={isHighlighted ? '#22D3EE' : dirColor}
                  strokeWidth={isHighlighted ? 2 : targetKind === 'directory' ? 1.4 : 1}
                  strokeOpacity={isDimmed ? 0.14 : isHighlighted ? 0.95 : 0.5}
                  strokeDasharray={isOverflow ? '3 4' : undefined}
                  strokeLinecap="round"
                />
              );
            })}

          {/* Dependency Edges with Directional Arrowheads */}
          {showDependencies &&
            dependencyEdges.map(({ id, sourceId, targetId, pathD, direction }) => {
              const isHighlighted =
                activeHighlightedIds &&
                activeHighlightedIds.has(sourceId) &&
                activeHighlightedIds.has(targetId);
              const isDimmed = activeHighlightedIds && !isHighlighted;
              const strokeColor =
                direction === 'outgoing'
                  ? '#22D3EE'
                  : direction === 'incoming'
                  ? '#F59E0B'
                  : '#38BDF8';
              const marker =
                direction === 'outgoing'
                  ? 'url(#depArrowOutgoing)'
                  : direction === 'incoming'
                  ? 'url(#depArrowIncoming)'
                  : 'url(#depArrowNeutral)';

              return (
                <path
                  key={id}
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHighlighted ? 2 : 1.35}
                  strokeDasharray={direction === 'neutral' ? '5 4' : undefined}
                  strokeOpacity={isDimmed ? 0.14 : isHighlighted ? 0.95 : 0.72}
                  markerEnd={marker}
                />
              );
            })}
        </g>
      </svg>

      {/* Interactive Node Layer (All nodes strictly centered via translate(-50%, -50%)) */}
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
          const isDimmed = Boolean(activeHighlightedIds && !activeHighlightedIds.has(node.id));

          // 1. Central Focused Node
          if (isFocusedNode) {
            if (viewport.isProjectRootFocused) {
              return (
                <div
                  key={node.id}
                  className={`node-2d-anchor node-2d-root ${isSelected ? 'selected' : ''}`}
                  style={{ transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectNode(node.id);
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                >
                  <div className="root-inner">
                    <div className="root-glyph-box">
                      <Layers size={22} className="root-icon" />
                    </div>
                    <span className="root-title">{project.name}</span>
                    <span className="root-sub">
                      {project.metrics.files} files · {project.metrics.totalLoc.toLocaleString()} loc
                    </span>
                  </div>
                </div>
              );
            } else {
              const color = getDirectoryColor(node.name);
              return (
                <div
                  key={node.id}
                  className={`node-2d-anchor node-2d-focused-dir ${isSelected ? 'selected' : ''}`}
                  style={{
                    transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`,
                    borderColor: isSelected ? '#22D3EE' : color,
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
                  <span className="focused-dir-sub">{node.descendantFiles ?? 0} files</span>
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
                className={`node-2d-anchor node-2d-dir ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isExpanded ? 'branch-expanded' : ''} ${isDimmed ? 'dimmed' : ''}`}
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`,
                  borderColor: isSelected || isExpanded ? '#22D3EE' : `${color}88`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectNode(node.id);
                  if (!isExpanded && descendantCount > 0) {
                    previewFolderBranch(node.id);
                  }
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  drillDownNode(node.id);
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                title={`${node.name}/ (${descendantCount.toLocaleString()} files) · Click to preview · Double-click to open sub-map`}
              >
                <div className="dir-icon-col" style={{ color }}>
                  {isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
                </div>
                <div className="dir-text-col">
                  <span className="dir-name">{node.name}/</span>
                  {!isLowLOD && (
                    <span className="dir-count">
                      {descendantCount.toLocaleString()} {descendantCount === 1 ? 'file' : 'files'}
                    </span>
                  )}
                </div>
                <button
                  className={`dir-expand-btn ${isExpanded ? 'expanded' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpandNode(node.id);
                  }}
                  title={isExpanded ? 'Collapse preview' : 'Preview up to 15 items'}
                  aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            );
          }

          // 3. File Node
          const langAccent = (node.language && LANGUAGE_ACCENT[node.language]) || '#38BDF8';
          return (
            <div
              key={node.id}
              className={`node-2d-anchor node-2d-file ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isDimmed ? 'dimmed' : ''} ${isLowLOD ? 'lod-low' : ''}`}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`,
                borderColor: isSelected ? '#22D3EE' : 'rgba(148, 163, 184, 0.22)',
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
              title={`${node.path} (${node.loc} lines) · Double-click to inspect source`}
            >
              <span className="file-lang-strip" style={{ background: langAccent }} />
              <FileCode2 size={12} className="file-badge-icon" style={{ color: langAccent }} />
              <span className="file-name">{node.name}</span>
              {!isLowLOD && node.loc > 0 && <span className="file-loc-tag">{node.loc}L</span>}
            </div>
          );
        })}

        {/* 4. Interactive Sub-Map & Pagination Overflow Indicators */}
        {overflowNodes.map((overflow: ViewportOverflowNode) => {
          const pos = layout.get(overflow.id);
          if (!pos) return null;

          if (overflow.isBranchOverflow) {
            return (
              <button
                key={overflow.id}
                className="node-2d-anchor node-2d-overflow-btn branch-submap"
                style={{ transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)` }}
                onClick={(e) => {
                  e.stopPropagation();
                  drillDownNode(overflow.parentId);
                }}
                title={`Open dedicated sub-map for ${overflow.parentName ?? 'folder'}/ (${overflow.totalChildrenCount.toLocaleString()} items)`}
              >
                <span>{overflow.label}</span>
              </button>
            );
          }

          return (
            <button
              key={overflow.id}
              className="node-2d-anchor node-2d-overflow-btn focus-page-next"
              style={{ transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)` }}
              onClick={(e) => {
                e.stopPropagation();
                nextMapPage();
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                selectNode(overflow.parentId);
                setPage('structure');
              }}
              title={`Click to show next 24 of ${overflow.totalChildrenCount.toLocaleString()} items · Double-click to open full Structure table`}
            >
              <span>{overflow.label}</span>
              <small>Click for next 24 →</small>
            </button>
          );
        })}
      </div>

      <div className="graph-zoom-readout">{Math.round(transform.k * 100)}%</div>
    </div>
  );
}
