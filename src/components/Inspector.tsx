import { ChevronLeft, ChevronRight, FileCode2, Folder, FolderOpen, Network, Orbit } from 'lucide-react';
import { computeMultiProjectConstellation } from '../services/constellation';
import { useAppStore } from '../store/useAppStore';
import { compactBytes } from '../utils/fileTypes';

export function Inspector() {
  const project = useAppStore((s) => s.project);
  const workspaceProjects = useAppStore((s) => s.workspaceProjects);
  const constellationProjectIds = useAppStore((s) => s.constellationProjectIds);
  const constellationMode = useAppStore((s) => s.constellationMode);
  const setConstellationMode = useAppStore((s) => s.setConstellationMode);
  const switchProject = useAppStore((s) => s.switchProject);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  const isCollapsed = useAppStore((s) => s.isInspectorCollapsed);
  const toggleInspector = useAppStore((s) => s.toggleInspector);
  const setPage = useAppStore((s) => s.setPage);

  if (!project) {
    return <aside className="inspector" />;
  }

  if (isCollapsed) {
    return (
      <aside className="inspector-collapsed-ribbon" aria-label="Inspector collapsed">
        <button
          className="inspector-toggle-btn"
          onClick={toggleInspector}
          title="Expand inspector panel"
          aria-label="Expand inspector panel"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="collapsed-inspector-label">Inspector</span>
      </aside>
    );
  }

  // Multi-Project Constellation Comparison Inspector
  if (constellationMode && workspaceProjects.length >= 2) {
    const idSet = new Set(constellationProjectIds);
    const selectedFleet = workspaceProjects.filter((p) => idSet.has(p.id));
    const constellation = computeMultiProjectConstellation(selectedFleet.length >= 2 ? selectedFleet : workspaceProjects);

    return (
      <aside className="inspector" aria-label="Multi-project constellation inspector">
        <div className="inspector-header-row">
          <div className="inspector-title">
            <span className="icon-box">
              <Orbit size={18} />
            </span>
            <div>
              <h2>Constellation</h2>
              <p>{constellation.totals.projects} repositories compared</p>
            </div>
          </div>
          <button
            className="inspector-collapse-btn"
            onClick={toggleInspector}
            title="Collapse inspector panel"
            aria-label="Collapse inspector panel"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <dl className="details tabular-nums">
          <div>
            <dt>Active focus</dt>
            <dd>{project.name}</dd>
          </div>
          <div>
            <dt>Fleet files</dt>
            <dd>{constellation.totals.files.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Total LOC</dt>
            <dd>{constellation.totals.totalLoc.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Internal edges</dt>
            <dd>{constellation.totals.dependencyEdges.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Circular cycles</dt>
            <dd>{constellation.totals.circularCycles}</dd>
          </div>
          <div>
            <dt>Shared packages</dt>
            <dd>{constellation.totals.sharedPackagesCount}</dd>
          </div>
        </dl>

        <h3>Repository Comparison</h3>
        <div className="compare-list">
          {constellation.projects.map((cp) => {
            const isActive = cp.projectId === project.id;
            return (
              <div
                key={cp.projectId}
                className={`compare-card ${isActive ? 'active' : ''}`}
                onClick={() => {
                  switchProject(cp.projectId, 'graph');
                  setConstellationMode(true);
                }}
              >
                <div className="compare-card-head">
                  <span className="compare-swatch" style={{ background: cp.accentColor }} />
                  <b>{cp.name}</b>
                  <small>{cp.dominantLanguage}</small>
                </div>
                <div className="compare-card-stats tabular-nums">
                  <span>{cp.files} files</span>
                  <span>{cp.totalLoc.toLocaleString()} loc</span>
                  <span>{cp.couplingRatio} edge/file</span>
                </div>
                {isActive && (
                  <button
                    className="action-btn highlight"
                    style={{ width: '100%', marginTop: '8px', justifyContent: 'center' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConstellationMode(false);
                    }}
                  >
                    Enter {cp.name} Map →
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {constellation.sharedPackages.length > 0 && (
          <>
            <h3>Shared External Bridges</h3>
            <div className="bridge-list">
              {constellation.sharedPackages.map((sp) => (
                <div key={sp.name} className="bridge-item">
                  <b>{sp.name}</b>
                  <small>{sp.projectNames.join(' · ')}</small>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    );
  }

  const node = project.nodes.find((item) => item.id === selectedId) ?? project.nodes[0];
  if (!node) {
    return <aside className="inspector" />;
  }

  const children = project.nodes.filter((item) => item.parentId === node.id);
  const Icon = node.kind === 'project' ? Network : node.kind === 'directory' ? FolderOpen : FileCode2;
  const fileCount = node.kind === 'file' ? 1 : node.descendantFiles ?? 0;

  const outgoingCount =
    node.kind === 'file' && project.dependencies
      ? project.dependencies.edges.filter((e) => e.sourcePath === node.path).length
      : 0;
  const incomingCount =
    node.kind === 'file' && project.dependencies
      ? project.dependencies.edges.filter(
          (e) => e.targetResolvedPath === node.path || (!e.isExternal && e.isResolved && e.targetPath === node.path)
        ).length
      : 0;

  return (
    <aside className="inspector" aria-label="Node inspector">
      <div className="inspector-header-row">
        <div className="inspector-title">
          <span className="icon-box">
            <Icon size={18} />
          </span>
          <div>
            <h2>{node.name}</h2>
            <p>{node.kind}</p>
          </div>
        </div>

        <button
          className="inspector-collapse-btn"
          onClick={toggleInspector}
          title="Collapse inspector panel"
          aria-label="Collapse inspector panel"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <dl className="details tabular-nums">
        <div>
          <dt>Path</dt>
          <dd>{node.path || '(root)'}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>{fileCount.toLocaleString()}</dd>
        </div>
        {node.kind !== 'file' && (
          <div>
            <dt>Folders</dt>
            <dd>{(node.descendantFolders ?? 0).toLocaleString()}</dd>
          </div>
        )}
        <div>
          <dt>Direct children</dt>
          <dd>{children.length.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Lines</dt>
          <dd>{node.loc.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Indexed size</dt>
          <dd>{compactBytes(node.sizeBytes)}</dd>
        </div>
        {node.language && (
          <div>
            <dt>Language</dt>
            <dd>{node.language}</dd>
          </div>
        )}
        {node.analysisStatus && (
          <div>
            <dt>Content</dt>
            <dd>{node.analysisStatus.replaceAll('-', ' ')}</dd>
          </div>
        )}
        {node.kind === 'file' && project.dependencies && (
          <>
            <div>
              <dt>Imports</dt>
              <dd>{outgoingCount.toLocaleString()} modules</dd>
            </div>
            <div>
              <dt>Imported by</dt>
              <dd>{incomingCount.toLocaleString()} files</dd>
            </div>
          </>
        )}
      </dl>

      {node.kind === 'file' && (
        <div className="inspector-actions">
          <button
            className="action-btn primary"
            style={{ width: '100%', marginTop: '12px', justifyContent: 'center' }}
            onClick={() => useAppStore.getState().openFileViewer(node.id)}
          >
            <FileCode2 size={14} /> Open File Preview
          </button>
          {(outgoingCount > 0 || incomingCount > 0) && (
            <button
              className="action-btn"
              style={{ width: '100%', marginTop: '6px', justifyContent: 'center' }}
              onClick={() => setPage('dependencies')}
            >
              Inspect Dependencies →
            </button>
          )}
        </div>
      )}

      <h3>Direct child items ({children.length})</h3>
      <div className="child-list">
        {children.slice(0, 8).map((child) => (
          <button
            key={child.id}
            onClick={() => useAppStore.getState().selectNode(child.id)}
            onDoubleClick={() => {
              if (child.kind === 'file') useAppStore.getState().openFileViewer(child.id);
              else useAppStore.getState().drillDownNode(child.id);
            }}
            title={child.kind === 'file' ? 'Click to select · Double-click to open' : 'Click to select · Double-click to explore'}
          >
            {child.kind === 'directory' ? <Folder size={14} /> : <FileCode2 size={14} />}
            <span>{child.name}</span>
            <small className="tabular-nums">{child.loc ? `${child.loc.toLocaleString()}L` : ''}</small>
          </button>
        ))}
        {!children.length && <p className="muted">No child items.</p>}
        {children.length > 8 && (
          <button
            className="view-all-children-btn"
            onClick={() => {
              useAppStore.getState().selectNode(node.id);
              useAppStore.getState().expandNode(node.id);
              setPage('structure');
            }}
          >
            View all {children.length.toLocaleString()} children →
          </button>
        )}
      </div>
    </aside>
  );
}
